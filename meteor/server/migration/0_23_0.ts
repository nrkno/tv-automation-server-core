import { addMigrationSteps } from './databaseMigration'
import { Rundowns } from '../../lib/collections/Rundowns'

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
])
