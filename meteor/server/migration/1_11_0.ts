import { addMigrationSteps } from './databaseMigration'
import { CoreSystem } from '../../lib/collections/CoreSystem'

// Release 23
export const addSteps = addMigrationSteps('1.11.0', [
	{
		id: 'Fix serviceMessages in CoreSystem',
		canBeRunAutomatically: true,
		validate: () => {
			const core = CoreSystem.findOne()
			if (core) {
				for (const message of Object.values(core.serviceMessages)) {
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
				for (const [key, message] of Object.entries(core.serviceMessages)) {
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
])
