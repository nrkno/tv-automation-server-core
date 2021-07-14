import { Meteor } from 'meteor/meteor'
import '../../../__mocks__/_extendJest'
import { testInFiber } from '../../../__mocks__/helpers/jest'
import { setupDefaultStudioEnvironment, DefaultEnvironment } from '../../../__mocks__/helpers/database'
import { literal, unprotectString } from '../../../lib/lib'
import { MeteorMock } from '../../../__mocks__/meteor'
import { status2ExternalStatus, setSystemStatus } from '../systemStatus'
import { StatusCode, StatusResponse } from '../../../lib/api/systemStatus'

import { PickerMock, parseResponseBuffer, MockResponseDataString } from '../../../__mocks__/meteorhacks-picker'
import { Response as MockResponse, Request as MockRequest } from 'mock-http'

require('../api')
const PackageInfo = require('../../../package.json')

enum SystemStatusAPIMethods {
	'getSystemStatus' = 'systemStatus.getSystemStatus',
}

describe('systemStatus API', () => {
	let env: DefaultEnvironment

	describe('General health endpoint', () => {
		function callRoute(): MockResponseDataString {
			const routeName = '/health'
			const route = PickerMock.mockRoutes[routeName]
			expect(route).toBeTruthy()

			const res = new MockResponse()
			const req = new MockRequest({
				method: 'GET',
				url: `/health`,
			})

			route.handler({}, req, res, jest.fn())

			const resStr = parseResponseBuffer(res)
			expect(resStr).toMatchObject(
				literal<Partial<MockResponseDataString>>({
					headers: {
						'content-type': 'application/json',
					},
					timedout: false,
					ended: true,
				})
			)
			return resStr
		}

		testInFiber('REST /health with state BAD', async () => {
			env = await setupDefaultStudioEnvironment()
			MeteorMock.mockRunMeteorStartup()

			// The system is uninitialized, the status will be BAD
			const expectedStatus0 = StatusCode.BAD
			const result0: StatusResponse = Meteor.call(SystemStatusAPIMethods.getSystemStatus)
			expect(result0).toMatchObject({
				status: status2ExternalStatus(expectedStatus0),
				_status: expectedStatus0,
			})
			expect(result0.checks && result0.checks.length).toBeGreaterThan(0)

			let systemHealth
			try {
				const response = callRoute()
				expect(response.statusCode).toBe(500)
				systemHealth = JSON.parse(response.bufferStr)
			} catch (e) {
				expect(true).toBe(false) // should not throw
			}

			expect(systemHealth).toMatchObject({
				status: status2ExternalStatus(expectedStatus0),
			})
		})
	})

	describe('Specific studio health endpoint', () => {
		function callRoute(studioId?: string): MockResponseDataString {
			const routeName = '/health/:studioId'
			const route = PickerMock.mockRoutes[routeName]
			expect(route).toBeTruthy()

			const res = new MockResponse()
			const req = new MockRequest({
				method: 'GET',
				url: `/health/${studioId}`,
			})

			route.handler({ studioId: studioId || '' }, req, res, jest.fn())

			const resStr = parseResponseBuffer(res)
			expect(resStr).toMatchObject(
				literal<Partial<MockResponseDataString>>({
					headers: {
						'content-type': 'application/json',
					},
					timedout: false,
					ended: true,
				})
			)
			return resStr
		}

		testInFiber('REST /health with state GOOD', async () => {
			env = await setupDefaultStudioEnvironment()
			MeteorMock.mockRunMeteorStartup()

			// simulate initialized system
			setSystemStatus('systemTime', {
				statusCode: StatusCode.GOOD,
				messages: [`NTP-time accuracy (standard deviation): ${Math.floor(0 * 10) / 10} ms`],
			})
			setSystemStatus('databaseVersion', {
				statusCode: StatusCode.GOOD,
				messages: [`${'databaseVersion'} version: ${PackageInfo.version}`],
			})

			// The system is initialized, the status will be GOOD
			const expectedStatus0 = StatusCode.GOOD
			const result0: StatusResponse = Meteor.call(SystemStatusAPIMethods.getSystemStatus)
			expect(result0).toMatchObject({
				status: status2ExternalStatus(expectedStatus0),
				_status: expectedStatus0,
			})
			expect(result0.checks && result0.checks.length).toBeGreaterThan(0)

			let systemHealth
			try {
				const response = callRoute(unprotectString(env.studio._id))
				expect(response.statusCode).toBe(200)
				systemHealth = JSON.parse(response.bufferStr)
			} catch (e) {
				expect(true).toBe(false) // should not throw
			}

			expect(systemHealth).toMatchObject({
				status: status2ExternalStatus(expectedStatus0),
			})
		})
	})
})
