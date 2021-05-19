import { addMigrationSteps } from './databaseMigration'
import { ensureCollectionProperty, setExpectedVersion } from './lib'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'

// 1.1.0 (Release 13)
export const addSteps = addMigrationSteps('1.1.0', [
	// add steps here:
	// {
	// 	id: 'my fancy step',
	// 	canBeRunAutomatically: true,
	// 	validate: () => {
	// 		return false
	// 	},
	// 	migrate: () => {
	// 		//
	// 	}
	// },

	ensureCollectionProperty('CoreSystem', {}, 'serviceMessages', {}),
	setExpectedVersion('expectedVersion.playoutDevice', PeripheralDeviceAPI.DeviceType.PLAYOUT, '_process', '^1.1.0'),
])
