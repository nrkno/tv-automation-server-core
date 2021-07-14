import {
	ShowStyleBlueprintManifest,
	BlueprintSyncIngestPartInstance,
	BlueprintSyncIngestNewData,
} from '@sofie-automation/blueprints-integration'
import { ReadonlyDeep } from 'type-fest'
import _ from 'underscore'
import { PartNote, SegmentNote } from '../../../lib/api/notes'
import { PartInstance } from '../../../lib/collections/PartInstances'
import { Part } from '../../../lib/collections/Parts'
import { Piece } from '../../../lib/collections/Pieces'
import { Rundown } from '../../../lib/collections/Rundowns'
import { ShowStyleCompound } from '../../../lib/collections/ShowStyleVariants'
import { unprotectObject, unprotectObjectArray, literal, clone } from '../../../lib/lib'
import { ReadOnlyCache } from '../../cache/CacheBase'
import { logger } from '../../logging'
import { SyncIngestUpdateToPartInstanceContext } from '../blueprints/context'
import { CacheForPlayout, getSelectedPartInstancesFromCache } from '../playout/cache'
import {
	fetchPiecesThatMayBeActiveForPart,
	getPieceInstancesForPart,
	syncPlayheadInfinitesForNextPartInstance,
} from '../playout/infinites'
import { isTooCloseToAutonext } from '../playout/lib'
import { CacheForIngest } from './cache'

export async function syncChangesToPartInstances(
	cache: CacheForPlayout,
	ingestCache: Omit<ReadOnlyCache<CacheForIngest>, 'Rundown'>,
	showStyle: ReadonlyDeep<ShowStyleCompound>,
	blueprint: ReadonlyDeep<ShowStyleBlueprintManifest>,
	rundown: ReadonlyDeep<Rundown>
): Promise<void> {
	if (cache.Playlist.doc.activationId) {
		if (blueprint.syncIngestUpdateToPartInstance) {
			const playlistPartInstances = getSelectedPartInstancesFromCache(cache)
			const instances: Array<{
				existingPartInstance: PartInstance
				previousPartInstance: PartInstance | undefined
				playStatus: 'current' | 'next'
				newPart: Part
				piecesThatMayBeActive: Promise<Piece[]>
			}> = []
			if (playlistPartInstances.currentPartInstance) {
				const newPart = cache.Parts.findOne(playlistPartInstances.currentPartInstance.part._id)
				if (newPart) {
					instances.push({
						existingPartInstance: playlistPartInstances.currentPartInstance,
						previousPartInstance: playlistPartInstances.previousPartInstance,
						playStatus: 'current',
						newPart: newPart,
						piecesThatMayBeActive: fetchPiecesThatMayBeActiveForPart(cache, ingestCache, newPart),
					})
				}
			}
			if (playlistPartInstances.nextPartInstance) {
				const newPart = cache.Parts.findOne(playlistPartInstances.nextPartInstance.part._id)
				if (newPart) {
					instances.push({
						existingPartInstance: playlistPartInstances.nextPartInstance,
						previousPartInstance: playlistPartInstances.currentPartInstance,
						playStatus: isTooCloseToAutonext(playlistPartInstances.currentPartInstance, false)
							? 'current'
							: 'next',
						newPart: newPart,
						piecesThatMayBeActive: fetchPiecesThatMayBeActiveForPart(cache, ingestCache, newPart),
					})
				}
			}

			for (const {
				existingPartInstance,
				previousPartInstance,
				playStatus,
				newPart,
				piecesThatMayBeActive,
			} of instances) {
				const pieceInstancesInPart = cache.PieceInstances.findFetch({
					partInstanceId: existingPartInstance._id,
				})

				const partId = existingPartInstance.part._id
				const existingResultPartInstance: BlueprintSyncIngestPartInstance = {
					partInstance: unprotectObject(existingPartInstance),
					pieceInstances: unprotectObjectArray(pieceInstancesInPart),
				}

				const referencedAdlibIds = _.compact(pieceInstancesInPart.map((p) => p.adLibSourceId))
				const referencedAdlibs = ingestCache.AdLibPieces.findFetch({ _id: { $in: referencedAdlibIds } })

				const adlibPieces = ingestCache.AdLibPieces.findFetch({ partId: partId })
				const adlibActions = ingestCache.AdLibActions.findFetch({ partId: partId })

				const proposedPieceInstances = getPieceInstancesForPart(
					cache,
					previousPartInstance,
					rundown,
					newPart,
					await piecesThatMayBeActive,
					existingPartInstance._id,
					false
				)

				const newResultData: BlueprintSyncIngestNewData = {
					part: unprotectObject(newPart),
					pieceInstances: unprotectObjectArray(proposedPieceInstances),
					adLibPieces: unprotectObjectArray(adlibPieces),
					actions: unprotectObjectArray(adlibActions),
					referencedAdlibs: unprotectObjectArray(referencedAdlibs),
				}

				const syncContext = new SyncIngestUpdateToPartInstanceContext(
					{
						name: `Update to ${newPart.externalId}`,
						identifier: `rundownId=${newPart.rundownId},segmentId=${newPart.segmentId}`,
					},
					cache.Playlist.doc.activationId,
					cache.Studio.doc,
					showStyle,
					rundown,
					existingPartInstance,
					pieceInstancesInPart,
					proposedPieceInstances,
					playStatus
				)
				// TODO - how can we limit the frequency we run this? (ie, how do we know nothing affecting this has changed)
				try {
					// The blueprint handles what in the updated part is going to be synced into the partInstance:
					blueprint.syncIngestUpdateToPartInstance(
						syncContext,
						existingResultPartInstance,
						clone(newResultData),
						playStatus
					)

					// If the blueprint function throws, no changes will be synced to the cache:
					syncContext.applyChangesToCache(cache)
				} catch (e) {
					logger.error(e)
				}

				// Save notes:
				if (!existingPartInstance.part.notes) existingPartInstance.part.notes = []
				const notes: PartNote[] = existingPartInstance.part.notes
				let changed = false
				for (const note of syncContext.notes) {
					changed = true
					notes.push(
						literal<SegmentNote>({
							type: note.type,
							message: note.message,
							origin: {
								name: '', // TODO
							},
						})
					)
				}
				if (changed) {
					// TODO - these dont get shown to the user currently
					// TODO - old notes from the sync may need to be pruned, or we will end up with duplicates and 'stuck' notes?
					cache.PartInstances.update(existingPartInstance._id, {
						$set: {
							'part.notes': notes,
						},
					})
				}

				if (existingPartInstance._id === cache.Playlist.doc.currentPartInstanceId) {
					// This should be run after 'current', before 'next':
					await syncPlayheadInfinitesForNextPartInstance(cache)
				}
			}
		} else {
			// blueprint.syncIngestUpdateToPartInstance is not set, default behaviour is to not sync the partInstance at all.
		}
	}
}
