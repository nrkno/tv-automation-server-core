import { addMigrationSteps } from './databaseMigration'
import * as _ from 'underscore'
import { Studios } from '../../lib/collections/Studios'
import { ensureCollectionPropertyManual } from './lib'
import { Studio as Studio_1_10_0 } from './deprecatedDataTypes/1_10_0'

// 1.0.0 (Release 12)
export const addSteps = addMigrationSteps('1.0.0', [
	// renamePropertiesInCollection('Studios rename config',
	// 	Studios,
	// 	'Studios',
	// 	{
	// 		blueprintConfig: 'config',
	// 	},
	// 	'migrateDatabaseCollections'
	// ),

	{
		// migrate from config.slack_evaluation to settings.slackEvaluationUrls
		id: 'studio.settings.slackEvaluationUrls from config',
		canBeRunAutomatically: true,
		dependOnResultFrom: 'Studios rename config',
		validate: () => {
			let validate: boolean | string = false
			Studios.find().forEach((studio0) => {
				const studio = studio0 as any as Studio_1_10_0
				if (!studio.settings || !studio.settings.slackEvaluationUrls) {
					if (_.find(studio.config, (c) => c._id === 'slack_evaluation')) {
						validate = `slackEvaluationUrls not set on studio ${studio._id}`
					}
				}
			})
			return validate
		},
		migrate: () => {
			Studios.find().forEach((studio0) => {
				const studio = studio0 as any as Studio_1_10_0
				if (!studio.settings || !studio.settings.slackEvaluationUrls) {
					const value = _.find(studio.config, (c) => c._id === 'slack_evaluation')
					if (value) {
						// Update the studio
						Studios.update(studio._id, {
							$set: {
								'settings.slackEvaluationUrls': value.value,
							},
							$pull: {
								config: {
									_id: 'slack_evaluation',
								},
							},
						})
					}
				}
			})
		},
	},
	ensureCollectionPropertyManual(
		'Studios',
		{},
		'settings.slackEvaluationUrls',
		'text',
		'Slack webhook URLs',
		'Enter the URL to the Slack webhook (example: "https://hooks.slack.com/services/WEBHOOKURL"',
		undefined,
		'studio.settings.slackEvaluationUrls from config'
	),

	{
		// migrate from config.mediaResolutions to settings.supportedMediaFormats
		id: 'studio.settings.supportedMediaFormats from config',
		canBeRunAutomatically: true,
		dependOnResultFrom: 'Studios rename config',
		validate: () => {
			let validate: boolean | string = false
			Studios.find().forEach((studio0) => {
				const studio = studio0 as any as Studio_1_10_0
				if (!studio.settings || !studio.settings.supportedMediaFormats) {
					if (_.find(studio.config, (c) => c._id === 'mediaResolutions')) {
						validate = `supportedMediaFormats not set on studio ${studio._id}`
					}
				}
			})
			return validate
		},
		migrate: () => {
			Studios.find().forEach((studio0) => {
				const studio = studio0 as any as Studio_1_10_0
				if (!studio.settings || !studio.settings.supportedMediaFormats) {
					const value = _.find(studio.config, (c) => c._id === 'mediaResolutions')
					if (value) {
						// Update the studio
						Studios.update(studio._id, {
							$set: {
								'settings.supportedMediaFormats': value.value,
							},
							$pull: {
								config: {
									_id: 'mediaResolutions',
								},
							},
						})
					}
				}
			})
		},
	},
	ensureCollectionPropertyManual(
		'Studios',
		{},
		'settings.supportedMediaFormats',
		'text',
		'Studio config: mediaResolutions',
		'A set of accepted media formats for playback (example: "1920x1080i5000tff,1280x720p5000")',
		undefined,
		'studio.settings.supportedMediaFormats from config'
	),

	{
		// migrate from config.audioStreams to settings.supportedAudioStreams
		id: 'studio.settings.supportedAudioStreams from config',
		canBeRunAutomatically: true,
		dependOnResultFrom: 'Studios rename config',
		validate: () => {
			let validate: boolean | string = false
			Studios.find().forEach((studio0) => {
				const studio = studio0 as any as Studio_1_10_0
				if (!studio.settings || !studio.settings.supportedAudioStreams) {
					if (_.find(studio.config, (c) => c._id === 'audioStreams')) {
						validate = `supportedAudioStreams not set on studio ${studio._id}`
					}
				}
			})
			return validate
		},
		migrate: () => {
			Studios.find().forEach((studio0) => {
				const studio = studio0 as any as Studio_1_10_0
				if (!studio.settings || !studio.settings.supportedAudioStreams) {
					const value = _.find(studio.config, (c) => c._id === 'audioStreams')
					if (value) {
						// Update the studio
						Studios.update(studio._id, {
							$set: {
								'settings.supportedAudioStreams': value.value,
							},
							$pull: {
								config: {
									_id: 'audioStreams',
								},
							},
						})
					}
				}
			})
		},
	},
])
