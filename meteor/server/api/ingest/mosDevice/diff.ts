import { IngestSegment } from '@sofie-automation/blueprints-integration'
import { Meteor } from 'meteor/meteor'
import { ReadonlyDeep } from 'type-fest'
import _ from 'underscore'
import { SegmentId, Segment } from '../../../../lib/collections/Segments'
import { clone, deleteAllUndefinedProperties, literal, normalizeArray } from '../../../../lib/lib'
import { Settings } from '../../../../lib/Settings'
import { profiler } from '../../profiler'
import { CacheForIngest } from '../cache'
import { removeSegmentContents } from '../cleanup'
import { calculateSegmentsFromIngestData, saveSegmentChangesToCache } from '../generation'
import { LocalIngestRundown, LocalIngestSegment } from '../ingestCache'
import { canRundownBeUpdated, getRundown, getSegmentId } from '../lib'
import { CommitIngestData } from '../lockFunction'

export function diffAndUpdateSegmentIds(
	cache: CacheForIngest,
	oldIngestRundown: ReadonlyDeep<LocalIngestRundown>,
	newIngestRundown: ReadonlyDeep<LocalIngestRundown>
): CommitIngestData['renamedSegments'] {
	const span = profiler.startSpan('mosDevice.ingest.diffAndApplyChanges')

	const oldSegments = cache.Segments.findFetch()
	const oldSegmentEntries = compileSegmentEntries(oldIngestRundown.segments)
	const newSegmentEntries = compileSegmentEntries(newIngestRundown.segments)
	const segmentDiff = diffSegmentEntries(oldSegmentEntries, newSegmentEntries, oldSegments)

	// Updated segments that has had their segment.externalId changed:
	const renamedSegments = applyExternalIdDiff(cache, segmentDiff)

	span?.end()
	return renamedSegments
}

export async function diffAndApplyChanges(
	cache: CacheForIngest,
	newIngestRundown: ReadonlyDeep<LocalIngestRundown> | undefined,
	oldIngestRundown: ReadonlyDeep<LocalIngestRundown> | undefined
	// newIngestParts: AnnotatedIngestPart[]
): Promise<CommitIngestData | null> {
	if (!newIngestRundown) throw new Meteor.Error(`diffAndApplyChanges lost the new IngestRundown...`)
	if (!oldIngestRundown) throw new Meteor.Error(`diffAndApplyChanges lost the old IngestRundown...`)

	const rundown = getRundown(cache)
	if (!canRundownBeUpdated(rundown, false)) return null

	const span = profiler.startSpan('mosDevice.ingest.diffAndApplyChanges')

	// Fetch all existing segments:
	const oldSegments = cache.Segments.findFetch()

	const oldSegmentEntries = compileSegmentEntries(oldIngestRundown.segments)
	const newSegmentEntries = compileSegmentEntries(newIngestRundown.segments)
	const segmentDiff = diffSegmentEntries(oldSegmentEntries, newSegmentEntries, oldSegments)

	// Note: We may not need to do some of these quick updates anymore, but they are cheap so can stay for now

	// Update segment ranks:
	_.each(segmentDiff.onlyRankChanged, (newRank, segmentExternalId) => {
		cache.Segments.update(getSegmentId(rundown._id, segmentExternalId), {
			$set: {
				_rank: newRank,
			},
		})
	})

	// Updated segments that has had their segment.externalId changed:
	const renamedSegments = applyExternalIdDiff(cache, segmentDiff)

	// Create/Update segments
	const segmentChanges = await calculateSegmentsFromIngestData(
		cache,
		_.sortBy([...Object.values(segmentDiff.added), ...Object.values(segmentDiff.changed)], (se) => se.rank),
		null
	)

	// Remove/orphan old segments
	const segmentIdsToRemove = new Set(Object.keys(segmentDiff.removed).map((id) => getSegmentId(rundown._id, id)))
	// We orphan it and queue for deletion. the commit phase will complete if possible
	cache.Segments.update((s) => segmentIdsToRemove.has(s._id), {
		$set: {
			orphaned: 'deleted',
		},
	})

	if (!Settings.preserveUnsyncedPlayingSegmentContents) {
		// Remove everything inside the segment
		removeSegmentContents(cache, segmentIdsToRemove)
	}

	saveSegmentChangesToCache(cache, segmentChanges, false)

	span?.end()
	return literal<CommitIngestData>({
		changedSegmentIds: segmentChanges.segments.map((s) => s._id),
		removedSegmentIds: Array.from(segmentIdsToRemove),
		renamedSegments: renamedSegments,

		removeRundown: false,

		showStyle: segmentChanges.showStyle,
		blueprint: segmentChanges.blueprint,
	})
}

function applyExternalIdDiff(
	cache: CacheForIngest,
	segmentDiff: DiffSegmentEntries
): CommitIngestData['renamedSegments'] {
	// Updated segments that has had their segment.externalId changed:
	const renamedSegments = new Map<SegmentId, SegmentId>()
	_.each(segmentDiff.externalIdChanged, (newSegmentExternalId, oldSegmentExternalId) => {
		const oldSegmentId = getSegmentId(cache.RundownId, oldSegmentExternalId)
		const newSegmentId = getSegmentId(cache.RundownId, newSegmentExternalId)

		// Some data will be orphaned temporarily, but will be picked up/cleaned up before the cache gets saved

		const oldSegment = cache.Segments.findOne(oldSegmentId)
		renamedSegments.set(oldSegmentId, newSegmentId)
		if (oldSegment) {
			cache.Segments.remove(oldSegmentId)
			cache.Segments.replace({
				...oldSegment,
				_id: newSegmentId,
			})
		}
	})

	// Move over those parts to the new segmentId.
	for (const part of cache.Parts.findFetch()) {
		const newSegmentId = renamedSegments.get(part.segmentId)
		if (newSegmentId) {
			part.segmentId = newSegmentId
			cache.Parts.replace(part)
		}
	}
	for (const piece of cache.Pieces.findFetch()) {
		const newSegmentId = renamedSegments.get(piece.startSegmentId)
		if (newSegmentId) {
			piece.startSegmentId = newSegmentId
			cache.Pieces.replace(piece)
		}
	}

	return renamedSegments
}

export type SegmentEntries = { [segmentExternalId: string]: LocalIngestSegment }
export function compileSegmentEntries(ingestSegments: ReadonlyDeep<Array<LocalIngestSegment>>): SegmentEntries {
	const segmentEntries: SegmentEntries = {}

	for (const ingestSegment of ingestSegments) {
		if (segmentEntries[ingestSegment.externalId]) {
			throw new Meteor.Error(
				500,
				`compileSegmentEntries: Non-unique segment external ID: "${ingestSegment.externalId}"`
			)
		}
		segmentEntries[ingestSegment.externalId] = clone<LocalIngestSegment>(ingestSegment)
	}

	return segmentEntries
}
export interface DiffSegmentEntries {
	added: { [segmentExternalId: string]: LocalIngestSegment }
	changed: { [segmentExternalId: string]: LocalIngestSegment }
	removed: { [segmentExternalId: string]: LocalIngestSegment }
	unchanged: { [segmentExternalId: string]: LocalIngestSegment }

	// Note: The objects present below are also present in the collections above

	/** Reference to segments which only had their ranks updated */
	onlyRankChanged: { [segmentExternalId: string]: number } // contains the new rank

	/** Reference to segments which has been REMOVED, but it looks like there is an ADDED segment that is closely related to the removed one */
	externalIdChanged: { [removedSegmentExternalId: string]: string } // contains the added segment's externalId
}
export function diffSegmentEntries(
	oldSegmentEntries: SegmentEntries,
	newSegmentEntries: SegmentEntries,
	oldSegments: Segment[] | null
): DiffSegmentEntries {
	const diff: DiffSegmentEntries = {
		added: {},
		changed: {},
		removed: {},
		unchanged: {},

		onlyRankChanged: {},
		externalIdChanged: {},
	}
	const oldSegmentMap: { [externalId: string]: Segment } | null =
		oldSegments === null ? null : normalizeArray(oldSegments, 'externalId')

	_.each(newSegmentEntries, (newSegmentEntry, segmentExternalId) => {
		const oldSegmentEntry = oldSegmentEntries[segmentExternalId] as IngestSegment | undefined
		let oldSegment: Segment | undefined
		if (oldSegmentMap) {
			oldSegment = oldSegmentMap[newSegmentEntry.externalId]
			if (!oldSegment) {
				// Segment has been added
				diff.added[segmentExternalId] = newSegmentEntry
				return
			}
		}
		if (oldSegmentEntry) {
			const modifiedIsEqual = oldSegment ? newSegmentEntry.modified === oldSegment.externalModified : true

			// ensure there are no 'undefined' properties
			deleteAllUndefinedProperties(oldSegmentEntry)
			deleteAllUndefinedProperties(newSegmentEntry)

			// deep compare:
			const ingestContentIsEqual = _.isEqual(_.omit(newSegmentEntry, 'rank'), _.omit(oldSegmentEntry, 'rank'))
			const rankIsEqual = oldSegment
				? newSegmentEntry.rank === oldSegment._rank
				: newSegmentEntry.rank === oldSegmentEntry.rank

			// Compare the modified timestamps:
			if (modifiedIsEqual && ingestContentIsEqual && rankIsEqual) {
				diff.unchanged[segmentExternalId] = newSegmentEntry
			} else {
				// Something has changed
				diff.changed[segmentExternalId] = newSegmentEntry

				// Check if it's only the rank that has changed:
				if (ingestContentIsEqual && !rankIsEqual) {
					diff.onlyRankChanged[segmentExternalId] = newSegmentEntry.rank
				}
			}
		} else {
			// Segment has been added
			diff.added[segmentExternalId] = newSegmentEntry
		}
	})

	_.each(oldSegmentEntries, (oldSegmentEntry, segmentExternalId) => {
		const newSegmentEntry = newSegmentEntries[segmentExternalId] as IngestSegment | undefined
		if (!newSegmentEntry) {
			diff.removed[segmentExternalId] = oldSegmentEntry
		}
	})

	// Handle when the externalId has change
	_.each(diff.removed, (segmentEntry, segmentExternalId) => {
		// try finding "it" in the added, using name
		let newSegmentEntry = _.find(diff.added, (se) => se.name === segmentEntry.name)
		if (!newSegmentEntry) {
			// second try, match with any parts:
			newSegmentEntry = _.find(diff.added, (se) => {
				let found = false
				_.each(segmentEntry.parts, (part) => {
					if (found || _.find(se.parts, (p) => p.externalId === part.externalId)) {
						found = true
					}
				})
				return found
			})
		}
		if (newSegmentEntry) {
			diff.externalIdChanged[segmentExternalId] = newSegmentEntry.externalId
		}
	})

	return diff
}
