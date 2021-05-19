import { Meteor } from 'meteor/meteor'
import { getCurrentTime, getRandomId } from '../lib'
import { PeripheralDeviceCommands, PeripheralDeviceCommandId } from '../collections/PeripheralDeviceCommands'
import { PubSub, meteorSubscribe } from './pubsub'
import { PeripheralDeviceId } from '../collections/PeripheralDevices'

// This file contains definitions of methods that are called internally in Sofie-Core

export interface PeripheralDeviceAPIInternal {
	removePeripheralDevice(deviceId: PeripheralDeviceId): Promise<void>
}
export enum PeripheralDeviceAPIInternalMethods {
	// Generic:
	'removePeripheralDevice' = 'peripheralDeviceInternal.removePeripheralDevice',

	// MOS-gateway:
	// 'resyncRundown' = 'peripheralDeviceInternal.mos.roResync', // not used, remove this?
	// 'resyncSegment' = 'peripheralDeviceInternal.mos.segmentResync', // not used, remove this?
}

export function executePeripheralDeviceFuntionWithCustomTimeout(
	deviceId: PeripheralDeviceId,
	cb: (err, result) => void,
	timeoutTime0: number | undefined,
	functionName: string,
	...args: any[]
) {
	const timeoutTime: number = timeoutTime0 || 3000 // also handles null

	let commandId: PeripheralDeviceCommandId = getRandomId()

	let subscription: Meteor.SubscriptionHandle | null = null
	if (Meteor.isClient) {
		subscription = meteorSubscribe(PubSub.peripheralDeviceCommands, deviceId)
	}
	// logger.debug('command created: ' + functionName)

	let observer: Meteor.LiveQueryHandle | null = null
	let timeoutCheck: number = 0
	// we've sent the command, let's just wait for the reply
	const checkReply = () => {
		let cmd = PeripheralDeviceCommands.findOne(commandId)
		// if (!cmd) throw new Meteor.Error('Command "' + commandId + '" not found')
		// logger.debug('checkReply')

		if (cmd) {
			const cmdId = cmd._id
			const cleanup = () => {
				if (observer) {
					observer.stop()
					observer = null
				}
				if (subscription) subscription.stop()
				if (timeoutCheck) {
					Meteor.clearTimeout(timeoutCheck)
					timeoutCheck = 0
				}
				PeripheralDeviceCommands.remove(cmdId)
			}

			if (cmd.hasReply) {
				// We've got a reply!

				// Do cleanup before the callback to ensure it doesn't get a timeout during the callback:
				cleanup()

				// Handle result
				if (cmd.replyError) {
					cb(cmd.replyError, null)
				} else {
					cb(null, cmd.reply)
				}
			} else if (getCurrentTime() - (cmd.time || 0) >= timeoutTime) {
				// Timeout

				// Do cleanup:
				cleanup()

				cb(
					`Timeout after ${timeoutTime} ms when executing the function "${cmd.functionName}" on device "${cmd.deviceId}"`,
					null
				)
			}
		}
	}

	observer = PeripheralDeviceCommands.find({
		_id: commandId,
	}).observeChanges({
		added: checkReply,
		changed: checkReply,
	})
	timeoutCheck = Meteor.setTimeout(checkReply, timeoutTime)

	PeripheralDeviceCommands.insert({
		_id: commandId,
		deviceId: deviceId,
		time: getCurrentTime(),
		functionName,
		args: args,
		hasReply: false,
	})
}

export function executePeripheralDeviceFuntion(
	deviceId: PeripheralDeviceId,
	cb: (err, result) => void,
	functionName: string,
	...args: any[]
) {
	return executePeripheralDeviceFuntionWithCustomTimeout(deviceId, cb, undefined, functionName, ...args)
}
/** Same as executeFunction, but returns a promise instead */
export function executePeripheralDeviceFuntionAsync(
	deviceId: PeripheralDeviceId,
	functionName: string,
	...args: any[]
): Promise<any> {
	return new Promise<any>((resolve, reject) => {
		executePeripheralDeviceFuntion(
			deviceId,
			(err, result) => {
				if (err) reject(err)
				else resolve(result)
			},
			functionName,
			...args
		)
	})
}
