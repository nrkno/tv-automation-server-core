import * as _ from 'underscore'
import * as MOS from 'mos-connection'
import { Meteor } from 'meteor/meteor'
import { PeripheralDevice } from '../../../../lib/collections/PeripheralDevices'
import { getStudioFromDevice, canRundownBeUpdated, getPartId, getRundownId } from '../lib'
import {
	getRundownIdFromMosRO,
	getPartIdFromMosStory,
	getSegmentExternalId,
	fixIllegalObject,
	parseMosString,
} from './lib'
import { literal, protectString, getCurrentTime, normalizeArray } from '../../../../lib/lib'
import { IngestPart } from '@sofie-automation/blueprints-integration'
import { handleUpdatedRundownInner } from '../rundownInput'
import { LocalIngestRundown, LocalIngestSegment, LocalIngestPart } from '../ingestCache'
import { RundownId } from '../../../../lib/collections/Rundowns'
import { logger } from '../../../../lib/logging'
import { PartId } from '../../../../lib/collections/Parts'
import { profiler } from '../../profiler'
import { CommitIngestData, runIngestOperationWithCache } from '../lockFunction'
import { updateSegmentFromIngestData } from '../generation'
import { diffAndApplyChanges, diffAndUpdateSegmentIds } from './diff'

interface AnnotatedIngestPart {
	externalId: string
	partId: PartId
	segmentName: string
	ingest: LocalIngestPart
}
function storiesToIngestParts(
	rundownId: RundownId,
	stories: MOS.IMOSStory[],
	undefinedPayload: boolean,
	existingIngestParts: AnnotatedIngestPart[]
): (AnnotatedIngestPart | null)[] {
	const span = profiler.startSpan('ingest.storiesToIngestParts')

	const existingIngestPartsMap = normalizeArray(existingIngestParts, 'externalId')

	const parts = stories.map((s, i) => {
		if (!s) return null

		const externalId = parseMosString(s.ID)
		const existingIngestPart = existingIngestPartsMap[externalId]

		const name = s.Slug ? parseMosString(s.Slug) : ''
		return {
			externalId: externalId,
			partId: getPartIdFromMosStory(rundownId, s.ID),
			segmentName: name.split(';')[0],
			ingest: literal<LocalIngestPart>({
				externalId: parseMosString(s.ID),
				name: name,
				rank: i,
				payload: undefinedPayload ? undefined : {},
				modified: existingIngestPart ? existingIngestPart.ingest.modified : getCurrentTime(),
			}),
		}
	})

	span?.end()
	return parts
}
/** Group IngestParts together into something that could be Segments */
function groupIngestParts(parts: AnnotatedIngestPart[]): { name: string; parts: LocalIngestPart[] }[] {
	const groupedParts: { name: string; parts: LocalIngestPart[] }[] = []
	_.each(parts, (part) => {
		const lastSegment = _.last(groupedParts)
		if (lastSegment && lastSegment.name === part.segmentName) {
			lastSegment.parts.push(part.ingest)
		} else {
			groupedParts.push({ name: part.segmentName, parts: [part.ingest] })
		}
	})

	// Ensure ranks are correct
	_.each(groupedParts, (group) => {
		for (let i = 0; i < group.parts.length; i++) {
			group.parts[i].rank = i
		}
	})

	return groupedParts
}
function groupedPartsToSegments(
	rundownId: RundownId,
	groupedParts: { name: string; parts: LocalIngestPart[] }[]
): LocalIngestSegment[] {
	return _.map(groupedParts, (grp, i) => {
		return literal<LocalIngestSegment>({
			externalId: getSegmentExternalId(rundownId, grp.parts[0]),
			name: grp.name,
			rank: i,
			parts: grp.parts,
			modified: Math.max(...grp.parts.map((p) => p.modified)), // pick the latest
		})
	})
}

export async function handleMosRundownData(
	peripheralDevice: PeripheralDevice,
	mosRunningOrder: MOS.IMOSRunningOrder,
	isCreateAction: boolean
): Promise<void> {
	const studio = getStudioFromDevice(peripheralDevice)
	const rundownId = getRundownIdFromMosRO(studio, mosRunningOrder.ID)
	const rundownExternalId = parseMosString(mosRunningOrder.ID)

	// Create or update a rundown (ie from rundownCreate or rundownList)

	return runIngestOperationWithCache(
		'handleMosRundownData',
		studio._id,
		rundownExternalId,
		(ingestRundown) => {
			const parts = _.compact(storiesToIngestParts(rundownId, mosRunningOrder.Stories || [], !isCreateAction, []))
			const groupedStories = groupIngestParts(parts)

			// If this is a reload of a RO, then use cached data to make the change more seamless
			if (!isCreateAction && ingestRundown) {
				const partCacheMap = new Map<PartId, IngestPart>()
				for (const segment of ingestRundown.segments) {
					for (const part of segment.parts) {
						partCacheMap.set(getPartId(rundownId, part.externalId), part)
					}
				}

				for (const annotatedPart of parts) {
					const cached = partCacheMap.get(annotatedPart.partId)
					if (cached && !annotatedPart.ingest.payload) {
						annotatedPart.ingest.payload = cached.payload
					}
				}
			}

			const ingestSegments = groupedPartsToSegments(rundownId, groupedStories)

			return literal<LocalIngestRundown>({
				externalId: parseMosString(mosRunningOrder.ID),
				name: parseMosString(mosRunningOrder.Slug),
				type: 'mos',
				segments: ingestSegments,
				payload: mosRunningOrder,
				modified: getCurrentTime(),
			})
		},
		async (cache, newIngestRundown, oldIngestRundown) => {
			if (!newIngestRundown) throw new Meteor.Error(`handleMosRundownData lost the IngestRundown...`)

			if (!canRundownBeUpdated(cache.Rundown.doc, isCreateAction)) return null

			let renamedSegments: CommitIngestData['renamedSegments'] = new Map()
			if (cache.Rundown.doc && oldIngestRundown) {
				// If we already have a rundown, update any modified segment ids
				renamedSegments = diffAndUpdateSegmentIds(cache, oldIngestRundown, newIngestRundown)
			}

			const res = await handleUpdatedRundownInner(cache, newIngestRundown, isCreateAction, peripheralDevice)
			if (res) {
				return {
					...res,
					renamedSegments: renamedSegments,
				}
			} else {
				return null
			}
		}
	)
}
export async function handleMosRundownMetadata(
	peripheralDevice: PeripheralDevice,
	mosRunningOrderBase: MOS.IMOSRunningOrderBase
): Promise<void> {
	const studio = getStudioFromDevice(peripheralDevice)

	const rundownExternalId = parseMosString(mosRunningOrderBase.ID)

	return runIngestOperationWithCache(
		'handleMosRundownMetadata',
		studio._id,
		rundownExternalId,
		(ingestRundown) => {
			if (ingestRundown) {
				ingestRundown.payload = _.extend(ingestRundown.payload, mosRunningOrderBase)
				ingestRundown.modified = getCurrentTime()

				// We modify in-place
				return ingestRundown
			} else {
				throw new Meteor.Error(404, `Rundown "${rundownExternalId}" not found`)
			}
		},
		async (cache, ingestRundown) => {
			if (!ingestRundown) throw new Meteor.Error(`handleMosRundownMetadata lost the IngestRundown...`)

			return handleUpdatedRundownInner(cache, ingestRundown, false, peripheralDevice)
		}
	)
}

export async function handleMosFullStory(
	peripheralDevice: PeripheralDevice,
	story: MOS.IMOSROFullStory
): Promise<void> {
	fixIllegalObject(story)
	// @ts-ignore
	// logger.debug(story)

	const studio = getStudioFromDevice(peripheralDevice)

	const partExternalId = parseMosString(story.ID)
	const rundownExternalId = parseMosString(story.RunningOrderId)

	return runIngestOperationWithCache(
		'handleMosFullStory',
		studio._id,
		rundownExternalId,
		(ingestRundown) => {
			if (ingestRundown) {
				const ingestPart = ingestRundown.segments
					.map((s) => s.parts)
					.flat()
					.find((p) => p.externalId === partExternalId)
				if (!ingestPart) {
					throw new Meteor.Error(
						500,
						`handleMosFullStory: Missing MOS Story "${partExternalId}" in Rundown ingest data for "${rundownExternalId}"`
					)
				}

				// TODO - can the name change during a fullStory? If so then we need to be sure to update the segment groupings too
				// ingestPart.name = story.Slug ? parseMosString(story.Slug) : ''
				ingestPart.payload = story

				// We modify in-place
				return ingestRundown
			} else {
				throw new Meteor.Error(500, `handleMosFullStory: Missing MOS Rundown "${rundownExternalId}"`)
			}
		},
		async (cache, ingestRundown) => {
			const ingestSegment = ingestRundown?.segments?.find((s) =>
				s.parts.find((p) => p.externalId === partExternalId)
			)
			if (!ingestSegment) throw new Meteor.Error(500, `IngestSegment for story "${partExternalId}" is missing!`)
			return updateSegmentFromIngestData(cache, ingestSegment, false)
		}
	)
}
export async function handleMosDeleteStory(
	peripheralDevice: PeripheralDevice,
	runningOrderMosId: MOS.MosString128,
	stories: Array<MOS.MosString128>
): Promise<void> {
	if (stories.length === 0) return

	const studio = getStudioFromDevice(peripheralDevice)

	const rundownExternalId = parseMosString(runningOrderMosId)
	const rundownId = getRundownId(studio, rundownExternalId)
	return runIngestOperationWithCache(
		'handleMosDeleteStory',
		studio._id,
		rundownExternalId,
		(ingestRundown) => {
			if (ingestRundown) {
				const ingestParts = getAnnotatedIngestParts(ingestRundown)
				const ingestPartIds = new Set(ingestParts.map((part) => part.externalId))

				const storyIds = stories.map(parseMosString)

				logger.debug(`handleMosDeleteStory storyIds: [${storyIds.join(',')}]`)

				const missingIds = storyIds.filter((id) => !ingestPartIds.has(id))
				if (missingIds.length > 0) {
					throw new Meteor.Error(
						404,
						`Parts ${missingIds.join(', ')} in rundown ${rundownExternalId} were not found`
					)
				}

				ingestRundown.segments = makeChangeToIngestParts(rundownId, ingestParts, (rundownParts) => {
					const storyIdsSet = new Set(storyIds)
					const filteredParts = rundownParts.filter((p) => !storyIdsSet.has(p.externalId))

					logger.debug(
						`handleMosDeleteStory, new part count ${filteredParts.length} (was ${rundownParts.length})`
					)

					return filteredParts
				})

				// We modify in-place
				return ingestRundown
			} else {
				throw new Meteor.Error(404, `Rundown "${rundownExternalId}" not found`)
			}
		},
		diffAndApplyChanges
	)
}

function getAnnotatedIngestParts(ingestRundown: LocalIngestRundown): AnnotatedIngestPart[] {
	const span = profiler.startSpan('mosDevice.ingest.getAnnotatedIngestParts')
	const ingestParts: AnnotatedIngestPart[] = []
	_.each(ingestRundown.segments, (s) => {
		_.each(s.parts, (p) => {
			ingestParts.push({
				externalId: p.externalId,
				partId: protectString(''), // Not used
				segmentName: s.name,
				ingest: p,
			})
		})
	})

	span?.end()
	return ingestParts
}
export async function handleMosInsertParts(
	peripheralDevice: PeripheralDevice,
	runningOrderMosId: MOS.MosString128,
	insertBeforeStoryId: MOS.MosString128 | null,
	removePrevious: boolean,
	newStories: MOS.IMOSROStory[]
): Promise<void> {
	// inserts stories and all of their defined items before the referenced story in a Running Order
	// ...and roStoryReplace message replaces the referenced story with another story or stories

	const studio = getStudioFromDevice(peripheralDevice)

	const rundownExternalId = parseMosString(runningOrderMosId)
	const rundownId = getRundownId(studio, rundownExternalId)
	return runIngestOperationWithCache(
		'handleMosInsertParts',
		studio._id,
		rundownExternalId,
		(ingestRundown) => {
			if (ingestRundown) {
				const ingestParts = getAnnotatedIngestParts(ingestRundown)

				// The part of which we are about to insert stories after
				const insertBeforePartExternalId = insertBeforeStoryId ? parseMosString(insertBeforeStoryId) || '' : ''
				const insertIndex = !insertBeforePartExternalId // insert last
					? ingestParts.length
					: ingestParts.findIndex((p) => p.externalId === insertBeforePartExternalId)
				if (insertIndex === -1) {
					throw new Meteor.Error(
						404,
						`Part ${insertBeforePartExternalId} in rundown ${rundownExternalId} not found`
					)
				}

				const newParts = storiesToIngestParts(rundownId, newStories || [], true, ingestParts).filter(
					(p): p is AnnotatedIngestPart => !!p // remove falsy values from array
				)

				ingestRundown.segments = makeChangeToIngestParts(rundownId, ingestParts, (ingestPartsToModify) => {
					const modifiedIngestParts = [...ingestPartsToModify] // clone

					if (removePrevious) {
						modifiedIngestParts.splice(insertIndex, 1) // Replace the previous part with new parts
					}

					const newPartExtenalIds = new Set(newParts.map((part) => part.externalId))
					const collidingPartIds = modifiedIngestParts
						.filter((part) => newPartExtenalIds.has(part.externalId))
						.map((part) => part.externalId)

					if (collidingPartIds.length > 0) {
						throw new Meteor.Error(
							500,
							`Parts ${collidingPartIds.join(', ')} already exist in rundown ${rundownExternalId}`
						)
					}
					// Update parts list
					modifiedIngestParts.splice(insertIndex, 0, ...newParts)

					return modifiedIngestParts
				})

				// We modify in-place
				return ingestRundown
			} else {
				throw new Meteor.Error(404, `Rundown "${rundownExternalId}" not found`)
			}
		},
		diffAndApplyChanges
	)
}

export async function handleMosSwapStories(
	peripheralDevice: PeripheralDevice,
	runningOrderMosId: MOS.MosString128,
	story0: MOS.MosString128,
	story1: MOS.MosString128
): Promise<void> {
	const studio = getStudioFromDevice(peripheralDevice)

	const story0Str = parseMosString(story0)
	const story1Str = parseMosString(story1)
	if (story0Str === story1Str) {
		throw new Meteor.Error(
			400,
			`Cannot swap part ${story0Str} with itself in rundown ${parseMosString(runningOrderMosId)}`
		)
	}

	const rundownExternalId = parseMosString(runningOrderMosId)
	const rundownId = getRundownId(studio, rundownExternalId)
	return runIngestOperationWithCache(
		'handleMosSwapStories',
		studio._id,
		rundownExternalId,
		(ingestRundown) => {
			if (ingestRundown) {
				const ingestParts = getAnnotatedIngestParts(ingestRundown)

				ingestRundown.segments = makeChangeToIngestParts(rundownId, ingestParts, (rundownParts) => {
					const story0Index = rundownParts.findIndex((p) => p.externalId === story0Str)
					if (story0Index === -1) {
						throw new Meteor.Error(
							404,
							`Story ${story0} not found in rundown ${parseMosString(runningOrderMosId)}`
						)
					}
					const story1Index = rundownParts.findIndex((p) => p.externalId === story1Str)
					if (story1Index === -1) {
						throw new Meteor.Error(
							404,
							`Story ${story1} not found in rundown ${parseMosString(runningOrderMosId)}`
						)
					}
					const tmp = rundownParts[story0Index]
					rundownParts[story0Index] = rundownParts[story1Index]
					rundownParts[story1Index] = tmp

					return rundownParts
				})

				// We modify in-place
				return ingestRundown
			} else {
				throw new Meteor.Error(404, `Rundown "${rundownExternalId}" not found`)
			}
		},
		diffAndApplyChanges
	)
}
export async function handleMosMoveStories(
	peripheralDevice: PeripheralDevice,
	runningOrderMosId: MOS.MosString128,
	insertBeforeStoryId: MOS.MosString128 | null,
	stories: MOS.MosString128[]
): Promise<void> {
	const studio = getStudioFromDevice(peripheralDevice)

	const rundownExternalId = parseMosString(runningOrderMosId)
	const rundownId = getRundownId(studio, rundownExternalId)
	return runIngestOperationWithCache(
		'handleMosMoveStories',
		studio._id,
		rundownExternalId,
		(ingestRundown) => {
			if (ingestRundown) {
				const ingestParts = getAnnotatedIngestParts(ingestRundown)

				// Get story data
				const storyIds = stories.map(parseMosString)

				ingestRundown.segments = makeChangeToIngestParts(rundownId, ingestParts, (rundownParts) => {
					// Extract the parts-to-be-moved:
					const movingParts = _.sortBy(
						rundownParts.filter((p) => storyIds.indexOf(p.externalId) !== -1),
						(p) => storyIds.indexOf(p.externalId)
					)
					const filteredParts = rundownParts.filter((p) => storyIds.indexOf(p.externalId) === -1)

					// Ensure all stories to move were found
					const movingIds = _.map(movingParts, (p) => p.externalId)
					const missingIds = _.filter(storyIds, (id) => movingIds.indexOf(id) === -1)
					if (missingIds.length > 0) {
						throw new Meteor.Error(
							404,
							`Parts ${missingIds.join(', ')} were not found in rundown ${rundownExternalId}`
						)
					}

					// Find insert point
					const insertBeforePartExternalId = insertBeforeStoryId
						? parseMosString(insertBeforeStoryId) || ''
						: ''
					const insertIndex = !insertBeforePartExternalId // insert last
						? filteredParts.length
						: filteredParts.findIndex((p) => p.externalId === insertBeforePartExternalId)
					if (insertIndex === -1) {
						throw new Meteor.Error(
							404,
							`Part ${insertBeforeStoryId} was not found in rundown ${rundownExternalId}`
						)
					}

					// Reinsert parts
					filteredParts.splice(insertIndex, 0, ...movingParts)

					return filteredParts
				})

				// We modify in-place
				return ingestRundown
			} else {
				throw new Meteor.Error(404, `Rundown "${rundownExternalId}" not found`)
			}
		},
		diffAndApplyChanges
	)
}
/** Takes a list of ingestParts, modify it, then output them grouped together into ingestSegments, keeping track of the modified property */
function makeChangeToIngestParts(
	rundownId: RundownId,
	ingestParts: AnnotatedIngestPart[],
	modifyFunction: (ingestParts: AnnotatedIngestPart[]) => AnnotatedIngestPart[]
): LocalIngestSegment[] {
	const span = profiler.startSpan('mosDevice.ingest.makeChangeToIngestParts')

	// Before making the modification to ingestParts, create a list of segments from the original data, to use for calculating the
	// .modified property below.
	const referenceIngestSegments = groupPartsIntoIngestSegments(rundownId, ingestParts)

	const modifiedParts = modifyFunction(ingestParts)

	// Compare to reference, to make sure that ingestSegment.modified is updated in case of a change
	const newIngestSegments = groupPartsIntoIngestSegments(rundownId, modifiedParts)

	_.each(newIngestSegments, (ingestSegment) => {
		if (!ingestSegment.modified) {
			ingestSegment.modified = getCurrentTime()
		} else {
			const ref = referenceIngestSegments.find((s) => s.externalId === ingestSegment.externalId)
			if (ref) {
				if (ref.parts.length !== ingestSegment.parts.length) {
					// A part has been added, or removed
					ingestSegment.modified = getCurrentTime()
				} else {
					// No obvious change.
					// (If an individual part has been updated, the segment.modified property has already been updated anyway)
				}
			} else {
				// The reference doesn't exist (can happen for example if a segment has been merged, or split into two)
				ingestSegment.modified = getCurrentTime()
			}
		}
	})

	span?.end()
	return newIngestSegments
}
function groupPartsIntoIngestSegments(
	rundownId: RundownId,
	newIngestParts: AnnotatedIngestPart[]
): LocalIngestSegment[] {
	// Group the parts and make them into Segments:
	const newGroupedParts = groupIngestParts(newIngestParts)
	return groupedPartsToSegments(rundownId, newGroupedParts)
}
