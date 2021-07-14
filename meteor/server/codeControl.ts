import { Random } from 'meteor/random'
import * as _ from 'underscore'
import { logger } from './logging'
import { Meteor } from 'meteor/meteor'
import { getHash } from '../lib/lib'
// import * as callerModule from 'caller-module'

const ACCEPTABLE_WAIT_TIME = 200 // ms

enum syncFunctionFcnStatus {
	WAITING = 0,
	RUNNING = 1,
	DONE = 2,
	TIMEOUT = 3,
}
export type Callback = (err: Error | null, res?: any) => void

interface SyncFunctionFcn {
	id: string
	fcn: Function
	name: string
	args: Array<any>
	cb: Callback
	timeout: number
	status: syncFunctionFcnStatus
	priority: number
	started?: number
	queueTime: number
	waitingOnFunctions: string[]
}
/** Queue of syncFunctions */
const syncFunctionFcns: Array<SyncFunctionFcn> = []

function getFunctionName<T extends Function>(context: string, fcn: T): string {
	if (fcn.name) {
		return `${context} - ${fcn.name}`
	} else {
		return context
	}
}
export function MeteorWrapAsync(func: Function, context?: Object): any {
	// A variant of Meteor.wrapAsync to fix the bug
	// https://github.com/meteor/meteor/issues/11120

	return Meteor.wrapAsync((...args: any[]) => {
		// Find the callback-function:
		for (let i = args.length - 1; i >= 0; i--) {
			if (typeof args[i] === 'function') {
				if (i < args.length - 1) {
					// The callback is not the last argument, make it so then:
					const callback = args[i]
					const fixedArgs = args
					fixedArgs[i] = undefined
					fixedArgs.push(callback)

					func.apply(context, fixedArgs)
					return
				} else {
					// The callback is the last argument, that's okay
					func.apply(context, args)
					return
				}
			}
		}
		throw new Meteor.Error(500, `Error in MeteorWrapAsync: No callback found!`)
	})
}

/**
 * Only allow one instane of the function (and its arguments) to run at the same time
 * If trying to run several at the same time, the subsequent are put on a queue and run later
 * @param fcn
 * @param context Description of the context where the sync function is executing, to assist with program flow analysis.
 * @param id0 (Optional) Id to determine which functions are to wait for each other. Can use "$0" to refer first argument. Example: "myFcn_$0,$1" will let myFcn(0, 0, 13) and myFcn(0, 1, 32) run in parallell, byt not myFcn(0, 0, 13) and myFcn(0, 0, 14)
 * @param timeout (Optional)
 */
export function syncFunction<T extends Function>(
	fcn: T,
	context: string,
	id0?: string,
	timeout: number = 10000,
	priority: number = 1
): T {
	const id1 = Random.id()
	return syncFunctionInner(id1, fcn, context, id0, timeout, priority)
}
function syncFunctionInner<T extends Function>(
	id1: string,
	fcn: T,
	context: string,
	id0?: string,
	timeout: number = 10000,
	priority: number = 1
): T {
	return MeteorWrapAsync((...args0: any[]) => {
		const queueTime = Date.now()
		const args = args0.slice(0, -1)
		// @ts-ignore
		const cb: Callback = _.last(args0) // the callback is the last argument

		if (!cb) throw new Meteor.Error(500, 'Callback is not defined')
		if (!_.isFunction(cb)) {
			logger.info(cb)
			throw new Meteor.Error(500, 'Callback is not a function, it is a ' + typeof cb)
		}

		const id = id0 ? getId(id0, args) : getHash(id1 + JSON.stringify(args.join()))
		const name = getFunctionName(context, fcn)
		logger.debug(`syncFunction: ${id} (${name})`)
		const waitingOnFunctions = getSyncFunctionsRunningOrWaiting(id)
		syncFunctionFcns.push({
			id: id,
			fcn: fcn,
			name: name,
			args: args,
			cb: cb,
			queueTime: queueTime,
			waitingOnFunctions: waitingOnFunctions,
			timeout: timeout,
			status: syncFunctionFcnStatus.WAITING,
			priority: priority,
		})
		evaluateFunctions()
	})
}
function evaluateFunctions() {
	const groups = _.groupBy(syncFunctionFcns, (fcn) => fcn.id)
	_.each(groups, (group) => {
		const runningFcn = _.find(group, (fcn) => fcn.status === syncFunctionFcnStatus.RUNNING)
		let startNext = false
		if (runningFcn) {
			let startTime = runningFcn.started
			if (!startTime) {
				startTime = runningFcn.started = Date.now()
			}
			if (Date.now() - startTime > runningFcn.timeout) {
				// The function has run too long
				logger.error(`syncFunction "${runningFcn.name}" took too long to evaluate`)
				runningFcn.status = syncFunctionFcnStatus.TIMEOUT
				startNext = true
			} else {
				// Do nothing, another is running
			}
		} else {
			startNext = true
		}

		if (startNext) {
			const nextFcn = _.max(
				_.filter(group, (fcn) => fcn.status === syncFunctionFcnStatus.WAITING),
				(fcn) => fcn.priority
			)
			if (_.isObject(nextFcn)) {
				nextFcn.status = syncFunctionFcnStatus.RUNNING
				nextFcn.started = Date.now()
				const waitTime = nextFcn.started - nextFcn.queueTime
				if (waitTime > ACCEPTABLE_WAIT_TIME) {
					logger.warn(
						`syncFunction ${nextFcn.id} "${
							nextFcn.name
						}" waited ${waitTime} ms for other functions to complete before starting: [${nextFcn.waitingOnFunctions.join(
							', '
						)}]`
					)
				}
				Meteor.setTimeout(() => {
					try {
						const result = nextFcn.fcn(...nextFcn.args)
						nextFcn.cb(null, result)
					} catch (e) {
						nextFcn.cb(e)
					}
					if (nextFcn.status === syncFunctionFcnStatus.TIMEOUT) {
						const duration = nextFcn.started ? Date.now() - nextFcn.started : 0
						logger.error(
							`syncFunction ${nextFcn.id} "${nextFcn.name}" completed after timeout. took ${duration}ms`
						)
					}
					nextFcn.status = syncFunctionFcnStatus.DONE
					evaluateFunctions()
				}, 0)
				Meteor.setTimeout(() => {
					if (nextFcn.status === syncFunctionFcnStatus.RUNNING) {
						logger.error(`syncFunction "${nextFcn.name}" took too long to evaluate`)
						nextFcn.status = syncFunctionFcnStatus.TIMEOUT
						evaluateFunctions()
					}
				}, nextFcn.timeout)
			}
		}
	})
	for (let i = syncFunctionFcns.length - 1; i >= 0; i--) {
		if (syncFunctionFcns[i].status === syncFunctionFcnStatus.DONE) {
			syncFunctionFcns.splice(i, 1)
		}
	}
}
// function isFunctionQueued(id: string): boolean {
// 	let queued = _.find(syncFunctionFcns, (fcn) => {
// 		return fcn.id === id && fcn.status === syncFunctionFcnStatus.WAITING
// 	})
// 	return !!queued
// }
export function isAnySyncFunctionsRunning(): boolean {
	let found = false
	for (const fcn of syncFunctionFcns) {
		if (fcn.status === syncFunctionFcnStatus.RUNNING) {
			found = true
			break
		}
	}
	return found
}
export function getSyncFunctionsRunningOrWaiting(id: string): string[] {
	const names: string[] = []
	for (const fcn of syncFunctionFcns) {
		if (
			fcn.id == id &&
			(fcn.status === syncFunctionFcnStatus.RUNNING || fcn.status === syncFunctionFcnStatus.WAITING)
		) {
			names.push(fcn.name)
		}
	}
	return names
}

function getId(id: string, args: Array<any>): string {
	let str: string = id

	if (str.indexOf('$') !== -1) {
		_.each(args, (val, key) => {
			str = str.replace('$' + key, JSON.stringify(val))
		})
		return getHash(str)
	}
	return str
}
