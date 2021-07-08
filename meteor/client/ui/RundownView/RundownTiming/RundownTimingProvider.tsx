import { Meteor } from 'meteor/meteor'
import * as React from 'react'
import * as PropTypes from 'prop-types'
import { withTracker } from '../../../lib/ReactMeteorData/react-meteor-data'
import { Part, PartId } from '../../../../lib/collections/Parts'
import { getCurrentTime } from '../../../../lib/lib'
import { MeteorReactComponent } from '../../../lib/MeteorReactComponent'
import { RundownPlaylist } from '../../../../lib/collections/RundownPlaylists'
import { PartInstance } from '../../../../lib/collections/PartInstances'
import { RundownTiming, TimeEventArgs } from './RundownTiming'
import { RundownTimingCalculator, RundownTimingContext } from '../../../../lib/rundown/rundownTiming'
import { Rundown } from '../../../../lib/collections/Rundowns'

const TIMING_DEFAULT_REFRESH_INTERVAL = 1000 / 60 // the interval for high-resolution events (timeupdateHR)
const LOW_RESOLUTION_TIMING_DECIMATOR = 15 // the low-resolution events will be called every
// LOW_RESOLUTION_TIMING_DECIMATOR-th time of the high-resolution events

/**
 * RundownTimingProvider properties.
 * @interface IRundownTimingProviderProps
 */
interface IRundownTimingProviderProps {
	/** Rundown Playlist that is to be used for generating the timing information. */
	playlist?: RundownPlaylist

	/** Interval for high-resolution timing events. If undefined, it will fall back
	 * onto TIMING_DEFAULT_REFRESH_INTERVAL.
	 */
	refreshInterval?: number
	/** Fallback duration for Parts that have no as-played duration of their own. */
	defaultDuration?: number
}
interface IRundownTimingProviderChildContext {
	durations: RundownTimingContext
}
interface IRundownTimingProviderState {}
interface IRundownTimingProviderTrackedProps {
	rundowns: Array<Rundown>
	currentRundown: Rundown | undefined
	parts: Array<Part>
	partInstancesMap: Map<PartId, PartInstance>
}

/**
 * RundownTimingProvider is a container component that provides a timing context to all child elements.
 * It allows calculating a single
 * @class RundownTimingProvider
 * @extends React.Component<IRundownTimingProviderProps>
 */
export const RundownTimingProvider = withTracker<
	IRundownTimingProviderProps,
	IRundownTimingProviderState,
	IRundownTimingProviderTrackedProps
>((props) => {
	let rundowns: Array<Rundown> = []
	let parts: Array<Part> = []
	const partInstancesMap = new Map<PartId, PartInstance>()
	let currentRundown: Rundown | undefined
	if (props.playlist) {
		rundowns = props.playlist.getRundowns()
		const { parts: incomingParts } = props.playlist.getSegmentsAndPartsSync()
		parts = incomingParts
		const partInstances = props.playlist.getActivePartInstances()

		const currentPartInstance = partInstances.find((p) => p._id === props.playlist!.currentPartInstanceId)
		currentRundown = currentPartInstance ? rundowns.find((r) => r._id === currentPartInstance.rundownId) : rundowns[0]

		partInstances.forEach((partInstance) => {
			partInstancesMap.set(partInstance.part._id, partInstance)

			// if the part is orphaned, we need to inject it's part into the incoming parts in the correct position
			if (partInstance.orphaned) {
				let foundSegment = false
				let insertBefore: number | null = null
				for (let i = 0; i < parts.length; i++) {
					if (parts[i].segmentId === partInstance.segmentId) {
						// mark that we have found parts from the segment we're looking for
						foundSegment = true

						if (parts[i]._id === partInstance.part._id) {
							// the PartInstance is orphaned, but there's still the underlying part in the collection
							// let's skip for now.
							// this needs to be updated at some time since it should be treated as a different part at
							// this point.
							break
						} else if (parts[i]._rank > partInstance.part._rank) {
							// we have found a part with a rank greater than the rank of the orphaned PartInstance
							insertBefore = i
							break
						}
					} else if (foundSegment && parts[i].segmentId !== partInstance.segmentId) {
						// we have found parts from the segment we're looking for, but none of them had a rank
						// greater than the rank of the orphaned PartInstance. Lets insert the part before the first
						// part of the next segment
						insertBefore = i
						break
					}
				}

				if (insertBefore !== null) {
					parts.splice(insertBefore, 0, partInstance.part)
				}
			}
		})
	}
	return {
		rundowns,
		currentRundown,
		parts,
		partInstancesMap,
	}
})(
	class RundownTimingProvider
		extends MeteorReactComponent<
			IRundownTimingProviderProps & IRundownTimingProviderTrackedProps,
			IRundownTimingProviderState
		>
		implements React.ChildContextProvider<IRundownTimingProviderChildContext>
	{
		static childContextTypes = {
			durations: PropTypes.object.isRequired,
		}

		durations: RundownTimingContext = {
			isLowResolution: false,
		}
		refreshTimer: number
		refreshTimerInterval: number
		refreshDecimator: number

		private timingCalculator: RundownTimingCalculator = new RundownTimingCalculator()

		constructor(props: IRundownTimingProviderProps & IRundownTimingProviderTrackedProps) {
			super(props)

			this.refreshTimerInterval = props.refreshInterval || TIMING_DEFAULT_REFRESH_INTERVAL

			this.refreshDecimator = 0
		}

		getChildContext(): IRundownTimingProviderChildContext {
			return {
				durations: this.durations,
			}
		}

		onRefreshTimer = () => {
			const now = getCurrentTime()
			const isLowResolution = this.refreshDecimator % LOW_RESOLUTION_TIMING_DECIMATOR === 0
			this.updateDurations(now, isLowResolution)
			this.dispatchHREvent(now)

			this.refreshDecimator++
			if (isLowResolution) {
				this.dispatchEvent(now)
			}
		}

		componentDidMount() {
			this.refreshTimer = Meteor.setInterval(this.onRefreshTimer, this.refreshTimerInterval)
			this.onRefreshTimer()

			window['rundownTimingContext'] = this.durations
		}

		componentDidUpdate(prevProps: IRundownTimingProviderProps & IRundownTimingProviderTrackedProps) {
			// change refresh interval if needed
			if (this.refreshTimerInterval !== this.props.refreshInterval && this.refreshTimer) {
				this.refreshTimerInterval = this.props.refreshInterval || TIMING_DEFAULT_REFRESH_INTERVAL
				Meteor.clearInterval(this.refreshTimer)
				this.refreshTimer = Meteor.setInterval(this.onRefreshTimer, this.refreshTimerInterval)
			}
			if (prevProps.parts !== this.props.parts) {
				// empty the temporary Part Instances cache
				this.timingCalculator.clearTempPartInstances()
				this.onRefreshTimer()
			}
		}

		componentWillUnmount() {
			this._cleanUp()
			delete window['rundownTimingContext']
			Meteor.clearInterval(this.refreshTimer)
		}

		dispatchHREvent(now: number) {
			const event = new CustomEvent<TimeEventArgs>(RundownTiming.Events.timeupdateHR, {
				detail: {
					currentTime: now,
				},
				cancelable: false,
			})
			window.dispatchEvent(event)
		}

		dispatchEvent(now: number) {
			const event = new CustomEvent<TimeEventArgs>(RundownTiming.Events.timeupdate, {
				detail: {
					currentTime: now,
				},
				cancelable: false,
			})
			window.dispatchEvent(event)
		}

		updateDurations(now: number, isLowResolution: boolean) {
			const { playlist, rundowns, currentRundown, parts, partInstancesMap } = this.props
			this.durations = Object.assign(
				this.durations,
				this.timingCalculator.updateDurations(
					now,
					isLowResolution,
					playlist,
					rundowns,
					currentRundown,
					parts,
					partInstancesMap,
					this.props.defaultDuration
				)
			)
		}

		render() {
			return this.props.children
		}
	}
)
