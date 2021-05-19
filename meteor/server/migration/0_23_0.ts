import { addMigrationSteps } from './databaseMigration'
import * as _ from 'underscore'
import { Rundowns } from '../../lib/collections/Rundowns'
import { setExpectedVersion } from './lib'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'

// 0.23.0 ( Release 8 )
export const addSteps = addMigrationSteps('0.23.0', [
	{
		// Ensure rundowns have importVersions set
		id: 'rundowns have importVersions',
		canBeRunAutomatically: true,
		validate: () => {
			const rundownCount = Rundowns.find({
				importVersions: { $exists: false },
			}).count()
			if (rundownCount > 0) return 'Rundowns need to be migrated to have importVersions'
			return false
		},
		migrate: () => {
			Rundowns.update(
				{
					importVersions: { $exists: false },
				},
				{
					$set: {
						importVersions: {
							studio: '',
							showStyleBase: '',
							showStyleVariant: '',
							blueprint: '',

							core: '0.0.0',
						},
					},
				},
				{
					multi: true,
				}
			)
		},
	},
	setExpectedVersion('expectedVersion.playoutDevice', PeripheralDeviceAPI.DeviceType.PLAYOUT, '_process', '0.18.0'),
	setExpectedVersion('expectedVersion.mosDevice', PeripheralDeviceAPI.DeviceType.MOS, '_process', '0.5.3'),
])
