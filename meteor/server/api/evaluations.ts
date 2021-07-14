import { Evaluations, EvaluationBase } from '../../lib/collections/Evaluations'
import { getCurrentTime, getRandomId } from '../../lib/lib'
import { logger } from '../logging'
import { Meteor } from 'meteor/meteor'
import { Studios } from '../../lib/collections/Studios'
import { RundownPlaylists } from '../../lib/collections/RundownPlaylists'
import { sendSlackMessageToWebhookSync } from './integration/slack'
import * as _ from 'underscore'
import { MethodContext } from '../../lib/api/methods'
import { OrganizationContentWriteAccess } from '../security/organization'

export function saveEvaluation(methodContext: MethodContext, evaluation: EvaluationBase): void {
	const allowedCred = OrganizationContentWriteAccess.evaluation({ userId: methodContext.userId })

	Evaluations.insert({
		...evaluation,
		_id: getRandomId(),
		organizationId: allowedCred.organizationId,
		userId: allowedCred.userId,
		timestamp: getCurrentTime(),
	})
	logger.info({
		message: 'evaluation',
		evaluation: evaluation,
	})

	Meteor.defer(() => {
		const studio = Studios.findOne(evaluation.studioId)
		if (!studio) throw new Meteor.Error(500, `Studio ${evaluation.studioId} not found!`)

		const webhookUrls = _.compact((studio.settings.slackEvaluationUrls || '').split(','))

		if (webhookUrls.length) {
			// Only send notes if not everything is OK
			const evaluationLevel = _.find(evaluation.answers, (_answer, key) => {
				return key === 'q0'
			})
			const evaluationMessage = _.find(evaluation.answers, (_answer, key) => {
				return key === 'q1'
			})
			const evaluationProducer = _.find(evaluation.answers, (_answer, key) => {
				return key === 'q2'
			})

			let slackMessage = 'Evaluation!'
			switch (evaluationLevel) {
				case 'nothing':
					slackMessage = ':heavy_check_mark: Hey! Fra '
					break
				case 'minor':
					slackMessage = ':grey_question: Ehm! Fra '
					break
				case 'major':
					slackMessage = ':warning: Uh-oh! Fra '
					break
			}

			// only send message for evaluations with content
			if (evaluationMessage) {
				const playlist = RundownPlaylists.findOne(evaluation.playlistId)
				const hostUrl = studio.settings.sofieUrl

				slackMessage +=
					'rundown ' +
					(hostUrl && playlist
						? '*<' + hostUrl + '/rundown/' + playlist._id + '|' + playlist.name + '>*'
						: (playlist && playlist.name) || 'N/A') +
					(hostUrl ? ' in ' + hostUrl.replace(/http:\/\/|https:\/\//, '') : '') +
					'\n' +
					evaluationMessage +
					'\n' +
					'_' +
					evaluationProducer +
					'_'

				_.each(webhookUrls, (webhookUrl) => {
					sendSlackMessageToWebhookSync(slackMessage, webhookUrl)
				})
			}
		}
	})
}
