import { addMigrationSteps } from './databaseMigration'
import { ensureCollectionProperty } from './lib'

// 1.1.0 (Release 13)
export const addSteps = addMigrationSteps('1.1.0', [
	// add steps here:
	// {
	// 	id: 'my fancy step',
	// 	canBeRunAutomatically: true,
	// 	validate: () => {
	// 		return false
	// 	},
	// 	migrate: () => {
	// 		//
	// 	}
	// },

	ensureCollectionProperty('CoreSystem', {}, 'serviceMessages', {}),
])
