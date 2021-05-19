import { Meteor } from 'meteor/meteor'
import '../../../__mocks__/_extendJest'
import { testInFiber } from '../../../__mocks__/helpers/jest'
import {
	setupDefaultStudioEnvironment,
	DefaultEnvironment,

} from '../../../__mocks__/helpers/database'
import { literal, unprotectString } from '../../../lib/lib'
import { MeteorMock } from '../../../__mocks__/meteor'
import { StatusCode, status2ExternalStatus, setSystemStatus } from '../systemStatus'
import { StatusResponse } from '../../../lib/api/systemStatus'
import { PeripheralDevices } from '../../../lib/collections/PeripheralDevices'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'

require('../api')
const PackageInfo = require('../../../package.json')

enum SystemStatusAPIMethods {
	'getSystemStatus' = 'systemStatus.getSystemStatus',
}

describe('systemStatus', () => {
	let env: DefaultEnvironment
	testInFiber('getSystemStatus: before startup', () => {
		// Before starting the system up, the system status will be unknown
		const expectedStatus0 = StatusCode.UNKNOWN
		const result0: StatusResponse = Meteor.call(SystemStatusAPIMethods.getSystemStatus)
		expect(result0).toMatchObject({
			status: status2ExternalStatus(expectedStatus0),
			_status: expectedStatus0,
		})
		expect(result0.checks).toHaveLength(0)
	})
	testInFiber('getSystemStatus: after startup', () => {
		env = setupDefaultStudioEnvironment()
		MeteorMock.mockRunMeteorStartup()

		const result0: StatusResponse = Meteor.call(SystemStatusAPIMethods.getSystemStatus)

		// Intial expected status is BAD, because the databaseVersion doesn't match and systemTime is wrong
		const expectedStatus0 = StatusCode.BAD
		expect(result0).toMatchObject({
			status: status2ExternalStatus(expectedStatus0),
			_status: expectedStatus0,
		})
		expect(result0.checks && result0.checks.length).toBeGreaterThan(0)

		const systemTimeCheck = result0.checks && result0.checks.find((p) => p.description === 'systemTime')
		expect(systemTimeCheck).toMatchObject({
			status: status2ExternalStatus(StatusCode.GOOD),
		})
		const databaseVersionCheck = result0.checks && result0.checks.find((p) => p.description === 'databaseVersion')
		expect(databaseVersionCheck).toMatchObject({
			status: status2ExternalStatus(StatusCode.BAD),
		})
	})
	testInFiber('getSystemStatus: after time sync', () => {
		// simulate time sync OK
		setSystemStatus('systemTime', {
			statusCode: StatusCode.GOOD,
			messages: [`NTP-time accuracy (standard deviation): ${Math.floor(0 * 10) / 10} ms`],
		})

		const result0: StatusResponse = Meteor.call(SystemStatusAPIMethods.getSystemStatus)

		// Intial expected status is BAD, because the databaseVersion doesn't match
		const expectedStatus0 = StatusCode.BAD
		expect(result0).toMatchObject({
			status: status2ExternalStatus(expectedStatus0),
			_status: expectedStatus0,
		})
		const systemTimeCheck = result0.checks && result0.checks.find((p) => p.description === 'systemTime')
		expect(systemTimeCheck).toMatchObject({
			status: status2ExternalStatus(StatusCode.GOOD),
		})
		const databaseVersionCheck = result0.checks && result0.checks.find((p) => p.description === 'databaseVersion')
		expect(databaseVersionCheck).toMatchObject({
			status: status2ExternalStatus(StatusCode.BAD),
		})
	})
	testInFiber('getSystemStatus: after all migrations completed', () => {
		// simulate migrations completed
		setSystemStatus('databaseVersion', {
			statusCode: StatusCode.GOOD,
			messages: [`${'databaseVersion'} version: ${PackageInfo.version}`],
		})

		const result0: StatusResponse = Meteor.call(SystemStatusAPIMethods.getSystemStatus)

		// Expected status is GOOD, because the databaseVersion maches and the systemTime is synced
		const expectedStatus0 = StatusCode.GOOD
		expect(result0).toMatchObject({
			status: status2ExternalStatus(expectedStatus0),
			_status: expectedStatus0,
		})

		const systemTimeCheck = result0.checks && result0.checks.find((p) => p.description === 'systemTime')
		expect(systemTimeCheck).toMatchObject({
			status: status2ExternalStatus(StatusCode.GOOD),
		})
		const databaseVersionCheck = result0.checks && result0.checks.find((p) => p.description === 'databaseVersion')
		expect(databaseVersionCheck).toMatchObject({
			status: status2ExternalStatus(StatusCode.GOOD),
		})
	})
	testInFiber('getSystemStatus: a component has a fault', () => {
		// simulate device failure
		PeripheralDevices.update(env.ingestDevice._id, {
			$set: {
				status: literal<PeripheralDeviceAPI.StatusObject>({
					statusCode: StatusCode.WARNING_MAJOR,
					messages: [],
				}),
			},
		})

		const result0: StatusResponse = Meteor.call(SystemStatusAPIMethods.getSystemStatus)

		// Expected status is WARNING_MAJOR, because the the device has a warning status
		const expectedStatus0 = StatusCode.WARNING_MAJOR
		expect(result0).toMatchObject({
			status: status2ExternalStatus(expectedStatus0),
			_status: expectedStatus0,
		})
		const component =
			result0.components &&
			result0.components.find((c) => unprotectString(c.instanceId) === unprotectString(env.ingestDevice._id))
		expect(component).toMatchObject({
			status: status2ExternalStatus(expectedStatus0),
		})
	})
	testInFiber('getSystemStatus: a component has a library version mismatch', () => {
		// simulate device failure
		PeripheralDevices.update(env.ingestDevice._id, {
			$set: {
				status: literal<PeripheralDeviceAPI.StatusObject>({
					statusCode: StatusCode.GOOD,
					messages: [],
				}),
			},
		})

		const result0: StatusResponse = Meteor.call(SystemStatusAPIMethods.getSystemStatus)

		// Expected status is GOOD, because the the device is GOOD, check that the system is reset
		const expectedStatus0 = StatusCode.GOOD
		expect(result0).toMatchObject({
			status: status2ExternalStatus(expectedStatus0),
			_status: expectedStatus0,
		})
		const component =
			result0.components &&
			result0.components.find((c) => unprotectString(c.instanceId) === unprotectString(env.ingestDevice._id))
		expect(component).toMatchObject({
			status: status2ExternalStatus(expectedStatus0),
		})

		// Change expectedVersions, simulate a major version mismatch
		PeripheralDevices.update(env.ingestDevice._id, {
			$set: {
				versions: {
					test: '1.0.0',
				},
				expectedVersions: {
					test: '2.0.0',
				},
			},
		})
		const result1: StatusResponse = Meteor.call(SystemStatusAPIMethods.getSystemStatus)

		// Expected status is BAD, because the the device expects a different major version
		const expectedStatus1 = StatusCode.BAD
		expect(result1).toMatchObject({
			status: status2ExternalStatus(expectedStatus1),
			_status: expectedStatus1,
		})

		// Change expectedVersions, simulate a minor version mismatch
		PeripheralDevices.update(env.ingestDevice._id, {
			$set: {
				versions: {
					test: '1.0.0',
				},
				expectedVersions: {
					test: '1.1.0',
				},
			},
		})
		const result2: StatusResponse = Meteor.call(SystemStatusAPIMethods.getSystemStatus)

		// Expected status is WARNING_MAJOR, because the the device expects a different minor version
		const expectedStatus2 = StatusCode.WARNING_MAJOR
		expect(result2).toMatchObject({
			status: status2ExternalStatus(expectedStatus2),
			_status: expectedStatus2,
		})

		// Change expectedVersions, simulate a minor version mismatch
		PeripheralDevices.update(env.ingestDevice._id, {
			$set: {
				versions: {
					test: '1.0.0',
				},
				expectedVersions: {
					test: '1.0.1',
				},
			},
		})
		const result3: StatusResponse = Meteor.call(SystemStatusAPIMethods.getSystemStatus)

		// Expected status is WARNING_MINOR, because the the device expects a different patch
		const expectedStatus3 = StatusCode.WARNING_MINOR
		expect(result3).toMatchObject({
			status: status2ExternalStatus(expectedStatus3),
			_status: expectedStatus3,
		})

		// Change expectedVersions, simulate a version match
		PeripheralDevices.update(env.ingestDevice._id, {
			$set: {
				versions: {
					test: '1.0.0',
				},
				expectedVersions: {
					test: '1.0.0',
				},
			},
		})
		const result4: StatusResponse = Meteor.call(SystemStatusAPIMethods.getSystemStatus)

		// Expected status is WARNING_MINOR, because the the device expects a different patch
		const expectedStatus4 = StatusCode.GOOD
		expect(result4).toMatchObject({
			status: status2ExternalStatus(expectedStatus4),
			_status: expectedStatus4,
		})
	})
})
