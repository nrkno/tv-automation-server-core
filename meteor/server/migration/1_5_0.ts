import { addMigrationSteps } from './databaseMigration'
import { Blueprints } from '../../lib/collections/Blueprints'
import { ShowStyleBases } from '../../lib/collections/ShowStyleBases'
import * as _ from 'underscore'
import { protectString } from '../../lib/lib'

// 1.5.0 (Release 17)
export const addSteps = addMigrationSteps('1.5.0', [
	{
		id: 'SourceLayers remove unlimited & onPGMClean',
		canBeRunAutomatically: true,
		validate: () => {
			const showStyles = ShowStyleBases.find({
				$or: [
					{ 'sourceLayers.unlimited': { $exists: true } },
					{ 'sourceLayers.onPGMClean': { $exists: true } },
				],
			}).count()
			if (showStyles) {
				return 'SourceLayers unlimited or onPGMClean is defined'
			}
			return false
		},
		migrate: () => {
			const showStyles = ShowStyleBases.find({
				$or: [
					{ 'sourceLayers.unlimited': { $exists: true } },
					{ 'sourceLayers.onPGMClean': { $exists: true } },
				],
			}).fetch()

			_.each(showStyles, (show) => {
				_.each(show.sourceLayers, (layer) => {
					delete layer['unlimited']
					delete layer['onPGMClean']
				})

				ShowStyleBases.update(show._id, {
					$set: {
						sourceLayers: show.sourceLayers,
					},
				})
			})
		},
	},

	{
		id: 'Blueprints.blueprintId default',
		canBeRunAutomatically: true,
		validate: () => {
			const blueprints = Blueprints.find({
				blueprintId: { $exists: false },
			}).count()
			if (blueprints) {
				return 'Blueprints.blueprintId is "undefined"'
			}
			return false
		},
		migrate: () => {
			Blueprints.update(
				{
					blueprintId: { $exists: false },
				},
				{
					$set: {
						blueprintId: protectString(''),
					},
				}
			)
		},
	},
])
