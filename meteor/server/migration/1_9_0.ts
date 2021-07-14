import { addMigrationSteps } from './databaseMigration'
import { PeripheralDeviceAPI } from '../../lib/api/peripheralDevice'
import { PeripheralDevices } from '../../lib/collections/PeripheralDevices'

// Release 21
export const addSteps = addMigrationSteps('1.9.0', [
	{
		id: 'migrateScannersToWatchers',
		canBeRunAutomatically: true,
		validate: () => {
			const devices = PeripheralDevices.find({}).fetch()
			const monitors: any[][] = devices
				.filter((d) => {
					d.settings &&
						d.type === PeripheralDeviceAPI.DeviceType.MEDIA_MANAGER &&
						(d.settings as any).monitors &&
						(d.settings as any).monitors
				})
				.map((x) => Object.values((x.settings as any).monitors || []))
			let scannerCount = 0
			for (const mons of monitors) {
				scannerCount += mons.filter((m) => m.type === 'mediascanner').length
			}
			if (scannerCount > 0) {
				return `PeripheralDevices contains ${scannerCount} devices that need updating`
			}
			return false
		},
		migrate: () => {
			const devices = PeripheralDevices.find({}).fetch()
			const devWithMonitor = devices.filter((d) => {
				return (
					d.settings &&
					d.type === PeripheralDeviceAPI.DeviceType.MEDIA_MANAGER &&
					(d.settings as any).monitors &&
					(d.settings as any).monitors
				)
			}) as any[]
			for (const device of devWithMonitor) {
				const monitors = device.settings!.monitors || {}
				const mons = Object.keys(monitors)
				for (const m of mons) {
					if (monitors[m].type === 'mediascanner') {
						const currentMon = monitors[m]
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
])
