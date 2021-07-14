import { Meteor } from 'meteor/meteor'
import * as React from 'react'
import * as PropTypes from 'prop-types'
import * as _ from 'underscore'
import { withTracker } from '../../../lib/ReactMeteorData/react-meteor-data'
import { Part, PartId } from '../../../../lib/collections/Parts'
import { getCurrentTime, literal, protectString, unprotectString } from '../../../../lib/lib'
import { MeteorReactComponent } from '../../../lib/MeteorReactComponent'
import { RundownPlaylist } from '../../../../lib/collections/RundownPlaylists'
import {
	PartInstance,
	wrapPartToTemporaryInstance,
	findPartInstanceInMapOrWrapToTemporary,
	PartInstanceId,
} from '../../../../lib/collections/PartInstances'
import { Settings } from '../../../../lib/Settings'
import { RundownTiming, TimeEventArgs } from './RundownTiming'

// Minimum duration that a part can be assigned. Used by gap parts to allow them to "compress" to indicate time running out.
const MINIMAL_NONZERO_DURATION = 1

const TIMING_DEFAULT_REFRESH_INTERVAL = 1000 / 60 // the interval for high-resolution events (timeupdateHR)
const LOW_RESOLUTION_TIMING_DECIMATOR = 15 // the low-resolution events will be called every
// LOW_RESOLUTION_TIMING_DECIMATOR-th time of the high-resolution events

const CURRENT_TIME_GRANULARITY = 1000 / 60

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
	durations: RundownTiming.RundownTimingContext
}
interface IRundownTimingProviderState {}
interface IRundownTimingProviderTrackedProps {
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
	let parts: Array<Part> = []
	const partInstancesMap = new Map<PartId, PartInstance>()
	if (props.playlist) {
		const { parts: incomingParts } = props.playlist.getSegmentsAndPartsSync()
		parts = incomingParts
		const partInstances = props.playlist.getActivePartInstances()

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

		durations: RundownTiming.RundownTimingContext = {
			isLowResolution: false,
		}
		refreshTimer: number
		refreshTimerInterval: number
		refreshDecimator: number

		private temporaryPartInstances: Map<PartId, PartInstance> = new Map<PartId, PartInstance>()

		private linearParts: Array<[PartId, number | null]> = []

		// this.previousPartInstanceId is used to check if the previousPart has changed since last iteration.
		private previousPartInstanceId: PartInstanceId | null = null
		private lastTakeAt: number | undefined = undefined

		// look at the comments on RundownTimingContext to understand what these do
		private partDurations: Record<string, number> = {}
		private partExpectedDurations: Record<string, number> = {}
		private partPlayed: Record<string, number> = {}
		private partStartsAt: Record<string, number> = {}
		private partDisplayStartsAt: Record<string, number> = {}
		private partDisplayDurations: Record<string, number> = {}
		private partDisplayDurationsNoPlayback: Record<string, number> = {}
		private displayDurationGroups: Record<string, number> = {}

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

		calmDownTiming = (time: number) => {
			return Math.round(time / CURRENT_TIME_GRANULARITY) * CURRENT_TIME_GRANULARITY
		}

		onRefreshTimer = () => {
			const now = this.calmDownTiming(getCurrentTime())
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
				this.temporaryPartInstances.clear()
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

		private getPartInstanceOrGetCachedTemp(partInstancesMap: Map<PartId, PartInstance>, part: Part): PartInstance {
			const origPartId = part._id
			const partInstance = partInstancesMap.get(origPartId)
			if (partInstance !== undefined) {
				return partInstance
			} else {
				let tempPartInstance = this.temporaryPartInstances.get(origPartId)
				if (tempPartInstance !== undefined) {
					return tempPartInstance
				} else {
					tempPartInstance = wrapPartToTemporaryInstance(protectString(''), part)
					this.temporaryPartInstances.set(origPartId, tempPartInstance)
					return tempPartInstance
				}
			}
		}

		updateDurations(now: number, isLowResolution: boolean) {
			let totalRundownDuration = 0
			let remainingRundownDuration = 0
			let asPlayedRundownDuration = 0
			let asDisplayedRundownDuration = 0
			let waitAccumulator = 0
			let currentRemaining = 0
			let startsAtAccumulator = 0
			let displayStartsAtAccumulator = 0

			Object.keys(this.displayDurationGroups).forEach((key) => delete this.displayDurationGroups[key])
			this.linearParts.length = 0

			const { playlist, parts, partInstancesMap } = this.props

			let nextAIndex = -1
			let currentAIndex = -1

			if (playlist && parts) {
				parts.forEach((origPart, itIndex) => {
					const partInstance = this.getPartInstanceOrGetCachedTemp(partInstancesMap, origPart)

					// add piece to accumulator
					const aIndex = this.linearParts.push([partInstance.part._id, waitAccumulator]) - 1

					// if this is next segementLine, clear previous countdowns and clear accumulator
					if (playlist.nextPartInstanceId === partInstance._id) {
						nextAIndex = aIndex
					} else if (playlist.currentPartInstanceId === partInstance._id) {
						currentAIndex = aIndex
					}

					const partCounts =
						playlist.outOfOrderTiming ||
						!playlist.activationId ||
						(itIndex >= currentAIndex && currentAIndex >= 0) ||
						(itIndex >= nextAIndex && nextAIndex >= 0 && currentAIndex === -1)

					const partIsUntimed = partInstance.part.untimed || false

					// expected is just a sum of expectedDurations
					totalRundownDuration += partInstance.part.expectedDuration || 0

					const lastStartedPlayback = partInstance.timings?.startedPlayback
					const playOffset = partInstance.timings?.playOffset || 0

					let partDuration = 0
					let partExpectedDuration = 0
					let partDisplayDuration = 0
					let partDisplayDurationNoPlayback = 0

					let displayDurationFromGroup = 0

					partExpectedDuration = partInstance.part.expectedDuration || partInstance.timings?.duration || 0

					// Display Duration groups are groups of two or more Parts, where some of them have an
					// expectedDuration and some have 0.
					// Then, some of them will have a displayDuration. The expectedDurations are pooled together, the parts with
					// display durations will take up that much time in the Rundown. The left-over time from the display duration group
					// will be used by Parts without expectedDurations.
					let memberOfDisplayDurationGroup = false
					// using a separate displayDurationGroup processing flag simplifies implementation
					if (
						partInstance.part.displayDurationGroup &&
						// either this is not the first element of the displayDurationGroup
						(this.displayDurationGroups[partInstance.part.displayDurationGroup] !== undefined ||
							// or there is a following member of this displayDurationGroup
							(parts[itIndex + 1] &&
								parts[itIndex + 1].displayDurationGroup === partInstance.part.displayDurationGroup)) &&
						!partInstance.part.floated &&
						!partIsUntimed
					) {
						this.displayDurationGroups[partInstance.part.displayDurationGroup] =
							(this.displayDurationGroups[partInstance.part.displayDurationGroup] || 0) +
							(partInstance.part.expectedDuration || 0)
						displayDurationFromGroup =
							partInstance.part.displayDuration ||
							Math.max(
								0,
								this.displayDurationGroups[partInstance.part.displayDurationGroup],
								partInstance.part.gap
									? MINIMAL_NONZERO_DURATION
									: this.props.defaultDuration || Settings.defaultDisplayDuration
							)
						partExpectedDuration =
							partExpectedDuration || this.displayDurationGroups[partInstance.part.displayDurationGroup] || 0
						memberOfDisplayDurationGroup = true
					}

					// This is where we actually calculate all the various variants of duration of a part
					if (lastStartedPlayback && !partInstance.timings?.duration) {
						// if duration isn't available, check if `takeOut` has already been set and use the difference
						// between startedPlayback and takeOut as a temporary duration
						const duration =
							partInstance.timings?.duration ||
							(partInstance.timings?.takeOut ? lastStartedPlayback - partInstance.timings?.takeOut : undefined)
						currentRemaining = Math.max(
							0,
							(duration ||
								(memberOfDisplayDurationGroup ? displayDurationFromGroup : partInstance.part.expectedDuration) ||
								0) -
								(now - lastStartedPlayback)
						)
						partDuration =
							Math.max(duration || partInstance.part.expectedDuration || 0, now - lastStartedPlayback) - playOffset
						// because displayDurationGroups have no actual timing on them, we need to have a copy of the
						// partDisplayDuration, but calculated as if it's not playing, so that the countdown can be
						// calculated
						partDisplayDurationNoPlayback =
							duration ||
							(memberOfDisplayDurationGroup ? displayDurationFromGroup : partInstance.part.expectedDuration) ||
							this.props.defaultDuration ||
							Settings.defaultDisplayDuration
						partDisplayDuration = Math.max(partDisplayDurationNoPlayback, now - lastStartedPlayback)
						this.partPlayed[unprotectString(partInstance.part._id)] = now - lastStartedPlayback
					} else {
						partDuration = (partInstance.timings?.duration || partInstance.part.expectedDuration || 0) - playOffset
						partDisplayDurationNoPlayback = Math.max(
							0,
							(partInstance.timings?.duration && partInstance.timings?.duration + playOffset) ||
								displayDurationFromGroup ||
								partInstance.part.expectedDuration ||
								this.props.defaultDuration ||
								Settings.defaultDisplayDuration
						)
						partDisplayDuration = partDisplayDurationNoPlayback
						this.partPlayed[unprotectString(partInstance.part._id)] = (partInstance.timings?.duration || 0) - playOffset
					}

					// asPlayed is the actual duration so far and expected durations in unplayed lines.
					// If item is onAir right now, it's duration is counted as expected duration or current
					// playback duration whichever is larger.
					// Parts that are Untimed are ignored always.
					// Parts that don't count are ignored, unless they are being played or have been played.
					if (!partIsUntimed) {
						if (lastStartedPlayback && !partInstance.timings?.duration) {
							asPlayedRundownDuration += Math.max(partExpectedDuration, now - lastStartedPlayback)
						} else if (partInstance.timings?.duration) {
							asPlayedRundownDuration += partInstance.timings.duration
						} else if (partCounts) {
							asPlayedRundownDuration += partInstance.part.expectedDuration || 0
						}
					}

					// asDisplayed is the actual duration so far and expected durations in unplayed lines
					// If item is onAir right now, it's duration is counted as expected duration or current
					// playback duration whichever is larger.
					// All parts are counted.
					if (lastStartedPlayback && !partInstance.timings?.duration) {
						asDisplayedRundownDuration += Math.max(
							memberOfDisplayDurationGroup
								? Math.max(partExpectedDuration, partInstance.part.expectedDuration || 0)
								: partInstance.part.expectedDuration || 0,
							now - lastStartedPlayback
						)
					} else {
						asDisplayedRundownDuration += partInstance.timings?.duration || partInstance.part.expectedDuration || 0
					}

					// the part is the current part but has not yet started playback
					if (playlist.currentPartInstanceId === partInstance._id && !lastStartedPlayback) {
						currentRemaining = partDisplayDuration
					}

					// Handle invalid parts by overriding the values to preset values for Invalid parts
					if (partInstance.part.invalid && !partInstance.part.gap) {
						partDisplayDuration = this.props.defaultDuration || Settings.defaultDisplayDuration
						this.partPlayed[unprotectString(partInstance.part._id)] = 0
					}

					if (
						memberOfDisplayDurationGroup &&
						partInstance.part.displayDurationGroup &&
						!partInstance.part.floated &&
						!partInstance.part.invalid &&
						!partIsUntimed &&
						(partInstance.timings?.duration || partInstance.timings?.takeOut || partCounts)
					) {
						this.displayDurationGroups[partInstance.part.displayDurationGroup] =
							this.displayDurationGroups[partInstance.part.displayDurationGroup] - partDisplayDuration
					}
					const partInstancePartId = unprotectString(partInstance.part._id)
					this.partExpectedDurations[partInstancePartId] = partExpectedDuration
					this.partStartsAt[partInstancePartId] = startsAtAccumulator
					this.partDisplayStartsAt[partInstancePartId] = displayStartsAtAccumulator
					this.partDurations[partInstancePartId] = partDuration
					this.partDisplayDurations[partInstancePartId] = partDisplayDuration
					this.partDisplayDurationsNoPlayback[partInstancePartId] = partDisplayDurationNoPlayback
					startsAtAccumulator += this.partDurations[partInstancePartId]

					if (playlist.previousPartInstanceId !== partInstance._id) {
						displayStartsAtAccumulator += this.partDisplayDurations[partInstancePartId]
					} else {
						if (this.previousPartInstanceId !== playlist.previousPartInstanceId) {
							this.lastTakeAt = now
							this.previousPartInstanceId = playlist.previousPartInstanceId || ''
						}
						const durationToTake =
							this.lastTakeAt && lastStartedPlayback
								? this.lastTakeAt - lastStartedPlayback
								: this.partDisplayDurations[partInstancePartId]
						this.partDisplayDurations[partInstancePartId] = durationToTake
						displayStartsAtAccumulator += durationToTake
					}

					// waitAccumulator is used to calculate the countdowns for Parts relative to the current Part
					// always add the full duration, in case by some manual intervention this segment should play twice
					if (memberOfDisplayDurationGroup) {
						waitAccumulator +=
							partInstance.timings?.duration || partDisplayDuration || partInstance.part.expectedDuration || 0
					} else {
						waitAccumulator += partInstance.timings?.duration || partInstance.part.expectedDuration || 0
					}

					// remaining is the sum of unplayed lines + whatever is left of the current segment
					// if outOfOrderTiming is true, count parts before current part towards remaining rundown duration
					// if false (default), past unplayed parts will not count towards remaining time
					if (!lastStartedPlayback && !partInstance.part.floated && partCounts && !partIsUntimed) {
						remainingRundownDuration += partExpectedDuration || 0
						// item is onAir right now, and it's is currently shorter than expectedDuration
					} else if (
						lastStartedPlayback &&
						!partInstance.timings?.duration &&
						playlist.currentPartInstanceId === partInstance._id &&
						lastStartedPlayback + partExpectedDuration > now &&
						!partIsUntimed
					) {
						remainingRundownDuration += partExpectedDuration - (now - lastStartedPlayback)
					}
				})

				// This is where the waitAccumulator-generated data in the linearSegLines is used to calculate the countdowns.
				let localAccum = 0
				for (let i = 0; i < this.linearParts.length; i++) {
					if (i < nextAIndex) {
						// this is a line before next line
						localAccum = this.linearParts[i][1] || 0
						// only null the values if not looping, if looping, these will be offset by the countdown for the last part
						if (!playlist.loop) {
							this.linearParts[i][1] = null // we use null to express 'will not probably be played out, if played in order'
						}
					} else if (i === nextAIndex) {
						// this is a calculation for the next line, which is basically how much there is left of the current line
						localAccum = this.linearParts[i][1] || 0 // if there is no current line, rebase following lines to the next line
						this.linearParts[i][1] = currentRemaining
					} else {
						// these are lines after next line
						// we take whatever value this line has, subtract the value as set on the Next Part
						// (note that the Next Part value will be using currentRemaining as the countdown)
						// and add the currentRemaining countdown, since we are currentRemaining + diff between next and
						// this away from this line.
						this.linearParts[i][1] = (this.linearParts[i][1] || 0) - localAccum + currentRemaining
					}
				}
				// contiunation of linearParts calculations for looping playlists
				if (playlist.loop) {
					for (let i = 0; i < nextAIndex; i++) {
						// offset the parts before the on air line by the countdown for the end of the rundown
						this.linearParts[i][1] = (this.linearParts[i][1] || 0) + waitAccumulator - localAccum + currentRemaining
					}
				}

				// if (this.refreshDecimator % LOW_RESOLUTION_TIMING_DECIMATOR === 0) {
				// 	const c = document.getElementById('debug-console')
				// 	if (c) c.innerHTML = debugConsole.replace(/\n/g, '<br>')
				// }
			}

			let remainingTimeOnCurrentPart: number | undefined = undefined
			let currentPartWillAutoNext = false
			if (currentAIndex >= 0) {
				const currentLivePart = parts[currentAIndex]
				const currentLivePartInstance = findPartInstanceInMapOrWrapToTemporary(partInstancesMap, currentLivePart)

				const lastStartedPlayback = currentLivePartInstance.timings?.startedPlayback

				let onAirPartDuration = currentLivePartInstance.timings?.duration || currentLivePart.expectedDuration || 0
				if (currentLivePart.displayDurationGroup) {
					onAirPartDuration = this.partExpectedDurations[unprotectString(currentLivePart._id)] || onAirPartDuration
				}

				remainingTimeOnCurrentPart = lastStartedPlayback
					? now - (lastStartedPlayback + onAirPartDuration)
					: onAirPartDuration * -1

				currentPartWillAutoNext = !!(
					currentLivePart.autoNext &&
					(currentLivePart.expectedDuration !== undefined ? currentLivePart.expectedDuration !== 0 : false)
				)
			}

			this.durations = Object.assign(
				this.durations,
				literal<RundownTiming.RundownTimingContext>({
					totalRundownDuration,
					remainingRundownDuration,
					asDisplayedRundownDuration,
					asPlayedRundownDuration,
					partCountdown: _.object(this.linearParts),
					partDurations: this.partDurations,
					partPlayed: this.partPlayed,
					partStartsAt: this.partStartsAt,
					partDisplayStartsAt: this.partDisplayStartsAt,
					partExpectedDurations: this.partExpectedDurations,
					partDisplayDurations: this.partDisplayDurations,
					currentTime: now,
					remainingTimeOnCurrentPart,
					currentPartWillAutoNext,
					isLowResolution,
				})
			)
		}

		render() {
			return this.props.children
		}
	}
)
