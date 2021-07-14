import { Meteor } from 'meteor/meteor'
import '../../__mocks__/_extendJest'
import { testInFiber, runAllTimers, runTimersUntilNow } from '../../__mocks__/helpers/jest'
import { syncFunction, Callback } from '../codeControl'
import { tic, toc, makePromise, waitTime } from '../../lib/lib'
import { useControllableDefer, useNextTickDefer } from '../../__mocks__/meteor'
import { setupDefaultRundownPlaylist, setupDefaultStudioEnvironment } from '../../__mocks__/helpers/database'
import {
	PlayoutLockFunctionPriority,
	runPlayoutOperationWithLockFromStudioOperation,
} from '../api/playout/lockFunction'
import { RundownPlaylist, RundownPlaylists } from '../../lib/collections/RundownPlaylists'

const TIME_FUZZY = 200
const takesALongTimeInner = Meteor.wrapAsync(function takesALongTime(name: string, cb: Callback) {
	setTimeout(() => {
		cb(null, 'result yo ' + name)
	}, 300 - 5) // subtract to account for slowness in Jest
})
describe('codeControl rundown', () => {
	beforeEach(() => {
		jest.useFakeTimers()
	})
	testInFiber('rundownSyncFunction', async () => {
		const env = await setupDefaultStudioEnvironment()
		const { playlistId } = setupDefaultRundownPlaylist(env)
		const playlist = RundownPlaylists.findOne(playlistId) as RundownPlaylist
		expect(playlist).toBeTruthy()

		const sync1 = (name: string, priority: PlayoutLockFunctionPriority) => {
			return runPlayoutOperationWithLockFromStudioOperation(
				'testRundownSyncFn',
				{ _studioId: playlist.studioId },
				playlist,
				priority,
				() => takesALongTimeInner(name)
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

	afterAll(() => {
		useNextTickDefer()
	})

	const takesALongTime = syncFunction((name: string) => {
		return takesALongTimeInner(name)
	}, 'takesALongTime')

	testInFiber('syncFunction, 1 queue', () => {
		// Running a syncFunction in a queue

		const res: any[] = []

		Meteor.setTimeout(() => {
			res.push(takesALongTime('run0'))
		}, 10)
		Meteor.setTimeout(() => {
			res.push(takesALongTime('run0'))
		}, 30)

		jest.advanceTimersByTime(350)
		// only first task should complete
		expect(res).toEqual(['result yo run0'])

		jest.advanceTimersByTime(300)
		// both tasks should complete
		expect(res).toEqual(['result yo run0', 'result yo run0'])
	})

	testInFiber('syncFunction, 2 queues', () => {
		// Running in two parallel queues, run0 and run1:

		const res: any[] = []
		// First, just run them sequentially
		Meteor.setTimeout(() => {
			res.push(takesALongTime('run0'))
			res.push(takesALongTime('run0'))
			res.push(takesALongTime('run1'))
			res.push(takesALongTime('run1'))
		}, 10)

		jest.advanceTimersByTime(350)
		expect(res).toEqual(['result yo run0'])
		jest.advanceTimersByTime(300)
		expect(res).toEqual(['result yo run0', 'result yo run0'])
		jest.advanceTimersByTime(300)
		expect(res).toEqual(['result yo run0', 'result yo run0', 'result yo run1'])
		jest.advanceTimersByTime(300)
		expect(res).toEqual(['result yo run0', 'result yo run0', 'result yo run1', 'result yo run1'])

		// Run them in parallell, the 2 queues should kick in now:
		res.length = 0

		let ps
		Meteor.setTimeout(() => {
			ps = [
				makePromise(() => res.push(takesALongTime('run0'))),
				makePromise(() => res.push(takesALongTime('run0'))),
				makePromise(() => res.push(takesALongTime('run1'))),
				makePromise(() => res.push(takesALongTime('run1'))),
			]
		}, 10)
		jest.advanceTimersByTime(0)
		expect(res).toHaveLength(0)
		expect(ps).toBeUndefined()
		jest.advanceTimersByTime(15)
		expect(ps).toHaveLength(4)

		jest.advanceTimersByTime(350)
		expect(res).toMatchObject(['result yo run0', 'result yo run1'])

		jest.advanceTimersByTime(300)
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
	testInFiber('syncFunction, anonymous', async () => {
		// Make sure that anonymous syncFunctions work
		const fcn0 = syncFunction(() => {
			waitTime(300 - 5)
			return 'a'
		}, 'check anonymous sync functions a')
		const fcn1 = syncFunction(() => {
			waitTime(300 - 5)
			return 'b'
		}, 'check anonymous sync functions b')
		const res: any[] = []

		let ps
		Meteor.setTimeout(() => {
			ps = [
				makePromise(() => res.push(fcn0())),
				makePromise(() => res.push(fcn0())),
				makePromise(() => res.push(fcn1())),
				makePromise(() => res.push(fcn1())),
			]
		}, 10)
		jest.advanceTimersByTime(0)
		expect(res).toHaveLength(0)

		jest.advanceTimersByTime(600)
		await runAllTimers()
		await Promise.all(ps)

		expect(res).toMatchObject(['a', 'b', 'a', 'b'])
	})
	testInFiber('syncFunction, anonymous with arguments', async () => {
		const fcn = syncFunction((a: number) => {
			waitTime(300 - 5)
			return a
		}, 'anonymous with arguments')
		const res: any[] = []
		let ps
		Meteor.setTimeout(() => {
			ps = [
				makePromise(() => res.push(fcn(1))),
				makePromise(() => res.push(fcn(1))),
				makePromise(() => res.push(fcn(2))),
				makePromise(() => res.push(fcn(3))),
			]
			// ^ This should cause 3 queueus to run, the longest queue being 200 ms
		}, 10)

		jest.advanceTimersByTime(0)
		expect(res).toHaveLength(0)

		jest.advanceTimersByTime(600)
		await runAllTimers()
		await Promise.all(ps)

		expect(res).toMatchObject([1, 2, 3, 1])
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
		testInFiber('syncFunction, too long running', () => {
			const neverEnding = syncFunction(
				() => {
					waitTime(1000) // 1s, is too long and should cause a timeout
					return 'a'
				},
				'too long running',
				undefined,
				500
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
