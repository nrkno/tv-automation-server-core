import * as React from 'react'
import * as _ from 'underscore'

import { withTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import ClassNames from 'classnames'
import { getCurrentTime, literal, unprotectString } from '../../../lib/lib'
import { PartUi } from '../SegmentTimeline/SegmentTimelineContainer'
import { DBSegment, SegmentId } from '../../../lib/collections/Segments'
import { withTiming, WithTiming } from './RundownTiming/withTiming'
import { ErrorBoundary } from '../../lib/ErrorBoundary'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { RundownUtils } from '../../lib/rundown'
import { RundownPlaylists, RundownPlaylist, RundownPlaylistId } from '../../../lib/collections/RundownPlaylists'
import { findPartInstanceOrWrapToTemporary } from '../../../lib/collections/PartInstances'

interface SegmentUi extends DBSegment {
	items: Array<PartUi>
}

interface TimeMap {
	[key: string]: number
}

interface RundownOverviewProps {
	rundownPlaylistId: RundownPlaylistId
	segmentLiveDurations?: TimeMap
}
interface RundownOverviewState {}
interface RundownOverviewTrackedProps {
	playlist?: RundownPlaylist
	segments: Array<SegmentUi>
}

export const RundownOverview = withTracker<RundownOverviewProps, RundownOverviewState, RundownOverviewTrackedProps>(
	(props: RundownOverviewProps) => {
		let playlist: RundownPlaylist | undefined
		if (props.rundownPlaylistId) playlist = RundownPlaylists.findOne(props.rundownPlaylistId)
		let segments: Array<SegmentUi> = []
		if (playlist) {
			const segmentMap = new Map<SegmentId, SegmentUi>()
			segments = playlist
				.getSegments(
					{
						isHidden: {
							$ne: true,
						},
					},
					{
						fields: {
							rundownId: 1,
							name: 1,
						},
					}
				)
				.map((segment) => {
					const segmentUi = literal<SegmentUi>({
						...segment,
						items: [],
					})
					segmentMap.set(segment._id, segmentUi)
					return segmentUi
				})

			const partInstancesMap = playlist.getActivePartInstancesMap()
			playlist
				.getUnorderedParts(
					{
						segmentId: {
							$in: Array.from(segmentMap.keys()),
						},
					},
					{
						fields: {
							_rank: 1,
							title: 1,
							rundownId: 1,
							segmentId: 1,
							expectedDuration: 1,
						},
					}
				)
				.forEach((part) => {
					const instance = findPartInstanceOrWrapToTemporary(partInstancesMap, part)
					const partUi = literal<PartUi>({
						partId: part._id,
						instance,
						pieces: [],
						renderedDuration: 0,
						startsAt: 0,
						willProbablyAutoNext: false,
					})
					const segment = segmentMap.get(part.segmentId)
					if (segment) segment.items.push(partUi)
				})

			segmentMap.forEach((segment) => {
				// Sort parts by rank
				segment.items = _.sortBy(segment.items, (p) => p.instance.part._rank)
			})
		}
		return {
			segments,
			playlist,
		}
	}
)(
	withTiming<RundownOverviewProps & RundownOverviewTrackedProps, RundownOverviewState>()(
		class RundownOverview extends MeteorReactComponent<
			WithTiming<RundownOverviewProps & RundownOverviewTrackedProps>,
			RundownOverviewState
		> {
			renderPart(
				part: PartUi,
				timingDurations: TimeMap,
				segmentDuration: number,
				totalDuration: number,
				isLive: boolean,
				isNext: boolean
			) {
				const innerPart = part.instance.part

				return (
					<div
						key={unprotectString(part.instance._id)}
						className={ClassNames('rundown__overview__segment__part', {
							live: isLive,
							next: isNext,

							'has-played':
								(part.instance.timings?.startedPlayback || 0) > 0 && (part.instance.timings?.duration || 0) > 0,
						})}
						style={{
							width:
								(Math.max(
									(timingDurations && timingDurations[unprotectString(innerPart._id)]) || 0,
									part.instance.timings?.duration || innerPart.expectedDuration || 0
								) /
									(segmentDuration || 0)) *
									100 +
								'%',
						}}
					>
						{isNext && <div className="rundown__overview__segment__part__next-line"></div>}
						{isLive && (
							<div
								className="rundown__overview__segment__part__live-line"
								style={{
									left:
										((getCurrentTime() - (part.instance.timings?.startedPlayback || 0)) /
											Math.max(
												(timingDurations && timingDurations[unprotectString(innerPart._id)]) || 0,
												part.instance.timings?.duration || innerPart.expectedDuration || 0
											)) *
											100 +
										'%',
								}}
							></div>
						)}
					</div>
				)
			}

			renderSegment(playlist: RundownPlaylist, segment: SegmentUi, timingDurations: TimeMap, totalDuration: number) {
				const segmentDuration = timingDurations
					? segment.items
							.map((i) => timingDurations[unprotectString(i.instance.part._id)])
							.reduce((memo, item) => (memo || 0) + (item || 0), 0)
					: undefined

				return (
					(segment.items && (
						<div
							key={unprotectString(segment._id)}
							className={ClassNames('rundown__overview__segment', {
								next: segment.items.find((i) => i.instance._id === playlist.nextPartInstanceId) ? true : false,
								live: segment.items.find((i) => i.instance._id === playlist.currentPartInstanceId) ? true : false,
							})}
							style={{
								width: ((segmentDuration || 0) / totalDuration) * 100 + '%',
							}}
						>
							{segment.items.map((item) => {
								return this.renderPart(
									item,
									timingDurations,
									segmentDuration || 0,
									totalDuration,
									playlist.currentPartInstanceId === item.instance._id,
									playlist.nextPartInstanceId === item.instance._id
								)
							})}
							{segment.name && (
								<div
									className="rundown__overview__segment__part__label"
									style={{
										maxWidth: '100%',
									}}
								>
									{segment.name}
									{segmentDuration && _.isNumber(segmentDuration) && (
										<span className="rundown__overview__segment__part__label__duration">
											{RundownUtils.formatDiffToTimecode(segmentDuration, false, false, false, false, true)}
										</span>
									)}
								</div>
							)}
						</div>
					)) ||
					null
				)
			}

			render() {
				if (this.props.playlist && this.props.rundownPlaylistId && this.props.segments) {
					return (
						<ErrorBoundary>
							<div className="rundown__overview">
								{this.props.segments.map((item) => {
									return this.renderSegment(
										this.props.playlist!,
										item,
										(this.props.timingDurations && this.props.timingDurations.partDurations) || {},
										Math.max(
											(this.props.timingDurations && this.props.timingDurations.asPlayedRundownDuration) || 1,
											this.props.playlist!.expectedDuration || 1
										)
									)
								})}
							</div>
						</ErrorBoundary>
					)
				}
				return null
			}
		}
	)
)
