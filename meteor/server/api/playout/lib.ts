import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import { Random } from 'meteor/random'
import * as _ from 'underscore'
import { logger } from '../../logging'
import { Rundown, Rundowns, RundownHoldState, DBRundown, RundownId } from '../../../lib/collections/Rundowns'
import { Pieces } from '../../../lib/collections/Pieces'
import { Parts, DBPart, Part, isPartPlayable } from '../../../lib/collections/Parts'
import {
	asyncCollectionUpdate,
	getCurrentTime,
	waitForPromiseAll,
	asyncCollectionRemove,
	Time,
	pushOntoPath,
	clone,
	literal,
	asyncCollectionInsert,
	asyncCollectionInsertMany,
	waitForPromise,
	asyncCollectionFindFetch,
	unprotectString,
	protectString,
	makePromise,
	DBObj,
} from '../../../lib/lib'
import { TimelineObjGeneric } from '../../../lib/collections/Timeline'
import { loadCachedIngestSegment } from '../ingest/ingestCache'
import { updateSegmentsFromIngestData } from '../ingest/rundownInput'
import { updateSourceLayerInfinitesAfterPart } from './infinites'
import { Studios } from '../../../lib/collections/Studios'
import { DBSegment, Segments, Segment } from '../../../lib/collections/Segments'
import { RundownPlaylist, RundownPlaylists, RundownPlaylistId } from '../../../lib/collections/RundownPlaylists'
import { PartInstance, PartInstances, DBPartInstance, PartInstanceId } from '../../../lib/collections/PartInstances'
import { PieceInstances, PieceInstance, wrapPieceToInstance } from '../../../lib/collections/PieceInstances'
import { TSR } from 'tv-automation-sofie-blueprints-integration'
import { CacheForRundownPlaylist } from '../../DatabaseCaches'
import { AdLibPieces } from '../../../lib/collections/AdLibPieces'
import { RundownBaselineObjs } from '../../../lib/collections/RundownBaselineObjs'
import { RundownBaselineAdLibPieces } from '../../../lib/collections/RundownBaselineAdLibPieces'
import { IngestDataCache } from '../../../lib/collections/IngestDataCache'
import { ExpectedMediaItems } from '../../../lib/collections/ExpectedMediaItems'
import { ExpectedPlayoutItems } from '../../../lib/collections/ExpectedPlayoutItems'

/**
 * Reset the rundown:
 * Remove all dynamically inserted/updated pieces, parts, timings etc..
 */
export function resetRundown(cache: CacheForRundownPlaylist, rundown: Rundown) {
	logger.info('resetRundown ' + rundown._id)
	// Remove all dunamically inserted pieces (adlibs etc)

	// Note: After the RundownPlaylist (R19) update, the playhead is no longer affected in this operation,
	// since that isn't tied to the rundown anymore.

	cache.Pieces.remove({
		rundownId: rundown._id,
		dynamicallyInserted: true,
	})

	cache.Parts.remove({
		rundownId: rundown._id,
		dynamicallyInserted: true,
	})

	cache.Parts.update(
		{
			rundownId: rundown._id,
		},
		{
			$unset: {
				duration: 1,
				previousPartEndState: 1,
				startedPlayback: 1,
				taken: 1,
				timings: 1,
				runtimeArguments: 1,
				stoppedPlayback: 1,
			},
		}
	)

	const dirtyParts = cache.Parts.findFetch({ rundownId: rundown._id, dirty: true })

	refreshParts(cache, dirtyParts)

	// Reset all pieces that were modified for holds
	cache.Pieces.update(
		{
			rundownId: rundown._id,
			extendOnHold: true,
			infiniteId: { $exists: true },
		},
		{
			$unset: {
				infiniteId: 0,
				infiniteMode: 0,
			},
		}
	)

	// Reset any pieces that were modified by inserted adlibs
	cache.Pieces.update(
		{
			rundownId: rundown._id,
			originalInfiniteMode: { $exists: true },
		},
		{
			$rename: {
				originalInfiniteMode: 'infiniteMode',
			},
		}
	)

	cache.Pieces.update(
		{
			rundownId: rundown._id,
		},
		{
			$unset: {
				playoutDuration: 1,
				startedPlayback: 1,
				userDuration: 1,
				disabled: 1,
				hidden: 1,
			},
		}
	)

	// Mask all instances as reset
	cache.PartInstances.update(
		{
			rundownId: rundown._id,
		},
		{
			$set: {
				reset: true,
			},
		}
	)
	cache.PieceInstances.update(
		{
			rundownId: rundown._id,
		},
		{
			$set: {
				reset: true,
			},
		}
	)

	// ensure that any removed infinites are restored
	updateSourceLayerInfinitesAfterPart(cache, rundown)
}

/**
 * Reset the rundownPlaylist (all of the rundowns within the playlist):
 * Remove all dynamically inserted/updated pieces, parts, timings etc..
 */
export function resetRundownPlaylist(cache: CacheForRundownPlaylist, rundownPlaylist: RundownPlaylist) {
	logger.info('resetRundownPlaylist ' + rundownPlaylist._id)
	// Remove all dunamically inserted pieces (adlibs etc)
	const rundowns = getRundownsFromCache(cache, rundownPlaylist)
	const rundownIDs = rundowns.map((i) => i._id)
	// const rundownLookup = _.object(rundowns.map(i => [ i._id, i ])) as { [key: string]: Rundown }

	const partInstancesToRemove = cache.PartInstances.findFetch({
		rundownId: { $in: rundownIDs },
		rehearsal: true,
	})
	cache.PartInstances.remove({
		_id: { $in: partInstancesToRemove.map((pi) => pi._id) },
	})
	cache.PieceInstances.remove({
		partInstanceId: { $in: partInstancesToRemove.map((pi) => pi._id) },
	})

	cache.PartInstances.update(
		{
			rundownId: {
				$in: rundownIDs,
			},
		},
		{
			$set: {
				reset: true,
			},
		}
	)
	cache.PieceInstances.update(
		{
			rundownId: {
				$in: rundownIDs,
			},
		},
		{
			$set: {
				reset: true,
			},
		}
	)

	cache.Pieces.remove({
		rundownId: {
			$in: rundownIDs,
		},
		dynamicallyInserted: true,
	})

	cache.Parts.remove({
		rundownId: {
			$in: rundownIDs,
		},
		dynamicallyInserted: true,
	})

	cache.Parts.update(
		{
			rundownId: {
				$in: rundownIDs,
			},
		},
		{
			$unset: {
				duration: 1,
				previousPartEndState: 1,
				startedPlayback: 1,
				timings: 1,
				runtimeArguments: 1,
				stoppedPlayback: 1,
				taken: 1,
			},
		}
	)

	const dirtyParts = cache.Parts.findFetch({
		rundownId: {
			$in: rundownIDs,
		},
		dirty: true,
	})
	refreshParts(cache, dirtyParts)

	// Reset all pieces that were modified for holds
	cache.Pieces.update(
		{
			rundownId: {
				$in: rundownIDs,
			},
			extendOnHold: true,
			infiniteId: { $exists: true },
		},
		{
			$unset: {
				infiniteId: 0,
				infiniteMode: 0,
			},
		}
	)

	// Reset any pieces that were modified by inserted adlibs
	cache.Pieces.update(
		{
			rundownId: {
				$in: rundownIDs,
			},
			originalInfiniteMode: { $exists: true },
		},
		{
			$rename: {
				originalInfiniteMode: 'infiniteMode',
			},
		}
	)

	cache.Pieces.update(
		{
			rundownId: {
				$in: rundownIDs,
			},
		},
		{
			$unset: {
				playoutDuration: 1,
				startedPlayback: 1,
				userDuration: 1,
				definitelyEnded: 1,
				disabled: 1,
				hidden: 1,
			},
		}
	)

	// ensure that any removed infinites are restored
	rundowns.map((r) => updateSourceLayerInfinitesAfterPart(cache, r))

	resetRundownPlaylistPlayhead(cache, rundownPlaylist)
}
function resetRundownPlaylistPlayhead(cache: CacheForRundownPlaylist, rundownPlaylist: RundownPlaylist) {
	logger.info('resetRundownPlayhead ' + rundownPlaylist._id)
	const rundowns = getRundownsFromCache(cache, rundownPlaylist)
	const rundown = _.first(rundowns)
	if (!rundown) throw new Meteor.Error(406, `The rundown playlist was empty, could not find a suitable part.`)

	cache.RundownPlaylists.update(rundownPlaylist._id, {
		$set: {
			previousPartInstanceId: null,
			currentPartInstanceId: null,
			holdState: RundownHoldState.NONE,
		},
		$unset: {
			startedPlayback: 1,
			previousPersistentState: 1,
		},
	})

	cache.Rundowns.update(
		{
			playlistId: rundownPlaylist._id,
		},
		{
			$unset: {
				startedPlayback: 1,
			},
		}
	)

	if (rundownPlaylist.active) {
		// put the first on queue:
		const firstPart = selectNextPart(rundownPlaylist, null, getAllOrderedPartsFromCache(cache, rundownPlaylist))
		setNextPart(cache, rundownPlaylist, firstPart ? firstPart.part : null)
	} else {
		setNextPart(cache, rundownPlaylist, null)
	}
}
export function getPartBeforeSegment(rundownId: RundownId, dbSegment: DBSegment): Part | undefined {
	const prevSegment = Segments.findOne(
		{
			rundownId: rundownId,
			_rank: { $lt: dbSegment._rank },
		},
		{ sort: { _rank: -1 } }
	)
	if (prevSegment) {
		return Parts.findOne(
			{
				rundownId: rundownId,
				segmentId: prevSegment._id,
			},
			{ sort: { _rank: -1 } }
		)
	}
	return undefined
}
export function getPartsAfter(part: Part, partsInRundownInOrder: Part[]): Part[] {
	let found = false
	// Only process parts after part:
	const partsAfter = partsInRundownInOrder.filter((p) => {
		if (found) return true
		if (p._id === part._id) found = true
		return false
	})
	return partsAfter
}
export function getPreviousPart(cache: CacheForRundownPlaylist, partToCheck: Part, rundown: Rundown) {
	const partsInRundown = cache.Parts.findFetch({ rundownId: rundown._id }, { sort: { _rank: 1 } })

	let previousPart: Part | undefined = undefined
	for (let part of partsInRundown) {
		if (part._id === partToCheck._id) break
		previousPart = part
	}
	return previousPart
}
export function refreshParts(cache: CacheForRundownPlaylist, parts: Part[]) {
	const ps: Promise<any>[] = []
	parts.forEach((part) => {
		const rundown = cache.Rundowns.findOne(part.rundownId)
		if (!rundown) throw new Meteor.Error(404, `Rundown "${part.rundownId}" not found in refreshParts`)
		ps.push(
			refreshPart(cache, rundown, part).then(() => {
				cache.Parts.update(part._id, {
					$unset: {
						dirty: 1,
					},
				})
			})
		)
	})
	waitForPromiseAll(ps)
}
export async function refreshPart(cache: CacheForRundownPlaylist, rundown: Rundown, part: Part) {
	// TODO:
	const pIngestSegment = makePromise(() =>
		loadCachedIngestSegment(rundown._id, rundown.externalId, part.segmentId, unprotectString(part.segmentId))
	)

	const studio = cache.Studios.findOne(rundown.studioId)
	if (!studio) throw new Meteor.Error(404, `Studio ${rundown.studioId} was not found`)
	const playlist = cache.RundownPlaylists.findOne(rundown.playlistId)
	if (!playlist) throw new Meteor.Error(404, `Rundown Playlist "${rundown.playlistId}" not found!`)

	const ingestSegment = await pIngestSegment
	updateSegmentsFromIngestData(cache, studio, playlist, rundown, [ingestSegment])

	// const segment = Segments.findOne(dbPart.segmentId)
	// if (!segment) throw new Meteor.Error(404, `Segment ${dbPart.segmentId} was not found`)

	// This is run on the whole rundown inside the update, IF anything was changed
	// const prevPart = getPartBeforeSegment(dbRundown._id, segment)
	// updateSourceLayerInfinitesAfterPart(rundown, prevPart)
}

export function selectNextPart(
	rundownPlaylist: RundownPlaylist,
	previousPartInstance: PartInstance | null,
	parts: Part[]
): { part: Part; index: number } | undefined {
	const findFirstPlayablePart = (offset: number, condition?: (part: Part) => boolean) => {
		// Filter to after and find the first playabale
		for (let index = offset; index < parts.length; index++) {
			const part = parts[index]
			if (part.isPlayable() && (!condition || condition(part))) {
				return { part, index }
			}
		}
		return undefined
	}

	let offset = 0
	if (previousPartInstance) {
		const currentIndex = parts.findIndex((p) => p._id === previousPartInstance.part._id)
		// TODO - choose something better for next?
		if (currentIndex !== -1) {
			offset = currentIndex + 1
		}
	}

	let nextPart = findFirstPlayablePart(offset)

	if (rundownPlaylist.nextSegmentId) {
		// No previous part, or segment has changed
		if (!previousPartInstance || (nextPart && previousPartInstance.segmentId !== nextPart.part.segmentId)) {
			// Find first in segment
			const nextPart2 = findFirstPlayablePart(0, (part) => part.segmentId === rundownPlaylist.nextSegmentId)
			if (nextPart2) {
				// If matched matched, otherwise leave on auto
				nextPart = nextPart2
			}
		}
	}

	// Filter to after and find the first playabale
	return nextPart || findFirstPlayablePart(offset)
}
export function setNextPart(
	cache: CacheForRundownPlaylist,
	rundownPlaylist: RundownPlaylist,
	rawNextPart: Part | DBPartInstance | null,
	setManually?: boolean,
	nextTimeOffset?: number | undefined
) {
	const rundownIds = getRundownIDsFromCache(cache, rundownPlaylist)
	const { currentPartInstance, nextPartInstance } = getSelectedPartInstancesFromCache(
		cache,
		rundownPlaylist,
		rundownIds
	)

	const movingToNewSegment =
		!currentPartInstance || !rawNextPart || rawNextPart.segmentId !== currentPartInstance.segmentId

	const newNextPartInstance = rawNextPart && 'part' in rawNextPart ? rawNextPart : null
	let newNextPart = rawNextPart && 'part' in rawNextPart ? null : rawNextPart

	const nonTakenPartInstances = cache.PartInstances.findFetch({
		rundownId: { $in: rundownIds },
		isTaken: { $ne: true },
	})

	if (newNextPart || newNextPartInstance) {
		if ((newNextPart && newNextPart.invalid) || (newNextPartInstance && newNextPartInstance.part.invalid)) {
			throw new Meteor.Error(400, 'Part is marked as invalid, cannot set as next.')
		}
		if (newNextPart && !rundownIds.includes(newNextPart.rundownId)) {
			throw new Meteor.Error(
				409,
				`Part "${newNextPart._id}" of rundown "${newNextPart.rundownId}" not part of RundownPlaylist "${rundownPlaylist._id}"`
			)
		} else if (newNextPartInstance && !rundownIds.includes(newNextPartInstance.rundownId)) {
			throw new Meteor.Error(
				409,
				`PartInstance "${newNextPartInstance._id}" of rundown "${newNextPartInstance.rundownId}" not part of RundownPlaylist "${rundownPlaylist._id}"`
			)
		}

		if (newNextPart) {
			if (currentPartInstance && newNextPart._id === currentPartInstance.part._id) {
				throw new Meteor.Error(402, 'Not allowed to Next the currently playing Part')
			}

			// If this is a part being copied, then reset and reload it (so that we copy the new, not old data)
			// TODO-PartInstances - pending new data flow
			resetPart(cache, newNextPart)
			const partId = newNextPart._id
			newNextPart = cache.Parts.findOne(partId) as Part
			if (!newNextPart) {
				throw new Meteor.Error(409, `Part "${partId}" could not be reloaded after reset`)
			}
		} else if (newNextPartInstance) {
			if (currentPartInstance && newNextPartInstance._id === currentPartInstance._id) {
				throw new Meteor.Error(402, 'Not allowed to Next the currently playing Part')
			}
		}

		const nextPart = newNextPartInstance ? newNextPartInstance.part : newNextPart!

		// create new instance
		let newInstanceId: PartInstanceId
		if (newNextPartInstance) {
			newInstanceId = newNextPartInstance._id
		} else if (nextPartInstance && nextPartInstance.part._id === nextPart._id) {
			// Re-use existing
			newInstanceId = nextPartInstance._id
		} else {
			// Create new isntance
			newInstanceId = protectString<PartInstanceId>(`${nextPart._id}_${Random.id()}`)
			const newTakeCount = currentPartInstance ? currentPartInstance.takeCount + 1 : 0 // Increment
			cache.PartInstances.insert({
				_id: newInstanceId,
				takeCount: newTakeCount,
				rundownId: nextPart.rundownId,
				segmentId: nextPart.segmentId,
				part: nextPart,
				isScratch: true,
				rehearsal: !!rundownPlaylist.rehearsal,
			})
			/*
			RundownPlaylists.findOne().nextPartInstanceId
			"fNMbKWnQSnXfyaqLc_dZWHyWoKscptNibds"
			PartInstances.findOne(RundownPlaylists.findOne().nextPartInstanceId)
			undefined
			*/

			const rawPieces = cache.Pieces.findFetch({
				rundownId: nextPart.rundownId,
				partId: nextPart._id,
			})
			const pieceInstances = _.map(rawPieces, (piece) => wrapPieceToInstance(piece, newInstanceId))
			_.each(pieceInstances, (pieceInstance) => {
				cache.PieceInstances.insert(pieceInstance)
			})
			cache.PartInstances.update(newInstanceId, {
				$unset: {
					isScratch: 1,
				},
			})
		}

		// reset any previous instances of this part
		cache.PartInstances.update(
			{
				_id: { $ne: newInstanceId },
				rundownId: nextPart.rundownId,
				'part._id': nextPart._id,
				reset: { $ne: true },
			},
			{
				$set: {
					reset: true,
				},
			}
		)
		cache.PieceInstances.update(
			{
				partInstanceId: { $ne: newInstanceId },
				rundownId: nextPart.rundownId,
				'piece.partId': nextPart._id,
				reset: { $ne: true },
			},
			{
				$set: {
					reset: true,
				},
			}
		)

		cache.RundownPlaylists.update(rundownPlaylist._id, {
			$set: literal<Partial<RundownPlaylist>>({
				nextPartInstanceId: newInstanceId,
				nextPartManual: !!setManually,
				nextTimeOffset: nextTimeOffset || null,
			}),
		})
		rundownPlaylist.nextPartInstanceId = newInstanceId
	} else {
		// Set to null

		cache.RundownPlaylists.update(rundownPlaylist._id, {
			$set: literal<Partial<RundownPlaylist>>({
				nextPartInstanceId: null,
				nextPartManual: !!setManually,
				nextTimeOffset: null,
			}),
		})
	}

	// Remove any instances which havent been taken
	const instancesIdsToRemove = nonTakenPartInstances
		.map((p) => p._id)
		.filter((id) => id !== rundownPlaylist.nextPartInstanceId && id !== rundownPlaylist.currentPartInstanceId)
	cache.PartInstances.remove({
		rundownId: { $in: rundownIds },
		_id: { $in: instancesIdsToRemove },
	})
	cache.PieceInstances.remove({
		rundownId: { $in: rundownIds },
		partInstanceId: { $in: instancesIdsToRemove },
	})

	if (movingToNewSegment && rundownPlaylist.nextSegmentId) {
		cache.RundownPlaylists.update(rundownPlaylist._id, {
			$unset: {
				nextSegmentId: 1,
			},
		})
		// delete rundownPlaylist.nextSegmentId
	}
}
export function setNextSegment(
	cache: CacheForRundownPlaylist,
	rundownPlaylist: RundownPlaylist,
	nextSegment: Segment | null
) {
	const acceptableRundowns = getRundownIDsFromCache(cache, rundownPlaylist)
	if (nextSegment) {
		if (acceptableRundowns.indexOf(nextSegment.rundownId) === -1) {
			throw new Meteor.Error(
				409,
				`Segment "${nextSegment._id}" not part of RundownPlaylist "${rundownPlaylist._id}"`
			)
		}

		// Just run so that errors will be thrown if something wrong:
		const partsInSegment = cache.Parts.findFetch({ segmentId: nextSegment._id })
		if (!partsInSegment.find((p) => p.isPlayable())) {
			throw new Meteor.Error(400, 'Segment contains no valid parts')
		}

		cache.RundownPlaylists.update(rundownPlaylist._id, {
			$set: {
				nextSegmentId: nextSegment._id,
			},
		})
	} else {
		cache.RundownPlaylists.update(rundownPlaylist._id, {
			$unset: {
				nextSegmentId: 1,
			},
		})
	}
}

function resetPart(cache: CacheForRundownPlaylist, part: Part): void {
	let ps: Array<Promise<any>> = []

	let willNeedToBeFullyReset: boolean = !!part.startedPlayback

	const isDirty = part.dirty || false

	cache.Parts.update(
		{
			_id: part._id,
		},
		{
			$unset: {
				duration: 1,
				previousPartEndState: 1,
				startedPlayback: 1,
				taken: 1,
				runtimeArguments: 1,
				dirty: 1,
				stoppedPlayback: 1,
			},
		}
	)
	cache.Pieces.update(
		{
			partId: part._id,
		},
		{
			$unset: {
				startedPlayback: 1,
				userDuration: 1,
				definitelyEnded: 1,
				disabled: 1,
				hidden: 1,
			},
		}
	)
	// remove parts that have been dynamically queued for after this part (queued adLibs)
	cache.Parts.remove({
		rundownId: part.rundownId,
		afterPart: part._id,
		dynamicallyInserted: true,
	})

	// Remove all pieces that have been dynamically created (such as adLib pieces)
	const removedPiecesCount = cache.Pieces.remove({
		rundownId: part.rundownId,
		partId: part._id,
		dynamicallyInserted: true,
	})
	if (removedPiecesCount > 0) {
		willNeedToBeFullyReset = true
	}

	// Reset any pieces that were modified by inserted adlibs
	cache.Pieces.update(
		{
			rundownId: part.rundownId,
			partId: part._id,
			originalInfiniteMode: { $exists: true },
		},
		{
			$rename: {
				originalInfiniteMode: 'infiniteMode',
			},
		}
	)

	const rundown = cache.Rundowns.findOne(part.rundownId)
	if (!rundown) throw new Meteor.Error(404, `Rundown "${part.rundownId}" not found!`)

	if (isDirty) {
		waitForPromise(refreshPart(cache, rundown, part))
	} else {
		if (willNeedToBeFullyReset) {
			const prevPart = getPreviousPart(cache, part, rundown)

			updateSourceLayerInfinitesAfterPart(cache, rundown, prevPart)
		}
	}
}
export function onPartHasStoppedPlaying(
	cache: CacheForRundownPlaylist,
	partInstance: PartInstance,
	stoppedPlayingTime: Time
) {
	const lastStartedPlayback = partInstance.part.getLastStartedPlayback()
	if (partInstance.part.startedPlayback && lastStartedPlayback && lastStartedPlayback > 0) {
		cache.PartInstances.update(partInstance._id, {
			$set: {
				'part.duration': stoppedPlayingTime - lastStartedPlayback,
			},
		})

		// TODO-PartInstance - pending new data flow
		cache.Parts.update(partInstance.part._id, {
			$set: {
				duration: stoppedPlayingTime - lastStartedPlayback,
			},
		})
	} else {
		// logger.warn(`Part "${part._id}" has never started playback on rundown "${rundownId}".`)
	}
}

export function substituteObjectIds(
	rawEnable: TSR.Timeline.TimelineEnable,
	idMap: { [oldId: string]: string | undefined }
) {
	const replaceIds = (str: string) => {
		return str.replace(/#([a-zA-Z0-9_]+)/g, (m) => {
			const id = m.substr(1, m.length - 1)
			return `#${idMap[id] || id}`
		})
	}

	const enable = clone(rawEnable)

	for (const key of _.keys(enable)) {
		if (typeof enable[key] === 'string') {
			enable[key] = replaceIds(enable[key])
		}
	}

	return enable
}
export function prefixAllObjectIds<T extends TimelineObjGeneric>(
	objList: T[],
	prefix: string,
	ignoreOriginal?: boolean
): T[] {
	const getUpdatePrefixedId = (o: T) => {
		let id = o.id
		if (!ignoreOriginal) {
			if (!o.originalId) {
				o.originalId = o.id
			}
			id = o.originalId
		}
		return prefix + id
	}

	const idMap: { [oldId: string]: string | undefined } = {}
	_.each(objList, (o) => {
		idMap[o.id] = getUpdatePrefixedId(o)
	})

	return objList.map((rawObj) => {
		const obj = clone(rawObj)

		obj.id = getUpdatePrefixedId(obj)
		obj.enable = substituteObjectIds(obj.enable, idMap)

		if (typeof obj.inGroup === 'string') {
			obj.inGroup = idMap[obj.inGroup] || obj.inGroup
		}

		return obj
	})
}

/**
 * time in ms before an autotake when we don't accept takes/updates
 */
const AUTOTAKE_UPDATE_DEBOUNCE = 5000
const AUTOTAKE_TAKE_DEBOUNCE = 1000

export function isTooCloseToAutonext(currentPartInstance: PartInstance | undefined, isTake?: boolean) {
	if (!currentPartInstance || !currentPartInstance.part.autoNext) return false

	const debounce = isTake ? AUTOTAKE_TAKE_DEBOUNCE : AUTOTAKE_UPDATE_DEBOUNCE

	const start = currentPartInstance.part.getLastStartedPlayback()
	const offset = currentPartInstance.part.getLastPlayOffset()
	if (start !== undefined && offset !== undefined && currentPartInstance.part.expectedDuration) {
		// date.now - start = playback duration, duration + offset gives position in part
		const playbackDuration = getCurrentTime() - start + offset

		// If there is an auto next planned
		if (Math.abs(currentPartInstance.part.expectedDuration - playbackDuration) < debounce) {
			return true
		}
	}

	return false
}

export function getSegmentsAndPartsFromCache(
	cache: CacheForRundownPlaylist,
	playlist: RundownPlaylist
): {
	segments: Segment[]
	parts: Part[]
} {
	const rundowns = getRundownsFromCache(cache, playlist)
	return getRundownsSegmentsAndPartsFromCache(cache, rundowns)
}
export function getAllOrderedPartsFromCache(cache: CacheForRundownPlaylist, playlist: RundownPlaylist): Part[] {
	const { parts } = getSegmentsAndPartsFromCache(cache, playlist)
	return parts
}
/** Get all rundowns in a playlist */
export function getRundownsFromCache(cache: CacheForRundownPlaylist, playlist: RundownPlaylist) {
	return cache.Rundowns.findFetch(
		{
			playlistId: playlist._id,
		},
		{
			sort: {
				_rank: 1,
				_id: 1,
			},
		}
	)
}
export function getRundownIDsFromCache(cache: CacheForRundownPlaylist, playlist: RundownPlaylist) {
	return getRundownsFromCache(cache, playlist).map((r) => r._id)
}
/** Get all pieces in a part */
export function getAllPiecesFromCache(cache: CacheForRundownPlaylist, part: Part) {
	return cache.Pieces.findFetch({
		rundownId: part.rundownId,
		partId: part._id,
	})
}
/** Get all adlib pieces in a part */
export function getAllAdLibPiecesFromCache(cache: CacheForRundownPlaylist, part: Part) {
	return cache.AdLibPieces.findFetch(
		{
			rundownId: part.rundownId,
			partId: part._id,
		},
		{
			sort: {
				_rank: 1,
				name: 1,
			},
		}
	)
}
export function getStudioFromCache(cache: CacheForRundownPlaylist, playlist: RundownPlaylist) {
	if (!playlist.studioId) throw new Meteor.Error(500, 'RundownPlaylist is not in a studio!')
	let studio = cache.Studios.findOne(playlist.studioId)
	if (studio) {
		return studio
	} else {
		throw new Meteor.Error(404, 'Studio "' + playlist.studioId + '" not found!')
	}
}
export function getSelectedPartInstancesFromCache(
	cache: CacheForRundownPlaylist,
	playlist: RundownPlaylist,
	rundownIds?: RundownId[]
) {
	if (!rundownIds) {
		rundownIds = getRundownIDsFromCache(cache, playlist)
	}

	const ids = _.compact([
		playlist.currentPartInstanceId,
		playlist.previousPartInstanceId,
		playlist.nextPartInstanceId,
	])
	const instances =
		ids.length > 0
			? cache.PartInstances.findFetch({
					rundownId: { $in: rundownIds },
					_id: { $in: ids },
					reset: { $ne: true },
			  })
			: []

	return {
		currentPartInstance: instances.find((inst) => inst._id === playlist.currentPartInstanceId),
		nextPartInstance: instances.find((inst) => inst._id === playlist.nextPartInstanceId),
		previousPartInstance: instances.find((inst) => inst._id === playlist.previousPartInstanceId),
	}
}

export function removeRundownPlaylistFromCache(cache: CacheForRundownPlaylist, playlist: RundownPlaylist) {
	const allRundowns = cache.Rundowns.findFetch({ playlistId: playlist._id })
	allRundowns.forEach((rundown) => removeRundownFromCache(cache, rundown))

	cache.RundownPlaylists.remove(playlist._id)
}
export function removeRundownFromCache(cache: CacheForRundownPlaylist, rundown: Rundown) {
	cache.Rundowns.remove(rundown._id)
	if (rundown.playlistId) {
		// Check if any other members of the playlist are left
		if (
			cache.Rundowns.findFetch({
				playlistId: rundown.playlistId,
			}).length === 0
		) {
			cache.RundownPlaylists.remove(rundown.playlistId)
		}
	}
	cache.Segments.remove({ rundownId: rundown._id })
	cache.Parts.remove({ rundownId: rundown._id })
	cache.PartInstances.remove({ rundownId: rundown._id })
	cache.Pieces.remove({ rundownId: rundown._id })
	cache.PieceInstances.remove({ rundownId: rundown._id })
	cache.RundownBaselineObjs.remove({ rundownId: rundown._id })

	// These are not present in the cache because they do not directly affect output.
	AdLibPieces.remove({ rundownId: rundown._id })
	RundownBaselineAdLibPieces.remove({ rundownId: rundown._id })
	IngestDataCache.remove({ rundownId: rundown._id })
	ExpectedMediaItems.remove({ rundownId: rundown._id })
	ExpectedPlayoutItems.remove({ rundownId: rundown._id })
}

/** Get all piece instances in a part instance */
export function getAllPieceInstancesFromCache(
	cache: CacheForRundownPlaylist,
	partInstance: PartInstance
): PieceInstance[] {
	return cache.PieceInstances.findFetch({
		rundownId: partInstance.rundownId,
		partInstanceId: partInstance._id,
	})
}

export function touchRundownPlaylistsInCache(cache: CacheForRundownPlaylist, playlist: RundownPlaylist) {
	if (!Meteor.isServer) throw new Meteor.Error('The "remove" method is available server-side only (sorry)')
	if (getCurrentTime() - playlist.modified > 3600 * 1000) {
		const m = getCurrentTime()
		playlist.modified = m
		cache.RundownPlaylists.update(playlist._id, { $set: { modified: m } })
	}
}

export function getRundownPlaylistFromCache(cache: CacheForRundownPlaylist, rundown: Rundown) {
	if (!rundown.playlistId) throw new Meteor.Error(500, 'Rundown is not a part of a rundown playlist!')
	let pls = cache.RundownPlaylists.findOne(rundown.playlistId)
	if (pls) {
		return pls
	} else throw new Meteor.Error(404, `Rundown Playlist "${rundown.playlistId}" not found!`)
}

export function getRundownsSegmentsAndPartsFromCache(
	cache: CacheForRundownPlaylist,
	rundowns: Rundown[]
): { segments: Segment[]; parts: Part[] } {
	const rundownIds = rundowns.map((i) => i._id)

	const segments = RundownPlaylist._sortSegments(
		cache.Segments.findFetch(
			{
				rundownId: {
					$in: rundownIds,
				},
			},
			{
				sort: {
					rundownId: 1,
					_rank: 1,
				},
			}
		),
		rundowns
	)

	const parts = RundownPlaylist._sortPartsInner(
		cache.Parts.findFetch(
			{
				rundownId: {
					$in: rundownIds,
				},
			},
			{
				sort: {
					rundownId: 1,
					_rank: 1,
				},
			}
		),
		segments
	)

	return {
		segments: segments,
		parts: parts,
	}
}
