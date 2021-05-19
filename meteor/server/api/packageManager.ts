import { check } from '../../lib/check'
import { makePromise, waitForPromise, waitForPromiseAll } from '../../lib/lib'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { PeripheralDeviceId, PeripheralDevices } from '../../lib/collections/PeripheralDevices'
import { MethodContext } from '../../lib/api/methods'
import { PeripheralDeviceContentWriteAccess } from '../security/peripheralDevice'
import { StudioId } from '../../lib/collections/Studios'
import { StudioContentWriteAccess } from '../security/studio'
import { executePeripheralDeviceFuntionAsync } from '../../lib/api/peripheralDeviceInternal'

export namespace PackageManagerAPI {
	export function restartExpectation(context: MethodContext, deviceId: PeripheralDeviceId, workId: string): any {
		check(deviceId, String)
		check(workId, String)
		PeripheralDeviceContentWriteAccess.peripheralDevice(context, deviceId)

		waitForPromise(executePeripheralDeviceFuntionAsync(deviceId, 'restartExpectation', workId))
	}
	export function restartAllExpectations(context: MethodContext, deviceId: PeripheralDeviceId): any {
		check(deviceId, String)
		PeripheralDeviceContentWriteAccess.peripheralDevice(context, deviceId)

		waitForPromise(executePeripheralDeviceFuntionAsync(deviceId, 'restartAllExpectations'))
	}
	export function abortExpectation(context: MethodContext, deviceId: PeripheralDeviceId, workId: string): any {
		check(deviceId, String)
		check(workId, String)
		PeripheralDeviceContentWriteAccess.peripheralDevice(context, deviceId)

		waitForPromise(executePeripheralDeviceFuntionAsync(deviceId, 'abortExpectation', workId))
	}
	export function restartAllExpectationsInStudio(context: MethodContext, studioId: StudioId): any {
		check(studioId, String)
		StudioContentWriteAccess.anyContent(context, studioId)

		const packageManagerDevices = PeripheralDevices.find({
			studioId: studioId,
			category: PeripheralDeviceAPI.DeviceCategory.PACKAGE_MANAGER,
			type: PeripheralDeviceAPI.DeviceType.PACKAGE_MANAGER,
			subType: PeripheralDeviceAPI.SUBTYPE_PROCESS,
		}).fetch()

		waitForPromiseAll(
			packageManagerDevices.map((packageManagerDevice) => {
				return makePromise(() => restartAllExpectations(context, packageManagerDevice._id))
			})
		)
	}
}
