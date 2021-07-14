/* eslint-disable @typescript-eslint/no-unused-vars */
import { withTracker, translateWithTracker, Translated } from '../lib/ReactMeteorData/ReactMeteorData'
import * as React from 'react'
import { withTiming, WithTiming } from './RundownView/RundownTiming/withTiming'
import { withTranslation } from 'react-i18next'
import { MeteorReactComponent } from '../lib/MeteorReactComponent'
import { Meteor } from 'meteor/meteor'

// These are examples of how to write different types of components

// Simple component ----------------------------

interface SimpleComponentProps {
	myProp0: string
}
interface SimpleComponentState {
	myState0: string
}
class SimpleComponent extends React.Component<SimpleComponentProps, SimpleComponentState> {
	constructor(props: SimpleComponentProps) {
		super(props)
		this.state = {
			myState0: '',
		}
	}
	render() {
		return (
			<div>
				{this.props.myProp0}
				{this.state.myState0}
				{/* {this.props.asdf} invalid argument */}
				{/* {this.state.asdf} invalid argument */}
			</div>
		)
	}
}
function testSimpleComponent() {
	const a = new SimpleComponent({
		myProp0: '',
		// asdf: 123, // invalid argument
	})
}
// Translated Simple component ------------------------------
interface TranslatedSimpleComponentProps {
	myProp0: string
}
interface TranslatedSimpleComponentState {
	myState0: string
}
const TranslatedSimpleComponent = withTranslation()(
	class TranslatedSimpleComponent extends React.Component<
		Translated<TranslatedSimpleComponentProps>,
		TranslatedSimpleComponentState
	> {
		constructor(props: Translated<TranslatedSimpleComponentProps>) {
			super(props)
			this.state = {
				myState0: '',
			}
		}
		render() {
			const t = this.props.t
			return (
				<div>
					{t('Test test')}
					{this.props.myProp0}
					{this.state.myState0}
					{/* {this.props.asdf} invalid argument */}
					{/* {this.state.asdf} invalid argument */}
				</div>
			)
		}
	}
)
// function testTranslatedSimpleComponent () {
// 	let a = new TranslatedSimpleComponent({
// 		myProp0: '',
// 		// asdf: 123, // invalid argument
// 	})
// }
// Reactive Component ----------------------------

interface ReactiveComponentProps {
	myProp0: string
}
interface ReactiveComponentState {
	myState0: string
}
interface ReactiveComponentTrackedProps {
	myReactiveProp0: string
}
const ReactiveComponent = withTracker<ReactiveComponentProps, ReactiveComponentState, ReactiveComponentTrackedProps>(
	() => {
		return {
			myReactiveProp0: Meteor.status().status,
		}
	}
)(
	class ReactiveComponent extends MeteorReactComponent<
		ReactiveComponentProps & ReactiveComponentTrackedProps,
		ReactiveComponentState
	> {
		constructor(props: ReactiveComponentProps & ReactiveComponentTrackedProps) {
			super(props)
			this.state = {
				myState0: '',
			}
		}
		render() {
			return (
				<div>
					{this.props.myProp0}
					{this.state.myState0}
					{this.props.myReactiveProp0}
					{/* {this.props.asdf} invalid argument */}
					{/* {this.state.asdf} invalid argument */}
				</div>
			)
		}
	}
)
function testReactiveComponent() {
	const a = new ReactiveComponent({
		myProp0: '',
		// myReactiveProp0: '', // invalid argument
		// asdf: 123, // invalid argument
	})
}
// Translated Reactive Component ------------------------------
interface TranslatedReactiveComponentProps {
	myProp0: string
}
interface TranslatedReactiveComponentState {
	myState0: string
}
interface TranslatedReactiveComponentTrackedProps {
	myReactiveProp0: string
}

const TranslatedReactiveComponent = translateWithTracker<
	TranslatedReactiveComponentProps,
	TranslatedReactiveComponentState,
	TranslatedReactiveComponentTrackedProps
>(() => {
	return {
		myReactiveProp0: Meteor.status().status,
	}
})(
	class TranslatedReactiveComponent extends MeteorReactComponent<
		Translated<TranslatedReactiveComponentProps & TranslatedReactiveComponentTrackedProps>,
		TranslatedReactiveComponentState
	> {
		constructor(props: Translated<TranslatedReactiveComponentProps & TranslatedReactiveComponentTrackedProps>) {
			super(props)
			this.state = {
				myState0: '',
			}
		}
		render() {
			const t = this.props.t
			return (
				<div>
					{t('Test test')}
					{this.props.myProp0}
					{this.state.myState0}
					{this.props.myReactiveProp0}
					{/* {this.props.asdf} invalid argument */}
					{/* {this.state.asdf} invalid argument */}
				</div>
			)
		}
	}
)
// function testTranslatedReactiveComponent () {
// 	let a = new TranslatedReactiveComponent({
// 		myProp0: '',
// 		// asdf: 123, // invalid argument
// 	})
// }

// withTiming ----------------------
interface WithTimingComponentProps {
	myProp0: string
}
interface WithTimingComponentState {
	myState0: string
}
const WithTimingComponent = withTiming<WithTimingComponentProps, WithTimingComponentState>({
	isHighResolution: false,
})(
	class WithTimingComponent extends React.Component<WithTiming<WithTimingComponentProps>, WithTimingComponentState> {
		_refreshTimer: number | undefined

		constructor(props: WithTiming<WithTimingComponentProps>) {
			super(props)

			const a = this.props.myProp0

			this.state = {
				myState0: a,
				// asdf: '' // invalid state attr
			}
		}

		render() {
			return (
				<div>
					{this.props.myProp0}
					{this.state.myState0}
					{/* {this.props.asdf} invalid argument */}
					{/* {this.state.asdf} invalid argument */}
				</div>
			)
		}
	}
)
function testWithTimingComponent() {
	const a = new WithTimingComponent(
		{
			myProp0: '',
			// asdf: 123, // invalid argument
		},
		{}
	)
}
