import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { addMigrationSteps } from './databaseMigration'
import { setExpectedVersion } from './lib'

// Release 22
export const addSteps = addMigrationSteps('1.10.0', [
	setExpectedVersion('expectedVersion.playoutDevice', PeripheralDeviceAPI.DeviceType.PLAYOUT, '_process', '^1.9.0'),
	setExpectedVersion('expectedVersion.mosDevice', PeripheralDeviceAPI.DeviceType.MOS, '_process', '^1.4.0'),
])
