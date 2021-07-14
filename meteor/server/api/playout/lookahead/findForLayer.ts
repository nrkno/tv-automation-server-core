import { PartInstanceId } from '../../../../lib/collections/PartInstances'
import { Part } from '../../../../lib/collections/Parts'
import { OnGenerateTimelineObjExt, TimelineObjRundown } from '../../../../lib/collections/Timeline'
import { profiler } from '../../profiler'
import { sortPieceInstancesByStart } from '../pieces'
import { findLookaheadObjectsForPart } from './findObjects'
import { PartAndPieces, PartInstanceAndPieceInstances } from './util'

export interface LookaheadResult {
	timed: Array<TimelineObjRundown & OnGenerateTimelineObjExt>
	future: Array<TimelineObjRundown & OnGenerateTimelineObjExt>
}

export function findLookaheadForLayer(
	currentPartInstanceId: PartInstanceId | null,
	partInstancesInfo: PartInstanceAndPieceInstances[],
	previousPartInstanceInfo: PartInstanceAndPieceInstances | undefined,
	orderedPartInfos: Array<PartAndPieces>,
	layer: string,
	lookaheadTargetFutureObjects: number,
	lookaheadMaxSearchDistance: number
): LookaheadResult {
	const span = profiler.startSpan(`findLookaheadForlayer.${layer}`)
	const res: LookaheadResult = {
		timed: [],
		future: [],
	}

	// Track the previous info for checking how the timeline will be built
	let previousPart: Part | undefined
	if (previousPartInstanceInfo) {
		previousPart = previousPartInstanceInfo.part.part
	}

	// Generate timed/future objects for the partInstances
	for (const partInstanceInfo of partInstancesInfo) {
		if (!partInstanceInfo.onTimeline && lookaheadMaxSearchDistance <= 0) break

		const partInfo: PartAndPieces = {
			part: partInstanceInfo.part.part,
			pieces: sortPieceInstancesByStart(partInstanceInfo.allPieces, partInstanceInfo.nowInPart),
		}

		const objs = findLookaheadObjectsForPart(
			currentPartInstanceId,
			layer,
			previousPart,
			partInfo,
			partInstanceInfo.part._id
		)

		if (partInstanceInfo.onTimeline) {
			res.timed.push(...objs)
		} else {
			res.future.push(...objs)
		}

		previousPart = partInfo.part
	}

	if (lookaheadMaxSearchDistance > 1 && lookaheadTargetFutureObjects > 0) {
		for (const partInfo of orderedPartInfos.slice(0, lookaheadMaxSearchDistance - 1)) {
			// Stop if we have enough objects already
			if (res.future.length >= lookaheadTargetFutureObjects) {
				break
			}

			if (partInfo.pieces.length > 0 && partInfo.part.isPlayable()) {
				const objs = findLookaheadObjectsForPart(currentPartInstanceId, layer, previousPart, partInfo, null)
				res.future.push(...objs)
				previousPart = partInfo.part
			}
		}
	}

	if (span) span.end()
	return res
}
