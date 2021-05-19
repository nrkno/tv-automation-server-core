import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { addMigrationSteps } from './databaseMigration'
import { setExpectedVersion } from './lib'

// Release 33
export const addSteps = addMigrationSteps('1.33.0', [
	setExpectedVersion(
		'expectedVersion.mediaManager',
		PeripheralDeviceAPI.DeviceType.MEDIA_MANAGER,
		'_process',
		'1.8.0-release33.0'
	),
])
