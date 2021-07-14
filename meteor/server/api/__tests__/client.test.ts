import { Meteor } from 'meteor/meteor'
import { MeteorMock } from '../../../__mocks__/meteor'
import { UserActionsLog, UserActionsLogItem } from '../../../lib/collections/UserActionsLog'
import { ClientAPIMethods } from '../../../lib/api/client'
import { protectString, makePromise } from '../../../lib/lib'
import { PeripheralDeviceCommand, PeripheralDeviceCommands } from '../../../lib/collections/PeripheralDeviceCommands'
import { setLoggerLevel } from '../logger'
import { testInFiber, beforeAllInFiber } from '../../../__mocks__/helpers/jest'
import { PeripheralDeviceId } from '../../../lib/collections/PeripheralDevices'
import { setupMockPeripheralDevice } from '../../../__mocks__/helpers/database'
import { PeripheralDeviceAPI } from '../../../lib/api/peripheralDevice'

require('../client') // include in order to create the Meteor methods needed

setLoggerLevel('info')

const orgSetTimeout = setTimeout

describe('ClientAPI', () => {
	let mockDeviceId: PeripheralDeviceId = protectString('not set yet')
	// let mockDeviceToken: string = 'Not set yet'
	beforeAllInFiber(() => {
		const mockDevice = setupMockPeripheralDevice(
			PeripheralDeviceAPI.DeviceCategory.PLAYOUT,
			PeripheralDeviceAPI.DeviceType.PLAYOUT,
			PeripheralDeviceAPI.SUBTYPE_PROCESS
		)
		mockDeviceId = mockDevice._id
		// mockDeviceToken = mockDevice.token
	})
	describe('clientErrorReport', () => {
		testInFiber('Exports a Meteor method to the client', () => {
			expect(MeteorMock.mockMethods[ClientAPIMethods.clientErrorReport]).toBeTruthy()
		})
		testInFiber('Returns a success response to the client', () => {
			// should not throw:
			Meteor.call(ClientAPIMethods.clientErrorReport, 1000, { error: 'Some Error' }, 'MockLocation')
		})
	})

	describe('callPeripheralDeviceFunction', () => {
		const mockFunctionName = 'mockFunction'
		const mockFailingFunctionName = 'mockFailFunction'
		const mockContext = 'Context description'
		const mockArgs = ['mockArg1', 'mockArg2']

		testInFiber('Exports a Meteor method to the client', () => {
			expect(MeteorMock.mockMethods[ClientAPIMethods.callPeripheralDeviceFunction]).toBeTruthy()
		})

		describe('Call a method on the peripheralDevice', () => {
			let logMethodName = `not set yet`
			let promise: Promise<any>
			beforeAllInFiber(async () => {
				logMethodName = `${mockDeviceId}: ${mockFunctionName}`
				promise = makePromise(() =>
					Meteor.call(
						ClientAPIMethods.callPeripheralDeviceFunction,
						mockContext,
						mockDeviceId,
						undefined,
						mockFunctionName,
						...mockArgs
					)
				)
				await new Promise((resolve) => orgSetTimeout(resolve, 100))
			})
			testInFiber('Logs the call in UserActionsLog', async () => {
				const log = UserActionsLog.findOne({
					method: logMethodName,
				}) as UserActionsLogItem
				expect(log).toBeTruthy()

				expect(log.method).toBe(logMethodName)
				expect(log.userId).toBeDefined()
			})

			testInFiber('Sends a call to the peripheralDevice', () => {
				const pdc = PeripheralDeviceCommands.findOne({
					deviceId: mockDeviceId,
					functionName: mockFunctionName,
				}) as PeripheralDeviceCommand
				expect(pdc).toBeTruthy()

				expect(pdc.deviceId).toBe(mockDeviceId)
				expect(pdc.functionName).toBe(mockFunctionName)
				expect(pdc.args).toMatchObject(mockArgs)
			})
			testInFiber(
				'Resolves the returned promise once a response from the peripheralDevice is received',
				async () => {
					PeripheralDeviceCommands.update(
						{
							deviceId: mockDeviceId,
							functionName: mockFunctionName,
						},
						{
							$set: {
								hasReply: true,
								reply: 'OK',
							},
						}
					)
					return promise.then((value) => {
						const log = UserActionsLog.findOne({
							method: logMethodName,
						}) as UserActionsLogItem
						expect(log).toBeTruthy()

						expect(log.success).toBe(true)
						expect(log.doneTime).toBeDefined()
						expect(value).toBe('OK')
					})
				}
			)
		})
		describe('Call a failing method on the peripheralDevice', () => {
			let logMethodName = `not set yet`
			beforeAllInFiber(() => {
				logMethodName = `${mockDeviceId}: ${mockFailingFunctionName}`
			})
			const promise = makePromise(() => {
				return Meteor.call(
					ClientAPIMethods.callPeripheralDeviceFunction,
					mockContext,
					mockDeviceId,
					undefined,
					mockFailingFunctionName,
					...mockArgs
				)
			})
			testInFiber('Logs the call in UserActionsLog', () => {
				const log = UserActionsLog.findOne({
					method: logMethodName,
				}) as UserActionsLogItem
				expect(log).toBeTruthy()

				expect(log.method).toBe(logMethodName)
				expect(log.userId).toBeDefined()
			})
			testInFiber('Sends a call to the peripheralDevice', () => {
				const pdc = PeripheralDeviceCommands.findOne({
					deviceId: mockDeviceId,
					functionName: mockFailingFunctionName,
				}) as PeripheralDeviceCommand
				expect(pdc).toBeTruthy()

				expect(pdc.deviceId).toBe(mockDeviceId)
				expect(pdc.functionName).toBe(mockFailingFunctionName)
				expect(pdc.args).toMatchObject(mockArgs)
			})
			testInFiber(
				'Resolves the returned promise once a response from the peripheralDevice is received',
				async () => {
					PeripheralDeviceCommands.update(
						{
							deviceId: mockDeviceId,
							functionName: mockFailingFunctionName,
						},
						{
							$set: {
								hasReply: true,
								replyError: 'Failed',
							},
						}
					)

					// This will probably resolve after around 3s, since that is the timeout time
					// of checkReply and the observeChanges is not implemented in the mock
					await expect(promise).rejects.toBe('Failed')

					const log = UserActionsLog.findOne({
						method: logMethodName,
					}) as UserActionsLogItem
					expect(log).toBeTruthy()

					expect(log.success).toBe(false)
					expect(log.doneTime).toBeDefined()
				}
			)
		})
	})
})
