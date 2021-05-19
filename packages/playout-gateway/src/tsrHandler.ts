import {
	Conductor,
	DeviceType,
	ConductorOptions,
	Device,
	TimelineTriggerTimeResult,
	DeviceOptionsAny,
	Mappings,
	DeviceContainer,
	Timeline as TimelineTypes,
	TSRTimelineObj,
	TSRTimeline,
	TSRTimelineObjBase,
	CommandReport,
	DeviceOptionsAtem,
	AtemMediaPoolType,
	MediaObject,
	ExpectedPlayoutItem,
	ExpectedPlayoutItemContent,
} from 'timeline-state-resolver'
import { CoreHandler, CoreTSRDeviceHandler } from './coreHandler'
import clone = require('fast-clone')
import * as crypto from 'crypto'
import * as cp from 'child_process'

import * as _ from 'underscore'
import { CoreConnection, PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { TimelineObjectCoreExt } from '@sofie-automation/blueprints-integration'
import { LoggerInstance } from './index'
import { disableAtemUpload } from './config'

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface TSRConfig {}
export interface TSRSettings {
	// Runtime settings from Core
	devices: {
		[deviceId: string]: DeviceOptionsAny
	}
	initializeAsClear: boolean
	mappings: Mappings
	errorReporting?: boolean
	multiThreading?: boolean
	multiThreadedResolver?: boolean
	useCacheWhenResolving?: boolean
}
export interface TSRDevice {
	coreConnection: CoreConnection
	device: Device
}

// ----------------------------------------------------------------------------
// interface copied from Core lib/collections/Timeline.ts
export interface TimelineObjGeneric extends TimelineObjectCoreExt {
	/** Unique _id (generally obj.studioId + '_' + obj.id) */
	_id: string
	/** Unique within a timeline (ie within a studio) */
	id: string

	/** Studio installation Id */
	studioId: string

	objectType: TimelineObjType

	enable: TimelineTypes.TimelineEnable & {
		setFromNow?: boolean
	}

	inGroup?: string

	metadata?: {
		[key: string]: any
	}

	/** Only set to true when an object is inserted by lookahead */
	isLookahead?: boolean
	/** Set when an object is on a virtual layer for lookahead, so that it can be routed correctly */
	originalLLayer?: string | number
}
export enum TimelineObjType {
	/** Objects played in a rundown */
	RUNDOWN = 'rundown',
	/** Objects controlling recording */
	RECORDING = 'record',
	/** Objects controlling manual playback */
	MANUAL = 'manual',
	/** "Magic object", used to calculate a hash of the timeline */
	STAT = 'stat',
}
export interface TimelineComplete {
	_id: string
	timeline: Array<TimelineObjGeneric>
}
// ----------------------------------------------------------------------------

export interface TimelineContentObjectTmp extends TSRTimelineObjBase {
	inGroup?: string
}
/** Max time for initializing devices */
const INIT_TIMEOUT = 10000
/**
 * Represents a connection between Gateway and TSR
 */
export class TSRHandler {
	logger: LoggerInstance
	tsr!: Conductor
	// private _config: TSRConfig
	private _coreHandler!: CoreHandler
	private _triggerupdateDevicesTimeout: any = null
	private _triggerupdateExpectedPlayoutItemsTimeout: any = null
	private _coreTsrHandlers: { [deviceId: string]: CoreTSRDeviceHandler } = {}
	private _observers: Array<any> = []
	private _cachedStudioId = ''

	private _initialized = false
	private _multiThreaded: boolean | null = null
	private _reportAllCommands: boolean | null = null
	private _errorReporting: boolean | null = null

	private _updateDevicesIsRunning = false
	private _lastReportedObjHashes: string[] = []

	constructor(logger: LoggerInstance) {
		this.logger = logger
	}

	public async init(_config: TSRConfig, coreHandler: CoreHandler): Promise<void> {
		// this._config = config
		this._coreHandler = coreHandler

		this._coreHandler.setTSR(this)

		this.logger.info('TSRHandler init')

		const peripheralDevice = await coreHandler.core.getPeripheralDevice()
		const settings: TSRSettings = peripheralDevice.settings || {}

		this.logger.info('Devices', settings.devices)
		const c: ConductorOptions = {
			getCurrentTime: (): number => {
				return this._coreHandler.core.getCurrentTime()
			},
			initializeAsClear: settings.initializeAsClear !== false,
			multiThreadedResolver: settings.multiThreadedResolver === true,
			useCacheWhenResolving: settings.useCacheWhenResolving === true,
			proActiveResolve: true,
		}
		this.tsr = new Conductor(c)
		this._triggerupdateTimelineAndMappings()

		coreHandler.onConnected(() => {
			this.setupObservers()
			this.resendStatuses()
		})
		this.setupObservers()

		this.tsr.on('error', (e, ...args) => {
			// CasparCG play and load 404 errors should be warnings:
			const msg: string = e + ''
			// let cmdInfo: string = args[0] + ''
			const cmdReply = args[0]

			if (
				msg.match(/casparcg/i) &&
				(msg.match(/PlayCommand/i) || msg.match(/LoadbgCommand/i)) &&
				cmdReply &&
				_.isObject(cmdReply) &&
				cmdReply.response &&
				cmdReply.response.code === 404
			) {
				this.logger.warn('TSR', e, ...args)
			} else {
				this.logger.error('TSR', e, ...args)
			}
		})
		this.tsr.on('info', (msg, ...args) => {
			this.logger.info('TSR', msg, ...args)
		})
		this.tsr.on('warning', (msg, ...args) => {
			this.logger.warn('TSR', msg, ...args)
		})
		this.tsr.on('debug', (...args: any[]) => {
			if (this._coreHandler.logDebug) {
				const msg: any = {
					message: 'TSR debug message (' + args.length + ')',
					data: [],
				}
				if (args.length) {
					_.each(args, (arg) => {
						if (_.isObject(arg)) {
							msg.data.push(JSON.stringify(arg))
						} else {
							msg.data.push(arg)
						}
					})
				} else {
					msg.data.push('>empty message<')
				}

				this.logger.debug(msg)
			}
		})

		this.tsr.on('command', (id: string, cmd: any) => {
			// This is an deprecated event emitter, to be removed soon
			if (this._coreHandler.logDebug) {
				this.logger.info('TSR: Command', {
					device: id,
					cmdName: cmd.constructor ? cmd.constructor.name : undefined,
					cmd: JSON.parse(JSON.stringify(cmd)),
				})
			}
		})

		this.tsr.on('setTimelineTriggerTime', (r: TimelineTriggerTimeResult) => {
			this.logger.debug('setTimelineTriggerTime')
			this._coreHandler.core.callMethod(PeripheralDeviceAPI.methods.timelineTriggerTime, [r]).catch((e) => {
				this.logger.error('Error in setTimelineTriggerTime', e)
			})
		})
		this.tsr.on('timelineCallback', (time, objId, callbackName, data) => {
			// @ts-expect-error Untyped bunch of methods
			const method = PeripheralDeviceAPI.methods[callbackName]
			if (method) {
				this._coreHandler.core
					.callMethod(method, [
						Object.assign({}, data, {
							objId: objId,
							time: time,
						}),
					])
					.catch((e) => {
						this.logger.error('Error in timelineCallback', e)
					})
			} else {
				this.logger.error(`Unknown callback method "${callbackName}"`)
			}
		})
		this.tsr.on('resolveDone', (timelineHash: string, resolveDuration: number) => {
			// Make sure we only report back once, per update timeline
			if (this._lastReportedObjHashes.includes(timelineHash)) return

			this._lastReportedObjHashes.unshift(timelineHash)
			if (this._lastReportedObjHashes.length > 10) {
				this._lastReportedObjHashes.length = 10
			}

			this._coreHandler.core
				.callMethod('peripheralDevice.reportResolveDone', [timelineHash, resolveDuration])
				.catch((e) => {
					this.logger.error('Error in reportResolveDone', e)
				})
		})

		this.logger.debug('tsr init')
		await this.tsr.init()

		this._initialized = true
		this._triggerupdateTimelineAndMappings()
		this.onSettingsChanged()
		this._triggerUpdateDevices()
		this.logger.debug('tsr init done')
	}
	private setupObservers(): void {
		if (this._observers.length) {
			this.logger.debug('Clearing observers..')
			this._observers.forEach((obs) => {
				obs.stop()
			})
			this._observers = []
		}
		this.logger.debug('Renewing observers')

		const timelineObserver = this._coreHandler.core.observe('studioTimeline')
		timelineObserver.added = () => {
			this._triggerupdateTimelineAndMappings()
		}
		timelineObserver.changed = () => {
			this._triggerupdateTimelineAndMappings()
		}
		timelineObserver.removed = () => {
			this._triggerupdateTimelineAndMappings()
		}
		this._observers.push(timelineObserver)

		const mappingsObserver = this._coreHandler.core.observe('studioMappings')
		mappingsObserver.added = () => {
			this._triggerupdateTimelineAndMappings()
		}
		mappingsObserver.changed = () => {
			this._triggerupdateTimelineAndMappings()
		}
		mappingsObserver.removed = () => {
			this._triggerupdateTimelineAndMappings()
		}
		this._observers.push(mappingsObserver)

		const deviceObserver = this._coreHandler.core.observe('peripheralDevices')
		deviceObserver.added = () => {
			this._triggerUpdateDevices()
		}
		deviceObserver.changed = () => {
			this._triggerUpdateDevices()
		}
		deviceObserver.removed = () => {
			this._triggerUpdateDevices()
		}
		this._observers.push(deviceObserver)

		const expectedPlayoutItemsObserver = this._coreHandler.core.observe('expectedPlayoutItems')
		expectedPlayoutItemsObserver.added = () => {
			this._triggerupdateExpectedPlayoutItems()
		}
		expectedPlayoutItemsObserver.changed = () => {
			this._triggerupdateExpectedPlayoutItems()
		}
		expectedPlayoutItemsObserver.removed = () => {
			this._triggerupdateExpectedPlayoutItems()
		}
		this._observers.push(expectedPlayoutItemsObserver)
		this.logger.debug('VIZDEBUG: Observer to expectedPlayoutItems set up')
	}
	private resendStatuses(): void {
		_.each(this._coreTsrHandlers, (tsrHandler) => {
			tsrHandler.sendStatus()
		})
	}
	destroy(): Promise<void> {
		return this.tsr.destroy()
	}
	getTimeline():
		| {
				// Copied from Core:
				_id: string // Studio id
				mappingsHash: string
				timelineHash: string
				timeline: TimelineObjGeneric[]
		  }
		| undefined {
		const studioId = this._getStudioId()
		if (!studioId) {
			this.logger.warn('no studioId')
			return undefined
		}

		const timeline = this._coreHandler.core.getCollection('studioTimeline').findOne((o: TimelineComplete) => {
			return o._id === studioId
		})

		return timeline as any
	}
	getMappings():
		| {
				_id: string // Studio id
				mappingsHash: string
				mappings: Mappings
		  }
		| undefined {
		const studioId = this._getStudioId()
		if (!studioId) {
			// this.logger.warn('no studioId')
			return undefined
		}
		// Note: The studioMappings virtual collection contains a single object that contains all mappings
		const mappingsObject = this._coreHandler.core.getCollection('studioMappings').findOne(studioId)

		return mappingsObject as any
	}
	onSettingsChanged(): void {
		if (!this._initialized) return

		if (this.tsr.logDebug !== this._coreHandler.logDebug) {
			this.logger.info(`Log settings: ${this._coreHandler.logDebug}`)
			this.tsr.logDebug = this._coreHandler.logDebug
		}

		if (this._errorReporting !== this._coreHandler.errorReporting) {
			this._errorReporting = this._coreHandler.errorReporting

			this.logger.info('ErrorReporting: ' + this._multiThreaded)
		}
		if (this._multiThreaded !== this._coreHandler.multithreading) {
			this._multiThreaded = this._coreHandler.multithreading

			this.logger.info('Multithreading: ' + this._multiThreaded)

			this._triggerUpdateDevices()
		}
		if (this._reportAllCommands !== this._coreHandler.reportAllCommands) {
			this._reportAllCommands = this._coreHandler.reportAllCommands

			this.logger.info('ReportAllCommands: ' + this._reportAllCommands)

			this._triggerUpdateDevices()
		}
	}
	private _triggerupdateTimelineAndMappings() {
		if (!this._initialized) return

		this._updateTimelineAndMappings()
	}
	private _updateTimelineAndMappings() {
		const timeline = this.getTimeline()
		const mappingsObject = this.getMappings()

		if (!timeline) {
			this.logger.debug(`Cancel resolving: No timeline`)
			return
		}
		if (!mappingsObject) {
			this.logger.debug(`Cancel resolving: No mappings`)
			return
		}
		// Compare mappingsHash to ensure that the timeline we've received is in sync with the mappings:
		if (timeline.mappingsHash !== mappingsObject.mappingsHash) {
			this.logger.info(
				`Cancel resolving: mappingsHash differ: "${timeline.mappingsHash}" vs "${mappingsObject.mappingsHash}"`
			)
			return
		}

		this.logger.debug(`Trigger new resolving`)

		const transformedTimeline = this._transformTimeline(timeline.timeline)
		this.tsr.timelineHash = timeline.timelineHash
		this.tsr.setTimelineAndMappings(transformedTimeline, mappingsObject.mappings)
	}
	private _getPeripheralDevice() {
		const peripheralDevices = this._coreHandler.core.getCollection('peripheralDevices')
		return peripheralDevices.findOne(this._coreHandler.core.deviceId)
	}
	private _getStudio(): any | null {
		const peripheralDevice = this._getPeripheralDevice()
		if (peripheralDevice) {
			const studios = this._coreHandler.core.getCollection('studios')
			return studios.findOne(peripheralDevice.studioId)
		}
		return null
	}
	private _getStudioId(): string | null {
		if (this._cachedStudioId) return this._cachedStudioId

		const studio = this._getStudio()
		if (studio) {
			this._cachedStudioId = studio._id
			return studio._id
		}
		return null
	}
	private _triggerUpdateDevices() {
		if (!this._initialized) return

		if (!this._updateDevicesIsRunning) {
			this._updateDevicesIsRunning = true

			// Defer:
			setTimeout(() => {
				this._updateDevices().then(
					() => {
						this._updateDevicesIsRunning = false
					},
					() => {
						this._updateDevicesIsRunning = false
					}
				)
			}, 10)
		} else {
			// oh, it's already running, check again later then:
			if (this._triggerupdateDevicesTimeout) {
				clearTimeout(this._triggerupdateDevicesTimeout)
			}
			this._triggerupdateDevicesTimeout = setTimeout(() => {
				this._triggerUpdateDevices()
			}, 100)
		}
	}
	private async _updateDevices(): Promise<void> {
		this.logger.info('updateDevices start')

		const peripheralDevices = this._coreHandler.core.getCollection('peripheralDevices')
		const peripheralDevice = peripheralDevices.findOne(this._coreHandler.core.deviceId)

		const ps: Promise<any>[] = []
		const promiseOperations: { [id: string]: true } = {}
		const keepTrack = <T>(p: Promise<T>, name: string) => {
			promiseOperations[name] = true
			return p.then((result) => {
				delete promiseOperations[name]
				return result
			})
		}

		if (peripheralDevice) {
			const settings: TSRSettings = peripheralDevice.settings || {}

			const devices: {
				[deviceId: string]: DeviceOptionsAny
			} = {}

			_.each(settings.devices, (device, deviceId) => {
				if (!device.disable) {
					devices[deviceId] = device
				}
			})

			_.each(devices, (deviceOptions: DeviceOptionsAny, deviceId: string) => {
				const oldDevice: DeviceContainer = this.tsr.getDevice(deviceId)

				deviceOptions = _.extend(
					{
						// Defaults:
						limitSlowSentCommand: 40,
						limitSlowFulfilledCommand: 100,
						options: {},
					},
					deviceOptions
				)

				if (this._multiThreaded !== null && deviceOptions.isMultiThreaded === undefined) {
					deviceOptions.isMultiThreaded = this._multiThreaded
				}
				if (this._reportAllCommands !== null && deviceOptions.reportAllCommands === undefined) {
					deviceOptions.reportAllCommands = this._reportAllCommands
				}

				if (!oldDevice) {
					if (deviceOptions.options) {
						this.logger.info('Initializing device: ' + deviceId)
						this.logger.info('new', deviceOptions)
						ps.push(keepTrack(this._addDevice(deviceId, deviceOptions), 'add_' + deviceId))
					}
				} else {
					if (deviceOptions.options) {
						let anyChanged = false

						// let oldOptions = (oldDevice.deviceOptions).options || {}

						if (!_.isEqual(oldDevice.deviceOptions, deviceOptions)) {
							anyChanged = true
						}

						if (anyChanged) {
							this.logger.info('Re-initializing device: ' + deviceId)
							this.logger.info('old', oldDevice.deviceOptions)
							this.logger.info('new', deviceOptions)
							ps.push(
								keepTrack(this._removeDevice(deviceId), 'remove_' + deviceId).then(() => {
									return keepTrack(this._addDevice(deviceId, deviceOptions), 're-add_' + deviceId)
								})
							)
						}
					}
				}
			})

			_.each(this.tsr.getDevices(), async (oldDevice: DeviceContainer) => {
				const deviceId = oldDevice.deviceId
				if (!devices[deviceId]) {
					this.logger.info('Un-initializing device: ' + deviceId)
					ps.push(keepTrack(this._removeDevice(deviceId), 'remove_' + deviceId))
				}
			})
		}

		await Promise.race([
			Promise.all(ps),
			new Promise<void>((resolve) =>
				setTimeout(() => {
					const keys = _.keys(promiseOperations)
					if (keys.length) {
						this.logger.warn(`Timeout in _updateDevices: ${keys.join(',')}`)
					}
					resolve()
				}, INIT_TIMEOUT)
			), // Timeout if not all are resolved within INIT_TIMEOUT
		])
		this._triggerupdateExpectedPlayoutItems() // So that any recently created devices will get all the ExpectedPlayoutItems
		this.logger.info('updateDevices end')
	}
	private async _addDevice(deviceId: string, options: DeviceOptionsAny): Promise<any> {
		this.logger.debug('Adding device ' + deviceId)

		try {
			if (this._coreTsrHandlers[deviceId]) {
				throw new Error(`There is already a _coreTsrHandlers for deviceId "${deviceId}"!`)
			}

			const devicePr: Promise<DeviceContainer> = this.tsr.addDevice(deviceId, options)

			const coreTsrHandler = new CoreTSRDeviceHandler(this._coreHandler, devicePr, deviceId, this)

			this._coreTsrHandlers[deviceId] = coreTsrHandler

			const device = await devicePr

			// Set up device status
			const deviceType = device.deviceType

			const onDeviceStatusChanged = (connectedOrStatus: boolean | PeripheralDeviceAPI.StatusObject) => {
				let deviceStatus: PeripheralDeviceAPI.StatusObject
				if (_.isBoolean(connectedOrStatus)) {
					// for backwards compability, to be removed later
					if (connectedOrStatus) {
						deviceStatus = {
							statusCode: PeripheralDeviceAPI.StatusCode.GOOD,
						}
					} else {
						deviceStatus = {
							statusCode: PeripheralDeviceAPI.StatusCode.BAD,
							messages: ['Disconnected'],
						}
					}
				} else {
					deviceStatus = connectedOrStatus
				}
				coreTsrHandler.statusChanged(deviceStatus)
				// hack to make sure atem has media after restart
				if (
					(deviceStatus.statusCode === PeripheralDeviceAPI.StatusCode.GOOD ||
						deviceStatus.statusCode === PeripheralDeviceAPI.StatusCode.WARNING_MINOR ||
						deviceStatus.statusCode === PeripheralDeviceAPI.StatusCode.WARNING_MAJOR) &&
					deviceType === DeviceType.ATEM &&
					!disableAtemUpload
				) {
					// const ssrcBgs = studio.config.filter((o) => o._id.substr(0, 18) === 'atemSSrcBackground')
					const assets = (options as DeviceOptionsAtem).options.mediaPoolAssets
					if (assets && assets.length > 0) {
						try {
							// TODO: support uploading clips and audio
							this.uploadFilesToAtem(
								_.compact(
									assets.map((asset) => {
										return asset.type === AtemMediaPoolType.Still &&
											_.isNumber(asset.position) &&
											asset.path
											? {
													position: asset.position,
													path: asset.path,
											  }
											: undefined
									})
								)
							)
						} catch (e) {
							// don't worry about it.
						}
					}
				}
			}
			const onSlowCommand = (commandInfo: string) => {
				this.logger.warn(commandInfo)
			}
			/*const onCommandError = (error: Error, context: CommandWithContext) => {
				if (this._errorReporting) {
					this.logger.warn('CommandError', device.deviceId, error.toString())
					this.logger.info('Command context', context.timelineObjId, context.context)

					// find the corresponding timeline object:
					const obj = _.find(this.tsr.timeline, (obj) => {
						return obj.id === context.timelineObjId
					})

					const errorString: string = device.deviceName +
					(
						error instanceof Error ?
							error.toString() :
						_.isObject(error) ?
							JSON.stringify(error) :
						error + ''
					)
					coreTsrHandler.onCommandError(errorString, {
						timelineObjId:	context.timelineObjId,
						context: 		context.context,
						partId:		obj ? obj['partId']		: undefined,
						pieceId:	obj ? obj['pieceId']	: undefined
					})
				} else {
					this.logger.warn('CommandError', device.deviceId, error.toString(), error.stack)
				}
			}*/
			const onCommandReport = (commandReport: CommandReport) => {
				if (this._reportAllCommands) {
					// Todo: send these to Core
					this.logger.info('commandReport', {
						commandReport: commandReport,
					})
				}
			}
			const onCommandError = (error: any, context: any) => {
				// todo: handle this better
				this.logger.error(error)
				this.logger.debug(context)
			}
			const onUpdateMediaObject = (collectionId: string, docId: string, doc: MediaObject | null) => {
				coreTsrHandler.onUpdateMediaObject(collectionId, docId, doc)
			}
			const onClearMediaObjectCollection = (collectionId: string) => {
				coreTsrHandler.onClearMediaObjectCollection(collectionId)
			}
			let deviceName = device.deviceName
			const deviceInstanceId = device.instanceId
			const fixError = (e: any) => {
				const name = `Device "${deviceName || deviceId}" (${deviceInstanceId})`
				if (e.reason) e.reason = name + ': ' + e.reason
				if (e.message) e.message = name + ': ' + e.message
				if (e.stack) {
					e.stack += '\nAt device' + name
				}
				if (_.isString(e)) e = name + ': ' + e

				return e
			}
			await coreTsrHandler.init()

			deviceName = device.deviceName

			device.onChildClose = () => {
				// Called if a child is closed / crashed
				this.logger.warn(`Child of device ${deviceId} closed/crashed`)

				onDeviceStatusChanged({
					statusCode: PeripheralDeviceAPI.StatusCode.BAD,
					messages: ['Child process closed'],
				})

				this._removeDevice(deviceId).then(
					() => {
						this._triggerUpdateDevices()
					},
					() => {
						this._triggerUpdateDevices()
					}
				)
			}
			await device.device.on('connectionChanged', onDeviceStatusChanged)
			await device.device.on('slowCommand', onSlowCommand)
			await device.device.on('commandError', onCommandError)
			await device.device.on('commandReport', onCommandReport)
			await device.device.on('updateMediaObject', onUpdateMediaObject)
			await device.device.on('clearMediaObjects', onClearMediaObjectCollection)

			await device.device.on('info', (e: any, ...args: any[]) => this.logger.info(fixError(e), ...args))
			await device.device.on('warning', (e: any, ...args: any[]) => this.logger.warn(fixError(e), ...args))
			await device.device.on('error', (e: any, ...args: any[]) => this.logger.error(fixError(e), ...args))
			await device.device.on('debug', (e: any, ...args: any[]) => this.logger.debug(fixError(e), ...args))

			// also ask for the status now, and update:
			onDeviceStatusChanged(await device.device.getStatus())
		} catch (e) {
			// Initialization failed, clean up any artifacts and see if we can try again later:
			this.logger.error(`Error when adding device "${deviceId}"`, e)
			try {
				await this._removeDevice(deviceId)
			} catch (e) {
				this.logger.error(`Error when cleaning up after adding device "${deviceId}" error...`, e)
			}

			setTimeout(() => {
				// try again later:
				this._triggerUpdateDevices()
			}, 10 * 1000)
		}
	}
	/**
	 * This function is a quick and dirty solution to load a still to the atem mixers.
	 * This does not serve as a proper implementation! And need to be refactor
	 * // @todo: proper atem media management
	 * /Balte - 22-08
	 */
	private uploadFilesToAtem(files: { position: number; path: string }[]) {
		files.forEach((file) => {
			this.logger.info('try to load ' + JSON.stringify(file) + ' to atem')
			this.tsr.getDevices().forEach(async (device) => {
				if (device.deviceType === DeviceType.ATEM) {
					const options = device.deviceOptions.options as { host: string }
					this.logger.info('options ' + JSON.stringify(options))
					if (options && options.host) {
						this.logger.info('uploading ' + file.path + ' to ' + options.host + ' in MP' + file.position)
						const process = cp.spawn(`node`, [
							`./dist/atemUploader.js`,
							options.host,
							file.path,
							file.position.toString(),
						])
						process.stdout.on('data', (data) => this.logger.info(data.toString()))
						process.stderr.on('data', (data) => this.logger.info(data.toString()))
						process.on('close', () => {
							process.removeAllListeners()
						})
					} else {
						throw Error('ATEM host option not set')
					}
				}
			})
		})
	}
	private async _removeDevice(deviceId: string): Promise<any> {
		if (this._coreTsrHandlers[deviceId]) {
			try {
				await this._coreTsrHandlers[deviceId].dispose()
			} catch (e) {
				this.logger.error(`Error when removing device "${deviceId}"`, e)
			}
		}
		delete this._coreTsrHandlers[deviceId]
	}
	private _triggerupdateExpectedPlayoutItems() {
		this.logger.debug('VIZDEBUG: Trigger update expected playout items called')
		if (!this._initialized) return
		this.logger.debug("VIZDEBUG: And we're initialized")
		if (this._triggerupdateExpectedPlayoutItemsTimeout) {
			clearTimeout(this._triggerupdateExpectedPlayoutItemsTimeout)
		}
		this._triggerupdateExpectedPlayoutItemsTimeout = setTimeout(() => {
			this._updateExpectedPlayoutItems().catch((e) =>
				this.logger.error('Error in _updateExpectedPlayoutItems', e)
			)
		}, 200)
	}
	private async _updateExpectedPlayoutItems() {
		this.logger.debug('VIZDEBUG: Update expected playout items called')

		const expectedPlayoutItems = this._coreHandler.core.getCollection('expectedPlayoutItems')
		const peripheralDevice = this._getPeripheralDevice()

		this.logger.debug(`VIZDEBUG: Items before filter ${JSON.stringify(expectedPlayoutItems)}`)

		const expectedItems = expectedPlayoutItems.find({
			studioId: peripheralDevice.studioId,
		})

		this.logger.debug(`VIZDEBUG: Items after filter ${JSON.stringify(expectedItems)}`)

		await Promise.all(
			_.map(this.tsr.getDevices(), async (container) => {
				if (await container.device.supportsExpectedPlayoutItems) {
					this.logger.debug(`VIZDEBUG: Supports expected playout items`)

					await container.device.handleExpectedPlayoutItems(
						_.map(
							_.filter(expectedItems, (item) => {
								return (
									item.deviceSubType === container.deviceType
									// TODO: implement item.deviceId === container.deviceId
								)
							}),
							(item) => {
								const itemContent: ExpectedPlayoutItemContent = item.content
								const newItem: ExpectedPlayoutItem = {
									...itemContent,
									rundownId: item.rundownId,
									playlistId: item.playlistId,
								}
								return newItem
							}
						)
					)
				}
			})
		)
	}
	/**
	 * Go through and transform timeline and generalize the Core-specific things
	 * @param timeline
	 */
	private _transformTimeline(timeline: Array<TimelineObjGeneric>): TSRTimeline {
		// _transformTimeline (timeline: Array<TimelineObj>): Array<TimelineContentObject> | null {

		const transformObject = (obj: TimelineObjGeneric): TimelineContentObjectTmp => {
			const transformedObj: any = clone(_.omit(obj, ['_id', 'studioId']))
			transformedObj.id = obj.id || obj._id

			if (!transformedObj.content) transformedObj.content = {}
			if (transformedObj.isGroup) {
				if (!transformedObj.content.objects) transformedObj.content.objects = []
			}

			return transformedObj
		}

		// First, transform and convert timeline to a key-value store, for fast referencing:
		const objects: { [id: string]: TimelineContentObjectTmp } = {}
		_.each(timeline, (obj: TimelineObjGeneric) => {
			const transformedObj = transformObject(obj)
			objects[transformedObj.id] = transformedObj
		})

		// Go through all objects:
		const transformedTimeline: Array<TSRTimelineObj> = []
		_.each(objects, (obj: TimelineContentObjectTmp) => {
			if (obj.inGroup) {
				const groupObj = objects[obj.inGroup]
				if (groupObj) {
					// Add object into group:
					if (!groupObj.children) groupObj.children = []
					if (groupObj.children) {
						delete obj.inGroup
						groupObj.children.push(obj)
					}
				} else {
					// referenced group not found
					this.logger.error(
						'Referenced group "' + obj.inGroup + '" not found! Referenced by "' + obj.id + '"'
					)
				}
			} else {
				// Add object to timeline
				delete obj.inGroup
				transformedTimeline.push(obj as TSRTimelineObj)
			}
		})
		return transformedTimeline
	}
}

export function getHash(str: string): string {
	const hash = crypto.createHash('sha1')
	return hash.update(str).digest('base64').replace(/[+/=]/g, '_') // remove +/= from strings, because they cause troubles
}
