import _ from 'underscore'
import { PartInstance, PartInstanceId } from '../collections/PartInstances'
import { PieceInstance, PieceInstancePiece, rewrapPieceToInstance } from '../collections/PieceInstances'
import { DBPart, PartId } from '../collections/Parts'
import { Piece } from '../collections/Pieces'
import { SegmentId } from '../collections/Segments'
import { PieceLifespan } from '@sofie-automation/blueprints-integration'
import {
	assertNever,
	max,
	flatten,
	literal,
	protectString,
	normalizeArrayFuncFilter,
	unprotectString,
	getRandomId,
} from '../lib'
import { Mongo } from 'meteor/mongo'
import { ShowStyleBase, ShowStyleBaseId } from '../collections/ShowStyleBases'
import { getPieceGroupId } from './timeline'
import { RundownPlaylistActivationId } from '../collections/RundownPlaylists'
import { ReadonlyDeep } from 'type-fest'
import { Rundown, RundownId } from '../collections/Rundowns'

export function buildPiecesStartingInThisPartQuery(part: DBPart): Mongo.Query<Piece> {
	return { startPartId: part._id }
}

export function buildPastInfinitePiecesForThisPartQuery(
	part: DBPart,
	partsIdsBeforeThisInSegment: PartId[],
	segmentsIdsBeforeThisInRundown: SegmentId[],
	rundownIdsBeforeThisInPlaylist: RundownId[]
): Mongo.Query<Piece> | null {
	const fragments = _.compact([
		partsIdsBeforeThisInSegment.length > 0
			? {
					// same segment, and previous part
					lifespan: {
						$in: [
							PieceLifespan.OutOnSegmentEnd,
							PieceLifespan.OutOnSegmentChange,
							PieceLifespan.OutOnRundownEnd,
							PieceLifespan.OutOnRundownChange,
							PieceLifespan.OutOnShowStyleEnd,
						],
					},
					startRundownId: part.rundownId,
					startSegmentId: part.segmentId,
					startPartId: { $in: partsIdsBeforeThisInSegment },
			  }
			: undefined,
		segmentsIdsBeforeThisInRundown.length > 0
			? {
					// same rundown, and previous segment
					lifespan: {
						$in: [
							PieceLifespan.OutOnRundownEnd,
							PieceLifespan.OutOnRundownChange,
							PieceLifespan.OutOnShowStyleEnd,
						],
					},
					startRundownId: part.rundownId,
					startSegmentId: { $in: segmentsIdsBeforeThisInRundown },
			  }
			: undefined,
		rundownIdsBeforeThisInPlaylist.length > 0
			? {
					// previous rundown
					lifespan: {
						$in: [PieceLifespan.OutOnShowStyleEnd],
					},
					startRundownId: { $in: rundownIdsBeforeThisInPlaylist },
			  }
			: undefined,
	])

	if (fragments.length === 0) {
		return null
	} else if (fragments.length === 1) {
		return {
			invalid: { $ne: true },
			startPartId: { $ne: part._id },
			...fragments[0],
		}
	} else {
		return {
			invalid: { $ne: true },
			startPartId: { $ne: part._id },
			$or: fragments,
		}
	}
}

export function getPlayheadTrackingInfinitesForPart(
	playlistActivationId: RundownPlaylistActivationId,
	partsBeforeThisInSegmentSet: Set<PartId>,
	segmentsBeforeThisInRundownSet: Set<SegmentId>,
	rundownsBeforeThisInPlaylist: RundownId[],
	rundownsToShowstyles: Map<RundownId, ShowStyleBaseId>,
	currentPartInstance: PartInstance,
	currentPartPieceInstances: PieceInstance[],
	rundown: ReadonlyDeep<Rundown>,
	part: DBPart,
	newInstanceId: PartInstanceId,
	nextPartIsAfterCurrentPart: boolean,
	isTemporary: boolean
): PieceInstance[] {
	const canContinueAdlibOnEnds = nextPartIsAfterCurrentPart
	interface InfinitePieceSet {
		[PieceLifespan.OutOnShowStyleEnd]?: PieceInstance
		[PieceLifespan.OutOnRundownEnd]?: PieceInstance
		[PieceLifespan.OutOnSegmentEnd]?: PieceInstance
		onChange?: PieceInstance
	}
	const piecesOnSourceLayers = new Map<string, InfinitePieceSet>()

	const canContinueShowStyleEndInfinites = continueShowStyleEndInfinites(
		rundownsBeforeThisInPlaylist,
		rundownsToShowstyles,
		currentPartInstance.rundownId,
		rundown
	)

	const groupedPlayingPieceInstances = _.groupBy(currentPartPieceInstances, (p) => p.piece.sourceLayerId)
	for (const [sourceLayerId, pieceInstances] of Object.entries(groupedPlayingPieceInstances)) {
		// Find the ones that starts last. Note: any piece will stop an onChange
		const lastPiecesByStart = _.groupBy(pieceInstances, (p) => p.piece.enable.start)
		let lastPieceInstances = lastPiecesByStart['now'] || []
		if (lastPieceInstances.length === 0) {
			const target = max(Object.keys(lastPiecesByStart), (k) => Number(k))
			if (target !== undefined) {
				lastPieceInstances = lastPiecesByStart[target] || []
			}
		}

		// Some basic resolving, to figure out which is our candidate
		let lastPieceInstance: PieceInstance | undefined
		for (const candidate of lastPieceInstances) {
			if (lastPieceInstance === undefined || isCandidateBetterToBeContinued(lastPieceInstance, candidate)) {
				lastPieceInstance = candidate
			}
		}

		if (lastPieceInstance && !lastPieceInstance.stoppedPlayback && !lastPieceInstance.userDuration) {
			// If it is an onChange, then it may want to continue
			let isUsed = false
			switch (lastPieceInstance.piece.lifespan) {
				case PieceLifespan.OutOnSegmentChange:
					if (currentPartInstance.segmentId === part.segmentId) {
						// Still in the same segment
						isUsed = true
					}
					break
				case PieceLifespan.OutOnRundownChange:
					if (lastPieceInstance.rundownId === part.rundownId) {
						// Still in the same rundown
						isUsed = true
					}
					break
			}

			if (isUsed) {
				const pieceSet = piecesOnSourceLayers.get(sourceLayerId) ?? {}
				pieceSet.onChange = lastPieceInstance
				piecesOnSourceLayers.set(sourceLayerId, pieceSet)
				// This may get pruned later, if somethng else has a start of 0
			}
		}

		// Check if we should persist any adlib onEnd infinites
		if (canContinueAdlibOnEnds) {
			const piecesByInfiniteMode = _.groupBy(pieceInstances, (p) => p.piece.lifespan)
			for (const mode0 of [
				PieceLifespan.OutOnRundownEnd,
				PieceLifespan.OutOnSegmentEnd,
				PieceLifespan.OutOnShowStyleEnd,
			]) {
				const mode = mode0 as
					| PieceLifespan.OutOnRundownEnd
					| PieceLifespan.OutOnSegmentEnd
					| PieceLifespan.OutOnShowStyleEnd
				const pieces = (piecesByInfiniteMode[mode] || []).filter(
					(p) => p.infinite && (p.infinite.fromPreviousPlayhead || p.dynamicallyInserted)
				)
				// This is the piece we may copy across
				const candidatePiece =
					pieces.find((p) => p.piece.enable.start === 'now') ?? max(pieces, (p) => p.piece.enable.start)
				if (candidatePiece && !candidatePiece.stoppedPlayback && !candidatePiece.userDuration) {
					// Check this infinite is allowed to continue to this part
					let isValid = false
					switch (mode) {
						case PieceLifespan.OutOnSegmentEnd:
							isValid =
								currentPartInstance.segmentId === part.segmentId &&
								partsBeforeThisInSegmentSet.has(candidatePiece.piece.startPartId)
							break
						case PieceLifespan.OutOnRundownEnd:
							isValid =
								candidatePiece.rundownId === part.rundownId &&
								(segmentsBeforeThisInRundownSet.has(currentPartInstance.segmentId) ||
									currentPartInstance.segmentId === part.segmentId)
							break
						case PieceLifespan.OutOnShowStyleEnd:
							isValid = canContinueShowStyleEndInfinites
					}

					if (isValid) {
						const pieceSet = piecesOnSourceLayers.get(sourceLayerId) ?? {}
						pieceSet[mode] = candidatePiece
						piecesOnSourceLayers.set(sourceLayerId, pieceSet)
					}
				}
			}
		}
	}

	const rewrapInstance = (p: PieceInstance | undefined): PieceInstance | undefined => {
		if (p) {
			const instance = rewrapPieceToInstance(
				p.piece,
				playlistActivationId,
				part.rundownId,
				newInstanceId,
				isTemporary
			)
			instance._id = protectString(`${instance._id}_continue`)
			instance.dynamicallyInserted = p.dynamicallyInserted
			instance.adLibSourceId = p.adLibSourceId
			instance.startedPlayback = p.startedPlayback

			if (p.infinite) {
				// This was copied from before, so we know we can force the time to 0
				instance.piece = {
					...instance.piece,
					enable: {
						start: 0,
					},
				}
				instance.infinite = {
					...p.infinite,
					fromPreviousPart: true,
					fromPreviousPlayhead: true,
				}

				return instance
			}
		}
		return undefined
	}

	return flatten(
		Array.from(piecesOnSourceLayers.values()).map((ps) => {
			return _.compact(Object.values(ps).map(rewrapInstance))
		})
	)
}

export function isPiecePotentiallyActiveInPart(
	previousPartInstance: PartInstance | undefined,
	partsBeforeThisInSegment: Set<PartId>,
	segmentsBeforeThisInRundown: Set<SegmentId>,
	rundownsBeforeThisInPlaylist: RundownId[],
	rundownsToShowstyles: Map<RundownId, ShowStyleBaseId>,
	rundown: ReadonlyDeep<Rundown>,
	part: DBPart,
	pieceToCheck: Piece
): boolean {
	// If its from the current part
	if (pieceToCheck.startPartId === part._id) {
		return true
	}

	switch (pieceToCheck.lifespan) {
		case PieceLifespan.WithinPart:
			// This must be from another part
			return false
		case PieceLifespan.OutOnSegmentEnd:
			return (
				pieceToCheck.startSegmentId === part.segmentId && partsBeforeThisInSegment.has(pieceToCheck.startPartId)
			)
		case PieceLifespan.OutOnRundownEnd:
			if (pieceToCheck.startRundownId === part.rundownId) {
				if (pieceToCheck.startSegmentId === part.segmentId) {
					return partsBeforeThisInSegment.has(pieceToCheck.startPartId)
				} else {
					return segmentsBeforeThisInRundown.has(pieceToCheck.startSegmentId)
				}
			} else {
				return false
			}
		case PieceLifespan.OutOnSegmentChange:
			if (previousPartInstance !== undefined) {
				// This gets handled by getPlayheadTrackingInfinitesForPart
				// We will only copy the pieceInstance from the previous, never using the original piece
				return false
			} else {
				// Predicting what will happen at arbitrary point in the future
				return (
					pieceToCheck.startSegmentId === part.segmentId &&
					partsBeforeThisInSegment.has(pieceToCheck.startPartId)
				)
			}
		case PieceLifespan.OutOnRundownChange:
			if (previousPartInstance !== undefined) {
				// This gets handled by getPlayheadTrackingInfinitesForPart
				// We will only copy the pieceInstance from the previous, never using the original piece
				return false
			} else {
				// Predicting what will happen at arbitrary point in the future
				return (
					pieceToCheck.startRundownId === part.rundownId &&
					segmentsBeforeThisInRundown.has(pieceToCheck.startSegmentId)
				)
			}
		case PieceLifespan.OutOnShowStyleEnd:
			return previousPartInstance && pieceToCheck.lifespan === PieceLifespan.OutOnShowStyleEnd
				? continueShowStyleEndInfinites(
						rundownsBeforeThisInPlaylist,
						rundownsToShowstyles,
						previousPartInstance.rundownId,
						rundown
				  )
				: false
		default:
			assertNever(pieceToCheck.lifespan)
			return false
	}
}

export function getPieceInstancesForPart(
	playlistActivationId: RundownPlaylistActivationId,
	playingPartInstance: PartInstance | undefined,
	playingPieceInstances: PieceInstance[] | undefined,
	rundown: ReadonlyDeep<Rundown>,
	part: DBPart,
	partsBeforeThisInSegmentSet: Set<PartId>,
	segmentsBeforeThisInRundownSet: Set<SegmentId>,
	rundownsBeforeThisInPlaylist: RundownId[],
	rundownsToShowstyles: Map<RundownId, ShowStyleBaseId>,
	possiblePieces: Piece[],
	orderedPartIds: PartId[],
	newInstanceId: PartInstanceId,
	nextPartIsAfterCurrentPart: boolean,
	isTemporary: boolean
): PieceInstance[] {
	const doesPieceAStartBeforePieceB = (pieceA: PieceInstancePiece, pieceB: PieceInstancePiece): boolean => {
		if (pieceA.startPartId === pieceB.startPartId) {
			return pieceA.enable.start < pieceB.enable.start
		}
		const pieceAIndex = orderedPartIds.indexOf(pieceA.startPartId)
		const pieceBIndex = orderedPartIds.indexOf(pieceB.startPartId)

		if (pieceAIndex === -1) {
			return false
		} else if (pieceBIndex === -1) {
			return true
		} else if (pieceAIndex < pieceBIndex) {
			return true
		} else {
			return false
		}
	}

	interface InfinitePieceSet {
		[PieceLifespan.OutOnShowStyleEnd]?: Piece
		[PieceLifespan.OutOnRundownEnd]?: Piece
		[PieceLifespan.OutOnSegmentEnd]?: Piece
		// onChange?: PieceInstance
	}
	const piecesOnSourceLayers = new Map<string, InfinitePieceSet>()

	// Filter down to the last starting onEnd infinite per layer
	for (const candidatePiece of possiblePieces) {
		if (
			candidatePiece.startPartId !== part._id &&
			(candidatePiece.lifespan === PieceLifespan.OutOnShowStyleEnd ||
				candidatePiece.lifespan === PieceLifespan.OutOnRundownEnd ||
				candidatePiece.lifespan === PieceLifespan.OutOnSegmentEnd)
		) {
			const useIt = isPiecePotentiallyActiveInPart(
				playingPartInstance,
				partsBeforeThisInSegmentSet,
				segmentsBeforeThisInRundownSet,
				rundownsBeforeThisInPlaylist,
				rundownsToShowstyles,
				rundown,
				part,
				candidatePiece
			)

			if (useIt) {
				const pieceSet = piecesOnSourceLayers.get(candidatePiece.sourceLayerId) ?? {}
				const existingPiece = pieceSet[candidatePiece.lifespan]
				if (!existingPiece || doesPieceAStartBeforePieceB(existingPiece, candidatePiece)) {
					pieceSet[candidatePiece.lifespan] = candidatePiece
					piecesOnSourceLayers.set(candidatePiece.sourceLayerId, pieceSet)
				}
			}
		}
	}

	// OnChange infinites take priority over onEnd, as they travel with the playhead
	const infinitesFromPrevious = playingPartInstance
		? getPlayheadTrackingInfinitesForPart(
				playlistActivationId,
				partsBeforeThisInSegmentSet,
				segmentsBeforeThisInRundownSet,
				rundownsBeforeThisInPlaylist,
				rundownsToShowstyles,
				playingPartInstance,
				playingPieceInstances || [],
				rundown,
				part,
				newInstanceId,
				nextPartIsAfterCurrentPart,
				isTemporary
		  )
		: []

	// Compile the resulting list

	const playingPieceInstancesMap = normalizeArrayFuncFilter(playingPieceInstances ?? [], (p) =>
		unprotectString(p.infinite?.infiniteInstanceId)
	)

	const wrapPiece = (p: PieceInstancePiece) => {
		const instance = rewrapPieceToInstance(p, playlistActivationId, part.rundownId, newInstanceId, isTemporary)

		if (!instance.infinite && instance.piece.lifespan !== PieceLifespan.WithinPart) {
			const existingPiece = playingPieceInstancesMap[unprotectString(instance.piece._id)]
			instance.infinite = {
				infiniteInstanceId: existingPiece?.infinite?.infiniteInstanceId ?? getRandomId(),
				infinitePieceId: instance.piece._id,
				fromPreviousPart: false, // Set below
			}
		}

		if (instance.infinite) {
			instance.infinite.fromPreviousPart = instance.piece.startPartId !== part._id

			if (instance.infinite.fromPreviousPart) {
				// If this is not the start point, it should start at 0
				// Note: this should not be setitng fromPreviousPlayhead, as it is not from the playhead
				instance.piece = {
					...instance.piece,
					enable: {
						start: 0,
					},
				}
			}
		}

		return instance
	}

	const normalPieces = possiblePieces.filter((p) => p.startPartId === part._id)
	const result = normalPieces.map(wrapPiece).concat(infinitesFromPrevious)
	for (const pieceSet of Array.from(piecesOnSourceLayers.values())) {
		const onEndPieces = _.compact([
			pieceSet[PieceLifespan.OutOnShowStyleEnd],
			pieceSet[PieceLifespan.OutOnRundownEnd],
			pieceSet[PieceLifespan.OutOnSegmentEnd],
		])
		result.push(...onEndPieces.map(wrapPiece))

		// if (pieceSet.onChange) {
		// 	result.push(rewrapInstance(pieceSet.onChange))
		// }
	}

	return result
}

export interface PieceInstanceWithTimings extends PieceInstance {
	/**
	 * This is a maximum end point of the pieceInstance.
	 * If the pieceInstance also has a enable.duration or userDuration set then the shortest one will need to be used
	 * This can be:
	 *  - 'now', if it was stopped by something that does not need a preroll (or is virtual)
	 *  - '#something.start + 100', if it was stopped by something that needs a preroll
	 *  - '100', if not relative to now at all
	 */
	resolvedEndCap?: number | string
	priority: number
}

function offsetFromStart(start: number | 'now', newPiece: PieceInstance): number | string {
	const offset = newPiece.piece.adlibPreroll
	if (!offset) return start

	return typeof start === 'number' ? start + offset : `#${getPieceGroupId(newPiece)}.start + ${offset}`
}

/**
 * Process the infinite pieces to determine the start time and a maximum end time for each.
 * Any pieces which have no chance of being shown (duplicate start times) are pruned
 * The stacking order of infinites is considered, to define the stop times
 */
export function processAndPrunePieceInstanceTimings(
	showStyle: ReadonlyDeep<ShowStyleBase>,
	pieces: PieceInstance[],
	nowInPart: number,
	keepDisabledPieces?: boolean,
	includeVirtual?: boolean
): PieceInstanceWithTimings[] {
	const result: PieceInstanceWithTimings[] = []

	const isClear = (piece?: PieceInstance): boolean => !!piece?.piece.virtual

	const updateWithNewPieces = (
		activePieces: PieceInstanceOnInfiniteLayers,
		newPieces: PieceInstanceOnInfiniteLayers,
		key: keyof PieceInstanceOnInfiniteLayers,
		start: number | 'now'
	): void => {
		const newPiece = newPieces[key]
		if (newPiece) {
			const activePiece = activePieces[key]
			if (activePiece) {
				activePiece.resolvedEndCap = offsetFromStart(start, newPiece)
			}

			// We don't want to include virtual pieces in the output (most of the time)
			// TODO - do we want to always output virtual pieces from the 'other' group?
			if (!isClear(newPiece) || key === 'other' || includeVirtual) {
				// track the new piece
				activePieces[key] = newPiece
				result.push(newPiece)

				if (
					key === 'onSegmentEnd' ||
					(key === 'onRundownEnd' && !activePieces.onSegmentEnd) ||
					(key === 'onShowStyleEnd' && !activePieces.onSegmentEnd && !activePieces.onRundownEnd)
				) {
					// when start === 0, we are likely to have multiple infinite continuations. Only stop the 'other' if it should not be considered for being on air
					if (
						activePieces.other &&
						(start !== 0 || isCandidateBetterToBeContinued(activePieces.other, newPiece))
					) {
						// These modes should stop the 'other' when they start if not hidden behind a higher priority onEnd
						activePieces.other.resolvedEndCap = offsetFromStart(start, newPiece)
						activePieces.other = undefined
					}
				}
			} else {
				// the piece has stopped with no replacement, so clear the tracking state
				activePieces[key] = undefined
			}
		}
	}

	// We want to group by exclusive groups, to let them be resolved
	const exclusiveGroupMap = new Map<string, string>()
	for (const layer of showStyle.sourceLayers) {
		if (layer.exclusiveGroup) {
			exclusiveGroupMap.set(layer._id, layer.exclusiveGroup)
		}
	}

	const groupedPieces = _.groupBy(
		keepDisabledPieces ? pieces : pieces.filter((p) => !p.disabled),
		// At this stage, if a Piece is disabled, the `keepDisabledPieces` must be turned on. If that's the case
		// we split out the disabled Pieces onto the sourceLayerId they actually exist on, instead of putting them
		// onto the shared "exclusivityGroup" layer. This may cause it to not display "exactly" accurately
		// while in the disabled state, but it should keep it from affecting any not-disabled Pieces.
		(p) =>
			p.disabled ? p.piece.sourceLayerId : exclusiveGroupMap.get(p.piece.sourceLayerId) || p.piece.sourceLayerId
	)
	for (const pieces of Object.values(groupedPieces)) {
		// Group and sort the pieces so that we can step through each point in time
		const piecesByStart: Array<[number | 'now', PieceInstance[]]> = _.sortBy(
			Object.entries(_.groupBy(pieces, (p) => p.piece.enable.start)).map(([k, v]) =>
				literal<[number | 'now', PieceInstance[]]>([k === 'now' ? 'now' : Number(k), v])
			),
			([k]) => (k === 'now' ? nowInPart : k)
		)

		// Step through time
		const activePieces: PieceInstanceOnInfiniteLayers = {}
		for (const [start, pieces] of piecesByStart) {
			const newPieces = findPieceInstancesOnInfiniteLayers(pieces)

			// Apply the updates
			// Note: order is important, the higher layers must be done first
			updateWithNewPieces(activePieces, newPieces, 'other', start)
			updateWithNewPieces(activePieces, newPieces, 'onSegmentEnd', start)
			updateWithNewPieces(activePieces, newPieces, 'onRundownEnd', start)
			updateWithNewPieces(activePieces, newPieces, 'onShowStyleEnd', start)
		}
	}

	// Strip out any pieces that start and end at the same point
	return result.filter((p) => p.resolvedEndCap === undefined || p.resolvedEndCap !== p.piece.enable.start)
}

function isCandidateBetterToBeContinued(best: PieceInstance, candidate: PieceInstance): boolean {
	// Prioritise the one from this part over previous part
	if (best.infinite?.fromPreviousPart && !candidate.infinite?.fromPreviousPart) {
		// Prefer the candidate as it is not from previous
		return true
	}
	if (!best.infinite?.fromPreviousPart && candidate.infinite?.fromPreviousPart) {
		// Prefer the best as it is not from previous
		return false
	}

	// If we have adlibs, prefer the newest
	if (best.dynamicallyInserted && candidate.dynamicallyInserted) {
		// prefer the one which starts later
		return best.dynamicallyInserted < candidate.dynamicallyInserted
	} else if (best.dynamicallyInserted) {
		// Prefer the adlib
		return false
	} else if (candidate.dynamicallyInserted) {
		// Prefer the adlib
		return true
	} else {
		// Neither are adlibs, try other things
	}

	// If one is virtual, prefer that
	if (best.piece.virtual && !candidate.piece.virtual) {
		// Prefer the virtual best
		return false
	}
	if (!best.piece.virtual && candidate.piece.virtual) {
		// Prefer the virtual candidate
		return true
	}

	// Fallback to id, as we dont have any other criteria and this will be stable.
	// Note: we shouldnt even get here, as it shouldnt be possible for multiple to start at the same time, but it is possible
	return best.piece._id < candidate.piece._id
}

interface PieceInstanceOnInfiniteLayers {
	onShowStyleEnd?: PieceInstanceWithTimings
	onRundownEnd?: PieceInstanceWithTimings
	onSegmentEnd?: PieceInstanceWithTimings
	other?: PieceInstanceWithTimings
}
function findPieceInstancesOnInfiniteLayers(pieces: PieceInstance[]): PieceInstanceOnInfiniteLayers {
	if (pieces.length === 0) {
		return {}
	}

	const res: PieceInstanceOnInfiniteLayers = {}

	for (const piece of pieces) {
		switch (piece.piece.lifespan) {
			case PieceLifespan.OutOnShowStyleEnd:
				if (!res.onShowStyleEnd || isCandidateBetterToBeContinued(res.onShowStyleEnd, piece)) {
					res.onShowStyleEnd = {
						...piece,
						priority: 0,
					}
				}
				break
			case PieceLifespan.OutOnRundownEnd:
				if (!res.onRundownEnd || isCandidateBetterToBeContinued(res.onRundownEnd, piece)) {
					res.onRundownEnd = {
						...piece,
						priority: 1,
					}
				}
				break
			case PieceLifespan.OutOnSegmentEnd:
				if (!res.onSegmentEnd || isCandidateBetterToBeContinued(res.onSegmentEnd, piece)) {
					res.onSegmentEnd = {
						...piece,
						priority: 2,
					}
				}
				break
			case PieceLifespan.OutOnRundownChange:
			case PieceLifespan.OutOnSegmentChange:
			case PieceLifespan.WithinPart:
				if (!res.other || isCandidateBetterToBeContinued(res.other, piece)) {
					res.other = {
						...piece,
						priority: 5,
					}
				}
				break
			default:
				assertNever(piece.piece.lifespan)
		}
	}

	return res
}

function continueShowStyleEndInfinites(
	rundownsBeforeThisInPlaylist: RundownId[],
	rundownsToShowstyles: Map<RundownId, ShowStyleBaseId>,
	previousRundownId: RundownId,
	rundown: ReadonlyDeep<Rundown>
): boolean {
	let canContinueShowStyleEndInfinites = true
	if (rundown.showStyleBaseId !== rundownsToShowstyles.get(previousRundownId)) {
		canContinueShowStyleEndInfinites = false
	} else {
		const targetShowStyle = rundown.showStyleBaseId
		canContinueShowStyleEndInfinites = rundownsBeforeThisInPlaylist
			.slice(rundownsBeforeThisInPlaylist.indexOf(previousRundownId))
			.every((r) => rundownsToShowstyles.get(r) === targetShowStyle)
	}

	return canContinueShowStyleEndInfinites
}
