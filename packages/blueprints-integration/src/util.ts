// tslint:disable-next-line:no-submodule-imports
import * as tsrPkgInfo from 'timeline-state-resolver-types/package.json'

/** @deprecated This is temporary and should be removed ASAP. Can we do it better? */
export const TMP_TSR_VERSION: string = tsrPkgInfo.version

export enum iterateDeeplyEnum {
	CONTINUE = '$continue',
}

/**
 * Iterates deeply through object or array
 * @param obj the object or array to iterate through
 * @param iteratee function to apply on every attribute
 */
export function iterateDeeply(
	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
	obj: any,
	iteratee: (val: any, key?: string | number) => any | iterateDeeplyEnum,
	key?: string | number
): any {
	const newValue = iteratee(obj, key)
	if (newValue === iterateDeeplyEnum.CONTINUE) {
		// Continue iterate deeper if possible
		if (obj && typeof obj === 'object') {
			// object or array
			if (Array.isArray(obj)) {
				obj.forEach((v, k) => {
					obj[k] = iterateDeeply(v, iteratee, k)
				})
			} else {
				for (const [k, v] of Object.entries(obj)) {
					obj[k] = iterateDeeply(v, iteratee, k)
				}
			}
		} else {
			// don't change anything
		}
		return obj
	} else {
		return newValue
	}
}
/**
 * Iterates deeply through object or array, using an asynchronous iteratee
 * @param obj the object or array to iterate through
 * @param iteratee function to apply on every attribute
 */
export async function iterateDeeplyAsync(
	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
	obj: any,
	iteratee: (val: any, key?: string | number) => Promise<any | iterateDeeplyEnum>,
	key?: string | number
): Promise<any> {
	const newValue = await iteratee(obj, key)
	if (newValue === iterateDeeplyEnum.CONTINUE) {
		// Continue iterate deeper if possible
		if (obj && typeof obj === 'object') {
			if (Array.isArray(obj)) {
				await Promise.all(
					obj.map(async (v, k) => {
						obj[k] = await iterateDeeplyAsync(v, iteratee, k)
					})
				)
			} else {
				await Promise.all(
					Object.entries(obj).map(async ([k, v]) => {
						obj[k] = await iterateDeeplyAsync(v, iteratee, k)
					})
				)
			}
		} else {
			// don't change anything
		}
		return obj
	} else {
		return newValue
	}
}
