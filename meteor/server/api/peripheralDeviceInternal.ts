import * as _ from 'underscore'
import { PeripheralDevices, PeripheralDeviceId } from '../../lib/collections/PeripheralDevices'
import { makePromise } from '../../lib/lib'
import { PeripheralDeviceCommands } from '../../lib/collections/PeripheralDeviceCommands'
import { logger } from '../logging'
import { registerClassToMeteorMethods } from '../methods'
import { MethodContextAPI, MethodContext } from '../../lib/api/methods'
import { checkAccessAndGetPeripheralDevice } from './ingest/lib'
import { PeripheralDeviceAPIInternal, PeripheralDeviceAPIInternalMethods } from '../../lib/api/peripheralDeviceInternal'

export function removePeripheralDevice(context: MethodContext, deviceId: PeripheralDeviceId, token?: string) {
	const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, token, context)

	logger.info(`Removing PeripheralDevice ${peripheralDevice._id}`)

	PeripheralDevices.remove(peripheralDevice._id)
	PeripheralDevices.remove({
		parentDeviceId: peripheralDevice._id,
	})
	PeripheralDeviceCommands.remove({
		deviceId: peripheralDevice._id,
	})
	// TODO: add others here (MediaWorkflows, etc?)
}

class ServerPeripheralDeviceAPIInternalClass extends MethodContextAPI implements PeripheralDeviceAPIInternal {
	removePeripheralDevice(deviceId: PeripheralDeviceId, token?: string) {
		return makePromise(() => removePeripheralDevice(this, deviceId, token))
	}
}
registerClassToMeteorMethods(PeripheralDeviceAPIInternalMethods, ServerPeripheralDeviceAPIInternalClass, false)
