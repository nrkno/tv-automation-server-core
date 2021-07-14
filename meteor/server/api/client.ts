import { check } from '../../lib/check'

import { literal, getCurrentTime, Time, getRandomId, makePromise, waitForPromise, Awaited } from '../../lib/lib'

import { logger } from '../logging'
import { ClientAPI, NewClientAPI, ClientAPIMethods } from '../../lib/api/client'
import { UserActionsLog, UserActionsLogItem, UserActionsLogItemId } from '../../lib/collections/UserActionsLog'
import { PeripheralDeviceAPI } from '../../lib/api/peripheralDevice'
import { registerClassToMeteorMethods } from '../methods'
import { PeripheralDeviceId, PeripheralDevices } from '../../lib/collections/PeripheralDevices'
import { MethodContext, MethodContextAPI } from '../../lib/api/methods'
import { UserId } from '../../lib/typings/meteor'
import { OrganizationId } from '../../lib/collections/Organization'
import { Settings } from '../../lib/Settings'
import { resolveCredentials } from '../security/lib/credentials'
import { triggerWriteAccessBecauseNoCheckNecessary } from '../security/lib/securityVerify'
import { PeripheralDeviceContentWriteAccess } from '../security/peripheralDevice'

export namespace ServerClientAPI {
	export function clientErrorReport(
		methodContext: MethodContext,
		timestamp: Time,
		errorObject: any,
		location: string
	): void {
		check(timestamp, Number)
		triggerWriteAccessBecauseNoCheckNecessary() // TODO: discuss if is this ok?
		logger.error(
			`Uncaught error happened in GUI\n  in "${location}"\n  on "${
				methodContext.connection ? methodContext.connection.clientAddress : 'N/A'
			}"\n  at ${new Date(timestamp).toISOString()}:\n${JSON.stringify(errorObject)}`
		)
	}

	export function runInUserLog<Result>(
		methodContext: MethodContext,
		context: string,
		methodName: string,
		args: any[],
		fcn: () => Result | Promise<Result>
	): Awaited<Result> {
		const startTime = Date.now()
		// this is essentially the same as MeteorPromiseCall, but rejects the promise on exception to
		// allow handling it in the client code

		if (!methodContext.connection) {
			// Called internally from server-side.
			// Just run and return right away:
			return waitForPromise(Promise.resolve(fcn()))
		}

		const actionId: UserActionsLogItemId = getRandomId()

		const { userId, organizationId } = getLoggedInCredentials(methodContext)

		UserActionsLog.insert(
			literal<UserActionsLogItem>({
				_id: actionId,
				clientAddress: methodContext.connection ? methodContext.connection.clientAddress : '',
				organizationId: organizationId,
				userId: userId,
				context: context,
				method: methodName,
				args: JSON.stringify(args),
				timestamp: getCurrentTime(),
			})
		)
		try {
			const result = waitForPromise(fcn())

			// check the nature of the result
			if (ClientAPI.isClientResponseError(result)) {
				UserActionsLog.update(actionId, {
					$set: {
						success: false,
						doneTime: getCurrentTime(),
						executionTime: Date.now() - startTime,
						errorMessage: `ClientResponseError: ${result.error}: ${result.message}`,
					},
				})
			} else {
				UserActionsLog.update(actionId, {
					$set: {
						success: true,
						doneTime: getCurrentTime(),
						executionTime: Date.now() - startTime,
					},
				})
			}

			return result
		} catch (e) {
			// allow the exception to be handled by the Client code
			logger.error(`Error in ${methodName}`)
			const errMsg = e.message || e.reason || (e.toString ? e.toString() : null)
			logger.error(errMsg + '\n' + (e.stack || ''))
			UserActionsLog.update(actionId, {
				$set: {
					success: false,
					doneTime: getCurrentTime(),
					executionTime: Date.now() - startTime,
					errorMessage: errMsg,
				},
			})
			throw e
		}
	}

	export function callPeripheralDeviceFunction(
		methodContext: MethodContext,
		context: string,
		deviceId: PeripheralDeviceId,
		timeoutTime: number | undefined,
		functionName: string,
		...args: any[]
	): Promise<any> {
		check(deviceId, String)
		check(functionName, String)
		check(context, String)

		const actionId: UserActionsLogItemId = getRandomId()
		const startTime = Date.now()

		return new Promise((resolve, reject) => {
			if (!methodContext.connection) {
				// In this case, it was called internally from server-side.
				// Just run and return right away:
				try {
					triggerWriteAccessBecauseNoCheckNecessary()
					PeripheralDeviceAPI.executeFunctionWithCustomTimeout(
						deviceId,
						(err, result) => {
							if (err) reject(err)
							else resolve(result)
						},
						timeoutTime,
						functionName,
						...args
					)
				} catch (e) {
					// allow the exception to be handled by the Client code
					const errMsg = e.message || e.reason || (e.toString ? e.toString() : null)
					logger.error(errMsg)
					reject(e)
				}
				return
			}

			const access = PeripheralDeviceContentWriteAccess.executeFunction(methodContext, deviceId)

			UserActionsLog.insert(
				literal<UserActionsLogItem>({
					_id: actionId,
					clientAddress: methodContext.connection ? methodContext.connection.clientAddress : '',
					organizationId: access.organizationId,
					userId: access.userId,
					context: context,
					method: `${deviceId}: ${functionName}`,
					args: JSON.stringify(args),
					timestamp: getCurrentTime(),
				})
			)
			try {
				PeripheralDeviceAPI.executeFunctionWithCustomTimeout(
					deviceId,
					(err, result) => {
						if (err) {
							const errMsg = err.message || err.reason || (err.toString ? err.toString() : null)
							logger.error(errMsg)
							UserActionsLog.update(actionId, {
								$set: {
									success: false,
									doneTime: getCurrentTime(),
									executionTime: Date.now() - startTime,
									errorMessage: errMsg,
								},
							})

							reject(err)
							return
						}

						UserActionsLog.update(actionId, {
							$set: {
								success: true,
								doneTime: getCurrentTime(),
								executionTime: Date.now() - startTime,
							},
						})

						resolve(result)
						return
					},
					timeoutTime,
					functionName,
					...args
				)
			} catch (e) {
				// allow the exception to be handled by the Client code
				const errMsg = e.message || e.reason || (e.toString ? e.toString() : null)
				logger.error(errMsg)
				UserActionsLog.update(actionId, {
					$set: {
						success: false,
						doneTime: getCurrentTime(),
						executionTime: Date.now() - startTime,
						errorMessage: errMsg,
					},
				})
				reject(e)
				return
			}
		})
	}
	function getLoggedInCredentials(methodContext: MethodContext): {
		userId: UserId | null
		organizationId: OrganizationId | null
	} {
		let userId: UserId | null = null
		let organizationId: OrganizationId | null = null
		if (Settings.enableUserAccounts) {
			const cred = resolveCredentials({ userId: methodContext.userId })
			if (cred.user) userId = cred.user._id
			if (cred.organization) organizationId = cred.organization._id
		}
		return { userId, organizationId }
	}
}

class ServerClientAPIClass extends MethodContextAPI implements NewClientAPI {
	clientErrorReport(timestamp: Time, errorObject: any, location: string) {
		return makePromise(() => ServerClientAPI.clientErrorReport(this, timestamp, errorObject, location))
	}
	callPeripheralDeviceFunction(
		context: string,
		deviceId: PeripheralDeviceId,
		timeoutTime: number | undefined,
		functionName: string,
		...args: any[]
	) {
		return makePromise(() => {
			const methodContext: MethodContext = this // eslint-disable-line @typescript-eslint/no-this-alias
			if (!Settings.enableUserAccounts) {
				// Note: This is a temporary hack to keep backwards compatibility.
				// in the case of not enableUserAccounts, a token is needed, but not provided when called from client
				const device = PeripheralDevices.findOne(deviceId)
				if (device) {
					// @ts-ignore hack
					methodContext.token = device.token
				}
			}
			return ServerClientAPI.callPeripheralDeviceFunction(
				methodContext,
				context,
				deviceId,
				timeoutTime,
				functionName,
				...args
			)
		})
	}
}
registerClassToMeteorMethods(ClientAPIMethods, ServerClientAPIClass, false)
