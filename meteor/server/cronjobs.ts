import { Rundowns } from '../lib/collections/Rundowns'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { PeripheralDevices } from '../lib/collections/PeripheralDevices'
import * as _ from 'underscore'
import { getCurrentTime, makePromise, waitForPromiseAll } from '../lib/lib'
import { logger } from './logging'
import { Meteor } from 'meteor/meteor'
import { IngestDataCache } from '../lib/collections/IngestDataCache'
import { TSR } from '@sofie-automation/blueprints-integration'
import { UserActionsLog } from '../lib/collections/UserActionsLog'
import { Snapshots } from '../lib/collections/Snapshots'
import { CASPARCG_RESTART_TIME } from '../lib/constants'
import { Studios } from '../lib/collections/Studios'
import { removeEmptyPlaylists } from './api/rundownPlaylist'
import { getCoreSystem } from '../lib/collections/CoreSystem'
import { executePeripheralDeviceFuntionWithCustomTimeout } from '../lib/api/peripheralDeviceInternal'

let lowPrioFcn = (fcn: (...args: any[]) => any, ...args: any[]) => {
	// Do it at a random time in the future:
	Meteor.setTimeout(() => {
		fcn(...args)
	}, Math.random() * 10 * 1000)
}

Meteor.startup(() => {
	let lastNightlyCronjob = 0
	let failedRetries = 0

	function nightlyCronjob() {
		let d = new Date(getCurrentTime())
		let timeSinceLast = getCurrentTime() - lastNightlyCronjob
		if (
			d.getHours() >= 4 &&
			d.getHours() < 5 && // It is nighttime
			timeSinceLast > 20 * 3600 * 1000 // was last run yesterday
		) {
			let previousLastNightlyCronjob = lastNightlyCronjob
			lastNightlyCronjob = getCurrentTime()
			logger.info('Nightly cronjob: starting...')
			const system = getCoreSystem()

			// Clean up Rundown data cache:
			// Remove caches not related to rundowns:
			let rundownCacheCount = 0
			let rundownIds = _.map(Rundowns.find().fetch(), (rundown) => rundown._id)
			IngestDataCache.find({
				rundownId: { $nin: rundownIds },
			}).forEach((roc) => {
				lowPrioFcn(IngestDataCache.remove, roc._id)
				rundownCacheCount++
			})
			if (rundownCacheCount)
				logger.info('Cronjob: Will remove cached data from ' + rundownCacheCount + ' rundowns')

			const cleanLimitTime = getCurrentTime() - 1000 * 3600 * 24 * 50 // 50 days ago

			// Remove old entries in UserActionsLog:
			const oldUserActionsLogCount: number = UserActionsLog.find({
				timestamp: { $lt: cleanLimitTime },
			}).count()
			if (oldUserActionsLogCount > 0) {
				logger.info(`Cronjob: Will remove ${oldUserActionsLogCount} entries from UserActionsLog`)
				lowPrioFcn(() => {
					UserActionsLog.remove({
						timestamp: { $lt: cleanLimitTime },
					})
				})
			}

			// Remove old entries in Snapshots:
			const oldSnapshotsCount: number = Snapshots.find({
				created: { $lt: cleanLimitTime },
			}).count()
			if (oldSnapshotsCount > 0) {
				logger.info(`Cronjob: Will remove ${oldSnapshotsCount} entries from Snapshots`)
				lowPrioFcn(() => {
					Snapshots.remove({
						created: { $lt: cleanLimitTime },
					})
				})
			}

			let ps: Array<Promise<any>> = []
			// restart casparcg
			if (system?.cron?.casparCGRestart?.enabled) {
				PeripheralDevices.find({
					type: PeripheralDeviceAPI.DeviceType.PLAYOUT,
				}).forEach((device) => {
					PeripheralDevices.find({
						parentDeviceId: device._id,
					}).forEach((subDevice) => {
						if (
							subDevice.type === PeripheralDeviceAPI.DeviceType.PLAYOUT &&
							subDevice.subType === TSR.DeviceType.CASPARCG
						) {
							logger.info('Cronjob: Trying to restart CasparCG on device "' + subDevice._id + '"')

							ps.push(
								new Promise<void>((resolve, reject) => {
									executePeripheralDeviceFuntionWithCustomTimeout(
										subDevice._id,
										(err) => {
											if (err) {
												logger.error(
													'Cronjob: "' + subDevice._id + '": CasparCG restart error',
													err
												)
												if ((err + '').match(/timeout/i)) {
													// If it was a timeout, maybe we could try again later?
													if (failedRetries < 5) {
														failedRetries++
														lastNightlyCronjob = previousLastNightlyCronjob // try again later
													}
													resolve()
												} else {
													reject(err)
												}
											} else {
												logger.info('Cronjob: "' + subDevice._id + '": CasparCG restart done')
												resolve()
											}
										},
										CASPARCG_RESTART_TIME,
										'restartCasparCG'
									)
								})
							)
						}
					})
				})
			}
			Promise.all(ps)
				.then(() => {
					failedRetries = 0
				})
				.catch((err) => {
					logger.error(err)
				})

			// last:
			logger.info('Nightly cronjob: done')
		}
	}
	Meteor.setInterval(nightlyCronjob, 5 * 60 * 1000) // check every 5 minutes
	nightlyCronjob()

	function cleanupPlaylists() {
		// Ensure there are no empty playlists on an interval
		const studios = Studios.find().fetch()
		waitForPromiseAll(
			studios.map((studio) =>
				makePromise(() => {
					removeEmptyPlaylists(studio._id)
				})
			)
		)
	}
	Meteor.setInterval(cleanupPlaylists, 30 * 60 * 1000) // every 30 minutes
	cleanupPlaylists()
})
