import { addMigrationSteps } from './databaseMigration'
import { logger } from '../logging'
import { Studios } from '../../lib/collections/Studios'
import { ensureCollectionProperty, ensureCollectionPropertyManual } from './lib'
import { ShowStyleBases } from '../../lib/collections/ShowStyleBases'
import { ShowStyleVariants, ShowStyleVariantId } from '../../lib/collections/ShowStyleVariants'
import { ShowStyles } from './deprecatedDataTypes/0_18_0'
import { Rundowns } from '../../lib/collections/Rundowns'
import { Blueprints } from '../../lib/collections/Blueprints'
import * as _ from 'underscore'
import { PeripheralDevices } from '../../lib/collections/PeripheralDevices'
import { getRandomId, protectString } from '../../lib/lib'
import { Studio as Studio_1_10_0 } from './deprecatedDataTypes/1_10_0'

/**
 * This file contains system specific migration steps.
 * These files are combined with / overridden by migration steps defined in the blueprints.
 */

// 0.19.0 (Release 4) is a BIG refactoring
export const addSteps = addMigrationSteps('0.19.0', [
	{
		// Create showStyleBase (migrate from studio)
		id: 'showStyleBase exists',
		canBeRunAutomatically: true,
		dependOnResultFrom: 'studio exists',
		validate: () => {
			if (!ShowStyleBases.findOne()) return 'No ShowStyleBase found'
			return false
		},
		migrate: () => {
			// maybe copy from studio?
			const studios = Studios.find().fetch()
			const showStyles = ShowStyles.find().fetch()
			if (studios.length === 1) {
				const studio = studios[0]

				const showstyle: any = showStyles.length === 1 ? showStyles[0] : {}

				const id = showstyle.id || 'show0'
				ShowStyleBases.insert({
					_id: id,
					name: showstyle.name || 'Default showstyle',
					organizationId: null,
					blueprintId: protectString(''),
					// @ts-ignore
					outputLayers: studio.outputLayers,
					// @ts-ignore
					sourceLayers: studio.sourceLayers,
					// @ts-ignore
					hotkeyLegend: studio.hotkeyLegend,
					blueprintConfig: {},
					_rundownVersionHash: '',
				})

				const variantId: ShowStyleVariantId = getRandomId()
				ShowStyleVariants.insert({
					_id: variantId,
					name: 'Default variant',
					showStyleBaseId: id,
					blueprintConfig: {},
					_rundownVersionHash: '',
				})

				if (!studio.supportedShowStyleBase || studio.supportedShowStyleBase.length === 0) {
					Studios.update(studio._id, {
						$set: {
							supportedShowStyleBase: [id],
						},
					})
				}
			} else {
				// create default ShowStyleBase:
				logger.info(`Migration: Add default ShowStyleBase`)
				ShowStyleBases.insert({
					_id: protectString('show0'),
					name: 'Default showstyle',
					organizationId: null,
					blueprintId: protectString(''),
					outputLayers: [],
					sourceLayers: [],
					blueprintConfig: {},
					_rundownVersionHash: '',
				})

				ShowStyleVariants.insert({
					_id: getRandomId(),
					name: 'Default variant',
					showStyleBaseId: protectString('show0'),
					blueprintConfig: {},
					_rundownVersionHash: '',
				})
			}
		},
	},
	ensureCollectionProperty('ShowStyleBases', {}, 'outputLayers', []),
	ensureCollectionProperty('ShowStyleBases', {}, 'sourceLayers', []),
	{
		id: 'Remove runtimeArguments from Studio',
		canBeRunAutomatically: true,
		validate: () => {
			const studio = Studios.find().fetch()
			let result: string | boolean = false
			studio.forEach((siItem) => {
				if ((siItem as any).runtimeArguments && (siItem as any).runtimeArguments.length > 0) {
					result = `Rundown Arguments set in a Studio Installation "${siItem._id}"`
				}
			})
			return result
		},
		migrate: () => {
			Studios.update(
				{},
				{
					$unset: {
						runtimeArguments: 1,
					},
				}
			)
		},
	},

	{
		// Ensure rundowns have showStyleBaseId and showStyleVariandId set
		id: 'rundowns have showStyleBaseId and showStyleVariantId',
		canBeRunAutomatically: true,
		validate: () => {
			const ros = Rundowns.find({
				$or: [{ showStyleBaseId: { $exists: false } }, { showStyleVariantId: { $exists: false } }],
			}).fetch()
			if (ros.length > 0) return 'Rundowns need to be migrated to new ShowStyleBase and ShowStyleVariant'
			return false
		},
		migrate: () => {
			const ros = Rundowns.find({
				$or: [{ showStyleBaseId: { $exists: false } }, { showStyleVariantId: { $exists: false } }],
			}).fetch()

			let fail: string | undefined = undefined

			ros.forEach((item) => {
				const showStyleBase =
					ShowStyleBases.findOne((item as any).showStyleId) ||
					ShowStyleBases.findOne(protectString('show0')) ||
					ShowStyleBases.findOne()
				if (showStyleBase) {
					const showStyleVariant = ShowStyleVariants.findOne({
						showStyleBaseId: showStyleBase._id,
					})

					if (showStyleVariant) {
						logger.info(
							`Migration: Switch Rundown "${item._id}" from showStyle to showStyleBase and showStyleVariant`
						)

						Rundowns.update(item._id, {
							$set: {
								showStyleBaseId: showStyleBase._id,
								showStyleVariantId: showStyleVariant._id,
							},
						})
					} else {
						fail = `Migrating rundown "${item._id}" failed, because a suitable showStyleVariant could not be found.`
					}
				} else {
					fail = `Migrating rundown "${item._id}" failed, because a suitable showStyleBase could not be found.`
				}
			})
			return fail
		},
	},

	ensureCollectionProperty('Studios', {}, 'settings', {}),

	{
		// migrate from config.media_previews_url to settings.mediaPreviewsUrl
		id: 'studio.settings.mediaPreviewsUrl from config',
		canBeRunAutomatically: true,
		dependOnResultFrom: 'studio exists',
		validate: () => {
			let validate: boolean | string = false
			Studios.find().forEach((studio0) => {
				const studio = studio0 as any as Studio_1_10_0
				if (!studio.settings || !studio.settings.mediaPreviewsUrl) {
					if (_.find(studio.config, (c) => c._id === 'media_previews_url')) {
						validate = `mediaPreviewsUrl not set on studio ${studio._id}`
					}
				}
			})
			return validate
		},
		migrate: () => {
			Studios.find().forEach((studio0) => {
				const studio = studio0 as any as Studio_1_10_0
				if (!studio.settings || !studio.settings.mediaPreviewsUrl) {
					const value = _.find(studio.config, (c) => c._id === 'media_previews_url')
					if (value) {
						// Update the studio
						Studios.update(studio._id, {
							$set: {
								'settings.mediaPreviewsUrl': value,
							},
							$pull: {
								config: {
									_id: 'media_previews_url',
								},
							},
						})
					}
				}
			})
		},
	},
	{
		// migrate from config.sofie_url to settings.sofieUrl
		id: 'studio.settings.sofieUrl from config',
		canBeRunAutomatically: true,
		dependOnResultFrom: 'studio exists',
		validate: () => {
			let validate: boolean | string = false
			Studios.find().forEach((studio0) => {
				const studio = studio0 as any as Studio_1_10_0
				if (!studio.settings || !studio.settings.sofieUrl) {
					if (_.find(studio.config, (c) => c._id === 'sofie_url')) {
						validate = `sofieUrl not set on studio ${studio._id}`
					}
				}
			})
			return validate
		},
		migrate: () => {
			Studios.find().forEach((studio0) => {
				const studio = studio0 as any as Studio_1_10_0
				if (!studio.settings || !studio.settings.sofieUrl) {
					const value = _.find(studio.config, (c) => c._id === 'sofie_url')
					if (value) {
						// Update the studio
						Studios.update(studio._id, {
							$set: {
								'settings.sofieUrl': value,
							},
							$pull: {
								config: {
									_id: 'sofie_url',
								},
							},
						})
					}
				}
			})
		},
	},
	ensureCollectionProperty('Studios', {}, 'supportedShowStyleBase', []),
	ensureCollectionPropertyManual(
		'Studios',
		{},
		'settings.mediaPreviewsUrl',
		'text',
		'Media previews URL',
		'Enter the URL to the media previews provider, example: http://10.0.1.100:8000/',
		undefined,
		'studio.settings.mediaPreviewsUrl from config'
	),
	ensureCollectionPropertyManual(
		'Studios',
		{},
		'settings.sofieUrl',
		'text',
		'Sofie URL',
		"Enter the URL to the Sofie Core (that's what's in your browser URL,), example: https://slsofie without trailing /, short form server name is OK.",
		undefined,
		'studio.settings.sofieUrl from config'
	),

	{
		// Blueprint.databaseVersion
		id: 'blueprint.databaseVersion',
		canBeRunAutomatically: true,
		validate: () => {
			let validate: boolean | string = false
			Blueprints.find({}).forEach((blueprint) => {
				if (!blueprint.databaseVersion || _.isString(blueprint.databaseVersion)) validate = true
			})
			return validate
		},
		migrate: () => {
			Blueprints.find({}).forEach((blueprint) => {
				if (!blueprint.databaseVersion || _.isString(blueprint.databaseVersion)) {
					Blueprints.update(blueprint._id, {
						$set: {
							databaseVersion: {
								showStyle: {},
								studio: {},
							},
						},
					})
				}
			})
		},
	},

	{
		// remove studioId from child peripheral devices
		id: 'peripheraldevice.studioId with parentDeviceId',
		canBeRunAutomatically: true,
		validate: () => {
			const devCount = PeripheralDevices.find({
				studioId: { $exists: true },
				parentDeviceId: { $exists: true },
			}).count()

			if (devCount > 0) {
				return 'Some child PeripheralDevices with studioId set'
			}
			return false
		},
		migrate: () => {
			PeripheralDevices.update(
				{
					studioId: { $exists: true },
					parentDeviceId: { $exists: true },
				},
				{
					$unset: {
						studioId: true,
					},
				},
				{
					multi: true,
				}
			)
		},
	},
])
