import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'
import { logger } from './logging'
import { getRunningMethods, resetRunningMethods } from './methods'
import { getCoreSystem } from '../lib/collections/CoreSystem'

/**
 * The performanceMonotor runs at an interval, and when run it checks that it actually ran on time.
 * If it didn't run on time, this was probably because the main thread was blocked, either due to some
 * slow-running function or garbage collection.
 * If it detects a delay, it logs a warning to the console along with some debugging data, to help us find
 * the culprit.
 */

const PERMORMANCE_CHECK_INTERVAL = 500 // how often to check
const ACCEPTED_DELAY = 100 // how much delay to accept before logging a warning
const statisticsDelays: Array<number> = []
const statisticsCount = 10000 // how many to base each statistics on
const statistics: Array<{
	timestamp: number
	count: number
	average: number
	min: number
	max: number
	warnings: number
	halfWarnings: number
	quarterWarnings: number
	averageWarnings: number
}> = []

function traceDebuggingData() {
	// Collect a set of data that can be useful for performance debugging

	const debugData: any = {
		connectionCount: 0,
		namedSubscriptionCount: 0,
		universalSubscriptionCount: 0,
		documentCount: 0,

		subscriptions: {},
		connections: [],
	}
	// @ts-ignore
	const connections = Meteor.server.stream_server.open_sockets
	_.each(connections, (connection: any) => {
		debugData.connectionCount++

		const conn = {
			address: connection.address,
			clientAddress: null,
			clientPort: connection.clientclientPort,
			remoteAddress: connection.remoteAddress,
			remotePort: connection.remotePort,
			documentCount: 0,
		}
		debugData.connections.push(conn)
		// named subscriptions

		const session = connection._meteorSession

		if (session) {
			// if (session.clientAddress) conn.clientAddress = session.clientAddress()
			if (session.connectionHandle) conn.clientAddress = session.connectionHandle.clientAddress

			_.each(session._namedSubs, (sub: any) => {
				debugData.namedSubscriptionCount++
				// @ts-ignore
				if (!debugData.subscriptions[sub._name]) {
					debugData.subscriptions[sub._name] = {
						count: 0,
						documents: {},
					}
				}
				const sub0 = debugData.subscriptions[sub._name]

				sub0.count++

				_.each(sub._documents, (collection, collectionName: string) => {
					if (!sub0.documents[collectionName]) sub0.documents[collectionName] = 0
					const count = _.keys(collection).length || 0
					sub0.documents[collectionName] += count
					conn.documentCount += count
				})
			})
			_.each(session._namedSubs, (_sub: any) => {
				debugData.universalSubscriptionCount++
				// unsure what this is
			})

			debugData.documentCount += conn.documentCount
		}
	})
	return debugData
}
function updateStatistics(onlyReturn?: boolean) {
	const stat = {
		timestamp: Date.now(),
		count: statisticsDelays.length,
		average: 0,
		min: 99999,
		max: -99999,
		warnings: 0,
		averageWarnings: 0,
		halfWarnings: 0,
		quarterWarnings: 0,
	}
	_.each(statisticsDelays, (d) => {
		stat.average += d
		if (d < stat.min) stat.min = d
		if (d > stat.max) stat.max = d
		if (d > ACCEPTED_DELAY) {
			stat.warnings++
			stat.averageWarnings += d
		}

		if (d > ACCEPTED_DELAY / 2) stat.halfWarnings++
		if (d > ACCEPTED_DELAY / 4) stat.quarterWarnings++
	})
	if (stat.count) stat.average = stat.average / stat.count
	if (stat.warnings) stat.averageWarnings = stat.averageWarnings / stat.warnings

	if (!onlyReturn) {
		statisticsDelays.splice(0, statisticsDelays.length) // clear the array
		statistics.push(stat)
	}
	return stat
}
// function getStatistics() {
// 	const stat = {
// 		timestamp: Date.now(),
// 		count: 0,
// 		average: 0,
// 		min: 99999,
// 		max: -99999,
// 		warnings: 0,
// 		averageWarnings: 0,
// 		halfWarnings: 0,
// 		quarterWarnings: 0,
// 		periods: [],
// 	}

// 	const periods = [updateStatistics(true)]
// 	_.each(statistics, (s) => {
// 		periods.push(s)
// 	})

// 	_.each(periods, (s) => {
// 		stat.count += s.count
// 		stat.average += s.average * s.count

// 		if (s.min < stat.min) stat.min = s.min
// 		if (s.max > stat.max) stat.max = s.max

// 		stat.warnings += s.warnings
// 		stat.averageWarnings += s.averageWarnings * s.warnings

// 		stat.halfWarnings += s.halfWarnings
// 		stat.quarterWarnings += s.quarterWarnings
// 	})
// 	if (stat.count) stat.average = stat.average / stat.count
// 	if (stat.warnings) stat.averageWarnings = stat.averageWarnings / stat.warnings

// 	// @ts-ignore
// 	stat.periods = statistics

// 	return stat
// }

let lastTime = 0
const monitorBlockedThread = () => {
	if (lastTime) {
		const timeSinceLast = Date.now() - lastTime

		const delayTime = timeSinceLast - PERMORMANCE_CHECK_INTERVAL

		if (delayTime > ACCEPTED_DELAY) {
			logger.warn('Main thread was blocked for ' + delayTime + ' ms')
			const trace: string[] = []
			const runningMethods = getRunningMethods()
			if (!_.isEmpty(runningMethods)) {
				_.each(runningMethods, (m) => {
					trace.push(m.method + ': ' + (Date.now() - m.startTime) + ' ms ago')
				})
			}
			resetRunningMethods()
			logger.info('Running methods:', trace)
			logger.info('traceDebuggingData:', traceDebuggingData())
		}

		statisticsDelays.push(delayTime)
		if (statisticsDelays.length >= statisticsCount) {
			updateStatistics()
		}
	}
	lastTime = Date.now()
	Meteor.setTimeout(() => {
		monitorBlockedThread()
	}, PERMORMANCE_CHECK_INTERVAL)
}
Meteor.startup(() => {
	if (getCoreSystem()?.enableMonitorBlockedThread) {
		Meteor.setTimeout(() => {
			monitorBlockedThread()
		}, 5000)
	}
})
