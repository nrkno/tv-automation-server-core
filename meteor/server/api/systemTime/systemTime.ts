import { Meteor } from 'meteor/meteor'
const ntpClient: NtpClient = require('ntp-client')
import { NtpClient } from '../../typings/ntp-client'
import { systemTime, getCurrentTime } from '../../../lib/lib'
import { setSystemStatus } from '../../systemStatus/systemStatus'
import { logger } from '../../logging'
import { TimeDiff, DiffTimeResult } from '../../../lib/api/peripheralDevice'
import { env } from 'process'
import { StatusCode } from '../../../lib/api/systemStatus'

/** How often the system-time should be updated */
const UPDATE_SYSTEM_TIME_INTERVAL = 3600 * 1000

/**
 * Send a number of calls to ntp-server, and calculate most-probable diff
 * compared to system time
 * https://stackoverflow.com/questions/1228089/how-does-the-network-time-protocol-work
 * @param config config object
 */
function determineDiffTimeInner(config: Config): Promise<DiffTimeResult> {
	const maxSampleCount = config.maxSampleCount || 20
	const minSampleCount = config.minSampleCount || 10
	const maxAllowedDelay = config.maxAllowedDelay || 500
	const maxTries = config.maxTries || 20
	const host = config.host || ''
	const port = config.port || 0

	return new Promise<Array<ServerTime>>((resolve, reject) => {
		const results: Array<ServerTime> = []
		let tryCount = 0
		const pushTime = () => {
			// logger.debug('a')
			tryCount++
			if (tryCount > maxTries) {
				if (tryCount > minSampleCount) {
					resolve(results)
				} else {
					reject('Max try count reached')
				}
				return
			}
			getServerTime(host, port, maxAllowedDelay)
				.then((result) => {
					results.push(result)
					if (results.length < maxSampleCount) pushTime()
					else resolve(results)
				})
				.catch(() => {
					if (results.length < maxSampleCount) pushTime()
					else resolve(results)
				})
		}
		pushTime()
	}).then((results: Array<ServerTime>) => {
		const halfResults = results
			.sort((a, b) => {
				// sort by response time, lower is better
				return a.responseTime - b.responseTime
			})
			.slice(0, Math.ceil(results.length / 2)) // use only the best half
			.map((result) => {
				return result.diff
			})
		if (halfResults.length < 4) throw Error('Too few NTP-responses')
		const stat = standardDeviation(halfResults)
		return stat
	})
}

interface ServerTime {
	diff: number
	serverTime: number
	responseTime: number
}
function getServerTime(host?: string, port?: number, timeout?: number): Promise<ServerTime> {
	return new Promise((resolve, reject) => {
		ntpClient.ntpReplyTimeout = timeout || 500

		const sentTime = Date.now()
		try {
			ntpClient.getNetworkTime(host || '0.se.pool.ntp.org', port || 123, (err: any, date: Date) => {
				if (err) {
					reject(err)
					return
				} else {
					const replyTime = Date.now()
					resolve({
						diff: (sentTime + replyTime) / 2 - date.getTime(),
						serverTime: date.getTime(),
						responseTime: replyTime - sentTime,
					})
				}
			})
		} catch (e) {
			reject(e)
		}
	})
}
function standardDeviation(arr: Array<number>): { mean: number; stdDev: number } {
	let total = 0
	let mean = 0
	const diffSqredArr: Array<number> = []
	for (let i = 0; i < arr.length; i += 1) {
		total += arr[i]
	}
	mean = total / arr.length
	for (let j = 0; j < arr.length; j += 1) {
		diffSqredArr.push(Math.pow(arr[j] - mean, 2))
	}
	return {
		mean: mean,
		stdDev: Math.sqrt(
			diffSqredArr.reduce((firstEl, nextEl) => {
				return firstEl + nextEl
			}) / arr.length
		),
	}
}
interface Config {
	maxSampleCount?: number
	minSampleCount?: number
	maxAllowedDelay?: number
	maxTries?: number
	host?: string
	port?: number
}

/**
 * Update the system time (this function is run at an interval()
 * @param retries
 */
function updateServerTime(retries: number = 0) {
	let ntpServerStr: string | undefined = process.env.NTP_SERVERS
	if (!ntpServerStr) {
		ntpServerStr = '0.se.pool.ntp.org,1.se.pool.ntp.org,2.se.pool.ntp.org'
	}
	const ntpServer = (ntpServerStr.split(',') || [])[0] || 'pool.ntp.org' // Just use the first one specified, for now
	logger.info(`System time: Updating, using ntp-server "${ntpServer}"...`)

	determineDiffTimeInner({
		host: ntpServer,
		maxSampleCount: 20,
		minSampleCount: 10,
		maxAllowedDelay: 500,
	})
		.then((result) => {
			// if result.stdDev is less than one frame-time, it should be okay:
			if (result.stdDev < 1000 / 50) {
				logger.info(
					`System time: Setting diff to ${Math.round(result.mean)} ms (std. dev: ${
						Math.floor(result.stdDev * 10) / 10
					} ms)`
				)

				systemTime.hasBeenSet = true
				systemTime.diff = result.mean
				systemTime.stdDev = result.stdDev
				setSystemStatus('systemTime', {
					statusCode: StatusCode.GOOD,
					messages: [`NTP-time accuracy (standard deviation): ${Math.floor(result.stdDev * 10) / 10} ms`],
				})
			} else {
				if (result.stdDev < systemTime.stdDev) {
					systemTime.hasBeenSet = true
					systemTime.diff = result.mean
					systemTime.stdDev = result.stdDev
				}
				const message = `Unable to accuire NTP-time with good enough accuracy (standard deviation: ${
					Math.floor(result.stdDev * 10) / 10
				} ms)`
				if (systemTime.stdDev < 200) {
					setSystemStatus('systemTime', { statusCode: StatusCode.WARNING_MAJOR, messages: [message] })
				} else {
					setSystemStatus('systemTime', { statusCode: StatusCode.BAD, messages: [message] })
				}
				Meteor.setTimeout(() => {
					updateServerTime()
				}, 20 * 1000)
			}
		})
		.catch((err) => {
			if (retries) {
				Meteor.setTimeout(() => {
					updateServerTime(retries - 1)
				}, 1 * 1000)
			} else {
				logger.info('Unable to set system time (' + (err.reason || err) + ')')
				setSystemStatus('systemTime', {
					statusCode: systemTime.hasBeenSet ? StatusCode.WARNING_MAJOR : StatusCode.BAD,
					messages: [`Error message: ${err.toString()}`],
				})
			}
		})
}
Meteor.startup(() => {
	if (!env.JEST_WORKER_ID) {
		setSystemStatus('systemTime', { statusCode: StatusCode.BAD, messages: ['Starting up...'] })
		Meteor.setInterval(() => {
			updateServerTime()
		}, UPDATE_SYSTEM_TIME_INTERVAL)
		updateServerTime(5)
	} else {
		systemTime.hasBeenSet = true
		systemTime.diff = 0
		systemTime.stdDev = 0
		setSystemStatus('systemTime', {
			statusCode: StatusCode.GOOD,
			messages: [`NTP-time accuracy (standard deviation): 0 ms`],
		})
	}
})

// Example usage:
// determineDiffTime({
// 	maxSampleCount: 20,
// 	minSampleCount: 10,
// 	maxAllowedDelay: 2000
// })
// .then((result) => {
// 	logger.debug('result', result)
// 	// if result.stdDev is less than one frame-time, we should be okay
// })
export function determineDiffTime() {
	return determineDiffTimeInner({
		maxSampleCount: 20,
		minSampleCount: 10,
		maxAllowedDelay: 500,
	})
}

export function getTimeDiff(): TimeDiff {
	return {
		currentTime: getCurrentTime(),
		systemRawTime: Date.now(),
		diff: systemTime.diff,
		stdDev: systemTime.stdDev,
		good: systemTime.stdDev < 1000 / 50,
	}
}
