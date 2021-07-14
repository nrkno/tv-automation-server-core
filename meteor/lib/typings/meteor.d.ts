/* eslint-disable @typescript-eslint/no-unused-vars */
import { Mongo } from 'meteor/mongo'
import { Tracker } from 'meteor/tracker'
import { ProtectedString } from '../lib'
import { Meteor } from 'meteor/meteor'
import { Collection as RawCollection } from 'mongodb'

// This is a copy of the type used in the Users collection,
// to avoid nasty dependencies
/** A string, identifying a User */
export type UserId = ProtectedString<'UserId'>

declare module 'meteor/tracker' {
	namespace Tracker {
		// Fix an incomplete definition of Tracker.nonreactive in @typings/meteor
		function nonreactive<U>(func: () => U): U
	}
}

// Note: This file is temporary, we should make a PR to @typings/meteor later on!

export type SortSpecifier<T> = {
	[P in keyof T]?: -1 | 1
}

// From Meteor docs: It is not possible to mix inclusion and exclusion styles: the keys must either be all 1 or all 0
export type MongoFieldSpecifierOnes<T> = {
	[P in keyof T]?: 1
}
export type MongoFieldSpecifierZeroes<T> = {
	[P in keyof T]?: 0
}
export type MongoFieldSpecifier<T> = MongoFieldSpecifierOnes<T> | MongoFieldSpecifierZeroes<T>

export type IndexSpecifier<T> = {
	[P in keyof T]?: -1 | 1 | string
}

export interface FindOneOptions<DBInterface> {
	sort?: SortSpecifier<DBInterface>
	skip?: number
	fields?: MongoFieldSpecifier<DBInterface>
	reactive?: boolean
	transform?: Function
}
export interface FindOptions<DBInterface> extends FindOneOptions<DBInterface> {
	limit?: number
}
export interface UpdateOptions {
	multi?: boolean
	upsert?: boolean
}
export interface UpsertOptions {
	multi?: boolean
}
/** Mongo Selector. Contains everything that can be sent into collection.find(selector) */
export type MongoSelector<DBInterface> = Mongo.Selector<DBInterface>
/**
 * Subset of MongoSelector, only allows direct queries, not QueryWithModifiers such as $explain etc.
 * Used for simplified expressions (ie not using $and, $or etc..)
 * */
export type MongoQuery<DBInterface> = Mongo.Query<DBInterface>
export type MongoQueryKey<T> = RegExp | T | Mongo.FieldExpression<T> // Allowed properties in a Mongo.Query
export type MongoModifier<DBInterface> = Mongo.Modifier<DBInterface>

export interface Mongocursor<DBInterface extends { _id: ProtectedString<any> }>
	extends Omit<Mongo.Cursor<DBInterface>, 'observe' | 'observeChanges'> {
	observe(callbacks: ObserveCallbacks<DBInterface>): Meteor.LiveQueryHandle
	observeChanges(callbacks: ObserveChangesCallbacks<DBInterface>): Meteor.LiveQueryHandle
}
export interface ObserveCallbacks<DBInterface> {
	added?(document: DBInterface): void
	addedAt?(document: DBInterface, atIndex: number, before: DBInterface): void
	changed?(newDocument: DBInterface, oldDocument: DBInterface): void
	changedAt?(newDocument: DBInterface, oldDocument: DBInterface, indexAt: number): void
	removed?(oldDocument: DBInterface): void
	removedAt?(oldDocument: DBInterface, atIndex: number): void
	movedTo?(document: DBInterface, fromIndex: number, toIndex: number, before: Object): void
}
export interface ObserveChangesCallbacks<DBInterface extends { _id: ProtectedString<any> }> {
	added?(id: DBInterface['_id'], fields: Object): void
	addedBefore?(id: DBInterface['_id'], fields: Object, before: Object): void
	changed?(id: DBInterface['_id'], fields: Object): void
	movedBefore?(id: DBInterface['_id'], before: Object): void
	removed?(id: DBInterface['_id']): void
}
export type FieldNames<DBInterface> = (keyof DBInterface)[]

export interface TransformedCollection<Class extends DBInterface, DBInterface extends { _id: ProtectedString<any> }> {
	allow(options: {
		insert?: (userId: UserId, doc: DBInterface) => boolean
		update?: (userId: UserId, doc: DBInterface, fieldNames: FieldNames<DBInterface>, modifier: any) => boolean
		remove?: (userId: UserId, doc: DBInterface) => boolean
		fetch?: string[]
		transform?: Function
	}): boolean
	deny(options: {
		insert?: (userId: UserId, doc: DBInterface) => boolean
		update?: (userId: UserId, doc: DBInterface, fieldNames: string[], modifier: any) => boolean
		remove?: (userId: UserId, doc: DBInterface) => boolean
		fetch?: string[]
		transform?: Function
	}): boolean
	find(
		selector?: MongoSelector<DBInterface> | Mongo.ObjectID | DBInterface['_id'],
		options?: FindOptions<DBInterface>
	): Mongocursor<Class>
	findOne(
		selector?: MongoSelector<DBInterface> | Mongo.ObjectID | DBInterface['_id'],
		options?: Omit<FindOptions<DBInterface>, 'limit'>
	): Class | undefined
	insert(doc: DBInterface /*, callback?: Function*/): DBInterface['_id']
	rawCollection(): RawCollection<DBInterface>
	rawDatabase(): any
	remove(selector: MongoSelector<DBInterface> | Mongo.ObjectID | DBInterface['_id'] /*, callback?: Function*/): number
	update(
		selector: MongoSelector<DBInterface> | Mongo.ObjectID | DBInterface['_id'],
		modifier: MongoModifier<DBInterface>,
		options?: UpdateOptions
		/*callback?: Function*/
	): number
	upsert(
		selector: MongoSelector<DBInterface> | Mongo.ObjectID | DBInterface['_id'],
		modifier: MongoModifier<DBInterface>,
		options?: UpsertOptions
		/*callback?: Function*/
	): {
		numberAffected?: number
		insertedId?: DBInterface['_id']
	}
	_ensureIndex(
		keys: IndexSpecifier<DBInterface> | string,
		options?: {
			[key: string]: any
		}
	): void

	_dropIndex(
		keys:
			| {
					[key: string]: number | string
			  }
			| string
	): void
}

export interface MeteorError {
	isClientSafe: boolean
	/** Error code. Example: 500 */
	error: number
	/** "Error reason" */
	reason: string
	/** "Error reason [500]" */
	message: string
	/** "Meteor.Error" */
	errorType: string
	details: string
}
