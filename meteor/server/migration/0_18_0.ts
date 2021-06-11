import { setExpectedVersion } from './lib'
import { addMigrationSteps } from './databaseMigration'
import { PeripheralDeviceAPI } from '../../lib/api/peripheralDevice'

// 0.18.0: Release 4
export const addSteps = addMigrationSteps('0.18.0', [
	setExpectedVersion('expectedVersion.playoutDevice', PeripheralDeviceAPI.DeviceType.PLAYOUT, '_process', '0.13.0'),
	setExpectedVersion('expectedVersion.mosDevice', PeripheralDeviceAPI.DeviceType.MOS, '_process', '0.4.2'),
])
