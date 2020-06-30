import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'
import { Rundowns, Rundown, DBRundown, RundownId } from '../../lib/collections/Rundowns'
import { Part, Parts, DBPart, PartId } from '../../lib/collections/Parts'
import { Pieces, Piece } from '../../lib/collections/Pieces'
import { AdLibPieces, AdLibPiece } from '../../lib/collections/AdLibPieces'
import { Segments, SegmentId } from '../../lib/collections/Segments'
import {
	saveIntoDb,
	getRank,
	getCurrentTime,
	asyncCollectionUpdate,
	waitForPromiseAll,
	getHash,
	literal,
	waitForPromise,
	unprotectObjectArray,
	protectString,
	unprotectString,
	makePromise,
	Omit,
	waitForPromiseObj,
	asyncCollectionFindFetch,
	normalizeArray,
	check,
} from '../../lib/lib'
import { logger } from '../logging'
import { triggerUpdateTimelineAfterIngestData } from './playout/playout'
import { registerClassToMeteorMethods } from '../methods'
import { NewRundownAPI, RundownAPIMethods, RundownPlaylistValidateBlueprintConfigResult } from '../../lib/api/rundown'
import { updateExpectedMediaItemsOnPart } from './expectedMediaItems'
import {
	ShowStyleVariants,
	ShowStyleVariant,
	ShowStyleVariantId,
	createShowStyleCompound,
} from '../../lib/collections/ShowStyleVariants'
import { ShowStyleBases, ShowStyleBase, ShowStyleBaseId } from '../../lib/collections/ShowStyleBases'
import { Blueprints } from '../../lib/collections/Blueprints'
import { Studios, Studio } from '../../lib/collections/Studios'
import { BlueprintResultOrderedRundowns, ExtendedIngestRundown } from 'tv-automation-sofie-blueprints-integration'
import { StudioConfigContext } from './blueprints/context'
import { loadStudioBlueprints, loadShowStyleBlueprints } from './blueprints/cache'
import { PackageInfo } from '../coreSystem'
import { IngestActions } from './ingest/actions'
import { DBRundownPlaylist, RundownPlaylists, RundownPlaylistId } from '../../lib/collections/RundownPlaylists'
import { ExpectedPlayoutItems } from '../../lib/collections/ExpectedPlayoutItems'
import { updateExpectedPlayoutItemsOnPart } from './ingest/expectedPlayoutItems'
import { PeripheralDevice } from '../../lib/collections/PeripheralDevices'
import { PartInstances } from '../../lib/collections/PartInstances'
import { ReloadRundownPlaylistResponse, TriggerReloadDataResponse } from '../../lib/api/userActions'
import {
	CacheForRundownPlaylist,
	initCacheForRundownPlaylist,
	initCacheForRundownPlaylistFromRundown,
} from '../DatabaseCaches'
import { saveIntoCache } from '../DatabaseCache'
import {
	removeRundownFromCache,
	removeRundownPlaylistFromCache,
	getRundownsSegmentsAndPartsFromCache,
} from './playout/lib'
import { AdLibActions, AdLibAction } from '../../lib/collections/AdLibActions'
import { Settings } from '../../lib/Settings'
import { findMissingConfigs } from './blueprints/config'
import { modifyPlaylistExternalId } from './ingest/lib'

export function selectShowStyleVariant(
	studio: Studio,
	ingestRundown: ExtendedIngestRundown
): { variant: ShowStyleVariant; base: ShowStyleBase } | null {
	if (!studio.supportedShowStyleBase.length) {
		logger.debug(`Studio "${studio._id}" does not have any supportedShowStyleBase`)
		return null
	}
	const showStyleBases = ShowStyleBases.find({ _id: { $in: studio.supportedShowStyleBase } }).fetch()
	let showStyleBase = _.first(showStyleBases)
	if (!showStyleBase) {
		logger.debug(
			`No showStyleBases matching with supportedShowStyleBase [${studio.supportedShowStyleBase}] from studio "${studio._id}"`
		)
		return null
	}

	const context = new StudioConfigContext(studio)

	const studioBlueprint = loadStudioBlueprints(studio)
	if (!studioBlueprint) throw new Meteor.Error(500, `Studio "${studio._id}" does not have a blueprint`)

	if (!studioBlueprint.blueprint.getShowStyleId)
		throw new Meteor.Error(500, `Studio "${studio._id}" blueprint missing property getShowStyleId`)

	const showStyleId: ShowStyleBaseId | null = protectString(
		studioBlueprint.blueprint.getShowStyleId(context, unprotectObjectArray(showStyleBases) as any, ingestRundown)
	)
	if (showStyleId === null) {
		logger.debug(`StudioBlueprint for studio "${studio._id}" returned showStyleId = null`)
		return null
	}
	showStyleBase = _.find(showStyleBases, (s) => s._id === showStyleId)
	if (!showStyleBase) {
		logger.debug(
			`No ShowStyleBase found matching showStyleId "${showStyleId}", from studio "${studio._id}" blueprint`
		)
		return null
	}
	const showStyleVariants = ShowStyleVariants.find({ showStyleBaseId: showStyleBase._id }).fetch()
	if (!showStyleVariants.length) throw new Meteor.Error(500, `ShowStyleBase "${showStyleBase._id}" has no variants`)

	const showStyleBlueprint = loadShowStyleBlueprints(showStyleBase)
	if (!showStyleBlueprint)
		throw new Meteor.Error(500, `ShowStyleBase "${showStyleBase._id}" does not have a valid blueprint`)

	const variantId: ShowStyleVariantId | null = protectString(
		showStyleBlueprint.blueprint.getShowStyleVariantId(
			context,
			unprotectObjectArray(showStyleVariants) as any,
			ingestRundown
		)
	)
	if (variantId === null) {
		logger.debug(`StudioBlueprint for studio "${studio._id}" returned variantId = null in .getShowStyleVariantId`)
		return null
	} else {
		const showStyleVariant = _.find(showStyleVariants, (s) => s._id === variantId)
		if (!showStyleVariant)
			throw new Meteor.Error(404, `Blueprint returned variantId "${variantId}", which was not found!`)

		return {
			variant: showStyleVariant,
			base: showStyleBase,
		}
	}
}

export interface RundownPlaylistAndOrder {
	rundownPlaylist: DBRundownPlaylist
	order: BlueprintResultOrderedRundowns
}

export function produceRundownPlaylistInfo(
	studio: Studio,
	currentRundown: DBRundown,
	peripheralDevice: PeripheralDevice | undefined
): RundownPlaylistAndOrder {
	const studioBlueprint = loadStudioBlueprints(studio)
	if (!studioBlueprint) throw new Meteor.Error(500, `Studio "${studio._id}" does not have a blueprint`)

	const playlistExternalId = currentRundown.playlistExternalId
	if (playlistExternalId && studioBlueprint.blueprint.getRundownPlaylistInfo) {
		// Note: We have to use the ExternalId of the playlist here, since we actually don't know the id of the playlist yet
		const allRundowns = Rundowns.find({ playlistExternalId: playlistExternalId }).fetch()

		if (!_.find(allRundowns, (rd) => rd._id === currentRundown._id))
			throw new Meteor.Error(
				500,
				`produceRundownPlaylistInfo: currentRundown ("${currentRundown._id}") not found in collection!`
			)

		const playlistInfo = studioBlueprint.blueprint.getRundownPlaylistInfo(unprotectObjectArray(allRundowns))
		if (!playlistInfo)
			throw new Meteor.Error(
				500,
				`blueprint.getRundownPlaylistInfo() returned null for externalId "${playlistExternalId}"`
			)

		const playlistId: RundownPlaylistId = protectString(getHash(playlistExternalId))

		const existingPlaylist = RundownPlaylists.findOne(playlistId)

		const playlist: DBRundownPlaylist = {
			created: getCurrentTime(),
			currentPartInstanceId: null,
			nextPartInstanceId: null,
			previousPartInstanceId: null,

			...existingPlaylist,

			_id: playlistId,
			externalId: playlistExternalId,
			studioId: studio._id,
			name: playlistInfo.playlist.name,
			expectedStart: playlistInfo.playlist.expectedStart,
			expectedDuration: playlistInfo.playlist.expectedDuration,

			loop: playlistInfo.playlist.loop,

			outOfOrderTiming: playlistInfo.playlist.outOfOrderTiming,

			modified: getCurrentTime(),

			peripheralDeviceId: peripheralDevice
				? peripheralDevice._id
				: existingPlaylist
				? existingPlaylist.peripheralDeviceId
				: protectString(''),
		}

		let order: BlueprintResultOrderedRundowns | null = playlistInfo.order
		if (!order) {
			// If no order is provided, fall back to sort the rundowns by their name:
			const rundownsInPlaylist = Rundowns.find(
				{
					playlistExternalId: playlist.externalId,
				},
				{
					sort: {
						expectedStart: 1,
						name: 1,
						_id: 1,
					},
				}
			).fetch()
			order = _.object(rundownsInPlaylist.map((i, index) => [i._id, index + 1]))
		}

		return {
			rundownPlaylist: playlist,
			order: order,
		}
	} else {
		const tmpPlaylistExternalId = unprotectString(currentRundown._id)
		// It's a rundown that "doesn't have a playlist", so we jsut make one up:
		const playlistId: RundownPlaylistId = protectString(getHash(tmpPlaylistExternalId))

		const existingPlaylist = RundownPlaylists.findOne(playlistId)

		const playlist: DBRundownPlaylist = {
			created: getCurrentTime(),
			currentPartInstanceId: null,
			nextPartInstanceId: null,
			previousPartInstanceId: null,

			...existingPlaylist,

			_id: playlistId,
			externalId: tmpPlaylistExternalId,
			studioId: studio._id,
			name: currentRundown.name,
			expectedStart: currentRundown.expectedStart,
			expectedDuration: currentRundown.expectedDuration,

			modified: getCurrentTime(),

			peripheralDeviceId: peripheralDevice ? peripheralDevice._id : protectString(''),
		}

		return {
			rundownPlaylist: playlist,
			order: _.object([[currentRundown._id, 1]]),
		}
	}
}

/**
 * Removes Segments from the database
 * @param rundownId The Rundown id to remove from
 * @param segmentIds The Segment ids to be removed
 */
export function removeSegments(cache: CacheForRundownPlaylist, rundownId: RundownId, segmentIds: SegmentId[]): number {
	logger.debug('removeSegments', rundownId, segmentIds)

	const count = cache.Segments.remove({
		_id: { $in: segmentIds },
		rundownId: rundownId,
	})
	if (count > 0) {
		afterRemoveSegments(cache, rundownId, segmentIds)
	}
	return count
}
/**
 * After Segments have been removed, handle the contents.
 * This will trigger an update of the timeline
 * @param rundownId Id of the Rundown
 * @param segmentIds Id of the Segments
 */
export function afterRemoveSegments(cache: CacheForRundownPlaylist, rundownId: RundownId, segmentIds: SegmentId[]) {
	// Remove the parts:
	saveIntoCache(
		cache.Parts,
		{
			rundownId: rundownId,
			segmentId: { $in: segmentIds },
		},
		[],
		{
			afterRemoveAll(parts) {
				afterRemoveParts(cache, rundownId, parts)
			},
		}
	)

	triggerUpdateTimelineAfterIngestData(cache, rundownId, segmentIds)
}

/**
 * After Parts have been removed, handle the contents.
 * This will NOT trigger an update of the timeline
 * @param rundownId Id of the Rundown
 * @param removedParts The parts that have been removed
 */
export function afterRemoveParts(cache: CacheForRundownPlaylist, rundownId: RundownId, removedParts: DBPart[]) {
	saveIntoCache(
		cache.Parts,
		{
			rundownId: rundownId,
			dynamicallyInserted: true,
			afterPart: { $in: _.map(removedParts, (p) => p._id) },
		},
		[],
		{
			afterRemoveAll(parts) {
				// Do the same for any affected dynamicallyInserted Parts
				afterRemoveParts(cache, rundownId, parts)
			},
		}
	)

	// Clean up all the db items that belong to the removed Parts
	// TODO - is there anything else to remove?

	saveIntoCache<Piece, Piece>(
		cache.Pieces,
		{
			rundownId: rundownId,
			partId: { $in: _.map(removedParts, (p) => p._id) },
		},
		[],
		{
			afterRemoveAll(pieces) {
				afterRemovePieces(cache, rundownId, pieces)
			},
		}
	)

	afterRemovePartsAuxiliary(cache, rundownId, removedParts)

	_.each(removedParts, (part) => {
		// TODO - batch?
		updateExpectedMediaItemsOnPart(cache, part.rundownId, part._id) // todo: is this correct
		updateExpectedPlayoutItemsOnPart(cache, part.rundownId, part._id)
	})
}

export function afterRemovePartsAuxiliary(
	cache: CacheForRundownPlaylist,
	rundownId: RundownId,
	removedParts: DBPart[]
) {
	cache.defer(() => {
		ExpectedPlayoutItems.remove({
			rundownId: rundownId,
			partId: { $in: _.map(removedParts, (p) => p._id) },
		})

		saveIntoDb<AdLibPiece, AdLibPiece>(
			AdLibPieces,
			{
				rundownId: rundownId,
				partId: { $in: _.map(removedParts, (p) => p._id) },
			},
			[],
			{
				afterRemoveAll(pieces) {
					afterRemovePieces(cache, rundownId, pieces)
				},
			}
		)

		AdLibActions.remove({
			rundownId: rundownId,
			partId: { $in: _.map(removedParts, (p) => p._id) },
		})
	})
}

/**
 * After Pieces have been removed, handle the contents.
 * This will NOT trigger an update of the timeline
 * @param rundownId Id of the Rundown
 * @param removedPieces The pieces that have been removed
 */
export function afterRemovePieces(
	cache: CacheForRundownPlaylist,
	rundownId: RundownId,
	removedPieces: Array<Piece | AdLibPiece>
) {
	cache.defer(() => {
		ExpectedPlayoutItems.remove({
			rundownId: rundownId,
			pieceId: { $in: _.map(removedPieces, (p) => p._id) },
		})
	})
}
/**
 * Update the ranks of all parts.
 * Uses the ranks to determine order within segments, and then updates part ranks based on segment ranks.
 * Adlib/dynamic parts get assigned ranks based on the rank of what they are told to be after
 * @param rundownId
 */
export function updatePartRanks(cache: CacheForRundownPlaylist, rundown: Rundown): Array<Part> {
	// TODO-PartInstance this will need to consider partInstances that have no backing part at some point, or do we not care about their rank?

	const { segments, parts: orgParts } = getRundownsSegmentsAndPartsFromCache(cache, [rundown])

	logger.debug(`updatePartRanks (${orgParts.length} parts, ${segments.length} segments)`)

	const parts: Array<Part> = []
	const partsToPutAfter: { [partId: string]: Array<Part> } = {}

	_.each(orgParts, (part) => {
		const afterPart: string | undefined = unprotectString(part.afterPart)
		if (afterPart) {
			if (!partsToPutAfter[afterPart]) partsToPutAfter[afterPart] = []
			partsToPutAfter[afterPart].push(part)
		} else {
			parts.push(part)
		}
	})

	// Update _rank and save to database:
	let updatedPartsCount = 0
	let newRank = 0
	let prevSegmentId: SegmentId = protectString('')
	_.each(parts, (part) => {
		if (part.segmentId !== prevSegmentId) {
			newRank = 0
			prevSegmentId = part.segmentId
		}
		if (part._rank !== newRank) {
			cache.Parts.update(part._id, { $set: { _rank: newRank } })
			updatedPartsCount++
			// Update in place, for the upcoming algorithm
			part._rank = newRank
		}
		newRank++
	})
	logger.debug(`updatePartRanks: ${updatedPartsCount} parts updated`)

	// Insert the parts that are to be put after other parts:
	let hasAddedAnything = true
	while (hasAddedAnything) {
		hasAddedAnything = false

		_.each(partsToPutAfter, (dynamicParts, insertAfterPartId0) => {
			const insertAfterPartId: PartId = protectString(insertAfterPartId0)

			let partBefore: Part | null = null
			let partAfter: Part | null = null
			let insertI = -1
			_.each(parts, (part, i) => {
				if (part._id === insertAfterPartId) {
					partBefore = part

					insertI = i + 1
				} else if (partBefore && part.segmentId === partBefore.segmentId && !partAfter) {
					partAfter = part
				}
			})

			if (partBefore) {
				if (insertI !== -1) {
					_.each(dynamicParts, (dynamicPart, i) => {
						const newRank = getRank(partBefore, partAfter, i, dynamicParts.length)

						if (dynamicPart._rank !== newRank) {
							dynamicPart._rank = newRank
							cache.Parts.update(dynamicPart._id, { $set: { _rank: dynamicPart._rank } })
							cache.PartInstances.update(
								{
									'part._id': dynamicPart._id,
									reset: { $ne: true },
								},
								{ $set: { 'part._rank': dynamicPart._rank } }
							)
						}

						parts.splice(insertI, 0, dynamicPart)
						insertI++
						hasAddedAnything = true
					})
				}
				delete partsToPutAfter[insertAfterPartId0]
			} else {
				// TODO - part is invalid and should be deleted/warned about
			}
		})
	}

	return parts
}

export namespace ServerRundownAPI {
	export function removeRundownPlaylist(playlistId: RundownPlaylistId) {
		const playlist = RundownPlaylists.findOne(playlistId)
		if (!playlist) throw new Meteor.Error(404, `RundownPlaylist "${playlistId}" not found!`)
		const cache = waitForPromise(initCacheForRundownPlaylist(playlist))
		const result = removeRundownPlaylistInner(cache, playlistId)
		waitForPromise(cache.saveAllToDatabase())
		return result
	}
	export function removeRundown(rundownId: RundownId) {
		const cache = waitForPromise(initCacheForRundownPlaylistFromRundown(rundownId))
		const result = removeRundownInner(cache, rundownId)
		waitForPromise(cache.saveAllToDatabase())
		return result
	}

	export function unsyncRundown(rundownId: RundownId): void {
		const cache = waitForPromise(initCacheForRundownPlaylistFromRundown(rundownId))
		const result = unsyncRundownInner(cache, rundownId)
		waitForPromise(cache.saveAllToDatabase())
		return result
	}
	export function unsyncSegment(rundownId: RundownId, segmentId: SegmentId): void {
		const cache = waitForPromise(initCacheForRundownPlaylistFromRundown(rundownId))
		const result = unsyncSegmentInner(cache, rundownId, segmentId)
		waitForPromise(cache.saveAllToDatabase())
		return result
	}

	/** Remove a RundownPlaylist and all its contents */
	export function removeRundownPlaylistInner(cache: CacheForRundownPlaylist, playlistId: RundownPlaylistId) {
		check(playlistId, String)
		logger.info('removeRundownPlaylist ' + playlistId)

		const playlist = cache.RundownPlaylists.findOne(playlistId)
		if (!playlist) throw new Meteor.Error(404, `RundownPlaylist "${playlistId}" not found!`)
		if (playlist.active)
			throw new Meteor.Error(400, `Not allowed to remove an active RundownPlaylist "${playlistId}".`)

		removeRundownPlaylistFromCache(cache, playlist)
	}
	/** Remove an individual rundown */
	export function removeRundownInner(cache: CacheForRundownPlaylist, rundownId: RundownId) {
		check(rundownId, String)
		logger.info('removeRundown ' + rundownId)

		const rundown = cache.Rundowns.findOne(rundownId)
		if (!rundown) throw new Meteor.Error(404, `Rundown "${rundownId}" not found!`)
		if (rundown.playlistId) {
			const playlist = cache.RundownPlaylists.findOne(rundown.playlistId)
			if (playlist && playlist.active && playlist.currentPartInstanceId) {
				const partInstance = cache.PartInstances.findOne(playlist.currentPartInstanceId)
				if (partInstance && partInstance.rundownId === rundown._id) {
					throw new Meteor.Error(
						400,
						`Not allowed to remove an active Rundown "${rundownId}". (active part: "${partInstance._id}" in playlist "${playlist._id}")`
					)
				}
			}
		}

		removeRundownFromCache(cache, rundown)
	}
	/** Resync all rundowns in a rundownPlaylist */
	export function resyncRundownPlaylist(playlistId: RundownPlaylistId): ReloadRundownPlaylistResponse {
		check(playlistId, String)
		logger.info('resyncRundownPlaylist ' + playlistId)

		const playlist = RundownPlaylists.findOne(playlistId)
		if (!playlist) throw new Meteor.Error(404, `RundownPlaylist "${playlistId}" not found!`)

		const response: ReloadRundownPlaylistResponse = {
			rundownsResponses: Rundowns.find({ playlistId: playlist._id })
				.fetch()
				.map((rundown) => {
					return {
						rundownId: rundown._id,
						response: resyncRundown(rundown._id),
					}
				}),
		}
		return response
	}

	export function resyncRundown(rundownId: RundownId): TriggerReloadDataResponse {
		check(rundownId, String)
		logger.info('resyncRundown ' + rundownId)

		const rundown = Rundowns.findOne(rundownId)
		if (!rundown) throw new Meteor.Error(404, `Rundown "${rundownId}" not found!`)
		// if (rundown.active) throw new Meteor.Error(400,`Not allowed to resync an active Rundown "${rundownId}".`)

		Rundowns.update(rundown._id, {
			$set: {
				unsynced: false,
			},
		})

		return IngestActions.reloadRundown(rundown)
	}
	export function resyncSegment(segmentId: SegmentId): TriggerReloadDataResponse {
		check(segmentId, String)
		logger.info('resyncSegment ' + segmentId)

		const segment = Segments.findOne(segmentId)
		if (!segment) throw new Meteor.Error(404, `Segment "${segmentId}" not found!`)

		Segments.update(segment._id, {
			$set: {
				unsynced: false,
			},
		})

		const rundown = Rundowns.findOne({ _id: segment.rundownId })

		if (!rundown) throw new Meteor.Error(404, `Rundown "${segment.rundownId}" not found!`)

		return IngestActions.reloadSegment(rundown, segment)
	}
	export function unsyncRundownInner(cache: CacheForRundownPlaylist, rundownId: RundownId): void {
		check(rundownId, String)
		logger.info('unsyncRundown ' + rundownId)

		let rundown = cache.Rundowns.findOne(rundownId)
		if (!rundown) throw new Meteor.Error(404, `Rundown "${rundownId}" not found!`)

		if (!rundown.unsynced) {
			cache.Rundowns.update(rundown._id, {
				$set: {
					unsynced: true,
					unsyncedTime: getCurrentTime(),
				},
			})
		} else {
			logger.info(`Rundown "${rundownId}" was already unsynced`)
		}
	}

	export function unsyncSegmentInner(
		cache: CacheForRundownPlaylist,
		rundownId: RundownId,
		segmentId: SegmentId
	): void {
		check(segmentId, String)
		logger.info('unsyncSegment' + segmentId)
		let segment = cache.Segments.findOne({
			rundownId: rundownId,
			_id: segmentId,
		})
		if (!segment) throw new Meteor.Error(404, `Segment "${segmentId}" not found in rundown "${rundownId}"!`)

		// Fallback to unsyncing rundown
		if (!Settings.allowUnsyncedSegments) {
			return unsyncRundownInner(cache, segment.rundownId)
		}

		if (!segment.unsynced) {
			cache.Segments.update(segmentId, {
				$set: {
					unsynced: true,
					unsyncedTime: getCurrentTime(),
				},
			})
		} else {
			logger.info(`Segment "${segmentId}" was already unsynced`)
		}
	}
}
export namespace ClientRundownAPI {
	export function rundownPlaylistNeedsResync(playlistId: RundownPlaylistId): string[] {
		check(playlistId, String)
		// logger.info('rundownPlaylistNeedsResync ' + playlistId)

		const playlist = RundownPlaylists.findOne(playlistId)
		if (!playlist) throw new Meteor.Error(404, `RundownPlaylist "${playlistId}" not found!`)

		const rundowns = playlist.getRundowns()
		const errors = rundowns.map((rundown) => {
			if (!rundown.importVersions) return 'unknown'

			if (rundown.importVersions.core !== (PackageInfo.versionExtended || PackageInfo.version))
				return 'coreVersion'

			const showStyleVariant = ShowStyleVariants.findOne(rundown.showStyleVariantId)
			if (!showStyleVariant) return 'missing showStyleVariant'
			if (rundown.importVersions.showStyleVariant !== (showStyleVariant._rundownVersionHash || 0))
				return 'showStyleVariant'

			const showStyleBase = ShowStyleBases.findOne(rundown.showStyleBaseId)
			if (!showStyleBase) return 'missing showStyleBase'
			if (rundown.importVersions.showStyleBase !== (showStyleBase._rundownVersionHash || 0))
				return 'showStyleBase'

			const blueprint = Blueprints.findOne(showStyleBase.blueprintId)
			if (!blueprint) return 'missing blueprint'
			if (rundown.importVersions.blueprint !== (blueprint.blueprintVersion || 0)) return 'blueprint'

			const studio = Studios.findOne(rundown.studioId)
			if (!studio) return 'missing studio'
			if (rundown.importVersions.studio !== (studio._rundownVersionHash || 0)) return 'studio'
		})

		return _.compact(errors)
	}
	// Validate the blueprint config used for this rundown, to ensure that all the required fields are specified
	export function rundownPlaylistValidateBlueprintConfig(
		playlistId: RundownPlaylistId
	): RundownPlaylistValidateBlueprintConfigResult {
		check(playlistId, String)

		const rundownPlaylist = RundownPlaylists.findOne(playlistId)
		if (!rundownPlaylist) throw new Meteor.Error(404, `RundownPlaylist "${playlistId}" not found!`)

		const studio = rundownPlaylist.getStudio()
		const studioBlueprint = Blueprints.findOne(studio.blueprintId)
		if (!studioBlueprint) throw new Meteor.Error(404, `Studio blueprint "${studio.blueprintId}" not found!`)

		const rundowns = rundownPlaylist.getRundowns()
		const uniqueShowStyleCompounds = _.uniq(
			rundowns,
			undefined,
			(rundown) => `${rundown.showStyleBaseId}-${rundown.showStyleVariantId}`
		)

		// Load all variants/compounds
		const { showStyleBases, showStyleVariants } = waitForPromiseObj({
			showStyleBases: asyncCollectionFindFetch(ShowStyleBases, {
				_id: { $in: uniqueShowStyleCompounds.map((r) => r.showStyleBaseId) },
			}),
			showStyleVariants: asyncCollectionFindFetch(ShowStyleVariants, {
				_id: { $in: uniqueShowStyleCompounds.map((r) => r.showStyleVariantId) },
			}),
		})
		const showStyleBlueprints = Blueprints.find({
			_id: { $in: _.uniq(_.compact(showStyleBases.map((c) => c.blueprintId))) },
		}).fetch()

		const showStyleBasesMap = normalizeArray(showStyleBases, '_id')
		const showStyleVariantsMap = normalizeArray(showStyleVariants, '_id')
		const showStyleBlueprintsMap = normalizeArray(showStyleBlueprints, '_id')

		const showStyleWarnings: RundownPlaylistValidateBlueprintConfigResult['showStyles'] = uniqueShowStyleCompounds.map(
			(rundown) => {
				const showStyleBase = showStyleBasesMap[unprotectString(rundown.showStyleBaseId)]
				const showStyleVariant = showStyleVariantsMap[unprotectString(rundown.showStyleVariantId)]
				const id = `${rundown.showStyleBaseId}-${rundown.showStyleVariantId}`
				if (!showStyleBase || !showStyleVariant) {
					return {
						id: id,
						name: `${showStyleBase ? showStyleBase.name : rundown.showStyleBaseId}-${
							rundown.showStyleVariantId
						}`,
						checkFailed: true,
						fields: [],
					}
				}

				const compound = createShowStyleCompound(showStyleBase, showStyleVariant)
				if (!compound) {
					return {
						id: id,
						name: `${showStyleBase ? showStyleBase.name : rundown.showStyleBaseId}-${
							rundown.showStyleVariantId
						}`,
						checkFailed: true,
						fields: [],
					}
				}

				const blueprint = showStyleBlueprintsMap[unprotectString(compound.blueprintId)]
				if (!blueprint) {
					return {
						id: id,
						name: compound.name,
						checkFailed: true,
						fields: [],
					}
				} else {
					return {
						id: id,
						name: compound.name,
						checkFailed: false,
						fields: findMissingConfigs(blueprint.showStyleConfigManifest, compound.config),
					}
				}
			}
		)

		return {
			studio: findMissingConfigs(studioBlueprint.studioConfigManifest, studio.config),
			showStyles: showStyleWarnings,
		}
	}
}

class ServerRundownAPIClass implements NewRundownAPI {
	removeRundownPlaylist(playlistId: RundownPlaylistId) {
		return makePromise(() => ServerRundownAPI.removeRundownPlaylist(playlistId))
	}
	resyncRundownPlaylist(playlistId: RundownPlaylistId) {
		return makePromise(() => ServerRundownAPI.resyncRundownPlaylist(playlistId))
	}
	rundownPlaylistNeedsResync(playlistId: RundownPlaylistId) {
		return makePromise(() => ClientRundownAPI.rundownPlaylistNeedsResync(playlistId))
	}
	rundownPlaylistValidateBlueprintConfig(playlistId: RundownPlaylistId) {
		return makePromise(() => ClientRundownAPI.rundownPlaylistValidateBlueprintConfig(playlistId))
	}
	removeRundown(rundownId: RundownId) {
		return makePromise(() => ServerRundownAPI.removeRundown(rundownId))
	}
	resyncRundown(rundownId: RundownId) {
		return makePromise(() => ServerRundownAPI.resyncRundown(rundownId))
	}
	resyncSegment(segmentId: SegmentId) {
		return makePromise(() => ServerRundownAPI.resyncSegment(segmentId))
	}
	unsyncRundown(rundownId: RundownId) {
		return makePromise(() => ServerRundownAPI.unsyncRundown(rundownId))
	}
	unsyncSegment(rundownId: RundownId, segmentId: SegmentId) {
		return makePromise(() => ServerRundownAPI.unsyncSegment(rundownId, segmentId))
	}
}
registerClassToMeteorMethods(RundownAPIMethods, ServerRundownAPIClass, false)
