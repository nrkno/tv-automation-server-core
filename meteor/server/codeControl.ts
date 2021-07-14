import { logger } from './logging'
import { Meteor } from 'meteor/meteor'
import { getCurrentTime, getRandomId } from '../lib/lib'
import PQueue from 'p-queue/dist/index'

const ACCEPTABLE_WAIT_TIME = 200 // ms

interface QueueInfo {
	queue: PQueue
	pendingJobNames: string[]
}
const workQueues = new Map<string, QueueInfo>() // TODO - we will leak queues over time

export function isAnyQueuedWorkRunning(): boolean {
	for (const queue of workQueues.values()) {
		if (queue.queue.size > 0 || queue.queue.pending > 0) {
			return true
		}
	}
	return false
}

/**
 * Push a unit of work onto a queue.
 * Allows only one item of work from each queue to be executing at a time (unless something times out)
 */
export async function pushWorkToQueue<T>(
	queueName: string,
	jobContext: string,
	fcn: () => Promise<T>,
	priority: number = 1,
	timeout?: number
): Promise<T> {
	// Note: this emulates the old syncFunction behaviour of timeouts. should we switch to a more traditional timeout handling of bubbling up the error?
	const { resolve, reject, promise } = createManualPromise<T>()
	let timedOut = false

	let queueInfo = workQueues.get(queueName)
	if (!queueInfo) {
		queueInfo = {
			queue: new PQueue({
				concurrency: 1,
				timeout: 10000,
				throwOnTimeout: true,
			}),
			pendingJobNames: [],
		}
		workQueues.set(queueName, queueInfo)
	}

	const jobId = getRandomId()
	const queueTime = getCurrentTime()

	// Wrap the execution with a bindEnvironment, to make Meteor happy
	const wrappedFcn = async () => {
		// Remove self from pending list
		queueInfo?.pendingJobNames?.shift()

		logger.debug(`syncFunction "${jobContext}"("${queueName}") begun execution - ${jobId}`)

		// Check if we have been waiting a long time
		const waitTime = getCurrentTime() - queueTime
		if (waitTime > ACCEPTABLE_WAIT_TIME) {
			logger.warn(
				`syncFunction "${jobContext}"("${queueName}") waited ${waitTime} ms for other functions to complete before starting: [${waitingOnFunctionsStr}] - ${jobId}`
			)
		}

		try {
			// wait for completion
			const res = await fcn()

			// defer resolve, to release queue lock
			Meteor.defer(() => resolve(res))
		} catch (e) {
			// defer reject, to release queue lock
			Meteor.defer(() => reject(e))
		}

		logger.debug(`syncFunction "${jobContext}"("${queueName}") done - ${jobId}`)
		if (timedOut) {
			const endTime = getCurrentTime()
			logger.error(
				`syncFunction "${jobContext}"("${queueName}") completed after timeout. took ${endTime - queueTime}ms`
			)
		}
	}

	const waitingOnFunctionsStr = queueInfo.pendingJobNames.join(', ')
	queueInfo.pendingJobNames.push(jobContext)

	logger.debug(`syncFunction "${jobContext}"("${queueName}") queued - ${jobId}`)

	return (
		queueInfo.queue
			.add(
				Meteor.bindEnvironment(async () => wrappedFcn()),
				{
					timeout,
					priority,
				}
			)
			.catch((e) => {
				// Ignore the timeout, we simply want to log it and let it finish
				if (e.toString().indexOf('TimeoutError') !== -1) {
					timedOut = true
					logger.error(
						`syncFunction "${jobContext}"("${queueName}") took too long to evaluate. Unblocking the queue`
					)
					return null
				} else {
					// forward error, as this was not expected
					return Promise.reject(e)
				}
			})
			// Finally, return the result we manually tracked
			.then(async () => promise)
	)
}

export async function purgeWorkQueues(): Promise<void> {
	const running: Array<Promise<void>> = []
	for (const queue of workQueues.values()) {
		queue.queue.clear()
		if (queue.queue.pending) {
			running.push(queue.queue.onEmpty())
		}
	}
	await Promise.all(running)
}

function createManualPromise<T>() {
	let resolve: (val: T) => void = () => null
	let reject: (err: Error) => void = () => null
	const promise = new Promise<T>((resolve0, reject0) => {
		resolve = resolve0
		reject = reject0
	})

	return { resolve, reject, promise }
}
