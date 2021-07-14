import { addMigrationSteps } from './databaseMigration'
import { getCoreSystem } from '../../lib/collections/CoreSystem'
import * as semver from 'semver'
import { getDeprecatedDatabases, dropDeprecatedDatabases } from './deprecatedDatabases/1_13_0'
import * as _ from 'underscore'
import { removeCollectionProperty } from './lib'

/*
 * **************************************************************************************
 *
 *  These migrations are destined for the next release
 *
 * (This file is to be renamed to the correct version number when doing the release)
 *
 * **************************************************************************************
 */
// Release 25
export const addSteps = addMigrationSteps('1.13.0', [
	removeCollectionProperty('Studios', {}, 'testToolsConfig.recording'),

	{
		id: 'Drop removed collections r25',
		canBeRunAutomatically: true,
		validate: () => {
			const databaseSystem = getCoreSystem()

			// Only run this if version is under 1.13.0, in order to not create the deprecated databases
			if (databaseSystem && semver.satisfies(databaseSystem.version, '<1.13.0')) {
				const dbs = getDeprecatedDatabases()

				if (dbs) {
					let foundAnything: string | null = null
					_.find(_.keys(dbs), (collectionName) => {
						const collection = dbs[collectionName]
						if (collection.findOne()) {
							foundAnything = collectionName
							return true
						}
					})
					if (foundAnything) return `Deprecated collection "${foundAnything}" is not empty`
				}
			}
			return false
		},
		migrate: () => {
			const dbs = getDeprecatedDatabases()

			if (dbs) {
				dropDeprecatedDatabases()
			}
		},
	},
])
