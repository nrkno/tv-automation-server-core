import { addMigrationSteps } from './databaseMigration'
import { ensureCollectionProperty, setExpectedVersion } from './lib'
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
// Release 26
export const addSteps = addMigrationSteps('1.14.0', [
	setExpectedVersion('expectedVersion.playoutDevice', PeripheralDeviceAPI.DeviceType.PLAYOUT, '_process', '^1.12.0'),
	setExpectedVersion('expectedVersion.mosDevice', PeripheralDeviceAPI.DeviceType.MOS, '_process', '^1.6.0'),

	ensureCollectionProperty('Studios', {}, 'routeSetExclusivityGroups', {}, undefined),
])
