
import { CoreConnection } from '../src/index'
import { PeripheralDeviceAPI } from '../src/lib/corePeripherals'

let core = new CoreConnection({
	deviceId: 'ExampleDevice',
	deviceToken: 'abcd',
	deviceType: P.DeviceType.PLAYOUT,
	deviceName: 'Jest test framework'
})

// let consolelog = console.log
// console.log = (...args) => {
// 	consolelog(new Date().getTime() / 1000, ...args)
// }

core.onConnectionChanged((connected) => {
	console.log('onConnectionChanged', connected)
})
core.onConnected(() => {
	console.log('onConnected!')

	setupSubscription()
})
core.onDisconnected(() => {
	console.log('onDisconnected!')
})
core.onError((err) => {
	console.log('onError: ' + (err.message || err.toString() || err), err)
})
core.onFailed((err) => {
	console.log('onFailed: ' + (err.message || err.toString() || err))
})

let setupSubscription = () => {
	console.log('Setup subscription')
	return core.subscribe('peripheralDevices', {
		_id: core.deviceId
	})
	.then(() => {
		console.log('sub OK!')
	})
}
let setupObserver = () => {
	console.log('Setup observer')
	let observer = core.observe('peripheralDevices')
	observer.added = (id) =>	{ console.log('added', id) }
	observer.changed = (id) =>	{ console.log('changed', id) }
	observer.removed = (id) =>	{ console.log('removed', id) }
}
// Initiate connection to Core:

let setup = async () => {
	try {

		console.log('init...')
		await core.init({
			host: '127.0.0.1',
			port: 3000
		})
		console.log('init!')

		await core.setStatus({
			statusCode: P.StatusCode.GOOD,
			messages: ['']
		})

		setupObserver()

		await setupSubscription()

		setTimeout(() => {
			console.log('updating status')
			core.setStatus({
				statusCode: P.StatusCode.GOOD,
				messages: ['a']
			})
		},500)

		setTimeout(() => {
			console.log('closing socket')
			core.ddp.ddpClient['socket'].close()
		},1500)

		setTimeout(() => {
			console.log('updating status')
			core.setStatus({
				statusCode: P.StatusCode.GOOD,
				messages: ['b']
			})
		},3500)
	} catch (e) {
		console.log('ERROR ===========')
		console.log(e, e.stack)
	}

}

setup()
// .then(() => {
// 	core.setStatus({
// 		statusCode: P.StatusCode.GOOD,
// 		messages: ['Testing example']
// 	})
// })
// .then(() => {
// 	setTimeout(() => {
// 		console.log('== closing connection..')

// 		core.ddp.ddpClient.socket.close()
// 	},1000)
// })
// .then(() => {
// 	console.log('waiting for connection...')
// 	setTimeout(() => {
// 		console.log('too late...')
// 	},10000)
// })
