import { testInFiber } from '../../../../__mocks__/helpers/jest'
import { Tracker } from 'meteor/tracker'
import { memoizedIsolatedAutorun, slowDownReactivity } from '../reactiveDataHelper'
import { sleep } from '../../../../lib/lib'

describe('client/lib/reactiveData/reactiveDataHelper', () => {
	describe('memoizedIsolatedAutorun', () => {
		testInFiber('it returns the result of the autorun function', () => {
			const dep = new Tracker.Dependency()
			const result0 = memoizedIsolatedAutorun(() => {
				dep.depend()
				return 'result0'
			}, 'getResult0')
			expect(result0).toBe('result0')
		})
		testInFiber('it reruns when the dependency is changed', () => {
			let runCount = 0
			const dep = new Tracker.Dependency()
			const result1 = memoizedIsolatedAutorun(() => {
				runCount++
				dep.depend()
				return 'result1'
			}, 'getResult1')
			expect(result1).toBe('result1')
			expect(runCount).toBe(1)
			dep.changed()
			expect(runCount).toBe(2)
		})
		testInFiber(
			"it invalidates the parent computation if it's dependency has changed and the returned result is different",
			() => {
				let runCount0 = 0
				let runCount1 = 0
				const dep0 = new Tracker.Dependency()
				const dep1 = new Tracker.Dependency()
				let innerResult = ''
				Tracker.autorun(() => {
					runCount0++
					dep0.depend()
					innerResult = memoizedIsolatedAutorun(() => {
						runCount1++
						dep1.depend()
						return 'result2_' + runCount1
					}, 'getResult2')
				})
				expect(innerResult).toBe('result2_1')
				expect(runCount0).toBe(1)
				expect(runCount1).toBe(1)
				dep1.changed()
				expect(innerResult).toBe('result2_2')
				expect(runCount0).toBe(2)
				expect(runCount1).toBe(2)
			}
		)
		testInFiber(
			"it doesn't invalidate the parent computation if it's dependency has changed and the returned result is the same",
			() => {
				let runCount0 = 0
				let runCount1 = 0
				const dep0 = new Tracker.Dependency()
				const dep1 = new Tracker.Dependency()
				Tracker.autorun(() => {
					runCount0++
					dep0.depend()
					memoizedIsolatedAutorun(() => {
						runCount1++
						dep1.depend()
						return 'result3'
					}, 'getResult3')
				})
				expect(runCount0).toBe(1)
				expect(runCount1).toBe(1)
				dep1.changed()
				expect(runCount0).toBe(1)
				expect(runCount1).toBe(2)
			}
		)
		testInFiber(
			"it doesn't rerun if the dependency is not changed, even if the outer computation is invalidated",
			() => {
				let runCount0 = 0
				let runCount1 = 0
				const dep0 = new Tracker.Dependency()
				const dep1 = new Tracker.Dependency()
				Tracker.autorun(() => {
					runCount0++
					dep0.depend()
					memoizedIsolatedAutorun(() => {
						runCount1++
						dep1.depend()
						return 'result4'
					}, 'getResult4')
				})
				expect(runCount0).toBe(1)
				expect(runCount1).toBe(1)
				dep0.changed()
				expect(runCount0).toBe(2)
				expect(runCount1).toBe(1)
			}
		)
	})

	describe('slowDownReactivity', () => {
		testInFiber('it invalidates the parent computation immediately, when delay === 0', () => {
			let runCount = 0
			const dep = new Tracker.Dependency()
			let result = ''
			Tracker.autorun(() => {
				runCount++
				result = slowDownReactivity(() => {
					dep.depend()
					return 'test' + runCount
				}, 0)
			})

			expect(runCount).toBe(1)
			expect(result).toBe('test1')
			dep.changed()
			expect(runCount).toBe(2)
			expect(result).toBe('test2')
		})
		testInFiber("it invalidates the computation after a delay, if it's dependency changes", async () => {
			let runCount = 0
			const dep = new Tracker.Dependency()
			Tracker.autorun(() => {
				runCount++
				slowDownReactivity(() => {
					dep.depend()
				}, 200)
			})

			expect(runCount).toBe(1)
			dep.changed()
			expect(runCount).toBe(1)

			await sleep(100)
			expect(runCount).toBe(1)

			await sleep(200)
			expect(runCount).toBe(2)
		})
		testInFiber(
			'it invalidates once after a delay, even when there are additional invalidations in the delay period',
			async () => {
				let runCount = 0
				const dep = new Tracker.Dependency()
				Tracker.autorun(() => {
					runCount++
					slowDownReactivity(() => {
						dep.depend()
					}, 200)
				})

				expect(runCount).toBe(1)
				dep.changed()
				expect(runCount).toBe(1)
				await sleep(100)
				expect(runCount).toBe(1)
				dep.changed()

				await sleep(50)
				dep.changed()

				await sleep(100)
				expect(runCount).toBe(2)

				await sleep(400)
				expect(runCount).toBe(2)
			}
		)
		testInFiber('it cleans up after itself when parent computation is invalidated', async () => {
			let runCount0 = 0
			let runCount1 = 0
			const dep0 = new Tracker.Dependency()
			const dep1 = new Tracker.Dependency()
			Tracker.autorun(() => {
				runCount0++
				dep0.depend()
				slowDownReactivity(
					() => {
						runCount1++
						dep1.depend()
					},
					runCount0 === 1 ? 200 : 0
				)
			})

			// both autoruns have run
			expect(runCount0).toBe(1)
			expect(runCount1).toBe(1)

			// invalidate the inner dependency (Point A)
			dep1.changed()

			// the inner autorun has run, but the outer one hasn't been invalidated yet
			expect(runCount0).toBe(1)
			expect(runCount1).toBe(2)

			await sleep(100)
			// the inner autorun has run, but the outer one still hasn't been invalidated yet
			expect(runCount0).toBe(1)
			expect(runCount1).toBe(2)

			// invalidate the outer dependency
			dep0.changed()
			// the outer autorun has run and the inner autorun has run as well
			expect(runCount0).toBe(2)
			expect(runCount1).toBe(3)

			await sleep(500)
			// the original invalidation (set up in Point A) has been cancelled and did not cause an extra re-run
			expect(runCount0).toBe(2)
			expect(runCount1).toBe(3)
		})
	})
})
