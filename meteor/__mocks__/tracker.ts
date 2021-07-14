/**
 * This is a very rudimentary mock of a Meteor Tracker. It is quite likely buggy and may not accurately represent
 * the order in which flags are turned on/off, since that's not clear from Meteor documentation.
 * Also, all of the Tracker.flush() and related methods are not implemented.
 */

export namespace TrackerMock {
	type ComputationCallback = (computation: Computation) => void
	type AutorunCallback = (computation: Computation) => void
	// eslint-disable-next-line prefer-const
	export let currentComputation: Computation | null = null
	// eslint-disable-next-line prefer-const
	export let active: boolean = false

	export class Dependency {
		private dependents: Computation[] = []
		public changed = (): void => {
			this.dependents.forEach((comp) => comp.invalidate())
		}
		public depend = (): void => {
			if (TrackerMock.currentComputation) {
				const comp = TrackerMock.currentComputation
				if (comp) {
					const length = this.dependents.push(comp)
					comp.onStop(() => {
						this.dependents.splice(length - 1, 1)
					})
				}
			}
		}
		public hasDependents = (): boolean => {
			return this.dependents.length > 0
		}
	}

	export class Computation {
		private onInvalidateClbs: Array<ComputationCallback> = []
		private onStopClbs: Array<ComputationCallback> = []
		private func: AutorunCallback
		private parentComputation: Computation | null = null
		stopped: boolean = false
		invalidated: boolean = false
		firstRun: boolean = true

		constructor(computedFunc: AutorunCallback, parentComputation: Computation | null, _onError?: (e: any) => void) {
			this.parentComputation = parentComputation
			this.firstRun = true
			this.func = computedFunc
			this.runFunc()
			this.firstRun = false
		}

		private runFunc = () => {
			const trackBuf = TrackerMock.currentComputation
			TrackerMock.currentComputation = this
			TrackerMock.active = !!TrackerMock.currentComputation
			this.func(this)
			TrackerMock.currentComputation = trackBuf
			TrackerMock.active = !!TrackerMock.currentComputation
		}
		private runAll = (clbs: Array<ComputationCallback>) => {
			clbs.forEach((clb) => clb(this))
		}
		public stop = () => {
			this.stopped = true
			this.runAll(this.onInvalidateClbs)
			this.onInvalidateClbs.length = 0
			this.runAll(this.onStopClbs)
			this.onStopClbs.length = 0
		}
		public invalidate = () => {
			this.invalidated = true
			if (!this.parentComputation) {
				this.runAll(this.onInvalidateClbs)
				this.runFunc()
				this.invalidated = false
			} else {
				this.stop()
				this.parentComputation.invalidate()
			}
		}
		public onInvalidate = (clb: ComputationCallback) => {
			this.onInvalidateClbs.push(clb)
		}
		public onStop = (clb: ComputationCallback) => {
			this.onStopClbs.push(clb)
		}
	}

	export function autorun(runFunc: AutorunCallback, options = {}): TrackerMock.Computation {
		if (Object.keys(options).length > 0) {
			throw new Error(`Tracker.autorun using unimplemented options: ${Object.keys(options).join(', ')}`)
		}

		return new TrackerMock.Computation(runFunc, TrackerMock.currentComputation)
	}
	export function flush() {
		throw new Error(`Tracker.flush() is not implemented in the mock Tracker`)
	}
	export function nonreactive<T>(runFunc: () => T): T {
		const comp = TrackerMock.currentComputation
		TrackerMock.currentComputation = null
		TrackerMock.active = !!TrackerMock.currentComputation
		const result = runFunc()
		TrackerMock.currentComputation = comp
		TrackerMock.active = !!TrackerMock.currentComputation
		return result
	}
	export function inFlush(): boolean {
		throw new Error(`Tracker.inFlush() is not implemented in the mock Tracker`)
	}
	export function onInvalidate(clb: ComputationCallback) {
		if (!TrackerMock.currentComputation) {
			throw new Error('Tracker.onInvalidate requires a currentComputation')
		}

		TrackerMock.currentComputation.onInvalidate(clb)
	}
	export function afterFlush(_clb: Function) {
		throw new Error(`Tracker.afterFlush() is not implemented in the mock Tracker`)
	}
}

export function setup() {
	return {
		Tracker: TrackerMock,
	}
}
