import { CoreConnection } from '../index'
import { PeripheralDeviceAPI } from '../lib/corePeripherals'
import * as _ from 'underscore'
import { DDPConnectorOptions } from '../lib/ddpClient'
jest.mock('faye-websocket')
jest.mock('got')

process.on('unhandledRejection', (reason) => {
	console.log('Unhandled Promise rejection!', reason)
})

const orgSetTimeout = setTimeout

describe('coreConnection', () => {

	const coreHost = '127.0.0.1'
	const corePort = 3000

	function wait (time: number): Promise<void> {
		return new Promise((resolve) => {
			orgSetTimeout(() => {
				resolve()
			}, time)
		})
	}

	test('Just setup CoreConnection', async () => {

		let core = new CoreConnection({
			deviceId: 'JestTest',
			deviceToken: 'abcd',
			deviceCategory: PeripheralDeviceAPI.DeviceCategory.PLAYOUT,
			deviceType: PeripheralDeviceAPI.DeviceType.PLAYOUT,
			deviceSubType: PeripheralDeviceAPI.SUBTYPE_PROCESS,
			deviceName: 'Jest test framework'
		})

		let onConnectionChanged = jest.fn()
		let onConnected = jest.fn()
		let onDisconnected = jest.fn()
		core.onConnectionChanged(onConnectionChanged)
		core.onConnected(onConnected)
		core.onDisconnected(onDisconnected)

		expect(core.connected).toEqual(false)
	})

	test('Test connection and basic Core functionality', async () => {

		let core = new CoreConnection({
			deviceId: 'JestTest',
			deviceToken: 'abcd',
			deviceCategory: PeripheralDeviceAPI.DeviceCategory.PLAYOUT,
			deviceType: PeripheralDeviceAPI.DeviceType.PLAYOUT,
			deviceSubType: PeripheralDeviceAPI.SUBTYPE_PROCESS,
			deviceName: 'Jest test framework'
		})

		let onConnectionChanged = jest.fn()
		let onConnected = jest.fn()
		let onDisconnected = jest.fn()
		let onError = jest.fn()
		core.onConnectionChanged(onConnectionChanged)
		core.onConnected(onConnected)
		core.onDisconnected(onDisconnected)

		core.onError(onError)

		expect(core.connected).toEqual(false)
		// Initiate connection to Core:

		let id = await core.init({
			host: coreHost,
			port: corePort
		})

		expect(core.connected).toEqual(true)
		expect(id).toEqual(core.deviceId)

		expect(onConnectionChanged).toHaveBeenCalledTimes(1)
		expect(onConnectionChanged.mock.calls[0][0]).toEqual(true)
		expect(onConnected).toHaveBeenCalledTimes(1)
		expect(onDisconnected).toHaveBeenCalledTimes(0)

		// Set some statuses:

		let statusResponse = await core.setStatus({
			statusCode: PeripheralDeviceAPI.StatusCode.WARNING_MAJOR,
			messages: ['testing testing']
		})

		expect(statusResponse).toMatchObject({
			statusCode: PeripheralDeviceAPI.StatusCode.WARNING_MAJOR
		})

		statusResponse = await core.setStatus({
			statusCode: PeripheralDeviceAPI.StatusCode.GOOD
		})

		expect(statusResponse).toMatchObject({
			statusCode: PeripheralDeviceAPI.StatusCode.GOOD
		})

		// Observe data:
		let observer = core.observe('peripheralDevices')
		observer.added = jest.fn()
		observer.changed = jest.fn()
		observer.removed = jest.fn()

		// Subscribe to data:
		let coll0 = core.getCollection('peripheralDevices')
		expect(coll0.findOne({ _id: id })).toBeFalsy()
		let subId = await core.subscribe('peripheralDevices', {
			_id: id
		})
		let coll1 = core.getCollection('peripheralDevices')
		expect(coll1.findOne({ _id: id })).toMatchObject({
			_id: id
		})
		expect(observer.added).toHaveBeenCalledTimes(1)

		// Call a method
		await expect(core.callMethod('peripheralDevice.testMethod', ['return123'])).resolves.toEqual('return123')
		// Call a method which will throw error:
		await expect(core.callMethod('peripheralDevice.testMethod', ['abcd', true])).rejects.toMatchObject({
			error: 418,
			reason: /error/
		})
		// Call an unknown method
		await expect(core.callMethod('myunknownMethod123', ['a', 'b'])).rejects.toMatchObject({
			error: 404,
			reason: /error/
		})

		// Unsubscribe:
		core.unsubscribe(subId)

		await wait(200) // wait for unsubscription to go through

		expect(observer.removed).toHaveBeenCalledTimes(1)

		// Uninitialize

		id = await core.unInitialize()

		expect(id).toEqual(core.deviceId)

		// Set the status now (should cause an error)
		await expect(core.setStatus({
			statusCode: PeripheralDeviceAPI.StatusCode.GOOD
		})).rejects.toMatchObject({
			error: 404
		})

		expect(onConnectionChanged).toHaveBeenCalledTimes(1)
		// Close connection:
		await core.destroy()

		expect(core.connected).toEqual(false)
		expect(onConnectionChanged).toHaveBeenCalledTimes(2)
		expect(onConnectionChanged.mock.calls[1][0]).toEqual(false)
		expect(onConnected).toHaveBeenCalledTimes(1)
		expect(onDisconnected).toHaveBeenCalledTimes(1)

		expect(onError).toHaveBeenCalledTimes(0)
	})

	test('Connection timeout', async () => {

		let core = new CoreConnection({
			deviceId: 'JestTest',
			deviceToken: 'abcd',
			deviceCategory: PeripheralDeviceAPI.DeviceCategory.PLAYOUT,
			deviceType: PeripheralDeviceAPI.DeviceType.PLAYOUT,
			deviceSubType: PeripheralDeviceAPI.SUBTYPE_PROCESS,
			deviceName: 'Jest test framework'
		})

		let onConnectionChanged = jest.fn()
		let onConnected = jest.fn()
		let onDisconnected = jest.fn()
		let onFailed = jest.fn()
		let onError = jest.fn()
		core.onConnectionChanged(onConnectionChanged)
		core.onConnected(onConnected)
		core.onDisconnected(onDisconnected)
		core.onFailed(onFailed)
		core.onError(onError)

		expect(core.connected).toEqual(false)
		// Initiate connection to Core:

		let err = null
		try {
			await core.init({
				host: '127.0.0.999',
				port: corePort
			})
		} catch (e) {
			err = e
		}
		expect(err.message).toMatch(/Network error/)

		expect(core.connected).toEqual(false)

		await core.destroy()
	})

	test('Connection recover from close', async () => {

		let core = new CoreConnection({
			deviceId: 'JestTest',
			deviceToken: 'abcd',
			deviceCategory: PeripheralDeviceAPI.DeviceCategory.PLAYOUT,
			deviceType: PeripheralDeviceAPI.DeviceType.PLAYOUT,
			deviceSubType: PeripheralDeviceAPI.SUBTYPE_PROCESS,
			deviceName: 'Jest test framework'
		})

		let onConnectionChanged = jest.fn()
		let onConnected = jest.fn()
		let onDisconnected = jest.fn()
		let onFailed = jest.fn()
		let onError = jest.fn()
		core.onConnectionChanged(onConnectionChanged)
		core.onConnected(onConnected)
		core.onDisconnected(onDisconnected)
		core.onFailed(onFailed)
		core.onError(onError)

		expect(core.connected).toEqual(false)
		// Initiate connection to Core:

		await core.init({
			host: coreHost,
			port: corePort
		})
		expect(core.connected).toEqual(true)

		// Force-close the socket:
		core.ddPeripheralDeviceAPI.ddpClient && core.ddPeripheralDeviceAPI.ddpClient.socket.close()

		await wait(10)
		expect(core.connected).toEqual(false)

		await wait(1300)
		// should have reconnected by now

		expect(core.connected).toEqual(true)

		await core.destroy()
	})

	test('autoSubscription', async () => {

		let core = new CoreConnection({
			deviceId: 'JestTest',
			deviceToken: 'abcd',
			deviceCategory: PeripheralDeviceAPI.DeviceCategory.PLAYOUT,
			deviceType: PeripheralDeviceAPI.DeviceType.PLAYOUT,
			deviceSubType: PeripheralDeviceAPI.SUBTYPE_PROCESS,
			deviceName: 'Jest test framework'
		})

		let onConnectionChanged = jest.fn()
		let onConnected = jest.fn()
		let onDisconnected = jest.fn()
		let onFailed = jest.fn()
		let onError = jest.fn()
		core.onConnectionChanged(onConnectionChanged)
		core.onConnected(onConnected)
		core.onDisconnected(onDisconnected)
		core.onFailed(onFailed)
		core.onError(onError)

		expect(core.connected).toEqual(false)
		// Initiate connection to Core:

		await core.init({
			host: coreHost,
			port: corePort
		})
		expect(core.connected).toEqual(true)

		let observerAdded = jest.fn()
		let observerChanged = jest.fn()
		let observerRemoved = jest.fn()
		let observer = core.observe('peripheralDevices')
		observer.added = observerAdded
		observer.changed = observerChanged
		observer.removed = observerRemoved

		await core.autoSubscribe('peripheralDevices', { _id: 'JestTest' })

		expect(observerAdded).toHaveBeenCalledTimes(1)

		await core.setStatus({
			statusCode: PeripheralDeviceAPI.StatusCode.GOOD,
			messages: ['Jest A ' + Date.now()]
		})
		await wait(300)
		expect(observerChanged).toHaveBeenCalledTimes(1)

		// Force-close the socket:
		core.ddPeripheralDeviceAPI.ddpClient && core.ddPeripheralDeviceAPI.ddpClient.socket.close()

		await wait(10)
		expect(core.connected).toEqual(false)

		await wait(1300)
		// should have reconnected by now
		expect(core.connected).toEqual(true)

		observerChanged.mockClear()
		await core.setStatus({
			statusCode: PeripheralDeviceAPI.StatusCode.GOOD,
			messages: ['Jest B' + Date.now()]
		})
		await wait(300)
		expect(observerChanged).toHaveBeenCalledTimes(1)

		await core.destroy()
	})

	test('Connection recover from a close that lasts some time', async () => {

		let core = new CoreConnection({
			deviceId: 'JestTest',
			deviceToken: 'abcd',
			deviceCategory: PeripheralDeviceAPI.DeviceCategory.PLAYOUT,
			deviceType: PeripheralDeviceAPI.DeviceType.PLAYOUT,
			deviceSubType: PeripheralDeviceAPI.SUBTYPE_PROCESS,
			deviceName: 'Jest test framework'
		})

		let onConnectionChanged = jest.fn()
		let onConnected = jest.fn()
		let onDisconnected = jest.fn()
		let onFailed = jest.fn()
		let onError = jest.fn()
		core.onConnectionChanged(onConnectionChanged)
		core.onConnected(onConnected)
		core.onDisconnected(onDisconnected)
		core.onFailed(onFailed)
		core.onError(onError)

		expect(core.connected).toEqual(false)
		// Initiate connection to Core:

		let options: DDPConnectorOptions = {
			host: coreHost,
			port: corePort,
			autoReconnect: true,
			autoReconnectTimer: 100
		}
		await core.init(options)
		expect(core.connected).toEqual(true)

		// temporary scramble the ddp host:
		options.host = '127.0.0.9'
		core.ddPeripheralDeviceAPI.ddpClient && core.ddPeripheralDeviceAPI.ddpClient.resetOptions(options)
		// Force-close the socket:
		core.ddPeripheralDeviceAPI.ddpClient && core.ddPeripheralDeviceAPI.ddpClient.socket.close()

		await wait(10)
		expect(core.connected).toEqual(false)

		await wait(1000) // allow for some reconnections

		// restore ddp host:
		options.host = '127.0.0.1'
		core.ddPeripheralDeviceAPI.ddpClient && core.ddPeripheralDeviceAPI.ddpClient.resetOptions(options)
		await wait(1000)
		// should have reconnected by now

		expect(core.connected).toEqual(true)

		await core.destroy()
	})

	test('Parent connections', async () => {
		let coreParent = new CoreConnection({
			deviceId: 'JestTest',
			deviceToken: 'abcd',
			deviceCategory: PeripheralDeviceAPI.DeviceCategory.PLAYOUT,
			deviceType: PeripheralDeviceAPI.DeviceType.PLAYOUT,
			deviceSubType: PeripheralDeviceAPI.SUBTYPE_PROCESS,
			deviceName: 'Jest test framework'
		})
		let onError = jest.fn()
		coreParent.onError(onError)

		let parentOnConnectionChanged = jest.fn()
		coreParent.onConnectionChanged(parentOnConnectionChanged)

		let id = await coreParent.init({
			host: coreHost,
			port: corePort
		})
		expect(coreParent.connected).toEqual(true)

		// Set child connection:
		let coreChild = new CoreConnection({
			deviceId: 'JestTestChild',
			deviceToken: 'abcd2',
			deviceCategory: PeripheralDeviceAPI.DeviceCategory.PLAYOUT,
			deviceType: PeripheralDeviceAPI.DeviceType.PLAYOUT,
			deviceSubType: PeripheralDeviceAPI.SUBTYPE_PROCESS,
			deviceName: 'Jest test framework child'
		})

		let onChildConnectionChanged = jest.fn()
		let onChildConnected = jest.fn()
		let onChildDisconnected = jest.fn()
		let onChildError = jest.fn()
		coreChild.onConnectionChanged(onChildConnectionChanged)
		coreChild.onConnected(onChildConnected)
		coreChild.onDisconnected(onChildDisconnected)
		coreChild.onError(onChildError)

		let idChild = await coreChild.init(coreParent)

		expect(idChild).toEqual(coreChild.deviceId)
		expect(coreChild.connected).toEqual(true)

		expect(onChildConnectionChanged).toHaveBeenCalledTimes(1)
		expect(onChildConnectionChanged.mock.calls[0][0]).toEqual(true)
		expect(onChildConnected).toHaveBeenCalledTimes(1)
		expect(onChildDisconnected).toHaveBeenCalledTimes(0)

		// Set some statuses:
		let statusResponse = await coreChild.setStatus({
			statusCode: PeripheralDeviceAPI.StatusCode.WARNING_MAJOR,
			messages: ['testing testing']
		})

		expect(statusResponse).toMatchObject({
			statusCode: PeripheralDeviceAPI.StatusCode.WARNING_MAJOR
		})

		statusResponse = await coreChild.setStatus({
			statusCode: PeripheralDeviceAPI.StatusCode.GOOD
		})

		expect(statusResponse).toMatchObject({
			statusCode: PeripheralDeviceAPI.StatusCode.GOOD
		})

		// Uninitialize:

		id = await coreChild.unInitialize()

		expect(id).toEqual(coreChild.deviceId)

		// Set the status now (should cause an error)
		await expect(coreChild.setStatus({
			statusCode: PeripheralDeviceAPI.StatusCode.GOOD
		})).rejects.toMatchObject({
			error: 404
		})

		await coreParent.destroy()
		await coreChild.destroy()

		expect(onError).toHaveBeenCalledTimes(0)
		expect(onChildError).toHaveBeenCalledTimes(0)
	})

	test('Parent destroy', async () => {
		let coreParent = new CoreConnection({
			deviceId: 'JestTest',
			deviceToken: 'abcd',
			deviceCategory: PeripheralDeviceAPI.DeviceCategory.PLAYOUT,
			deviceType: PeripheralDeviceAPI.DeviceType.PLAYOUT,
			deviceSubType: PeripheralDeviceAPI.SUBTYPE_PROCESS,
			deviceName: 'Jest test framework'
		})
		let onParentError = jest.fn()
		coreParent.onError(onParentError)

		await coreParent.init({
			host: coreHost,
			port: corePort
		})
		// Set child connection:
		let coreChild = new CoreConnection({
			deviceId: 'JestTestChild',
			deviceToken: 'abcd2',
			deviceCategory: PeripheralDeviceAPI.DeviceCategory.PLAYOUT,
			deviceType: PeripheralDeviceAPI.DeviceType.PLAYOUT,
			deviceSubType: 'mos_connection',
			deviceName: 'Jest test framework child'
		})
		let onChildConnectionChanged = jest.fn()
		let onChildConnected = jest.fn()
		let onChildDisconnected = jest.fn()
		let onChildError = jest.fn()
		coreChild.onConnectionChanged(onChildConnectionChanged)
		coreChild.onConnected(onChildConnected)
		coreChild.onDisconnected(onChildDisconnected)
		coreChild.onError(onChildError)

		await coreChild.init(coreParent)

		expect(coreChild.connected).toEqual(true)

		// Close parent connection:
		await coreParent.destroy()

		expect(coreChild.connected).toEqual(false)

		expect(onChildConnectionChanged).toHaveBeenCalledTimes(2)
		expect(onChildConnectionChanged.mock.calls[1][0]).toEqual(false)
		expect(onChildConnected).toHaveBeenCalledTimes(1)
		expect(onChildDisconnected).toHaveBeenCalledTimes(1)
		// Setup stuff again
		onChildConnectionChanged.mockClear()
		onChildConnected.mockClear()
		onChildDisconnected.mockClear()

		coreChild.onConnectionChanged(onChildConnectionChanged)
		coreChild.onConnected(onChildConnected)
		coreChild.onDisconnected(onChildDisconnected)
		// connect parent again:

		await coreParent.init({
			host: coreHost,
			port: corePort
		})

		await coreChild.init(coreParent)

		expect(coreChild.connected).toEqual(true)

		expect(onChildConnected).toHaveBeenCalledTimes(1)
		expect(onChildConnectionChanged).toHaveBeenCalledTimes(1)
		expect(onChildConnectionChanged.mock.calls[0][0]).toEqual(true)
		expect(onChildDisconnected).toHaveBeenCalledTimes(0)

		await coreParent.destroy()
		await coreChild.destroy()

		expect(onChildError).toHaveBeenCalledTimes(0)
		expect(onParentError).toHaveBeenCalledTimes(0)
	})

	test('Child destroy', async () => {

		let coreParent = new CoreConnection({
			deviceId: 'JestTest',
			deviceToken: 'abcd',
			deviceCategory: PeripheralDeviceAPI.DeviceCategory.PLAYOUT,
			deviceType: PeripheralDeviceAPI.DeviceType.PLAYOUT,
			deviceSubType: PeripheralDeviceAPI.SUBTYPE_PROCESS,
			deviceName: 'Jest test framework'
		})
		let onParentError = jest.fn()
		coreParent.onError(onParentError)
		await coreParent.init({
			host: coreHost,
			port: corePort
		})
		// Set child connection:
		let coreChild = new CoreConnection({
			deviceId: 'JestTestChild',
			deviceToken: 'abcd2',
			deviceCategory: PeripheralDeviceAPI.DeviceCategory.PLAYOUT,
			deviceType: PeripheralDeviceAPI.DeviceType.PLAYOUT,
			deviceSubType: 'mos_connection',
			deviceName: 'Jest test framework child'
		})
		let onChildConnectionChanged = jest.fn()
		let onChildConnected = jest.fn()
		let onChildDisconnected = jest.fn()
		let onChildError = jest.fn()
		coreChild.onConnectionChanged(onChildConnectionChanged)
		coreChild.onConnected(onChildConnected)
		coreChild.onDisconnected(onChildDisconnected)
		coreChild.onError(onChildError)

		await coreChild.init(coreParent)

		expect(coreChild.connected).toEqual(true)

		// Close parent connection:
		await coreChild.destroy()

		expect(coreChild.connected).toEqual(false)

		expect(onChildConnectionChanged).toHaveBeenCalledTimes(2)
		expect(onChildConnectionChanged.mock.calls[1][0]).toEqual(false)
		expect(onChildConnected).toHaveBeenCalledTimes(1)
		expect(onChildDisconnected).toHaveBeenCalledTimes(1)

		await coreParent.destroy()

		expect(onParentError).toHaveBeenCalledTimes(0)
		expect(onChildError).toHaveBeenCalledTimes(0)
	})

	test('Test callMethodLowPrio', async () => {

		let core = new CoreConnection({
			deviceId: 'JestTest',
			deviceToken: 'abcd',
			deviceCategory: PeripheralDeviceAPI.DeviceCategory.PLAYOUT,
			deviceType: PeripheralDeviceAPI.DeviceType.PLAYOUT,
			deviceSubType: PeripheralDeviceAPI.SUBTYPE_PROCESS,
			deviceName: 'Jest test framework'
		})

		let onError = jest.fn()
		core.onError(onError)

		await core.init({
			host: coreHost,
			port: corePort
		})

		expect(core.connected).toEqual(true)

		// Call a method
		await expect(core.callMethod('peripheralDevice.testMethod', ['return123'])).resolves.toEqual('return123')
		// Call a low-prio method
		await expect(core.callMethodLowPrio('peripheralDevice.testMethod', ['low123'])).resolves.toEqual('low123')

		let ps: Promise<any>[] = []

		// method should be called before low-prio:
		let i = 0
		ps.push(core.callMethodLowPrio('peripheralDevice.testMethod', ['low1'])
			.then((res) => {
				expect(res).toEqual('low1')
				return i++
			}))
		ps.push(core.callMethodLowPrio('peripheralDevice.testMethod', ['low2'])
			.then((res) => {
				expect(res).toEqual('low2')
				return i++
			}))
		ps.push(core.callMethod('peripheralDevice.testMethod', ['normal1'])
			.then((res) => {
				expect(res).toEqual('normal1')
				return i++
			}))

		let r = await Promise.all(ps)

		expect(r[0]).toBeGreaterThan(r[2]) // because callMethod should have run before callMethodLowPrio
		expect(r[1]).toBeGreaterThan(r[2]) // because callMethod should have run before callMethodLowPrio

		// Clean up
		await core.destroy()

		expect(onError).toHaveBeenCalledTimes(0)
	})
})
