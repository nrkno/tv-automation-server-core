import { addMigrationSteps } from './databaseMigration'
import * as _ from 'underscore'
import { Blueprints } from '../../lib/collections/Blueprints'
import { BlueprintManifestType } from '@sofie-automation/blueprints-integration'
import { setExpectedVersion } from './lib'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'

// 0.24.0 (Release 9)
export const addSteps = addMigrationSteps('0.24.0', [
	{
		// Ensure blueprints have type set
		id: 'blueprints have blueprintType',
		canBeRunAutomatically: true,
		validate: () => {
			const blueprintCount = Blueprints.find({
				$and: [{ code: { $exists: true } }, { code: { $not: { $eq: '' } } }],
				blueprintType: { $exists: false },
			}).count()
			if (blueprintCount > 0) return 'Blueprints need to be migrated to have blueprintType'
			return false
		},
		migrate: () => {
			Blueprints.update(
				{
					$and: [{ code: { $exists: true } }, { code: { $not: { $eq: '' } } }],
					blueprintType: { $exists: false },
				},
				{
					$set: {
						blueprintType: BlueprintManifestType.SHOWSTYLE,
					},
				},
				{
					multi: true,
				}
			)
		},
	},
	setExpectedVersion('expectedVersion.playoutDevice', PeripheralDeviceAPI.DeviceType.PLAYOUT, '_process', '^0.19.0'),
	setExpectedVersion('expectedVersion.mosDevice', PeripheralDeviceAPI.DeviceType.MOS, '_process', '^0.7.0'),

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
