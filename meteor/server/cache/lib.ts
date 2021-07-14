import { DBObj, ProtectedString } from '../../lib/lib'
import { MongoQuery } from '../../lib/typings/meteor'
import { DbCacheReadCollection, DbCacheWriteCollection } from './CacheCollection'
import { DbCacheWriteObject, DbCacheWriteOptionalObject } from './CacheObject'
import { SaveIntoDbHooks, ChangedIds, saveIntoBase } from '../lib/database'
import { logger } from '../logging'

export function isDbCacheReadCollection(o: any): o is DbCacheReadCollection<any, any> {
	return !!(o && typeof o === 'object' && o.fillWithDataFromDatabase)
}
export function isDbCacheWritable(
	o: any
): o is DbCacheWriteCollection<any, any> | DbCacheWriteObject<any, any> | DbCacheWriteOptionalObject<any, any> {
	return !!(o && typeof o === 'object' && o.updateDatabaseWithData)
}
/** Caches data, allowing reads from cache, but not writes */
export function saveIntoCache<DocClass extends DBInterface, DBInterface extends DBObj>(
	collection: DbCacheWriteCollection<DocClass, DBInterface>,
	filter: MongoQuery<DBInterface>,
	newData: Array<DBInterface>,
	optionsOrg?: SaveIntoDbHooks<DocClass, DBInterface>
): ChangedIds<DBInterface['_id']> {
	return saveIntoBase(collection.name ?? '', collection.findFetch(filter), newData, {
		...optionsOrg,
		insert: (doc) => collection.insert(doc),
		update: (doc) => collection.replace(doc),
		remove: (doc) => collection.remove(doc._id),
	})
}

export function logChanges(collection: string, changes: ChangedIds<ProtectedString<any>>): void {
	logger.debug(
		`Update collection of "${collection}". Inserted: [${changes.added}] Updated: [${changes.updated}] Removed: [${changes.removed}] Unchanged: ${changes.unchanged.length}`
	)
}
