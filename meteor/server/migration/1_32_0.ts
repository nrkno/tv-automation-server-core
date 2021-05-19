import { addMigrationSteps } from './databaseMigration'
import { ensureCollectionProperty, setExpectedVersion } from './lib'
import { getCoreSystem } from '../../lib/collections/CoreSystem'
import { dropDeprecatedDatabases, getDeprecatedDatabases } from './deprecatedDatabases/1_32_0'
import semver from 'semver'
import * as _ from 'underscore'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'

// Release 32
export const addSteps = addMigrationSteps('1.32.0', [
	ensureCollectionProperty('Studios', {}, 'packageContainers', {}),
	ensureCollectionProperty('Studios', {}, 'previewContainerIds', {}),
	ensureCollectionProperty('Studios', {}, 'thumbnailContainerIds', {}),

	setExpectedVersion('expectedVersion.playoutDevice', PeripheralDeviceAPI.DeviceType.PLAYOUT, '_process', '1.32.0'),
	setExpectedVersion('expectedVersion.mosDevice', PeripheralDeviceAPI.DeviceType.MOS, '_process', '1.32.0'),
	setExpectedVersion(
		'expectedVersion.mediaManager',
		PeripheralDeviceAPI.DeviceType.MEDIA_MANAGER,
		'_process',
		'1.7.0'
	),

	{
		id: 'Drop removed collections r32',
		canBeRunAutomatically: true,
		validate: () => {
			let databaseSystem = getCoreSystem()

			// Only run this if version is under 1.13.0, in order to not create the deprecated databases
			if (databaseSystem && semver.satisfies(databaseSystem.version, '<1.32.0')) {
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
