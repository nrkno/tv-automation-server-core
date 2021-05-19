import { addMigrationSteps } from './databaseMigration'
import { setExpectedVersion } from './lib'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { PackageJson } from 'type-fest'
import { CURRENT_SYSTEM_VERSION } from './currentSystemVersion'
const PackageInfo: PackageJson = require('../../package.json')

/** Ensure the devices(gateways) which reside in the mono-repo have migrations to enforce them to be a matching version */
export const addExpectedDeviceVersions = addMigrationSteps(CURRENT_SYSTEM_VERSION, [
	setExpectedVersion(
		'expectedVersion.playoutDevice',
		PeripheralDeviceAPI.DeviceType.PLAYOUT,
		'_process',
		`~${PackageInfo.version}`
	),
	setExpectedVersion(
		'expectedVersion.mosDevice',
		PeripheralDeviceAPI.DeviceType.MOS,
		'_process',
		`~${PackageInfo.version}`
	),
])
