import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'
import { SourceLayerType, PieceLifespan } from '@sofie-automation/blueprints-integration'
import {
	getCurrentTime,
	literal,
	protectString,
	unprotectString,
	getRandomId,
	assertNever,
	getRank,
} from '../../../lib/lib'
import { logger } from '../../../lib/logging'
import { RundownHoldState, Rundown } from '../../../lib/collections/Rundowns'
import { TimelineObjGeneric, TimelineObjType } from '../../../lib/collections/Timeline'
import { AdLibPieces, AdLibPiece } from '../../../lib/collections/AdLibPieces'
import { RundownPlaylistId } from '../../../lib/collections/RundownPlaylists'
import { Piece, PieceId, Pieces } from '../../../lib/collections/Pieces'
import { Part } from '../../../lib/collections/Parts'
import { prefixAllObjectIds, setNextPart, selectNextPart } from './lib'
import {
	convertAdLibToPieceInstance,
	getResolvedPieces,
	convertPieceToAdLibPiece,
	setupPieceInstanceInfiniteProperties,
} from './pieces'
import { updateTimeline } from './timeline'
import { updatePartInstanceRanks } from '../rundown'

import {
	PieceInstances,
	PieceInstance,
	PieceInstanceId,
	rewrapPieceToInstance,
} from '../../../lib/collections/PieceInstances'
import { PartInstance, PartInstanceId } from '../../../lib/collections/PartInstances'
import { BucketAdLib, BucketAdLibs } from '../../../lib/collections/BucketAdlibs'
import { MongoQuery } from '../../../lib/typings/meteor'
import { fetchPiecesThatMayBeActiveForPart, syncPlayheadInfinitesForNextPartInstance } from './infinites'
import { RundownAPI } from '../../../lib/api/rundown'
import { ShowStyleBase } from '../../../lib/collections/ShowStyleBases'
import { profiler } from '../profiler'
import { getPieceInstancesForPart } from './infinites'
import { PlayoutLockFunctionPriority, runPlayoutOperationWithCache } from './lockFunction'
import {
	CacheForPlayout,
	getOrderedSegmentsAndPartsFromPlayoutCache,
	getRundownIDsFromCache,
	getSelectedPartInstancesFromCache,
} from './cache'
import { ReadonlyDeep } from 'type-fest'
import { RundownBaselineAdLibPieces } from '../../../lib/collections/RundownBaselineAdLibPieces'
import { VerifiedRundownPlaylistContentAccess } from '../lib'

export namespace ServerPlayoutAdLibAPI {
	export function pieceTakeNow(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		pieceInstanceIdOrPieceIdToCopy: PieceInstanceId | PieceId
	) {
		return runPlayoutOperationWithCache(
			access,
			'pieceTakeNow',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			(cache) => {
				const playlist = cache.Playlist.doc
				if (!playlist.activationId)
					throw new Meteor.Error(403, `Part AdLib-pieces can be only placed in an active rundown!`)
				if (playlist.currentPartInstanceId !== partInstanceId)
					throw new Meteor.Error(403, `Part AdLib-pieces can be only placed in a current part!`)
			},
			async (cache) => {
				const playlist = cache.Playlist.doc
				if (!playlist.activationId)
					throw new Meteor.Error(403, `Part AdLib-pieces can be only placed in an active rundown!`)

				const rundownIds = getRundownIDsFromCache(cache)

				const pieceInstanceToCopy = cache.PieceInstances.findOne({
					_id: pieceInstanceIdOrPieceIdToCopy as PieceInstanceId,
					rundownId: { $in: rundownIds },
				})
				const pieceToCopy = pieceInstanceToCopy
					? pieceInstanceToCopy.piece
					: (Pieces.findOne({
							_id: pieceInstanceIdOrPieceIdToCopy as PieceId,
							startRundownId: { $in: rundownIds },
					  }) as Piece)
				if (!pieceToCopy) {
					throw new Meteor.Error(404, `PieceInstance or Piece "${pieceInstanceIdOrPieceIdToCopy}" not found!`)
				}

				const partInstance = cache.PartInstances.findOne(partInstanceId)
				if (!partInstance) throw new Meteor.Error(404, `PartInstance "${partInstanceId}" not found!`)

				const rundown = cache.Rundowns.findOne(partInstance.rundownId)
				if (!rundown) throw new Meteor.Error(404, `Rundown "${partInstance.rundownId}" not found!`)

				const showStyleBase = rundown.getShowStyleBase() // todo: database
				const sourceLayer = showStyleBase.sourceLayers.find((i) => i._id === pieceToCopy.sourceLayerId)
				if (sourceLayer && (sourceLayer.type !== SourceLayerType.LOWER_THIRD || sourceLayer.exclusiveGroup))
					throw new Meteor.Error(
						403,
						`PieceInstance or Piece "${pieceInstanceIdOrPieceIdToCopy}" is not a LOWER_THIRD item!`
					)

				const newPieceInstance = convertAdLibToPieceInstance(
					playlist.activationId,
					pieceToCopy,
					partInstance,
					false
				)
				if (newPieceInstance.piece.content && newPieceInstance.piece.content.timelineObjects) {
					newPieceInstance.piece.content.timelineObjects = prefixAllObjectIds(
						_.map(newPieceInstance.piece.content.timelineObjects, (obj) => {
							return literal<TimelineObjGeneric>({
								...obj,
								// @ts-ignore _id
								_id: obj.id || obj._id,
								studioId: protectString(''), // set later
								objectType: TimelineObjType.RUNDOWN,
							})
						}),
						unprotectString(newPieceInstance._id)
					)
				}

				// Disable the original piece if from the same Part
				if (pieceInstanceToCopy && pieceInstanceToCopy.partInstanceId === partInstance._id) {
					// Ensure the piece being copied isnt currently live
					if (
						pieceInstanceToCopy.startedPlayback &&
						pieceInstanceToCopy.startedPlayback <= getCurrentTime()
					) {
						const resolvedPieces = getResolvedPieces(cache, showStyleBase, partInstance)
						const resolvedPieceBeingCopied = resolvedPieces.find((p) => p._id === pieceInstanceToCopy._id)

						if (
							resolvedPieceBeingCopied &&
							resolvedPieceBeingCopied.resolvedDuration !== undefined &&
							(resolvedPieceBeingCopied.infinite ||
								resolvedPieceBeingCopied.resolvedStart + resolvedPieceBeingCopied.resolvedDuration >=
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
							disabled: true,
							hidden: true,
						},
					})
				}

				cache.PieceInstances.insert(newPieceInstance)

				await syncPlayheadInfinitesForNextPartInstance(cache)

				await updateTimeline(cache)
			}
		)
	}
	export function segmentAdLibPieceStart(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		adLibPieceId: PieceId,
		queue: boolean
	) {
		return runPlayoutOperationWithCache(
			access,
			'segmentAdLibPieceStart',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			(cache) => {
				const playlist = cache.Playlist.doc
				if (!playlist.activationId)
					throw new Meteor.Error(403, `Part AdLib-pieces can be only placed in an active rundown!`)
				if (playlist.holdState === RundownHoldState.ACTIVE || playlist.holdState === RundownHoldState.PENDING) {
					throw new Meteor.Error(403, `Part AdLib-pieces can not be used in combination with hold!`)
				}

				if (!queue && playlist.currentPartInstanceId !== partInstanceId)
					throw new Meteor.Error(403, `Part AdLib-pieces can be only placed in a currently playing part!`)
			},
			async (cache) => {
				const partInstance = cache.PartInstances.findOne(partInstanceId)
				if (!partInstance) throw new Meteor.Error(404, `PartInstance "${partInstanceId}" not found!`)
				const rundown = cache.Rundowns.findOne(partInstance.rundownId)
				if (!rundown) throw new Meteor.Error(404, `Rundown "${partInstance.rundownId}" not found!`)

				const adLibPiece = AdLibPieces.findOne({
					_id: adLibPieceId,
					rundownId: partInstance.rundownId,
				})
				if (!adLibPiece) throw new Meteor.Error(404, `Part Ad Lib Item "${adLibPieceId}" not found!`)
				if (adLibPiece.invalid)
					throw new Meteor.Error(404, `Cannot take invalid Part Ad Lib Item "${adLibPieceId}"!`)
				if (adLibPiece.floated)
					throw new Meteor.Error(404, `Cannot take floated Part Ad Lib Item "${adLibPieceId}"!`)

				await innerStartOrQueueAdLibPiece(cache, rundown, queue, partInstance, adLibPiece)
			}
		)
	}
	export function rundownBaselineAdLibPieceStart(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		baselineAdLibPieceId: PieceId,
		queue: boolean
	) {
		return runPlayoutOperationWithCache(
			access,
			'rundownBaselineAdLibPieceStart',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			(cache) => {
				logger.debug('rundownBaselineAdLibPieceStart')

				const playlist = cache.Playlist.doc
				if (!playlist.activationId)
					throw new Meteor.Error(
						403,
						`Rundown Baseline AdLib-pieces can be only placed in an active rundown!`
					)
				if (playlist.holdState === RundownHoldState.ACTIVE || playlist.holdState === RundownHoldState.PENDING) {
					throw new Meteor.Error(403, `Part AdLib-pieces can not be used in combination with hold!`)
				}

				if (!queue && playlist.currentPartInstanceId !== partInstanceId)
					throw new Meteor.Error(
						403,
						`Rundown Baseline AdLib-pieces can be only placed in a currently playing part!`
					)
			},
			async (cache) => {
				const partInstance = cache.PartInstances.findOne(partInstanceId)
				if (!partInstance) throw new Meteor.Error(404, `PartInstance "${partInstanceId}" not found!`)
				const rundown = cache.Rundowns.findOne(partInstance.rundownId)
				if (!rundown) throw new Meteor.Error(404, `Rundown "${partInstance.rundownId}" not found!`)

				const adLibPiece = RundownBaselineAdLibPieces.findOne({
					_id: baselineAdLibPieceId,
					rundownId: partInstance.rundownId,
				})
				if (!adLibPiece)
					throw new Meteor.Error(404, `Rundown Baseline Ad Lib Item "${baselineAdLibPieceId}" not found!`)

				await innerStartOrQueueAdLibPiece(cache, rundown, queue, partInstance, adLibPiece)
			}
		)
	}
	async function innerStartOrQueueAdLibPiece(
		cache: CacheForPlayout,
		rundown: Rundown,
		queue: boolean,
		currentPartInstance: PartInstance,
		adLibPiece: AdLibPiece | BucketAdLib
	) {
		const playlist = cache.Playlist.doc
		if (!playlist.activationId) throw new Meteor.Error(500, 'RundownPlaylist is not active')

		const span = profiler.startSpan('innerStartOrQueueAdLibPiece')
		if (queue || adLibPiece.toBeQueued) {
			const newPartInstance = new PartInstance({
				_id: getRandomId(),
				rundownId: rundown._id,
				segmentId: currentPartInstance.segmentId,
				playlistActivationId: playlist.activationId,
				segmentPlayoutId: currentPartInstance.segmentPlayoutId,
				takeCount: currentPartInstance.takeCount + 1,
				rehearsal: !!playlist.rehearsal,
				orphaned: 'adlib-part',
				part: new Part({
					_id: getRandomId(),
					_rank: 99999, // Corrected in innerStartQueuedAdLib
					externalId: '',
					segmentId: currentPartInstance.segmentId,
					rundownId: rundown._id,
					title: adLibPiece.name,
					prerollDuration: adLibPiece.adlibPreroll,
					expectedDuration: adLibPiece.expectedDuration,
				}),
			})
			const newPieceInstance = convertAdLibToPieceInstance(
				playlist.activationId,
				adLibPiece,
				newPartInstance,
				queue
			)
			await innerStartQueuedAdLib(cache, rundown, currentPartInstance, newPartInstance, [newPieceInstance])

			// syncPlayheadInfinitesForNextPartInstance is handled by setNextPart
		} else {
			const newPieceInstance = convertAdLibToPieceInstance(
				playlist.activationId,
				adLibPiece,
				currentPartInstance,
				queue
			)
			innerStartAdLibPiece(cache, rundown, currentPartInstance, newPieceInstance)

			await syncPlayheadInfinitesForNextPartInstance(cache)
		}

		await updateTimeline(cache)

		if (span) span.end()
	}

	export function sourceLayerStickyPieceStart(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId,
		sourceLayerId: string
	) {
		return runPlayoutOperationWithCache(
			access,
			'sourceLayerStickyPieceStart',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			(cache) => {
				const playlist = cache.Playlist.doc
				if (!playlist) throw new Meteor.Error(404, `Rundown "${rundownPlaylistId}" not found!`)
				if (!playlist.activationId)
					throw new Meteor.Error(403, `Pieces can be only manipulated in an active rundown!`)
				if (!playlist.currentPartInstanceId)
					throw new Meteor.Error(400, `A part needs to be active to place a sticky item`)
			},
			async (cache) => {
				const playlist = cache.Playlist.doc

				const { currentPartInstance } = getSelectedPartInstancesFromCache(cache)
				if (!currentPartInstance)
					throw new Meteor.Error(
						501,
						`Current PartInstance "${playlist.currentPartInstanceId}" could not be found.`
					)

				const rundown = cache.Rundowns.findOne(currentPartInstance.rundownId)
				if (!rundown)
					throw new Meteor.Error(501, `Current Rundown "${currentPartInstance.rundownId}" could not be found`)

				const showStyleBase = await cache.activationCache.getShowStyleBase(rundown)

				const sourceLayer = showStyleBase.sourceLayers.find((i) => i._id === sourceLayerId)
				if (!sourceLayer) throw new Meteor.Error(404, `Source layer "${sourceLayerId}" not found!`)
				if (!sourceLayer.isSticky)
					throw new Meteor.Error(
						400,
						`Only sticky layers can be restarted. "${sourceLayerId}" is not sticky.`
					)

				const lastPieceInstance = innerFindLastPieceOnLayer(
					cache,
					[sourceLayer._id],
					sourceLayer.stickyOriginalOnly || false
				)

				if (lastPieceInstance) {
					const lastPiece = convertPieceToAdLibPiece(lastPieceInstance.piece)
					await innerStartOrQueueAdLibPiece(cache, rundown, false, currentPartInstance, lastPiece)
				}
			}
		)
	}

	export function innerFindLastPieceOnLayer(
		cache: CacheForPlayout,
		sourceLayerId: string[],
		originalOnly: boolean,
		customQuery?: MongoQuery<PieceInstance>
	) {
		const span = profiler.startSpan('innerFindLastPieceOnLayer')
		const rundownIds = getRundownIDsFromCache(cache)

		const query = {
			...customQuery,
			playlistActivationId: cache.Playlist.doc.activationId,
			rundownId: { $in: rundownIds },
			'piece.sourceLayerId': { $in: sourceLayerId },
			startedPlayback: {
				$exists: true,
			},
		}

		if (originalOnly) {
			// Ignore adlibs if using original only
			query.dynamicallyInserted = {
				$exists: false,
			}
		}

		if (span) span.end()

		// Note: This does not want to use the cache, as we want to search as far back as we can
		// TODO - will this cause problems?
		return PieceInstances.findOne(query, {
			sort: {
				startedPlayback: -1,
			},
		})
	}

	export function innerFindLastScriptedPieceOnLayer(
		cache: CacheForPlayout,
		sourceLayerId: string[],
		customQuery?: MongoQuery<Piece>
	) {
		const span = profiler.startSpan('innerFindLastScriptedPieceOnLayer')

		const playlist = cache.Playlist.doc
		const rundownIds = getRundownIDsFromCache(cache)

		if (!playlist.currentPartInstanceId || !playlist.activationId) {
			return
		}

		const currentPartInstance = cache.PartInstances.findOne(playlist.currentPartInstanceId)

		if (!currentPartInstance) {
			return
		}

		const query = {
			...customQuery,
			startRundownId: { $in: rundownIds },
			sourceLayerId: { $in: sourceLayerId },
		}

		const pieces = Pieces.find(query, { fields: { _id: 1, startPartId: 1, enable: 1 } }).fetch()

		const part = cache.Parts.findOne(
			{ _id: { $in: pieces.map((p) => p.startPartId) }, _rank: { $lte: currentPartInstance.part._rank } },
			{ sort: { _rank: -1 } }
		)

		if (!part) {
			return
		}

		const partStarted = currentPartInstance.timings?.startedPlayback
		const nowInPart = partStarted ? getCurrentTime() - partStarted : 0

		const piece = pieces
			.filter((p) => p.startPartId === part._id && (p.enable.start === 'now' || p.enable.start <= nowInPart))
			.sort((a, b) => {
				if (a.enable.start === 'now' && b.enable.start === 'now') return 0
				if (a.enable.start === 'now') return -1
				if (b.enable.start === 'now') return 1

				return b.enable.start - a.enable.start
			})[0]

		if (span) span.end()

		return piece
	}

	export async function innerStartQueuedAdLib(
		cache: CacheForPlayout,
		rundown: Rundown,
		currentPartInstance: PartInstance,
		newPartInstance: PartInstance,
		newPieceInstances: PieceInstance[]
	) {
		const span = profiler.startSpan('innerStartQueuedAdLib')
		logger.info('adlibQueueInsertPartInstance')

		// Ensure it is labelled as dynamic
		newPartInstance.orphaned = 'adlib-part'

		const followingPart = selectNextPart(
			cache.Playlist.doc,
			currentPartInstance,
			getOrderedSegmentsAndPartsFromPlayoutCache(cache),
			true
		)
		newPartInstance.part._rank = getRank(
			currentPartInstance.part,
			followingPart?.part?.segmentId === newPartInstance.segmentId ? followingPart?.part : undefined
		)

		cache.PartInstances.insert(newPartInstance)

		newPieceInstances.forEach((pieceInstance) => {
			// Ensure it is labelled as dynamic
			pieceInstance.dynamicallyInserted = getCurrentTime()
			pieceInstance.partInstanceId = newPartInstance._id
			pieceInstance.piece.startPartId = newPartInstance.part._id

			setupPieceInstanceInfiniteProperties(pieceInstance)

			cache.PieceInstances.insert(pieceInstance)
		})

		updatePartInstanceRanks(cache, [{ segmentId: newPartInstance.part.segmentId, oldPartIdsAndRanks: null }])

		// Find and insert any rundown defined infinites that we should inherit
		newPartInstance = cache.PartInstances.findOne(newPartInstance._id)!
		const possiblePieces = await fetchPiecesThatMayBeActiveForPart(cache, undefined, newPartInstance.part)
		const infinitePieceInstances = getPieceInstancesForPart(
			cache,
			currentPartInstance,
			rundown,
			newPartInstance.part,
			possiblePieces,
			newPartInstance._id,
			false
		)
		for (const pieceInstance of infinitePieceInstances) {
			cache.PieceInstances.insert(pieceInstance)
		}

		setNextPart(cache, newPartInstance)

		if (span) span.end()
	}

	export function innerStartAdLibPiece(
		cache: CacheForPlayout,
		rundown: Rundown,
		existingPartInstance: PartInstance,
		newPieceInstance: PieceInstance
	) {
		const span = profiler.startSpan('innerStartAdLibPiece')
		// Ensure it is labelled as dynamic
		newPieceInstance.partInstanceId = existingPartInstance._id
		newPieceInstance.piece.startPartId = existingPartInstance.part._id
		newPieceInstance.dynamicallyInserted = getCurrentTime()

		setupPieceInstanceInfiniteProperties(newPieceInstance)

		// exclusiveGroup is handled at runtime by processAndPrunePieceInstanceTimings

		cache.PieceInstances.insert(newPieceInstance)
		if (span) span.end()
	}

	export function innerStopPieces(
		cache: CacheForPlayout,
		showStyleBase: ReadonlyDeep<ShowStyleBase>,
		currentPartInstance: PartInstance,
		filter: (pieceInstance: PieceInstance) => boolean,
		timeOffset: number | undefined
	) {
		const span = profiler.startSpan('innerStopPieces')
		const stoppedInstances: PieceInstanceId[] = []

		const lastStartedPlayback = currentPartInstance.timings?.startedPlayback
		if (lastStartedPlayback === undefined) {
			throw new Error('Cannot stop pieceInstances when partInstance hasnt started playback')
		}

		const resolvedPieces = getResolvedPieces(cache, showStyleBase, currentPartInstance)
		const stopAt = getCurrentTime() + (timeOffset || 0)
		const relativeStopAt = stopAt - lastStartedPlayback

		const stoppedInfiniteIds = new Set<PieceId>()

		for (const pieceInstance of resolvedPieces) {
			if (
				!pieceInstance.userDuration &&
				!pieceInstance.piece.virtual &&
				filter(pieceInstance) &&
				pieceInstance.resolvedStart !== undefined &&
				pieceInstance.resolvedStart <= relativeStopAt &&
				!pieceInstance.stoppedPlayback
			) {
				switch (pieceInstance.piece.lifespan) {
					case PieceLifespan.WithinPart:
					case PieceLifespan.OutOnSegmentChange:
					case PieceLifespan.OutOnRundownChange: {
						logger.info(`Blueprint action: Cropping PieceInstance "${pieceInstance._id}" to ${stopAt}`)
						const up: Partial<PieceInstance> = {
							userDuration: {
								end: relativeStopAt,
							},
						}
						if (pieceInstance.infinite) {
							stoppedInfiniteIds.add(pieceInstance.infinite.infinitePieceId)
						}

						cache.PieceInstances.update(
							{
								_id: pieceInstance._id,
							},
							{
								$set: up,
							}
						)

						stoppedInstances.push(pieceInstance._id)
						break
					}
					case PieceLifespan.OutOnSegmentEnd:
					case PieceLifespan.OutOnRundownEnd:
					case PieceLifespan.OutOnShowStyleEnd: {
						logger.info(
							`Blueprint action: Cropping PieceInstance "${pieceInstance._id}" to ${stopAt} with a virtual`
						)

						const pieceId: PieceId = getRandomId()
						cache.PieceInstances.insert({
							...rewrapPieceToInstance(
								{
									_id: pieceId,
									externalId: '-',
									enable: { start: relativeStopAt },
									lifespan: pieceInstance.piece.lifespan,
									sourceLayerId: pieceInstance.piece.sourceLayerId,
									outputLayerId: pieceInstance.piece.outputLayerId,
									invalid: false,
									name: '',
									startPartId: currentPartInstance.part._id,
									status: RundownAPI.PieceStatusCode.UNKNOWN,
									virtual: true,
									content: {
										timelineObjects: [],
									},
								},
								currentPartInstance.playlistActivationId,
								currentPartInstance.rundownId,
								currentPartInstance._id
							),
							dynamicallyInserted: getCurrentTime(),
							infinite: {
								infiniteInstanceId: getRandomId(),
								infinitePieceId: pieceId,
								fromPreviousPart: false,
							},
						})

						stoppedInstances.push(pieceInstance._id)
						break
					}
					default:
						assertNever(pieceInstance.piece.lifespan)
				}
			}
		}

		if (span) span.end()
		return stoppedInstances
	}
	export function startBucketAdlibPiece(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		bucketAdlibId: PieceId,
		queue: boolean
	) {
		const bucketAdlib = BucketAdLibs.findOne(bucketAdlibId)
		if (!bucketAdlib) throw new Meteor.Error(404, `Bucket Adlib "${bucketAdlibId}" not found!`)

		return runPlayoutOperationWithCache(
			access,
			'startBucketAdlibPiece',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			(cache) => {
				const playlist = cache.Playlist.doc
				if (!playlist) throw new Meteor.Error(404, `Rundown Playlist "${rundownPlaylistId}" not found!`)
				if (!playlist.activationId)
					throw new Meteor.Error(403, `Bucket AdLib-pieces can be only placed in an active rundown!`)
				if (!playlist.currentPartInstanceId)
					throw new Meteor.Error(400, `A part needs to be active to use a bucket adlib`)
				if (playlist.holdState === RundownHoldState.ACTIVE || playlist.holdState === RundownHoldState.PENDING) {
					throw new Meteor.Error(403, `Buckete AdLib-pieces can not be used in combination with hold!`)
				}
				if (!queue && playlist.currentPartInstanceId !== partInstanceId)
					throw new Meteor.Error(403, `Part AdLib-pieces can be only placed in a currently playing part!`)
			},
			async (cache) => {
				const { currentPartInstance } = getSelectedPartInstancesFromCache(cache)
				if (!currentPartInstance) throw new Meteor.Error(404, `PartInstance "${partInstanceId}" not found!`)
				const rundown = cache.Rundowns.findOne(currentPartInstance.rundownId)
				if (!rundown) throw new Meteor.Error(404, `Rundown "${currentPartInstance.rundownId}" not found!`)

				if (
					bucketAdlib.showStyleVariantId !== rundown.showStyleVariantId ||
					bucketAdlib.studioId !== rundown.studioId
				) {
					throw new Meteor.Error(
						404,
						`Bucket AdLib "${bucketAdlibId}" is not compatible with rundown "${rundown._id}"!`
					)
				}

				await innerStartOrQueueAdLibPiece(cache, rundown, queue, currentPartInstance, bucketAdlib)
			}
		)
	}
}
