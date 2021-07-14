import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import {
	FindOptions,
	Mongocursor,
	MongoModifier,
	MongoQuery,
	TransformedCollection,
	UpdateOptions,
	UpsertOptions,
} from '../typings/meteor'
import { stringifyObjects, getHash, ProtectedString, makePromise, sleep } from '../lib'
import * as _ from 'underscore'
import { logger } from '../logging'
import { BulkWriteOperation, Collection as RawCollection } from 'mongodb'

const ObserveChangeBufferTimeout = 2000

type Timeout = number

export function ObserveChangesForHash<Ta extends Tb, Tb extends { _id: ProtectedString<any> }>(
	collection: AsyncTransformedCollection<Ta, Tb>,
	hashName: string,
	hashFields: string[],
	skipEnsureUpdatedOnStart?: boolean
) {
	const doUpdate = (id: Tb['_id'], obj: any) => {
		const newHash = getHash(stringifyObjects(_.pick(obj, ...hashFields)))

		if (newHash !== obj[hashName]) {
			logger.debug('Updating hash:', id, hashName + ':', newHash)
			const update = {}
			update[hashName] = newHash
			collection.update(id, { $set: update })
		}
	}

	const observedChangesTimeouts = new Map<Tb['_id'], Timeout>()

	collection.find().observeChanges({
		changed: (id: Tb['_id'], changedFields) => {
			// Ignore the hash field, to stop an infinite loop
			delete changedFields[hashName]

			if (_.keys(changedFields).length > 0) {
				const data: Timeout | undefined = observedChangesTimeouts.get(id)
				if (data !== undefined) {
					// Already queued, so do nothing
				} else {
					// Schedule update
					observedChangesTimeouts.set(
						id,
						Meteor.setTimeout(() => {
							// This looks like a race condition, but is safe as the data for the 'lost' change will still be loaded below
							observedChangesTimeouts.delete(id)

							// Perform hash update
							const obj = collection.findOne(id)
							if (obj) {
								doUpdate(id, obj)
							}
						}, ObserveChangeBufferTimeout)
					)
				}
			}
		},
	})

	if (!skipEnsureUpdatedOnStart) {
		const existing = collection.find().fetch()
		_.each(existing, (entry) => doUpdate(entry['_id'] as any, entry))
	}
}

export function createMongoCollection<Class extends DBInterface, DBInterface extends { _id: ProtectedString<any> }>(
	name: string | null,
	options?: {
		connection?: Object | null
		idGeneration?: string
		transform?: Function
	}
): AsyncTransformedCollection<Class, DBInterface> {
	const collection: TransformedCollection<Class, DBInterface> = new Mongo.Collection<Class>(name, options) as any

	if ((collection as any)._isMock) {
		return new WrappedMockCollection(collection, name)
	} else {
		// Override the default mongodb methods, because the errors thrown by them doesn't contain the proper call stack
		return new WrappedAsyncTransformedCollection(collection, name)
	}
}

export function wrapMongoCollection<DBInterface extends { _id: ProtectedString<any> }>(
	collection: Mongo.Collection<DBInterface>,
	name: string
): AsyncTransformedCollection<DBInterface, DBInterface> {
	return new WrappedAsyncTransformedCollection<DBInterface, DBInterface>(collection as any, name)
}

class WrappedTransformedCollection<Class extends DBInterface, DBInterface extends { _id: ProtectedString<any> }>
	implements TransformedCollection<Class, DBInterface>
{
	readonly #collection: TransformedCollection<Class, DBInterface>

	public readonly name: string | null

	constructor(collection: TransformedCollection<Class, DBInterface>, name: string | null) {
		this.#collection = collection
		this.name = name
	}

	protected get _isMock() {
		// @ts-expect-error re-export private property
		return this.#collection._isMock
	}

	private get _transform() {
		// @ts-expect-error re-export private property
		return this.#collection._transform
	}

	private wrapMongoError(e: any): never {
		const str = (e && e.reason) || e.toString() || e || 'Unknown MongoDB Error'
		throw new Meteor.Error((e && e.error) || 500, `Collection "${this.name}": ${str}`)
	}

	allow(...args: Parameters<TransformedCollection<Class, DBInterface>['allow']>): boolean {
		return this.#collection.allow(...args)
	}
	deny(...args: Parameters<TransformedCollection<Class, DBInterface>['deny']>): boolean {
		return this.#collection.deny(...args)
	}
	find(...args: Parameters<TransformedCollection<Class, DBInterface>['find']>): Mongocursor<Class> {
		try {
			return this.#collection.find(...args)
		} catch (e) {
			this.wrapMongoError(e)
		}
	}
	findOne(...args: Parameters<TransformedCollection<Class, DBInterface>['findOne']>): Class | undefined {
		try {
			return this.#collection.findOne(...args)
		} catch (e) {
			this.wrapMongoError(e)
		}
	}
	insert(...args: Parameters<TransformedCollection<Class, DBInterface>['insert']>): DBInterface['_id'] {
		try {
			return this.#collection.insert(...args)
		} catch (e) {
			this.wrapMongoError(e)
		}
	}
	rawCollection(): RawCollection<DBInterface> {
		return this.#collection.rawCollection()
	}
	rawDatabase(): any {
		return this.#collection.rawDatabase()
	}
	remove(...args: Parameters<TransformedCollection<Class, DBInterface>['remove']>): number {
		try {
			return this.#collection.remove(...args)
		} catch (e) {
			this.wrapMongoError(e)
		}
	}
	update(...args: Parameters<TransformedCollection<Class, DBInterface>['update']>): number {
		try {
			return this.#collection.update(...args)
		} catch (e) {
			this.wrapMongoError(e)
		}
	}
	upsert(...args: Parameters<TransformedCollection<Class, DBInterface>['upsert']>): {
		numberAffected?: number
		insertedId?: DBInterface['_id']
	} {
		try {
			return this.#collection.upsert(...args)
		} catch (e) {
			this.wrapMongoError(e)
		}
	}

	_ensureIndex(...args: Parameters<TransformedCollection<Class, DBInterface>['_ensureIndex']>): void {
		try {
			return this.#collection._ensureIndex(...args)
		} catch (e) {
			this.wrapMongoError(e)
		}
	}
	_dropIndex(...args: Parameters<TransformedCollection<Class, DBInterface>['_dropIndex']>): void {
		try {
			return this.#collection._dropIndex(...args)
		} catch (e) {
			this.wrapMongoError(e)
		}
	}
}

class WrappedAsyncTransformedCollection<Class extends DBInterface, DBInterface extends { _id: ProtectedString<any> }>
	extends WrappedTransformedCollection<Class, DBInterface>
	implements AsyncTransformedCollection<Class, DBInterface>
{
	async findFetchAsync(
		selector: MongoQuery<DBInterface> | string,
		options?: FindOptions<DBInterface>
	): Promise<Array<Class>> {
		// Make the collection fethcing in another Fiber:
		const p = makePromise(() => {
			return this.find(selector as any, options).fetch()
		})
		// Pause the current Fiber briefly, in order to allow for the other Fiber to start executing:
		await sleep(0)
		return p
	}

	async findOneAsync(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		options?: FindOptions<DBInterface>
	): Promise<Class | undefined> {
		const arr = await this.findFetchAsync(selector, { ...options, limit: 1 })
		return arr[0]
	}

	async insertAsync(doc: DBInterface): Promise<DBInterface['_id']> {
		const p = makePromise(() => {
			return this.insert(doc)
		})
		// Pause the current Fiber briefly, in order to allow for the other Fiber to start executing:
		await sleep(0)
		return p
	}

	async insertManyAsync(docs: DBInterface[]): Promise<Array<DBInterface['_id']>> {
		return Promise.all(docs.map((doc) => this.insert(doc)))
	}

	async insertIgnoreAsync(doc: DBInterface): Promise<DBInterface['_id']> {
		const p = makePromise(() => {
			return this.insert(doc)
		}).catch((err) => {
			if (err.toString().match(/duplicate key/i)) {
				// @ts-ignore id duplicate, doc._id must exist
				return doc._id
			} else {
				throw err
			}
		})
		// Pause the current Fiber briefly, in order to allow for the other Fiber to start executing:
		await sleep(0)
		return p
	}

	async updateAsync(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		modifier: MongoModifier<DBInterface>,
		options?: UpdateOptions
	): Promise<number> {
		const p = makePromise(() => {
			return this.update(selector, modifier, options)
		})
		// Pause the current Fiber briefly, in order to allow for the other Fiber to start executing:
		await sleep(0)
		return p
	}

	async upsertAsync(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		modifier: MongoModifier<DBInterface>,
		options?: UpsertOptions
	): Promise<{ numberAffected?: number; insertedId?: DBInterface['_id'] }> {
		const p = makePromise(() => {
			return this.upsert(selector, modifier, options)
		})
		// Pause the current Fiber briefly, in order to allow for the other Fiber to start executing:
		await sleep(0)
		return p
	}

	async removeAsync(selector: MongoQuery<DBInterface> | DBInterface['_id']): Promise<number> {
		const p = makePromise(() => {
			return this.remove(selector)
		})
		// Pause the current Fiber briefly, in order to allow for the other Fiber to start executing:
		await sleep(0)
		return p
	}

	async bulkWriteAsync(ops: Array<BulkWriteOperation<DBInterface>>): Promise<void> {
		if (ops.length > 0) {
			const rawCollection = this.rawCollection()
			const bulkWriteResult = await rawCollection.bulkWrite(ops, {
				ordered: false,
			})
			if (
				bulkWriteResult &&
				_.isArray(bulkWriteResult.result?.writeErrors) &&
				bulkWriteResult.result.writeErrors.length
			) {
				throw new Meteor.Error(
					500,
					`Errors in rawCollection.bulkWrite: ${bulkWriteResult.result.writeErrors.join(',')}`
				)
			}
		}
	}
}

/** This is for the mock mongo collection, as internally it is sync and so we dont need or want to play around with fibers */
class WrappedMockCollection<Class extends DBInterface, DBInterface extends { _id: ProtectedString<any> }>
	extends WrappedTransformedCollection<Class, DBInterface>
	implements AsyncTransformedCollection<Class, DBInterface>
{
	private readonly realSleep: (time: number) => Promise<void>

	constructor(collection: TransformedCollection<Class, DBInterface>, name: string | null) {
		super(collection, name)

		if (!this._isMock) throw new Meteor.Error(500, 'WrappedMockCollection is only valid for a mock collection')

		const realSleep = (Meteor as any).sleepNoFakeTimers
		if (!realSleep) throw new Error('Missing Meteor.sleepNoFakeTimers, looks like the mock is broken?')
		this.realSleep = realSleep
	}
	async findFetchAsync(
		selector: MongoQuery<DBInterface> | string,
		options?: FindOptions<DBInterface>
	): Promise<Array<Class>> {
		await this.realSleep(0)
		return this.find(selector as any, options).fetch()
	}

	async findOneAsync(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		options?: FindOptions<DBInterface>
	): Promise<Class | undefined> {
		const arr = await this.findFetchAsync(selector, { ...options, limit: 1 })
		return arr[0]
	}

	async insertAsync(doc: DBInterface): Promise<DBInterface['_id']> {
		await this.realSleep(0)
		return this.insert(doc)
	}

	async insertManyAsync(docs: DBInterface[]): Promise<Array<DBInterface['_id']>> {
		await this.realSleep(0)
		return Promise.all(docs.map((doc) => this.insert(doc)))
	}

	async insertIgnoreAsync(doc: DBInterface): Promise<DBInterface['_id']> {
		await this.realSleep(0)
		try {
			return this.insert(doc)
		} catch (err) {
			if (err.toString().match(/duplicate key/i)) {
				// @ts-ignore id duplicate, doc._id must exist
				return doc._id
			} else {
				throw err
			}
		}
	}

	async updateAsync(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		modifier: MongoModifier<DBInterface>,
		options?: UpdateOptions
	): Promise<number> {
		await this.realSleep(0)
		return this.update(selector, modifier, options)
	}

	async upsertAsync(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		modifier: MongoModifier<DBInterface>,
		options?: UpsertOptions
	): Promise<{ numberAffected?: number; insertedId?: DBInterface['_id'] }> {
		await this.realSleep(0)
		return this.upsert(selector, modifier, options)
	}

	async removeAsync(selector: MongoQuery<DBInterface> | DBInterface['_id']): Promise<number> {
		await this.realSleep(0)
		return this.remove(selector)
	}

	async bulkWriteAsync(ops: Array<BulkWriteOperation<DBInterface>>): Promise<void> {
		if (ops.length > 0) {
			const rawCollection = this.rawCollection()
			const bulkWriteResult = await rawCollection.bulkWrite(ops, {
				ordered: false,
			})
			if (
				bulkWriteResult &&
				_.isArray(bulkWriteResult.result?.writeErrors) &&
				bulkWriteResult.result.writeErrors.length
			) {
				throw new Meteor.Error(
					500,
					`Errors in rawCollection.bulkWrite: ${bulkWriteResult.result.writeErrors.join(',')}`
				)
			}
		}
	}
}

export interface AsyncTransformedCollection<
	Class extends DBInterface,
	DBInterface extends { _id: ProtectedString<any> }
> extends TransformedCollection<Class, DBInterface> {
	name: string | null

	findFetchAsync(selector: MongoQuery<DBInterface>, options?: FindOptions<DBInterface>): Promise<Array<Class>>
	findOneAsync(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		options?: FindOptions<DBInterface>
	): Promise<Class | undefined>

	insertAsync(doc: DBInterface): Promise<DBInterface['_id']>

	insertManyAsync(doc: DBInterface[]): Promise<Array<DBInterface['_id']>>

	insertIgnoreAsync(doc: DBInterface): Promise<DBInterface['_id']>

	updateAsync(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		modifier: MongoModifier<DBInterface>,
		options?: UpdateOptions
	): Promise<number>

	upsertAsync(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		modifier: MongoModifier<DBInterface>,
		options?: UpsertOptions
	): Promise<{ numberAffected?: number; insertedId?: DBInterface['_id'] }>

	removeAsync(selector: MongoQuery<DBInterface> | DBInterface['_id']): Promise<number>

	bulkWriteAsync(ops: Array<BulkWriteOperation<DBInterface>>): Promise<void>
}
