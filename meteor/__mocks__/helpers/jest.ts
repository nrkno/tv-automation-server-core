/* eslint-disable jest/no-export, jest/valid-title, jest/expect-expect, jest/no-focused-tests */
import { runInFiber } from '../Fibers'

export function beforeAllInFiber(fcn: () => void | Promise<void>, timeout?: number) {
	beforeAll(async () => {
		await runInFiber(fcn)
	}, timeout)
}
export function afterAllInFiber(fcn: () => void | Promise<void>, timeout?: number) {
	afterAll(async () => {
		await runInFiber(fcn)
	}, timeout)
}
export function beforeEachInFiber(fcn: () => void | Promise<void>, timeout?: number) {
	beforeEach(async () => {
		await runInFiber(fcn)
	}, timeout)
}
export function afterEachInFiber(fcn: () => void | Promise<void>, timeout?: number) {
	afterEach(async () => {
		await runInFiber(fcn)
	}, timeout)
}

export function testInFiber(testName: string, fcn: () => void | Promise<void>, timeout?: number) {
	test(
		testName,
		async () => {
			await runInFiber(fcn)
		},
		timeout
	)
}

export function testInFiberOnly(testName: string, fcn: () => void | Promise<void>, timeout?: number) {
	// eslint-disable-next-line custom-rules/no-focused-test
	test.only(
		testName,
		async () => {
			await runInFiber(fcn)
		},
		timeout
	)
}
const orgSetTimeout = setTimeout
export async function runAllTimers() {
	// Run all timers, and wait, multiple times.
	// This is to allow timers AND internal promises to resolve in inner functions
	for (let i = 0; i < 50; i++) {
		jest.runOnlyPendingTimers()
		await new Promise((resolve) => orgSetTimeout(resolve, 0))
	}
}

export async function runTimersUntilNow() {
	// Run all timers, and wait, multiple times.
	// This is to allow timers AND internal promises to resolve in inner functions
	for (let i = 0; i < 50; i++) {
		jest.advanceTimersByTime(0)
		await new Promise((resolve) => orgSetTimeout(resolve, 0))
	}
}

// testInFiber.only = testInFiberOnly
