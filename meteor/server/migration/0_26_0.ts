import { addMigrationSteps } from './databaseMigration'

// 0.26.0 (Release 11)
export const addSteps = addMigrationSteps('0.26.0', [
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
])
