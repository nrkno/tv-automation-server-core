import { PartId } from '../../../../lib/collections/Parts'
import { unprotectString } from '../../../../lib/lib'
import { Settings } from '../../../../lib/Settings'

export interface TimeEventArgs {
	currentTime: number
}

export type TimingEvent = CustomEvent<TimeEventArgs>

export namespace RundownTiming {
	/**
	 * Events used by the RundownTimingProvider
	 * @export
	 * @enum {number}
	 */
	export enum Events {
		/** Event is emitted every now-and-then, generally to be used for simple displays */
		'timeupdate' = 'sofie:rundownTimeUpdate',
		/** event is emitted with a very high frequency (60 Hz), to be used sparingly as
		 * hooking up Components to it will cause a lot of renders
		 */
		'timeupdateHR' = 'sofie:rundownTimeUpdateHR',
	}

	/**
	 * Context object that will be passed to listening components. The dictionaries use the Part ID as a key.
	 * @export
	 * @interface RundownTimingContext
	 */
	export interface RundownTimingContext {
		/** This is the total duration of the rundown as planned (using expectedDurations). */
		totalRundownDuration?: number
		/** This is the content remaining to be played in the rundown (based on the expectedDurations).  */
		remainingRundownDuration?: number
		/** This is the total duration of the rundown: as planned for the unplayed (skipped & future) content, and as-run for the played-out. */
		asDisplayedRundownDuration?: number
		/** This is the complete duration of the rundown: as planned for the unplayed content, and as-run for the played-out, but ignoring unplayed/unplayable parts in order */
		asPlayedRundownDuration?: number
		/** this is the countdown to each of the parts relative to the current on air part. */
		partCountdown?: Record<string, number>
		/** The calculated durations of each of the Parts: as-planned/as-run depending on state. */
		partDurations?: Record<string, number>
		/** The offset of each of the Parts from the beginning of the Rundown. */
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
		/** Was this time context calculated during a high-resolution tick */
		isLowResolution: boolean
	}

	/**
	 * This are the properties that will be injected by the withTiming HOC.
	 * @export
	 * @interface InjectedROTimingProps
	 */
	export interface InjectedROTimingProps {
		timingDurations: RundownTimingContext
	}
}

/**
 * Computes the actual (as-played fallbacking to expected) duration of a segment, consisting of given parts
 * @export
 * @param  {RundownTiming.RundownTimingContext} timingDurations The timing durations calculated for the Rundown
 * @param  {Array<string>} partIds The IDs of parts that are members of the segment
 * @return number
 */
export function computeSegmentDuration(
	timingDurations: RundownTiming.RundownTimingContext,
	partIds: PartId[],
	display?: boolean
): number {
	let partDurations = timingDurations.partDurations

	if (partDurations === undefined) return 0

	return partIds.reduce((memo, partId) => {
		const pId = unprotectString(partId)
		const partDuration =
			(partDurations ? (partDurations[pId] !== undefined ? partDurations[pId] : 0) : 0) ||
			(display ? Settings.defaultDisplayDuration : 0)
		return memo + partDuration
	}, 0)
}
