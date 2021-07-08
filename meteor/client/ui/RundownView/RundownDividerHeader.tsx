import * as React from 'react'
import { Rundown } from '../../../lib/collections/Rundowns'
import { Translated } from '../../lib/ReactMeteorData/ReactMeteorData'
import Moment from 'react-moment'
import { withTiming, WithTiming } from './RundownTiming/withTiming'
import { RundownUtils } from '../../lib/rundown'
import { withTranslation } from 'react-i18next'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'

interface IProps {
	rundown: Rundown
	playlist: RundownPlaylist
}

const QUATER_DAY = 6 * 60 * 60 * 1000

/**
 * This is a countdown to the rundown's Expected Start or Expected End time. It shows nothing if the expectedStart is undefined
 * or the time to Expected Start/End from now is larger than 6 hours.
 */
const MarkerCountdownText = withTranslation()(
	withTiming<
		Translated<{
			markerTimestamp: number | undefined
			className?: string | undefined
		}>,
		{}
	>({
		filter: 'currentTime',
	})(function MarkerCountdown(
		props: Translated<
			WithTiming<{
				markerTimestamp: number | undefined
				className?: string | undefined
			}>
		>
	) {
		const { t } = props
		if (props.markerTimestamp === undefined) return null

		const time = props.markerTimestamp - (props.timingDurations.currentTime || 0)

		if (time < QUATER_DAY) {
			return (
				<span className={props.className}>
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
	})
)

/**
 * This is a component for showing the title of the rundown, it's expectedStart and expectedDuration and
 * icons for the notifications it's segments have produced. The counters for the notifications are
 * produced by filtering the notifications in the Notification Center based on the source being the
 * rundownId or one of the segmentIds.
 *
 * The component should be minimally reactive.
 */
export const RundownDividerHeader = withTranslation()(function RundownDividerHeader(props: Translated<IProps>) {
	const { t, rundown, playlist } = props
	return (
		<div className="rundown-divider-timeline">
			<h2 className="rundown-divider-timeline__title">{rundown.name}</h2>
			{rundown.name !== playlist.name && <h3 className="rundown-divider-timeline__playlist-name">{playlist.name}</h3>}
			{rundown.expectedStart ? (
				<div className="rundown-divider-timeline__expected-start">
					<span>{t('Planned Start')}</span>&nbsp;
					<Moment
						interval={1000}
						calendar={{
							sameElse: 'lll',
						}}
					>
						{rundown.expectedStart}
					</Moment>
					&nbsp;
					<MarkerCountdownText
						className="rundown-divider-timeline__expected-start__countdown"
						markerTimestamp={rundown.expectedStart}
					/>
				</div>
			) : null}
			{rundown.expectedDuration ? (
				<div className="rundown-divider-timeline__expected-duration">
					<span>{t('Planned Duration')}</span>&nbsp;
					{RundownUtils.formatDiffToTimecode(rundown.expectedDuration, false, true, true, false, true)}
				</div>
			) : null}
			{rundown.expectedEnd ? (
				<div className="rundown-divider-timeline__expected-end">
					<span>{t('Planned End')}</span>&nbsp;
					<Moment
						interval={1000}
						calendar={{
							sameElse: 'lll',
						}}
					>
						{rundown.expectedEnd}
					</Moment>
					&nbsp;
					<MarkerCountdownText
						className="rundown-divider-timeline__expected-end__countdown"
						markerTimestamp={rundown.expectedEnd}
					/>
				</div>
			) : null}
		</div>
	)
})
