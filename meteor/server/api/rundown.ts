import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'
import { check } from '../../lib/check'
import { Rundowns, Rundown, DBRundown, RundownId } from '../../lib/collections/Rundowns'
import { PartId } from '../../lib/collections/Parts'
import { Segments, SegmentId } from '../../lib/collections/Segments'
import {
	unprotectObjectArray,
	protectString,
	unprotectString,
	makePromise,
	normalizeArray,
	normalizeArrayToMap,
	clone,
} from '../../lib/lib'
import { logger } from '../logging'
import { registerClassToMeteorMethods } from '../methods'
import { NewRundownAPI, RundownAPIMethods, RundownPlaylistValidateBlueprintConfigResult } from '../../lib/api/rundown'
import {
	ShowStyleVariants,
	ShowStyleVariant,
	ShowStyleVariantId,
	ShowStyleCompound,
} from '../../lib/collections/ShowStyleVariants'
import { ShowStyleBases, ShowStyleBase, ShowStyleBaseId } from '../../lib/collections/ShowStyleBases'
import { Blueprints } from '../../lib/collections/Blueprints'
import { Studios } from '../../lib/collections/Studios'
import { ExtendedIngestRundown } from '@sofie-automation/blueprints-integration'
import { loadStudioBlueprint, loadShowStyleBlueprint } from './blueprints/cache'
import { PackageInfo } from '../coreSystem'
import { IngestActions } from './ingest/actions'
import { RundownPlaylistId, RundownPlaylist } from '../../lib/collections/RundownPlaylists'
import { ReloadRundownPlaylistResponse, TriggerReloadDataResponse } from '../../lib/api/userActions'
import { MethodContextAPI, MethodContext } from '../../lib/api/methods'
import { StudioContentWriteAccess } from '../security/studio'
import { RundownPlaylistContentWriteAccess } from '../security/rundownPlaylist'
import { findMissingConfigs } from './blueprints/config'
import { rundownContentAllowWrite } from '../security/rundown'
import { handleRemovedRundownByRundown } from './ingest/rundownInput'
import {
	moveRundownIntoPlaylist,
	removeRundownPlaylistFromDb,
	restoreRundownsInPlaylistToDefaultOrder,
} from './rundownPlaylist'
import { StudioUserContext } from './blueprints/context'
import { PartInstanceId } from '../../lib/collections/PartInstances'
import { CacheForPlayout } from './playout/cache'
import { ReadonlyDeep } from 'type-fest'
import { PlayoutLockFunctionPriority, runPlayoutOperationWithLock } from './playout/lockFunction'
import { runIngestOperationFromRundown } from './ingest/lockFunction'
import { getRundown } from './ingest/lib'
import { createShowStyleCompound } from './showStyles'
import { checkAccessToPlaylist } from './lib'

export async function selectShowStyleVariant(
	context: StudioUserContext,
	ingestRundown: ExtendedIngestRundown
): Promise<{ variant: ShowStyleVariant; base: ShowStyleBase; compound: ShowStyleCompound } | null> {
	const studio = context.studio
	if (!studio.supportedShowStyleBase.length) {
		logger.debug(`Studio "${studio._id}" does not have any supportedShowStyleBase`)
		return null
	}
	const showStyleBases = await ShowStyleBases.findFetchAsync({
		_id: { $in: clone<Array<ShowStyleBaseId>>(studio.supportedShowStyleBase) },
	})
	let showStyleBase = _.first(showStyleBases)
	if (!showStyleBase) {
		logger.debug(
			`No showStyleBases matching with supportedShowStyleBase [${studio.supportedShowStyleBase}] from studio "${studio._id}"`
		)
		return null
	}

	const studioBlueprint = await loadStudioBlueprint(studio)
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
	const showStyleVariants = await ShowStyleVariants.findFetchAsync({ showStyleBaseId: showStyleBase._id })
	if (!showStyleVariants.length) throw new Meteor.Error(500, `ShowStyleBase "${showStyleBase._id}" has no variants`)

	const showStyleBlueprint = await loadShowStyleBlueprint(showStyleBase)
	if (!showStyleBlueprint)
		throw new Meteor.Error(500, `ShowStyleBase "${showStyleBase._id}" does not have a valid blueprint`)

	const variantId: ShowStyleVariantId | null = protectString(
		showStyleBlueprint.blueprint.getShowStyleVariantId(
			context,
			unprotectObjectArray(showStyleVariants),
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

		const compound = createShowStyleCompound(showStyleBase, showStyleVariant)
		if (!compound) throw new Meteor.Error(404, `no showStyleCompound for "${showStyleVariant._id}"`)

		return {
			variant: showStyleVariant,
			base: showStyleBase,
			compound,
		}
	}
}
/** Return true if the rundown is allowed to be moved out of that playlist */
export function allowedToMoveRundownOutOfPlaylist(
	playlist: ReadonlyDeep<RundownPlaylist>,
	rundown: ReadonlyDeep<DBRundown>
) {
	const { currentPartInstance, nextPartInstance } = playlist.getSelectedPartInstances()

	if (rundown.playlistId !== playlist._id)
		throw new Meteor.Error(
			500,
			`Wrong playlist "${playlist._id}" provided for rundown "${rundown._id}" ("${rundown.playlistId}")`
		)

	return !(
		playlist.activationId &&
		((currentPartInstance && currentPartInstance.rundownId === rundown._id) ||
			(nextPartInstance && nextPartInstance.rundownId === rundown._id))
	)
}

export type ChangedSegmentsRankInfo = Array<{
	segmentId: SegmentId
	oldPartIdsAndRanks: Array<{ id: PartId; rank: number }> | null // Null if the Parts havent changed, and so can be loaded locally
}>

/**
 * Update the ranks of all PartInstances in the given segments.
 * Syncs the ranks from matching Parts to PartInstances.
 * Orphaned PartInstances get ranks interpolated based on what they were ranked between before the ingest update
 */
export function updatePartInstanceRanks(cache: CacheForPlayout, changedSegments: ChangedSegmentsRankInfo) {
	const groupedPartInstances = _.groupBy(
		cache.PartInstances.findFetch({
			reset: { $ne: true },
			segmentId: { $in: changedSegments.map((s) => s.segmentId) },
		}),
		(p) => p.segmentId
	)
	const groupedNewParts = _.groupBy(
		cache.Parts.findFetch({
			segmentId: { $in: changedSegments.map((s) => s.segmentId) },
		}),
		(p) => p.segmentId
	)

	let updatedParts = 0
	for (const { segmentId, oldPartIdsAndRanks: oldPartIdsAndRanks0 } of changedSegments) {
		const newParts = groupedNewParts[unprotectString(segmentId)] || []
		const segmentPartInstances = _.sortBy(
			groupedPartInstances[unprotectString(segmentId)] || [],
			(p) => p.part._rank
		)

		// Ensure the PartInstance ranks are synced with their Parts
		const newPartsMap = normalizeArrayToMap(newParts, '_id')
		for (const partInstance of segmentPartInstances) {
			const part = newPartsMap.get(partInstance.part._id)
			if (part) {
				// We have a part and instance, so make sure the part isn't orphaned and sync the rank
				cache.PartInstances.update(partInstance._id, {
					$set: {
						'part._rank': part._rank,
					},
					$unset: {
						orphaned: 1,
					},
				})

				// Update local copy
				delete partInstance.orphaned
				partInstance.part._rank = part._rank
			} else if (!partInstance.orphaned) {
				partInstance.orphaned = 'deleted'
				cache.PartInstances.update(partInstance._id, {
					$set: {
						orphaned: 'deleted',
					},
				})
			}
		}

		const orphanedPartInstances = segmentPartInstances
			.map((p) => ({ rank: p.part._rank, orphaned: p.orphaned, instanceId: p._id, id: p.part._id }))
			.filter((p) => p.orphaned)

		if (orphanedPartInstances.length === 0) {
			// No orphans to position
			continue
		}

		logger.debug(
			`updatePartInstanceRanks: ${segmentPartInstances.length} partInstances with ${orphanedPartInstances.length} orphans in segment "${segmentId}"`
		)

		// If we have no instances, or no parts to base it on, then we can't do anything
		if (newParts.length === 0) {
			// position them all 0..n
			let i = 0
			for (const partInfo of orphanedPartInstances) {
				cache.PartInstances.update(partInfo.instanceId, { $set: { 'part._rank': i++ } })
			}
			continue
		}

		const oldPartIdsAndRanks = oldPartIdsAndRanks0 ?? newParts.map((p) => ({ id: p._id, rank: p._rank }))

		const preservedPreviousParts = oldPartIdsAndRanks.filter((p) => newPartsMap.has(p.id))

		if (preservedPreviousParts.length === 0) {
			// position them all before the first
			const firstPartRank = newParts.length > 0 ? _.min(newParts, (p) => p._rank)._rank : 0
			let i = firstPartRank - orphanedPartInstances.length
			for (const partInfo of orphanedPartInstances) {
				cache.PartInstances.update(partInfo.instanceId, { $set: { 'part._rank': i++ } })
			}
		} else {
			// they need interleaving

			// compile the old order, and get a list of the ones that still remain in the new state
			const allParts = new Map<PartId, { rank: number; id: PartId; instanceId?: PartInstanceId }>()
			for (const oldPart of oldPartIdsAndRanks) allParts.set(oldPart.id, oldPart)
			for (const orphanedPart of orphanedPartInstances) allParts.set(orphanedPart.id, orphanedPart)

			// Now go through and update their ranks
			const remainingPreviousParts = _.sortBy(Array.from(allParts.values()), (p) => p.rank).filter(
				(p) => p.instanceId || newPartsMap.has(p.id)
			)

			for (let i = -1; i < remainingPreviousParts.length - 1; ) {
				// Find the range to process this iteration
				const beforePartIndex = i
				const afterPartIndex = remainingPreviousParts.findIndex((p, o) => o > i && !p.instanceId)

				if (afterPartIndex === beforePartIndex + 1) {
					// no dynamic parts in between
					i++
					continue
				} else if (afterPartIndex === -1) {
					// We will reach the end, so make sure we stop
					i = remainingPreviousParts.length
				} else {
					// next iteration should look from the next fixed point
					i = afterPartIndex
				}

				const firstDynamicIndex = beforePartIndex + 1
				const lastDynamicIndex = afterPartIndex === -1 ? remainingPreviousParts.length - 1 : afterPartIndex - 1

				// Calculate the rank change per part
				const dynamicPartCount = lastDynamicIndex - firstDynamicIndex + 1
				const basePartRank =
					beforePartIndex === -1 ? -1 : newPartsMap.get(remainingPreviousParts[beforePartIndex].id)?._rank! // eslint-disable-line @typescript-eslint/no-non-null-asserted-optional-chain
				const afterPartRank =
					afterPartIndex === -1
						? basePartRank + 1
						: newPartsMap.get(remainingPreviousParts[afterPartIndex].id)?._rank! // eslint-disable-line @typescript-eslint/no-non-null-asserted-optional-chain
				const delta = (afterPartRank - basePartRank) / (dynamicPartCount + 1)

				let prevRank = basePartRank
				for (let o = firstDynamicIndex; o <= lastDynamicIndex; o++) {
					const newRank = (prevRank = prevRank + delta)

					const orphanedPart = remainingPreviousParts[o]
					if (orphanedPart.instanceId && orphanedPart.rank !== newRank) {
						cache.PartInstances.update(orphanedPart.instanceId, { $set: { 'part._rank': newRank } })
						updatedParts++
					}
				}
			}
		}
	}
	logger.debug(`updatePartRanks: ${updatedParts} PartInstances updated`)
}

export namespace ServerRundownAPI {
	/** Remove a RundownPlaylist and all its contents */
	export async function removeRundownPlaylist(context: MethodContext, playlistId: RundownPlaylistId): Promise<void> {
		check(playlistId, String)

		const access = checkAccessToPlaylist(context, playlistId)

		await runPlayoutOperationWithLock(
			access,
			'removeRundownPlaylist',
			playlistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			async (_lock, tmpPlaylist) => {
				logger.info('removeRundownPlaylist ' + playlistId)

				await removeRundownPlaylistFromDb(tmpPlaylist)
			}
		)
	}
	/** Remove an individual rundown */
	export async function removeRundown(context: MethodContext, rundownId: RundownId): Promise<void> {
		check(rundownId, String)
		const access = RundownPlaylistContentWriteAccess.rundown(context, rundownId)

		await handleRemovedRundownByRundown(access.rundown, true)
	}

	export async function unsyncRundown(context: MethodContext, rundownId: RundownId): Promise<void> {
		check(rundownId, String)
		const access = RundownPlaylistContentWriteAccess.rundown(context, rundownId)

		await runIngestOperationFromRundown('unsyncRundown', access.rundown, async (cache) => {
			const rundown = getRundown(cache)
			if (!rundown.orphaned) {
				cache.Rundown.update({
					$set: {
						orphaned: 'deleted',
					},
				})
			} else {
				logger.info(`Rundown "${rundownId}" was already unsynced`)
			}
		})
	}
	/** Resync all rundowns in a rundownPlaylist */
	export function resyncRundownPlaylist(
		context: MethodContext,
		playlistId: RundownPlaylistId
	): ReloadRundownPlaylistResponse {
		check(playlistId, String)
		const access = StudioContentWriteAccess.rundownPlaylist(context, playlistId)
		logger.info('resyncRundownPlaylist ' + access.playlist._id)

		const response: ReloadRundownPlaylistResponse = {
			rundownsResponses: Rundowns.find({ playlistId: access.playlist._id })
				.fetch()
				.map((rundown) => {
					return {
						rundownId: rundown._id,
						response: innerResyncRundown(rundown),
					}
				}),
		}
		return response
	}
	export function resyncRundown(context: MethodContext, rundownId: RundownId): TriggerReloadDataResponse {
		check(rundownId, String)
		const access = RundownPlaylistContentWriteAccess.rundown(context, rundownId)
		return innerResyncRundown(access.rundown)
	}

	export function resyncSegment(
		context: MethodContext,
		rundownId: RundownId,
		segmentId: SegmentId
	): TriggerReloadDataResponse {
		check(segmentId, String)
		rundownContentAllowWrite(context.userId, { rundownId })
		logger.info('resyncSegment ' + segmentId)
		const segment = Segments.findOne(segmentId)
		if (!segment) throw new Meteor.Error(404, `Segment "${segmentId}" not found!`)

		const rundown = Rundowns.findOne({ _id: segment.rundownId })
		if (!rundown) throw new Meteor.Error(404, `Rundown "${segment.rundownId}" not found!`)

		// Orphaned flag will be reset by the response update
		return IngestActions.reloadSegment(rundown, segment)
	}

	export function innerResyncRundown(rundown: Rundown): TriggerReloadDataResponse {
		logger.info('resyncRundown ' + rundown._id)

		// if (rundown.active) throw new Meteor.Error(400,`Not allowed to resync an active Rundown "${rundownId}".`)

		// Orphaned flag will be reset by the response update
		return IngestActions.reloadRundown(rundown)
	}
}
export namespace ClientRundownAPI {
	export function rundownPlaylistNeedsResync(context: MethodContext, playlistId: RundownPlaylistId): string[] {
		check(playlistId, String)
		const access = StudioContentWriteAccess.rundownPlaylist(context, playlistId)
		const playlist = access.playlist

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
	export async function rundownPlaylistValidateBlueprintConfig(
		context: MethodContext,
		playlistId: RundownPlaylistId
	): Promise<RundownPlaylistValidateBlueprintConfigResult> {
		check(playlistId, String)

		const access = StudioContentWriteAccess.rundownPlaylist(context, playlistId)
		const rundownPlaylist = access.playlist

		const studio = rundownPlaylist.getStudio()
		const studioBlueprint = studio.blueprintId ? await Blueprints.findOneAsync(studio.blueprintId) : null
		if (!studioBlueprint) throw new Meteor.Error(404, `Studio blueprint "${studio.blueprintId}" not found!`)

		const rundowns = rundownPlaylist.getRundowns()
		const uniqueShowStyleCompounds = _.uniq(
			rundowns,
			undefined,
			(rundown) => `${rundown.showStyleBaseId}-${rundown.showStyleVariantId}`
		)

		// Load all variants/compounds
		const [showStyleBases, showStyleVariants] = await Promise.all([
			ShowStyleBases.findFetchAsync({
				_id: { $in: uniqueShowStyleCompounds.map((r) => r.showStyleBaseId) },
			}),
			ShowStyleVariants.findFetchAsync({
				_id: { $in: uniqueShowStyleCompounds.map((r) => r.showStyleVariantId) },
			}),
		])
		const showStyleBlueprints = await Blueprints.findFetchAsync({
			_id: { $in: _.uniq(_.compact(showStyleBases.map((c) => c.blueprintId))) },
		})

		const showStyleBasesMap = normalizeArray(showStyleBases, '_id')
		const showStyleVariantsMap = normalizeArray(showStyleVariants, '_id')
		const showStyleBlueprintsMap = normalizeArray(showStyleBlueprints, '_id')

		const showStyleWarnings: RundownPlaylistValidateBlueprintConfigResult['showStyles'] =
			uniqueShowStyleCompounds.map((rundown) => {
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
						fields: findMissingConfigs(blueprint.showStyleConfigManifest, compound.blueprintConfig),
					}
				}
			})

		return {
			studio: findMissingConfigs(studioBlueprint.studioConfigManifest, studio.blueprintConfig),
			showStyles: showStyleWarnings,
		}
	}
}

class ServerRundownAPIClass extends MethodContextAPI implements NewRundownAPI {
	async removeRundownPlaylist(playlistId: RundownPlaylistId) {
		return ServerRundownAPI.removeRundownPlaylist(this, playlistId)
	}
	async resyncRundownPlaylist(playlistId: RundownPlaylistId) {
		return makePromise(() => ServerRundownAPI.resyncRundownPlaylist(this, playlistId))
	}
	async rundownPlaylistNeedsResync(playlistId: RundownPlaylistId) {
		return makePromise(() => ClientRundownAPI.rundownPlaylistNeedsResync(this, playlistId))
	}
	async rundownPlaylistValidateBlueprintConfig(playlistId: RundownPlaylistId) {
		return ClientRundownAPI.rundownPlaylistValidateBlueprintConfig(this, playlistId)
	}
	async removeRundown(rundownId: RundownId) {
		return ServerRundownAPI.removeRundown(this, rundownId)
	}
	async resyncRundown(rundownId: RundownId) {
		return makePromise(() => ServerRundownAPI.resyncRundown(this, rundownId))
	}
	async resyncSegment(rundownId: RundownId, segmentId: SegmentId) {
		return makePromise(() => ServerRundownAPI.resyncSegment(this, rundownId, segmentId))
	}
	async unsyncRundown(rundownId: RundownId) {
		return ServerRundownAPI.unsyncRundown(this, rundownId)
	}
	async moveRundown(
		rundownId: RundownId,
		intoPlaylistId: RundownPlaylistId | null,
		rundownsIdsInPlaylistInOrder: RundownId[]
	) {
		return moveRundownIntoPlaylist(this, rundownId, intoPlaylistId, rundownsIdsInPlaylistInOrder)
	}
	async restoreRundownsInPlaylistToDefaultOrder(playlistId: RundownPlaylistId) {
		return restoreRundownsInPlaylistToDefaultOrder(this, playlistId)
	}
}
registerClassToMeteorMethods(RundownAPIMethods, ServerRundownAPIClass, false)
