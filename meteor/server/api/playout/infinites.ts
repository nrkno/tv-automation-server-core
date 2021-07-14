import * as _ from 'underscore'
import { DBPart } from '../../../lib/collections/Parts'
import { Piece, Pieces } from '../../../lib/collections/Pieces'
import { PartInstance, PartInstanceId } from '../../../lib/collections/PartInstances'
import { PieceInstance } from '../../../lib/collections/PieceInstances'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { PartsAndSegments, selectNextPart } from './lib'
import { saveIntoCache } from '../../cache/lib'
import {
	getPieceInstancesForPart as libgetPieceInstancesForPart,
	getPlayheadTrackingInfinitesForPart as libgetPlayheadTrackingInfinitesForPart,
	buildPiecesStartingInThisPartQuery,
	buildPastInfinitePiecesForThisPartQuery,
	processAndPrunePieceInstanceTimings,
} from '../../../lib/rundown/infinites'
import { profiler } from '../profiler'
import { Meteor } from 'meteor/meteor'
import {
	CacheForPlayout,
	getOrderedSegmentsAndPartsFromPlayoutCache,
	getSelectedPartInstancesFromCache,
	getShowStyleIdsRundownMappingFromCache,
} from './cache'
import { ReadonlyDeep } from 'type-fest'
import { flatten, getCurrentTime } from '../../../lib/lib'
import { CacheForIngest } from '../ingest/cache'
import { ReadOnlyCache } from '../../cache/CacheBase'
import { Rundown } from '../../../lib/collections/Rundowns'

// /** When we crop a piece, set the piece as "it has definitely ended" this far into the future. */
export const DEFINITELY_ENDED_FUTURE_DURATION = 1 * 1000

/**
 * We can only continue adlib onEnd infinites if we go forwards in the rundown. Any distance backwards will clear them.
 * */
function canContinueAdlibOnEndInfinites(
	playlist: ReadonlyDeep<RundownPlaylist>,
	orderedPartsAndSegments: PartsAndSegments,
	previousPartInstance: PartInstance | undefined,
	part: DBPart
): boolean {
	if (previousPartInstance && playlist) {
		const span = profiler.startSpan('canContinueAdlibOnEndInfinites')
		// TODO - if we don't have an index for previousPartInstance, what should we do?

		const expectedNextPart = selectNextPart(playlist, previousPartInstance, orderedPartsAndSegments)
		if (expectedNextPart) {
			if (expectedNextPart.part._id === part._id) {
				// Next part is what we expect, so take it
				return true
			} else {
				const partIndex = orderedPartsAndSegments.parts.findIndex((p) => p._id === part._id)
				if (partIndex >= expectedNextPart.index) {
					if (span) span.end()
					// Somewhere after the auto-next part, so we can use that
					return true
				} else {
					if (span) span.end()
					// It isnt ahead, so we cant take it
					return false
				}
			}
		} else {
			if (span) span.end()
			// selectNextPart gave nothing, so we must be at the end?
			return false
		}
	} else {
		// There won't be anything to continue anyway..
		return false
	}
}

function getIdsBeforeThisPart(cache: CacheForPlayout, nextPart: DBPart) {
	const span = profiler.startSpan('getIdsBeforeThisPart')
	// Get the normal parts
	const partsBeforeThisInSegment = cache.Parts.findFetch(
		(p) => p.segmentId === nextPart.segmentId && p._rank < nextPart._rank
	)
	// Find any orphaned parts
	const partInstancesBeforeThisInSegment = cache.PartInstances.findFetch(
		(p) => p.segmentId === nextPart.segmentId && p.orphaned && p.part._rank < nextPart._rank
	)
	partsBeforeThisInSegment.push(...partInstancesBeforeThisInSegment.map((p) => p.part))

	const currentSegment = cache.Segments.findOne(nextPart.segmentId)
	const segmentsBeforeThisInRundown = currentSegment
		? cache.Segments.findFetch({
				rundownId: nextPart.rundownId,
				_rank: { $lt: currentSegment._rank },
		  }).map((p) => p._id)
		: []

	const currentRundown = cache.Rundowns.findOne(nextPart.rundownId)
	const rundownsBeforeThisInPlaylist = currentRundown
		? cache.Rundowns.findFetch({ playlistId: cache.Playlist.doc._id, _rank: { $lt: currentRundown._rank } }).map(
				(p) => p._id
		  )
		: []

	if (span) span.end()
	return {
		partsBeforeThisInSegment: _.sortBy(partsBeforeThisInSegment, (p) => p._rank).map((p) => p._id),
		segmentsBeforeThisInRundown,
		rundownsBeforeThisInPlaylist,
	}
}

export async function fetchPiecesThatMayBeActiveForPart(
	cache: CacheForPlayout,
	unsavedIngestCache: Omit<ReadOnlyCache<CacheForIngest>, 'Rundown'> | undefined,
	part: DBPart
): Promise<Piece[]> {
	const span = profiler.startSpan('fetchPiecesThatMayBeActiveForPart')

	const piecePromises: Array<Promise<Array<Piece>> | Array<Piece>> = []

	// Find all the pieces starting in the part
	const thisPiecesQuery = buildPiecesStartingInThisPartQuery(part)
	piecePromises.push(
		unsavedIngestCache?.RundownId === part.rundownId
			? unsavedIngestCache.Pieces.findFetch(thisPiecesQuery)
			: Pieces.findFetchAsync(thisPiecesQuery)
	)

	// Figure out the ids of everything else we will have to search through
	const { partsBeforeThisInSegment, segmentsBeforeThisInRundown, rundownsBeforeThisInPlaylist } =
		getIdsBeforeThisPart(cache, part)

	if (unsavedIngestCache?.RundownId === part.rundownId) {
		// Find pieces for the current rundown
		const thisRundownPieceQuery = buildPastInfinitePiecesForThisPartQuery(
			part,
			partsBeforeThisInSegment,
			segmentsBeforeThisInRundown,
			[] // other rundowns don't exist in the ingestCache
		)
		if (thisRundownPieceQuery) {
			piecePromises.push(unsavedIngestCache.Pieces.findFetch(thisRundownPieceQuery))
		}

		// Find pieces for the previous rundowns
		const previousRundownPieceQuery = buildPastInfinitePiecesForThisPartQuery(
			part,
			[], // Only applies to the current rundown
			[], // Only applies to the current rundown
			rundownsBeforeThisInPlaylist
		)
		if (previousRundownPieceQuery) {
			piecePromises.push(Pieces.findFetchAsync(previousRundownPieceQuery))
		}
	} else {
		// No cache, so we can do a single query to the db for it all
		const infinitePiecesQuery = buildPastInfinitePiecesForThisPartQuery(
			part,
			partsBeforeThisInSegment,
			segmentsBeforeThisInRundown,
			rundownsBeforeThisInPlaylist
		)
		if (infinitePiecesQuery) {
			piecePromises.push(Pieces.findFetchAsync(infinitePiecesQuery))
		}
	}

	const pieces = flatten(await Promise.all(piecePromises))
	if (span) span.end()
	return pieces
}

export async function syncPlayheadInfinitesForNextPartInstance(cache: CacheForPlayout): Promise<void> {
	const span = profiler.startSpan('syncPlayheadInfinitesForNextPartInstance')
	const { nextPartInstance, currentPartInstance } = getSelectedPartInstancesFromCache(cache)
	if (nextPartInstance && currentPartInstance) {
		const playlist = cache.Playlist.doc
		if (!playlist.activationId) throw new Meteor.Error(500, `RundownPlaylist "${playlist._id}" is not active`)

		const { partsBeforeThisInSegment, segmentsBeforeThisInRundown, rundownsBeforeThisInPlaylist } =
			getIdsBeforeThisPart(cache, nextPartInstance.part)

		const rundown = cache.Rundowns.findOne(currentPartInstance.rundownId)
		if (!rundown) throw new Meteor.Error(404, `Rundown "${currentPartInstance.rundownId}" not found!`)

		// !! Database call !!
		const showStyleBase = await cache.activationCache.getShowStyleBase(rundown)

		const orderedPartsAndSegments = getOrderedSegmentsAndPartsFromPlayoutCache(cache)

		const canContinueAdlibOnEnds = canContinueAdlibOnEndInfinites(
			playlist,
			orderedPartsAndSegments,
			currentPartInstance,
			nextPartInstance.part
		)
		const playingPieceInstances = cache.PieceInstances.findFetch(
			(p) => p.partInstanceId === currentPartInstance._id
		)

		const nowInPart = getCurrentTime() - (currentPartInstance.timings?.startedPlayback ?? 0)
		const prunedPieceInstances = processAndPrunePieceInstanceTimings(
			showStyleBase,
			playingPieceInstances,
			nowInPart,
			undefined,
			true
		)

		const rundownIdsToShowstyleIds = getShowStyleIdsRundownMappingFromCache(cache)

		const infinites = libgetPlayheadTrackingInfinitesForPart(
			playlist.activationId,
			new Set(partsBeforeThisInSegment),
			new Set(segmentsBeforeThisInRundown),
			rundownsBeforeThisInPlaylist,
			rundownIdsToShowstyleIds,
			currentPartInstance,
			prunedPieceInstances,
			rundown,
			nextPartInstance.part,
			nextPartInstance._id,
			canContinueAdlibOnEnds,
			false
		)

		saveIntoCache(
			cache.PieceInstances,
			{
				partInstanceId: nextPartInstance._id,
				'infinite.fromPreviousPlayhead': true,
			},
			infinites
		)
	}
	if (span) span.end()
}

export function getPieceInstancesForPart(
	cache: CacheForPlayout,
	playingPartInstance: PartInstance | undefined,
	rundown: ReadonlyDeep<Rundown>,
	part: DBPart,
	possiblePieces: Piece[],
	newInstanceId: PartInstanceId,
	isTemporary: boolean
): PieceInstance[] {
	const span = profiler.startSpan('getPieceInstancesForPart')
	const { partsBeforeThisInSegment, segmentsBeforeThisInRundown, rundownsBeforeThisInPlaylist } =
		getIdsBeforeThisPart(cache, part)

	const playlist = cache.Playlist.doc
	if (!playlist.activationId) throw new Meteor.Error(500, `RundownPlaylist "${playlist._id}" is not active`)

	const orderedPartsAndSegments = getOrderedSegmentsAndPartsFromPlayoutCache(cache)
	const playingPieceInstances = playingPartInstance
		? cache.PieceInstances.findFetch((p) => p.partInstanceId === playingPartInstance._id)
		: []

	const canContinueAdlibOnEnds = canContinueAdlibOnEndInfinites(
		playlist,
		orderedPartsAndSegments,
		playingPartInstance,
		part
	)

	const rundownIdsToShowstyleIds = getShowStyleIdsRundownMappingFromCache(cache)

	const res = libgetPieceInstancesForPart(
		playlist.activationId,
		playingPartInstance,
		playingPieceInstances,
		rundown,
		part,
		new Set(partsBeforeThisInSegment),
		new Set(segmentsBeforeThisInRundown),
		rundownsBeforeThisInPlaylist,
		rundownIdsToShowstyleIds,
		possiblePieces,
		orderedPartsAndSegments.parts.map((p) => p._id),
		newInstanceId,
		canContinueAdlibOnEnds,
		isTemporary
	)
	if (span) span.end()
	return res
}
