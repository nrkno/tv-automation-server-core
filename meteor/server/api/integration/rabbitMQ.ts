import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'
import * as AMQP from 'amqplib'
import { logger } from '../../logging'
import { ExternalMessageQueueObjRabbitMQ } from '@sofie-automation/blueprints-integration'
import { ExternalMessageQueueObj, ExternalMessageQueueObjId } from '../../../lib/collections/ExternalMessageQueue'
import { ConfigRef } from '../blueprints/config'
import { unprotectString } from '../../../lib/lib'

interface Message {
	_id: ExternalMessageQueueObjId
	exchangeTopic: string
	routingKey: string
	headers: { [header: string]: string } | undefined
	message: string
	resolve: Function
	reject: Function
}
class Manager<T extends AMQP.Connection | AMQP.ConfirmChannel> {
	public initializing?: Promise<T>
	open: boolean = false
	/** https://www.rabbitmq.com/connection-blocked.html */
	blocked: boolean = false
	/** How many errors the connection has emitted */
	errorCount: number = 0
	/* If true, the connection needs to be restarted */
	fatalError: boolean = false

	async init() {
		this.open = false
		this.blocked = false
		this.errorCount = 0
		this.fatalError = false
	}
	async prepare() {
		if (this.initializing) {
			await this.initializing
		}
	}
	protected needToInitialize() {
		return !this.open || this.fatalError || this.errorCount > 10
	}
}
class ConnectionManager extends Manager<AMQP.Connection> {
	connection: AMQP.Connection
	channelManager: ChannelManager

	private hostURL: string

	constructor(hostURL) {
		super()
		// nothing
		this.hostURL = hostURL
	}
	async prepare() {
		await super.prepare()
		if (this.needToInitialize()) {
			await this.init()
		}
	}
	async init() {
		await super.init()

		if (this.connection) {
			await this.connection.close().catch(() => null) // already closed connections will error
		}

		this.initializing = this.initConnection()

		try {
			this.connection = await this.initializing
		} catch (e) {
			// make sure this doesn't hang around
			delete this.initializing
			throw new Error(e)
		}
		delete this.initializing

		this.channelManager = new ChannelManager(this.connection)
	}

	async initConnection(): Promise<AMQP.Connection> {
		try {
			const connection = await AMQP.connect(this.hostURL, {
				// socketOptions
				heartbeat: 0, // default
			})

			connection.on('error', (err) => {
				logger.error('AMQP connection error', err)
				this.errorCount++
			})
			connection.on('close', () => {
				this.open = false
				logger.error('AMQP connection closed')
			})
			connection.on('blocked', (reason) => {
				this.blocked = true
				logger.error('AMQP connection blocked', reason)
			})
			connection.on('unblocked', () => {
				this.blocked = false
				logger.error('AMQP connection unblocked')
			})
			this.open = true

			return connection
		} catch (err) {
			this.errorCount++
			this.fatalError = true

			logger.error('Error when connecting AMQP (to ' + this.hostURL + ') ' + err)
			throw err
		}
	}
}
class ChannelManager extends Manager<AMQP.ConfirmChannel> {
	outgoingQueue: Array<Message> = []

	connection: AMQP.Connection
	channel: AMQP.ConfirmChannel

	handleOutgoingQueueTimeout: NodeJS.Timer | null = null

	constructor(connection: AMQP.Connection) {
		super()
		this.connection = connection
	}
	async prepare() {
		await super.prepare()
		if (this.needToInitialize()) {
			await this.init()
		}
	}
	async init() {
		await super.init()

		if (this.channel) {
			await this.channel.close()
		}

		this.initializing = this.initChannel(this.connection)

		this.channel = await this.initializing
		delete this.initializing
	}
	async initChannel(connection: AMQP.Connection): Promise<AMQP.ConfirmChannel> {
		try {
			const channel = await connection.createConfirmChannel()

			channel.on('error', (err) => {
				this.errorCount++
				logger.error('AMQP channel error', err)
			})
			channel.on('close', () => {
				this.open = false
				logger.error('AMQP channel closed')
			})
			channel.on('blocked', (reason) => {
				this.blocked = true
				logger.error('AMQP channel blocked', reason)
			})
			channel.on('unblocked', () => {
				this.blocked = false
				logger.error('AMQP channel unblocked')
			})
			// When a "mandatory" message cannot be delivered, it's returned here:
			// channel.on('return', message => {
			// 	logger.error('AMQP channel return', message)
			// })
			channel.on('drain', () => {
				logger.error('AMQP channel drain')
				this.triggerHandleOutgoingQueue()
			})
			this.open = true

			return channel
		} catch (err) {
			this.fatalError = true
			this.errorCount++
			this.fatalError = true
			throw new Error('Error when creating AMQP channel ' + err)
		}
	}

	sendMessage(
		exchangeTopic: string,
		routingKey: string,
		messageId: ExternalMessageQueueObjId,
		message: string,
		headers: { [headers: string]: string } | undefined
	) {
		return this.channel.assertExchange(exchangeTopic, 'topic', { durable: true }).then(
			() =>
				new Promise((resolve, reject) => {
					this.outgoingQueue.push({
						_id: messageId,
						exchangeTopic,
						routingKey,
						headers,
						message,
						resolve,
						reject,
					})
					this.triggerHandleOutgoingQueue()
				})
		)
	}

	triggerHandleOutgoingQueue() {
		if (!this.handleOutgoingQueueTimeout) {
			this.handleOutgoingQueueTimeout = setTimeout(() => {
				this.handleOutgoingQueueTimeout = null
				this.handleOutgoingQueue()
			}, 100)
		}
	}
	handleOutgoingQueue() {
		const firstMessageInQueue: Message | undefined = this.outgoingQueue.shift()

		if (firstMessageInQueue) {
			const messageToSend: Message = firstMessageInQueue

			const sent = this.channel.publish(
				messageToSend.exchangeTopic,
				messageToSend.routingKey,
				Buffer.from(messageToSend.message),
				{
					// options
					headers: messageToSend.headers,
					messageId: unprotectString(messageToSend._id),
					persistent: true, // same thing as deliveryMode=2
				},
				(err, _ok) => {
					if (err) {
						messageToSend.reject(err)
					} else {
						messageToSend.resolve()
					}
					// Trigger handling the next message
					this.triggerHandleOutgoingQueue()
				}
			)
			if (!sent) {
				// The write buffer is full, we will try again on the 'drain' event

				// Put the message back on the queue:
				this.outgoingQueue.unshift(messageToSend)
			} else {
				logger.debug('RabbitMQ: message sent, waiting for ok...')
			}
		}
	}
}

const connectionsCache: { [hostURL: string]: ConnectionManager } = {}
/**
 *
 * @param hostURL example: 'amqp://localhost'
 */
async function getChannelManager(hostURL: string) {
	// Check if we have an existing connection in the cache:
	let connectionManager: ConnectionManager | undefined = connectionsCache[hostURL]

	if (!connectionManager) {
		connectionManager = new ConnectionManager(hostURL)
		connectionsCache[hostURL] = connectionManager
	}
	// Let the connectionManager set up the connection:
	await connectionManager.prepare()

	// Let the connectionManager set up the channel:
	await connectionManager.channelManager.prepare()

	return connectionManager.channelManager
}
export async function sendRabbitMQMessage(msg0: ExternalMessageQueueObjRabbitMQ & ExternalMessageQueueObj) {
	const msg: ExternalMessageQueueObjRabbitMQ = msg0 // for typings

	let hostURL: string = msg.receiver.host
	const exchangeTopic: string = msg.receiver.topic
	const routingKey: string = msg.message.routingKey
	let message: any = msg.message.message
	const headers: { [header: string]: string } = msg.message.headers

	if (!hostURL) throw new Meteor.Error(400, `RabbitMQ: Message host not set`)
	if (!exchangeTopic) throw new Meteor.Error(400, `RabbitMQ: Message topic not set`)
	if (!routingKey) throw new Meteor.Error(400, `RabbitMQ: Message routing key not set`)
	if (!message) throw new Meteor.Error(400, `RabbitMQ: Message message not set`)

	hostURL = await ConfigRef.retrieveRefs(
		hostURL,
		(str) => {
			return encodeURIComponent(str)
		},
		true
	)

	const channelManager = await getChannelManager(hostURL)

	if (_.isObject(message)) message = JSON.stringify(message)

	await channelManager.sendMessage(exchangeTopic, routingKey, msg0._id, message, headers)
}
