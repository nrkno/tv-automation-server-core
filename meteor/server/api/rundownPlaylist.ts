import { Studio, StudioId, Studios } from '../../lib/collections/Studios'
import {
	RundownPlaylists,
	RundownPlaylistId,
	DBRundownPlaylist,
	RundownPlaylist,
} from '../../lib/collections/RundownPlaylists'
import { DBRundown, Rundown, RundownId, Rundowns } from '../../lib/collections/Rundowns'
import {
	getHash,
	protectString,
	makePromise,
	clone,
	getCurrentTime,
	unprotectObjectArray,
	getRank,
	unprotectString,
	mongoFindOptions,
} from '../../lib/lib'
import * as _ from 'underscore'
import { AdLibActions } from '../../lib/collections/AdLibActions'
import { AdLibPieces } from '../../lib/collections/AdLibPieces'
import { ExpectedMediaItems } from '../../lib/collections/ExpectedMediaItems'
import { ExpectedPlayoutItems } from '../../lib/collections/ExpectedPlayoutItems'
import { IngestDataCache } from '../../lib/collections/IngestDataCache'
import { PartInstances } from '../../lib/collections/PartInstances'
import { Parts } from '../../lib/collections/Parts'
import { PieceInstances } from '../../lib/collections/PieceInstances'
import { Pieces } from '../../lib/collections/Pieces'
import { RundownBaselineAdLibActions } from '../../lib/collections/RundownBaselineAdLibActions'
import { RundownBaselineAdLibPieces } from '../../lib/collections/RundownBaselineAdLibPieces'
import { RundownBaselineObjs } from '../../lib/collections/RundownBaselineObjs'
import { Segments } from '../../lib/collections/Segments'
import {
	runStudioOperationWithCache,
	runStudioOperationWithLock,
	StudioLockFunctionPriority,
} from './studio/lockFunction'
import {
	PlayoutLockFunctionPriority,
	runPlayoutOperationWithLock,
	runPlayoutOperationWithLockFromStudioOperation,
} from './playout/lockFunction'
import { ReadonlyDeep } from 'type-fest'
import { WrappedStudioBlueprint } from './blueprints/cache'
import { StudioUserContext } from './blueprints/context'
import { allowedToMoveRundownOutOfPlaylist } from './rundown'
import { Meteor } from 'meteor/meteor'
import { BlueprintResultOrderedRundowns } from '@sofie-automation/blueprints-integration'
import { MethodContext } from '../../lib/api/methods'
import { RundownPlaylistContentWriteAccess } from '../security/rundownPlaylist'
import { updatePlayoutAfterChangingRundownInPlaylist } from './ingest/commit'
import { DbCacheWriteCollection } from '../cache/CacheCollection'
import { Random } from 'meteor/random'
import { asyncCollectionRemove, asyncCollectionFindOne } from '../lib/database'
import { ExpectedPackages } from '../../lib/collections/ExpectedPackages'
import { checkAccessToPlaylist } from './lib'

export function removeEmptyPlaylists(studioId: StudioId) {
	runStudioOperationWithCache('removeEmptyPlaylists', studioId, StudioLockFunctionPriority.MISC, async (cache) => {
		// Skip any playlists which are active
		const playlists = cache.RundownPlaylists.findFetch({ activationId: { $exists: false } })

		// We want to run them all in parallel fibers
		await Promise.allSettled(
			playlists.map(async (playlist) =>
				makePromise(() => {
					// Take the playlist lock, to ensure we don't fight something else
					runPlayoutOperationWithLockFromStudioOperation(
						'removeEmptyPlaylists',
						cache,
						playlist,
						PlayoutLockFunctionPriority.MISC,
						async () => {
							const rundowns = Rundowns.find({ playlistId: playlist._id }).count()
							if (rundowns === 0) {
								await removeRundownPlaylistFromDb(playlist)
							}
						}
					)
				})
			)
		)
	})
}

/**
 * Convert the playlistExternalId into a playlistId.
 * When we've received an externalId for a playlist, that can directly be used to reference a playlistId
 */
export function getPlaylistIdFromExternalId(studioId: StudioId, playlistExternalId: string): RundownPlaylistId {
	return protectString(getHash(`${studioId}_${playlistExternalId}`))
}

export async function removeRundownPlaylistFromDb(playlist: ReadonlyDeep<RundownPlaylist>): Promise<void> {
	if (playlist.activationId)
		throw new Meteor.Error(500, `RundownPlaylist "${playlist._id}" is active and cannot be removed`)

	// We assume we have the master lock at this point
	const rundownIds = Rundowns.find({ playlistId: playlist._id }, { fields: { _id: 1 } }).map((r) => r._id)

	await Promise.allSettled([
		asyncCollectionRemove(RundownPlaylists, { _id: playlist._id }),
		removeRundownsFromDb(rundownIds),
	])
}
export async function removeRundownsFromDb(rundownIds: RundownId[]): Promise<void> {
	// Note: playlists are not removed by this, one could be left behind empty
	if (rundownIds.length > 0) {
		await Promise.allSettled([
			asyncCollectionRemove(Rundowns, { _id: { $in: rundownIds } }),
			asyncCollectionRemove(AdLibActions, { rundownId: { $in: rundownIds } }),
			asyncCollectionRemove(AdLibPieces, { rundownId: { $in: rundownIds } }),
			asyncCollectionRemove(ExpectedMediaItems, { rundownId: { $in: rundownIds } }),
			asyncCollectionRemove(ExpectedPlayoutItems, { rundownId: { $in: rundownIds } }),
			asyncCollectionRemove(ExpectedPackages, { rundownId: { $in: rundownIds } }),
			asyncCollectionRemove(IngestDataCache, { rundownId: { $in: rundownIds } }),
			asyncCollectionRemove(RundownBaselineAdLibPieces, { rundownId: { $in: rundownIds } }),
			asyncCollectionRemove(Segments, { rundownId: { $in: rundownIds } }),
			asyncCollectionRemove(Parts, { rundownId: { $in: rundownIds } }),
			asyncCollectionRemove(PartInstances, { rundownId: { $in: rundownIds } }),
			asyncCollectionRemove(Pieces, { startRundownId: { $in: rundownIds } }),
			asyncCollectionRemove(PieceInstances, { rundownId: { $in: rundownIds } }),
			asyncCollectionRemove(RundownBaselineAdLibActions, { rundownId: { $in: rundownIds } }),
			asyncCollectionRemove(RundownBaselineObjs, { rundownId: { $in: rundownIds } }),
		])
	}
}

export interface RundownPlaylistAndOrder {
	rundownPlaylist: DBRundownPlaylist
	order: BlueprintResultOrderedRundowns
}

export function produceRundownPlaylistInfoFromRundown(
	studio: ReadonlyDeep<Studio>,
	studioBlueprint: WrappedStudioBlueprint | undefined,
	existingPlaylist: RundownPlaylist | undefined,
	playlistId: RundownPlaylistId,
	playlistExternalId: string,
	rundowns: ReadonlyDeep<Array<Rundown>>
): RundownPlaylistAndOrder {
	const playlistInfo = studioBlueprint?.blueprint?.getRundownPlaylistInfo
		? studioBlueprint.blueprint.getRundownPlaylistInfo(
				new StudioUserContext(
					{
						name: 'produceRundownPlaylistInfoFromRundown',
						identifier: `studioId=${studio._id},playlistId=${playlistId},rundownIds=${rundowns
							.map((r) => r._id)
							.join(',')}`,
						tempSendUserNotesIntoBlackHole: true,
					},
					studio
				),
				unprotectObjectArray(clone<Array<Rundown>>(rundowns))
		  )
		: null

	const rundownsInDefaultOrder = sortDefaultRundownInPlaylistOrder(rundowns)

	let newPlaylist: DBRundownPlaylist
	if (playlistInfo) {
		newPlaylist = {
			created: getCurrentTime(),
			currentPartInstanceId: null,
			nextPartInstanceId: null,
			previousPartInstanceId: null,

			...existingPlaylist,

			_id: playlistId,
			externalId: playlistExternalId,
			organizationId: studio.organizationId,
			studioId: studio._id,
			name: playlistInfo.playlist.name,
			expectedStart: playlistInfo.playlist.expectedStart,
			expectedDuration: playlistInfo.playlist.expectedDuration,

			loop: playlistInfo.playlist.loop,

			outOfOrderTiming: playlistInfo.playlist.outOfOrderTiming,
			timeOfDayCountdowns: playlistInfo.playlist.timeOfDayCountdowns,

			modified: getCurrentTime(),
		}
	} else {
		newPlaylist = {
			...defaultPlaylistForRundown(rundownsInDefaultOrder[0], studio, existingPlaylist),
			_id: playlistId,
			externalId: playlistExternalId,
		}
	}

	// If no order is provided, fall back to default sorting:
	const order = playlistInfo?.order ?? _.object(rundownsInDefaultOrder.map((i, index) => [i._id, index + 1]))

	return {
		rundownPlaylist: newPlaylist,
		order: order, // Note: if playlist.rundownRanksAreSetInSofie is set, this order should be ignored later
	}
}
function defaultPlaylistForRundown(
	rundown: ReadonlyDeep<DBRundown>,
	studio: ReadonlyDeep<Studio>,
	existingPlaylist?: RundownPlaylist
): Omit<DBRundownPlaylist, '_id' | 'externalId'> {
	return {
		created: getCurrentTime(),
		currentPartInstanceId: null,
		nextPartInstanceId: null,
		previousPartInstanceId: null,

		...existingPlaylist,

		organizationId: studio.organizationId,
		studioId: studio._id,
		name: rundown.name,
		expectedStart: rundown.expectedStart,
		expectedDuration: rundown.expectedDuration,

		modified: getCurrentTime(),
	}
}

/** Set _rank and playlistId of rundowns in a playlist */
export function updateRundownsInPlaylist(
	playlist: DBRundownPlaylist,
	rundownRanks: BlueprintResultOrderedRundowns,
	rundownCollection: DbCacheWriteCollection<Rundown, DBRundown>
) {
	let maxRank: number = Number.NEGATIVE_INFINITY
	let unrankedRundowns: DBRundown[] = []

	for (const rundown of rundownCollection.findFetch({})) {
		if (!playlist.rundownRanksAreSetInSofie) {
			const rundownRank = rundownRanks[unprotectString(rundown._id)]
			if (rundownRank !== undefined) {
				rundown._rank = rundownRank
				rundownCollection.update(rundown._id, { $set: { _rank: rundownRank } })
			} else {
				unrankedRundowns.push(rundown)
			}
		}

		if (!_.isNaN(Number(rundown._rank))) {
			maxRank = Math.max(maxRank, rundown._rank)
		} else {
			unrankedRundowns.push(rundown)
		}
	}

	if (playlist.rundownRanksAreSetInSofie) {
		// Place new/unknown rundowns at the end:

		const orderedUnrankedRundowns = sortDefaultRundownInPlaylistOrder(unrankedRundowns)

		orderedUnrankedRundowns.forEach((rundown) => {
			rundownCollection.update(rundown._id, { $set: { _rank: ++maxRank } })
		})
	}
}
/** Move a rundown manually (by a user in Sofie)  */
export function moveRundownIntoPlaylist(
	context: MethodContext,
	/** The rundown to be moved */
	rundownId: RundownId,
	/** Which playlist to move into. If null, move into a (new) separate playlist */
	intoPlaylistId: RundownPlaylistId | null,
	/** The new rundowns in the new playlist */
	rundownsIdsInPlaylistInOrder: RundownId[]
): void {
	const access = RundownPlaylistContentWriteAccess.rundown(context, rundownId)

	const rundown: Rundown = access.rundown
	const oldPlaylist: RundownPlaylist | null = access.playlist

	if (!rundown) throw new Meteor.Error(404, `Rundown "${rundownId}" not found!`)
	if (oldPlaylist && rundown.playlistId !== oldPlaylist._id)
		throw new Meteor.Error(
			500,
			`moveRundown: rundown.playlistId "${rundown.playlistId}" is not equal to oldPlaylist._id "${oldPlaylist._id}"`
		)

	runStudioOperationWithLock('moveRundown', rundown.studioId, StudioLockFunctionPriority.MISC, (lock) => {
		let intoPlaylist: RundownPlaylist | null = null
		if (intoPlaylistId) {
			const access2 = RundownPlaylistContentWriteAccess.anyContent(context, intoPlaylistId)

			intoPlaylist = access2.playlist
			if (!intoPlaylist) throw new Meteor.Error(404, `Playlist "${intoPlaylistId}" not found!`)
		}

		const studio = Studios.findOne(rundown.studioId)
		if (!studio) throw new Meteor.Error(404, `Studio "${rundown.studioId}" of rundown "${rundown._id}" not found!`)

		if (intoPlaylist && intoPlaylist.studioId !== rundown.studioId) {
			throw new Meteor.Error(
				404,
				`Cannot move Rundown "${rundown._id}" into playlist "${intoPlaylist._id}" because they are in different studios ("${intoPlaylist.studioId}", "${rundown.studioId}")!`
			)
		}

		// Do a check if we're allowed to move out of currently playing playlist:
		if (oldPlaylist && oldPlaylist._id !== intoPlaylist?._id) {
			runPlayoutOperationWithLockFromStudioOperation(
				'moveRundown: remove from old playlist',
				lock,
				oldPlaylist,
				PlayoutLockFunctionPriority.MISC,
				(oldPlaylistLock) => {
					// Reload playlist to ensure it is up-to-date
					const playlist = RundownPlaylists.findOne(oldPlaylist._id)
					if (!playlist)
						throw new Meteor.Error(
							404,
							`RundownPlaylists "${oldPlaylist._id}" for rundown "${rundown._id}" not found!`
						)

					if (!allowedToMoveRundownOutOfPlaylist(playlist, rundown)) {
						throw new Meteor.Error(400, `Not allowed to move currently playing rundown!`)
					}

					// Quickly Remove it from the old playlist so that we can free the lock
					Rundowns.update(rundown._id, {
						$set: { playlistId: protectString('__TMP__'), playlistIdIsSetInSofie: true },
					})

					// ensure the 'old' playout is updated to remove any references to the rundown
					updatePlayoutAfterChangingRundownInPlaylist(playlist, oldPlaylistLock, null, undefined, undefined)
				}
			)
		}

		if (intoPlaylist) {
			// Move into an existing playlist:

			runPlayoutOperationWithLockFromStudioOperation(
				'moveRundown: add into existing playlist',
				lock,
				intoPlaylist,
				PlayoutLockFunctionPriority.MISC,
				async (intoPlaylistLock) => {
					const rundownsCollection = new DbCacheWriteCollection(Rundowns)
					const [playlist] = await Promise.all([
						asyncCollectionFindOne(RundownPlaylists, intoPlaylistLock._playlistId),
						rundownsCollection.prepareInit({ playlistId: intoPlaylistLock._playlistId }, true),
					])

					if (!playlist)
						throw new Meteor.Error(
							404,
							`RundownPlaylists "${intoPlaylistLock._playlistId}" for rundown "${rundown._id}" not found!`
						)

					if (playlist._id === oldPlaylist?._id) {
						// Move the rundown within the playlist

						const i = rundownsIdsInPlaylistInOrder.indexOf(rundownId)
						if (i === -1)
							throw new Meteor.Error(
								500,
								`RundownId "${rundownId}" not found in rundownsIdsInPlaylistInOrder`
							)

						const rundownIdBefore: RundownId | undefined = rundownsIdsInPlaylistInOrder[i - 1]
						const rundownIdAfter: RundownId | undefined = rundownsIdsInPlaylistInOrder[i + 1]

						const rundownBefore: Rundown | undefined =
							rundownIdBefore && rundownsCollection.findOne(rundownIdBefore)
						const rundownAfter: Rundown | undefined =
							rundownIdAfter && rundownsCollection.findOne(rundownIdAfter)

						let newRank: number | undefined = getRank(rundownBefore, rundownAfter)

						if (newRank === undefined) throw new Meteor.Error(500, `newRank is undefined`)

						if (!playlist.rundownRanksAreSetInSofie) {
							RundownPlaylists.update(playlist._id, {
								$set: {
									rundownRanksAreSetInSofie: true,
								},
							})
						}
						rundownsCollection.update(rundown._id, {
							$set: {
								_rank: newRank,
							},
						})
					} else {
						// Moving from another playlist
						rundownsCollection.replace(rundown)

						// Note: When moving into another playlist, the rundown is placed last.

						rundownsCollection.update(rundown._id, {
							$set: {
								playlistId: playlist._id,
								playlistIdIsSetInSofie: true,
								_rank: 99999, // The rank will be set later, in updateRundownsInPlaylist
							},
						})
						rundown.playlistId = playlist._id
						rundown.playlistIdIsSetInSofie = true

						// When updating the rundowns in the playlist, the newly moved rundown will be given it's proper _rank:
						updateRundownsInPlaylist(
							playlist,
							_.object(rundownsIdsInPlaylistInOrder.map((id, index) => [id, index + 1])),
							rundownsCollection
						)
					}

					await rundownsCollection.updateDatabaseWithData()

					// If the playlist is active this could have changed lookahead
					updatePlayoutAfterChangingRundownInPlaylist(
						playlist,
						intoPlaylistLock,
						rundown,
						undefined,
						undefined
					)
				}
			)
		} else {
			// Move into a new playlist:

			// No point locking, as we are creating something fresh and unique here

			const externalId = Random.id()
			const playlist: DBRundownPlaylist = {
				...defaultPlaylistForRundown(rundown, studio),
				externalId: externalId,
				_id: getPlaylistIdFromExternalId(studio._id, externalId),
			}
			RundownPlaylists.insert(playlist)

			Rundowns.update(rundown._id, {
				$set: {
					playlistId: playlist._id,
					playlistIdIsSetInSofie: true,
					_rank: 1,
				},
			})
		}
	})
}
/** Restore the order of rundowns in a playlist, giving control over the ordering back to the NRCS */
export function restoreRundownsInPlaylistToDefaultOrder(context: MethodContext, playlistId: RundownPlaylistId) {
	const access = checkAccessToPlaylist(context, playlistId)

	runPlayoutOperationWithLock(
		access,
		'restoreRundownsInPlaylistToDefaultOrder',
		playlistId,
		PlayoutLockFunctionPriority.MISC,
		async (playlistLock, tmpPlaylist) => {
			const rundownsCollection = new DbCacheWriteCollection(Rundowns)
			const [studio] = await Promise.all([
				asyncCollectionFindOne(Studios, tmpPlaylist.studioId),
				rundownsCollection.prepareInit({ playlistId: tmpPlaylist._id }, true),
			])

			if (!studio)
				throw new Meteor.Error(
					404,
					`Studio "${tmpPlaylist.studioId}" of playlist "${tmpPlaylist._id}" not found!`
				)

			// Update the playlist
			RundownPlaylists.update(tmpPlaylist._id, {
				$set: {
					rundownRanksAreSetInSofie: false,
				},
			})
			const newPlaylist = clone<RundownPlaylist>(tmpPlaylist)
			newPlaylist.rundownRanksAreSetInSofie = false

			// Update the _rank of the rundowns
			const playlistInfo = produceRundownPlaylistInfoFromRundown(
				studio,
				undefined,
				newPlaylist,
				newPlaylist._id,
				newPlaylist.externalId,
				rundownsCollection.findFetch({})
			)
			updateRundownsInPlaylist(newPlaylist, playlistInfo.order, rundownsCollection)

			await rundownsCollection.updateDatabaseWithData()

			// If the playlist is active this could have changed lookahead
			updatePlayoutAfterChangingRundownInPlaylist(newPlaylist, playlistLock, null, undefined, undefined)
		}
	)
}

function sortDefaultRundownInPlaylistOrder(rundowns: ReadonlyDeep<Array<DBRundown>>): ReadonlyDeep<Array<DBRundown>> {
	return mongoFindOptions<ReadonlyDeep<DBRundown>, ReadonlyDeep<DBRundown>>(rundowns, {
		sort: {
			expectedStart: 1,
			name: 1,
			_id: 1,
		},
	})
}
