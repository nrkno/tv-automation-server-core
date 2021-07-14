import { Meteor } from 'meteor/meteor'
import { Random } from 'meteor/random'
import { Tracker } from 'meteor/tracker'
import * as _ from 'underscore'
import { lazyIgnore, ProtectedString } from './lib'

/** The ReactiveStore is a Reactive key-value store.
 * Keeps track of when the reactive values aren't in use anymore and automatically cleans them up.
 */
export class ReactiveStore<Key extends ProtectedString<any> | string, Value> {
	private _store: Record<
		string,
		{
			dep: Tracker.Dependency
			computation?: Tracker.Computation
			value: Value
		}
	> = {}
	private _depsToBatchInvalidate: Tracker.Dependency[] = []
	private _name = Random.id()

	constructor(
		private options: {
			/** Delays all Reactive updates with this time [ms] */
			delayUpdateTime?: number
		} = {}
	) {}
	/**
	 * Retrieves a value from the store.
	 * @param key Key to fetch the value from
	 * @param callbackGetValue (Optional) A Reactive function. If the value isn't found in the store, set up a Reactive watch for the value using this callback.
	 */
	getValue(key: Key, callbackGetValue?: () => Value): Value | undefined {
		if (Meteor.isServer) {
			// Server-side we won't use the cache at all.
			return callbackGetValue?.()
		}

		const key0 = key as unknown as string
		let o = this._store[key0]

		if (!o) {
			if (callbackGetValue) {
				// Set up a Reactive watch for the value:

				this._store[key0] = o = {
					dep: new Tracker.Dependency(),
					computation: undefined,
					value: undefined as any,
				}
				o.computation = Tracker.nonreactive(() => {
					// Set up a new Reactive context for the callback:
					return Tracker.autorun(() => {
						// This function is invalidated and re-run whenever the value changes.
						const newValue = callbackGetValue()

						const o = this._store[key0]
						if (o) {
							// Do an additional check whether the returned value actually changed:
							if (!_.isEqual(o.value, newValue)) {
								o.value = newValue
								// Invaludate the dependency:
								this.invalidateDependency(o.dep)
							}
						}
					})
				})
			} else {
				// No callback provided
				return undefined
			}
		}

		if (Tracker.active) {
			Tracker.currentComputation.onStop(() => {
				// Called when the reactive context of the caller of this.getValue is invalidated.

				if (!o.dep.hasDependents()) {
					// If no-one is using it anymore, we should clean it out.
					// Wait a bit, to give it a change to be reused.
					setTimeout(() => {
						const o = this._store[key0]
						if (o) {
							if (!o.dep.hasDependents()) {
								this.removeValue(key)
							}
						}
					}, 2000)
				}
			})
			// Depend, so that the reactive context will be invalidated whenever the value changes.
			o.dep.depend()
		}
		return o.value
	}
	/** Remove a value from the store */
	private removeValue(key: Key) {
		const key0 = key as unknown as string
		const o = this._store[key0]
		if (o) {
			o.computation?.stop()
			delete this._store[key0]
		}
	}
	private invalidateDependency(dep: Tracker.Dependency) {
		if (this.options.delayUpdateTime) {
			// Delay and batch-invalidate all changes that might have come in until then:
			this._depsToBatchInvalidate.push(dep)
			lazyIgnore(
				this._name,
				() => {
					for (const dep of this._depsToBatchInvalidate) {
						dep.changed()
					}
					this._depsToBatchInvalidate = []
				},
				this.options.delayUpdateTime
			)
		} else {
			dep.changed()
		}
	}
	clear() {
		for (const key of Object.keys(this._store)) {
			this.removeValue(key as unknown as Key)
		}
	}
}
