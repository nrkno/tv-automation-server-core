import {
	ProtectedString,
	isProtectedString,
	mongoWhere,
	mongoFindOptions,
	getRandomId,
	mongoModify,
	protectString,
	clone,
	unprotectString,
	deleteAllUndefinedProperties,
} from '../../lib/lib'
import { MongoQuery, FindOptions, MongoModifier, FindOneOptions } from '../../lib/typings/meteor'
import _ from 'underscore'
import { profiler } from '../api/profiler'
import { Meteor } from 'meteor/meteor'
import { BulkWriteOperation } from 'mongodb'
import { ReadonlyDeep } from 'type-fest'
import { logger } from '../logging'
import { Changes } from '../lib/database'
import { AsyncTransformedCollection } from '../../lib/collections/lib'

type SelectorFunction<DBInterface> = (doc: DBInterface) => boolean
type DbCacheCollectionDocument<Class> = {
	inserted?: boolean
	updated?: boolean

	document: Class
} | null // removed

/** Caches data, allowing reads from cache, but not writes */
export class DbCacheReadCollection<Class extends DBInterface, DBInterface extends { _id: ProtectedString<any> }> {
	documents = new Map<DBInterface['_id'], DbCacheCollectionDocument<Class>>()
	protected originalDocuments: ReadonlyDeep<Array<Class>> = []

	// Set when the whole cache is to be removed from the db, to indicate that writes are not valid and will be ignored
	protected isToBeRemoved = false

	protected constructor(protected _collection: AsyncTransformedCollection<Class, DBInterface>) {
		//
	}

	public static createFromArray<Class extends DBInterface, DBInterface extends { _id: ProtectedString<any> }>(
		collection: AsyncTransformedCollection<Class, DBInterface>,
		docs: Class[] | ReadonlyDeep<Array<Class>>
	): DbCacheReadCollection<Class, DBInterface> {
		const col = new DbCacheReadCollection(collection)
		col.fillWithDataFromArray(docs as any)
		return col
	}
	public static async createFromDatabase<
		Class extends DBInterface,
		DBInterface extends { _id: ProtectedString<any> }
	>(
		collection: AsyncTransformedCollection<Class, DBInterface>,
		selector: MongoQuery<DBInterface>
	): Promise<DbCacheReadCollection<Class, DBInterface>> {
		const docs = await collection.findFetchAsync(selector)

		return DbCacheReadCollection.createFromArray(collection, docs)
	}

	get name(): string | null {
		return this._collection.name
	}

	findFetch(
		selector?: MongoQuery<DBInterface> | DBInterface['_id'] | SelectorFunction<DBInterface>,
		options?: FindOptions<DBInterface>
	): Class[] {
		const span = profiler.startSpan(`DBCache.findFetch.${this.name}`)

		selector = selector || {}
		if (isProtectedString(selector)) {
			selector = { _id: selector } as MongoQuery<DBInterface>
		}

		let docsToSearch = this.documents
		if (selector['_id'] && _.isString(selector['_id'])) {
			// Optimization: Make the lookup as small as possible:
			docsToSearch = new Map()
			const doc = this.documents.get(protectString(selector['_id']))
			if (doc) {
				docsToSearch.set(protectString(selector['_id']), doc)
			}
		}

		const results: Class[] = []
		docsToSearch.forEach((doc, _id) => {
			if (doc === null) return
			if (
				!selector
					? true
					: isProtectedString(selector)
					? selector === (_id as any)
					: _.isFunction(selector)
					? selector(doc.document)
					: mongoWhere(doc.document, selector)
			) {
				if (doc.document['_id'] !== _id) {
					throw new Meteor.Error(
						500,
						`Error: document._id "${doc.document['_id']}" is not equal to the key "${_id}"`
					)
				}
				results.push(doc.document)
			}
		})

		const res = mongoFindOptions(results, options)
		if (span) span.end()
		return res
	}
	findOne(
		selector?: MongoQuery<DBInterface> | DBInterface['_id'] | SelectorFunction<DBInterface>,
		options?: FindOneOptions<DBInterface>
	): Class | undefined {
		return this.findFetch(selector, options)[0]
	}

	async fillWithDataFromDatabase(selector: MongoQuery<DBInterface>): Promise<number> {
		const span = profiler.startSpan(`DBCache.fillWithDataFromDatabase.${this.name}`)
		const docs = await this._collection.findFetchAsync(selector)

		span?.addLabels({ count: docs.length })

		this.fillWithDataFromArray(docs as any)
		span?.end()
		return docs.length
	}
	/**
	 * Populate this cache with an array of documents.
	 * Note: By default this wipes the current collection first
	 * @param documents The documents to store
	 */
	fillWithDataFromArray(documents: ReadonlyDeep<Array<Class>>, append = false) {
		if (append) {
			this.originalDocuments = this.originalDocuments.concat(documents)
		} else {
			this.originalDocuments = documents
			this.documents = new Map()
		}
		_.each(documents, (doc) => {
			const id = doc._id
			if (this.documents.has(id)) {
				throw new Meteor.Error(
					500,
					`Unable to fill cache with data "${this._collection['name']}", _id "${doc._id}" already exists`
				)
			}

			this.documents.set(id, { document: this._transform(clone(doc)) })
		})
	}
	protected _transform(doc: DBInterface): Class {
		// @ts-ignore hack: using internal function in collection
		const transform = this._collection._transform
		if (transform) {
			return transform(doc)
		} else return doc as Class
	}

	/** Called by the Cache when the Cache is marked as to be removed. The collection is emptied and marked to reject any further updates */
	markForRemoval() {
		this.isToBeRemoved = true
		this.documents = new Map()
		this.originalDocuments = []
	}
}
/** Caches data, allowing writes that will later be committed to mongo */
export class DbCacheWriteCollection<
	Class extends DBInterface,
	DBInterface extends { _id: ProtectedString<any> }
> extends DbCacheReadCollection<Class, DBInterface> {
	protected assertNotToBeRemoved(methodName: string): void {
		if (this.isToBeRemoved) {
			const msg = `DbCacheWriteCollection: got call to "${methodName} when cache has been flagged for removal"`
			if (Meteor.isProduction) {
				logger.warn(msg)
			} else {
				throw new Meteor.Error(500, msg)
			}
		}
	}

	public static createFromArray<Class extends DBInterface, DBInterface extends { _id: ProtectedString<any> }>(
		collection: AsyncTransformedCollection<Class, DBInterface>,
		docs: Class[]
	): DbCacheWriteCollection<Class, DBInterface> {
		const col = new DbCacheWriteCollection(collection)
		col.fillWithDataFromArray(docs as any)
		return col
	}
	public static async createFromDatabase<
		Class extends DBInterface,
		DBInterface extends { _id: ProtectedString<any> }
	>(
		collection: AsyncTransformedCollection<Class, DBInterface>,
		selector: MongoQuery<DBInterface>
	): Promise<DbCacheWriteCollection<Class, DBInterface>> {
		const docs = await collection.findFetchAsync(selector)

		return DbCacheWriteCollection.createFromArray(collection, docs)
	}

	insert(doc: DBInterface): DBInterface['_id'] {
		this.assertNotToBeRemoved('insert')

		const span = profiler.startSpan(`DBCache.insert.${this.name}`)

		const existing = doc._id && this.documents.get(doc._id)
		if (existing) {
			throw new Meteor.Error(500, `Error in cache insert to "${this.name}": _id "${doc._id}" already exists`)
		}
		if (!doc._id) doc._id = getRandomId()
		const newDoc = clone(doc)

		// ensure no properties are 'undefined'
		deleteAllUndefinedProperties(newDoc)

		this.documents.set(doc._id, {
			inserted: existing !== null,
			updated: existing === null,
			document: this._transform(newDoc), // Unlinke a normal collection, this class stores the transformed objects
		})
		if (span) span.end()
		return doc._id
	}
	remove(
		selector: MongoQuery<DBInterface> | DBInterface['_id'] | SelectorFunction<DBInterface>
	): Array<DBInterface['_id']> {
		this.assertNotToBeRemoved('remove')

		const span = profiler.startSpan(`DBCache.remove.${this.name}`)

		const removedIds: DBInterface['_id'][] = []
		if (isProtectedString(selector)) {
			if (this.documents.get(selector)) {
				this.documents.set(selector, null)
				removedIds.push(selector)
			}
		} else {
			const docsToRemove = this.findFetch(selector)
			for (const doc of docsToRemove) {
				removedIds.push(doc._id)
				this.documents.set(doc._id, null)
			}
		}

		if (span) span.end()
		return removedIds
	}
	update(
		selector: MongoQuery<DBInterface> | DBInterface['_id'] | SelectorFunction<DBInterface>,
		modifier: ((doc: DBInterface) => DBInterface) | MongoModifier<DBInterface> = {},
		forceUpdate?: boolean
	): Array<DBInterface['_id']> {
		this.assertNotToBeRemoved('update')

		const span = profiler.startSpan(`DBCache.update.${this.name}`)

		const selectorInModify: MongoQuery<DBInterface> = _.isFunction(selector)
			? {}
			: isProtectedString(selector)
			? ({ _id: selector } as any)
			: selector

		const changedIds: Array<DBInterface['_id']> = []
		_.each(this.findFetch(selector), (doc) => {
			const _id = doc._id

			const newDoc: DBInterface = _.isFunction(modifier)
				? modifier(clone(doc))
				: mongoModify(selectorInModify, clone(doc), modifier)
			if (newDoc._id !== _id) {
				throw new Meteor.Error(
					500,
					`Error: The (immutable) field '_id' was found to have been altered to _id: "${newDoc._id}"`
				)
			}

			// ensure no properties are 'undefined'
			deleteAllUndefinedProperties(newDoc)

			if (forceUpdate || !_.isEqual(doc, newDoc)) {
				const docEntry = this.documents.get(_id)
				if (!docEntry) {
					throw new Meteor.Error(
						500,
						`Error: Trying to update a document "${newDoc._id}", that went missing half-way through!`
					)
				}

				docEntry.document = this._transform(newDoc)
				docEntry.updated = true
			}
			changedIds.push(_id)
		})
		if (span) span.end()
		return changedIds
	}

	/** Returns true if a doc was replace, false if inserted */
	replace(doc: DBInterface | ReadonlyDeep<DBInterface>): boolean {
		this.assertNotToBeRemoved('replace')

		const span = profiler.startSpan(`DBCache.replace.${this.name}`)
		span?.addLabels({ id: unprotectString(doc._id) })

		if (!doc._id) throw new Meteor.Error(500, `Error: The (immutable) field '_id' must be defined: "${doc._id}"`)
		const _id = doc._id

		const newDoc = clone(doc)

		// ensure no properties are 'undefined'
		deleteAllUndefinedProperties(newDoc)

		const oldDoc = this.documents.get(_id)
		if (oldDoc) {
			oldDoc.updated = true
			oldDoc.document = this._transform(newDoc)
		} else {
			this.documents.set(_id, {
				inserted: true,
				document: this._transform(newDoc),
			})
		}

		if (span) span.end()
		return !!oldDoc
	}

	// upsert(
	// 	selector: MongoQuery<DBInterface> | DBInterface['_id'],
	// 	doc: DBInterface,
	// 	forceUpdate?: boolean
	// ): {
	// 	numberAffected?: number
	// 	insertedId?: DBInterface['_id']
	// } {
	// 	this.assertNotToBeRemoved('upsert')

	// 	const span = profiler.startSpan(`DBCache.upsert.${this.name}`)

	// 	if (isProtectedString(selector)) {
	// 		selector = { _id: selector } as any
	// 	}

	// 	const updatedIds = this.update(selector, doc, forceUpdate)
	// 	if (updatedIds.length > 0) {
	// 		if (span) span.end()
	// 		return { numberAffected: updatedIds.length }
	// 	} else {
	// 		if (!selector['_id']) {
	// 			throw new Meteor.Error(500, `Can't upsert without selector._id`)
	// 		}
	// 		if (doc._id !== selector['_id']) {
	// 			throw new Meteor.Error(
	// 				500,
	// 				`Can't upsert, selector._id "${selector['_id']}" not matching doc._id "${doc._id}"`
	// 			)
	// 		}

	// 		if (span) span.end()
	// 		return { numberAffected: 1, insertedId: this.insert(doc) }
	// 	}
	// }
	async updateDatabaseWithData(): Promise<Changes> {
		const span = profiler.startSpan(`DBCache.updateDatabaseWithData.${this.name}`)
		const changes: {
			added: number
			updated: number
			removed: number
		} = {
			added: 0,
			updated: 0,
			removed: 0,
		}

		if (this.isToBeRemoved) {
			// Nothing to save
			return changes
		}

		const updates: BulkWriteOperation<DBInterface>[] = []
		const removedDocs: Class['_id'][] = []
		this.documents.forEach((doc, id) => {
			if (doc === null) {
				removedDocs.push(id)
				changes.removed++
			} else {
				if (doc.inserted) {
					updates.push({
						replaceOne: {
							filter: {
								_id: id as any,
							},
							replacement: doc.document,
							upsert: true,
						},
					})
					changes.added++
				} else if (doc.updated) {
					updates.push({
						replaceOne: {
							filter: {
								_id: id as any,
							},
							replacement: doc.document,
						},
					})
					changes.updated++
				}
				delete doc.inserted
				delete doc.updated
			}
		})
		if (removedDocs.length) {
			updates.push({
				deleteMany: {
					filter: {
						_id: { $in: removedDocs as any },
					},
				},
			})
		}

		const pBulkWriteResult = updates.length > 0 ? this._collection.bulkWriteAsync(updates) : Promise.resolve()

		_.each(removedDocs, (_id) => {
			this.documents.delete(_id)
		})

		await pBulkWriteResult

		if (span) span.addLabels(changes)
		if (span) span.end()
		return changes
	}
	discardChanges() {
		if (this.isModified()) {
			this.fillWithDataFromArray(this.originalDocuments)
		}
	}
	/**
	 * Write all the documents in this cache into another. This assumes that this cache is a subset of the other and was populated with a subset of its data
	 * @param otherCache The cache to update
	 */
	updateOtherCacheWithData(otherCache: DbCacheWriteCollection<Class, DBInterface>) {
		this.documents.forEach((doc, id) => {
			if (doc === null) {
				otherCache.remove(id)
				this.documents.delete(id)
			} else {
				if (doc.inserted || doc.updated) {
					otherCache.replace(doc.document)
				}
				delete doc.inserted
				delete doc.updated
			}
		})
	}
	isModified(): boolean {
		for (const doc of Array.from(this.documents.values())) {
			if (doc === null || doc.inserted || doc.updated) {
				return true
			}
		}
		return false
	}
}
