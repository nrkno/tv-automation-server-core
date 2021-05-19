import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { addMigrationSteps } from './databaseMigration'
import { ensureCollectionProperty, setExpectedVersion } from './lib'

/*
 * **************************************************************************************
 *
 *  These migrations are destined for the next release
 *
 * **************************************************************************************
 */
// Release 31
export const addSteps = addMigrationSteps('1.19.0', [
	setExpectedVersion('expectedVersion.playoutDevice', PeripheralDeviceAPI.DeviceType.PLAYOUT, '_process', '1.17.0'),
	setExpectedVersion('expectedVersion.mosDevice', PeripheralDeviceAPI.DeviceType.MOS, '_process', '1.10.0'),
	setExpectedVersion(
		'expectedVersion.mediaManager',
		PeripheralDeviceAPI.DeviceType.MEDIA_MANAGER,
		'_process',
		'1.6.0'
	),
	ensureCollectionProperty('CoreSystem', {}, 'cron.casparCGRestart.enabled', true),
])
