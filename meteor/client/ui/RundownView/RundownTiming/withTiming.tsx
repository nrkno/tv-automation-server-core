import * as React from 'react'
import * as PropTypes from 'prop-types'
import * as _ from 'underscore'
import { RundownTiming } from './RundownTiming'
import { RundownTimingContext } from '../../../../lib/rundown/rundownTiming'

export type TimingFilterFunction = (durations: RundownTimingContext) => any

export interface WithTimingOptions {
	isHighResolution?: boolean
	filter?: TimingFilterFunction | string | (string | number)[]
}
export type WithTiming<T> = T & RundownTiming.InjectedROTimingProps & { children?: React.ReactNode }
type IWrappedComponent<IProps, IState> =
	| (new (props: WithTiming<IProps>, state: IState) => React.Component<WithTiming<IProps>, IState>)
	| ((props: WithTiming<IProps>) => JSX.Element | null)

/**
 * Wrap a component in a HOC that will inject a the timing context as a prop. Takes an optional options object that
 * allows a high timing resolution or filtering of the changes in the context, so that the child component only
 * re-renders when a change to the filtered value happens.
 * The options object can also be replaced with an options generator function that will take the incoming props
 * as an argument and produce a {WithTimingOptions} object
 * @export
 * @template IProps The props interface of the child component
 * @template IState The state interface of the child component
 * @param  {(WithTimingOptions | ((props: IProps) => WithTimingOptions))} [options] The options object or the options object generator
 * @return (WrappedComponent: IWrappedComponent<IProps, IState>) =>
 * 		new (props: IProps, context: any ) => React.Component<IProps, IState>
 */
export function withTiming<IProps, IState>(
	options?: WithTimingOptions | ((props: IProps) => WithTimingOptions)
): (
	WrappedComponent: IWrappedComponent<IProps, IState>
) => new (props: IProps, context: any) => React.Component<IProps, IState> {
	let expandedOptions: WithTimingOptions = {
		isHighResolution: false,
		...(typeof options === 'function' ? {} : options),
	}

	return (WrappedComponent) => {
		return class WithTimingHOCComponent extends React.Component<IProps, IState> {
			static contextTypes = {
				durations: PropTypes.object.isRequired,
			}

			filterGetter: (o: any) => any
			previousValue: any = undefined
			isDirty: boolean = false

			constructor(props, context) {
				super(props, context)

				if (typeof options === 'function') {
					expandedOptions = {
						...expandedOptions,
						...options(this.props),
					}
				}

				if (typeof expandedOptions.filter === 'function') {
					this.filterGetter = expandedOptions.filter
				} else if (expandedOptions.filter) {
					this.filterGetter = _.property(expandedOptions.filter as string)
				}
			}

			componentDidMount() {
				window.addEventListener(
					expandedOptions.isHighResolution ? RundownTiming.Events.timeupdateHR : RundownTiming.Events.timeupdate,
					this.refreshComponent
				)
			}

			componentWillUnmount() {
				window.removeEventListener(
					expandedOptions.isHighResolution ? RundownTiming.Events.timeupdateHR : RundownTiming.Events.timeupdate,
					this.refreshComponent
				)
			}

			refreshComponent = () => {
				if (!this.filterGetter) {
					this.forceUpdate()
				} else {
					const buf = this.filterGetter(this.context.durations || {})
					if (this.isDirty || !_.isEqual(buf, this.previousValue)) {
						this.previousValue = buf
						this.isDirty = false
						this.forceUpdate()
					}
				}
			}

			render() {
				const durations: RundownTimingContext = this.context.durations

				// If the timing HOC is supposed to be low resolution and we are rendering
				// during a high resolution tick, the WrappedComponent will render using
				// a RundownTimingContext that has not gone through the filter and thus
				// previousValue may go out of sync.
				// To bring it back to sync, we mark the component as dirty, which will
				// force an update on the next low resoluton tick, regardless of what
				// the filter says.
				if (!!this.filterGetter && durations.isLowResolution !== !expandedOptions.isHighResolution) {
					this.isDirty = true
				}

				return <WrappedComponent {...this.props} timingDurations={durations} />
			}
		}
	}
}
