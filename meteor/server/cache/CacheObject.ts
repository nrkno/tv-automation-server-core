import {
	ProtectedString,
	mongoModify,
	unprotectString,
	getRandomId,
	clone,
	deleteAllUndefinedProperties,
} from '../../lib/lib'
import { MongoModifier } from '../../lib/typings/meteor'
import { Meteor } from 'meteor/meteor'
import _ from 'underscore'
import { profiler } from '../api/profiler'
import { ReadonlyDeep } from 'type-fest'
import { logger } from '../logging'
import { Changes } from '../lib/database'
import { AsyncTransformedCollection } from '../../lib/collections/lib'

/**
 * Caches a single object, allowing reads from cache, but not writes
 * This should be used when the cache can only have one of something, and that must exist
 */
export class DbCacheReadObject<
	Class extends DBInterface,
	DBInterface extends { _id: ProtectedString<any> },
	DocOptional extends boolean = false
> {
	protected _document: Class
	protected _rawDocument: Class

	// Set when the whole cache is to be removed from the db, to indicate that writes are not valid and will be ignored
	protected isToBeRemoved = false

	protected constructor(
		protected readonly _collection: AsyncTransformedCollection<Class, DBInterface>,
		private readonly _optional: DocOptional,
		doc: DocOptional extends true ? ReadonlyDeep<Class> | undefined : ReadonlyDeep<Class>
	) {
		this._document = (doc ? this._transform(clone(doc as any)) : doc) as any
		this._rawDocument = clone(doc as any)
	}
	get name(): string | null {
		return this._collection.name
	}

	public static createFromDoc<
		Class extends DBInterface,
		DBInterface extends { _id: ProtectedString<any> },
		DocOptional extends boolean = false
	>(
		collection: AsyncTransformedCollection<Class, DBInterface>,
		optional: DocOptional,
		doc: DocOptional extends true ? ReadonlyDeep<Class> | undefined : ReadonlyDeep<Class>
	): DbCacheReadObject<Class, DBInterface, DocOptional> {
		return new DbCacheReadObject<Class, DBInterface, DocOptional>(collection, optional, doc)
	}

	public static async createFromDatabase<
		Class extends DBInterface,
		DBInterface extends { _id: ProtectedString<any> },
		DocOptional extends boolean = false
	>(
		collection: AsyncTransformedCollection<Class, DBInterface>,
		optional: DocOptional,
		id: DBInterface['_id']
	): Promise<DbCacheReadObject<Class, DBInterface, DocOptional>> {
		const doc = await collection.findOneAsync(id)
		if (!doc && !optional) {
			throw new Meteor.Error(
				404,
				`DbCacheReadObject population for "${collection['name']}" failed. Document "${id}" was not found`
			)
		}

		return DbCacheReadObject.createFromDoc<Class, DBInterface, DocOptional>(collection, optional, doc as any)
	}

	get doc(): DocOptional extends true ? ReadonlyDeep<Class> | undefined : ReadonlyDeep<Class> {
		return this._document as any
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
	}
}

/**
 * Caches a single object, allowing reads and writes that will be later committed back to mongo
 * This should be used when the cache can only have one of something, and that must exist
 */
export class DbCacheWriteObject<
	Class extends DBInterface,
	DBInterface extends { _id: ProtectedString<any> },
	DocOptional extends boolean = false
> extends DbCacheReadObject<Class, DBInterface, DocOptional> {
	private _updated = false

	constructor(
		collection: AsyncTransformedCollection<Class, DBInterface>,
		optional: DocOptional,
		doc: DocOptional extends true ? ReadonlyDeep<Class> | undefined : ReadonlyDeep<Class>
	) {
		super(collection, optional, doc)
	}

	public static createFromDoc<
		Class extends DBInterface,
		DBInterface extends { _id: ProtectedString<any> },
		DocOptional extends boolean = false
	>(
		collection: AsyncTransformedCollection<Class, DBInterface>,
		optional: DocOptional,
		doc: DocOptional extends true ? ReadonlyDeep<Class> | undefined : ReadonlyDeep<Class>
	): DbCacheWriteObject<Class, DBInterface, DocOptional> {
		return new DbCacheWriteObject<Class, DBInterface, DocOptional>(collection, optional, doc)
	}

	public static async createFromDatabase<
		Class extends DBInterface,
		DBInterface extends { _id: ProtectedString<any> },
		DocOptional extends boolean = false
	>(
		collection: AsyncTransformedCollection<Class, DBInterface>,
		optional: DocOptional,
		id: DBInterface['_id']
	): Promise<DbCacheWriteObject<Class, DBInterface, DocOptional>> {
		const doc = await collection.findOneAsync(id)
		if (!doc && !optional) {
			throw new Meteor.Error(
				404,
				`DbCacheWriteObject population for "${collection['name']}" failed. Document "${id}" was not found`
			)
		}

		return DbCacheWriteObject.createFromDoc<Class, DBInterface, DocOptional>(collection, optional, doc as any)
	}

	protected assertNotToBeRemoved(methodName: string): void {
		if (this.isToBeRemoved) {
			const msg = `DbCacheWriteObject: got call to "${methodName} when cache has been flagged for removal"`
			if (Meteor.isProduction) {
				logger.warn(msg)
			} else {
				throw new Meteor.Error(500, msg)
			}
		}
	}

	update(modifier: ((doc: DBInterface) => DBInterface) | MongoModifier<DBInterface>): boolean {
		this.assertNotToBeRemoved('update')

		const localDoc: ReadonlyDeep<Class> | undefined = this.doc
		if (!localDoc) throw new Meteor.Error(404, `Error: The document does not yet exist`)

		const newDoc: DBInterface = _.isFunction(modifier)
			? modifier(clone(localDoc))
			: mongoModify({}, clone(localDoc), modifier)

		if (unprotectString(newDoc._id) !== unprotectString(localDoc._id)) {
			throw new Meteor.Error(
				500,
				`Error: The (immutable) field '_id' was found to have been altered to _id: "${newDoc._id}"`
			)
		}

		// ensure no properties are 'undefined'
		deleteAllUndefinedProperties(newDoc)

		if (!_.isEqual(this.doc, newDoc)) {
			this._document = this._transform(newDoc)

			this._updated = true
			return true
		}

		return false
	}

	async updateDatabaseWithData(): Promise<Changes> {
		if (this._updated && !this.isToBeRemoved) {
			const span = profiler.startSpan(`DbCacheWriteObject.updateDatabaseWithData.${this.name}`)

			const pUpdate = await this._collection.updateAsync(this._document._id, this._document)
			if (pUpdate < 1) {
				throw new Meteor.Error(500, `Failed to update`)
			}

			if (span) span.end()

			return {
				added: 0,
				updated: 1,
				removed: 0,
			}
		} else {
			return {
				added: 0,
				updated: 0,
				removed: 0,
			}
		}
	}

	discardChanges() {
		if (this.isModified()) {
			this._updated = false
			this._document = this._rawDocument ? this._transform(clone(this._rawDocument)) : this._rawDocument
		}
	}

	isModified(): boolean {
		return this._updated
	}
}

/**
 * Caches a single object, allowing reads and writes that will be later committed back to mongo. This variant allows the object to start off undefined
 * This should be used when the cache can only have one of something, and that must exist
 */
export class DbCacheWriteOptionalObject<
	Class extends DBInterface,
	DBInterface extends { _id: ProtectedString<any> }
> extends DbCacheWriteObject<Class, DBInterface, true> {
	private _inserted = false

	constructor(collection: AsyncTransformedCollection<Class, DBInterface>, doc: ReadonlyDeep<Class> | undefined) {
		super(collection, true, doc)
	}

	public static createOptionalFromDoc<Class extends DBInterface, DBInterface extends { _id: ProtectedString<any> }>(
		collection: AsyncTransformedCollection<Class, DBInterface>,
		doc: ReadonlyDeep<Class> | undefined
	): DbCacheWriteOptionalObject<Class, DBInterface> {
		return new DbCacheWriteOptionalObject<Class, DBInterface>(collection, doc)
	}

	public static async createOptionalFromDatabase<
		Class extends DBInterface,
		DBInterface extends { _id: ProtectedString<any> }
	>(
		collection: AsyncTransformedCollection<Class, DBInterface>,
		id: DBInterface['_id']
	): Promise<DbCacheWriteOptionalObject<Class, DBInterface>> {
		const doc = await collection.findOneAsync(id)

		return DbCacheWriteOptionalObject.createOptionalFromDoc<Class, DBInterface>(
			collection,
			doc as ReadonlyDeep<Class> | undefined
		)
	}

	replace(doc: DBInterface): ReadonlyDeep<Class> {
		this.assertNotToBeRemoved('replace')

		this._inserted = true

		if (!doc._id) doc._id = getRandomId()

		const newDoc = clone(doc)

		// ensure no properties are 'undefined'
		deleteAllUndefinedProperties(newDoc)

		this._document = this._transform(newDoc)

		return this._document as any
	}

	async updateDatabaseWithData(): Promise<Changes> {
		if (this._inserted && !this.isToBeRemoved) {
			const span = profiler.startSpan(`DbCacheWriteOptionalObject.updateDatabaseWithData.${this.name}`)

			await this._collection.upsertAsync(this._document._id, this._document)

			if (span) span.end()

			return {
				added: 1,
				updated: 0,
				removed: 0,
			}
		} else {
			return super.updateDatabaseWithData()
		}
	}
}
