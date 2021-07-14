import { registerCollection, ProtectedString, Time } from '../lib'
import { TimelineObjectCoreExt, TSR, OnGenerateTimelineObj } from '@sofie-automation/blueprints-integration'
import { createMongoCollection } from './lib'
import { StudioId, ResultingMappingRoutes } from './Studios'
import { PartInstanceId } from './PartInstances'
import { PieceInstanceId, PieceInstanceInfiniteId } from './PieceInstances'
import { RundownPlaylistId } from './RundownPlaylists'
import { BlueprintId } from './Blueprints'

export enum TimelineContentTypeOther {
	NOTHING = 'nothing',
	GROUP = 'group',
}

/** A string, identifying a TimelineObj */
export type TimelineObjId = ProtectedString<'TimelineObjId'>
export type TimelineHash = ProtectedString<'TimelineHash'>

export type TimelineEnableExt = TSR.Timeline.TimelineEnable & { setFromNow?: boolean }

export interface OnGenerateTimelineObjExt<TMetadata = unknown, TKeyframeMetadata = unknown>
	extends OnGenerateTimelineObj<TMetadata, TKeyframeMetadata> {
	/** The id of the partInstance this object belongs to */
	partInstanceId: PartInstanceId | null
	/** If this is from an infinite piece, the id of the infinite instance */
	infinitePieceInstanceId?: PieceInstanceInfiniteId
}

export interface TimelineObjGeneric extends TimelineObjectCoreExt {
	/** Unique within a timeline (ie within a studio) */
	id: string
	/** Set when the id of the object is prefixed */
	originalId?: string

	objectType: TimelineObjType

	enable: TimelineEnableExt | TimelineEnableExt[]

	/** The id of the group object this object is in  */
	inGroup?: string
}

export enum TimelineObjType {
	/** Objects played in a rundown */
	RUNDOWN = 'rundown',
}
export interface TimelineObjRundown extends TimelineObjGeneric {
	objectType: TimelineObjType.RUNDOWN
}
export interface TimelineObjGroup extends Omit<TimelineObjGeneric, 'content'> {
	enable: TimelineEnableExt
	content: {
		type: TimelineContentTypeOther.GROUP
	}
	children: TimelineObjGeneric[]
	isGroup: true
}
export type TimelineObjGroupRundown = TimelineObjGroup & Omit<TimelineObjRundown, 'enable'>

export interface StatObjectMetadata {
	versions: {
		core: string
		blueprintId: BlueprintId | undefined
		blueprintVersion: string
		studio: string
	}
}

export interface TimelineObjGroupPart extends TimelineObjGroupRundown {
	isPartGroup: true
}
export interface TimelineObjPartAbstract extends TimelineObjRundown {
	// used for sending callbacks
	content: {
		deviceType: TSR.DeviceType.ABSTRACT
		type: 'callback'
		callBack: 'partPlaybackStarted'
		callBackStopped: 'partPlaybackStopped'
		callBackData: {
			rundownPlaylistId: RundownPlaylistId
			partInstanceId: PartInstanceId
		}
	}
}
export interface TimelineObjPieceAbstract extends TimelineObjRundown {
	// used for sending callbacks
	content: {
		deviceType: TSR.DeviceType.ABSTRACT
		type: 'callback'
		callBack: 'piecePlaybackStarted'
		callBackStopped: 'piecePlaybackStopped'
		callBackData: {
			rundownPlaylistId: RundownPlaylistId
			pieceInstanceId: PieceInstanceId
			dynamicallyInserted?: boolean
		}
	}
}

export function getRoutedTimeline(
	inputTimelineObjs: TimelineObjGeneric[],
	mappingRoutes: ResultingMappingRoutes
): TimelineObjGeneric[] {
	const outputTimelineObjs: TimelineObjGeneric[] = []

	for (const obj of inputTimelineObjs) {
		let inputLayer = obj.layer + ''
		if (obj.isLookahead && obj.lookaheadForLayer) {
			// For lookahead objects, .layer doesn't point to any real layer
			inputLayer = obj.lookaheadForLayer + ''
		}
		const routes = mappingRoutes.existing[inputLayer]
		if (routes) {
			for (let i = 0; i < routes.length; i++) {
				const route = routes[i]
				const routedObj: TimelineObjGeneric = {
					...obj,
					layer: route.outputMappedLayer,
				}
				if (routedObj.isLookahead && routedObj.lookaheadForLayer) {
					// Update lookaheadForLayer to reference the original routed layer:
					updateLookaheadLayer(routedObj)
				}
				if (i > 0) {
					// If there are multiple routes we must rename the ids, so that they stay unique.
					routedObj.id = `_${i}_${routedObj.id}`
				}
				outputTimelineObjs.push(routedObj)
			}
		} else {
			// If no route is found at all, pass it through (backwards compatibility)
			outputTimelineObjs.push(obj)
		}
	}
	return outputTimelineObjs
}
export function updateLookaheadLayer(obj: TimelineObjRundown): void {
	// Set lookaheadForLayer to reference the original layer:
	obj.lookaheadForLayer = obj.layer
	obj.layer += '_lookahead'
}
export interface TimelineComplete {
	/** The id of the timeline. Since there is one (1) timeline in a studio, we can use that id here. */
	_id: StudioId
	/**
	 * The TimelineHash is a random string, which is modified whenever the timeline has changed.
	 * It is used in the playout-gateway to be able to report back resolve-times
	 */
	timelineHash: TimelineHash
	/** Timestamp when the timeline is generated */
	generated: Time
	/** Array containing all timeline-objects */
	timeline: Array<TimelineObjGeneric>
}

// export const Timeline = createMongoCollection<TimelineObj>('timeline')
export const Timeline = createMongoCollection<TimelineComplete, TimelineComplete>('timeline')
registerCollection('Timeline', Timeline)

// Note: this index is always created by default, so it's not needed.
// registerIndex(Timeline, {
// 	_id: 1,
// })
