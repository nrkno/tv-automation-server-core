/* tslint:disable:no-use-before-declare */
import { Meteor } from 'meteor/meteor'
import { Rundown, RundownHoldState, Rundowns } from '../../../lib/collections/Rundowns'
import { Part, DBPart, PartId } from '../../../lib/collections/Parts'
import { PieceId } from '../../../lib/collections/Pieces'
import {
	getCurrentTime,
	Time,
	normalizeArrayToMap,
	unprotectString,
	isStringOrProtectedString,
	getRandomId,
} from '../../../lib/lib'
import { StatObjectMetadata } from '../../../lib/collections/Timeline'
import { Segment, SegmentId } from '../../../lib/collections/Segments'
import * as _ from 'underscore'
import { logger } from '../../logging'
import { Studios, StudioId, StudioRouteBehavior } from '../../../lib/collections/Studios'
import { PartHoldMode } from '@sofie-automation/blueprints-integration'
import { ClientAPI } from '../../../lib/api/client'
import {
	reportPartInstanceHasStarted,
	reportPieceHasStarted,
	reportPartInstanceHasStopped,
	reportPieceHasStopped,
} from '../blueprints/events'
import { Blueprints } from '../../../lib/collections/Blueprints'
import { RundownPlaylist, RundownPlaylistId } from '../../../lib/collections/RundownPlaylists'
import { loadShowStyleBlueprint } from '../blueprints/cache'
import { ActionExecutionContext, ActionPartChange } from '../blueprints/context/adlibActions'
import { updateStudioTimeline, updateTimeline } from './timeline'
import {
	resetRundownPlaylist as libResetRundownPlaylist,
	setNextPart as libsetNextPart,
	setNextSegment as libSetNextSegment,
	onPartHasStoppedPlaying,
	selectNextPart,
} from './lib'
import {
	prepareStudioForBroadcast,
	activateRundownPlaylist as libActivateRundownPlaylist,
	deactivateRundownPlaylist as libDeactivateRundownPlaylist,
	deactivateRundownPlaylistInner,
	standDownStudio,
} from './actions'
import { sortPieceInstancesByStart } from './pieces'
import { PackageInfo } from '../../coreSystem'
import { getActiveRundownPlaylistsInStudioFromDb } from '../studio/lib'
import { ServerPlayoutAdLibAPI } from './adlib'
import { PieceInstances, PieceInstance, PieceInstanceId } from '../../../lib/collections/PieceInstances'
import { PartInstances, PartInstance, PartInstanceId } from '../../../lib/collections/PartInstances'
import { MethodContext } from '../../../lib/api/methods'
import { triggerWriteAccessBecauseNoCheckNecessary } from '../../security/lib/securityVerify'
import { StudioContentWriteAccess } from '../../security/studio'
import {
	afterTake,
	resetPreviousSegmentAndClearNextSegmentId,
	takeNextPartInnerSync,
	updatePartInstanceOnTake,
} from './take'
import { syncPlayheadInfinitesForNextPartInstance } from './infinites'
import { check, Match } from '../../../lib/check'
import { Settings } from '../../../lib/Settings'
import { ShowStyleBases } from '../../../lib/collections/ShowStyleBases'
import {
	runPlayoutOperationWithLock,
	runPlayoutOperationWithCacheFromStudioOperation,
	runPlayoutOperationWithCache,
	PlayoutLockFunctionPriority,
} from './lockFunction'
import { CacheForPlayout, getOrderedSegmentsAndPartsFromPlayoutCache, getSelectedPartInstancesFromCache } from './cache'
import { PeripheralDevice } from '../../../lib/collections/PeripheralDevices'
import { runStudioOperationWithCache, StudioLockFunctionPriority } from '../studio/lockFunction'
import { CacheForStudio } from '../studio/cache'
import { VerifiedRundownPlaylistContentAccess } from '../lib'
import { WatchedPackagesHelper } from '../blueprints/context/watchedPackages'
import { ExpectedPackageDBType } from '../../../lib/collections/ExpectedPackages'
import { AdLibActionId } from '../../../lib/collections/AdLibActions'
import { RundownBaselineAdLibActionId } from '../../../lib/collections/RundownBaselineAdLibActions'
import { profiler } from '../profiler'

/**
 * debounce time in ms before we accept another report of "Part started playing that was not selected by core"
 */
const INCORRECT_PLAYING_PART_DEBOUNCE = 5000

export namespace ServerPlayoutAPI {
	/**
	 * Prepare the rundown for transmission
	 * To be triggered well before the broadcast, since it may take time and cause outputs to flicker
	 */
	export async function prepareRundownPlaylistForBroadcast(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId
	): Promise<void> {
		return runPlayoutOperationWithCache(
			access,
			'prepareRundownPlaylistForBroadcast',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			async (cache) => {
				const playlist = cache.Playlist.doc
				if (playlist.activationId)
					throw new Meteor.Error(404, `rundownPrepareForBroadcast cannot be run on an active rundown!`)

				const anyOtherActiveRundowns = await getActiveRundownPlaylistsInStudioFromDb(
					playlist.studioId,
					playlist._id
				)
				if (anyOtherActiveRundowns.length) {
					// logger.warn('Only one rundown can be active at the same time. Active rundowns: ' + _.map(anyOtherActiveRundowns, rundown => rundown._id))
					throw new Meteor.Error(
						409,
						'Only one rundown can be active at the same time. Active rundowns: ' +
							anyOtherActiveRundowns.map((rundown) => rundown._id)
					)
				}
			},
			async (cache) => {
				await libResetRundownPlaylist(cache)
				await prepareStudioForBroadcast(cache, true)

				await libActivateRundownPlaylist(cache, true) // Activate rundownPlaylist (rehearsal)
			}
		)
	}
	/**
	 * Reset the broadcast, to be used during testing.
	 * The User might have run through the rundown and wants to start over and try again
	 */
	export async function resetRundownPlaylist(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId
	): Promise<void> {
		return runPlayoutOperationWithCache(
			access,
			'resetRundownPlaylist',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			async (cache) => {
				const playlist = cache.Playlist.doc
				if (playlist.activationId && !playlist.rehearsal && !Settings.allowRundownResetOnAir)
					throw new Meteor.Error(401, `resetRundownPlaylist can only be run in rehearsal!`)
			},
			async (cache) => {
				await libResetRundownPlaylist(cache)

				if (cache.Playlist.doc.activationId) {
					// Only update the timeline if this is the active playlist
					await updateTimeline(cache)
				}
			}
		)
	}
	/**
	 * Activate the rundown, final preparations before going on air
	 * To be triggered by the User a short while before going on air
	 */
	export async function resetAndActivateRundownPlaylist(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId,
		rehearsal?: boolean
	): Promise<void> {
		return runPlayoutOperationWithCache(
			access,
			'resetAndActivateRundownPlaylist',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			async (cache) => {
				const playlist = cache.Playlist.doc
				if (playlist.activationId && !playlist.rehearsal && !Settings.allowRundownResetOnAir)
					throw new Meteor.Error(402, `resetAndActivateRundownPlaylist cannot be run when active!`)
			},
			async (cache) => {
				await libResetRundownPlaylist(cache)

				await prepareStudioForBroadcast(cache, true)

				await libActivateRundownPlaylist(cache, !!rehearsal) // Activate rundown
			}
		)
	}
	/**
	 * Activate the rundownPlaylist, decativate any other running rundowns
	 */
	export async function forceResetAndActivateRundownPlaylist(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId,
		rehearsal: boolean
	): Promise<void> {
		check(rehearsal, Boolean)
		return runPlayoutOperationWithCache(
			access,
			'forceResetAndActivateRundownPlaylist',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			async (cache) => {
				const playlist = cache.Playlist.doc

				const anyOtherActivePlaylists = await getActiveRundownPlaylistsInStudioFromDb(
					playlist.studioId,
					playlist._id
				)
				if (anyOtherActivePlaylists.length > 0) {
					const errors: any[] = []
					// Try deactivating everything in parallel, although there should only ever be one active
					await Promise.allSettled(
						anyOtherActivePlaylists.map(async (otherRundownPlaylist) =>
							runPlayoutOperationWithCacheFromStudioOperation(
								'forceResetAndActivateRundownPlaylist',
								cache,
								otherRundownPlaylist,
								PlayoutLockFunctionPriority.USER_PLAYOUT,
								null,
								async (otherCache) => {
									await deactivateRundownPlaylistInner(otherCache)
								}
							).catch((e) => errors.push(e))
						)
					)
					if (errors.length > 0) {
						// Ok, something went wrong, but check if the active rundowns where deactivated?
						const anyOtherActivePlaylistsStill = await getActiveRundownPlaylistsInStudioFromDb(
							playlist.studioId,
							playlist._id
						)
						if (anyOtherActivePlaylistsStill.length) {
							// No they weren't, we can't continue..
							throw errors.join(',')
						} else {
							// They where deactivated, log the error and continue
							logger.error(errors.join(','))
						}
					}
				}
			},
			async (cache) => {
				await libResetRundownPlaylist(cache)

				await prepareStudioForBroadcast(cache, true)

				await libActivateRundownPlaylist(cache, rehearsal)
			}
		)
	}
	/**
	 * Only activate the rundown, don't reset anything
	 */
	export async function activateRundownPlaylist(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId,
		rehearsal: boolean
	): Promise<void> {
		check(rehearsal, Boolean)
		return runPlayoutOperationWithCache(
			access,
			'activateRundownPlaylist',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			null,
			async (cache) => {
				await prepareStudioForBroadcast(cache, true)

				await libActivateRundownPlaylist(cache, rehearsal)
			}
		)
	}
	/**
	 * Deactivate the rundown
	 */
	export async function deactivateRundownPlaylist(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId
	): Promise<void> {
		return runPlayoutOperationWithCache(
			access,
			'deactivateRundownPlaylist',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			null,
			async (cache) => {
				await standDownStudio(cache, true)

				await libDeactivateRundownPlaylist(cache)
			}
		)
	}
	/**
	 * Take the currently Next:ed Part (start playing it)
	 */
	export async function takeNextPart(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId
	): Promise<ClientAPI.ClientResponse<void>> {
		check(rundownPlaylistId, String)

		const now = getCurrentTime()

		return runPlayoutOperationWithCache(
			access,
			'takeNextPartInner',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			null,
			async (cache) => {
				return takeNextPartInnerSync(cache, now)
			}
		)
	}

	export async function setNextPart(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId,
		nextPartId: PartId | null,
		setManually?: boolean,
		nextTimeOffset?: number | undefined
	): Promise<ClientAPI.ClientResponse<void>> {
		check(rundownPlaylistId, String)
		if (nextPartId) check(nextPartId, String)

		return runPlayoutOperationWithCache(
			access,
			'setNextPart',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			async (cache) => {
				const playlist = cache.Playlist.doc
				if (!playlist.activationId)
					throw new Meteor.Error(501, `RundownPlaylist "${playlist._id}" is not active!`)

				if (playlist.holdState && playlist.holdState !== RundownHoldState.COMPLETE)
					throw new Meteor.Error(501, `RundownPlaylist "${playlist._id}" cannot change next during hold!`)
			},
			async (cache) => {
				await setNextPartInner(cache, nextPartId, setManually, nextTimeOffset)

				return ClientAPI.responseSuccess(undefined)
			}
		)
	}

	export async function setNextPartInner(
		cache: CacheForPlayout,
		nextPartId: PartId | DBPart | null,
		setManually?: boolean,
		nextTimeOffset?: number | undefined
	): Promise<void> {
		const playlist = cache.Playlist.doc
		if (!playlist.activationId) throw new Meteor.Error(501, `Rundown Playlist "${playlist._id}" is not active!`)
		if (playlist.holdState && playlist.holdState !== RundownHoldState.COMPLETE)
			throw new Meteor.Error(501, `Rundown "${playlist._id}" cannot change next during hold!`)

		let nextPart: DBPart | null = null
		if (nextPartId) {
			if (isStringOrProtectedString(nextPartId)) {
				nextPart = cache.Parts.findOne(nextPartId) || null
			} else if (_.isObject(nextPartId)) {
				nextPart = nextPartId
			}
			if (!nextPart) throw new Meteor.Error(404, `Part "${nextPartId}" not found!`)
		}

		await libsetNextPart(cache, nextPart ? { part: nextPart } : null, setManually, nextTimeOffset)

		// update lookahead and the next part when we have an auto-next
		await updateTimeline(cache)
	}
	export async function moveNextPart(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId,
		partDelta: number,
		segmentDelta: number
	): Promise<PartId | null> {
		check(rundownPlaylistId, String)
		check(partDelta, Number)
		check(segmentDelta, Number)

		return runPlayoutOperationWithCache(
			access,
			'moveNextPart',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			async (cache) => {
				if (!partDelta && !segmentDelta)
					throw new Meteor.Error(402, `rundownMoveNext: invalid delta: (${partDelta}, ${segmentDelta})`)

				const playlist = cache.Playlist.doc
				if (!playlist.activationId)
					throw new Meteor.Error(501, `RundownPlaylist "${playlist._id}" is not active!`)

				if (playlist.holdState && playlist.holdState !== RundownHoldState.COMPLETE)
					throw new Meteor.Error(501, `RundownPlaylist "${playlist._id}" cannot change next during hold!`)
			},
			async (cache) => {
				return moveNextPartInner(cache, partDelta, segmentDelta)
			}
		)
	}
	export async function moveNextPartInner(
		cache: CacheForPlayout,
		partDelta: number,
		segmentDelta: number
	): Promise<PartId | null> {
		const playlist = cache.Playlist.doc

		const { currentPartInstance, nextPartInstance } = getSelectedPartInstancesFromCache(cache)

		const refPartInstance = nextPartInstance ?? currentPartInstance
		const refPart = refPartInstance?.part
		if (!refPart || !refPartInstance)
			throw new Meteor.Error(501, `RundownPlaylist "${playlist._id}" has no next and no current part!`)

		const { segments: rawSegments, parts: rawParts } = getOrderedSegmentsAndPartsFromPlayoutCache(cache)

		if (segmentDelta) {
			// Ignores horizontalDelta

			const considerSegments = rawSegments.filter((s) => s._id === refPart.segmentId || !s.isHidden)
			const refSegmentIndex = considerSegments.findIndex((s) => s._id === refPart.segmentId)
			if (refSegmentIndex === -1) throw new Meteor.Error(404, `Segment "${refPart.segmentId}" not found!`)

			const targetSegmentIndex = refSegmentIndex + segmentDelta
			const targetSegment = considerSegments[targetSegmentIndex]
			if (!targetSegment) throw new Meteor.Error(404, `No Segment found!`)

			// find the allowable segment ids
			const allowedSegments =
				segmentDelta < 0
					? considerSegments.slice(targetSegmentIndex)
					: considerSegments.slice(0, targetSegmentIndex + 1).reverse()
			// const allowedSegmentIds = new Set(allowedSegments.map((s) => s._id))

			const playablePartsBySegment = _.groupBy(
				rawParts.filter((p) => p.isPlayable()),
				(p) => p.segmentId
			)

			// Iterate through segments and find the first part
			let selectedPart: Part | undefined
			for (const segment of allowedSegments) {
				const parts = playablePartsBySegment[unprotectString(segment._id)] || []
				// Cant go to the current part (yet)
				const filteredParts = parts.filter((p) => p._id !== currentPartInstance?.part._id)
				if (filteredParts.length > 0) {
					selectedPart = filteredParts[0]
					break
				}
			}

			// TODO - looping playlists

			if (selectedPart) {
				// Switch to that part
				await setNextPartInner(cache, selectedPart, true)
				return selectedPart._id
			} else {
				// Nothing looked valid so do nothing
				// Note: we should try and a smaller delta if it is not -1/1
				logger.info(`moveNextPart: Found no new part (verticalDelta=${segmentDelta})`)
				return null
			}
		} else if (partDelta) {
			let playabaleParts: DBPart[] = rawParts.filter((p) => refPart._id === p._id || p.isPlayable())
			let refPartIndex = playabaleParts.findIndex((p) => p._id === refPart._id)
			if (refPartIndex === -1) {
				const tmpRefPart = { ...refPart, invalid: true } // make sure it won't be found as playable
				playabaleParts = RundownPlaylist._sortPartsInner([...playabaleParts, tmpRefPart], rawSegments)
				refPartIndex = playabaleParts.findIndex((p) => p._id === refPart._id)
				if (refPartIndex === -1) throw new Meteor.Error(500, `Part "${refPart._id}" not found after insert!`)
			}

			// Get the past we are after
			const targetPartIndex = refPartIndex + partDelta
			let targetPart = playabaleParts[targetPartIndex]
			if (targetPart && targetPart._id === currentPartInstance?.part._id) {
				// Cant go to the current part (yet)
				const newIndex = targetPartIndex + (partDelta > 0 ? 1 : -1)
				targetPart = playabaleParts[newIndex]
			}

			if (targetPart) {
				// Switch to that part
				await setNextPartInner(cache, targetPart, true)
				return targetPart._id
			} else {
				// Nothing looked valid so do nothing
				// Note: we should try and a smaller delta if it is not -1/1
				logger.info(`moveNextPart: Found no new part (horizontalDelta=${partDelta})`)
				return null
			}
		} else {
			throw new Meteor.Error(500, `Missing delta to move by!`)
		}
	}
	export async function setNextSegment(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId,
		nextSegmentId: SegmentId | null
	): Promise<ClientAPI.ClientResponse<void>> {
		check(rundownPlaylistId, String)
		if (nextSegmentId) check(nextSegmentId, String)

		return runPlayoutOperationWithCache(
			access,
			'setNextSegment',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			async (cache) => {
				const playlist = cache.Playlist.doc
				if (!playlist.activationId)
					throw new Meteor.Error(501, `Rundown Playlist "${rundownPlaylistId}" is not active!`)
			},
			async (cache) => {
				let nextSegment: Segment | null = null
				if (nextSegmentId) {
					nextSegment = cache.Segments.findOne(nextSegmentId) || null
					if (!nextSegment) throw new Meteor.Error(404, `Segment "${nextSegmentId}" not found!`)
				}

				libSetNextSegment(cache, nextSegment)

				// Update any future lookaheads
				await updateTimeline(cache)

				return ClientAPI.responseSuccess(undefined)
			}
		)
	}
	export async function activateHold(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId
	): Promise<void> {
		check(rundownPlaylistId, String)
		logger.debug('rundownActivateHold')

		return runPlayoutOperationWithCache(
			access,
			'activateHold',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			async (cache) => {
				const playlist = cache.Playlist.doc
				if (!playlist.activationId)
					throw new Meteor.Error(501, `Rundown Playlist "${rundownPlaylistId}" is not active!`)

				if (!playlist.currentPartInstanceId)
					throw new Meteor.Error(400, `Rundown Playlist "${rundownPlaylistId}" no current part!`)
				if (!playlist.nextPartInstanceId)
					throw new Meteor.Error(400, `Rundown Playlist "${rundownPlaylistId}" no next part!`)

				if (playlist.holdState) {
					throw new Meteor.Error(400, `RundownPlaylist "${rundownPlaylistId}" already doing a hold!`)
				}
			},
			async (cache) => {
				const playlist = cache.Playlist.doc
				const { currentPartInstance, nextPartInstance } = getSelectedPartInstancesFromCache(cache)
				if (!currentPartInstance)
					throw new Meteor.Error(404, `PartInstance "${playlist.currentPartInstanceId}" not found!`)
				if (!nextPartInstance)
					throw new Meteor.Error(404, `PartInstance "${playlist.nextPartInstanceId}" not found!`)

				if (
					currentPartInstance.part.holdMode !== PartHoldMode.FROM ||
					nextPartInstance.part.holdMode !== PartHoldMode.TO
				) {
					throw new Meteor.Error(400, `RundownPlaylist "${rundownPlaylistId}" incompatible pair of HoldMode!`)
				}
				if (currentPartInstance.part.segmentId !== nextPartInstance.part.segmentId) {
					throw new Meteor.Error(400, `RundownPlaylist "${rundownPlaylistId}" cannot hold between segments!`)
				}

				const hasDynamicallyInserted = cache.PieceInstances.findOne(
					(p) => p.partInstanceId === currentPartInstance._id && p.dynamicallyInserted
				)
				if (hasDynamicallyInserted)
					throw new Meteor.Error(
						400,
						`RundownPlaylist "${rundownPlaylistId}" cannot hold once an adlib has been used!`
					)

				cache.Playlist.update({ $set: { holdState: RundownHoldState.PENDING } })

				await updateTimeline(cache)
			}
		)
	}
	export async function deactivateHold(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId
	): Promise<void> {
		check(rundownPlaylistId, String)
		logger.debug('deactivateHold')

		return runPlayoutOperationWithCache(
			access,
			'deactivateHold',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			async (cache) => {
				const playlist = cache.Playlist.doc

				if (playlist.holdState !== RundownHoldState.PENDING)
					throw new Meteor.Error(400, `RundownPlaylist "${rundownPlaylistId}" is not pending a hold!`)
			},
			async (cache) => {
				cache.Playlist.update({ $set: { holdState: RundownHoldState.NONE } })

				await updateTimeline(cache)
			}
		)
	}
	export async function disableNextPiece(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId,
		undo?: boolean
	): Promise<ClientAPI.ClientResponse<void>> {
		check(rundownPlaylistId, String)

		return runPlayoutOperationWithCache(
			access,
			'disableNextPiece',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			async (cache) => {
				const playlist = cache.Playlist.doc
				if (!playlist.currentPartInstanceId) throw new Meteor.Error(401, `No current part!`)
			},
			async (cache) => {
				const playlist = cache.Playlist.doc

				const { currentPartInstance, nextPartInstance } = getSelectedPartInstancesFromCache(cache)
				if (!currentPartInstance)
					throw new Meteor.Error(404, `PartInstance "${playlist.currentPartInstanceId}" not found!`)

				const rundown = cache.Rundowns.findOne(currentPartInstance.rundownId)
				if (!rundown) throw new Meteor.Error(404, `Rundown "${currentPartInstance.rundownId}" not found!`)
				const showStyleBase = rundown.getShowStyleBase()

				// @ts-ignore stringify
				// logger.info(o)
				// logger.info(JSON.stringify(o, '', 2))

				const allowedSourceLayers = normalizeArrayToMap(showStyleBase.sourceLayers, '_id')

				// logger.info('nowInPart', nowInPart)
				// logger.info('filteredPieces', filteredPieces)
				const getNextPiece = (partInstance: PartInstance, ignoreStartedPlayback: boolean) => {
					// Find next piece to disable

					let nowInPart = 0
					if (!ignoreStartedPlayback && partInstance.timings?.startedPlayback) {
						nowInPart = getCurrentTime() - partInstance.timings?.startedPlayback
					}

					const pieceInstances = cache.PieceInstances.findFetch((p) => p.partInstanceId === partInstance._id)

					const filteredPieces = pieceInstances.filter((piece: PieceInstance) => {
						const sourceLayer = allowedSourceLayers.get(piece.piece.sourceLayerId)
						if (
							sourceLayer &&
							sourceLayer.allowDisable &&
							!piece.piece.virtual &&
							!piece.piece.isTransition
						)
							return true
						return false
					})

					const sortedPieces: PieceInstance[] = sortPieceInstancesByStart(
						_.sortBy(filteredPieces, (piece: PieceInstance) => {
							const sourceLayer = allowedSourceLayers.get(piece.piece.sourceLayerId)
							return sourceLayer?._rank || -9999
						}),
						nowInPart
					)

					const findLast: boolean = !!undo

					if (findLast) sortedPieces.reverse()

					return sortedPieces.find((piece) => {
						return (
							piece.piece.enable.start >= nowInPart &&
							((!undo && !piece.disabled) || (undo && piece.disabled))
						)
					})
				}

				if (nextPartInstance?.timings) {
					// pretend that the next part never has played (even if it has)
					delete nextPartInstance.timings.startedPlayback
				}

				const partInstances: Array<[PartInstance | undefined, boolean]> = [
					[currentPartInstance, false],
					[nextPartInstance, true], // If not found in currently playing part, let's look in the next one:
				]
				if (undo) partInstances.reverse()

				let nextPieceInstance: PieceInstance | undefined

				for (const [partInstance, ignoreStartedPlayback] of partInstances) {
					if (partInstance) {
						nextPieceInstance = getNextPiece(partInstance, ignoreStartedPlayback)
						if (nextPieceInstance) break
					}
				}

				if (nextPieceInstance) {
					logger.info((undo ? 'Disabling' : 'Enabling') + ' next PieceInstance ' + nextPieceInstance._id)
					cache.PieceInstances.update(nextPieceInstance._id, {
						$set: {
							disabled: !undo,
						},
					})

					await updateTimeline(cache)

					return ClientAPI.responseSuccess(undefined)
				} else {
					cache.assertNoChanges()

					return ClientAPI.responseError(404, 'Found no future pieces')
				}
			}
		)
	}

	/**
	 * Triggered from Playout-gateway when a Piece has started playing
	 */
	export async function onPiecePlaybackStarted(
		_context: MethodContext,
		rundownPlaylistId: RundownPlaylistId,
		pieceInstanceId: PieceInstanceId,
		dynamicallyInserted: boolean,
		startedPlayback: Time
	): Promise<void> {
		check(rundownPlaylistId, String)
		check(pieceInstanceId, String)
		check(startedPlayback, Number)

		triggerWriteAccessBecauseNoCheckNecessary() // tmp

		return runPlayoutOperationWithLock(
			null, // TODO: should security be done?
			'onPiecePlaybackStarted',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.CALLBACK_PLAYOUT,
			async (_lock, playlist) => {
				const rundowns = await Rundowns.findFetchAsync({ playlistId: playlist._id })
				// This method is called when an auto-next event occurs

				const pieceInstance = await PieceInstances.findOneAsync({
					_id: pieceInstanceId,
					rundownId: { $in: rundowns.map((r) => r._id) },
				})

				if (pieceInstance) {
					const isPlaying: boolean = !!(pieceInstance.startedPlayback && !pieceInstance.stoppedPlayback)
					if (!isPlaying) {
						logger.info(
							`onPiecePlaybackStarted: Playout reports pieceInstance "${pieceInstanceId}" has started playback on timestamp ${new Date(
								startedPlayback
							).toISOString()}`
						)
						await reportPieceHasStarted(playlist, pieceInstance, startedPlayback)

						// We don't need to bother with an updateTimeline(), as this hasn't changed anything, but lets us accurately add started items when reevaluating
					}
				} else if (!playlist.activationId) {
					logger.warn(`onPiecePlaybackStarted: Received for inactive RundownPlaylist "${playlist._id}"`)
				} else {
					throw new Meteor.Error(
						404,
						`PieceInstance "${pieceInstanceId}" in RundownPlaylist "${playlist._id}" not found!`
					)
				}
			}
		)
	}
	/**
	 * Triggered from Playout-gateway when a Piece has stopped playing
	 */
	export async function onPiecePlaybackStopped(
		_context: MethodContext,
		rundownPlaylistId: RundownPlaylistId,
		pieceInstanceId: PieceInstanceId,
		dynamicallyInserted: boolean,
		stoppedPlayback: Time
	): Promise<void> {
		check(rundownPlaylistId, String)
		check(pieceInstanceId, String)
		check(stoppedPlayback, Number)

		triggerWriteAccessBecauseNoCheckNecessary() // tmp

		return runPlayoutOperationWithLock(
			null, // TODO: should security be done?
			'onPiecePlaybackStopped',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.CALLBACK_PLAYOUT,
			async (_lock, playlist) => {
				const rundowns = await Rundowns.findFetchAsync({ playlistId: playlist._id })

				// This method is called when an auto-next event occurs
				const pieceInstance = await PieceInstances.findOneAsync({
					_id: pieceInstanceId,
					rundownId: { $in: rundowns.map((r) => r._id) },
				})

				if (pieceInstance) {
					const isPlaying: boolean = !!(pieceInstance.startedPlayback && !pieceInstance.stoppedPlayback)
					if (isPlaying) {
						logger.info(
							`onPiecePlaybackStopped: Playout reports pieceInstance "${pieceInstanceId}" has stopped playback on timestamp ${new Date(
								stoppedPlayback
							).toISOString()}`
						)

						await reportPieceHasStopped(playlist, pieceInstance, stoppedPlayback)
					}
				} else if (!playlist.activationId) {
					logger.warn(`onPiecePlaybackStopped: Received for inactive RundownPlaylist "${playlist._id}"`)
				} else {
					throw new Meteor.Error(
						404,
						`PieceInstance "${pieceInstanceId}" in RundownPlaylist "${playlist._id}" not found!`
					)
				}
			}
		)
	}

	/**
	 * Triggered from Playout-gateway when a Part has started playing
	 */
	export async function onPartPlaybackStarted(
		_context: MethodContext,
		peripheralDevice: PeripheralDevice,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		startedPlayback: Time
	): Promise<void> {
		check(rundownPlaylistId, String)
		check(partInstanceId, String)
		check(startedPlayback, Number)

		triggerWriteAccessBecauseNoCheckNecessary() // tmp

		return runPlayoutOperationWithCache(
			null, // TODO: should security be done?
			'onPartPlaybackStarted',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.CALLBACK_PLAYOUT,
			async (cache) => {
				const playlist = cache.Playlist.doc
				if (playlist.studioId !== peripheralDevice.studioId)
					throw new Meteor.Error(
						403,
						`PeripheralDevice "${peripheralDevice._id}" cannot execute callbacks for RundownPlaylist "${rundownPlaylistId}" !`
					)

				if (!playlist.activationId)
					throw new Meteor.Error(501, `Rundown Playlist "${rundownPlaylistId}" is not active!`)
			},
			async (cache) => {
				const playingPartInstance = cache.PartInstances.findOne(partInstanceId)
				if (!playingPartInstance)
					throw new Meteor.Error(
						404,
						`PartInstance "${partInstanceId}" in RundownPlayst "${rundownPlaylistId}" not found!`
					)

				// make sure we don't run multiple times, even if TSR calls us multiple times
				const isPlaying =
					playingPartInstance.timings?.startedPlayback && !playingPartInstance.timings?.stoppedPlayback
				if (!isPlaying) {
					logger.info(
						`Playout reports PartInstance "${partInstanceId}" has started playback on timestamp ${new Date(
							startedPlayback
						).toISOString()}`
					)

					const playlist = cache.Playlist.doc

					const rundown = cache.Rundowns.findOne(playingPartInstance.rundownId)
					if (!rundown) throw new Meteor.Error(404, `Rundown "${playingPartInstance.rundownId}" not found!`)

					const { currentPartInstance, previousPartInstance } = getSelectedPartInstancesFromCache(cache)

					if (playlist.currentPartInstanceId === partInstanceId) {
						// this is the current part, it has just started playback
						if (playlist.previousPartInstanceId) {
							if (!previousPartInstance) {
								// We couldn't find the previous part: this is not a critical issue, but is clearly is a symptom of a larger issue
								logger.error(
									`Previous PartInstance "${playlist.previousPartInstanceId}" on RundownPlaylist "${playlist._id}" could not be found.`
								)
							} else if (!previousPartInstance.timings?.duration) {
								onPartHasStoppedPlaying(cache, previousPartInstance, startedPlayback)
							}
						}

						reportPartInstanceHasStarted(cache, playingPartInstance, startedPlayback)
					} else if (playlist.nextPartInstanceId === partInstanceId) {
						// this is the next part, clearly an autoNext has taken place
						if (playlist.currentPartInstanceId) {
							if (!currentPartInstance) {
								// We couldn't find the previous part: this is not a critical issue, but is clearly is a symptom of a larger issue
								logger.error(
									`Previous PartInstance "${playlist.currentPartInstanceId}" on RundownPlaylist "${playlist._id}" could not be found.`
								)
							} else if (!currentPartInstance.timings?.duration) {
								onPartHasStoppedPlaying(cache, currentPartInstance, startedPlayback)
							}
						}

						cache.Playlist.update({
							$set: {
								previousPartInstanceId: playlist.currentPartInstanceId,
								currentPartInstanceId: playingPartInstance._id,
								holdState: RundownHoldState.NONE,
							},
						})

						reportPartInstanceHasStarted(cache, playingPartInstance, startedPlayback)

						// Update generated properties on the newly playing partInstance
						const currentRundown = currentPartInstance
							? cache.Rundowns.findOne(currentPartInstance.rundownId)
							: undefined
						const showStyle = await cache.activationCache.getShowStyleCompound(currentRundown ?? rundown)
						const blueprint = await loadShowStyleBlueprint(showStyle)
						updatePartInstanceOnTake(
							cache,
							showStyle,
							blueprint.blueprint,
							rundown,
							playingPartInstance,
							currentPartInstance
						)

						resetPreviousSegmentAndClearNextSegmentId(cache)

						// Update the next partinstance
						const nextPart = selectNextPart(
							playlist,
							playingPartInstance,
							getOrderedSegmentsAndPartsFromPlayoutCache(cache)
						)
						await libsetNextPart(cache, nextPart)
					} else {
						// a part is being played that has not been selected for playback by Core
						// show must go on, so find next part and update the Rundown, but log an error
						const previousReported = playlist.lastIncorrectPartPlaybackReported

						if (previousReported && Date.now() - previousReported > INCORRECT_PLAYING_PART_DEBOUNCE) {
							// first time this has happened for a while, let's try to progress the show:

							cache.Playlist.update({
								$set: {
									previousPartInstanceId: null,
									currentPartInstanceId: playingPartInstance._id,
									lastIncorrectPartPlaybackReported: Date.now(), // save the time to prevent the system to go in a loop
								},
							})

							reportPartInstanceHasStarted(cache, playingPartInstance, startedPlayback)

							const nextPart = selectNextPart(
								playlist,
								playingPartInstance,
								getOrderedSegmentsAndPartsFromPlayoutCache(cache)
							)
							await libsetNextPart(cache, nextPart)
						}

						// TODO - should this even change the next?
						logger.error(
							`PartInstance "${playingPartInstance._id}" has started playback by the playout gateway, but has not been selected for playback!`
						)
					}

					// complete the take
					await afterTake(cache, playingPartInstance)
				}
			}
		)
	}
	/**
	 * Triggered from Playout-gateway when a Part has stopped playing
	 */
	export async function onPartPlaybackStopped(
		_context: MethodContext,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		stoppedPlayback: Time
	): Promise<void> {
		check(rundownPlaylistId, String)
		check(partInstanceId, String)
		check(stoppedPlayback, Number)

		triggerWriteAccessBecauseNoCheckNecessary() // tmp

		return runPlayoutOperationWithLock(
			null, // TODO: should security be done?
			'onPartPlaybackStopped',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.CALLBACK_PLAYOUT,
			async (_lock, playlist) => {
				// This method is called when a part stops playing (like when an auto-next event occurs, or a manual next)
				const rundowns = await Rundowns.findFetchAsync({ playlistId: playlist._id })

				const partInstance = await PartInstances.findOneAsync({
					_id: partInstanceId,
					rundownId: { $in: rundowns.map((r) => r._id) },
				})

				if (partInstance) {
					// make sure we don't run multiple times, even if TSR calls us multiple times

					const isPlaying = partInstance.timings?.startedPlayback && !partInstance.timings?.stoppedPlayback
					if (isPlaying) {
						logger.info(
							`onPartPlaybackStopped: Playout reports PartInstance "${partInstanceId}" has stopped playback on timestamp ${new Date(
								stoppedPlayback
							).toISOString()}`
						)

						await reportPartInstanceHasStopped(playlist._id, partInstance, stoppedPlayback)
					}
				} else if (!playlist.activationId) {
					logger.warn(`onPartPlaybackStopped: Received for inactive RundownPlaylist "${playlist._id}"`)
				} else {
					throw new Meteor.Error(
						404,
						`PartInstance "${partInstanceId}" in RundownPlaylist "${playlist._id}" not found!`
					)
				}
			}
		)
	}
	/**
	 * Make a copy of a piece and start playing it now
	 */
	export async function pieceTakeNow(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		pieceInstanceIdOrPieceIdToCopy: PieceInstanceId | PieceId
	) {
		check(rundownPlaylistId, String)
		check(partInstanceId, String)
		check(pieceInstanceIdOrPieceIdToCopy, String)

		return ServerPlayoutAdLibAPI.pieceTakeNow(
			access,
			rundownPlaylistId,
			partInstanceId,
			pieceInstanceIdOrPieceIdToCopy
		)
	}
	export async function segmentAdLibPieceStart(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		adLibPieceId: PieceId,
		queue: boolean
	) {
		check(rundownPlaylistId, String)
		check(partInstanceId, String)
		check(adLibPieceId, String)

		return ServerPlayoutAdLibAPI.segmentAdLibPieceStart(
			access,
			rundownPlaylistId,
			partInstanceId,
			adLibPieceId,
			queue
		)
	}
	export async function rundownBaselineAdLibPieceStart(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		baselineAdLibPieceId: PieceId,
		queue: boolean
	) {
		check(rundownPlaylistId, String)
		check(partInstanceId, String)
		check(baselineAdLibPieceId, String)

		return ServerPlayoutAdLibAPI.rundownBaselineAdLibPieceStart(
			access,
			rundownPlaylistId,
			partInstanceId,
			baselineAdLibPieceId,
			queue
		)
	}
	export async function sourceLayerStickyPieceStart(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId,
		sourceLayerId: string
	) {
		check(rundownPlaylistId, String)
		check(sourceLayerId, String)

		return ServerPlayoutAdLibAPI.sourceLayerStickyPieceStart(access, rundownPlaylistId, sourceLayerId)
	}
	export async function executeAction(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId,
		actionDocId: AdLibActionId | RundownBaselineAdLibActionId,
		actionId: string,
		userData: any,
		triggerMode?: string
	) {
		check(rundownPlaylistId, String)
		check(actionDocId, String)
		check(actionId, String)
		check(userData, Match.Any)
		check(triggerMode, Match.Maybe(String))

		return executeActionInner(access, rundownPlaylistId, actionDocId, async (actionContext, _cache, _rundown) => {
			const blueprint = await loadShowStyleBlueprint(actionContext.showStyleCompound)
			if (!blueprint.blueprint.executeAction) {
				throw new Meteor.Error(
					400,
					`ShowStyle blueprint "${blueprint.blueprintId}" does not support executing actions`
				)
			}

			logger.info(`Executing AdlibAction "${actionId}": ${JSON.stringify(userData)}`)

			blueprint.blueprint.executeAction(actionContext, actionId, userData, triggerMode)
		})
	}

	export async function executeActionInner(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId,
		actionDocId: AdLibActionId | RundownBaselineAdLibActionId,
		func: (
			context: ActionExecutionContext,
			cache: CacheForPlayout,
			rundown: Rundown,
			currentPartInstance: PartInstance
		) => Promise<void>
	): Promise<void> {
		const now = getCurrentTime()

		return runPlayoutOperationWithCache(
			access,
			'executeActionInner',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			async (cache) => {
				const playlist = cache.Playlist.doc

				if (!playlist.activationId)
					throw new Meteor.Error(403, `Pieces can be only manipulated in an active rundown!`)
				if (!playlist.currentPartInstanceId)
					throw new Meteor.Error(400, `A part needs to be active to execute an action`)
			},
			async (cache) => {
				const playlist = cache.Playlist.doc

				const currentPartInstance = playlist.currentPartInstanceId
					? cache.PartInstances.findOne(playlist.currentPartInstanceId)
					: undefined
				if (!currentPartInstance)
					throw new Meteor.Error(
						501,
						`Current PartInstance "${playlist.currentPartInstanceId}" could not be found.`
					)

				const rundown = cache.Rundowns.findOne(currentPartInstance.rundownId)
				if (!rundown)
					throw new Meteor.Error(501, `Current Rundown "${currentPartInstance.rundownId}" could not be found`)

				const [showStyle, watchedPackages] = await Promise.all([
					cache.activationCache.getShowStyleCompound(rundown),
					WatchedPackagesHelper.create(cache.Studio.doc._id, {
						pieceId: actionDocId,
						fromPieceType: {
							$in: [ExpectedPackageDBType.ADLIB_ACTION, ExpectedPackageDBType.BASELINE_ADLIB_ACTION],
						},
					}),
				])
				const actionContext = new ActionExecutionContext(
					{
						name: `${rundown.name}(${playlist.name})`,
						identifier: `playlist=${playlist._id},rundown=${rundown._id},currentPartInstance=${
							currentPartInstance._id
						},execution=${getRandomId()}`,
						tempSendUserNotesIntoBlackHole: true, // TODO-CONTEXT store these notes
					},
					cache,
					showStyle,
					rundown,
					watchedPackages
				)

				// If any action cannot be done due to timings, that needs to be rejected by the context
				await func(actionContext, cache, rundown, currentPartInstance)

				if (
					actionContext.currentPartState !== ActionPartChange.NONE ||
					actionContext.nextPartState !== ActionPartChange.NONE
				) {
					await syncPlayheadInfinitesForNextPartInstance(cache)
				}

				if (actionContext.takeAfterExecute) {
					await ServerPlayoutAPI.callTakeWithCache(cache, now)
				} else {
					if (
						actionContext.currentPartState !== ActionPartChange.NONE ||
						actionContext.nextPartState !== ActionPartChange.NONE
					) {
						await updateTimeline(cache)
					}
				}
			}
		)
	}
	/**
	 * This exists for the purpose of mocking this call for testing.
	 */
	export async function callTakeWithCache(cache: CacheForPlayout, now: number) {
		return takeNextPartInnerSync(cache, now)
	}
	export async function sourceLayerOnPartStop(
		access: VerifiedRundownPlaylistContentAccess,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		sourceLayerIds: string[]
	): Promise<void> {
		check(rundownPlaylistId, String)
		check(partInstanceId, String)
		check(sourceLayerIds, Match.OneOf(String, Array))

		return runPlayoutOperationWithCache(
			access,
			'sourceLayerOnPartStop',
			rundownPlaylistId,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			async (cache) => {
				if (_.isString(sourceLayerIds)) sourceLayerIds = [sourceLayerIds]

				if (sourceLayerIds.length === 0) return

				const playlist = cache.Playlist.doc
				if (!playlist.activationId)
					throw new Meteor.Error(403, `Pieces can be only manipulated in an active rundown!`)
				if (playlist.currentPartInstanceId !== partInstanceId)
					throw new Meteor.Error(403, `Pieces can be only manipulated in a current part!`)
			},
			async (cache) => {
				const partInstance = cache.PartInstances.findOne(partInstanceId)
				if (!partInstance) throw new Meteor.Error(404, `PartInstance "${partInstanceId}" not found!`)
				const lastStartedPlayback = partInstance.timings?.startedPlayback
				if (!lastStartedPlayback)
					throw new Meteor.Error(405, `Part "${partInstanceId}" has yet to start playback!`)

				const rundown = cache.Rundowns.findOne(partInstance.rundownId)
				if (!rundown) throw new Meteor.Error(501, `Rundown "${partInstance.rundownId}" not found!`)

				const showStyleBase = ShowStyleBases.findOne(rundown.showStyleBaseId)
				if (!showStyleBase) throw new Meteor.Error(404, `ShowStyleBase "${rundown.showStyleBaseId}" not found!`)

				ServerPlayoutAdLibAPI.innerStopPieces(
					cache,
					showStyleBase,
					partInstance,
					(pieceInstance) => sourceLayerIds.indexOf(pieceInstance.piece.sourceLayerId) !== -1,
					undefined
				)

				await syncPlayheadInfinitesForNextPartInstance(cache)

				await updateTimeline(cache)
			}
		)
	}

	export async function updateStudioBaseline(context: MethodContext, studioId: StudioId): Promise<string | false> {
		StudioContentWriteAccess.baseline(context, studioId)

		check(studioId, String)

		return runStudioOperationWithCache(
			'updateStudioBaseline',
			studioId,
			StudioLockFunctionPriority.USER_PLAYOUT,
			async (cache) => {
				const activePlaylists = cache.getActiveRundownPlaylists()

				if (activePlaylists.length === 0) {
					await updateStudioTimeline(cache)
					return shouldUpdateStudioBaselineInner(cache)
				} else {
					return shouldUpdateStudioBaselineInner(cache)
				}
			}
		)
	}

	export async function shouldUpdateStudioBaseline(
		context: MethodContext,
		studioId: StudioId
	): Promise<string | false> {
		StudioContentWriteAccess.baseline(context, studioId)

		check(studioId, String)

		return runStudioOperationWithCache(
			'shouldUpdateStudioBaseline',
			studioId,
			StudioLockFunctionPriority.MISC,
			async (cache) => {
				return shouldUpdateStudioBaselineInner(cache)
			}
		)
	}
	async function shouldUpdateStudioBaselineInner(cache: CacheForStudio): Promise<string | false> {
		const studio = cache.Studio.doc

		const activePlaylists = cache.getActiveRundownPlaylists()
		if (activePlaylists.length === 0) {
			const studioTimeline = cache.Timeline.findOne(studio._id)
			if (!studioTimeline) return 'noBaseline'
			const markerObject = studioTimeline.timeline.find((x) => x.id === `baseline_version`)
			if (!markerObject) return 'noBaseline'
			// Accidental inclusion of one timeline code below - random ... don't know why
			// const studioTimeline = cache.Timeline.findOne(studioId)
			// if (!studioTimeline) return 'noBaseline'
			// const markerObject = studioTimeline.timeline.find(
			// 	(x) => x._id === protectString(`${studio._id}_baseline_version`)
			// )
			// if (!markerObject) return 'noBaseline'

			const versionsContent = (markerObject.metaData as Partial<StatObjectMetadata> | undefined)?.versions

			if (versionsContent?.core !== (PackageInfo.versionExtended || PackageInfo.version)) return 'coreVersion'

			if (versionsContent?.studio !== (studio._rundownVersionHash || 0)) return 'studio'

			if (versionsContent?.blueprintId !== unprotectString(studio.blueprintId)) return 'blueprintId'
			if (studio.blueprintId) {
				const blueprint = await Blueprints.findOneAsync(studio.blueprintId)
				if (!blueprint) return 'blueprintUnknown'
				if (versionsContent.blueprintVersion !== (blueprint.blueprintVersion || 0)) return 'blueprintVersion'
			}
		}

		return false
	}

	export function switchRouteSet(context: MethodContext, studioId: StudioId, routeSetId: string, state: boolean) {
		check(studioId, String)
		check(routeSetId, String)
		check(state, Boolean)

		const allowed = StudioContentWriteAccess.routeSet(context, studioId)
		if (!allowed) throw new Meteor.Error(403, `Not allowed to edit RouteSet on studio ${studioId}`)

		const studio = allowed.studio
		if (!studio) throw new Meteor.Error(404, `Studio "${studioId}" not found!`)

		if (studio.routeSets[routeSetId] === undefined)
			throw new Meteor.Error(404, `RouteSet "${routeSetId}" not found!`)
		const routeSet = studio.routeSets[routeSetId]
		if (routeSet.behavior === StudioRouteBehavior.ACTIVATE_ONLY && state === false)
			throw new Meteor.Error(400, `RouteSet "${routeSetId}" is ACTIVATE_ONLY`)

		const modification = {}
		modification[`routeSets.${routeSetId}.active`] = state

		if (studio.routeSets[routeSetId].exclusivityGroup && state === true) {
			_.each(studio.routeSets, (otherRouteSet, otherRouteSetId) => {
				if (otherRouteSetId === routeSetId) return
				if (otherRouteSet.exclusivityGroup === routeSet.exclusivityGroup) {
					modification[`routeSets.${otherRouteSetId}.active`] = false
				}
			})
		}

		Studios.update(studioId, {
			$set: modification,
		})

		// TODO: Run update timeline here

		return ClientAPI.responseSuccess(undefined)
	}
}

interface UpdateTimelineFromIngestDataTimeout {
	timeout?: number
}
const updateTimelineFromIngestDataTimeouts = new Map<RundownPlaylistId, UpdateTimelineFromIngestDataTimeout>()
export function triggerUpdateTimelineAfterIngestData(playlistId: RundownPlaylistId) {
	if (process.env.JEST_WORKER_ID) {
		// Don't run this when in jest, as it is not useful and ends up producing errors
		return
	}

	// Lock behind a timeout, so it doesnt get executed loads when importing a rundown or there are large changes
	const data = updateTimelineFromIngestDataTimeouts.get(playlistId) ?? {}
	if (data.timeout) Meteor.clearTimeout(data.timeout)

	data.timeout = Meteor.setTimeout(() => {
		if (updateTimelineFromIngestDataTimeouts.delete(playlistId)) {
			const transaction = profiler.startTransaction('triggerUpdateTimelineAfterIngestData', 'playout')
			runPlayoutOperationWithCache(
				null,
				'triggerUpdateTimelineAfterIngestData',
				playlistId,
				PlayoutLockFunctionPriority.USER_PLAYOUT,
				null,
				async (cache) => {
					const playlist = cache.Playlist.doc

					if (playlist.activationId && (playlist.currentPartInstanceId || playlist.nextPartInstanceId)) {
						const { currentPartInstance } = getSelectedPartInstancesFromCache(cache)
						if (!currentPartInstance?.timings?.startedPlayback) {
							// HACK: The current PartInstance doesn't have a start time yet, so we know an updateTimeline is coming as part of onPartPlaybackStarted
							// We mustn't run before that does, or we will get the timings in playout-gateway confused.
						} else {
							// It is safe enough (except adlibs) to update the timeline directly
							// If the playlist is active, then updateTimeline as lookahead could have been affected
							await updateTimeline(cache)
						}
					}
				}
			).catch((e) => {
				logger.error(`triggerUpdateTimelineAfterIngestData: Execution failed: ${e}`)
			})
			transaction?.end()
		}
	}, 1000)

	updateTimelineFromIngestDataTimeouts.set(playlistId, data)
}
