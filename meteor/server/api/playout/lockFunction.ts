import { Meteor } from 'meteor/meteor'
import { ReadonlyDeep } from 'type-fest'
import { RundownPlaylistId, RundownPlaylist, RundownPlaylists } from '../../../lib/collections/RundownPlaylists'
import { assertNever, Awaited, waitForPromise } from '../../../lib/lib'
import { ReadOnlyCache } from '../../cache/CacheBase'
import { syncFunction } from '../../codeControl'
import { VerifiedRundownPlaylistContentAccess } from '../lib'
import { profiler } from '../profiler'
import { CacheForStudio } from '../studio/cache'
import {
	getStudioIdFromCacheOrLock,
	isStudioLock,
	StudioLock,
	runStudioOperationWithLock,
	StudioLockFunctionPriority,
} from '../studio/lockFunction'
import { CacheForPlayout, CacheForPlayoutPreInit } from './cache'

/** Priority for handling of synchronous events. Higher value means higher priority */
export enum PlayoutLockFunctionPriority {
	MISC = 0,
	/** Events initiated from user, for playout */
	USER_PLAYOUT = 10,
	/** Events initiated from playout-gateway callbacks */
	CALLBACK_PLAYOUT = 20,
}

function playoutToStudioLockPriority(priority: PlayoutLockFunctionPriority): StudioLockFunctionPriority {
	switch (priority) {
		case PlayoutLockFunctionPriority.CALLBACK_PLAYOUT:
			return StudioLockFunctionPriority.CALLBACK_PLAYOUT
		case PlayoutLockFunctionPriority.USER_PLAYOUT:
			return StudioLockFunctionPriority.USER_PLAYOUT
		case PlayoutLockFunctionPriority.MISC:
			return StudioLockFunctionPriority.MISC
		default:
			assertNever(priority)
			return StudioLockFunctionPriority.MISC
	}
}

export interface PlaylistLock extends StudioLock {
	readonly _playlistId: RundownPlaylistId
}

export function isPlaylistLock(obj: any): obj is PlaylistLock {
	const obj0 = obj as PlaylistLock
	return isStudioLock(obj) && !!obj0._playlistId
}

export function getPlaylistIdFromCacheOrLock(cacheOrLock: any): RundownPlaylistId | undefined {
	if (isPlaylistLock(cacheOrLock)) {
		return cacheOrLock._playlistId
	} else {
		return (cacheOrLock as Partial<ReadOnlyCache<CacheForPlayoutPreInit>>).PlaylistId
	}
}

/**
 * Lock the playlist for performing a playout operation and load a cache of data.
 * Note: This also locks the studio, if that is already locked then use 'rundownPlaylistPlayoutFromStudioLockFunction' instead
 * @param access Meteor call context, to authenticate the request. Pass null if already authenticated
 * @param contextStr Contextual information for the call to this function. to aid debugging
 * @param rundownPlaylistId Id of the playlist to lock
 * @param fcn Function to run while holding the lock
 */
export function runPlayoutOperationWithCache<T>(
	access: VerifiedRundownPlaylistContentAccess | null,
	contextStr: string,
	rundownPlaylistId: RundownPlaylistId,
	priority: PlayoutLockFunctionPriority,
	preInitFcn: null | ((cache: ReadOnlyCache<CacheForPlayoutPreInit>) => Promise<void> | void),
	fcn: (cache: CacheForPlayout) => Promise<T> | T
): Awaited<T> {
	let tmpPlaylist: RundownPlaylist
	if (access) {
		tmpPlaylist = access.playlist
		if (!tmpPlaylist) throw new Meteor.Error(404, `Rundown Playlist "${rundownPlaylistId}" not found!`)
		if (tmpPlaylist._id !== rundownPlaylistId)
			throw new Meteor.Error(
				500,
				`VerifiedAccess is for wrong Rundown Playlist "${rundownPlaylistId}" vs ${tmpPlaylist._id}!`
			)
	} else {
		const pl = RundownPlaylists.findOne(rundownPlaylistId)
		if (!pl) throw new Meteor.Error(404, `Rundown Playlist "${rundownPlaylistId}" not found!`)
		tmpPlaylist = pl
	}

	return runStudioOperationWithLock(contextStr, tmpPlaylist.studioId, playoutToStudioLockPriority(priority), (lock) =>
		playoutLockFunctionInner(contextStr, lock, tmpPlaylist, priority, preInitFcn, fcn)
	) as Awaited<T>
}

/**
 * Lock the playlist for performing a playout operation and load a cache of data.
 * Warning: This will get the studio lock
 * @param access Contextual information for the call to this function. to aid debugging
 * @param studioCache Cache of Studio or another Playlist data (used to verify the lock order)
 * @param rundownPlaylistId Id of the playlist to lock
 * @param priority Priority of function execution
 * @param fcn Function to run while holding the lock
 */
export function runPlayoutOperationWithLock<T>(
	access: VerifiedRundownPlaylistContentAccess | null,
	contextStr: string,
	rundownPlaylistId: RundownPlaylistId,
	priority: PlayoutLockFunctionPriority,
	fcn: (lock: PlaylistLock, tmpPlaylist: ReadonlyDeep<RundownPlaylist>) => Promise<T> | T
): Awaited<Awaited<T>> {
	let tmpPlaylist: RundownPlaylist
	if (access) {
		tmpPlaylist = access.playlist
		if (!tmpPlaylist) throw new Meteor.Error(404, `Rundown Playlist "${rundownPlaylistId}" not found!`)
	} else {
		const pl = RundownPlaylists.findOne(rundownPlaylistId)
		if (!pl) throw new Meteor.Error(404, `Rundown Playlist "${rundownPlaylistId}" not found!`)
		tmpPlaylist = pl
	}

	return runStudioOperationWithLock(
		contextStr,
		tmpPlaylist.studioId,
		playoutToStudioLockPriority(priority),
		(studioLock) =>
			runPlayoutOperationWithLockFromStudioOperation(
				contextStr,
				studioLock,
				tmpPlaylist,
				priority,
				(playoutLock) => fcn(playoutLock, tmpPlaylist)
			)
	)
}

/**
 * Lock the playlist for performing a playout operation and load a cache of data.
 * Note: If the studio lock is not currently held, use 'rundownPlaylistPlayoutLockFunction' insted
 * @param context Contextual information for the call to this function. to aid debugging
 * @param studioCache Cache of Studio data (used to verify the lock order)
 * @param rundownPlaylistId Id of the playlist to lock
 * @param fcn Function to run while holding the lock
 */
export function runPlayoutOperationWithCacheFromStudioOperation<T>(
	context: string,
	cacheOrLock: ReadOnlyCache<CacheForStudio> | ReadOnlyCache<CacheForPlayoutPreInit> | StudioLock | PlaylistLock, // Important to verify correct lock is held
	tmpPlaylist: ReadonlyDeep<RundownPlaylist>,
	priority: PlayoutLockFunctionPriority,
	preInitFcn: null | ((cache: ReadOnlyCache<CacheForPlayoutPreInit>) => Promise<void> | void),
	fcn: (cache: CacheForPlayout) => Promise<T> | T
): Awaited<T> {
	// Validate the lock is correct
	const options: PlayoutLockOptions = {}
	const lockStudioId = getStudioIdFromCacheOrLock(cacheOrLock)
	const lockPlaylistId = getPlaylistIdFromCacheOrLock(cacheOrLock)
	if (lockPlaylistId === tmpPlaylist._id) options.skipPlaylistLock = true

	if (lockStudioId != tmpPlaylist.studioId)
		throw new Meteor.Error(
			500,
			`Tried to lock Playlist "${tmpPlaylist._id}" for Studio "${lockStudioId}" but it belongs to "${tmpPlaylist.studioId}"`
		)

	return playoutLockFunctionInner(
		context,
		{ _studioId: lockStudioId },
		tmpPlaylist,
		priority,
		preInitFcn,
		fcn,
		options
	)
}

/**
 * Lock the playlist for performing a playout operation and load a cache of data.
 * Warning: This MUST be called with the correct studio lock
 * @param context Contextual information for the call to this function. to aid debugging
 * @param studioCache Cache of Studio or another Playlist data (used to verify the lock order)
 * @param rundownPlaylistId Id of the playlist to lock
 * @param priority Priority of function execution
 * @param fcn Function to run while holding the lock
 */
export function runPlayoutOperationWithLockFromStudioOperation<T>(
	context: string,
	studioCacheOrLock: StudioLock | ReadOnlyCache<CacheForStudio>,
	tmpPlaylist: Pick<ReadonlyDeep<RundownPlaylist>, '_id' | 'studioId'>,
	priority: PlayoutLockFunctionPriority,
	fcn: (lock: PlaylistLock) => Promise<T> | T
): Awaited<T> {
	const lockStudioId = getStudioIdFromCacheOrLock(studioCacheOrLock)
	if (lockStudioId != tmpPlaylist.studioId)
		throw new Meteor.Error(
			500,
			`Tried to lock Playlist "${tmpPlaylist._id}" for Studio "${lockStudioId}" but it belongs to "${tmpPlaylist.studioId}"`
		)

	return syncFunction(
		() => {
			const span = profiler.startSpan(`playoutLockFunction.${context}`)
			const res = waitForPromise(fcn({ _studioId: lockStudioId, _playlistId: tmpPlaylist._id }))
			span?.end()
			return res
		},
		context,
		`rundown_playlist_${tmpPlaylist._id}`,
		undefined,
		priority
	)()
}

interface PlayoutLockOptions {
	skipPlaylistLock?: boolean
}

/**
 * Lock the playlist for performing a playout operation and load a cache of data.
 * Warning: The Studio lock must be held
 * @param context Contextual information for the call to this function. to aid debugging
 * @param studioCache Cache of Studio data (used to verify the lock order)
 * @param rundownPlaylistId Id of the playlist to lock
 * @param priority Priority of function execution
 * @param fcn Function to run while holding the lock
 */
function playoutLockFunctionInner<T>(
	context: string,
	lock: StudioLock,
	tmpPlaylist: ReadonlyDeep<RundownPlaylist>,
	priority: PlayoutLockFunctionPriority,
	preInitFcn: null | ((cache: ReadOnlyCache<CacheForPlayoutPreInit>) => Promise<void> | void),
	fcn: (cache: CacheForPlayout) => Promise<T> | T,
	options?: PlayoutLockOptions
): Awaited<T> {
	async function doPlaylistInner() {
		const initCache = await CacheForPlayout.createPreInit(tmpPlaylist)

		if (preInitFcn) {
			await preInitFcn(initCache)
		}

		const fullCache = await CacheForPlayout.fromInit(initCache)

		const res = await fcn(fullCache)

		await fullCache.saveAllToDatabase()

		return res
	}

	if (options?.skipPlaylistLock) {
		const span = profiler.startSpan(`playoutLockFunction.skipped.${context}`)
		const res = waitForPromise(doPlaylistInner())
		span?.end()
		return res
	} else {
		return runPlayoutOperationWithLockFromStudioOperation(context, lock, tmpPlaylist, priority, doPlaylistInner)
	}
}
