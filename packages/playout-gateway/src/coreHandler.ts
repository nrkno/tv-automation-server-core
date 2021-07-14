import {
	CoreConnection,
	CoreOptions,
	PeripheralDeviceAPI as P,
	DDPConnectorOptions,
	PeripheralDeviceAPI,
} from '@sofie-automation/server-core-integration'

import {
	DeviceType,
	CasparCGDevice,
	DeviceContainer,
	HyperdeckDevice,
	QuantelDevice,
	MediaObject,
	DeviceOptionsAny,
} from 'timeline-state-resolver'
import { CollectionObj } from '@sofie-automation/server-core-integration'

import * as _ from 'underscore'
import { DeviceConfig } from './connector'
import { TSRHandler } from './tsrHandler'
import { LoggerInstance } from './index'
// eslint-disable-next-line node/no-extraneous-import
import { ThreadedClass, MemUsageReport as ThreadMemUsageReport } from 'threadedclass'
import { Process } from './process'
import { PLAYOUT_DEVICE_CONFIG } from './configManifest'

export interface CoreConfig {
	host: string
	port: number
	watchdog: boolean
}
export interface PeripheralDeviceCommand {
	_id: string

	deviceId: string
	functionName: string
	args: Array<any>

	hasReply: boolean
	reply?: any
	replyError?: any

	time: number // time
}

export interface MemoryUsageReport {
	main: number
	threads: { [childId: string]: ThreadMemUsageReport }
}

/**
 * Represents a connection between the Gateway and Core
 */
export class CoreHandler {
	core!: CoreConnection
	logger: LoggerInstance
	public _observers: Array<any> = []
	public deviceSettings: { [key: string]: any } = {}

	public errorReporting = false
	public multithreading = false
	public reportAllCommands = false

	private _deviceOptions: DeviceConfig
	private _onConnected?: () => any
	private _executedFunctions: { [id: string]: boolean } = {}
	private _tsrHandler?: TSRHandler
	private _coreConfig?: CoreConfig
	private _process?: Process

	private _studioId: string | undefined
	private _timelineSubscription: string | null = null
	private _expectedItemsSubscription: string | null = null
	private _rundownsSubscription: string | null = null

	private _statusInitialized = false
	private _statusDestroyed = false

	constructor(logger: LoggerInstance, deviceOptions: DeviceConfig) {
		this.logger = logger
		this._deviceOptions = deviceOptions
	}

	async init(config: CoreConfig, process: Process): Promise<void> {
		// this.logger.info('========')
		this._statusInitialized = false
		this._coreConfig = config
		this._process = process

		this.core = new CoreConnection(
			this.getCoreConnectionOptions('Playout gateway', 'PlayoutCoreParent', P.SUBTYPE_PROCESS)
		)

		this.core.onConnected(() => {
			this.logger.info('Core Connected!')
			this.setupObserversAndSubscriptions().catch((e) => {
				this.logger.error('Core Error during setupObserversAndSubscriptions:', e)
			})
			if (this._onConnected) this._onConnected()
		})
		this.core.onDisconnected(() => {
			this.logger.warn('Core Disconnected!')
		})
		this.core.onError((err) => {
			this.logger.error('Core Error: ' + (err.message || err.toString() || err))
		})

		const ddpConfig: DDPConnectorOptions = {
			host: config.host,
			port: config.port,
		}
		if (this._process && this._process.certificates.length) {
			ddpConfig.tlsOpts = {
				ca: this._process.certificates,
			}
		}

		await this.core.init(ddpConfig)

		this.logger.info('Core id: ' + this.core.deviceId)
		await this.setupObserversAndSubscriptions()
		if (this._onConnected) this._onConnected()

		this._statusInitialized = true
		await this.updateCoreStatus()
	}
	setTSR(tsr: TSRHandler): void {
		this._tsrHandler = tsr
	}
	async setupObserversAndSubscriptions(): Promise<void> {
		this.logger.info('Core: Setting up subscriptions..')
		this.logger.info('DeviceId: ' + this.core.deviceId)
		await Promise.all([
			this.core.autoSubscribe('peripheralDevices', {
				_id: this.core.deviceId,
			}),
			this.core.autoSubscribe('studioOfDevice', this.core.deviceId),
			this.core.autoSubscribe('mappingsForDevice', this.core.deviceId),
			this.core.autoSubscribe('timelineForDevice', this.core.deviceId),
			this.core.autoSubscribe('peripheralDeviceCommands', this.core.deviceId),
		])

		this.logger.info('Core: Subscriptions are set up!')
		if (this._observers.length) {
			this.logger.info('CoreMos: Clearing observers..')
			this._observers.forEach((obs) => {
				obs.stop()
			})
			this._observers = []
		}
		// setup observers
		const observer = this.core.observe('peripheralDevices')
		observer.added = (id: string) => this.onDeviceChanged(id)
		observer.changed = (id: string) => this.onDeviceChanged(id)
		this.setupObserverForPeripheralDeviceCommands(this)
	}
	async destroy(): Promise<void> {
		this._statusDestroyed = true
		await this.updateCoreStatus()
		await this.core.destroy()
	}
	getCoreConnectionOptions(
		name: string,
		subDeviceId: string,
		subDeviceType: DeviceType | P.SUBTYPE_PROCESS
	): CoreOptions {
		let credentials: {
			deviceId: string
			deviceToken: string
		}

		if (this._deviceOptions.deviceId && this._deviceOptions.deviceToken) {
			credentials = {
				deviceId: this._deviceOptions.deviceId + subDeviceId,
				deviceToken: this._deviceOptions.deviceToken,
			}
		} else if (this._deviceOptions.deviceId) {
			this.logger.warn('Token not set, only id! This might be unsecure!')
			credentials = {
				deviceId: this._deviceOptions.deviceId + subDeviceId,
				deviceToken: 'unsecureToken',
			}
		} else {
			credentials = CoreConnection.getCredentials(subDeviceId)
		}
		const options: CoreOptions = {
			...credentials,

			deviceCategory: P.DeviceCategory.PLAYOUT,
			deviceType: P.DeviceType.PLAYOUT,
			deviceSubType: subDeviceType,

			deviceName: name,
			watchDog: this._coreConfig ? this._coreConfig.watchdog : true,

			configManifest: PLAYOUT_DEVICE_CONFIG,
		}
		if (subDeviceType === P.SUBTYPE_PROCESS) options.versions = this._getVersions()
		return options
	}
	onConnected(fcn: () => any): void {
		this._onConnected = fcn
	}
	onDeviceChanged(id: string): void {
		if (id === this.core.deviceId) {
			const col = this.core.getCollection('peripheralDevices')
			if (!col) throw new Error('collection "peripheralDevices" not found!')

			const device = col.findOne(id)
			if (device) {
				this.deviceSettings = device.settings || {}
			} else {
				this.deviceSettings = {}
			}

			const logLevel = this.deviceSettings['debugLogging'] ? 'debug' : 'info'
			if (logLevel !== this.logger.level) {
				this.logger.level = logLevel

				this.logger.info('Loglevel: ' + this.logger.level)

				// this.logger.debug('Test debug logging')
				// // @ts-ignore
				// this.logger.debug({ msg: 'test msg' })
				// // @ts-ignore
				// this.logger.debug({ message: 'test message' })
				// // @ts-ignore
				// this.logger.debug({ command: 'test command', context: 'test context' })

				// this.logger.debug('End test debug logging')
			}

			if (this.deviceSettings['errorReporting'] !== this.errorReporting) {
				this.errorReporting = this.deviceSettings['errorReporting']
			}
			if (this.deviceSettings['multiThreading'] !== this.multithreading) {
				this.multithreading = this.deviceSettings['multiThreading']
			}
			if (this.deviceSettings['reportAllCommands'] !== this.reportAllCommands) {
				this.reportAllCommands = this.deviceSettings['reportAllCommands']
			}

			const studioId = device.studioId
			if (studioId !== this._studioId) {
				this._studioId = studioId

				// Set up timeline data subscription:
				if (this._timelineSubscription) {
					this.core.unsubscribe(this._timelineSubscription)
					this._timelineSubscription = null
				}
				this.core
					.autoSubscribe('timeline', {
						studioId: studioId,
					})
					.then((subscriptionId) => {
						this._timelineSubscription = subscriptionId
					})
					.catch((err) => {
						this.logger.error(err)
					})

				// Set up expectedPlayoutItems data subscription:
				if (this._expectedItemsSubscription) {
					this.core.unsubscribe(this._expectedItemsSubscription)
					this._expectedItemsSubscription = null
				}
				this.core
					.autoSubscribe('expectedPlayoutItems', {
						studioId: studioId,
					})
					.then((subscriptionId) => {
						this._expectedItemsSubscription = subscriptionId
					})
					.catch((err) => {
						this.logger.error(err)
					})
				this.logger.debug('VIZDEBUG: Subscription to expectedPlayoutItems done')
				// Set up rundowns data subscription:
				if (this._rundownsSubscription) {
					this.core.unsubscribe(this._rundownsSubscription)
					this._rundownsSubscription = null
				}
				this.core
					.autoSubscribe('rundowns', {
						studioId: studioId,
					})
					.then((subscriptionId) => {
						this._rundownsSubscription = subscriptionId
					})
					.catch((err) => {
						this.logger.error(err)
					})
				this.logger.debug('VIZDEBUG: Subscription to rundowns done')
			}

			if (this._tsrHandler) {
				this._tsrHandler.onSettingsChanged()
			}
		}
	}
	get logDebug(): boolean {
		return !!this.deviceSettings['debugLogging']
	}

	executeFunction(cmd: PeripheralDeviceCommand, fcnObject: CoreHandler | CoreTSRDeviceHandler): void {
		if (cmd) {
			if (this._executedFunctions[cmd._id]) return // prevent it from running multiple times
			this.logger.debug(`Executing function "${cmd.functionName}", args: ${JSON.stringify(cmd.args)}`)
			this._executedFunctions[cmd._id] = true
			// console.log('executeFunction', cmd)
			const cb = (err: any, res?: any) => {
				// console.log('cb', err, res)
				if (err) {
					this.logger.error('executeFunction error', err, err.stack)
				}
				fcnObject.core
					.callMethod(P.methods.functionReply, [cmd._id, err, res])
					.then(() => {
						// console.log('cb done')
					})
					.catch((e) => {
						this.logger.error(e)
					})
			}
			// @ts-expect-error Untyped bunch of functions
			// eslint-disable-next-line @typescript-eslint/ban-types
			const fcn: Function = fcnObject[cmd.functionName]
			try {
				if (!fcn) throw Error(`Function "${cmd.functionName}" not found on device "${cmd.deviceId}"!`)

				Promise.resolve(fcn.apply(fcnObject, cmd.args))
					.then((result) => {
						cb(null, result)
					})
					.catch((e) => {
						cb(e.toString(), null)
					})
			} catch (e) {
				cb(e.toString(), null)
			}
		}
	}
	retireExecuteFunction(cmdId: string): void {
		delete this._executedFunctions[cmdId]
	}
	setupObserverForPeripheralDeviceCommands(functionObject: CoreTSRDeviceHandler | CoreHandler): void {
		const observer = functionObject.core.observe('peripheralDeviceCommands')
		functionObject.killProcess(0)
		functionObject._observers.push(observer)
		const addedChangedCommand = (id: string) => {
			const cmds = functionObject.core.getCollection('peripheralDeviceCommands')
			if (!cmds) throw Error('"peripheralDeviceCommands" collection not found!')
			const cmd = cmds.findOne(id) as PeripheralDeviceCommand
			if (!cmd) throw Error('PeripheralCommand "' + id + '" not found!')
			// console.log('addedChangedCommand', id)
			if (cmd.deviceId === functionObject.core.deviceId) {
				this.executeFunction(cmd, functionObject)
			} else {
				// console.log('not mine', cmd.deviceId, this.core.deviceId)
			}
		}
		observer.added = (id: string) => {
			addedChangedCommand(id)
		}
		observer.changed = (id: string) => {
			addedChangedCommand(id)
		}
		observer.removed = (id: string) => {
			this.retireExecuteFunction(id)
		}
		const cmds = functionObject.core.getCollection('peripheralDeviceCommands')
		if (!cmds) throw Error('"peripheralDeviceCommands" collection not found!')
		cmds.find({}).forEach((cmd0: CollectionObj) => {
			const cmd = cmd0 as PeripheralDeviceCommand
			if (cmd.deviceId === functionObject.core.deviceId) {
				this.executeFunction(cmd, functionObject)
			}
		})
	}
	killProcess(actually: number): boolean {
		if (actually === 1) {
			this.logger.info('KillProcess command received, shutting down in 1000ms!')
			setTimeout(() => {
				// eslint-disable-next-line no-process-exit
				process.exit(0)
			}, 1000)
			return true
		}
		return false
	}
	devicesMakeReady(okToDestroyStuff?: boolean, activeRundownId?: string): Promise<any> {
		if (this._tsrHandler) {
			return this._tsrHandler.tsr.devicesMakeReady(okToDestroyStuff, activeRundownId)
		} else {
			throw Error('TSR not set up!')
		}
	}
	devicesStandDown(okToDestroyStuff?: boolean): Promise<any> {
		if (this._tsrHandler) {
			return this._tsrHandler.tsr.devicesStandDown(okToDestroyStuff)
		} else {
			throw Error('TSR not set up!')
		}
	}
	pingResponse(message: string): void {
		this.core.setPingResponse(message)
	}
	getSnapshot(): any {
		this.logger.info('getSnapshot')
		const timeline = this._tsrHandler ? this._tsrHandler.getTimeline() : []
		const mappings = this._tsrHandler ? this._tsrHandler.getMappings() : []
		return {
			timeline: timeline,
			mappings: mappings,
		}
	}
	getDevicesInfo(): any {
		this.logger.info('getDevicesInfo')

		const devices: any[] = []
		if (this._tsrHandler) {
			for (const device of this._tsrHandler.tsr.getDevices()) {
				devices.push({
					instanceId: device.instanceId,
					deviceId: device.deviceId,
					deviceName: device.deviceName,
					startTime: device.startTime,
					upTime: Date.now() - device.startTime,
				})
			}
		}
		return devices
	}
	async getMemoryUsage(): Promise<MemoryUsageReport> {
		if (this._tsrHandler) {
			/** Convert all properties from bytes to MB */
			const toMB = (o: any) => {
				if (typeof o === 'object') {
					const o2: any = {}
					for (const key of Object.keys(o)) {
						o2[key] = toMB(o[key])
					}
					return o2
				} else if (typeof o === 'number') {
					return o / 1024 / 1024
				}
				return o
			}

			const values: MemoryUsageReport = {
				main: toMB(process.memoryUsage()),
				threads: toMB(await this._tsrHandler.tsr.getThreadsMemoryUsage()),
			}

			return toMB(values)
		} else {
			throw new Error('TSR not set up!')
		}
	}
	restartCasparCG(deviceId: string): Promise<any> {
		if (!this._tsrHandler) throw new Error('TSRHandler is not initialized')

		const device = this._tsrHandler.tsr.getDevice(deviceId)?.device as ThreadedClass<CasparCGDevice>
		if (!device) throw new Error(`TSR Device "${deviceId}" not found!`)

		return device.restartCasparCG()
	}
	restartQuantel(deviceId: string): Promise<any> {
		if (!this._tsrHandler) throw new Error('TSRHandler is not initialized')

		const device = this._tsrHandler.tsr.getDevice(deviceId)?.device as ThreadedClass<QuantelDevice>
		if (!device) throw new Error(`TSR Device "${deviceId}" not found!`)

		return device.restartGateway()
	}
	async formatHyperdeck(deviceId: string): Promise<void> {
		if (!this._tsrHandler) throw new Error('TSRHandler is not initialized')

		const device = this._tsrHandler.tsr.getDevice(deviceId)?.device as ThreadedClass<HyperdeckDevice>
		if (!device) throw new Error(`TSR Device "${deviceId}" not found!`)

		await device.formatDisks()
	}
	updateCoreStatus(): Promise<any> {
		let statusCode = P.StatusCode.GOOD
		const messages: Array<string> = []

		if (!this._statusInitialized) {
			statusCode = P.StatusCode.BAD
			messages.push('Starting up...')
		}
		if (this._statusDestroyed) {
			statusCode = P.StatusCode.BAD
			messages.push('Shut down')
		}

		return this.core.setStatus({
			statusCode: statusCode,
			messages: messages,
		})
	}
	private _getVersions() {
		const versions: { [packageName: string]: string } = {}

		if (process.env.npm_package_version) {
			versions['_process'] = process.env.npm_package_version
		}

		const pkgNames = [
			'timeline-state-resolver',
			'atem-connection',
			'atem-state',
			'casparcg-connection',
			'casparcg-state',
			'emberplus-connection',
			'superfly-timeline',
		]
		try {
			for (const pkgName of pkgNames) {
				try {
					// eslint-disable-next-line @typescript-eslint/no-var-requires
					const pkgInfo = require(`${pkgName}/package.json`)
					versions[pkgName] = pkgInfo.version || 'N/A'
				} catch (e) {
					this.logger.error(`Failed to load package.json for lib "${pkgName}": ${e}`)
				}
			}
		} catch (e) {
			this.logger.error(e)
		}
		return versions
	}
}

export class CoreTSRDeviceHandler {
	core!: CoreConnection
	public _observers: Array<any> = []
	public _devicePr: Promise<DeviceContainer<DeviceOptionsAny>>
	public _deviceId: string
	public _device!: DeviceContainer<DeviceOptionsAny>
	private _coreParentHandler: CoreHandler
	private _tsrHandler: TSRHandler
	private _subscriptions: Array<string> = []
	private _hasGottenStatusChange = false
	private _deviceStatus: P.StatusObject = {
		statusCode: P.StatusCode.BAD,
		messages: ['Starting up...'],
	}

	constructor(
		parent: CoreHandler,
		device: Promise<DeviceContainer<DeviceOptionsAny>>,
		deviceId: string,
		tsrHandler: TSRHandler
	) {
		this._coreParentHandler = parent
		this._devicePr = device
		this._deviceId = deviceId
		this._tsrHandler = tsrHandler

		// this._coreParentHandler.logger.info('new CoreTSRDeviceHandler ' + device.deviceName)

		// this.core = new CoreConnection(parent.getCoreConnectionOptions('MOS: ' + device.idPrimary, device.idPrimary, false))
		// this.core.onError((err) => {
		// 	this._coreParentHandler.logger.error('Core Error: ' + (err.message || err.toString() || err))
		// })
	}
	async init(): Promise<void> {
		this._device = await this._devicePr
		const deviceId = this._device.deviceId
		const deviceName = `${deviceId} (${this._device.deviceName})`

		this.core = new CoreConnection(
			this._coreParentHandler.getCoreConnectionOptions(
				deviceName,
				'Playout' + deviceId,
				this._device.deviceOptions.type
			)
		)
		this.core.onError((err) => {
			this._coreParentHandler.logger.error(
				'Core Error: ' + ((_.isObject(err) && err.message) || err.toString() || err)
			)
		})
		this.core.onInfo((message) => {
			this._coreParentHandler.logger.info(
				'Core Info: ' + ((_.isObject(message) && message.message) || message.toString() || message)
			)
		})
		await this.core.init(this._coreParentHandler.core)

		if (!this._hasGottenStatusChange) {
			this._deviceStatus = {
				statusCode: (await this._device.device.canConnect)
					? (await this._device.device.connected)
						? P.StatusCode.GOOD
						: P.StatusCode.BAD
					: P.StatusCode.GOOD,
			}
			this.sendStatus()
		}
		await this.setupSubscriptionsAndObservers()
		console.log('setupSubscriptionsAndObservers done')
	}
	async setupSubscriptionsAndObservers(): Promise<void> {
		// console.log('setupObservers', this.core.deviceId)
		if (this._observers.length) {
			this._coreParentHandler.logger.info('CoreTSRDevice: Clearing observers..')
			this._observers.forEach((obs) => {
				obs.stop()
			})
			this._observers = []
		}
		const deviceId = this._device.deviceId

		this._coreParentHandler.logger.info(
			'CoreTSRDevice: Setting up subscriptions for ' + this.core.deviceId + ' for device ' + deviceId + ' ..'
		)
		this._subscriptions = []
		try {
			const sub = await this.core.autoSubscribe('peripheralDeviceCommands', this.core.deviceId)
			this._subscriptions.push(sub)
		} catch (e) {
			this._coreParentHandler.logger.error(e)
		}

		this._coreParentHandler.logger.info('CoreTSRDevice: Setting up observers..')

		// setup observers
		this._coreParentHandler.setupObserverForPeripheralDeviceCommands(this)
	}
	statusChanged(deviceStatus: P.StatusObject): void {
		this._hasGottenStatusChange = true

		this._deviceStatus = deviceStatus
		this.sendStatus()
	}
	/** Send the device status to Core */
	sendStatus(): void {
		if (!this.core) return // not initialized yet

		this.core
			.setStatus(this._deviceStatus)
			.catch((e) => this._coreParentHandler.logger.error('Error when setting status: ', e, e.stack))
	}
	onCommandError(
		errorMessage: string,
		ref: {
			rundownId?: string
			partId?: string
			pieceId?: string
			context: string
			timelineObjId: string
		}
	): void {
		this.core
			.callMethodLowPrio(PeripheralDeviceAPI.methods.reportCommandError, [errorMessage, ref])
			.catch((e) => this._coreParentHandler.logger.error('Error when callMethodLowPrio: ', e, e.stack))
	}
	onUpdateMediaObject(collectionId: string, docId: string, doc: MediaObject | null): void {
		this.core
			.callMethodLowPrio(PeripheralDeviceAPI.methods.updateMediaObject, [collectionId, docId, doc])
			.catch((e) => this._coreParentHandler.logger.error('Error when updating Media Object: ' + e, e.stack))
	}
	onClearMediaObjectCollection(collectionId: string): void {
		this.core
			.callMethodLowPrio(PeripheralDeviceAPI.methods.clearMediaObjectCollection, [collectionId])
			.catch((e) =>
				this._coreParentHandler.logger.error('Error when clearing Media Objects collection: ' + e, e.stack)
			)
	}

	async dispose(): Promise<void> {
		this._observers.forEach((obs) => {
			obs.stop()
		})

		await this._tsrHandler.tsr.removeDevice(this._deviceId)
		await this.core.setStatus({
			statusCode: P.StatusCode.BAD,
			messages: ['Uninitialized'],
		})
	}
	killProcess(actually: number): boolean {
		return this._coreParentHandler.killProcess(actually)
	}
	restartCasparCG(): Promise<any> {
		const device = this._device.device as ThreadedClass<CasparCGDevice>
		if (device.restartCasparCG) {
			return device.restartCasparCG()
		} else {
			return Promise.reject('device.restartCasparCG not set')
		}
	}
	restartQuantel(): Promise<any> {
		const device = this._device.device as ThreadedClass<QuantelDevice>
		if (device.restartGateway) {
			return device.restartGateway()
		} else {
			return Promise.reject('device.restartGateway not set')
		}
	}
	formatHyperdeck(): Promise<any> {
		const device = this._device.device as ThreadedClass<HyperdeckDevice>
		if (device.formatDisks) {
			return device.formatDisks()
		} else {
			return Promise.reject('device.formatHyperdeck not set')
		}
	}
}
