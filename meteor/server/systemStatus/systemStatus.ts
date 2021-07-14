import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'
import { PeripheralDevices, PeripheralDevice } from '../../lib/collections/PeripheralDevices'
import { getCurrentTime, Time, getRandomId, assertNever } from '../../lib/lib'
import { PeripheralDeviceAPI } from '../../lib/api/peripheralDevice'
import {
	parseVersion,
	parseCoreIntegrationCompatabilityRange,
	stripVersion,
	compareSemverVersions,
} from '../../lib/collections/CoreSystem'
import {
	StatusResponse,
	CheckObj,
	ExternalStatus,
	CheckError,
	SystemInstanceId,
	Component,
	StatusCode,
} from '../../lib/api/systemStatus'
import { getRelevantSystemVersions } from '../coreSystem'
import { StudioId } from '../../lib/collections/Studios'
import { Settings } from '../../lib/Settings'
import { StudioReadAccess } from '../security/studio'
import { OrganizationReadAccess } from '../security/organization'
import { resolveCredentials, Credentials } from '../security/lib/credentials'
import { SystemWriteAccess } from '../security/system'

const PackageInfo = require('../../package.json')
const integrationVersionRange = parseCoreIntegrationCompatabilityRange(PackageInfo.version)

// Any libraries that if a gateway uses should match a certain version
const expectedLibraryVersions: { [libName: string]: string } = {
	'superfly-timeline': stripVersion(require('superfly-timeline/package.json').version),
	'mos-connection': stripVersion(require('mos-connection/package.json').version),
}

/**
 * Handling of system statuses
 */

export interface StatusObject {
	studioId?: StudioId
	statusCode: StatusCode
	messages?: Array<string>
}
export interface StatusObjectInternal {
	studioId?: StudioId
	statusCode: StatusCode
	/** Timestamp when statusCode was last changed */
	timestamp: Time
	messages: Array<{
		message: string
		/** Timestamp when message appeared first */
		timestamp: Time
	}>
}

function getSystemStatusForDevice(device: PeripheralDevice): StatusResponse {
	const deviceStatus: StatusCode = device.status.statusCode
	const deviceStatusMessages: Array<string> = device.status.messages || []

	const checks: Array<CheckObj> = []
	const pushStatusAsCheck = (name: string, statusCode: StatusCode, messages: string[]) => {
		checks.push({
			description: `expectedVersion.${name}`,
			status: status2ExternalStatus(statusCode),
			updated: new Date(device.lastSeen).toISOString(),
			_status: statusCode,
			errors: messages.map((message: string): CheckError => {
				return {
					type: 'version-differ',
					time: new Date(device.lastSeen).toISOString(),
					message: message,
				}
			}),
		})
	}

	if (deviceStatus === StatusCode.GOOD && !device.disableVersionChecks) {
		if (!device.versions) device.versions = {}
		const deviceVersions = device.versions

		// Check core-integration version is as expected
		if (
			device.subType === PeripheralDeviceAPI.SUBTYPE_PROCESS ||
			deviceVersions['@sofie-automation/server-core-integration']
		) {
			const integrationVersion = parseVersion(deviceVersions['@sofie-automation/server-core-integration'])
			const checkMessage = compareSemverVersions(
				integrationVersion,
				integrationVersionRange,
				`Device has to be updated`,
				`Device "${device.name}"`,
				'@sofie-automation/server-core-integration'
			)
			pushStatusAsCheck(
				'@sofie-automation/server-core-integration',
				checkMessage.statusCode,
				checkMessage.messages
			)
		}

		// Check blueprint-integration version is as expected, if it exposes that
		if (deviceVersions['@sofie-automation/blueprint-integration']) {
			const integrationVersion = parseVersion(deviceVersions['@sofie-automation/blueprint-integration'])
			const checkMessage = compareSemverVersions(
				integrationVersion,
				integrationVersionRange,
				`Device has to be updated`,
				`Device "${device.name}"`,
				'@sofie-automation/blueprint-integration'
			)
			pushStatusAsCheck('@sofie-automation/blueprint-integration', checkMessage.statusCode, checkMessage.messages)
		}

		// check for any known libraries
		for (const [libName, targetVersion] of Object.entries(expectedLibraryVersions)) {
			if (deviceVersions[libName] && targetVersion !== '0.0.0') {
				const deviceLibVersion = parseVersion(deviceVersions[libName])
				const checkMessage = compareSemverVersions(
					deviceLibVersion,
					targetVersion,
					`Device has mismatched library version`,
					`Device "${device.name}"`,
					libName
				)
				pushStatusAsCheck(libName, checkMessage.statusCode, checkMessage.messages)
			}
		}
	}
	const so: StatusResponse = {
		name: device.name,
		instanceId: device._id,
		status: 'UNDEFINED',
		updated: new Date(device.lastSeen).toISOString(),
		_status: deviceStatus,
		documentation: '',
		statusMessage: deviceStatusMessages.length ? deviceStatusMessages.join(', ') : undefined,
		_internal: {
			// statusCode: deviceStatus,
			statusCodeString: StatusCode[deviceStatus],
			messages: deviceStatusMessages,
			versions: device.versions || {},
		},
		checks: checks,
	}
	if (device.type === PeripheralDeviceAPI.DeviceType.MOS) {
		so.documentation = 'https://github.com/nrkno/tv-automation-mos-gateway'
	} else if (device.type === PeripheralDeviceAPI.DeviceType.SPREADSHEET) {
		so.documentation = 'https://github.com/SuperFlyTV/spreadsheet-gateway'
	} else if (device.type === PeripheralDeviceAPI.DeviceType.PLAYOUT) {
		so.documentation = 'https://github.com/nrkno/tv-automation-playout-gateway'
	} else if (device.type === PeripheralDeviceAPI.DeviceType.MEDIA_MANAGER) {
		so.documentation = 'https://github.com/nrkno/tv-automation-media-management'
	} else if (device.type === PeripheralDeviceAPI.DeviceType.INEWS) {
		so.documentation = 'https://github.com/olzzon/tv2-inews-ftp-gateway'
	} else if (device.type === PeripheralDeviceAPI.DeviceType.PACKAGE_MANAGER) {
		so.documentation = 'https://github.com/nrkno/tv-automation-package-manager'
	} else {
		assertNever(device.type)
	}

	return so
}

/**
 * Returns system status
 * @param studioId (Optional) If provided, limits the status to what's affecting the studio
 */
export function getSystemStatus(cred0: Credentials, studioId?: StudioId): StatusResponse {
	const checks: Array<CheckObj> = []

	SystemWriteAccess.systemStatusRead(cred0)

	// Check systemStatuses:
	_.each(systemStatuses, (status: StatusObjectInternal, key: string) => {
		checks.push({
			description: key,
			status: status2ExternalStatus(status.statusCode),
			updated: new Date(status.timestamp).toISOString(),
			_status: status.statusCode,
			errors: _.map(status.messages || [], (m): CheckError => {
				return {
					type: 'message',
					time: new Date(m.timestamp).toISOString(),
					message: m.message,
				}
			}),
		})
	})

	const statusObj: StatusResponse = {
		name: 'Sofie Automation system',
		instanceId: instanceId,
		updated: new Date(getCurrentTime()).toISOString(),
		status: 'UNDEFINED',
		_status: StatusCode.UNKNOWN,
		documentation: 'https://github.com/nrkno/tv-automation-server-core',
		_internal: {
			// this _internal is set later
			statusCodeString: StatusCode[StatusCode.UNKNOWN],
			messages: [],
			versions: {},
		},
		checks: checks,
	}

	let devices: PeripheralDevice[] = []
	if (studioId) {
		if (!StudioReadAccess.studioContent({ studioId: studioId }, cred0)) {
			throw new Meteor.Error(403, `Not allowed`)
		}
		devices = PeripheralDevices.find({ studioId: studioId }).fetch()
	} else {
		if (Settings.enableUserAccounts) {
			const cred = resolveCredentials(cred0)
			if (!cred.organization) throw new Meteor.Error(500, 'user has no organization')
			if (!OrganizationReadAccess.organizationContent({ organizationId: cred.organization._id }, cred)) {
				throw new Meteor.Error(403, `Not allowed`)
			}
			devices = PeripheralDevices.find({ organizationId: cred.organization._id }).fetch()
		} else {
			devices = PeripheralDevices.find({}).fetch()
		}
	}
	for (const device of devices) {
		const so = getSystemStatusForDevice(device)

		if (!statusObj.components) statusObj.components = []
		statusObj.components.push(so)
	}

	const systemStatus: StatusCode = setStatus(statusObj)
	statusObj._internal = {
		// statusCode: systemStatus,
		statusCodeString: StatusCode[systemStatus],
		messages: collectMesages(statusObj),
		versions: getRelevantSystemVersions(),
	}
	statusObj.statusMessage = statusObj._internal.messages.join(', ')

	return statusObj
}
export function setSystemStatus(type: string, status: StatusObject) {
	let systemStatus: StatusObjectInternal = systemStatuses[type]
	if (!systemStatus) {
		systemStatus = {
			statusCode: StatusCode.UNKNOWN,
			timestamp: 0,
			messages: [],
		}
		systemStatuses[type] = systemStatus
	}

	if (systemStatus.statusCode !== status.statusCode) {
		systemStatus.statusCode = status.statusCode
		systemStatus.timestamp = getCurrentTime()
	}

	const messages: Array<{
		message: string
		timestamp: Time
	}> = []
	if (status.messages) {
		_.each(status.messages, (message) => {
			const m = _.find(systemStatus.messages, (m) => m.message === message)
			if (m) {
				messages.push(m)
			} else {
				messages.push({
					message: message,
					timestamp: getCurrentTime(),
				})
			}
		})
	}
	systemStatus.messages = messages
}
export function removeSystemStatus(type: string) {
	delete systemStatuses[type]
}
/** Random id for this running instance of core */
const instanceId: SystemInstanceId = getRandomId()
/** Map of surrent system statuses */
const systemStatuses: { [key: string]: StatusObjectInternal } = {}
function setStatus(statusObj: StatusResponse | Component): StatusCode {
	let s: StatusCode = statusObj._status

	if (statusObj.checks) {
		_.each(statusObj.checks, (check: CheckObj) => {
			if (check._status > s) s = check._status
		})
	}
	if (statusObj.components) {
		_.each(statusObj.components, (component: Component) => {
			const s2: StatusCode = setStatus(component)
			if (s2 > s) s = s2
		})
	}
	statusObj.status = status2ExternalStatus(s)
	statusObj._status = s
	return s
}
function collectMesages(statusObj: StatusResponse | Component): Array<string> {
	const allMessages: Array<string> = []

	if (statusObj._internal) {
		_.each(statusObj._internal.messages, (msg) => {
			allMessages.push(msg)
		})
	}
	if (statusObj.checks) {
		_.each(statusObj.checks, (check: CheckObj) => {
			if (check._status !== StatusCode.GOOD && check.errors) {
				_.each(check.errors, (errMsg) => {
					allMessages.push(`check ${check.description}: ${errMsg.message}`)
				})
			}
		})
	}
	if (statusObj.components) {
		_.each(statusObj.components, (component: Component) => {
			const messages = collectMesages(component)

			_.each(messages, (msg) => {
				allMessages.push(`${component.name}: ${msg}`)
			})
		})
	}
	return allMessages
}
export function status2ExternalStatus(statusCode: StatusCode): ExternalStatus {
	if (statusCode === StatusCode.GOOD) {
		return 'OK'
	} else if (statusCode === StatusCode.WARNING_MINOR || statusCode === StatusCode.WARNING_MAJOR) {
		return 'WARNING'
	} else if (statusCode === StatusCode.BAD || statusCode === StatusCode.FATAL) {
		return 'FAIL'
	}
	return 'UNDEFINED'
}
