import { addMigrationSteps } from './databaseMigration'
import { getCoreSystem } from '../../lib/collections/CoreSystem'
import * as semver from 'semver'
import { getDeprecatedDatabases, dropDeprecatedDatabases } from './deprecatedDatabases/1_13_0'
import * as _ from 'underscore'
import { removeCollectionProperty, setExpectedVersion } from './lib'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'

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
	setExpectedVersion('expectedVersion.playoutDevice', PeripheralDeviceAPI.DeviceType.PLAYOUT, '_process', '^1.11.0'),
	setExpectedVersion('expectedVersion.mosDevice', PeripheralDeviceAPI.DeviceType.MOS, '_process', '^1.5.1'),
	setExpectedVersion(
		'expectedVersion.mediaManager',
		PeripheralDeviceAPI.DeviceType.MEDIA_MANAGER,
		'_process',
		'^1.2.1'
	),

	removeCollectionProperty('Studios', {}, 'testToolsConfig.recording'),

	{
		id: 'Drop removed collections r25',
		canBeRunAutomatically: true,
		validate: () => {
			let databaseSystem = getCoreSystem()

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
