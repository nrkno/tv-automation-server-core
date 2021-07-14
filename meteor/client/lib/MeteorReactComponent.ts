import { Tracker } from 'meteor/tracker'
import * as React from 'react'
import { stringifyObjects } from '../../lib/lib'
import { Meteor } from 'meteor/meteor'
import { PubSub } from '../../lib/api/pubsub'
export class MeteorReactComponent<IProps, IState = {}> extends React.Component<IProps, IState> {
	private _subscriptions: { [id: string]: Meteor.SubscriptionHandle } = {}
	private _computations: Array<Tracker.Computation> = []
	constructor(props, context?: any) {
		super(props, context)
	}

	componentWillUnmount() {
		this._cleanUp()
	}
	subscribe(name: PubSub, ...args: any[]): Meteor.SubscriptionHandle {
		// @ts-ignore
		return Tracker.nonreactive(() => {
			// let id = name + '_' + JSON.stringify(args.join())
			const id = name + '_' + stringifyObjects(args)

			const callbacks = {
				onError: console.error,
			}
			if (Tracker.active) {
				// if in a reactive context, Meteor will keep track of duplicates of subscriptions

				const sub = Meteor.subscribe(name, ...args, callbacks)
				this._subscriptions[id] = sub
				return sub
			} else {
				if (this._subscriptions[id]) {
					// already subscribed to that
					return this._subscriptions[id]
				} else {
					const sub = Meteor.subscribe(name, ...args, callbacks)
					this._subscriptions[id] = sub
					return sub
				}
			}
		})
	}
	autorun(cb: (computation: Tracker.Computation) => void, options?: any): Tracker.Computation {
		const computation = Tracker.nonreactive(() => {
			return Tracker.autorun(cb, options)
		})
		this._computations.push(computation)
		return computation
	}
	subscriptionsReady(): boolean {
		const values = Object.values(this._subscriptions)
		for (let i = 0; i < values.length; i++) {
			if (!values[i].ready()) {
				return false
			}
		}
		return true
	}
	subscriptions(): Array<Meteor.SubscriptionHandle> {
		return Object.values(this._subscriptions)
	}
	protected _cleanUp() {
		const subscriptions = Object.values(this._subscriptions)
		for (let i = 0; i < subscriptions.length; i++) {
			// Wait a little bit with unsubscribing, maybe the next view is going to subscribe to the same data as well?
			// In that case, by unsubscribing directly, we'll get a flicker in the view because of the unloading+loading
			Meteor.setTimeout(() => {
				subscriptions[i].stop()
			}, 100)
		}
		for (let i = 0; i < this._computations.length; i++) {
			this._computations[i].stop()
		}
	}
}
