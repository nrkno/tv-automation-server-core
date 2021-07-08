import {
	PlaylistTimingBackTime,
	PlaylistTimingForwardTime,
	PlaylistTimingNone,
	PlaylistTimingType,
	RundownPlaylistTiming,
} from '@sofie-automation/blueprints-integration'
import _ from 'underscore'
import {
	findPartInstanceInMapOrWrapToTemporary,
	PartInstance,
	wrapPartToTemporaryInstance,
} from '../collections/PartInstances'
import { Part, PartId } from '../collections/Parts'
import { RundownPlaylist } from '../collections/RundownPlaylists'
import { Rundown } from '../collections/Rundowns'
import { unprotectString, literal, protectString } from '../lib'
import { Settings } from '../Settings'

// Minimum duration that a part can be assigned. Used by gap parts to allow them to "compress" to indicate time running out.
const MINIMAL_NONZERO_DURATION = 1

interface BreakProps {
	rundownsBeforeNextBreak: Rundown[]
	breakIsLastRundown
}

export class RundownTimingCalculator {
	private temporaryPartInstances: Map<PartId, PartInstance> = new Map<PartId, PartInstance>()

	private linearParts: Array<[PartId, number | null]> = []
	// look at the comments on RundownTimingContext to understand what these do
	private partDurations: Record<string, number> = {}
	private partExpectedDurations: Record<string, number> = {}
	private partPlayed: Record<string, number> = {}
	private partStartsAt: Record<string, number> = {}
	private partDisplayStartsAt: Record<string, number> = {}
	private partDisplayDurations: Record<string, number> = {}
	private partDisplayDurationsNoPlayback: Record<string, number> = {}
	private displayDurationGroups: Record<string, number> = {}
	private breakProps: {
		props: BreakProps | undefined
		state: string | undefined
	} = { props: undefined, state: undefined }

	updateDurations(
		now: number,
		isLowResolution: boolean,
		playlist: RundownPlaylist | undefined,
		rundowns: Rundown[],
		currentRundown: Rundown | undefined,
		parts: Part[],
		partInstancesMap: Map<PartId, PartInstance>,
		/** Fallback duration for Parts that have no as-played duration of their own. */
		defaultDuration?: number
	) {
		let totalRundownDuration = 0
		let remainingRundownDuration = 0
		let asPlayedRundownDuration = 0
		let asDisplayedRundownDuration = 0
		let waitAccumulator = 0
		let currentRemaining = 0
		let startsAtAccumulator = 0
		let displayStartsAtAccumulator = 0

		const rundownExpectedDurations: Record<string, number> = {}
		const rundownAsPlayedDurations: Record<string, number> = {}

		let rundownsBeforeNextBreak: Rundown[] | undefined
		let breakIsLastRundown: boolean | undefined

		Object.keys(this.displayDurationGroups).forEach((key) => delete this.displayDurationGroups[key])
		this.linearParts.length = 0

		let nextAIndex = -1
		let currentAIndex = -1

		if (playlist) {
			const breakProps = currentRundown ? this.getRundownsBeforeNextBreak(rundowns, currentRundown) : undefined

			if (breakProps) {
				rundownsBeforeNextBreak = breakProps.rundownsBeforeNextBreak
				breakIsLastRundown = breakProps.breakIsLastRundown
			}

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
								: defaultDuration || Settings.defaultDisplayDuration
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
						(partInstance.timings?.takeOut
							? lastStartedPlayback - partInstance.timings?.takeOut
							: undefined)
					currentRemaining = Math.max(
						0,
						(duration ||
							(memberOfDisplayDurationGroup
								? displayDurationFromGroup
								: partInstance.part.expectedDuration) ||
							0) -
							(now - lastStartedPlayback)
					)
					partDuration =
						Math.max(duration || partInstance.part.expectedDuration || 0, now - lastStartedPlayback) -
						playOffset
					// because displayDurationGroups have no actual timing on them, we need to have a copy of the
					// partDisplayDuration, but calculated as if it's not playing, so that the countdown can be
					// calculated
					partDisplayDurationNoPlayback =
						duration ||
						(memberOfDisplayDurationGroup
							? displayDurationFromGroup
							: partInstance.part.expectedDuration) ||
						defaultDuration ||
						Settings.defaultDisplayDuration
					partDisplayDuration = Math.max(partDisplayDurationNoPlayback, now - lastStartedPlayback)
					this.partPlayed[unprotectString(partInstance.part._id)] = now - lastStartedPlayback
				} else {
					partDuration =
						(partInstance.timings?.duration || partInstance.part.expectedDuration || 0) - playOffset
					partDisplayDurationNoPlayback = Math.max(
						0,
						(partInstance.timings?.duration && partInstance.timings?.duration + playOffset) ||
							displayDurationFromGroup ||
							partInstance.part.expectedDuration ||
							defaultDuration ||
							Settings.defaultDisplayDuration
					)
					partDisplayDuration = partDisplayDurationNoPlayback
					this.partPlayed[unprotectString(partInstance.part._id)] =
						(partInstance.timings?.duration || 0) - playOffset
				}

				// asPlayed is the actual duration so far and expected durations in unplayed lines.
				// If item is onAir right now, it's duration is counted as expected duration or current
				// playback duration whichever is larger.
				// Parts that are Untimed are ignored always.
				// Parts that don't count are ignored, unless they are being played or have been played.
				if (!partIsUntimed) {
					let valToAddToAsPlayedDuration = 0

					if (lastStartedPlayback && !partInstance.timings?.duration) {
						valToAddToAsPlayedDuration = Math.max(partExpectedDuration, now - lastStartedPlayback)
					} else if (partInstance.timings?.duration) {
						valToAddToAsPlayedDuration = partInstance.timings.duration
					} else if (partCounts) {
						valToAddToAsPlayedDuration = partInstance.part.expectedDuration || 0
					}

					asPlayedRundownDuration += valToAddToAsPlayedDuration
					if (!rundownAsPlayedDurations[unprotectString(partInstance.part.rundownId)]) {
						rundownAsPlayedDurations[unprotectString(partInstance.part.rundownId)] =
							valToAddToAsPlayedDuration
					} else {
						rundownAsPlayedDurations[unprotectString(partInstance.part.rundownId)] +=
							valToAddToAsPlayedDuration
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
					asDisplayedRundownDuration +=
						partInstance.timings?.duration || partInstance.part.expectedDuration || 0
				}

				// the part is the current part but has not yet started playback
				if (playlist.currentPartInstanceId === partInstance._id && !lastStartedPlayback) {
					currentRemaining = partDisplayDuration
				}

				// Handle invalid parts by overriding the values to preset values for Invalid parts
				if (partInstance.part.invalid && !partInstance.part.gap) {
					partDisplayDuration = defaultDuration || Settings.defaultDisplayDuration
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
				displayStartsAtAccumulator += this.partDisplayDurations[partInstancePartId] // || this.props.defaultDuration || 3000
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

				if (!rundownExpectedDurations[unprotectString(partInstance.part.rundownId)]) {
					rundownExpectedDurations[unprotectString(partInstance.part.rundownId)] = partExpectedDuration
				} else {
					rundownExpectedDurations[unprotectString(partInstance.part.rundownId)] += partExpectedDuration
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
					this.linearParts[i][1] =
						(this.linearParts[i][1] || 0) + waitAccumulator - localAccum + currentRemaining
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
				onAirPartDuration =
					this.partExpectedDurations[unprotectString(currentLivePart._id)] || onAirPartDuration
			}

			remainingTimeOnCurrentPart = lastStartedPlayback
				? now - (lastStartedPlayback + onAirPartDuration)
				: onAirPartDuration * -1

			currentPartWillAutoNext = !!(
				currentLivePart.autoNext &&
				(currentLivePart.expectedDuration !== undefined ? currentLivePart.expectedDuration !== 0 : false)
			)
		}

		return literal<RundownTimingContext>({
			totalPlaylistDuration: totalRundownDuration,
			remainingPlaylistDuration: remainingRundownDuration,
			asDisplayedPlaylistDuration: asDisplayedRundownDuration,
			asPlayedPlaylistDuration: asPlayedRundownDuration,
			rundownExpectedDurations,
			rundownAsPlayedDurations,
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
			rundownsBeforeNextBreak,
			breakIsLastRundown,
			isLowResolution,
		})
	}

	clearTempPartInstances() {
		this.temporaryPartInstances.clear()
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

	private getRundownsBeforeNextBreak(
		orderedRundowns: Rundown[],
		currentRundown: Rundown | undefined
	): BreakProps | undefined {
		const currentState = orderedRundowns.map((r) => r.endOfRundownIsShowBreak ?? '_').join('')
		if (this.breakProps.state !== currentState) {
			this.recalculateBreaks(orderedRundowns, currentRundown)
		}

		this.breakProps.state = currentState
		return this.breakProps.props
	}

	private recalculateBreaks(orderedRundowns: Rundown[], currentRundown: Rundown | undefined) {
		if (!currentRundown) {
			this.breakProps.props = undefined
			return
		}

		const currentRundownIndex = orderedRundowns.findIndex((r) => r._id === currentRundown._id)

		if (currentRundownIndex === -1) {
			this.breakProps.props = undefined
			return
		}

		const nextBreakIndex = orderedRundowns.findIndex((rundown, index) => {
			if (index < currentRundownIndex) {
				return false
			}

			return rundown.endOfRundownIsShowBreak === true
		})

		this.breakProps.props = {
			rundownsBeforeNextBreak: orderedRundowns.slice(currentRundownIndex, nextBreakIndex + 1),
			breakIsLastRundown: nextBreakIndex === orderedRundowns.length,
		}
	}
}

export interface RundownTimingContext {
	/** This is the total duration of the palylist as planned (using expectedDurations). */
	totalPlaylistDuration?: number
	/** This is the content remaining to be played in the playlist (based on the expectedDurations).  */
	remainingPlaylistDuration?: number
	/** This is the total duration of the playlist: as planned for the unplayed (skipped & future) content, and as-run for the played-out. */
	asDisplayedPlaylistDuration?: number
	/** This is the complete duration of the playlist: as planned for the unplayed content, and as-run for the played-out, but ignoring unplayed/unplayable parts in order */
	asPlayedPlaylistDuration?: number
	/** Expected duration of each rundown in playlist (based on part expected durations) */
	rundownExpectedDurations?: Record<string, number>
	/** This is the complete duration of each rundown: as planned for the unplayed content, and as-run for the played-out, but ignoring unplayed/unplayable parts in order */
	rundownAsPlayedDurations?: Record<string, number>
	/** this is the countdown to each of the parts relative to the current on air part. */
	partCountdown?: Record<string, number>
	/** The calculated durations of each of the Parts: as-planned/as-run depending on state. */
	partDurations?: Record<string, number>
	/** The offset of each of the Parts from the beginning of the Playlist. */
	partStartsAt?: Record<string, number>
	/** Same as partStartsAt, but will include display duration overrides
	 *  (such as minimal display width for an Part, etc.).
	 */
	partDisplayStartsAt?: Record<string, number>
	/** Same as partDurations, but will include display duration overrides
	 * (such as minimal display width for an Part, etc.).
	 */
	partDisplayDurations?: Record<string, number>
	/** As-played durations of each part. Will be 0, if not yet played.
	 * Will be counted from start to now if currently playing.
	 */
	partPlayed?: Record<string, number>
	/** Expected durations of each of the parts or the as-played duration,
	 * if the Part does not have an expected duration.
	 */
	partExpectedDurations?: Record<string, number>
	/** Remaining time on current part */
	remainingTimeOnCurrentPart?: number | undefined
	/** Current part will autoNext */
	currentPartWillAutoNext?: boolean
	/** Current time of this calculation */
	currentTime?: number
	/** Rundowns between current rundown and rundown with next break (inclusive of both). Undefined if there's no break in the future. */
	rundownsBeforeNextBreak?: Rundown[]
	/** Whether the next break is also the last */
	breakIsLastRundown?: boolean
	/** Was this time context calculated during a high-resolution tick */
	isLowResolution: boolean
}

/**
 * Computes the actual (as-played fallbacking to expected) duration of a segment, consisting of given parts
 * @export
 * @param  {RundownTimingContext} timingDurations The timing durations calculated for the Rundown
 * @param  {Array<string>} partIds The IDs of parts that are members of the segment
 * @return number
 */
export function computeSegmentDuration(
	timingDurations: RundownTimingContext,
	partIds: PartId[],
	display?: boolean
): number {
	const partDurations = timingDurations.partDurations

	if (partDurations === undefined) return 0

	return partIds.reduce((memo, partId) => {
		const pId = unprotectString(partId)
		const partDuration =
			(partDurations ? (partDurations[pId] !== undefined ? partDurations[pId] : 0) : 0) ||
			(display ? Settings.defaultDisplayDuration : 0)
		return memo + partDuration
	}, 0)
}

export namespace PlaylistTiming {
	export function isPlaylistTimingNone(timing: RundownPlaylistTiming): timing is PlaylistTimingNone {
		return timing.type === PlaylistTimingType.None
	}

	export function isPlaylistTimingForwardTime(timing: RundownPlaylistTiming): timing is PlaylistTimingForwardTime {
		return timing.type === PlaylistTimingType.ForwardTime
	}

	export function isPlaylistTimingBackTime(timing: RundownPlaylistTiming): timing is PlaylistTimingBackTime {
		return timing.type === PlaylistTimingType.BackTime
	}

	export function getExpectedStart(timing: RundownPlaylistTiming): number | undefined {
		return PlaylistTiming.isPlaylistTimingForwardTime(timing)
			? timing.expectedStart
			: PlaylistTiming.isPlaylistTimingBackTime(timing)
			? // Use expectedStart if present, otherwise try to calculate from expectedEnd - expectedDuration
			  timing.expectedStart ||
			  (timing.expectedDuration ? timing.expectedEnd - timing.expectedDuration : undefined)
			: undefined
	}

	export function getExpectedEnd(timing: RundownPlaylistTiming): number | undefined {
		return PlaylistTiming.isPlaylistTimingBackTime(timing)
			? timing.expectedEnd
			: PlaylistTiming.isPlaylistTimingForwardTime(timing)
			? timing.expectedEnd ||
			  (timing.expectedDuration ? timing.expectedStart + timing.expectedDuration : undefined)
			: undefined
	}

	export function getExpectedDuration(timing: RundownPlaylistTiming): number | undefined {
		return PlaylistTiming.isPlaylistTimingForwardTime(timing)
			? timing.expectedDuration
			: PlaylistTiming.isPlaylistTimingBackTime(timing)
			? timing.expectedDuration
			: undefined
	}
}
