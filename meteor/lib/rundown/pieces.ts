import { ReadonlyDeep } from 'type-fest'
import { PieceInstanceWithTimings } from './infinites'
import {
	TimelineObjRundown,
	TimelineContentTypeOther,
	TimelineObjType,
	TimelineObjGroupRundown,
	OnGenerateTimelineObjExt,
} from '../collections/Timeline'
import { TSR } from '@sofie-automation/blueprints-integration'
import { literal, unprotectString } from '../lib'
import { clone } from 'underscore'
import { PieceInstanceId } from '../collections/PieceInstances'
import { getPieceGroupId } from './timeline'

export interface PieceTimelineMetadata {
	isPieceTimeline: boolean
}

export interface PieceGroupMetadata extends PieceTimelineMetadata {
	pieceId: PieceInstanceId
}

export function createPieceGroupAndCap(
	pieceInstance: Pick<
		ReadonlyDeep<PieceInstanceWithTimings>,
		'_id' | 'rundownId' | 'piece' | 'infinite' | 'resolvedEndCap' | 'priority' | 'partInstanceId' | 'userDuration'
	>,
	partGroup?: TimelineObjRundown,
	pieceEnable?: TSR.Timeline.TimelineEnable
): {
	pieceGroup: TimelineObjGroupRundown & OnGenerateTimelineObjExt<PieceGroupMetadata>
	capObjs: Array<TimelineObjRundown & OnGenerateTimelineObjExt>
} {
	if (pieceEnable) {
		pieceEnable = clone(pieceEnable)
	} else {
		if (pieceInstance.userDuration) {
			pieceEnable = {
				start: pieceInstance.piece.enable.start,
				end: pieceInstance.userDuration.end,
			}
		} else {
			pieceEnable = clone(pieceInstance.piece.enable)
		}
	}

	const pieceGroup = literal<TimelineObjGroupRundown & OnGenerateTimelineObjExt<PieceGroupMetadata>>({
		id: getPieceGroupId(pieceInstance),
		content: {
			deviceType: TSR.DeviceType.ABSTRACT,
			type: TimelineContentTypeOther.GROUP,
		},
		children: [],
		inGroup: partGroup && partGroup.id,
		isGroup: true,
		pieceInstanceId: unprotectString(pieceInstance._id),
		infinitePieceInstanceId: pieceInstance.infinite?.infiniteInstanceId,
		partInstanceId: pieceInstance.partInstanceId,
		objectType: TimelineObjType.RUNDOWN,
		enable: pieceEnable,
		layer: pieceInstance.piece.sourceLayerId,
		priority: pieceInstance.priority,
		metaData: literal<PieceGroupMetadata>({
			pieceId: pieceInstance._id,
			isPieceTimeline: true,
		}),
	})

	const capObjs: Array<TimelineObjRundown & OnGenerateTimelineObjExt> = []

	let nowObj: (TimelineObjRundown & OnGenerateTimelineObjExt) | undefined
	if (pieceInstance.resolvedEndCap === 'now') {
		// TODO - there could already be a piece with a cap of 'now' that we could use as our end time
		// As the cap is for 'now', rather than try to get tsr to understand `end: 'now'`, we can create a 'now' object to tranlate it
		nowObj = literal<TimelineObjRundown & OnGenerateTimelineObjExt>({
			objectType: TimelineObjType.RUNDOWN,
			id: `${pieceGroup.id}_cap_now`,
			enable: {
				start: 'now',
			},
			layer: '',
			content: {
				deviceType: TSR.DeviceType.ABSTRACT,
			},
			partInstanceId: pieceGroup.partInstanceId,
			metaData: literal<PieceTimelineMetadata>({
				isPieceTimeline: true,
			}),
		})
		capObjs.push(nowObj)
	}

	if (pieceGroup.enable.duration !== undefined || pieceGroup.enable.end !== undefined) {
		let updatedPieceGroup = false
		if (typeof pieceInstance.resolvedEndCap === 'number') {
			// If everything is numeric, we can keep it simple and flatten it out here
			if (typeof pieceGroup.enable.end === 'number') {
				updatedPieceGroup = true
				pieceGroup.enable.end = Math.min(pieceGroup.enable.end, pieceInstance.resolvedEndCap)
			} else if (typeof pieceGroup.enable.start === 'number' && typeof pieceGroup.enable.duration === 'number') {
				updatedPieceGroup = true
				pieceGroup.enable.end = Math.min(
					pieceGroup.enable.start + pieceGroup.enable.duration,
					pieceInstance.resolvedEndCap
				)
				delete pieceGroup.enable.duration
			}
		}

		if (!updatedPieceGroup && pieceInstance.resolvedEndCap !== undefined) {
			// Create a wrapper group to apply the end cap
			const pieceEndCapGroup = literal<TimelineObjGroupRundown & OnGenerateTimelineObjExt>({
				objectType: TimelineObjType.RUNDOWN,
				id: `${pieceGroup.id}_cap`,
				enable: {
					start: 0,
					end: nowObj ? `#${nowObj.id}.start` : pieceInstance.resolvedEndCap,
				},
				layer: '',
				children: [],
				content: {
					deviceType: TSR.DeviceType.ABSTRACT,
					type: TimelineContentTypeOther.GROUP,
				},
				isGroup: true,
				inGroup: partGroup && partGroup.id,
				partInstanceId: pieceGroup.partInstanceId,
				metaData: literal<PieceTimelineMetadata>({
					isPieceTimeline: true,
				}),
			})
			capObjs.push(pieceEndCapGroup)
			pieceGroup.inGroup = pieceEndCapGroup.id
		}
	} else {
		pieceGroup.enable.end = nowObj ? `#${nowObj.id}.start` : pieceInstance.resolvedEndCap
	}

	return { pieceGroup, capObjs }
}
