import React, { useRef, useState } from 'react'
import { SmallPartFlag } from '../../../lib/ui/icons/segment'
import { ISourceLayer } from '@sofie-automation/blueprints-integration'
import { SegmentTimelineSmallPartFlagIcon } from './SegmentTimelineSmallPartFlagIcon'
import { protectString, unprotectString } from '../../../../lib/lib'
import { PartUi, SegmentUi } from '../SegmentTimelineContainer'
import { RundownPlaylist } from '../../../../lib/collections/RundownPlaylists'
import { Studio } from '../../../../lib/collections/Studios'
import { SegmentTimelinePartHoverPreview } from './SegmentTimelinePartHoverPreview'
import { TFunction } from 'i18next'
import RundownViewEventBus, { RundownViewEvents } from '../../RundownView/RundownViewEventBus'

export const SegmentTimelineSmallPartFlag = ({
	t,
	parts,
	followingPart,
	sourceLayers,
	timeScale,

	segment,
	playlist,
	studio,
	collapsedOutputs,
	autoNextPart,
	liveLineHistorySize,
	isLastSegment,
	isLastInSegment,
}: {
	t: TFunction
	parts: [PartUi, number][]
	followingPart: PartUi | undefined
	sourceLayers: {
		[key: string]: ISourceLayer
	}
	timeScale: number

	segment: SegmentUi
	playlist: RundownPlaylist
	studio: Studio
	collapsedOutputs: {
		[key: string]: boolean
	}
	autoNextPart: boolean
	liveLineHistorySize: number
	isLastSegment: boolean
	isLastInSegment: boolean
	timelineWidth: number
}) => {
	const flagRef = useRef<HTMLDivElement>(null)

	const [isHover, setHover] = useState(false)
	const onMouseEnter = () => {
		setHover(true)
	}
	const onMouseLeave = () => {
		setHover(false)
	}

	const onClickFlagIcon = (e: React.MouseEvent<HTMLDivElement>) => {
		const partInstanceId = e.currentTarget.dataset['partInstanceId'] // note this needs to match the contents of the data prop in SegmentTimelineSmallPartFlagIcon
		if (partInstanceId) {
			RundownViewEventBus.emit(RundownViewEvents.GO_TO_PART_INSTANCE, {
				segmentId: segment._id,
				partInstanceId: protectString(partInstanceId),
				zoomInToFit: true,
				context: e,
			})
		}
	}

	let partDurations = 0
	const partFlags = parts.map(([part, duration]) => {
		partDurations += duration
		return (
			<SegmentTimelineSmallPartFlagIcon
				key={unprotectString(part.instance._id)}
				partInstance={part}
				sourceLayers={sourceLayers}
				isNext={playlist.nextPartInstanceId === part.instance._id}
				isLive={playlist.currentPartInstanceId === part.instance._id}
				onClick={onClickFlagIcon}
				data={{
					'data-part-instance-id': part.instance._id, // this needs to match with onFlagClick handler
				}}
			/>
		)
	})
	return (
		<div className="segment-timeline__small-parts-flag-hoist">
			<div
				className="segment-timeline__small-parts-flag"
				ref={flagRef}
				onMouseEnter={onMouseEnter}
				onMouseLeave={onMouseLeave}
				style={{
					transform: `translateX(${(partDurations * timeScale) / -2}px)`,
				}}
			>
				<SmallPartFlag className="segment-timeline__small-parts-flag-pointer" />
				{partFlags}
			</div>
			<SegmentTimelinePartHoverPreview
				t={t}
				autoNextPart={autoNextPart}
				collapsedOutputs={collapsedOutputs}
				studio={studio}
				showMiniInspector={isHover}
				followingPart={followingPart}
				parts={parts.map(([part]) => part)}
				segment={segment}
				playlist={playlist}
				liveLineHistorySize={liveLineHistorySize}
				isLastSegment={isLastSegment}
				isLastInSegment={isLastInSegment}
				totalSegmentDuration={partDurations}
				parentTimeScale={timeScale}
			/>
		</div>
	)
}
