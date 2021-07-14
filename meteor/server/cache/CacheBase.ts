import * as _ from 'underscore'
import { Meteor } from 'meteor/meteor'
import { isDbCacheWritable } from './lib'
import { sleep, ProtectedString } from '../../lib/lib'
import { logger } from '../logging'
import { isInTestWrite } from '../security/lib/securityVerify'
import { profiler } from '../api/profiler'
import { DbCacheReadCollection, DbCacheWriteCollection } from './CacheCollection'
import { DbCacheReadObject, DbCacheWriteObject, DbCacheWriteOptionalObject } from './CacheObject'
import { anythingChanged, sumChanges } from '../lib/database'

type DeferredFunction<Cache> = (cache: Cache) => void | Promise<void>

type DbCacheWritable<T1 extends T2, T2 extends { _id: ProtectedString<any> }> =
	| DbCacheWriteCollection<T1, T2>
	| DbCacheWriteObject<T1, T2>
	| DbCacheWriteOptionalObject<T1, T2>

export type ReadOnlyCacheInner<T> = T extends DbCacheWriteCollection<infer A, infer B>
	? DbCacheReadCollection<A, B>
	: T extends DbCacheWriteObject<infer A, infer B>
	? DbCacheReadObject<A, B>
	: T extends DbCacheWriteOptionalObject<infer A, infer B>
	? DbCacheReadObject<A, B, true>
	: T
export type ReadOnlyCache<T extends CacheBase<any>> = Omit<
	{ [K in keyof T]: ReadOnlyCacheInner<T[K]> },
	'defer' | 'deferAfterSave' | 'saveAllToDatabase'
>

/** This cache contains data relevant in a studio */
export abstract class ReadOnlyCacheBase<T extends ReadOnlyCacheBase<never>> {
	protected _deferredFunctions: DeferredFunction<T>[] = []
	protected _deferredAfterSaveFunctions: (() => void | Promise<void>)[] = []
	private _activeTimeout: number | null = null
	private _hasTimedOut = false

	constructor() {
		if (!Meteor.isProduction) {
			// When this is set up, we expect saveAllToDatabase() to have been called at the end, otherwise something is wrong
			if (!isInTestWrite()) {
				const futureError = new Meteor.Error(500, `saveAllToDatabase never called`)
				this._activeTimeout = Meteor.setTimeout(() => {
					this._hasTimedOut = true
					logger.error(futureError)
					logger.error(futureError.stack)
				}, 5000)
			}
		}
	}

	_abortActiveTimeout() {
		if (this._activeTimeout) {
			Meteor.clearTimeout(this._activeTimeout)
		}

		if (this._hasTimedOut) {
			const err = new Meteor.Error(500, `saveAllToDatabase called after timeout`)
			logger.warn(err)
			logger.warn(err.stack)
		}
	}

	protected getAllCollections() {
		const highPrioDBs: DbCacheWritable<any, any>[] = []
		const lowPrioDBs: DbCacheWritable<any, any>[] = []

		_.map(_.keys(this), (key) => {
			let db = this[key]
			if (db && typeof db === 'object' && 'getIfLoaded' in db) {
				// If wrapped in a lazy
				db = db.getIfLoaded()
			}
			if (db && isDbCacheWritable(db)) {
				if (key.match(/timeline/i)) {
					highPrioDBs.push(db)
				} else {
					lowPrioDBs.push(db)
				}
			}
		})

		return {
			allDBs: [...highPrioDBs, ...lowPrioDBs],
			highPrioDBs,
			lowPrioDBs,
		}
	}

	async saveAllToDatabase() {
		const span = profiler.startSpan('Cache.saveAllToDatabase')
		this._abortActiveTimeout()

		// Execute cache.defer()'s
		for (let i = 0; i < this._deferredFunctions.length; i++) {
			await this._deferredFunctions[i](this as any)
		}
		this._deferredFunctions.length = 0 // clear the array

		const { highPrioDBs, lowPrioDBs } = this.getAllCollections()

		if (highPrioDBs.length) {
			const anyThingChanged = anythingChanged(
				sumChanges(...(await Promise.all(highPrioDBs.map(async (db) => db.updateDatabaseWithData()))))
			)
			if (anyThingChanged) {
				// Wait a little bit before saving the rest.
				// The idea is that this allows for the high priority publications to update (such as the Timeline),
				// sending the updated timeline to Playout-gateway
				await sleep(2)
			}
		}

		if (lowPrioDBs.length) {
			await Promise.all(lowPrioDBs.map(async (db) => db.updateDatabaseWithData()))
		}

		// Execute cache.deferAfterSave()'s
		for (let i = 0; i < this._deferredAfterSaveFunctions.length; i++) {
			await this._deferredAfterSaveFunctions[i]()
		}
		this._deferredAfterSaveFunctions.length = 0 // clear the array

		if (span) span.end()
	}

	/**
	 * Discard all changes to documents in the cache.
	 * This essentially acts as rolling back this transaction, and lets the cache be reused for another operation instead
	 */
	discardChanges() {
		const { allDBs } = this.getAllCollections()
		for (const coll of allDBs) {
			coll.discardChanges()
		}

		// Discard any hooks too
		this._deferredAfterSaveFunctions.length = 0
		this._deferredFunctions.length = 0
	}

	/** Inform all the collections of the intention for the Cache to be removed. The collections are emptied and marked to reject any further updates */
	protected markCollectionsForRemoval(): void {
		const { allDBs } = this.getAllCollections()
		for (const coll of allDBs) {
			coll.markForRemoval()
		}
	}

	/**
	 * Assert that no changes should have been made to the cache, will throw an Error otherwise. This can be used in
	 * place of `saveAllToDatabase()`, when the code controlling the cache expects no changes to have been made and any
	 * changes made are an error and will cause issues.
	 */
	assertNoChanges() {
		const span = profiler.startSpan('Cache.assertNoChanges')

		function logOrThrowError(error: Meteor.Error) {
			if (!Meteor.isProduction) {
				throw error
			} else {
				logger.error(error)
				logger.error(error.stack)
			}
		}

		const { allDBs } = this.getAllCollections()

		if (this._deferredFunctions.length > 0)
			logOrThrowError(
				new Meteor.Error(
					500,
					`Failed no changes in cache assertion, there were ${this._deferredFunctions.length} deferred functions`
				)
			)

		if (this._deferredAfterSaveFunctions.length > 0)
			logOrThrowError(
				new Meteor.Error(
					500,
					`Failed no changes in cache assertion, there were ${this._deferredAfterSaveFunctions.length} after-save deferred functions`
				)
			)

		_.map(allDBs, (db) => {
			if (db.isModified()) {
				logOrThrowError(
					new Meteor.Error(
						500,
						`Failed no changes in cache assertion, cache was modified: collection: ${db.name}`
					)
				)
			}
		})

		this._abortActiveTimeout()

		if (span) span.end()
	}
}
export abstract class CacheBase<T extends CacheBase<any>> extends ReadOnlyCacheBase<T> {
	/** Defer provided function (it will be run just before cache.saveAllToDatabase() ) */
	defer(fcn: DeferredFunction<T>): void {
		this._deferredFunctions.push(fcn)
	}
	/** Defer provided function to after cache.saveAllToDatabase().
	 * Note that at the time of execution, the cache is no longer available.
	 * */
	deferAfterSave(fcn: () => void | Promise<void>) {
		this._deferredAfterSaveFunctions.push(fcn)
	}
}
