import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import { Random } from 'meteor/random'
import * as _ from 'underscore'
import { SourceLayerType } from 'tv-automation-sofie-blueprints-integration'
import {
	getCurrentTime,
	literal,
	protectString,
	unprotectString,
	getRandomId,
	waitForPromise,
	unprotectStringArray,
} from '../../../lib/lib'
import { logger } from '../../../lib/logging'
import { Rundowns, RundownHoldState, Rundown } from '../../../lib/collections/Rundowns'
import { TimelineObjGeneric, TimelineObjType } from '../../../lib/collections/Timeline'
import { AdLibPieces, AdLibPiece } from '../../../lib/collections/AdLibPieces'
import { RundownBaselineAdLibPieces } from '../../../lib/collections/RundownBaselineAdLibPieces'
import { RundownPlaylists, RundownPlaylist, RundownPlaylistId } from '../../../lib/collections/RundownPlaylists'
import { Pieces, Piece, PieceId } from '../../../lib/collections/Pieces'
import { Parts, Part, DBPart } from '../../../lib/collections/Parts'
import { prefixAllObjectIds, setNextPart, getPartBeforeSegment, getPreviousPart, getRundownIDsFromCache } from './lib'
import { cropInfinitesOnLayer, updateSourceLayerInfinitesAfterPart } from './infinites'
import { convertAdLibToPieceInstance, getResolvedPieces, convertPieceToAdLibPiece } from './pieces'
import { updateTimeline } from './timeline'
import { updatePartRanks, afterRemoveParts } from '../rundown'
import { rundownPlaylistSyncFunction, RundownSyncFunctionPriority } from '../ingest/rundownInput'

import { PieceInstances, PieceInstance, PieceInstanceId } from '../../../lib/collections/PieceInstances'
import { PartInstances, PartInstance, PartInstanceId } from '../../../lib/collections/PartInstances'
import { initCacheForRundownPlaylist, CacheForRundownPlaylist } from '../../DatabaseCaches'
import { BucketAdLib, BucketAdLibs } from '../../../lib/collections/BucketAdlibs'
import { MongoQuery } from '../../../lib/typings/meteor'

export namespace ServerPlayoutAdLibAPI {
	export function pieceTakeNow(
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		pieceInstanceIdOrPieceIdToCopy: PieceInstanceId | PieceId
	) {
		return rundownPlaylistSyncFunction(rundownPlaylistId, RundownSyncFunctionPriority.USER_PLAYOUT, () => {
			const rundownPlaylist = RundownPlaylists.findOne(rundownPlaylistId)
			if (!rundownPlaylist) throw new Meteor.Error(404, `Rundown Playlist "${rundownPlaylistId}" not found!`)
			if (!rundownPlaylist.active)
				throw new Meteor.Error(403, `Part AdLib-pieces can be only placed in an active rundown!`)
			if (rundownPlaylist.currentPartInstanceId !== partInstanceId)
				throw new Meteor.Error(403, `Part AdLib-pieces can be only placed in a current part!`)

			const cache = waitForPromise(initCacheForRundownPlaylist(rundownPlaylist))

			const pieceInstanceToCopy = cache.PieceInstances.findOne(pieceInstanceIdOrPieceIdToCopy)
			const pieceToCopy = pieceInstanceToCopy
				? pieceInstanceToCopy.piece
				: (cache.Pieces.findOne(pieceInstanceIdOrPieceIdToCopy) as Piece)
			if (!pieceToCopy) {
				throw new Meteor.Error(404, `PieceInstance or Piece "${pieceInstanceIdOrPieceIdToCopy}" not found!`)
			}

			const partInstance = cache.PartInstances.findOne(partInstanceId)
			if (!partInstance) throw new Meteor.Error(404, `PartInstance "${partInstanceId}" not found!`)

			const rundown = cache.Rundowns.findOne(partInstance.rundownId)
			if (!rundown) throw new Meteor.Error(404, `Rundown "${partInstance.rundownId}" not found!`)

			const showStyleBase = rundown.getShowStyleBase() // todo: database
			const sourceLayer = showStyleBase.sourceLayers.find((i) => i._id === pieceToCopy.sourceLayerId)
			if (sourceLayer && sourceLayer.type !== SourceLayerType.GRAPHICS)
				throw new Meteor.Error(
					403,
					`PieceInstance or Piece "${pieceInstanceIdOrPieceIdToCopy}" is not a GRAPHICS item!`
				)

			const newPieceInstance = convertAdLibToPieceInstance(pieceToCopy, partInstance, false)
			if (newPieceInstance.piece.content && newPieceInstance.piece.content.timelineObjects) {
				newPieceInstance.piece.content.timelineObjects = prefixAllObjectIds(
					_.compact(
						_.map(newPieceInstance.piece.content.timelineObjects, (obj) => {
							return literal<TimelineObjGeneric>({
								...obj,
								// @ts-ignore _id
								_id: obj.id || obj._id,
								studioId: protectString(''), // set later
								objectType: TimelineObjType.RUNDOWN,
							})
						})
					),
					unprotectString(newPieceInstance._id)
				)
			}

			// Disable the original piece if from the same Part
			if (pieceInstanceToCopy && pieceInstanceToCopy.partInstanceId === partInstance._id) {
				const pieces = getResolvedPieces(cache, partInstance)
				const resolvedPieceBeingCopied = pieces.find((p) => p._id === pieceInstanceToCopy._id)

				// Ensure the piece being copied isnt currently live
				if (
					pieceInstanceToCopy.piece.startedPlayback &&
					pieceInstanceToCopy.piece.startedPlayback <= getCurrentTime()
				) {
					if (
						resolvedPieceBeingCopied &&
						resolvedPieceBeingCopied.piece.playoutDuration !== undefined &&
						(pieceInstanceToCopy.piece.infiniteMode ||
							pieceInstanceToCopy.piece.startedPlayback +
								resolvedPieceBeingCopied.piece.playoutDuration >=
								getCurrentTime())
					) {
						// logger.debug(`Piece "${piece._id}" is currently live and cannot be used as an ad-lib`)
						throw new Meteor.Error(
							409,
							`PieceInstance "${pieceInstanceToCopy._id}" is currently live and cannot be used as an ad-lib`
						)
					}
				}

				cache.PieceInstances.update(pieceInstanceToCopy._id, {
					$set: {
						'piece.disabled': true,
						'piece.hidden': true,
					},
				})
				// TODO-PartInstance - pending new data flow
				cache.Pieces.update(pieceInstanceToCopy.piece._id, {
					$set: {
						disabled: true,
						hidden: true,
					},
				})
			}

			cache.PieceInstances.insert(newPieceInstance)
			// TODO-PartInstance - pending new data flow
			cache.Pieces.insert(newPieceInstance.piece)

			cropInfinitesOnLayer(cache, rundown, partInstance, newPieceInstance) // todo: this one uses showStyleBase
			// stopInfinitesRunningOnLayer(cache, rundownPlaylist, rundown, partInstance, newPieceInstance.piece.sourceLayerId)
			updateSourceLayerInfinitesAfterPart(cache, rundown, partInstance.part)
			updateTimeline(cache, rundown.studioId)

			waitForPromise(cache.saveAllToDatabase())
		})
	}
	export function segmentAdLibPieceStart(
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		adLibPieceId: PieceId,
		queue: boolean
	) {
		return rundownPlaylistSyncFunction(rundownPlaylistId, RundownSyncFunctionPriority.USER_PLAYOUT, () => {
			const rundownPlaylist = RundownPlaylists.findOne(rundownPlaylistId)
			if (!rundownPlaylist) throw new Meteor.Error(404, `Rundown Playlist "${rundownPlaylistId}" not found!`)
			if (!rundownPlaylist.active)
				throw new Meteor.Error(403, `Part AdLib-pieces can be only placed in an active rundown!`)
			if (
				rundownPlaylist.holdState === RundownHoldState.ACTIVE ||
				rundownPlaylist.holdState === RundownHoldState.PENDING
			) {
				throw new Meteor.Error(403, `Part AdLib-pieces can not be used in combination with hold!`)
			}
			const cache = waitForPromise(initCacheForRundownPlaylist(rundownPlaylist))

			const partInstance = PartInstances.findOne(partInstanceId)
			if (!partInstance) throw new Meteor.Error(404, `PartInstance "${partInstanceId}" not found!`)
			const rundown = Rundowns.findOne(partInstance.rundownId)
			if (!rundown) throw new Meteor.Error(404, `Rundown "${partInstance.rundownId}" not found!`)
			if (rundown.playlistId !== rundownPlaylistId)
				throw new Meteor.Error(
					406,
					`Rundown "${rundown._id}" not a part of RundownPlaylist "${rundownPlaylistId}!"`
				)

			const adLibPiece = AdLibPieces.findOne({
				_id: adLibPieceId,
				rundownId: partInstance.rundownId,
			})
			if (!adLibPiece) throw new Meteor.Error(404, `Part Ad Lib Item "${adLibPieceId}" not found!`)
			if (adLibPiece.invalid)
				throw new Meteor.Error(404, `Cannot take invalid Part Ad Lib Item "${adLibPieceId}"!`)
			if (adLibPiece.floated)
				throw new Meteor.Error(404, `Cannot take floated Part Ad Lib Item "${adLibPieceId}"!`)

			if (!queue && rundownPlaylist.currentPartInstanceId !== partInstanceId)
				throw new Meteor.Error(403, `Part AdLib-pieces can be only placed in a currently playing part!`)

			innerStartOrQueueAdLibPiece(cache, rundownPlaylist, rundown, queue, partInstance, adLibPiece)

			waitForPromise(cache.saveAllToDatabase())
		})
	}
	export function rundownBaselineAdLibPieceStart(
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		baselineAdLibPieceId: PieceId,
		queue: boolean
	) {
		return rundownPlaylistSyncFunction(rundownPlaylistId, RundownSyncFunctionPriority.USER_PLAYOUT, () => {
			logger.debug('rundownBaselineAdLibPieceStart')

			const rundownPlaylist = RundownPlaylists.findOne(rundownPlaylistId)
			if (!rundownPlaylist) throw new Meteor.Error(404, `Rundown Playlist "${rundownPlaylistId}" not found!`)
			if (!rundownPlaylist.active)
				throw new Meteor.Error(403, `Rundown Baseline AdLib-pieces can be only placed in an active rundown!`)
			if (
				rundownPlaylist.holdState === RundownHoldState.ACTIVE ||
				rundownPlaylist.holdState === RundownHoldState.PENDING
			) {
				throw new Meteor.Error(403, `Part AdLib-pieces can not be used in combination with hold!`)
			}
			const cache = waitForPromise(initCacheForRundownPlaylist(rundownPlaylist))

			const partInstance = cache.PartInstances.findOne(partInstanceId)
			if (!partInstance) throw new Meteor.Error(404, `PartInstance "${partInstanceId}" not found!`)
			const rundown = cache.Rundowns.findOne(partInstance.rundownId)
			if (!rundown) throw new Meteor.Error(404, `Rundown "${partInstance.rundownId}" not found!`)
			if (rundown.playlistId !== rundownPlaylistId)
				throw new Meteor.Error(
					406,
					`Rundown "${rundown._id}" not a part of RundownPlaylist "${rundownPlaylistId}!"`
				)

			const adLibPiece = cache.RundownBaselineAdLibPieces.findOne({
				_id: baselineAdLibPieceId,
				rundownId: partInstance.rundownId,
			})
			if (!adLibPiece)
				throw new Meteor.Error(404, `Rundown Baseline Ad Lib Item "${baselineAdLibPieceId}" not found!`)
			if (!queue && rundownPlaylist.currentPartInstanceId !== partInstanceId)
				throw new Meteor.Error(
					403,
					`Rundown Baseline AdLib-pieces can be only placed in a currently playing part!`
				)

			innerStartOrQueueAdLibPiece(cache, rundownPlaylist, rundown, queue, partInstance, adLibPiece)

			waitForPromise(cache.saveAllToDatabase())
		})
	}
	function innerStartOrQueueAdLibPiece(
		cache: CacheForRundownPlaylist,
		rundownPlaylist: RundownPlaylist,
		rundown: Rundown,
		queue: boolean,
		currentPartInstance: PartInstance,
		adLibPiece: AdLibPiece | BucketAdLib
	) {
		if (queue || adLibPiece.toBeQueued) {
			const newPartInstance = new PartInstance({
				_id: getRandomId(),
				rundownId: rundown._id,
				segmentId: currentPartInstance.segmentId,
				takeCount: currentPartInstance.takeCount + 1,
				rehearsal: !!rundownPlaylist.rehearsal,
				part: new Part({
					_id: getRandomId(),
					_rank: 99999, // something high, so it will be placed after current part. The rank will be updated later to its correct value
					externalId: '',
					segmentId: currentPartInstance.segmentId,
					rundownId: rundown._id,
					title: adLibPiece.name,
					dynamicallyInserted: true,
					afterPart: currentPartInstance.part.afterPart || currentPartInstance.part._id,
					prerollDuration: adLibPiece.adlibPreroll,
					expectedDuration: adLibPiece.expectedDuration,
				}),
			})
			const newPieceInstance = convertAdLibToPieceInstance(adLibPiece, newPartInstance, queue)
			innerStartQueuedAdLib(cache, rundownPlaylist, rundown, currentPartInstance, newPartInstance, [
				newPieceInstance,
			])
		} else {
			const newPieceInstance = convertAdLibToPieceInstance(adLibPiece, currentPartInstance, queue)
			innerStartAdLibPiece(cache, rundownPlaylist, rundown, currentPartInstance, newPieceInstance)

			// TODO - I dont think this is necessary
			// stopInfinitesRunningOnLayer(cache, rundownPlaylist, rundown, currentPartInstance, newPieceInstance.piece.sourceLayerId)
		}

		// Update any infinites
		// TODO - this was done for queue, with stopInfinitesRunningOnLayer done for non-queue. This was weird..
		updateSourceLayerInfinitesAfterPart(cache, rundown, currentPartInstance.part)

		updateTimeline(cache, rundownPlaylist.studioId)
	}

	export function sourceLayerStickyPieceStart(rundownPlaylistId: RundownPlaylistId, sourceLayerId: string) {
		return rundownPlaylistSyncFunction(rundownPlaylistId, RundownSyncFunctionPriority.USER_PLAYOUT, () => {
			const playlist = RundownPlaylists.findOne(rundownPlaylistId)
			if (!playlist) throw new Meteor.Error(404, `Rundown "${rundownPlaylistId}" not found!`)
			if (!playlist.active) throw new Meteor.Error(403, `Pieces can be only manipulated in an active rundown!`)
			if (!playlist.currentPartInstanceId)
				throw new Meteor.Error(400, `A part needs to be active to place a sticky item`)

			const cache = waitForPromise(initCacheForRundownPlaylist(playlist))

			const currentPartInstance = cache.PartInstances.findOne(playlist.currentPartInstanceId)
			if (!currentPartInstance)
				throw new Meteor.Error(
					501,
					`Current PartInstance "${playlist.currentPartInstanceId}" could not be found.`
				)

			const rundown = cache.Rundowns.findOne(currentPartInstance.rundownId)
			if (!rundown)
				throw new Meteor.Error(501, `Current Rundown "${currentPartInstance.rundownId}" could not be found`)

			let showStyleBase = rundown.getShowStyleBase() // todo: database again

			const sourceLayer = showStyleBase.sourceLayers.find((i) => i._id === sourceLayerId)
			if (!sourceLayer) throw new Meteor.Error(404, `Source layer "${sourceLayerId}" not found!`)
			if (!sourceLayer.isSticky)
				throw new Meteor.Error(400, `Only sticky layers can be restarted. "${sourceLayerId}" is not sticky.`)

			const lastPieceInstance = innerFindLastPieceOnLayer(
				cache,
				playlist,
				sourceLayer._id,
				sourceLayer.stickyOriginalOnly || false
			)

			if (lastPieceInstance) {
				const lastPiece = convertPieceToAdLibPiece(lastPieceInstance.piece)
				innerStartOrQueueAdLibPiece(cache, playlist, rundown, false, currentPartInstance, lastPiece)
			}

			waitForPromise(cache.saveAllToDatabase())
		})
	}

	export function innerFindLastPieceOnLayer(
		cache: CacheForRundownPlaylist,
		rundownPlaylist: RundownPlaylist,
		sourceLayerId: string,
		originalOnly: boolean,
		customQuery?: MongoQuery<PieceInstance>
	) {
		const rundownIds = getRundownIDsFromCache(cache, rundownPlaylist)

		const query = {
			...customQuery,
			rundownId: { $in: rundownIds },
			'piece.sourceLayerId': sourceLayerId,
			'piece.startedPlayback': {
				$exists: true,
			},
		}

		if (originalOnly) {
			// Ignore adlibs if using original only
			query['piece.dynamicallyInserted'] = {
				$ne: true,
			}
		}

		// Note: This does not want to use the cache, as we want to search as far back as we can
		// TODO - will this cause problems?
		return PieceInstances.findOne(query, {
			sort: {
				// @ts-ignore deep property
				'piece.startedPlayback': -1,
			},
		})
	}

	export function innerStartQueuedAdLib(
		cache: CacheForRundownPlaylist,
		rundownPlaylist: RundownPlaylist,
		rundown: Rundown,
		currentPartInstance: PartInstance,
		newPartInstance: PartInstance,
		newPieceInstances: PieceInstance[]
	) {
		logger.info('adlibQueueInsertPartInstance')

		// check if there's already a queued part after this:
		// TODO-PartInstance - pending new data flow - the call to setNextPart will prune the partInstance, so this will not be needed
		const afterPartId = currentPartInstance.part.afterPart || currentPartInstance.part._id
		const alreadyQueuedPartInstance = cache.PartInstances.findOne(
			{
				rundownId: rundown._id,
				segmentId: currentPartInstance.segmentId,
				'part.afterPart': afterPartId,
				'part._rank': { $gt: currentPartInstance.part._rank },
			},
			{
				sort: { _id: -1 },
			}
		)
		if (alreadyQueuedPartInstance) {
			if (rundownPlaylist.currentPartInstanceId !== alreadyQueuedPartInstance._id) {
				cache.Parts.remove(alreadyQueuedPartInstance.part._id)
				cache.PartInstances.remove(alreadyQueuedPartInstance._id)
				cache.PieceInstances.remove({ partInstanceId: alreadyQueuedPartInstance._id })
				afterRemoveParts(cache, currentPartInstance.rundownId, [alreadyQueuedPartInstance.part])
			}
		}

		// Ensure it is labelled as dynamic
		newPartInstance.part.afterPart = afterPartId
		newPartInstance.part.dynamicallyInserted = true

		cache.PartInstances.insert(newPartInstance)
		// TODO-PartInstance - pending new data flow
		cache.Parts.insert(newPartInstance.part)

		newPieceInstances.forEach((pieceInstance) => {
			// Ensure it is labelled as dynamic
			pieceInstance.partInstanceId = newPartInstance._id
			pieceInstance.piece.partId = newPartInstance.part._id

			cache.PieceInstances.insert(pieceInstance)
			// TODO-PartInstance - pending new data flow
			cache.Pieces.insert(pieceInstance.piece)
		})

		updatePartRanks(cache, rundown)

		setNextPart(cache, rundownPlaylist, newPartInstance)
	}
	export function innerStartAdLibPiece(
		cache: CacheForRundownPlaylist,
		rundownPlaylist: RundownPlaylist,
		rundown: Rundown,
		existingPartInstance: PartInstance,
		newPieceInstance: PieceInstance
	) {
		// Ensure it is labelled as dynamic
		newPieceInstance.partInstanceId = existingPartInstance._id
		newPieceInstance.piece.partId = existingPartInstance.part._id
		newPieceInstance.piece.dynamicallyInserted = true

		cache.PieceInstances.insert(newPieceInstance)
		// TODO-PartInstance - pending new data flow
		cache.Pieces.insert(newPieceInstance.piece)

		cropInfinitesOnLayer(cache, rundown, existingPartInstance, newPieceInstance)
	}

	export function innerStopPieces(
		cache: CacheForRundownPlaylist,
		currentPartInstance: PartInstance,
		filter: (pieceInstance: PieceInstance) => boolean,
		timeOffset: number | undefined
	) {
		const changedInstances: PieceInstanceId[] = []

		const lastStartedPlayback = currentPartInstance.part.getLastStartedPlayback()
		if (lastStartedPlayback === undefined) {
			throw new Error('Cannot stop pieceInstances when partInstance hasnt started playback')
		}

		const orderedPieces = getResolvedPieces(cache, currentPartInstance)
		const stopAt = getCurrentTime() + (timeOffset || 0)
		const relativeStop = stopAt - lastStartedPlayback

		orderedPieces.forEach((pieceInstance) => {
			if (!pieceInstance.piece.userDuration && filter(pieceInstance)) {
				let newExpectedDuration: number | undefined = undefined

				if (pieceInstance.piece.infiniteId && pieceInstance.piece.infiniteId !== pieceInstance.piece._id) {
					newExpectedDuration = stopAt - lastStartedPlayback
				} else if (
					pieceInstance.piece.startedPlayback && // currently playing
					(pieceInstance.resolvedStart || 0) < relativeStop && // is relative, and has started
					!pieceInstance.piece.stoppedPlayback // and not yet stopped
				) {
					newExpectedDuration = stopAt - pieceInstance.piece.startedPlayback
				}

				if (newExpectedDuration !== undefined) {
					logger.info(
						`Blueprint action: Cropping PieceInstance "${pieceInstance._id}" to ${newExpectedDuration}`
					)

					cache.PieceInstances.update(
						{
							_id: pieceInstance._id,
						},
						{
							$set: {
								'piece.userDuration': {
									duration: newExpectedDuration,
								},
							},
						}
					)

					// TODO-PartInstance - pending new data flow
					cache.Pieces.update(
						{
							_id: pieceInstance.piece._id,
						},
						{
							$set: {
								userDuration: {
									duration: newExpectedDuration,
								},
							},
						}
					)

					changedInstances.push(pieceInstance._id)
				}
			}
		})

		return changedInstances
	}
	export function startBucketAdlibPiece(
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		bucketAdlibId: PieceId,
		queue: boolean
	) {
		const bucketAdlib = BucketAdLibs.findOne(bucketAdlibId)
		if (!bucketAdlib) throw new Meteor.Error(404, `Bucket Adlib "${bucketAdlibId}" not found!`)

		return rundownPlaylistSyncFunction(rundownPlaylistId, RundownSyncFunctionPriority.USER_PLAYOUT, () => {
			const rundownPlaylist = RundownPlaylists.findOne(rundownPlaylistId)
			if (!rundownPlaylist) throw new Meteor.Error(404, `Rundown Playlist "${rundownPlaylistId}" not found!`)
			if (!rundownPlaylist.active)
				throw new Meteor.Error(403, `Bucket AdLib-pieces can be only placed in an active rundown!`)
			if (!rundownPlaylist.currentPartInstanceId)
				throw new Meteor.Error(400, `A part needs to be active to use a bucket adlib`)
			if (
				rundownPlaylist.holdState === RundownHoldState.ACTIVE ||
				rundownPlaylist.holdState === RundownHoldState.PENDING
			) {
				throw new Meteor.Error(403, `Buckete AdLib-pieces can not be used in combination with hold!`)
			}

			const cache = waitForPromise(initCacheForRundownPlaylist(rundownPlaylist))
			if (!queue && rundownPlaylist.currentPartInstanceId !== partInstanceId)
				throw new Meteor.Error(403, `Part AdLib-pieces can be only placed in a currently playing part!`)

			const currentPartInstance = cache.PartInstances.findOne(rundownPlaylist.currentPartInstanceId)
			if (!currentPartInstance) throw new Meteor.Error(404, `PartInstance "${partInstanceId}" not found!`)
			const rundown = cache.Rundowns.findOne(currentPartInstance.rundownId)
			if (!rundown) throw new Meteor.Error(404, `Rundown "${currentPartInstance.rundownId}" not found!`)
			if (rundown.playlistId !== rundownPlaylistId)
				throw new Meteor.Error(
					406,
					`Rundown "${rundown._id}" not a part of RundownPlaylist "${rundownPlaylistId}!"`
				)

			if (
				bucketAdlib.showStyleVariantId !== rundown.showStyleVariantId ||
				bucketAdlib.studioId !== rundown.studioId
			) {
				throw new Meteor.Error(
					404,
					`Bucket AdLib "${bucketAdlibId}" is not compatible with rundown "${rundown._id}"!`
				)
			}

			const newPieceInstance = convertAdLibToPieceInstance(bucketAdlib, currentPartInstance, queue)
			innerStartAdLibPiece(cache, rundownPlaylist, rundown, currentPartInstance, newPieceInstance)

			waitForPromise(cache.saveAllToDatabase())
		})
	}
}
