import { Meteor } from 'meteor/meteor'
import { Random } from 'meteor/random'
import * as _ from 'underscore'
import { MongoQuery, MongoModifier, FindOptions } from './typings/meteor'
import { logger } from './logging'
import { Timecode } from 'timecode'
import { Settings } from './Settings'
import * as objectPath from 'object-path'
import { iterateDeeply, iterateDeeplyEnum } from '@sofie-automation/blueprints-integration'
import * as crypto from 'crypto'
import { ReadonlyDeep, PartialDeep } from 'type-fest'
import { ITranslatableMessage } from './api/TranslatableMessage'
import { AsyncTransformedCollection } from './collections/lib'

const cloneOrg = require('fast-clone')

export type Subtract<T extends T1, T1 extends object> = Pick<T, Exclude<keyof T, keyof T1>>
/** Deep clones a value */
export function clone<T>(o: ReadonlyDeep<T> | Readonly<T> | T): T {
	// Use this instead of fast-clone directly, as this retains the type
	return cloneOrg(o)
}

export function flatten<T>(vals: Array<T[] | undefined>): T[] {
	return _.flatten(
		vals.filter((v) => v !== undefined),
		true
	)
}

/**
 * Recursively delete all undefined properties from the supplied object.
 * This is necessary as _.isEqual({ a: 1 }, { a: 1, b: undefined }) === false
 */
export function deleteAllUndefinedProperties<T>(obj: T): void {
	if (Array.isArray(obj)) {
		for (const v of obj) {
			deleteAllUndefinedProperties(v)
		}
	} else if (obj && typeof obj === 'object') {
		const keys = Object.keys(obj)
		for (const key of keys) {
			if (obj[key] === undefined) {
				delete obj[key]
			} else {
				deleteAllUndefinedProperties(obj[key])
			}
		}
	}
}

export function max<T>(vals: T[], iterator: _.ListIterator<T, any>): T | undefined {
	if (vals.length <= 1) {
		return vals[0]
	} else {
		return _.max(vals, iterator)
	}
}

export function getHash(str: string): string {
	const hash = crypto.createHash('sha1')
	return hash
		.update(str)
		.digest('base64')
		.replace(/[\+\/\=]/g, '_') // remove +/= from strings, because they cause troubles
}
/** Creates a hash based on the object properties (excluding ordering of properties) */
export function hashObj(obj: any): string {
	if (typeof obj === 'object') {
		const keys = Object.keys(obj).sort((a, b) => {
			if (a > b) return 1
			if (a < b) return -1
			return 0
		})

		const strs: string[] = []
		for (const key of keys) {
			strs.push(hashObj(obj[key]))
		}
		return getHash(strs.join('|'))
	}
	return obj + ''
}

export function getRandomId<T>(numberOfChars?: number): ProtectedString<T> {
	return Random.id(numberOfChars) as any
}

export function applyToArray<T>(arr: T | T[], func: (val: T) => void) {
	if (Array.isArray(arr)) {
		for (const val of arr) {
			func(val)
		}
	} else {
		func(arr)
	}
}

/**
 * Convenience method to convert a Meteor.call() into a Promise
 * @param  {string} Method name
 * @return {Promise<any>}
 */
export function MeteorPromiseCall(callName: string, ...args: any[]): Promise<any> {
	return new Promise((resolve, reject) => {
		Meteor.call(callName, ...args, (err, res) => {
			if (err) reject(err)
			else resolve(res)
		})
	})
}

export type Time = number
export type TimeDuration = number

const systemTime = {
	hasBeenSet: false,
	diff: 0,
	stdDev: 9999,
}
/**
 * Returns the current (synced) time
 * The synced time differs from Date.now() in that it uses a time synced with the Sofie server,
 * so it is unaffected of whether the client has a well-synced computer time or not.
 * @return {Time}
 */
export function getCurrentTime(): Time {
	return Math.floor(Date.now() - systemTime.diff)
}
export { systemTime }

export interface DBObj {
	_id: ProtectedString<any>
	[key: string]: any
}

export function literal<T>(o: T) {
	return o
}
export type Partial<T> = {
	[P in keyof T]?: T[P]
}
export type ArrayElement<A> = A extends readonly (infer T)[] ? T : never
export function partial<T>(o: Partial<T>) {
	return o
}
export interface IDObj {
	_id: ProtectedString<any>
}
export function partialExceptId<T>(o: Partial<T> & IDObj) {
	return o
}
export interface ObjId {
	_id: ProtectedString<any>
}

export function omit<T, P extends keyof T>(obj: T, ...props: P[]): Omit<T, P> {
	return _.omit(obj, ...(props as string[]))
}

export function applyClassToDocument(docClass, document) {
	return new docClass(document)
}
export function formatDateAsTimecode(date: Date) {
	const tc = Timecode.init({
		framerate: Settings.frameRate + '',
		timecode: date,
		drop_frame: !Number.isInteger(Settings.frameRate),
	})
	return tc.toString()
}
/**
 * @param duration time in milliseconds
 */
export function formatDurationAsTimecode(duration: Time) {
	const tc = Timecode.init({
		framerate: Settings.frameRate + '',
		timecode: (duration * Settings.frameRate) / 1000,
		drop_frame: !Number.isInteger(Settings.frameRate),
	})
	return tc.toString()
}
/**
 * Formats the time as human-readable time "YYYY-MM-DD hh:ii:ss"
 * @param time
 */
export function formatDateTime(time: Time) {
	const d = new Date(time)

	const yyyy: any = d.getFullYear()
	let mm: any = d.getMonth() + 1
	let dd: any = d.getDate()

	let hh: any = d.getHours()
	let ii: any = d.getMinutes()
	let ss: any = d.getSeconds()

	if (mm < 10) mm = '0' + mm
	if (dd < 10) dd = '0' + dd
	if (hh < 10) hh = '0' + hh
	if (ii < 10) ii = '0' + ii
	if (ss < 10) ss = '0' + ss

	return `${yyyy}-${mm}-${dd} ${hh}:${ii}:${ss}`
}
/**
 * Deeply iterates through the object and removes propertys whose value equals null
 * @param obj
 */
export function removeNullyProperties<T>(obj: T): T {
	iterateDeeply(obj, (val, _key) => {
		if (_.isArray(val)) {
			return iterateDeeplyEnum.CONTINUE
		} else if (_.isObject(val)) {
			_.each(_.keys(val), (k) => {
				if (_.isNull(val[k])) {
					delete val[k]
				}
			})
			return iterateDeeplyEnum.CONTINUE
		} else {
			return val
		}
	})
	return obj
}
export function objectPathGet(obj: any, path: string, defaultValue?: any) {
	const v = objectPath.get(obj, path)
	if (v === undefined && defaultValue !== undefined) return defaultValue
	return v
}
export function objectPathSet(obj: any, path: string, value: any) {
	objectPath.set(obj, path, value)
	return obj
}
/**
 * Returns a string that can be used to compare objects for equality
 * @param objs
 */
export function stringifyObjects(objs: any): string {
	if (_.isArray(objs)) {
		return _.map(objs, (obj) => {
			if (obj !== undefined) {
				return stringifyObjects(obj)
			}
		}).join(',')
	} else if (_.isFunction(objs)) {
		return ''
	} else if (_.isObject(objs)) {
		const keys = _.sortBy(_.keys(objs), (k) => k)

		return _.compact(
			_.map(keys, (key) => {
				if (objs[key] !== undefined) {
					return key + '=' + stringifyObjects(objs[key])
				} else {
					return null
				}
			})
		).join(',')
	} else {
		return objs + ''
	}
}
export const Collections: { [name: string]: AsyncTransformedCollection<any, any> } = {}
export function registerCollection(name: string, collection: AsyncTransformedCollection<any, any>) {
	Collections[name] = collection
}
// export const getCollectionIndexes: (collection: TransformedCollection<any, any>) => Array<any> = Meteor.wrapAsync(
// 	function getCollectionIndexes(collection: TransformedCollection<any, any>, cb) {
// 		let raw = collection.rawCollection()
// 		raw.indexes(cb) // TODO - invalid
// 	}
// )
export const getCollectionStats: (collection: AsyncTransformedCollection<any, any>) => Array<any> = Meteor.wrapAsync(
	function getCollectionStats(collection: AsyncTransformedCollection<any, any>, cb) {
		const raw = collection.rawCollection()
		raw.stats(cb)
	}
)

/**
 * Returns a rank number, to be used to insert new objects in a ranked list
 * @param before   The element before the one-to-be-inserted, null/undefined if inserted first
 * @param after	   The element after the one-to-be-inserted, null/undefined if inserted last
 * @param i        If inserting multiple elements; the internal rank of the to-be-inserted element
 * @param count    If inserting multiple elements, this is total count of inserted elements
 */
export function getRank<T extends { _rank: number }>(
	before: T | null | undefined,
	after: T | null | undefined,
	i: number = 0,
	count: number = 1
): number {
	let newRankMax: number
	let newRankMin: number

	if (after) {
		if (before) {
			newRankMin = before._rank
			newRankMax = after._rank
		} else {
			// First
			newRankMin = after._rank - 1
			newRankMax = after._rank
		}
	} else {
		if (before) {
			// Last
			newRankMin = before._rank
			newRankMax = before._rank + 1
		} else {
			// Empty list
			newRankMin = 0
			newRankMax = 1
		}
	}
	return newRankMin + ((i + 1) / (count + 1)) * (newRankMax - newRankMin)
}

export function normalizeArrayFuncFilter<T>(
	array: Array<T>,
	getKey: (o: T) => string | undefined
): { [indexKey: string]: T } {
	const normalizedObject: any = {}
	for (let i = 0; i < array.length; i++) {
		const key = getKey(array[i])
		if (key !== undefined) {
			normalizedObject[key] = array[i]
		}
	}
	return normalizedObject as { [key: string]: T }
}
export function normalizeArrayFunc<T>(array: Array<T>, getKey: (o: T) => string): { [indexKey: string]: T } {
	const normalizedObject: any = {}
	for (let i = 0; i < array.length; i++) {
		const key = getKey(array[i])
		normalizedObject[key] = array[i]
	}
	return normalizedObject as { [key: string]: T }
}
export function normalizeArray<T>(array: Array<T>, indexKey: keyof T): { [indexKey: string]: T } {
	const normalizedObject: any = {}
	for (let i = 0; i < array.length; i++) {
		const key = array[i][indexKey]
		normalizedObject[key] = array[i]
	}
	return normalizedObject as { [key: string]: T }
}
export function normalizeArrayToMap<T, K extends keyof T>(array: T[], indexKey: K): Map<T[K], T> {
	const normalizedObject = new Map<T[K], T>()
	for (const item of array) {
		const key = item[indexKey]
		normalizedObject.set(key, item)
	}
	return normalizedObject
}

/** Convenience function, to be used when length of array has previously been verified */
export function last<T>(values: T[]): T {
	return _.last(values) as T
}

const cacheResultCache: {
	[name: string]: {
		ttl: number
		value: any
	}
} = {}
/** Cache the result of function for a limited time */
export function cacheResult<T>(name: string, fcn: () => T, limitTime: number = 1000) {
	if (Math.random() < 0.01) {
		Meteor.setTimeout(cleanOldCacheResult, 10000)
	}
	const cache = cacheResultCache[name]
	if (!cache || cache.ttl < Date.now()) {
		const value = fcn()
		cacheResultCache[name] = {
			ttl: Date.now() + limitTime,
			value: value,
		}
		return value
	} else {
		return cache.value
	}
}
export function clearCacheResult(name: string) {
	delete cacheResultCache[name]
}
function cleanOldCacheResult() {
	_.each(cacheResultCache, (cache, name) => {
		if (cache.ttl < Date.now()) clearCacheResult(name)
	})
}
const lazyIgnoreCache: { [name: string]: number } = {}
export function lazyIgnore(name: string, f1: () => void, t: number): void {
	// Don't execute the function f1 until the time t has passed.
	// Subsequent calls will extend the lazyness and ignore the previous call

	if (lazyIgnoreCache[name]) {
		Meteor.clearTimeout(lazyIgnoreCache[name])
	}
	lazyIgnoreCache[name] = Meteor.setTimeout(() => {
		delete lazyIgnoreCache[name]
		f1()
	}, t)
}

export function escapeHtml(text: string): string {
	// Escape strings, so they are XML-compatible:

	const map = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;',
	}
	const nbsp = String.fromCharCode(160) // non-breaking space (160)
	map[nbsp] = ' ' // regular space

	const textLength = text.length
	let outText = ''
	for (let i = 0; i < textLength; i++) {
		const c = text[i]
		if (map[c]) {
			outText += map[c]
		} else {
			outText += c
		}
	}
	return outText
}
const ticCache = {}
/**
 * Performance debugging. tic() starts a timer, toc() traces the time since tic()
 * @param name
 */
export function tic(name: string = 'default') {
	ticCache[name] = Date.now()
}
export function toc(name: string = 'default', logStr?: string | Promise<any>[]) {
	if (_.isArray(logStr)) {
		_.each(logStr, (promise, i) => {
			promise
				.then((result) => {
					toc(name, 'Promise ' + i)
					return result
				})
				.catch((e) => {
					throw e
				})
		})
	} else {
		const t: number = Date.now() - ticCache[name]
		if (logStr) logger.info('toc: ' + name + ': ' + logStr + ': ' + t)
		return t
	}
}

/**
 * Blocks the fiber until all the Promises have resolved
 */
export function waitForPromiseAll<T1, T2, T3, T4, T5, T6>(
	ps: [
		T1 | PromiseLike<T1>,
		T2 | PromiseLike<T2>,
		T3 | PromiseLike<T3>,
		T4 | PromiseLike<T4>,
		T5 | PromiseLike<T5>,
		T6 | PromiseLike<T6>
	]
): [T1, T2, T3, T4, T5, T6]
export function waitForPromiseAll<T1, T2, T3, T4, T5>(
	ps: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike<T4>, T5 | PromiseLike<T5>]
): [T1, T2, T3, T4, T5]
export function waitForPromiseAll<T1, T2, T3, T4>(
	ps: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike<T4>]
): [T1, T2, T3, T4]
export function waitForPromiseAll<T1, T2, T3>(
	ps: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>]
): [T1, T2, T3]
export function waitForPromiseAll<T1, T2>(ps: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>]): [T1, T2]
export function waitForPromiseAll<T>(ps: (T | PromiseLike<T>)[]): T[]
export function waitForPromiseAll<T>(ps: (T | PromiseLike<T>)[]): T[] {
	return waitForPromise(Promise.all(ps))
}

export type Promisify<T> = { [K in keyof T]: Promise<T[K]> }
export function waitForPromiseObj<T extends object>(obj: Promisify<T>): T {
	const values = waitForPromiseAll(_.values<Promise<any>>(obj))
	return _.object(_.keys(obj), values)
}

export type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T

/**
 * Convert a promise to a "synchronous" Fiber function
 * Makes the Fiber wait for the promise to resolve, then return the value of the promise.
 * If the fiber rejects, the function in the Fiber will "throw"
 */
export const waitForPromise: <T>(p: Promise<T> | T) => Awaited<T> = Meteor.wrapAsync(function waitForPromise<T>(
	p: Promise<T> | T,
	cb: (err: any | null, result?: any) => Awaited<T>
) {
	if (Meteor.isClient) throw new Meteor.Error(500, `waitForPromise can't be used client-side`)
	if (cb === undefined && typeof p === 'function') {
		cb = p as any
		p = undefined as any
	}

	Promise.resolve(p)
		.then((result) => {
			cb(null, result)
		})
		.catch((e) => {
			cb(e)
		})
})
/**
 * Convert a Fiber function into a promise
 * Makes the Fiber function to run in its own fiber and return a promise
 */
export function makePromise<T>(fcn: () => T): Promise<T> {
	return new Promise((resolve, reject) => {
		Meteor.defer(() => {
			try {
				resolve(fcn())
			} catch (e) {
				reject(e)
			}
		})
	})
}

export function mongoWhere<T>(o: any, selector: MongoQuery<T>): boolean {
	if (typeof selector !== 'object') {
		// selector must be an object
		return false
	}

	let ok = true
	_.each(selector, (s: any, key: string) => {
		if (!ok) return

		try {
			const keyWords = key.split('.')
			if (keyWords.length > 1) {
				const oAttr = o[keyWords[0]]
				if (_.isObject(oAttr) || oAttr === undefined) {
					const innerSelector: any = {}
					innerSelector[keyWords.slice(1).join('.')] = s
					ok = mongoWhere(oAttr || {}, innerSelector)
				} else {
					ok = false
				}
			} else if (key === '$or') {
				if (_.isArray(s)) {
					let ok2 = false
					_.each(s, (innerSelector) => {
						ok2 = ok2 || mongoWhere(o, innerSelector)
					})
					ok = ok2
				} else {
					throw new Error('An $or filter must be an array')
				}
			} else {
				const oAttr = o[key]

				if (_.isObject(s)) {
					if (_.has(s, '$gt')) {
						ok = oAttr > s.$gt
					} else if (_.has(s, '$gte')) {
						ok = oAttr >= s.$gte
					} else if (_.has(s, '$lt')) {
						ok = oAttr < s.$lt
					} else if (_.has(s, '$lte')) {
						ok = oAttr <= s.$lte
					} else if (_.has(s, '$eq')) {
						ok = oAttr === s.$eq
					} else if (_.has(s, '$ne')) {
						ok = oAttr !== s.$ne
					} else if (_.has(s, '$in')) {
						ok = s.$in.indexOf(oAttr) !== -1
					} else if (_.has(s, '$nin')) {
						ok = s.$nin.indexOf(oAttr) === -1
					} else if (_.has(s, '$exists')) {
						ok = (o[key] !== undefined) === !!s.$exists
					} else if (_.has(s, '$not')) {
						const innerSelector: any = {}
						innerSelector[key] = s.$not
						ok = !mongoWhere(o, innerSelector)
					} else {
						if (_.isObject(oAttr) || oAttr === undefined) {
							ok = mongoWhere(oAttr || {}, s)
						} else {
							ok = false
						}
					}
				} else {
					const innerSelector: any = {}
					innerSelector[key] = { $eq: s }
					ok = mongoWhere(o, innerSelector)
				}
			}
		} catch (e) {
			logger.warn(e || e.reason || e.toString()) // todo: why this logs empty message for TypeError (or any Error)?
			ok = false
		}
	})
	return ok
}
export function mongoFindOptions<Class extends DBInterface, DBInterface extends { _id?: ProtectedString<any> }>(
	docs0: ReadonlyArray<Class>,
	options?: FindOptions<DBInterface>
): Class[] {
	let docs = [...docs0] // Shallow clone it
	if (options) {
		const sortOptions = options.sort
		if (sortOptions) {
			// Underscore doesnt support desc order, or multiple fields, so we have to do it manually
			const keys = Object.keys(sortOptions).filter((k) => sortOptions[k])
			const doSort = (a: any, b: any, i: number): number => {
				if (i >= keys.length) return 0

				const key = keys[i]
				const order = sortOptions[key]

				// Get the values, and handle asc vs desc
				const val1 = objectPath.get(order > 0 ? a : b, key)
				const val2 = objectPath.get(order > 0 ? b : a, key)

				if (_.isEqual(val1, val2)) {
					return doSort(a, b, i + 1)
				} else if (val1 > val2) {
					return 1
				} else {
					return -1
				}
			}

			if (keys.length > 0) {
				docs.sort((a, b) => doSort(a, b, 0))
			}
		}

		if (options.skip) {
			docs = docs.slice(options.skip)
		}
		if (options.limit !== undefined) {
			docs = _.take(docs, options.limit)
		}

		if (options.fields !== undefined) {
			const idVal = options.fields['_id']
			const includeKeys = _.keys(options.fields).filter(
				(key) => key !== '_id' && options.fields![key] !== 0
			) as any as (keyof DBInterface)[]
			const excludeKeys: string[] = _.keys(options.fields).filter(
				(key) => key !== '_id' && options.fields![key] === 0
			)

			// Mongo does allow mixed include and exclude (exception being excluding _id)
			// https://docs.mongodb.com/manual/reference/method/db.collection.find/#projection
			if (includeKeys.length !== 0 && excludeKeys.length !== 0) {
				throw new Meteor.Error(`options.fields cannot contain both include and exclude rules`)
			}

			// TODO - does this need to use objectPath in some way?

			if (includeKeys.length !== 0) {
				if (idVal !== 0) includeKeys.push('_id')
				docs = _.map(docs, (doc) => _.pick(doc, includeKeys)) as any // any since includeKeys breaks strict typings anyway
			} else if (excludeKeys.length !== 0) {
				if (idVal === 0) excludeKeys.push('_id')
				docs = _.map(docs, (doc) => _.omit(doc, excludeKeys)) as any // any since excludeKeys breaks strict typings anyway
			}
		}

		// options.reactive // Not used server-side
		if (options.transform) throw new Meteor.Error(`options.transform not implemented`)
	}
	return docs
}
export function mongoModify<DBInterface extends { _id: ProtectedString<any> }>(
	selector: MongoQuery<DBInterface>,
	doc: DBInterface,
	modifier: MongoModifier<DBInterface>
): DBInterface {
	let replace = false
	for (const [key, value] of Object.entries(modifier)) {
		if (key === '$set') {
			_.each(value, (value: any, key: string) => {
				setOntoPath(doc, key, selector, value)
			})
		} else if (key === '$unset') {
			_.each(value, (value: any, key: string) => {
				unsetPath(doc, key, selector)
			})
		} else if (key === '$push') {
			_.each(value, (value: any, key: string) => {
				pushOntoPath(doc, key, value)
			})
		} else if (key === '$pull') {
			_.each(value, (value: any, key: string) => {
				pullFromPath(doc, key, value)
			})
		} else if (key === '$rename') {
			_.each(value, (value: any, key: string) => {
				renamePath(doc, key, value)
			})
		} else {
			if (key[0] === '$') {
				throw Error(`Update method "${key}" not implemented yet`)
			} else {
				replace = true
			}
		}
	}
	if (replace) {
		const newDoc = modifier as any
		if (!newDoc._id) newDoc._id = doc._id
		return newDoc
	} else {
		return doc
	}
}
/**
 * Mutate a value on a object
 * @param obj Object
 * @param path Path to value in object
 * @param substitutions Object any query values to use instead of $
 * @param mutator Operation to run on the object value
 */
export function mutatePath<T>(
	obj: Object,
	path: string,
	substitutions: Object,
	mutator: (parentObj: Object, key: string) => T
): void {
	if (!path) throw new Meteor.Error(500, 'parameter path missing')

	const attrs = path.split('.')

	const lastAttr = _.last(attrs)
	const attrsExceptLast = attrs.slice(0, -1)

	const generateWildcardAttrInfo = () => {
		const keys = _.filter(_.keys(substitutions), (k) => k.indexOf(currentPath) === 0)
		if (keys.length === 0) {
			// This might be a bad assumption, but as this is for tests, lets go with it for now
			throw new Meteor.Error(500, `missing parameters for $ in "${path}"`)
		}

		const query: any = {}
		const trimmedSubstitutions: any = {}
		_.each(keys, (key) => {
			// Create a mini 'query' and new substitutions with trimmed keys
			const remainingKey = key.substr(currentPath.length)
			if (remainingKey.indexOf('$') === -1) {
				query[remainingKey] = substitutions[key]
			} else {
				trimmedSubstitutions[remainingKey] = substitutions[key]
			}
		})

		return {
			query,
			trimmedSubstitutions,
		}
	}

	let o = obj
	let currentPath = ''
	for (const attr of attrsExceptLast) {
		if (attr === '$') {
			if (!_.isArray(o))
				throw new Meteor.Error(
					500,
					'Object at "' + currentPath + '" is not an array ("' + o + '") (in path "' + path + '")'
				)

			const info = generateWildcardAttrInfo()
			for (const obj of o) {
				// mutate any objects which match
				if (_.isMatch(obj, info.query)) {
					mutatePath(obj, path.substr(currentPath.length + 2), info.trimmedSubstitutions, mutator)
				}
			}

			// Break the outer loop, as it gets handled with the for loop above
			break
		} else {
			if (!_.has(o, attr)) {
				o[attr] = {}
			} else {
				if (!_.isObject(o[attr]))
					throw new Meteor.Error(
						500,
						'Object propery "' + attr + '" is not an object ("' + o[attr] + '") (in path "' + path + '")'
					)
			}
			o = o[attr]
		}
		currentPath += `${attr}.`
	}
	if (!lastAttr) throw new Meteor.Error(500, 'Bad lastAttr')

	if (lastAttr === '$') {
		if (!_.isArray(o))
			throw new Meteor.Error(
				500,
				'Object at "' + currentPath + '" is not an array ("' + o + '") (in path "' + path + '")'
			)

		const info = generateWildcardAttrInfo()
		for (const childPath in o) {
			// mutate any objects which match
			if (_.isMatch(o[childPath], info.query)) {
				mutator(o, childPath)
			}
		}
	} else {
		mutator(o, lastAttr)
	}
}
/**
 * Push a value into a object, and ensure the array exists
 * @param obj Object
 * @param path Path to array in object
 * @param valueToPush Value to push onto array
 */
export function pushOntoPath<T>(obj: Object, path: string, valueToPush: T) {
	const mutator = (o: Object, lastAttr: string) => {
		if (!_.has(o, lastAttr)) {
			o[lastAttr] = []
		} else {
			if (!_.isArray(o[lastAttr]))
				throw new Meteor.Error(
					500,
					'Object propery "' + lastAttr + '" is not an array ("' + o[lastAttr] + '") (in path "' + path + '")'
				)
		}
		const arr = o[lastAttr]

		arr.push(valueToPush)
		return arr
	}
	mutatePath(obj, path, {}, mutator)
}
/**
 * Push a value from a object, when the value matches
 * @param obj Object
 * @param path Path to array in object
 * @param valueToPush Value to push onto array
 */
export function pullFromPath<T>(obj: Object, path: string, matchValue: T) {
	const mutator = (o: Object, lastAttr: string) => {
		if (_.has(o, lastAttr)) {
			if (!_.isArray(o[lastAttr]))
				throw new Meteor.Error(
					500,
					'Object propery "' + lastAttr + '" is not an array ("' + o[lastAttr] + '") (in path "' + path + '")'
				)

			return (o[lastAttr] = _.filter(o[lastAttr], (entry: T) => !_.isMatch(entry, matchValue)))
		}
	}
	mutatePath(obj, path, {}, mutator)
}
/**
 * Set a value into a object
 * @param obj Object
 * @param path Path to value in object
 * @param substitutions Object any query values to use instead of $
 * @param valueToPush Value to set
 */
export function setOntoPath<T>(obj: Object, path: string, substitutions: Object, valueToSet: T) {
	mutatePath(obj, path, substitutions, (parentObj: Object, key: string) => (parentObj[key] = valueToSet))
}
/**
 * Remove a value from a object
 * @param obj Object
 * @param path Path to value in object
 * @param substitutions Object any query values to use instead of $
 */
export function unsetPath(obj: Object, path: string, substitutions: Object) {
	mutatePath(obj, path, substitutions, (parentObj: Object, key: string) => delete parentObj[key])
}
/**
 * Rename a path to value
 * @param obj Object
 * @param oldPath Old path to value in object
 * @param newPath New path to value
 */
export function renamePath(obj: Object, oldPath: string, newPath: string) {
	mutatePath(obj, oldPath, {}, (parentObj: Object, key: string) => {
		setOntoPath(obj, newPath, {}, parentObj[key])
		delete parentObj[key]
	})
}
/**
 * Replaces all invalid characters in order to make the path a valid one
 * @param path
 */
export function fixValidPath(path) {
	return path.replace(/([^a-z0-9_.@()-])/gi, '_')
}

/**
 * Thanks to https://github.com/Microsoft/TypeScript/issues/23126#issuecomment-395929162
 */
export type OptionalPropertyNames<T> = {
	[K in keyof T]-?: undefined extends T[K] ? K : never
}[keyof T]
export type RequiredPropertyNames<T> = {
	[K in keyof T]-?: undefined extends T[K] ? never : K
}[keyof T]
export type OptionalProperties<T> = Pick<T, OptionalPropertyNames<T>>
export type RequiredProperties<T> = Pick<T, RequiredPropertyNames<T>>

export type Diff<T, U> = T extends U ? never : T // Remove types from T that are assignable to U
export type KeysByType<TObj, TVal> = Diff<
	{
		[K in keyof TObj]: TObj[K] extends TVal ? K : never
	}[keyof TObj],
	undefined
>

/**
 * Returns the difference between object A and B
 */
type Difference<A, B extends A> = Pick<B, Exclude<keyof B, keyof RequiredProperties<A>>>
/**
 * Somewhat like _.extend, but with strong types & mandated additional properties
 * @param original Object to be extended
 * @param extendObj properties to add
 */
export function extendMandadory<A, B extends A>(original: A, extendObj: Difference<A, B> & Partial<A>): B {
	return _.extend(original, extendObj)
}

export function trimIfString<T extends any>(value: T): T | string {
	if (_.isString(value)) return value.trim()
	return value
}

export function firstIfArray<T>(value: T | T[] | null | undefined): T | null | undefined
export function firstIfArray<T>(value: T | T[] | null): T | null
export function firstIfArray<T>(value: T | T[] | undefined): T | undefined
export function firstIfArray<T>(value: T | T[]): T
export function firstIfArray<T>(value: any): T {
	return _.isArray(value) ? _.first(value) : value
}

export type WrapAsyncCallback<T> = ((error: Error) => void) & ((error: null, result: T) => void)

/**
 * Wait for specified time
 * @param time
 */
export function waitTime(time: number) {
	waitForPromise(sleep(time))
}
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => Meteor.setTimeout(resolve, ms))
}

/** Runtime-wise, this is a string.
 * In compile-time, this is used to make sure that the "right" string is provided, typings-wise,
 * in order to provide stringer typings.
 */
export interface ProtectedString<T> {
	_protectedType: T
}
export type ProtectedStringProperties<T, K extends keyof T> = {
	[P in keyof T]: P extends K ? ProtectedString<any> : T[P]
}
export function protectString<T extends ProtectedString<any>>(str: string): T
export function protectString<T extends ProtectedString<any>>(str: string | null): T | null
export function protectString<T extends ProtectedString<any>>(str: string | undefined): T | undefined
export function protectString<T extends ProtectedString<any>>(str: string | undefined | null): T | undefined | null {
	return str as any as T
}
export function protectStringArray<T extends ProtectedString<any>>(arr: string[]): T[] {
	return arr as any as T[]
}
export function protectStringObject<O extends object, Props extends keyof O>(
	obj: O
): ProtectedStringProperties<O, Props> {
	return obj as any as ProtectedStringProperties<O, Props>
}
export function unprotectString(protectedStr: ProtectedString<any>): string
export function unprotectString(protectedStr: ProtectedString<any> | null): string | null
export function unprotectString(protectedStr: ProtectedString<any> | undefined): string | undefined
export function unprotectString(protectedStr: ProtectedString<any> | undefined | null): string | undefined | null {
	return protectedStr as any as string
}
export function unprotectStringArray(protectedStrs: Array<ProtectedString<any>>): string[] {
	return protectedStrs as any as string[]
}
export function unDeepString<T extends ProtectedString<any>>(str: ReadonlyDeep<T> | PartialDeep<T>): T {
	return str as T
}
/** Used on protectedStrings instead of _.isString or typeof x === 'string' */
export function isProtectedString(str: any): str is ProtectedString<any> {
	return typeof str === 'string'
}
export type ProtectId<T extends { _id: string }> = Omit<T, '_id'> & { _id: ProtectedString<any> }
export type UnprotectedStringProperties<T extends object | undefined> = {
	[P in keyof T]: T[P] extends ProtectedString<any>
		? string
		: T[P] extends ProtectedString<any> | undefined
		? string | undefined
		: T[P] extends object
		? UnprotectedStringProperties<T[P]>
		: T[P] extends object | undefined
		? UnprotectedStringProperties<T[P]>
		: T[P]
}
export function unprotectObject<T extends object>(obj: T): UnprotectedStringProperties<T>
export function unprotectObject<T extends object>(obj: T | undefined): UnprotectedStringProperties<T> | undefined
export function unprotectObject(obj: undefined): undefined
export function unprotectObject<T extends object>(obj: T | undefined): UnprotectedStringProperties<T> | undefined {
	return obj as any
}
export function unprotectObjectArray<T extends object>(obj: T[]): UnprotectedStringProperties<T>[] {
	return obj as any
}
export function isStringOrProtectedString<T extends ProtectedString<any>>(val: any): val is string | T {
	return _.isString(val)
}

export function unpartialString<T extends ProtectedString<any>>(obj: T | PartialDeep<T>): T
export function unpartialString<T extends ProtectedString<any>>(str: T | PartialDeep<T> | undefined): T | undefined
export function unpartialString<T extends ProtectedString<any>>(str: T | PartialDeep<T> | undefined): T | undefined {
	return str as any
}

export function isPromise<T extends any>(val: any): val is Promise<T> {
	return _.isObject(val) && typeof val.then === 'function' && typeof val.catch === 'function'
}

export function assertNever(_never: never): void {
	// Do nothing. This is a type guard
}

/**
 * This is a fast, shallow compare of two Sets.
 *
 * **Note**: This is a shallow compare, so it will return false if the objects in the arrays are identical, but not the same.
 *
 * @param a
 * @param b
 */
export function equalSets<T extends any>(a: Set<T>, b: Set<T>): boolean {
	if (a === b) return true
	if (a.size !== b.size) return false
	for (const val of a.values()) {
		if (!b.has(val)) return false
	}
	return true
}

/**
 * This is a fast, shallow compare of two arrays that are used as unsorted lists. The ordering of the elements is ignored.
 *
 * **Note**: This is a shallow compare, so it will return false if the objects in the arrays are identical, but not the same.
 *
 * @param a
 * @param b
 */
export function equivalentArrays<T>(a: T[], b: T[]): boolean {
	if (a === b) return true
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) {
		if (!b.includes(a[i])) return false
	}
	return true
}

/**
 * This is a fast, shallow compare of two arrays of the same type.
 *
 * **Note**: This is a shallow compare, so it will return false if the objects in the arrays are identical, but not the same.
 * @param a
 * @param b
 */
export function equalArrays<T>(a: T[], b: T[]): boolean {
	if (a === b) return true
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) {
		if (b[i] !== a[i]) return false
	}
	return true
}

/** Generate the translation for a string, to be applied later when it gets rendered */
export function generateTranslation(key: string, args?: { [k: string]: any }): ITranslatableMessage {
	return {
		key,
		args,
	}
}
