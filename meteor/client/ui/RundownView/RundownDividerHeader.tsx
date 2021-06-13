import * as React from 'react'
import { Rundown } from '../../../lib/collections/Rundowns'
import { Translated } from '../../lib/ReactMeteorData/ReactMeteorData'
import Moment from 'react-moment'
import { withTiming, WithTiming } from './RundownTiming/withTiming'
import { RundownUtils } from '../../lib/rundown'
import { useTranslation, withTranslation } from 'react-i18next'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { LoopingIcon } from '../../lib/ui/icons/looping'

interface IProps {
	rundown: Rundown
	playlist: RundownPlaylist
}

interface ITrackedProps {
	notificationsFromRundown: {
		critical: number
		warning: number
	}
}

const QUATER_DAY = 6 * 60 * 60 * 1000

/**
 * This is a countdown to the rundown's _Expected Start_ time. It shows nothing if the expectedStart is undefined
 * or the time to _Expected Start_ from now is larger than 6 hours.
 */
const RundownCountdown = withTranslation()(
	withTiming<
		Translated<{
			expectedStart: number | undefined
			className?: string | undefined
		}>,
		{}
	>({
		filter: 'currentTime',
	})(
		class RundownCountdown extends React.Component<
			Translated<
				WithTiming<{
					expectedStart: number | undefined
					className?: string | undefined
				}>
			>
		> {
			render() {
				const { t } = this.props
				if (this.props.expectedStart === undefined) return null

				const time = this.props.expectedStart - (this.props.timingDurations.currentTime || 0)

				if (time < QUATER_DAY) {
					return (
						<span className={this.props.className}>
							{time > 0
								? t('(in: {{time}})', {
										time: RundownUtils.formatDiffToTimecode(time, false, true, true, true, true),
								  })
								: t('({{time}} ago)', {
										time: RundownUtils.formatDiffToTimecode(time, false, true, true, true, true),
								  })}
						</span>
					)
				}
				return null
			}
		}
	)
)

/**
 * This is a component for showing the title of the rundown, it's expectedStart and expectedDuration and
 * icons for the notifications it's segments have produced. The counters for the notifications are
 * produced by filtering the notifications in the Notification Center based on the source being the
 * rundownId or one of the segmentIds.
 *
 * The component should be minimally reactive.
 */
export const RundownDividerHeader = withTranslation()(
	class RundownDividerHeader extends React.Component<Translated<IProps>> {
		render() {
			const { t, rundown, playlist } = this.props
			return (
				<div className="rundown-divider-timeline">
					<h2 className="rundown-divider-timeline__title">{rundown.name}</h2>
					<h3 className="rundown-divider-timeline__playlist-name">{playlist.name}</h3>
					{rundown.expectedStart ? (
						<div className="rundown-divider-timeline__expected-start">
							<span>{t('Planned Start')}</span>&nbsp;
							<Moment
								interval={1000}
								calendar={{
									sameElse: 'lll',
								}}>
								{rundown.expectedStart}
							</Moment>
							&nbsp;
							<RundownCountdown
								className="rundown-divider-timeline__expected-start__countdown"
								expectedStart={rundown.expectedStart}
							/>
						</div>
					) : null}
					{rundown.expectedDuration ? (
						<div className="rundown-divider-timeline__expected-duration">
							<span>{t('Planned Duration')}</span>&nbsp;
							<Moment interval={0} format="HH:mm:ss" date={rundown.expectedDuration} />
						</div>
					) : null}
				</div>
			)
		}
	}
)

const NextLoopClock = withTiming<{ useWallClock?: boolean }, {}>()(
	class NextLoopClock extends React.Component<
		WithTiming<{
			useWallClock?: boolean
		}>
	> {
		render() {
			const { timingDurations, useWallClock } = this.props

			if (!timingDurations?.partCountdown) return null
			const thisPartCountdown = timingDurations.partCountdown[
				Object.keys(timingDurations.partCountdown)[0] // use the countdown to first part of rundown
			] as number | undefined

			return (
				<span>
					{useWallClock ? (
						<Moment
							interval={0}
							format="HH:mm:ss"
							date={(timingDurations.currentTime || 0) + (thisPartCountdown || 0)}
						/>
					) : (
						RundownUtils.formatTimeToShortTime(
							thisPartCountdown! // shouldShow will be false if thisPartCountdown is undefined
						)
					)}
				</span>
			)
		}
	}
)

interface ILoopingHeaderProps {
	playlist: RundownPlaylist
	showCountdowns?: boolean
}
export function RundownLoopingHeader(props: ILoopingHeaderProps) {
	const { t } = useTranslation()
	const { playlist, showCountdowns } = props

	return (
		<div className="rundown-divider-timeline">
			<h2 className="rundown-divider-timeline__title--loop">
				<LoopingIcon />
				&nbsp;
				{t('Looping')}: {playlist.name}
			</h2>
			{showCountdowns ? (
				<>
					<div className="rundown-divider-timeline__point rundown-divider-timeline__point--time-of-day">
						<NextLoopClock useWallClock={true} />
					</div>
					<div className="rundown-divider-timeline__point rundown-divider-timeline__point--countdown">
						<NextLoopClock />
					</div>
				</>
			) : null}
		</div>
	)
}
