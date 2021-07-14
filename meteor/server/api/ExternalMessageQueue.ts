import { Meteor } from 'meteor/meteor'
import { check } from '../../lib/check'
import * as _ from 'underscore'
import { logger } from '../logging'
import {
	ExternalMessageQueue,
	ExternalMessageQueueObj,
	ExternalMessageQueueObjId,
} from '../../lib/collections/ExternalMessageQueue'
import {
	ExternalMessageQueueObjSOAP,
	IBlueprintExternalMessageQueueObj,
	IBlueprintExternalMessageQueueType,
	ExternalMessageQueueObjRabbitMQ,
} from '@sofie-automation/blueprints-integration'
import { getCurrentTime, removeNullyProperties, getRandomId, protectString, omit } from '../../lib/lib'
import { registerClassToMeteorMethods } from '../methods'
import { Rundown } from '../../lib/collections/Rundowns'
import { NewExternalMessageQueueAPI, ExternalMessageQueueAPIMethods } from '../../lib/api/ExternalMessageQueue'
import { sendSOAPMessage } from './integration/soap'
import { sendSlackMessageToWebhook } from './integration/slack'
import { sendRabbitMQMessage } from './integration/rabbitMQ'
import { StatusObject, setSystemStatus } from '../systemStatus/systemStatus'
import { MethodContextAPI, MethodContext } from '../../lib/api/methods'
import { StudioContentWriteAccess } from '../security/studio'
import { triggerWriteAccessBecauseNoCheckNecessary } from '../security/lib/securityVerify'
import { MongoModifier } from '../../lib/typings/meteor'
import { ReadonlyDeep } from 'type-fest'
import { StatusCode } from '../../lib/api/systemStatus'

export function queueExternalMessages(
	rundown: ReadonlyDeep<Rundown>,
	messages: Array<IBlueprintExternalMessageQueueObj>
) {
	const playlist = rundown.getRundownPlaylist()

	_.each(messages, (message: IBlueprintExternalMessageQueueObj) => {
		// check the output:
		if (!message) throw new Meteor.Error('Falsy result!')
		if (!message.type) throw new Meteor.Error('attribute .type missing!')
		if (!message.receiver) throw new Meteor.Error('attribute .receiver missing!')
		if (!message.message) throw new Meteor.Error('attribute .message missing!')

		// Save the output into the message queue, for later processing:
		if (message._id) {
			// Overwrite an existing message
			const messageId = protectString(message._id)

			const existingMessage = ExternalMessageQueue.findOne(messageId)
			if (!existingMessage) throw new Meteor.Error(`ExternalMessage ${message._id} not found!`)
			if (existingMessage.studioId !== rundown.studioId)
				throw new Meteor.Error(`ExternalMessage ${message._id} is not in the right studio!`)
			if (existingMessage.rundownId !== rundown._id)
				throw new Meteor.Error(`ExternalMessage ${message._id} is not in the right rundown!`)

			if (!playlist.rehearsal) {
				const m: MongoModifier<ExternalMessageQueueObj> = {
					$set: {
						...omit(message, '_id'),
					},
				}
				if (message.queueForLaterReason === undefined) {
					m.$unset = {
						queueForLaterReason: 1,
					}
				}
				ExternalMessageQueue.update(existingMessage._id, m)
				triggerdoMessageQueue() // trigger processing of the queue
			}
		} else {
			const now = getCurrentTime()
			let message2: ExternalMessageQueueObj = {
				_id: getRandomId(),

				...omit(message, '_id'),

				studioId: rundown.studioId,
				rundownId: rundown._id,

				created: now,
				tryCount: 0,
				expires: now + 35 * 24 * 3600 * 1000, // 35 days
				manualRetry: false,
			}
			message2 = removeNullyProperties(message2)
			if (!playlist.rehearsal) {
				// Don't save the message when running rehearsals
				ExternalMessageQueue.insert(message2)
				triggerdoMessageQueue() // trigger processing of the queue
			}
		}
	})
}

let runMessageQueue = true
let errorOnLastRunCount: number = 0

let triggerdoMessageQueueTimeout: number = 0
export function triggerdoMessageQueue(time?: number) {
	if (!time) time = 1000
	if (triggerdoMessageQueueTimeout) {
		Meteor.clearTimeout(triggerdoMessageQueueTimeout)
	}
	if (runMessageQueue) {
		triggerdoMessageQueueTimeout = Meteor.setTimeout(() => {
			triggerdoMessageQueueTimeout = 0
			doMessageQueue()
		}, time)
	}
}
Meteor.startup(() => {
	triggerdoMessageQueue(5000)
})
function doMessageQueue() {
	const tryInterval = 1 * 60 * 1000 // 1 minute
	const limit = errorOnLastRunCount === 0 ? 100 : 5 // if there were errors on last send, don't run too many next time
	let probablyHasMoreToSend = false
	try {
		const now = getCurrentTime()
		let messagesToSend = ExternalMessageQueue.find(
			{
				sent: { $not: { $gt: 0 } },
				lastTry: { $not: { $gt: now - tryInterval } },
				expires: { $gt: now },
				hold: { $not: { $eq: true } },
				errorFatal: { $not: { $eq: true } },
				queueForLaterReason: { $exists: false },
			},
			{
				sort: {
					lastTry: 1,
				},
				limit: limit,
			}
		).fetch()

		if (messagesToSend.length === limit) probablyHasMoreToSend = true

		errorOnLastRunCount = 0

		const ps: Array<Promise<any>> = []

		messagesToSend = _.filter(messagesToSend, (msg: ExternalMessageQueueObj): boolean => {
			return msg.retryUntil === undefined || msg.manualRetry || now < msg.retryUntil
		})

		_.each(messagesToSend, (msg) => {
			try {
				logger.debug(`Trying to send externalMessage, id: ${msg._id}, type: "${msg.type}"`)
				msg.manualRetry = false
				ExternalMessageQueue.update(msg._id, {
					$set: {
						tryCount: (msg.tryCount || 0) + 1,
						lastTry: now,
						manualRetry: false,
					},
				})

				let p: Promise<any>
				if (msg.type === IBlueprintExternalMessageQueueType.SOAP) {
					p = sendSOAPMessage(msg as ExternalMessageQueueObjSOAP & ExternalMessageQueueObj)
				} else if (msg.type === IBlueprintExternalMessageQueueType.SLACK) {
					// let m = msg as ExternalMessageQueueObjSlack & ExternalMessageQueueObj
					p = sendSlackMessageToWebhook(msg.message, msg.receiver)
				} else if (msg.type === IBlueprintExternalMessageQueueType.RABBIT_MQ) {
					p = sendRabbitMQMessage(msg as ExternalMessageQueueObjRabbitMQ & ExternalMessageQueueObj)
				} else {
					throw new Meteor.Error(500, `Unknown / Unsupported externalMessage type: "${msg.type}"`)
				}
				ps.push(
					Promise.resolve(p)
						.then((result) => {
							ExternalMessageQueue.update(msg._id, {
								$set: {
									sent: getCurrentTime(),
									sentReply: result,
								},
							})
							logger.debug(`ExternalMessage sucessfully sent, id: ${msg._id}, type: "${msg.type}"`)
						})
						.catch((e) => {
							logMessageError(msg, e)
						})
				)
			} catch (e) {
				logMessageError(msg, e)
			}
		})
		Promise.all(ps)
			.then(() => {
				// all messages have been sent
				if (probablyHasMoreToSend && errorOnLastRunCount === 0) {
					// override default timeout
					triggerdoMessageQueue(1000)
				}
			})
			.catch((error) => logger.error(error))
	} catch (e) {
		logger.error(e)
	}
	triggerdoMessageQueue(tryInterval)
}
export function logMessageError(msg: ExternalMessageQueueObj, e: any) {
	try {
		errorOnLastRunCount++
		logger.warn(e || e.reason || e.toString())
		ExternalMessageQueue.update(msg._id, {
			$set: {
				errorMessage: e['reason'] || e['message'] || e.toString(),
				errorMessageTime: getCurrentTime(),
			},
		})
	} catch (e) {
		logger.error(e)
	}
}
export function throwFatalError(msg: ExternalMessageQueueObj, e: Meteor.Error) {
	ExternalMessageQueue.update(msg._id, {
		$set: {
			errorFatal: true,
		},
	})

	throw e
}

let updateExternalMessageQueueStatusTimeout: number = 0
function updateExternalMessageQueueStatus(): void {
	if (!updateExternalMessageQueueStatusTimeout) {
		updateExternalMessageQueueStatusTimeout = Meteor.setTimeout(() => {
			updateExternalMessageQueueStatusTimeout = 0

			const messagesOnQueueCursor = ExternalMessageQueue.find({
				sent: { $not: { $gt: 0 } },
				tryCount: { $gt: 3 },
			})
			const messagesOnQueueCount: number = messagesOnQueueCursor.count()
			let status: StatusObject = {
				statusCode: StatusCode.GOOD,
			}
			if (messagesOnQueueCount > 0) {
				const messagesOnQueueExample = messagesOnQueueCursor.fetch()[0]
				status = {
					statusCode: StatusCode.WARNING_MAJOR,
					messages: [
						`There are ${messagesOnQueueCount} unsent messages on queue (one of the unsent messages has the error message: "${
							messagesOnQueueExample.errorMessage
						}", to receiver "${messagesOnQueueExample.type}", "${JSON.stringify(
							messagesOnQueueExample.receiver
						)}")`,
					],
				}
			}
			setSystemStatus('External Message queue', status)
		}, 5000)
	}
}

ExternalMessageQueue.find({
	sent: { $not: { $gt: 0 } },
	tryCount: { $gt: 3 },
}).observeChanges({
	added: updateExternalMessageQueueStatus,
	changed: updateExternalMessageQueueStatus,
	removed: updateExternalMessageQueueStatus,
})
Meteor.startup(() => {
	updateExternalMessageQueueStatus()
})

async function removeExternalMessage(context: MethodContext, messageId: ExternalMessageQueueObjId): Promise<void> {
	check(messageId, String)
	await StudioContentWriteAccess.externalMessage(context, messageId)

	await ExternalMessageQueue.removeAsync(messageId)
}
async function toggleHold(context: MethodContext, messageId: ExternalMessageQueueObjId): Promise<void> {
	check(messageId, String)
	const access = await StudioContentWriteAccess.externalMessage(context, messageId)
	const m = access.message
	if (!m) throw new Meteor.Error(404, `ExternalMessage "${messageId}" not found!`)

	await ExternalMessageQueue.updateAsync(messageId, {
		$set: {
			hold: !m.hold,
		},
	})
}
async function retry(context: MethodContext, messageId: ExternalMessageQueueObjId): Promise<void> {
	check(messageId, String)
	const access = await StudioContentWriteAccess.externalMessage(context, messageId)
	const m = access.message
	if (!m) throw new Meteor.Error(404, `ExternalMessage "${messageId}" not found!`)

	const tryGap = getCurrentTime() - 1 * 60 * 1000
	await ExternalMessageQueue.updateAsync(messageId, {
		$set: {
			manualRetry: true,
			hold: false,
			errorFatal: false,
			lastTry: m.lastTry !== undefined && m.lastTry > tryGap ? tryGap : m.lastTry,
		},
	})
	triggerdoMessageQueue(1000)
}
async function setRunMessageQueue(_context: MethodContext, value: boolean): Promise<void> {
	check(value, Boolean)
	triggerWriteAccessBecauseNoCheckNecessary()

	logger.info('setRunMessageQueue: set to ' + value)
	runMessageQueue = value
	if (runMessageQueue) {
		triggerdoMessageQueue(1000)
	}
}

class ServerExternalMessageQueueAPI extends MethodContextAPI implements NewExternalMessageQueueAPI {
	remove(messageId: ExternalMessageQueueObjId) {
		return removeExternalMessage(this, messageId)
	}
	toggleHold(messageId: ExternalMessageQueueObjId) {
		return toggleHold(this, messageId)
	}
	retry(messageId: ExternalMessageQueueObjId) {
		return retry(this, messageId)
	}
	setRunMessageQueue(value: boolean) {
		return setRunMessageQueue(this, value)
	}
}
registerClassToMeteorMethods(ExternalMessageQueueAPIMethods, ServerExternalMessageQueueAPI, false)
