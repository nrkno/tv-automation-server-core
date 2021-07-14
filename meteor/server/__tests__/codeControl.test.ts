import { Meteor } from 'meteor/meteor'
import '../../__mocks__/_extendJest'
import { testInFiber, runTimersUntilNow, runAllTimers } from '../../__mocks__/helpers/jest'
import { purgeWorkQueues, pushWorkToQueue } from '../codeControl'
import { tic, toc, waitTime, sleep, waitForPromise } from '../../lib/lib'
import { useControllableDefer, useNextTickDefer } from '../../__mocks__/meteor'
import { setupDefaultRundownPlaylist, setupDefaultStudioEnvironment } from '../../__mocks__/helpers/database'
import {
	PlayoutLockFunctionPriority,
	runPlayoutOperationWithLockFromStudioOperation,
} from '../api/playout/lockFunction'
import { RundownPlaylist, RundownPlaylists } from '../../lib/collections/RundownPlaylists'

const TIME_FUZZY = 200
const takesALongTimeInner = Meteor.wrapAsync(function takesALongTime(
	name: string,
	cb: (err: string | null, val?: string) => void
) {
	setTimeout(() => {
		cb(null, 'result yo ' + name)
	}, 300) // subtract to account for slowness in Jest
})
async function takesALongTimeInnerAsync(name: string) {
	await sleep(300) // subtract to account for slowness in Jest
	return 'result yo ' + name
}
// function takesALongTimeInnerFiber(name: string) {
// 	waitForPromise(sleep(300)) // subtract to account for slowness in Jest
// 	return 'result yo ' + name
// }

describe('codeControl rundown', () => {
	beforeEach(() => {
		jest.useFakeTimers()
		useControllableDefer()
	})

	afterEach(async () => {
		await purgeWorkQueues()
	})

	afterAll(() => {
		useNextTickDefer()
	})
	testInFiber('playout lock function - fiber', async () => {
		const env = await setupDefaultStudioEnvironment()
		const { playlistId } = setupDefaultRundownPlaylist(env)
		const playlist = RundownPlaylists.findOne(playlistId) as RundownPlaylist
		expect(playlist).toBeTruthy()

		const sync1 = (name: string, priority: PlayoutLockFunctionPriority) => {
			return waitForPromise(
				runPlayoutOperationWithLockFromStudioOperation(
					'testRundownSyncFn',
					{ _studioId: playlist.studioId },
					playlist,
					priority,
					async () => takesALongTimeInner(name)
				)
			)
		}

		const res: any[] = []
		Meteor.setTimeout(() => {
			res.push(sync1('ingest0', PlayoutLockFunctionPriority.MISC))
		}, 10)
		Meteor.setTimeout(() => {
			res.push(sync1('ingest1', PlayoutLockFunctionPriority.MISC))
		}, 30)
		Meteor.setTimeout(() => {
			res.push(sync1('playout0', PlayoutLockFunctionPriority.USER_PLAYOUT))
		}, 50)

		jest.advanceTimersByTime(350)
		await runTimersUntilNow()
		expect(res).toEqual(['result yo ingest0'])

		jest.advanceTimersByTime(300)
		await runTimersUntilNow()
		expect(res).toEqual([
			'result yo ingest0', // Pushed to queue first
			'result yo playout0', // High priority bumps it above ingest1
		])

		jest.advanceTimersByTime(300)
		await runTimersUntilNow()
		expect(res).toEqual([
			'result yo ingest0', // Pushed to queue first
			'result yo playout0', // High priority bumps it above ingest1
			'result yo ingest1',
		])
	})
	testInFiber('playout lock function - async', async () => {
		const env = await setupDefaultStudioEnvironment()
		const { playlistId } = setupDefaultRundownPlaylist(env)
		const playlist = RundownPlaylists.findOne(playlistId) as RundownPlaylist
		expect(playlist).toBeTruthy()

		const sync1 = (name: string, priority: PlayoutLockFunctionPriority) => {
			return waitForPromise(
				runPlayoutOperationWithLockFromStudioOperation(
					'testRundownSyncFn',
					{ _studioId: playlist.studioId },
					playlist,
					priority,
					async () => takesALongTimeInnerAsync(name)
				)
			)
		}

		const res: any[] = []
		Meteor.setTimeout(() => {
			res.push(sync1('ingest0', PlayoutLockFunctionPriority.MISC))
		}, 10)
		Meteor.setTimeout(() => {
			res.push(sync1('ingest1', PlayoutLockFunctionPriority.MISC))
		}, 30)
		Meteor.setTimeout(() => {
			res.push(sync1('playout0', PlayoutLockFunctionPriority.USER_PLAYOUT))
		}, 50)

		jest.advanceTimersByTime(350)
		await runTimersUntilNow()
		expect(res).toEqual(['result yo ingest0'])

		jest.advanceTimersByTime(300)
		await runTimersUntilNow()
		expect(res).toEqual([
			'result yo ingest0', // Pushed to queue first
			'result yo playout0', // High priority bumps it above ingest1
		])

		jest.advanceTimersByTime(300)
		await runTimersUntilNow()
		expect(res).toEqual([
			'result yo ingest0', // Pushed to queue first
			'result yo playout0', // High priority bumps it above ingest1
			'result yo ingest1',
		])
	})
})
describe('codeControl', () => {
	beforeEach(() => {
		jest.useFakeTimers()
		useControllableDefer()
	})

	afterEach(async () => {
		await Promise.all([purgeWorkQueues(), runAllTimers])
	})

	afterAll(() => {
		useNextTickDefer()
	})

	// const takesALongTime = syncFunction((name: string) => {
	// 	return takesALongTimeInner(name)
	// }, 'takesALongTime')

	testInFiber('pushWorkToQueue, 1 queue promise', async () => {
		// Running a syncFunction in a queue

		const res: string[] = []
		void pushWorkToQueue('run0', '1', async () => takesALongTimeInner('run0')).then((r) => res.push(r))
		void pushWorkToQueue('run0', '2', async () => takesALongTimeInner('run0')).then((r) => res.push(r))

		expect(res).toHaveLength(0)

		jest.advanceTimersByTime(350)
		await runTimersUntilNow()
		// only first task should complete
		expect(res).toEqual(['result yo run0'])

		jest.advanceTimersByTime(300)
		await runTimersUntilNow()
		// both tasks should complete
		expect(res).toEqual(['result yo run0', 'result yo run0'])
	})

	testInFiber('pushWorkToQueue, 1 queue async', async () => {
		// Running a syncFunction in a queue

		const res: string[] = []
		void pushWorkToQueue('run0', '1', async () => takesALongTimeInnerAsync('run0')).then((r) => res.push(r))
		void pushWorkToQueue('run0', '2', async () => takesALongTimeInnerAsync('run0')).then((r) => res.push(r))

		expect(res).toHaveLength(0)

		jest.advanceTimersByTime(350)
		await runTimersUntilNow()
		// only first task should complete
		expect(res).toEqual(['result yo run0'])

		jest.advanceTimersByTime(300)
		await runTimersUntilNow()
		// both tasks should complete
		expect(res).toEqual(['result yo run0', 'result yo run0'])
	})

	testInFiber('pushWorkToQueue, 1 queue fiber inner', async () => {
		// Running a syncFunction in a queue

		const res: string[] = []

		void pushWorkToQueue('run0', '1', async () => waitForPromise(takesALongTimeInnerAsync('run0'))).then((r) =>
			res.push(r)
		)
		void pushWorkToQueue('run0', '2', async () => waitForPromise(takesALongTimeInnerAsync('run0'))).then((r) =>
			res.push(r)
		)

		expect(res).toHaveLength(0)

		jest.advanceTimersByTime(350)
		await runTimersUntilNow()
		// only first task should complete
		expect(res).toEqual(['result yo run0'])

		jest.advanceTimersByTime(300)
		await runTimersUntilNow()
		// both tasks should complete
		expect(res).toEqual(['result yo run0', 'result yo run0'])
	})

	testInFiber('pushWorkToQueue, 1 queue fiber outer', async () => {
		// Running a syncFunction in a queue

		const res: string[] = []

		Meteor.defer(() => {
			const v = waitForPromise(pushWorkToQueue('run0', '1', async () => takesALongTimeInnerAsync('run0')))
			res.push(v)
		})
		Meteor.defer(() => {
			const v = waitForPromise(pushWorkToQueue('run0', '2', async () => takesALongTimeInnerAsync('run0')))
			res.push(v)
		})

		expect(res).toHaveLength(0)

		jest.advanceTimersByTime(350)
		await runTimersUntilNow()
		// only first task should complete
		expect(res).toEqual(['result yo run0'])

		jest.advanceTimersByTime(300)
		await runTimersUntilNow()
		// both tasks should complete
		expect(res).toEqual(['result yo run0', 'result yo run0'])
	})

	testInFiber('pushWorkToQueue, 1 queue fiber both', async () => {
		// Running a syncFunction in a queue

		const res: string[] = []

		Meteor.defer(() => {
			const v = waitForPromise(
				pushWorkToQueue('run0', '1', async () => waitForPromise(takesALongTimeInnerAsync('run0')))
			)
			res.push(v)
		})
		Meteor.defer(() => {
			const v = waitForPromise(
				pushWorkToQueue('run0', '2', async () => waitForPromise(takesALongTimeInnerAsync('run0')))
			)
			res.push(v)
		})

		expect(res).toHaveLength(0)

		jest.advanceTimersByTime(350)
		await runTimersUntilNow()
		// only first task should complete
		expect(res).toEqual(['result yo run0'])

		jest.advanceTimersByTime(300)
		await runTimersUntilNow()
		// both tasks should complete
		expect(res).toEqual(['result yo run0', 'result yo run0'])
	})

	testInFiber('pushWorkToQueue, 2 queues', async () => {
		// Running in two parallel queues, run0 and run1:

		const res: any[] = []
		async function doIt(name: string): Promise<void> {
			return pushWorkToQueue(name, '1', async () => takesALongTimeInnerAsync(name)).then((v) => {
				res.push(v)
			})
		}

		// First, just run them sequentially
		Meteor.setTimeout(() => {
			waitForPromise(doIt('run0'))
			waitForPromise(doIt('run0'))
			waitForPromise(doIt('run1'))
			waitForPromise(doIt('run1'))
		}, 10)

		jest.advanceTimersByTime(350)
		await runTimersUntilNow()
		expect(res).toEqual(['result yo run0'])
		jest.advanceTimersByTime(300)
		await runTimersUntilNow()
		expect(res).toEqual(['result yo run0', 'result yo run0'])
		jest.advanceTimersByTime(300)
		await runTimersUntilNow()
		expect(res).toEqual(['result yo run0', 'result yo run0', 'result yo run1'])
		jest.advanceTimersByTime(300)
		await runTimersUntilNow()
		expect(res).toEqual(['result yo run0', 'result yo run0', 'result yo run1', 'result yo run1'])

		// Run them in parallell, the 2 queues should kick in now:
		res.length = 0

		let ps
		Meteor.setTimeout(() => {
			ps = [
				// queue run0
				doIt('run0'),
				doIt('run0'),
				// queue run1
				doIt('run1'),
				doIt('run1'),
			]
		}, 10)
		jest.advanceTimersByTime(0)
		await runTimersUntilNow()
		expect(res).toHaveLength(0)
		expect(ps).toBeUndefined()
		jest.advanceTimersByTime(15)
		await runTimersUntilNow()
		expect(ps).toHaveLength(4)

		jest.advanceTimersByTime(350)
		await runTimersUntilNow()
		expect(res).toMatchObject(['result yo run0', 'result yo run1'])

		jest.advanceTimersByTime(300)
		await runTimersUntilNow()
		expect(res).toMatchObject(['result yo run0', 'result yo run1', 'result yo run0', 'result yo run1'])
	})
	describe('waitTime', () => {
		let $nowOriginal
		let $setTimeoutOriginal
		beforeAll(() => {
			let mockTime = 0
			$nowOriginal = Date.now
			$setTimeoutOriginal = Meteor.setTimeout
			Date.now = function () {
				return mockTime
			}
			Meteor.setTimeout = function (fnc, delay) {
				return $setTimeoutOriginal(() => {
					mockTime += delay
					fnc()
				}, delay)
			}
		})
		afterAll(() => {
			Date.now = $nowOriginal
			Meteor.setTimeout = $setTimeoutOriginal
		})

		testInFiber('waitTime', async () => {
			tic()

			let tocTime
			Meteor.setTimeout(() => {
				waitTime(700)
				tocTime = toc()
			}, 10)

			jest.advanceTimersByTime(50)
			expect(tocTime).toBeUndefined()
			jest.advanceTimersByTime(1000)
			await runAllTimers()

			expect(tocTime).toBeFuzzy(700, TIME_FUZZY)
		})
	})
	describe('timeouts', () => {
		beforeEach(() => {
			jest.useRealTimers()
			useControllableDefer()
		})

		afterAll(() => {
			jest.useFakeTimers()
			useNextTickDefer()
		})
		testInFiber('pushWorkToQueue, too long running', () => {
			const neverEnding = () =>
				waitForPromise(
					pushWorkToQueue(
						'queue',
						'too long running',
						async () => {
							await sleep(1000) // 1s, is too long and should cause a timeout
							return 'a'
						},
						undefined,
						500
					)
				) // a timeout of 500 ms

			tic()

			let a0 = ''
			let a1 = ''
			let error = ''
			try {
				Meteor.setTimeout(() => {
					a1 = neverEnding() // when calling this, it should trace an error that the  and still start this one
				}, 550)
				a0 = neverEnding()
			} catch (e) {
				error = e
			}

			expect(toc()).toBeFuzzy(1000, TIME_FUZZY)

			expect(a0).toEqual('a')
			expect(a1).toEqual('')
			expect(error).toEqual('')

			waitTime(1000)
			expect(toc()).toBeFuzzy(2000, TIME_FUZZY)

			expect(a0).toEqual('a')
			expect(a1).toEqual('a')
			expect(error).toEqual('')
		})
	})
})
