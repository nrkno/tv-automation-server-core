import { Meteor } from 'meteor/meteor'
import { lazyIgnore } from '../../lib/lib'

type PartialOrNull<T> = {
	[P in keyof T]?: T[P] | null
}

type TriggerUpdate<Context> = (newContext: PartialOrNull<Context>) => void
type Context0 = { [key: string]: any }
/**
 * This is an optimization to enable multiple listeners that observes (and manipulates) the same data, to only use one observer and manipulator,
 * then receive the result for each listener.
 *
 * @param identifier identifier, shared between the listeners that use the same observer.
 * @param setupObservers Set up the observers. This is run just 1 times for N listeners, on initialization.
 * @param initializeContext Initialize the Context which is sent into manipulateData. This is run N times for N listeners, on initialization.
 * @param manipulateData Manipulate the data. This is run 1 times for N listeners, per data update. (and on initialization).
 * @param receiveData Receive the manipulated data. This is run N times for N listeners, per data update (and on initialization).
 * @param lazynessDuration (Optional) How long to wait after a change before issueing an update. Default to 3 ms

 */
export function setUpOptimizedObserver<Data extends any[], Context extends Context0>(
	identifier: string,
	setupObservers: (triggerUpdate: TriggerUpdate<Context>) => Meteor.LiveQueryHandle[],
	initializeContext: () => Context,
	manipulateData: (context: Context) => Data,
	receiveData: (data: Data) => void,
	lazynessDuration: number = 3 // ms
) {
	if (!optimizedObservers[identifier]) {
		const triggerUpdate: TriggerUpdate<Context> = (newContext) => {
			for (const key of Object.keys(newContext)) {
				// null means to remove it from the context
				if (newContext[key] !== undefined) context[key] = newContext[key]
			}

			lazyIgnore(
				`optimizedObserver_${identifier}`,
				() => {
					const o = optimizedObservers[identifier]
					if (o) {
						const result = manipulateData(context)

						for (const dataReceiver of o.dataReceivers) {
							dataReceiver(result)
						}
					}
				},
				lazynessDuration // ms
			)
		}
		const context: any = {}
		const observers = setupObservers(triggerUpdate)

		optimizedObservers[identifier] = {
			context: context,
			triggerUpdate: triggerUpdate,
			stop: () => {
				observers.forEach((observer) => observer.stop())
			},
			dataReceivers: [],
		}
		optimizedObservers[identifier].triggerUpdate(initializeContext())
	} else {
		// There is an existing preparedObserver

		//
		const result = manipulateData(optimizedObservers[identifier].context as Context)
		receiveData(result)
	}
	optimizedObservers[identifier].dataReceivers.push(receiveData)

	return {
		stop: () => {
			const o = optimizedObservers[identifier]
			if (o) {
				const i = o.dataReceivers.indexOf(receiveData)
				if (i != -1) {
					o.dataReceivers.splice(i, 1)
				}
				// clean up if empty:
				if (!o.dataReceivers.length) {
					o.stop()
					delete optimizedObservers[identifier]
				}
			}
		},
	}
}
const optimizedObservers: {
	[studioId: string]: {
		context: Context0
		triggerUpdate: TriggerUpdate<unknown>
		stop: () => void
		dataReceivers: Function[]
	}
} = {}
