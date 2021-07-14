import { StudioId } from '../../../lib/collections/Studios'
import { ReadOnlyCache } from '../../cache/CacheBase'
import { pushWorkToQueue } from '../../codeControl'
import { profiler } from '../profiler'
import { CacheForStudio } from './cache'

/** Priority for handling of synchronous events. Higher value means higher priority */
export enum StudioLockFunctionPriority {
	MISC = 0,
	/** Events initiated from user, for playout */
	USER_PLAYOUT = 10,
	/** Events initiated from playout-gateway callbacks */
	CALLBACK_PLAYOUT = 20,
}

export interface StudioLock {
	readonly _studioId: StudioId
}

export function isStudioLock(obj: any): obj is StudioLock {
	const obj0 = obj as StudioLock
	return !!obj0._studioId
}

export function getStudioIdFromCacheOrLock(
	cacheOrLock: StudioLock | Pick<ReadOnlyCache<CacheForStudio>, 'Studio'>
): StudioId {
	if (isStudioLock(cacheOrLock)) {
		return cacheOrLock._studioId
	} else {
		return cacheOrLock.Studio.doc._id
	}
}

/**
 * Lock the studio and load a cache of data about the studio
 * @param context Contextual information for the call to this function. to aid debugging
 * @param studioId Id of the studio to lock
 * @param fcn Function to run while holding the lock
 */
export async function runStudioOperationWithCache<T>(
	context: string,
	studioId: StudioId,
	priority: StudioLockFunctionPriority,
	fcn: (cache: CacheForStudio) => Promise<T>
): Promise<T> {
	return runStudioOperationWithLock(context, studioId, priority, async () => {
		const cache = await CacheForStudio.create(studioId)

		const res = await fcn(cache)

		await cache.saveAllToDatabase()

		return res
	})
}

/**
 * Lock the studio
 * @param context Contextual information for the call to this function. to aid debugging
 * @param studioId Id of the studio to lock
 * @param fcn Function to run while holding the lock
 */
export async function runStudioOperationWithLock<T>(
	context: string,
	studioId: StudioId,
	priority: StudioLockFunctionPriority,
	fcn: (lock: StudioLock) => Promise<T>
): Promise<T> {
	return pushWorkToQueue(
		`studio_${studioId}`,
		context,
		async () => {
			const span = profiler.startSpan(`studioLockFunction.${context}`)
			const res = await fcn({ _studioId: studioId })
			span?.end()
			return res
		},
		priority
	)
}
