import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { Time, registerCollection, ProtectedString, assertNever } from '../lib'
import { TransformedCollection } from '../typings/meteor'

import { PlayoutDeviceSettings } from './PeripheralDeviceSettings/playoutDevice'
import { IngestDeviceSettings, IngestDeviceSecretSettings } from './PeripheralDeviceSettings/ingestDevice'
import { createMongoCollection } from './lib'
import { DeviceConfigManifest } from '../api/deviceConfig'
import { StudioId } from './Studios'
import { OrganizationId } from './Organization'
import { registerIndex } from '../database'

/** A string, identifying a PeripheralDevice */
export type PeripheralDeviceId = ProtectedString<'PeripheralDeviceId'>

export interface PeripheralDevice {
	_id: PeripheralDeviceId

	/** If set, this device is owned by that organization */
	organizationId: OrganizationId | null

	/** Name of the device (set by the device, modifiable by user) */
	name: string

	/** Name of the device (set by the device) */
	deviceName?: string

	category: PeripheralDeviceAPI.DeviceCategory
	type: PeripheralDeviceAPI.DeviceType
	subType: PeripheralDeviceAPI.DeviceSubType

	/** The studio this device is assigned to. Will be undefined for sub-devices */
	studioId?: StudioId
	parentDeviceId?: PeripheralDeviceId
	/** Versions reported from the device */
	versions?: {
		[libraryName: string]: string
	}
	/** Expected versions (at least this) */
	expectedVersions?: {
		[libraryName: string]: string
	}

	created: Time
	status: PeripheralDeviceAPI.StatusObject
	lastSeen: Time // Updated continously while connected
	lastConnected: Time // Updated upon connection, not continously

	/** A list of last reported latencies */
	latencies?: number[]

	connected: boolean
	connectionId: string | null // Id of the current ddp-Connection

	token: string

	settings?: PlayoutDeviceSettings | IngestDeviceSettings | { [key: string]: any }

	secretSettings?: IngestDeviceSecretSettings | { [key: string]: any }

	/** Ignore this device when computing status in the GUI (other status reports are unaffected) */
	ignore?: boolean

	configManifest: DeviceConfigManifest

	/** If this is an ingest gateway, the last tiem data was received */
	lastDataReceived?: Time

	/** If an ingest device performing an oauth flow */
	accessTokenUrl?: string
}

export const PeripheralDevices: TransformedCollection<
	PeripheralDevice,
	PeripheralDevice
> = createMongoCollection<PeripheralDevice>('peripheralDevices')
registerCollection('PeripheralDevices', PeripheralDevices)

registerIndex(PeripheralDevices, {
	organizationId: 1,
	studioId: 1,
})
registerIndex(PeripheralDevices, {
	studioId: 1,
})
registerIndex(PeripheralDevices, {
	token: 1,
})

export function getStudioIdFromDevice(peripheralDevice: PeripheralDevice): StudioId | undefined {
	if (peripheralDevice.studioId) {
		return peripheralDevice.studioId
	}
	if (peripheralDevice.parentDeviceId) {
		// Also check the parent device:
		const parentDevice = PeripheralDevices.findOne(peripheralDevice.parentDeviceId)
		if (parentDevice) {
			return parentDevice.studioId
		}
	}
	return undefined
}
/**
 * Calculate what the expected latency is going to be for a device.
 * The returned latency represents the amount of time we expect the device will need to receive, process and execute a timeline
 */
export function getExpectedLatency(
	peripheralDevice: PeripheralDevice
): { average: number; safe: number; fastest: number } {
	if (peripheralDevice.latencies && peripheralDevice.latencies.length) {
		peripheralDevice.latencies.sort((a, b) => {
			if (a > b) return 1
			if (a < b) return -1
			return 0
		})
		const latencies = peripheralDevice.latencies
		var total = 0
		for (let latency of latencies) {
			total += latency
		}
		const average = total / latencies.length

		// The 95th slowest percentil
		const i95 = Math.floor(latencies.length * 0.95)

		return {
			average: average,
			safe: latencies[i95],
			fastest: latencies[0],
		}
	}
	return {
		average: 0,
		safe: 0,
		fastest: 0,
	}
}
export function getExternalNRCSName(device: PeripheralDevice | undefined): string {
	if (device) {
		if (device.category === PeripheralDeviceAPI.DeviceCategory.INGEST) {
			if (device.type === PeripheralDeviceAPI.DeviceType.MOS) {
				// This is a hack, to be replaced with something better later:
				return 'ENPS'
			} else if (device.type === PeripheralDeviceAPI.DeviceType.INEWS) {
				return 'iNews'
			} else if (device.type === PeripheralDeviceAPI.DeviceType.SPREADSHEET) {
				return 'Google Sheet'
			} else if (
				device.type === PeripheralDeviceAPI.DeviceType.PLAYOUT ||
				device.type === PeripheralDeviceAPI.DeviceType.MEDIA_MANAGER ||
				device.type === PeripheralDeviceAPI.DeviceType.PACKAGE_MANAGER
			) {
				// These aren't ingest gateways
			} else {
				assertNever(device.type)
			}
		}
		// The device type is unknown to us:
		return `Unknown NRCS: "${device.type}"`
	} else {
		// undefined NRCS:
		return 'NRCS'
	}
}
