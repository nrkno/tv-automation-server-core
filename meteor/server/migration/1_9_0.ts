import { addMigrationSteps } from './databaseMigration'
import { setExpectedVersion } from './lib'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { PeripheralDevices } from '../../lib/collections/PeripheralDevices'

// Release 21
export const addSteps = addMigrationSteps('1.9.0', [
	{
		id: 'migrateScannersToWatchers',
		canBeRunAutomatically: true,
		validate: () => {
			const devices = PeripheralDevices.find({}).fetch()
			let monitors: any[][] = devices
				.filter((d) => {
					d.settings &&
						d.type === PeripheralDeviceAPI.DeviceType.MEDIA_MANAGER &&
						(d.settings as any).monitors &&
						(d.settings as any).monitors
				})
				.map((x) => Object.values((x.settings as any).monitors || []))
			let scannerCount = 0
			for (let mons of monitors) {
				scannerCount += mons.filter((m) => m.type === 'mediascanner').length
			}
			if (scannerCount > 0) {
				return `PeripheralDevices contains ${scannerCount} devices that need updating`
			}
			return false
		},
		migrate: () => {
			const devices = PeripheralDevices.find({}).fetch()
			let devWithMonitor = devices.filter((d) => {
				return (
					d.settings &&
					d.type === PeripheralDeviceAPI.DeviceType.MEDIA_MANAGER &&
					(d.settings as any).monitors &&
					(d.settings as any).monitors
				)
			}) as any[]
			for (let device of devWithMonitor) {
				const monitors = device.settings!.monitors || {}
				let mons = Object.keys(monitors)
				for (let m of mons) {
					if (monitors[m].type === 'mediascanner') {
						let currentMon = monitors[m]
						monitors[m] = {
							type: 'watcher',
							storageId: currentMon.storageId,
							disable: currentMon.disable,
							scanner: {},
							retryLimit: 3,
						}
					}
				}
				device.settings!.monitors = monitors
				PeripheralDevices.update(device._id, { $set: device })
			}
		},
	},
	setExpectedVersion(
		'expectedVersion.mediaManager',
		PeripheralDeviceAPI.DeviceType.MEDIA_MANAGER,
		'_process',
		'^1.2.0'
	),
	setExpectedVersion('expectedVersion.playoutDevice', PeripheralDeviceAPI.DeviceType.PLAYOUT, '_process', '^1.8.0'),
	setExpectedVersion('expectedVersion.mosDevice', PeripheralDeviceAPI.DeviceType.MOS, '_process', '^1.3.2'),
])
