import { Meteor } from 'meteor/meteor'
import { check } from '../../../lib/check'
import { PeripheralDevice, PeripheralDeviceId, PeripheralDevices } from '../../../lib/collections/PeripheralDevices'
import { DBRundown, Rundowns } from '../../../lib/collections/Rundowns'
import { getCurrentTime, literal, waitForPromise } from '../../../lib/lib'
import { IngestRundown, IngestSegment, IngestPart, IngestPlaylist } from '@sofie-automation/blueprints-integration'
import { logger } from '../../../lib/logging'
import { Studio, StudioId } from '../../../lib/collections/Studios'
import { SegmentId, Segments } from '../../../lib/collections/Segments'
import {
	RundownIngestDataCache,
	LocalIngestRundown,
	makeNewIngestSegment,
	makeNewIngestPart,
	makeNewIngestRundown,
} from './ingestCache'
import {
	getSegmentId,
	getStudioFromDevice,
	canRundownBeUpdated,
	canSegmentBeUpdated,
	checkAccessAndGetPeripheralDevice,
	getRundown,
} from './lib'
import { MethodContext } from '../../../lib/api/methods'
import { CommitIngestData, runIngestOperationWithCache, UpdateIngestRundownAction } from './lockFunction'
import { CacheForIngest } from './cache'
import { updateRundownFromIngestData, updateSegmentFromIngestData } from './generation'
import { removeRundownsFromDb } from '../rundownPlaylist'
import { RundownPlaylists } from '../../../lib/collections/RundownPlaylists'

export namespace RundownInput {
	export function dataPlaylistGet(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		playlistExternalId: string
	) {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)
		logger.info('dataPlaylistGet', playlistExternalId)
		check(playlistExternalId, String)
		return getIngestPlaylist(peripheralDevice, playlistExternalId)
	}
	// Get info on the current rundowns from this device:
	export function dataRundownList(context: MethodContext, deviceId: PeripheralDeviceId, deviceToken: string) {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)
		logger.info('dataRundownList')
		return listIngestRundowns(peripheralDevice)
	}
	export function dataRundownGet(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string
	) {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)
		logger.info('dataRundownGet', rundownExternalId)
		check(rundownExternalId, String)
		return getIngestRundown(peripheralDevice, rundownExternalId)
	}
	// Delete, Create & Update Rundown (and it's contents):
	export function dataRundownDelete(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string
	) {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)
		logger.info('dataRundownDelete', rundownExternalId)
		check(rundownExternalId, String)
		handleRemovedRundown(peripheralDevice, rundownExternalId)
	}
	export function dataRundownCreate(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		ingestRundown: IngestRundown
	) {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)
		logger.info('dataRundownCreate', ingestRundown)
		check(ingestRundown, Object)
		handleUpdatedRundown(undefined, peripheralDevice, ingestRundown, true)
	}
	export function dataRundownUpdate(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		ingestRundown: IngestRundown
	) {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)
		logger.info('dataRundownUpdate', ingestRundown)
		check(ingestRundown, Object)
		handleUpdatedRundown(undefined, peripheralDevice, ingestRundown, false)
	}
	export function dataSegmentGet(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		segmentExternalId: string
	) {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)
		logger.info('dataSegmentGet', rundownExternalId, segmentExternalId)
		check(rundownExternalId, String)
		check(segmentExternalId, String)
		return getIngestSegment(peripheralDevice, rundownExternalId, segmentExternalId)
	}
	// Delete, Create & Update Segment (and it's contents):
	export function dataSegmentDelete(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		segmentExternalId: string
	) {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)
		logger.info('dataSegmentDelete', rundownExternalId, segmentExternalId)
		check(rundownExternalId, String)
		check(segmentExternalId, String)
		handleRemovedSegment(peripheralDevice, rundownExternalId, segmentExternalId)
	}
	export function dataSegmentCreate(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		ingestSegment: IngestSegment
	) {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)
		logger.info('dataSegmentCreate', rundownExternalId, ingestSegment)
		check(rundownExternalId, String)
		check(ingestSegment, Object)
		handleUpdatedSegment(peripheralDevice, rundownExternalId, ingestSegment, true)
	}
	export function dataSegmentUpdate(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		ingestSegment: IngestSegment
	) {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)
		logger.info('dataSegmentUpdate', rundownExternalId, ingestSegment)
		check(rundownExternalId, String)
		check(ingestSegment, Object)
		handleUpdatedSegment(peripheralDevice, rundownExternalId, ingestSegment, false)
	}
	export function dataSegmentRanksUpdate(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		newRanks: { [segmentExternalId: string]: number }
	) {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)
		logger.info('dataSegmentRanksUpdate', rundownExternalId, Object.keys(newRanks))
		check(rundownExternalId, String)
		check(newRanks, Object)
		handleUpdatedSegmentRanks(peripheralDevice, rundownExternalId, newRanks)
	}
	// Delete, Create & Update Part:
	export function dataPartDelete(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		segmentExternalId: string,
		partExternalId: string
	) {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)
		logger.info('dataPartDelete', rundownExternalId, segmentExternalId, partExternalId)
		check(rundownExternalId, String)
		check(segmentExternalId, String)
		check(partExternalId, String)
		handleRemovedPart(peripheralDevice, rundownExternalId, segmentExternalId, partExternalId)
	}
	export function dataPartCreate(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		segmentExternalId: string,
		ingestPart: IngestPart
	) {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)
		logger.info('dataPartCreate', rundownExternalId, segmentExternalId, ingestPart)
		check(rundownExternalId, String)
		check(segmentExternalId, String)
		check(ingestPart, Object)
		handleUpdatedPart(peripheralDevice, rundownExternalId, segmentExternalId, ingestPart)
	}
	export function dataPartUpdate(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		segmentExternalId: string,
		ingestPart: IngestPart
	) {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)
		logger.info('dataPartUpdate', rundownExternalId, segmentExternalId, ingestPart)
		check(rundownExternalId, String)
		check(segmentExternalId, String)
		check(ingestPart, Object)
		handleUpdatedPart(peripheralDevice, rundownExternalId, segmentExternalId, ingestPart)
	}
}

function getIngestPlaylist(peripheralDevice: PeripheralDevice, playlistExternalId: string): IngestPlaylist {
	const rundowns = Rundowns.find({
		peripheralDeviceId: peripheralDevice._id,
		playlistExternalId,
	}).fetch()

	const ingestPlaylist: IngestPlaylist = literal<IngestPlaylist>({
		externalId: playlistExternalId,
		rundowns: [],
	})

	for (const rundown of rundowns) {
		const ingestCache = waitForPromise(RundownIngestDataCache.create(rundown._id))
		const ingestData = ingestCache.fetchRundown()
		if (ingestData) {
			ingestPlaylist.rundowns.push(ingestData)
		}
	}

	return ingestPlaylist
}
function getIngestRundown(peripheralDevice: PeripheralDevice, rundownExternalId: string): IngestRundown {
	const rundown = Rundowns.findOne({
		peripheralDeviceId: peripheralDevice._id,
		externalId: rundownExternalId,
	})
	if (!rundown) {
		throw new Meteor.Error(404, `Rundown "${rundownExternalId}" not found`)
	}

	const ingestCache = waitForPromise(RundownIngestDataCache.create(rundown._id))
	const ingestData = ingestCache.fetchRundown()
	if (!ingestData)
		throw new Meteor.Error(404, `Rundown "${rundown._id}", (${rundownExternalId}) has no cached ingest data`)
	return ingestData
}
function getIngestSegment(
	peripheralDevice: PeripheralDevice,
	rundownExternalId: string,
	segmentExternalId: string
): IngestSegment {
	const rundown = Rundowns.findOne({
		peripheralDeviceId: peripheralDevice._id,
		externalId: rundownExternalId,
	})
	if (!rundown) {
		throw new Meteor.Error(404, `Rundown "${rundownExternalId}" not found`)
	}

	const segment = Segments.findOne({
		externalId: segmentExternalId,
		rundownId: rundown._id,
	})

	if (!segment) {
		throw new Meteor.Error(404, `Segment ${segmentExternalId} not found in rundown ${rundownExternalId}`)
	}

	const ingestCache = waitForPromise(RundownIngestDataCache.create(rundown._id))
	const ingestData = ingestCache.fetchSegment(segment._id)
	if (!ingestData)
		throw new Meteor.Error(
			404,
			`Rundown "${rundown._id}", (${rundownExternalId}) has no cached segment "${segment._id}" ingest data`
		)
	return ingestData
}
function listIngestRundowns(peripheralDevice: PeripheralDevice): string[] {
	const rundowns = Rundowns.find({
		peripheralDeviceId: peripheralDevice._id,
	}).fetch()

	return rundowns.map((r) => r.externalId)
}

export function handleRemovedRundown(peripheralDevice: PeripheralDevice, rundownExternalId: string) {
	const studio = getStudioFromDevice(peripheralDevice)

	return handleRemovedRundownFromStudio(studio._id, rundownExternalId)
}
function handleRemovedRundownFromStudio(studioId: StudioId, rundownExternalId: string, forceDelete?: boolean) {
	return runIngestOperationWithCache(
		'handleRemovedRundown',
		studioId,
		rundownExternalId,
		() => {
			// Remove it
			return UpdateIngestRundownAction.DELETE
		},
		async (cache) => {
			const rundown = getRundown(cache)

			return {
				changedSegmentIds: [],
				removedSegmentIds: [],
				renamedSegments: new Map(),
				removeRundown: forceDelete || canRundownBeUpdated(rundown, false),

				showStyle: undefined,
				blueprint: undefined,
			}
		}
	)
}
export function handleRemovedRundownByRundown(rundown: DBRundown, forceDelete?: boolean) {
	if (rundown.restoredFromSnapshotId) {
		// It's from a snapshot, so should be removed directly, as that means it cannot run ingest operations
		// Note: this bypasses activation checks, but that probably doesnt matter
		waitForPromise(removeRundownsFromDb([rundown._id]))

		// check if the playlist is now empty
		const rundownCount = Rundowns.find({ playlistId: rundown.playlistId }).count()
		if (rundownCount === 0) {
			// A lazy approach, but good enough for snapshots
			RundownPlaylists.remove(rundown.playlistId)
		}
	} else {
		handleRemovedRundownFromStudio(rundown.studioId, rundown.externalId, forceDelete)
	}
}

/** Handle an updated (or inserted) Rundown */
export function handleUpdatedRundown(
	studio0: Studio | undefined,
	peripheralDevice: PeripheralDevice | undefined,
	newIngestRundown: IngestRundown,
	isCreateAction: boolean
) {
	const studioId = peripheralDevice?.studioId ?? studio0?._id
	if ((!peripheralDevice && !studio0) || !studioId) {
		throw new Meteor.Error(500, `A PeripheralDevice or Studio is required to update a rundown`)
	}

	if (peripheralDevice && studio0 && peripheralDevice.studioId !== studio0._id) {
		throw new Meteor.Error(
			500,
			`PeripheralDevice "${peripheralDevice._id}" does not belong to studio "${studio0._id}"`
		)
	}

	const rundownExternalId = newIngestRundown.externalId
	return runIngestOperationWithCache(
		'handleUpdatedRundown',
		studioId,
		rundownExternalId,
		(ingestRundown) => {
			if (ingestRundown || isCreateAction) {
				// We want to regenerate unmodified
				return makeNewIngestRundown(newIngestRundown)
			} else {
				throw new Meteor.Error(404, `Rundown "${rundownExternalId}" not found`)
			}
		},
		async (cache, ingestRundown) => {
			if (!ingestRundown) throw new Meteor.Error(`regenerateRundown lost the IngestRundown...`)

			return handleUpdatedRundownInner(cache, ingestRundown, isCreateAction, peripheralDevice)
		}
	)
}
export async function handleUpdatedRundownInner(
	cache: CacheForIngest,
	ingestRundown: LocalIngestRundown,
	isCreateAction: boolean,
	peripheralDevice?: PeripheralDevice // TODO - to cache?
): Promise<CommitIngestData | null> {
	if (!canRundownBeUpdated(cache.Rundown.doc, isCreateAction)) return null

	logger.info(`${cache.Rundown.doc ? 'Updating' : 'Adding'} rundown ${cache.RundownId}`)

	return updateRundownFromIngestData(cache, ingestRundown, peripheralDevice)
}
export function regenerateRundown(
	studio: Studio,
	rundownExternalId: string,
	peripheralDevice0: PeripheralDevice | undefined
) {
	return runIngestOperationWithCache(
		'regenerateRundown',
		studio._id,
		rundownExternalId,
		(ingestRundown) => {
			if (ingestRundown) {
				// We want to regenerate unmodified
				return ingestRundown
			} else {
				throw new Meteor.Error(404, `Rundown "${rundownExternalId}" not found`)
			}
		},
		async (cache, ingestRundown) => {
			// If the rundown is orphaned, then we can't regenerate as there wont be any data to use!
			if (!ingestRundown || !canRundownBeUpdated(cache.Rundown.doc, false)) return null

			// Try and find the stored peripheralDevice
			const peripheralDevice =
				peripheralDevice0 ??
				(cache.Rundown.doc?.peripheralDeviceId
					? PeripheralDevices.findOne({
							_id: cache.Rundown.doc.peripheralDeviceId,
							studioId: cache.Studio.doc._id,
					  })
					: undefined)

			return updateRundownFromIngestData(cache, ingestRundown, peripheralDevice)
		}
	)
}

export function handleRemovedSegment(
	peripheralDevice: PeripheralDevice,
	rundownExternalId: string,
	segmentExternalId: string
) {
	const studio = getStudioFromDevice(peripheralDevice)

	return runIngestOperationWithCache(
		'handleRemovedSegment',
		studio._id,
		rundownExternalId,
		(ingestRundown) => {
			if (ingestRundown) {
				const oldSegmentsLength = ingestRundown.segments.length
				ingestRundown.segments = ingestRundown.segments.filter((s) => s.externalId !== segmentExternalId)
				ingestRundown.modified = getCurrentTime()

				if (ingestRundown.segments.length === oldSegmentsLength) {
					throw new Meteor.Error(
						404,
						`Rundown "${rundownExternalId}" does not have a Segment "${segmentExternalId}" to remove`
					)
				}

				// We modify in-place
				return ingestRundown
			} else {
				throw new Meteor.Error(404, `Rundown "${rundownExternalId}" not found`)
			}
		},
		async (cache) => {
			const rundown = getRundown(cache)
			const segmentId = getSegmentId(rundown._id, segmentExternalId)
			const segment = cache.Segments.findOne(segmentId)

			if (!canSegmentBeUpdated(rundown, segment, false)) {
				// segment has already been deleted
				return null
			} else {
				return {
					changedSegmentIds: [],
					removedSegmentIds: [segmentId],
					renamedSegments: new Map(),

					removeRundown: false,

					showStyle: undefined,
					blueprint: undefined,
				}
			}
		}
	)
}

export function handleUpdatedSegment(
	peripheralDevice: PeripheralDevice,
	rundownExternalId: string,
	newIngestSegment: IngestSegment,
	isCreateAction: boolean
) {
	const studio = getStudioFromDevice(peripheralDevice)

	const segmentExternalId = newIngestSegment.externalId

	return runIngestOperationWithCache(
		'handleUpdatedSegment',
		studio._id,
		rundownExternalId,
		(ingestRundown) => {
			if (ingestRundown) {
				ingestRundown.segments = ingestRundown.segments.filter((s) => s.externalId !== segmentExternalId)
				ingestRundown.segments.push(makeNewIngestSegment(newIngestSegment))
				ingestRundown.modified = getCurrentTime()

				// We modify in-place
				return ingestRundown
			} else {
				throw new Meteor.Error(404, `Rundown "${rundownExternalId}" not found`)
			}
		},
		async (cache, ingestRundown) => {
			const ingestSegment = ingestRundown?.segments?.find((s) => s.externalId === segmentExternalId)
			if (!ingestSegment) throw new Meteor.Error(500, `IngestSegment "${segmentExternalId}" is missing!`)
			return updateSegmentFromIngestData(cache, ingestSegment, isCreateAction)
		}
	)
}

export function handleUpdatedSegmentRanks(
	peripheralDevice: PeripheralDevice,
	rundownExternalId: string,
	newRanks: { [segmentExternalId: string]: number }
) {
	const studio = getStudioFromDevice(peripheralDevice)

	return runIngestOperationWithCache(
		'handleUpdatedSegmentRanks',
		studio._id,
		rundownExternalId,
		(ingestRundown) => {
			if (ingestRundown) {
				// Update ranks on ingest data
				for (const segment of ingestRundown.segments) {
					segment.rank = newRanks[segment.externalId] ?? segment.rank
				}
				// We modify in-place
				return ingestRundown
			} else {
				throw new Meteor.Error(404, `Rundown "${rundownExternalId}" not found`)
			}
		},
		async (cache) => {
			const changedSegmentIds: SegmentId[] = []
			for (const [externalId, rank] of Object.entries(newRanks)) {
				const segmentId = getSegmentId(cache.RundownId, externalId)
				const changed = cache.Segments.update(segmentId, {
					$set: {
						_rank: rank,
					},
				})

				if (changed.length === 0) {
					logger.warn(`Failed to update rank of segment "${externalId}" (${rundownExternalId})`)
				} else {
					changedSegmentIds.push(segmentId)
				}
			}

			return {
				changedSegmentIds,
				removedSegmentIds: [],
				renamedSegments: new Map(),
				removeRundown: false,

				showStyle: undefined,
				blueprint: undefined,
			}
		}
	)
}

export function handleRemovedPart(
	peripheralDevice: PeripheralDevice,
	rundownExternalId: string,
	segmentExternalId: string,
	partExternalId: string
) {
	const studio = getStudioFromDevice(peripheralDevice)

	return runIngestOperationWithCache(
		'handleRemovedPart',
		studio._id,
		rundownExternalId,
		(ingestRundown) => {
			if (ingestRundown) {
				const ingestSegment = ingestRundown.segments.find((s) => s.externalId === segmentExternalId)
				if (!ingestSegment) {
					throw new Meteor.Error(
						404,
						`Rundown "${rundownExternalId}" does not have a Segment "${segmentExternalId}" to update`
					)
				}
				ingestSegment.parts = ingestSegment.parts.filter((p) => p.externalId !== partExternalId)
				ingestSegment.modified = getCurrentTime()

				// We modify in-place
				return ingestRundown
			} else {
				throw new Meteor.Error(404, `Rundown "${rundownExternalId}" not found`)
			}
		},
		async (cache, ingestRundown) => {
			const ingestSegment = ingestRundown?.segments?.find((s) => s.externalId === segmentExternalId)
			if (!ingestSegment) throw new Meteor.Error(500, `IngestSegment "${segmentExternalId}" is missing!`)
			return updateSegmentFromIngestData(cache, ingestSegment, false)
		}
	)
}
export function handleUpdatedPart(
	peripheralDevice: PeripheralDevice,
	rundownExternalId: string,
	segmentExternalId: string,
	ingestPart: IngestPart
) {
	const studio = getStudioFromDevice(peripheralDevice)

	return runIngestOperationWithCache(
		'handleUpdatedPart',
		studio._id,
		rundownExternalId,
		(ingestRundown) => {
			if (ingestRundown) {
				const ingestSegment = ingestRundown.segments.find((s) => s.externalId === segmentExternalId)
				if (!ingestSegment) {
					throw new Meteor.Error(
						404,
						`Rundown "${rundownExternalId}" does not have a Segment "${segmentExternalId}" to update`
					)
				}
				ingestSegment.parts = ingestSegment.parts.filter((p) => p.externalId !== ingestPart.externalId)
				ingestSegment.parts.push(makeNewIngestPart(ingestPart))
				ingestSegment.modified = getCurrentTime()

				// We modify in-place
				return ingestRundown
			} else {
				throw new Meteor.Error(404, `Rundown "${rundownExternalId}" not found`)
			}
		},
		async (cache, ingestRundown) => {
			const ingestSegment = ingestRundown?.segments?.find((s) => s.externalId === segmentExternalId)
			if (!ingestSegment) throw new Meteor.Error(500, `IngestSegment "${segmentExternalId}" is missing!`)
			return updateSegmentFromIngestData(cache, ingestSegment, false)
		}
	)
}
