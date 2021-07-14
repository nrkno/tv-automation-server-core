import { EventEmitter } from 'events'
import * as _ from 'underscore'

import { DDPConnector } from './ddpConnector'
import { DDPConnectorOptions, Observer } from './ddpClient'
import { PeripheralDeviceAPI as P, PeripheralDeviceAPI } from './corePeripherals'
import { TimeSync } from './timeSync'
import { WatchDog } from './watchDog'
import { Queue } from './queue'
import { DeviceConfigManifest } from './configManifest'
import { Random } from './random'

const PkgInfo = require('../../package.json')
const DataStore = require('data-store')

// low-prio calls:
const TIMEOUTCALL = 200 // ms, time to wait after a call
const TIMEOUTREPLY = 50 // ms, time to wait after a reply

export interface CoreCredentials {
	deviceId: string
	deviceToken: string
}

export interface CoreOptions extends CoreCredentials {
	deviceCategory: P.DeviceCategory
	deviceType?: P.DeviceType | string //  deprecated
	deviceSubType?: P.DeviceSubType // deprecated

	deviceName: string
	versions?: {
		[libraryName: string]: string
	}
	watchDog?: boolean

	configManifest?: DeviceConfigManifest
}
export interface CollectionObj {
	_id: string
	[key: string]: any
}
export interface Collection {
	find: (selector: any) => Array<CollectionObj>
	findOne: (selector: any) => CollectionObj
}
interface QueuedMethodCall {
	f: () => Promise<any>
	resolve: (r: any) => void
	reject: (e: Error) => void
}
export class CoreConnection extends EventEmitter {
	private _ddp: DDPConnector
	private _parent: CoreConnection | null = null
	private _children: Array<CoreConnection> = []
	private _coreOptions: CoreOptions
	private _timeSync: TimeSync | null = null
	private _watchDog?: WatchDog
	private _watchDogPingResponse: string = ''
	private _connected: boolean = false
	private _autoSubscriptions: {
		[subscriptionId: string]: {
			publicationName: string
			params: Array<any>
		}
	} = {}
	private _sentConnectionId: string = ''
	private _pingTimeout: NodeJS.Timer | null = null
	private queuedMethodCalls: Array<QueuedMethodCall> = []
	private _triggerDoQueueTimer: NodeJS.Timer | null = null
	private _timeLastMethodCall: number = 0
	private _timeLastMethodReply: number = 0
	private _destroyed: boolean = false
	_queues: { [queueName: string]: Queue } = {}

	constructor (coreOptions: CoreOptions) {
		super()

		this._coreOptions = coreOptions

		if (this._coreOptions.watchDog) {
			this._watchDog = new WatchDog()
			this._watchDog.on('message', (msg) => this._emitError('msg ' + msg))
			this._watchDog.startWatching()
		}
	}
	static getStore (name: string) {
		return new DataStore(name)
	}
	static getCredentials (name: string): CoreCredentials {
		let store = CoreConnection.getStore(name)

		let credentials: CoreCredentials = store.get('CoreCredentials')
		if (!credentials) {
			credentials = CoreConnection.generateCredentials()
			store.set('CoreCredentials', credentials)
		}

		return credentials
	}
	static deleteCredentials (name: string) {
		let store = CoreConnection.getStore(name)

		store.set('CoreCredentials', null)
	}
	static generateCredentials (): CoreCredentials {
		return {
			deviceId: Random.id(),
			deviceToken: Random.id()
		}
	}
	async init (ddpOptionsORParent?: DDPConnectorOptions | CoreConnection): Promise<string> {
		this._destroyed = false
		this.on('connected', () => this._renewAutoSubscriptions())

		if (ddpOptionsORParent instanceof CoreConnection) {
			this._setParent(ddpOptionsORParent)
			return this._sendInit()
		} else {
			let ddpOptions = ddpOptionsORParent || {
				host: '127.0.0.1',
				port: 3000
			}
			// TODO: The following line is ignored - autoReconnect ends up as false - which is what the tests want. Why?
			if (!_.has(ddpOptions, 'autoReconnect')) ddpOptions.autoReconnect = true
			if (!_.has(ddpOptions, 'autoReconnectTimer')) ddpOptions.autoReconnectTimer = 1000
			this._ddp = new DDPConnector(ddpOptions)

			this._ddp.on('error', (err) => {
				this._emitError('ddpError: ' + (_.isObject(err) && err.message) || err.toString())
			})
			this._ddp.on('failed', (err) => {
				this.emit('failed', err)
			})
			this._ddp.on('info', (message: any) => {
				this.emit('info', message)
			})
			this._ddp.on('connected', () => {
				// this.emit('connected')
				if (this._watchDog) this._watchDog.addCheck(() => this._watchDogCheck())
			})
			this._ddp.on('disconnected', () => {
				// this.emit('disconnected')
				if (this._watchDog) this._watchDog.removeCheck(() => this._watchDogCheck())
			})
			this._ddp.on('message', () => {
				if (this._watchDog) this._watchDog.receivedData()
			})
			await this._ddp.createClient()
			await this._ddp.connect()
			this._setConnected(this._ddp.connected) // ensure that connection status is synced

			// set up the connectionChanged event handler after we've connected, so that it doesn't trigger on the await this._ddp.connect()
			this._ddp.on('connectionChanged', (connected: boolean) => {
				this._setConnected(connected)

				this._maybeSendInit().catch((err) => {
					this._emitError('_maybesendInit ' + JSON.stringify(err))
				})
			})

			let deviceId = await this._sendInit()
			this._timeSync = new TimeSync(
				{
					serverDelayTime: 0
				},
				async () => {
					let stat = await this.callMethod(PeripheralDeviceAPI.methods.getTimeDiff)
					return stat.currentTime
				}
			)

			await this._timeSync.init()
			this._triggerPing()
			return deviceId
		}
	}
	async destroy (): Promise<void> {
		this._destroyed = true
		if (this._parent) {
			this._removeParent()
		} else {
			this._removeParent()
			if (this._ddp) {
				this._ddp.close()
			}
		}
		this.removeAllListeners('error')
		this.removeAllListeners('connectionChanged')
		this.removeAllListeners('connected')
		this.removeAllListeners('disconnected')
		this.removeAllListeners('failed')
		this.removeAllListeners('info')

		if (this._watchDog) this._watchDog.stopWatching()

		if (this._pingTimeout) {
			clearTimeout(this._pingTimeout)
			this._pingTimeout = null
		}

		if (this._timeSync) {
			this._timeSync.stop()
			this._timeSync = null
		}

		await Promise.all(
			_.map(this._children, (child: CoreConnection) => {
				return child.destroy()
			})
		)
		this._children = []
	}
	addChild (child: CoreConnection) {
		this._children.push(child)

		this._updateMaxListeners()
	}
	removeChild (childToRemove: CoreConnection) {
		let removeIndex = -1
		this._children.forEach((c, i) => {
			if (c === childToRemove) removeIndex = i
		})
		if (removeIndex !== -1) {
			this._children.splice(removeIndex, 1)
		}
	}
	onConnectionChanged (cb: (connected: boolean) => void) {
		this.on('connectionChanged', cb)
	}
	onConnected (cb: () => void) {
		this.on('connected', cb)
	}
	onDisconnected (cb: () => void) {
		this.on('disconnected', cb)
	}
	onError (cb: (err: Error) => void) {
		this.on('error', cb)
	}
	onFailed (cb: (err: Error) => void) {
		this.on('failed', cb)
	}
	onInfo (cb: (message: any) => void) {
		this.on('info', cb)
	}
	get ddp (): DDPConnector {
		if (this._parent) return this._parent.ddp
		else return this._ddp
	}
	get connected () {
		return this._connected
		// return (this.ddp ? this.ddp.connected : false)
	}
	get deviceId () {
		return this._coreOptions.deviceId
	}
	setStatus (status: P.StatusObject): Promise<P.StatusObject> {
		return this.callMethod(P.methods.setStatus, [status])
	}
	callMethod (methodName: PeripheralDeviceAPI.methods | string, attrs?: Array<any>): Promise<any> {
		return new Promise((resolve, reject) => {
			if (this._destroyed) {
				reject('callMethod: CoreConnection has been destroyed')
				return
			}
			if (!methodName) {
				reject('callMethod: argument missing: methodName')
				return
			}

			let fullAttrs = [this._coreOptions.deviceId, this._coreOptions.deviceToken].concat(attrs || [])

			this._timeLastMethodCall = Date.now()
			if (!this.ddp.ddpClient) {
				reject('callMehod: DDP client has not been initialized')
				return
			}
			this.ddp.ddpClient.call(methodName, fullAttrs, (err: Error, id: string) => {
				this._timeLastMethodReply = Date.now()
				if (err) {
					reject(err)
				} else {
					resolve(id)
				}
			})
		})
	}
	callMethodLowPrio (methodName: PeripheralDeviceAPI.methods | string, attrs?: Array<any>): Promise<any> {
		return new Promise((resolve, reject) => {
			this.queuedMethodCalls.push({
				f: () => {
					return this.callMethod(methodName, attrs)
				},
				resolve: resolve,
				reject: reject
			})
			this._triggerDoQueue()
		})
	}
	unInitialize (): Promise<string> {
		return this.callMethod(P.methods.unInitialize)
	}
	mosManipulate (method: string, ...attrs: Array<any>) {
		return this.callMethod(method, attrs)
	}
	getPeripheralDevice (): Promise<any> {
		return this.callMethod(P.methods.getPeripheralDevice)
	}
	getCollection (collectionName: string): Collection {
		if (!this.ddp.ddpClient) {
			throw new Error('getCollection: DDP client not initialized')
		}
		const collections = this.ddp.ddpClient.collections

		let c: Collection = {
			find (selector?: any): Array<CollectionObj> {
				const collection = collections[collectionName] || {}
				if (_.isUndefined(selector)) {
					return _.values(collection)
				} else if (_.isFunction(selector)) {
					return _.filter(_.values(collection), selector)
				} else if (_.isObject(selector)) {
					return _.where(_.values(collection), selector)
				} else {
					return [collection[selector]]
				}
			},
			findOne (selector: any): CollectionObj {
				return c.find(selector)[0]
			}
		}
		return c
	}
	async subscribe (publicationName: string, ...params: Array<any>): Promise<string> {
		return new Promise((resolve, reject) => {
			if (!this.ddp.ddpClient) {
				reject('subscribe: DDP client is not initialized')
				return
			}
			try {
				let subscriptionId = this.ddp.ddpClient.subscribe(
					publicationName, // name of Meteor Publish function to subscribe to
					params.concat([this._coreOptions.deviceToken]), // parameters used by the Publish function
					() => {
						// callback when the subscription is complete
						resolve(subscriptionId)
					}
				)
			} catch (e) {
				reject(e)
			}
		})
	}
	/**
	 * Like a subscribe, but automatically renews it upon reconnection
	 */
	async autoSubscribe (publicationName: string, ...params: Array<any>): Promise<string> {
		const subscriptionId = await this.subscribe(publicationName, ...params)
		this._autoSubscriptions[subscriptionId] = {
			publicationName: publicationName,
			params: params
		}
		return subscriptionId
	}
	unsubscribe (subscriptionId: string): void {
		this.ddp.ddpClient?.unsubscribe(subscriptionId)
		delete this._autoSubscriptions[subscriptionId]
	}
	observe (collectionName: string): Observer {
		if (!this.ddp.ddpClient) {
			throw new Error('observe: DDP client not initialised')
		}
		return this.ddp.ddpClient.observe(collectionName)
	}
	getCurrentTime (): number {
		return this._timeSync?.currentTime() || 0
	}
	hasSyncedTime (): boolean {
		return this._timeSync?.isGood() || false
	}
	syncTimeQuality (): number | null {
		return this._timeSync?.quality || null
	}
	setPingResponse (message: string) {
		this._watchDogPingResponse = message
	}
	putOnQueue<T> (queueName: string, fcn: () => Promise<T>): Promise<T> {
		if (!this._queues[queueName]) {
			this._queues[queueName] = new Queue()
		}
		return this._queues[queueName].putOnQueue(fcn)
	}
	private _emitError (e: Error | string) {
		if (!this._destroyed) {
			this.emit('error', e)
		} else {
			console.log('destroyed error', e)
		}
	}
	private _setConnected (connected: boolean) {
		let prevConnected = this._connected
		this._connected = connected
		if (prevConnected !== connected) {
			if (connected) this.emit('connected')
			else this.emit('disconnected')
			this.emit('connectionChanged', connected)
			this._triggerPing()
		}
	}
	private _maybeSendInit (): Promise<any> {
		// If the connectionId has changed, we should report that to Core:
		if (this.ddp && this.ddp.connectionId !== this._sentConnectionId) {
			return this._sendInit()
		} else {
			return Promise.resolve()
		}
	}
	private _sendInit (): Promise<string> {
		if (!this.ddp || !this.ddp.connectionId) throw Error('Not connected to Core')

		let options: P.InitOptions = {
			category: this._coreOptions.deviceCategory,
			type: this._coreOptions.deviceType,
			subType: this._coreOptions.deviceSubType,

			name: this._coreOptions.deviceName,
			connectionId: this.ddp.connectionId,
			parentDeviceId: this._parent?.deviceId || undefined,
			versions: this._coreOptions.versions,

			configManifest: this._coreOptions.configManifest
		}

		if (options.subType === P.SUBTYPE_PROCESS) {
			if (!options.versions) options.versions = {}
			options.versions['@sofie-automation/server-core-integration'] = PkgInfo.version
		}

		this._sentConnectionId = options.connectionId
		return this.callMethod(P.methods.initialize, [options])
	}
	private _removeParent () {
		if (this._parent) this._parent.removeChild(this)
		this._parent = null
		this._setConnected(false)
	}
	private _setParent (parent: CoreConnection) {
		this._parent = parent
		parent.addChild(this)

		parent.on('connectionChanged', (connected) => {
			this._setConnected(connected)
		})
		this._setConnected(parent.connected)
	}
	private _watchDogCheck () {
		/*
			Randomize a message and send it to Core.
			Core should then reply with triggering executeFunction with the "pingResponse" method.
		*/
		let message = 'watchdogPing_' + Math.round(Math.random() * 100000)
		this.callMethod(PeripheralDeviceAPI.methods.pingWithCommand, [message]).catch((e) =>
			this._emitError('watchdogPing' + e)
		)

		return new Promise<void>((resolve, reject) => {
			let i = 0
			let checkPingReply = () => {
				if (this._watchDogPingResponse === message) {
					// if we've got a good watchdog response, we can delay the pinging:
					this._triggerDelayPing()

					resolve()
				} else {
					i++
					if (i > 50) {
						reject()
					} else {
						setTimeout(checkPingReply, 300)
					}
				}
			}
			checkPingReply()
		}).then(() => {
			return
		})
	}
	private _renewAutoSubscriptions () {
		_.each(this._autoSubscriptions, (sub) => {
			this.subscribe(sub.publicationName, ...sub.params).catch((e) =>
				this._emitError('renewSubscr ' + sub.publicationName + ': ' + e)
			)
		})
	}
	private _triggerPing () {
		if (!this._pingTimeout) {
			this._pingTimeout = setTimeout(() => {
				this._pingTimeout = null
				this._ping()
			}, 90 * 1000)
		}
	}
	private _triggerDelayPing () {
		// delay the ping:
		if (this._pingTimeout) {
			clearTimeout(this._pingTimeout)
			this._pingTimeout = null
		}
		this._triggerPing()
	}
	private _ping () {
		try {
			if (this.connected) {
				this.callMethod(PeripheralDeviceAPI.methods.ping).catch((e) => this._emitError('_ping' + e))
			}
		} catch (e) {
			this._emitError('_ping2 ' + e)
		}
		if (this.connected) {
			this._triggerPing()
		}
	}
	private _triggerDoQueue (time: number = 2) {
		if (!this._triggerDoQueueTimer) {
			this._triggerDoQueueTimer = setTimeout(() => {
				this._triggerDoQueueTimer = null

				this._doQueue()
			}, time)
		}
	}
	private _doQueue () {
		// check if we can send a call?
		let timeSinceLastMethodCall = Date.now() - this._timeLastMethodCall
		let timeSinceLastMethodReply = Date.now() - this._timeLastMethodReply

		if (timeSinceLastMethodCall < TIMEOUTCALL) {
			// Not enough time has passed since last method call
			this._triggerDoQueue(TIMEOUTCALL - timeSinceLastMethodCall + 1)
		} else if (timeSinceLastMethodReply < TIMEOUTREPLY) {
			// Not enough time has passed since last method reply
			this._triggerDoQueue(TIMEOUTREPLY - timeSinceLastMethodReply + 1)
		} else {
			// yep, it's time to send a command!

			let c = this.queuedMethodCalls.shift()
			if (c) {
				c.f()
					.then((result) => {
						this._triggerDoQueue()
						c!.resolve(result)
					})
					.catch((err) => {
						this._triggerDoQueue()
						c!.reject(err)
					})
			}
		}
	}
	private _updateMaxListeners () {
		this.setMaxListeners(
			10 + this._children.length * 10 // allow 10 listeners per child
		)
	}
}
