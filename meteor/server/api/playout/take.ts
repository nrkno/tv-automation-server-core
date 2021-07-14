import { RundownPlaylistActivationId } from '../../../lib/collections/RundownPlaylists'
import { ClientAPI } from '../../../lib/api/client'
import {
	getCurrentTime,
	waitForPromise,
	unprotectObjectArray,
	protectString,
	literal,
	clone,
	getRandomId,
} from '../../../lib/lib'
import { Meteor } from 'meteor/meteor'
import { setNextPart as libsetNextPart, isTooCloseToAutonext, selectNextPart, LOW_PRIO_DEFER_TIME } from './lib'
import { loadShowStyleBlueprint } from '../blueprints/cache'
import { RundownHoldState, Rundown, Rundowns } from '../../../lib/collections/Rundowns'
import { updateTimeline } from './timeline'
import { logger } from '../../logging'
import { PartEndState, ShowStyleBlueprintManifest, VTContent } from '@sofie-automation/blueprints-integration'
import { getResolvedPieces } from './pieces'
import { PieceInstance, PieceInstanceId, PieceInstanceInfiniteId } from '../../../lib/collections/PieceInstances'
import { PartEventContext, RundownContext } from '../blueprints/context/context'
import { PartInstance, unprotectPartInstance } from '../../../lib/collections/PartInstances'
import { IngestActions } from '../ingest/actions'
import { PeripheralDeviceAPI } from '../../../lib/api/peripheralDevice'
import { reportPartInstanceHasStarted } from '../blueprints/events'
import { profiler } from '../profiler'
import { ServerPlayoutAdLibAPI } from './adlib'
import { ShowStyleBase } from '../../../lib/collections/ShowStyleBases'
import { isAnyQueuedWorkRunning } from '../../codeControl'
import { CacheForPlayout, getOrderedSegmentsAndPartsFromPlayoutCache, getSelectedPartInstancesFromCache } from './cache'
import { ShowStyleCompound } from '../../../lib/collections/ShowStyleVariants'

export async function takeNextPartInnerSync(cache: CacheForPlayout, now: number) {
	const span = profiler.startSpan('takeNextPartInner')

	if (!cache.Playlist.doc.activationId)
		throw new Meteor.Error(404, `Rundown Playlist "${cache.Playlist.doc._id}" is not active!`)
	const playlistActivationId = cache.Playlist.doc.activationId

	const timeOffset: number | null = cache.Playlist.doc.nextTimeOffset || null

	const { currentPartInstance, nextPartInstance, previousPartInstance } = getSelectedPartInstancesFromCache(cache)

	// const partInstance = nextPartInstance || currentPartInstance
	const partInstance = nextPartInstance // todo: we should always take the next, so it's this one, right?
	if (!partInstance) throw new Meteor.Error(404, `No partInstance could be found!`)
	const currentRundown = partInstance ? cache.Rundowns.findOne(partInstance.rundownId) : undefined
	if (!currentRundown)
		throw new Meteor.Error(404, `Rundown "${(partInstance && partInstance.rundownId) || ''}" could not be found!`)

	// it is only a first take if the Playlist has no startedPlayback and the taken PartInstance is not untimed
	const isFirstTake = !cache.Playlist.doc.startedPlayback && !partInstance.part.untimed

	const pShowStyle = cache.activationCache.getShowStyleCompound(currentRundown)
	const pBlueprint = pShowStyle.then(async (s) => loadShowStyleBlueprint(s))

	if (currentPartInstance) {
		const allowTransition = previousPartInstance && !previousPartInstance.part.disableOutTransition
		const start = currentPartInstance.timings?.startedPlayback

		// If there was a transition from the previous Part, then ensure that has finished before another take is permitted
		if (
			allowTransition &&
			currentPartInstance.part.transitionDuration &&
			start &&
			now < start + currentPartInstance.part.transitionDuration
		) {
			return ClientAPI.responseError('Cannot take during a transition')
		}

		if (isTooCloseToAutonext(currentPartInstance, true)) {
			return ClientAPI.responseError('Cannot take shortly before an autoTake')
		}
	}

	if (cache.Playlist.doc.holdState === RundownHoldState.COMPLETE) {
		cache.Playlist.update({
			$set: {
				holdState: RundownHoldState.NONE,
			},
		})
		// If hold is active, then this take is to clear it
	} else if (cache.Playlist.doc.holdState === RundownHoldState.ACTIVE) {
		await completeHold(cache, await pShowStyle, currentPartInstance)

		return ClientAPI.responseSuccess(undefined)
	}

	const takePartInstance = nextPartInstance
	if (!takePartInstance) throw new Meteor.Error(404, 'takePart not found!')
	const takeRundown: Rundown | undefined = cache.Rundowns.findOne(takePartInstance.rundownId)
	if (!takeRundown)
		throw new Meteor.Error(500, `takeRundown: takeRundown not found! ("${takePartInstance.rundownId}")`)

	const nextPart = selectNextPart(
		cache.Playlist.doc,
		takePartInstance,
		getOrderedSegmentsAndPartsFromPlayoutCache(cache)
	)

	const showStyle = await pShowStyle
	const { blueprint } = await pBlueprint
	if (blueprint.onPreTake) {
		const span = profiler.startSpan('blueprint.onPreTake')
		try {
			await Promise.resolve(
				blueprint.onPreTake(
					new PartEventContext('onPreTake', cache.Studio.doc, showStyle, takeRundown, takePartInstance)
				)
			).catch(logger.error)
			if (span) span.end()
		} catch (e) {
			if (span) span.end()
			logger.error(e)
		}
	}

	updatePartInstanceOnTake(cache, showStyle, blueprint, takeRundown, takePartInstance, currentPartInstance)

	cache.Playlist.update({
		$set: {
			previousPartInstanceId: cache.Playlist.doc.currentPartInstanceId,
			currentPartInstanceId: takePartInstance._id,
			holdState:
				!cache.Playlist.doc.holdState || cache.Playlist.doc.holdState === RundownHoldState.COMPLETE
					? RundownHoldState.NONE
					: cache.Playlist.doc.holdState + 1,
		},
	})

	cache.PartInstances.update(takePartInstance._id, {
		$set: {
			isTaken: true,
			'timings.take': now,
			'timings.playOffset': timeOffset || 0,
		},
	})

	if (cache.Playlist.doc.previousPartInstanceId) {
		cache.PartInstances.update(cache.Playlist.doc.previousPartInstanceId, {
			$set: {
				'timings.takeOut': now,
			},
		})
	}

	resetPreviousSegmentAndClearNextSegmentId(cache)

	// Once everything is synced, we can choose the next part
	await libsetNextPart(cache, nextPart)

	// Setup the parts for the HOLD we are starting
	if (
		cache.Playlist.doc.previousPartInstanceId &&
		(cache.Playlist.doc.holdState as RundownHoldState) === RundownHoldState.ACTIVE
	) {
		startHold(cache, playlistActivationId, currentPartInstance, nextPartInstance)
	}
	await afterTake(cache, takePartInstance, timeOffset)

	// Last:
	const takeDoneTime = getCurrentTime()
	cache.defer((cache2) => {
		afterTakeUpdateTimingsAndEvents(cache2, showStyle, blueprint, isFirstTake, takeDoneTime)
	})

	if (span) span.end()
	return ClientAPI.responseSuccess(undefined)
}

export function resetPreviousSegmentAndClearNextSegmentId(cache: CacheForPlayout) {
	const { previousPartInstance, currentPartInstance } = getSelectedPartInstancesFromCache(cache)

	if (
		currentPartInstance?.consumesNextSegmentId &&
		cache.Playlist.doc.nextSegmentId === currentPartInstance.segmentId
	) {
		// clear the nextSegmentId if the newly taken partInstance says it was selected because of it
		cache.Playlist.update({
			$unset: {
				nextSegmentId: 1,
			},
		})
	}

	// If the playlist is looping and
	// If the previous and current part are not in the same segment, then we have just left a segment
	if (
		cache.Playlist.doc.loop &&
		previousPartInstance &&
		previousPartInstance.segmentId !== currentPartInstance?.segmentId
	) {
		// Reset the old segment
		const segmentId = previousPartInstance.segmentId
		const resetIds = new Set(
			cache.PartInstances.update((p) => !p.reset && p.segmentId === segmentId, {
				$set: {
					reset: true,
				},
			})
		)
		cache.PieceInstances.update((p) => resetIds.has(p.partInstanceId), {
			$set: {
				reset: true,
			},
		})
	}
}

function afterTakeUpdateTimingsAndEvents(
	cache: CacheForPlayout,
	showStyle: ShowStyleCompound,
	blueprint: ShowStyleBlueprintManifest,
	isFirstTake: boolean,
	takeDoneTime: number
): void {
	const { currentPartInstance: takePartInstance } = getSelectedPartInstancesFromCache(cache)
	const takeRundown = takePartInstance ? cache.Rundowns.findOne(takePartInstance.rundownId) : undefined

	// todo: should this be changed back to Meteor.defer, at least for the blueprint stuff?
	if (takePartInstance) {
		cache.PartInstances.update(takePartInstance._id, {
			$set: {
				'timings.takeDone': takeDoneTime,
			},
		})

		// Simulate playout, if no gateway
		const playoutDevices = cache.PeripheralDevices.findFetch(
			(d) => d.type === PeripheralDeviceAPI.DeviceType.PLAYOUT
		)
		if (playoutDevices.length === 0) {
			logger.info(
				`No Playout gateway attached to studio, reporting PartInstance "${
					takePartInstance._id
				}" to have started playback on timestamp ${new Date(takeDoneTime).toISOString()}`
			)
			reportPartInstanceHasStarted(cache, takePartInstance, takeDoneTime)
		}

		// let bp = getBlueprintOfRundown(rundown)
		if (isFirstTake && takeRundown) {
			if (blueprint.onRundownFirstTake) {
				const span = profiler.startSpan('blueprint.onRundownFirstTake')
				waitForPromise(
					Promise.resolve(
						blueprint.onRundownFirstTake(
							new PartEventContext(
								'onRundownFirstTake',
								cache.Studio.doc,
								showStyle,
								takeRundown,
								takePartInstance
							)
						)
					).catch(logger.error)
				)
				if (span) span.end()
			}
		}

		if (blueprint.onPostTake && takeRundown) {
			const span = profiler.startSpan('blueprint.onPostTake')
			waitForPromise(
				Promise.resolve(
					blueprint.onPostTake(
						new PartEventContext('onPostTake', cache.Studio.doc, showStyle, takeRundown, takePartInstance)
					)
				).catch(logger.error)
			)
			if (span) span.end()
		}
	}
}

export function updatePartInstanceOnTake(
	cache: CacheForPlayout,
	showStyle: ShowStyleCompound,
	blueprint: ShowStyleBlueprintManifest,
	takeRundown: Rundown,
	takePartInstance: PartInstance,
	currentPartInstance: PartInstance | undefined
): void {
	const playlist = cache.Playlist.doc

	// TODO - the state could change after this sampling point. This should be handled properly
	let previousPartEndState: PartEndState | undefined = undefined
	if (blueprint.getEndStateForPart && currentPartInstance) {
		const time = getCurrentTime()
		const resolvedPieces = getResolvedPieces(cache, showStyle, currentPartInstance)

		const span = profiler.startSpan('blueprint.getEndStateForPart')
		const context = new RundownContext(
			{
				name: `${playlist.name}`,
				identifier: `playlist=${playlist._id},currentPartInstance=${
					currentPartInstance._id
				},execution=${getRandomId()}`,
			},
			cache.Studio.doc,
			showStyle,
			takeRundown
		)
		previousPartEndState = blueprint.getEndStateForPart(
			context,
			playlist.previousPersistentState,
			unprotectPartInstance(clone(currentPartInstance)),
			unprotectObjectArray(resolvedPieces),
			time
		)
		if (span) span.end()
		logger.info(`Calculated end state in ${getCurrentTime() - time}ms`)
	}

	const partInstanceM: any = {
		$set: {
			isTaken: true,
			// set transition properties to what will be used to generate timeline later:
			allowedToUseTransition: currentPartInstance && !currentPartInstance.part.disableOutTransition,
		},
	}
	if (previousPartEndState) {
		partInstanceM.$set.previousPartEndState = previousPartEndState
	}

	cache.PartInstances.update(takePartInstance._id, partInstanceM)
}

export async function afterTake(
	cache: CacheForPlayout,
	takePartInstance: PartInstance,
	timeOffset: number | null = null
): Promise<void> {
	const span = profiler.startSpan('afterTake')
	// This function should be called at the end of a "take" event (when the Parts have been updated)

	let forceNowTime: number | undefined = undefined
	if (timeOffset) {
		forceNowTime = getCurrentTime() - timeOffset
	}
	// or after a new part has started playing
	await updateTimeline(cache, forceNowTime)

	cache.deferAfterSave(() => {
		Meteor.setTimeout(() => {
			// This is low-prio, defer so that it's executed well after publications has been updated,
			// so that the playout gateway has haf the chance to learn about the timeline changes

			// todo
			if (takePartInstance.part.shouldNotifyCurrentPlayingPart) {
				const currentRundown = Rundowns.findOne(takePartInstance.rundownId)
				if (!currentRundown)
					throw new Meteor.Error(
						404,
						`Rundown "${takePartInstance.rundownId}" of partInstance "${takePartInstance._id}" not found`
					)
				IngestActions.notifyCurrentPlayingPart(currentRundown, takePartInstance.part)
			}
		}, LOW_PRIO_DEFER_TIME)
	})

	triggerGarbageCollection()
	if (span) span.end()
}

/**
 * A Hold starts by extending the "extendOnHold"-able pieces in the previous Part.
 */
function startHold(
	cache: CacheForPlayout,
	activationId: RundownPlaylistActivationId,
	holdFromPartInstance: PartInstance | undefined,
	holdToPartInstance: PartInstance | undefined
) {
	if (!holdFromPartInstance) throw new Meteor.Error(404, 'previousPart not found!')
	if (!holdToPartInstance) throw new Meteor.Error(404, 'currentPart not found!')
	const span = profiler.startSpan('startHold')

	// Make a copy of any item which is flagged as an 'infinite' extension
	const itemsToCopy = cache.PieceInstances.findFetch(
		(p) => p.partInstanceId === holdFromPartInstance._id && p.piece.extendOnHold
	)
	itemsToCopy.forEach((instance) => {
		if (!instance.infinite) {
			const infiniteInstanceId: PieceInstanceInfiniteId = getRandomId()
			// mark current one as infinite
			cache.PieceInstances.update(instance._id, {
				$set: {
					infinite: {
						infiniteInstanceId: infiniteInstanceId,
						infinitePieceId: instance.piece._id,
						fromPreviousPart: false,
					},
				},
			})

			// make the extension
			const newInstance = literal<PieceInstance>({
				_id: protectString<PieceInstanceId>(instance._id + '_hold'),
				playlistActivationId: activationId,
				rundownId: instance.rundownId,
				partInstanceId: holdToPartInstance._id,
				dynamicallyInserted: getCurrentTime(),
				piece: {
					...clone(instance.piece),
					enable: { start: 0 },
					extendOnHold: false,
				},
				infinite: {
					infiniteInstanceId: infiniteInstanceId,
					infinitePieceId: instance.piece._id,
					fromPreviousPart: true,
					fromHold: true,
				},
				// Preserve the timings from the playing instance
				startedPlayback: instance.startedPlayback,
				stoppedPlayback: instance.stoppedPlayback,
			})
			const content = newInstance.piece.content as VTContent | undefined
			if (content && content.fileName && content.sourceDuration && instance.startedPlayback) {
				content.seek = Math.min(content.sourceDuration, getCurrentTime() - instance.startedPlayback)
			}

			// This gets deleted once the nextpart is activated, so it doesnt linger for long
			cache.PieceInstances.replace(newInstance)
		}
	})
	if (span) span.end()
}

async function completeHold(
	cache: CacheForPlayout,
	showStyleBase: ShowStyleBase,
	currentPartInstance: PartInstance | undefined
): Promise<void> {
	cache.Playlist.update({
		$set: {
			holdState: RundownHoldState.COMPLETE,
		},
	})

	if (cache.Playlist.doc.currentPartInstanceId) {
		if (!currentPartInstance) throw new Meteor.Error(404, 'currentPart not found!')

		// Clear the current extension line
		ServerPlayoutAdLibAPI.innerStopPieces(
			cache,
			showStyleBase,
			currentPartInstance,
			(p) => !!p.infinite?.fromHold,
			undefined
		)
	}

	await updateTimeline(cache)
}

export function triggerGarbageCollection() {
	Meteor.setTimeout(() => {
		// Trigger a manual garbage collection:
		if (global.gc) {
			// This is only avaialble of the flag --expose_gc
			// This can be done in prod by: node --expose_gc main.js
			// or when running Meteor in development, set set SERVER_NODE_OPTIONS=--expose_gc

			if (!isAnyQueuedWorkRunning()) {
				// by passing true, we're triggering the "full" collection
				// @ts-ignore (typings not avaiable)
				global.gc(true)
			}
		}
	}, 500)
}
