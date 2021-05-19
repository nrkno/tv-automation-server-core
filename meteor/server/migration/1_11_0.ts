import { addMigrationSteps } from './databaseMigration'
import { CoreSystem } from '../../lib/collections/CoreSystem'
import { setExpectedVersion } from './lib'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import _ from 'underscore'

// Release 23
export const addSteps = addMigrationSteps('1.11.0', [
	{
		id: 'Fix serviceMessages in CoreSystem',
		canBeRunAutomatically: true,
		validate: () => {
			const core = CoreSystem.findOne()
			if (core) {
				for (let [key, message] of Object.entries(core.serviceMessages)) {
					if (typeof message.timestamp === 'string') {
						return `Message "${message.message}" has string timestamp.`
					}
				}
				return false
			}
			return false
		},
		migrate: () => {
			const core = CoreSystem.findOne()
			const updateObj = {}
			if (core) {
				for (let [key, message] of Object.entries(core.serviceMessages)) {
					if (typeof message.timestamp !== 'number') {
						updateObj[`serviceMessages.${key}.timestamp`] = new Date(message.timestamp).getTime()
					}
				}
				CoreSystem.update(core._id, {
					$set: updateObj,
				})
			}
		},
	},
	setExpectedVersion('expectedVersion.playoutDevice', PeripheralDeviceAPI.DeviceType.PLAYOUT, '_process', '^1.10.0'),
	// setExpectedVersion('expectedVersion.mosDevice', PeripheralDeviceAPI.DeviceType.MOS, '_process', '^1.4.3'),
])
