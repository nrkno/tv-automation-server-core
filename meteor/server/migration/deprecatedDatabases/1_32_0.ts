import { Mongo } from 'meteor/mongo'
import { waitForPromise } from '../../../lib/lib'

interface DeprecatedDatabases {
	AsRunLog: Mongo.Collection<any>
}

let deprecatedDatabases: DeprecatedDatabases | null
let hasDroppedDeprecatedDatabases = false
export function getDeprecatedDatabases(): DeprecatedDatabases | null {
	// This is a singleton
	// Only set up links to the deprecated databases when running migrations
	// because when running this, the collections will be created if not found.

	if (hasDroppedDeprecatedDatabases) return null

	if (deprecatedDatabases) {
		return deprecatedDatabases
	} else {
		deprecatedDatabases = {
			AsRunLog: new Mongo.Collection('asRunLog'),
		}
		return deprecatedDatabases
	}
}
export function dropDeprecatedDatabases(): void {
	const dbs = getDeprecatedDatabases()
	if (dbs) {
		const ps: Promise<any>[] = []

		ps.push(dbs.AsRunLog.rawCollection().drop())

		waitForPromise(
			Promise.all(ps).catch((e) => {
				if (e.toString().match(/ns not found/i)) {
					// Ignore, this means that the collection is not found
					return
				} else {
					throw e
				}
			})
		)

		deprecatedDatabases = null
		hasDroppedDeprecatedDatabases = true
	}
}
