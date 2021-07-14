/* eslint-disable react/prefer-stateless-function */

import React, { useState, useEffect } from 'react'
import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import { Tracker } from 'meteor/tracker'
import { withTranslation, WithTranslation } from 'react-i18next'
import { MeteorReactComponent } from '../MeteorReactComponent'
import { PubSub } from '../../../lib/api/pubsub'
import { stringifyObjects } from '../../../lib/lib'

const globalTrackerQueue: Array<Function> = []
let globalTrackerTimestamp: number | undefined = undefined
let globalTrackerTimeout: number | undefined = undefined

const METEOR_DATA_DEBOUNCE = 120
const METEOR_DATA_DEBOUNCE_STALE = 200

// A class to keep the state and utility methods needed to manage
// the Meteor data for a component.
class MeteorDataManager {
	component: any
	computation: any
	oldData: any
	queueTrackerUpdates: boolean

	constructor(component, queueTrackerUpdates: boolean) {
		this.component = component
		this.computation = null
		this.oldData = null
		this.queueTrackerUpdates = queueTrackerUpdates || false
	}

	dispose() {
		if (this.computation) {
			this.computation.stop()
			this.computation = null
		}
	}

	static runUpdates() {
		clearTimeout(globalTrackerTimeout)
		globalTrackerTimeout = undefined
		globalTrackerTimestamp = undefined
		globalTrackerQueue.forEach((func) => func())
		globalTrackerQueue.length = 0
	}

	static enqueueUpdate(func: Function) {
		if (globalTrackerTimeout !== undefined) {
			clearTimeout(globalTrackerTimeout)
			globalTrackerTimeout = undefined
		}
		if (globalTrackerTimestamp === undefined) {
			globalTrackerTimestamp = Date.now()
		}
		globalTrackerQueue.push(func)
		if (Date.now() - globalTrackerTimestamp < METEOR_DATA_DEBOUNCE_STALE) {
			globalTrackerTimeout = Meteor.setTimeout(MeteorDataManager.runUpdates, METEOR_DATA_DEBOUNCE)
		} else {
			MeteorDataManager.runUpdates()
		}
	}

	calculateData() {
		const component = this.component

		if (!component.getMeteorData) {
			return null
		}

		// When rendering on the server, we don't want to use the Tracker.
		// We only do the first rendering on the server so we can get the data right away
		if (Meteor.isServer) {
			return component.getMeteorData()
		}

		if (this.computation) {
			this.computation.stop()
			this.computation = null
		}

		let data
		// Use Tracker.nonreactive in case we are inside a Tracker Computation.
		// This can happen if someone calls `ReactDOM.render` inside a Computation.
		// In that case, we want to opt out of the normal behavior of nested
		// Computations, where if the outer one is invalidated or stopped,
		// it stops the inner one.
		this.computation = Tracker.nonreactive(() =>
			Tracker.autorun((c) => {
				if (c.firstRun) {
					const savedSetState = component.setState
					try {
						component.setState = () => {
							throw new Error(
								"Can't call `setState` inside `getMeteorData` as this could " +
									'cause an endless loop. To respond to Meteor data changing, ' +
									'consider making this component a "wrapper component" that ' +
									'only fetches data and passes it in as props to a child ' +
									'component. Then you can use `componentWillReceiveProps` in ' +
									'that child component.'
							)
						}

						data = component.getMeteorData()
					} finally {
						component.setState = savedSetState
					}
				} else {
					// Stop this computation instead of using the re-run.
					// We use a brand-new autorun for each call to getMeteorData
					// to capture dependencies on any reactive data sources that
					// are accessed.  The reason we can't use a single autorun
					// for the lifetime of the component is that Tracker only
					// re-runs autoruns at flush time, while we need to be able to
					// re-call getMeteorData synchronously whenever we want, e.g.
					// from UNSAFE_componentWillUpdate.
					c.stop()
					// Calling forceUpdate() triggers UNSAFE_componentWillUpdate which
					// recalculates getMeteorData() and re-renders the component.

					// TODO(performance): optionally queue tracker updates for a while
					if (this.queueTrackerUpdates) {
						MeteorDataManager.enqueueUpdate(() => {
							if (this.computation) {
								component.forceUpdate()
							}
						})
					} else {
						component.forceUpdate()
					}
				}
			})
		)

		if (Mongo && data) {
			Object.keys(data).forEach((key) => {
				if (data[key] instanceof Mongo.Cursor) {
					console.warn(
						'Warning: you are returning a Mongo cursor from getMeteorData. ' +
							'This value will not be reactive. You probably want to call ' +
							'`.fetch()` on the cursor before returning it.'
					)
				}
			})
		}

		return data
	}

	updateData(newData) {
		const component = this.component
		const oldData = this.oldData

		if (!(newData && typeof newData === 'object')) {
			throw new Error('Expected object returned from getMeteorData')
		}
		// update componentData in place based on newData
		for (const key in newData) {
			component.data[key] = newData[key]
		}
		// if there is oldData (which is every time this method is called
		// except the first), delete keys in newData that aren't in
		// oldData.  don't interfere with other keys, in case we are
		// co-existing with something else that writes to a component's
		// this.data.
		if (oldData) {
			for (const key in oldData) {
				if (!(key in newData)) {
					delete component.data[key]
				}
			}
		}
		this.oldData = newData
	}
}
export const ReactMeteorData = {
	UNSAFE_componentWillMount() {
		this.data = {}
		this._meteorDataManager = new MeteorDataManager(this, this._queueTrackerUpdates || false)
		const newData = this._meteorDataManager.calculateData()
		this._meteorDataManager.updateData(newData)
	},

	UNSAFE_componentWillUpdate(nextProps, nextState) {
		const saveProps = this.props
		const saveState = this.state
		let newData
		try {
			// Temporarily assign this.state and this.props,
			// so that they are seen by getMeteorData!
			// This is a simulation of how the proposed Observe API
			// for React will work, which calls observe() after
			// UNSAFE_componentWillUpdate and after props and state are
			// updated, but before render() is called.
			// See https://github.com/facebook/react/issues/3398.
			this.props = nextProps
			this.state = nextState
			newData = this._meteorDataManager.calculateData()
		} finally {
			this.props = saveProps
			this.state = saveState
		}

		this._meteorDataManager.updateData(newData)
	},

	componentWillUnmount() {
		this._meteorDataManager.dispose()
	},
	// pick the MeteorReactComponent member functions, so they will be available in withTracker(() => { >here< })
	autorun: MeteorReactComponent.prototype.autorun,
	subscribe: MeteorReactComponent.prototype.subscribe,
}

class ReactMeteorComponentWrapper<P, S> extends React.Component<P, S> {
	data: any
	// _renderedContent: any
}
Object.assign(ReactMeteorComponentWrapper.prototype, ReactMeteorData)
class ReactMeteorPureComponentWrapper<P, S> extends React.PureComponent<P, S> {}
Object.assign(ReactMeteorPureComponentWrapper.prototype, ReactMeteorData)

export interface WithTrackerOptions<IProps, IState, TrackedProps> {
	getMeteorData: (props: IProps) => TrackedProps
	shouldComponentUpdate?: (data: any, props: IProps, nextProps: IProps, state?: IState, nextState?: IState) => boolean
	queueTrackerUpdates?: boolean
	// pure?: boolean
}
// @todo: add withTrackerPure()
type IWrappedComponent<IProps, IState, TrackedProps> =
	| React.ComponentClass<IProps & TrackedProps, IState>
	// | (new (props: IProps & TrackedProps, state: IState) => React.Component<IProps & TrackedProps, IState>)
	| ((props: IProps & TrackedProps) => JSX.Element)
export function withTracker<IProps, IState, TrackedProps>(
	autorunFunction: (props: IProps) => TrackedProps,
	checkUpdate?: (data: any, props: IProps, nextProps: IProps, state?: IState, nextState?: IState) => boolean,
	queueTrackerUpdates?: boolean
): (
	WrappedComponent: IWrappedComponent<IProps, IState, TrackedProps>
) => new (props: IProps) => React.Component<IProps, IState> {
	const expandedOptions: WithTrackerOptions<IProps, IState, TrackedProps> = {
		getMeteorData: autorunFunction,
		shouldComponentUpdate: checkUpdate,
		queueTrackerUpdates,
	}

	return (WrappedComponent) => {
		// return ''
		const HOC = class HOC extends ReactMeteorComponentWrapper<IProps, IState> {
			_queueTrackerUpdates = expandedOptions.queueTrackerUpdates

			getMeteorData() {
				return expandedOptions.getMeteorData.call(this, this.props)
			}
			// This hook allows lower-level components to do smart optimization,
			// without running a potentially heavy recomputation of the getMeteorData.
			// This is potentially very dangerous, so use with caution.
			shouldComponentUpdate(nextProps: IProps, nextState: IState): boolean {
				if (typeof expandedOptions.shouldComponentUpdate === 'function') {
					return expandedOptions.shouldComponentUpdate(this.data, this.props, nextProps, this.state, nextState)
				}
				return true
			}
			render() {
				const content = <WrappedComponent {...this.props} {...this.data} />
				// this._renderedContent = content
				return content
			}
		}
		HOC['displayName'] = `ReactMeteorComponentWrapper(${
			WrappedComponent['displayName'] || WrappedComponent.name || 'Unnamed component'
		})`
		return HOC
	}
}
export function translateWithTracker<IProps, IState, TrackedProps>(
	autorunFunction: (props: Translated<IProps>, state?: IState) => TrackedProps,
	checkUpdate?: (data: any, props: IProps, nextProps: IProps, state?: IState, nextState?: IState) => boolean,
	queueTrackerUpdates?: boolean
) {
	return (WrappedComponent: IWrappedComponent<Translated<IProps>, IState, TrackedProps>) => {
		const inner = withTracker<Translated<IProps>, IState, TrackedProps>(
			autorunFunction,
			checkUpdate,
			queueTrackerUpdates
		)(WrappedComponent)
		return withTranslation()(inner)
	}
}
export type Translated<T> = T & WithTranslation

// function withTracker<IProps, IState, TrackedProps>
// 	(
// 		autorunFunction: (props: IProps, state?: IState | undefined) => TrackedProps
// 	): (
// 		WrappedComponent: new (
// 			props: TrackedProps,
// 			state: IState
// 		) => React.Component<TrackedProps, IState, never>
// 	) => any

/**
 * A Meteor Tracker hook that allows using React Functional Components and the Hooks API with Meteor Tracker
 *
 * @export
 * @template T
 * @param {() => T} autorun The autorun function to be run.
 * @param {(React.DependencyList | undefined)} [deps] An optional list of dependenices to limit the tracker re-running
 * 		for each render. Optional, but highly recommended, due to the heavy nature of Meteor.Trackers and high frequency
 * 		of React renders.
 * @return {*}  {(T | undefined)}
 */
export function useTracker<T>(autorun: () => T, deps?: React.DependencyList | undefined): T | undefined {
	const [meteorData, setMeteorData] = useState<T | undefined>(undefined)

	useEffect(() => {
		const computation = Tracker.nonreactive(() => Tracker.autorun(() => setMeteorData(autorun())))
		return () => computation.stop()
	}, deps)

	return meteorData
}

/**
 * A Meteor Subscription hook that allows using React Functional Components and the Hooks API with Meteor subscriptions.
 * Subscriptions will be torn down 100ms after unmounting the component.
 *
 * @export
 * @param {PubSub} sub The subscription to be subscribed to
 * @param {...any[]} args A list of arugments for the subscription. This is used for optimizing the subscription across
 * 		renders so that it isn't torn down and created for every render.
 */
export function useSubscription(sub: PubSub, ...args: any[]) {
	useEffect(() => {
		const subscription = Meteor.subscribe(sub, ...args)
		return () => {
			setTimeout(() => {
				subscription.stop()
			}, 100)
		}
	}, [stringifyObjects(args)])
}
