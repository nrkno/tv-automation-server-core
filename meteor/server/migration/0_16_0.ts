import { addMigrationSteps } from './databaseMigration'
import { getCoreSystem, setCoreSystemStorePath } from '../../lib/collections/CoreSystem'
import * as _ from 'underscore'

/**
 * This file contains system specific migration steps.
 * These files are combined with / overridden by migration steps defined in the blueprints.
 */

// 0.16.0: Release 3
export const addSteps = addMigrationSteps('0.16.0', [
	{
		id: 'CoreSystem.storePath',
		canBeRunAutomatically: false,
		validate: () => {
			const system = getCoreSystem()
			if (!system) return 'CoreSystem not found!'
			if (!system.storePath) return 'CoreSystem.storePath not set!'
			if (!_.isString(system.storePath)) return 'CoreSystem.storePath must be a string!'
			if (system.storePath.slice(-1) === '/') return 'CoreSystem.storePath must not end with "/"!'
			return false
		},
		migrate: (input) => {
			if (input.storePath) {
				setCoreSystemStorePath(input.storePath)
			}
		},
		input: [
			{
				label: 'File path for persistant storage',
				description: 'Enter the file path for the persistant storage (example "/opt/coredisk")',
				inputType: 'text',
				attribute: 'storePath',
			},
		],
	},
])
