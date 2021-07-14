import { ReadonlyDeep } from 'type-fest'
import _ from 'underscore'
import { PartInstance, DBPartInstance, PartInstances } from '../../../lib/collections/PartInstances'
import { Part, DBPart, Parts } from '../../../lib/collections/Parts'
import { PeripheralDevice, PeripheralDevices } from '../../../lib/collections/PeripheralDevices'
import { PieceInstance, PieceInstances } from '../../../lib/collections/PieceInstances'
import {
	RundownPlaylist,
	DBRundownPlaylist,
	RundownPlaylistId,
	RundownPlaylists,
} from '../../../lib/collections/RundownPlaylists'
import { Rundown, DBRundown, Rundowns, RundownId } from '../../../lib/collections/Rundowns'
import { Segment, DBSegment, Segments } from '../../../lib/collections/Segments'
import { Studio, Studios } from '../../../lib/collections/Studios'
import { Timeline, TimelineComplete } from '../../../lib/collections/Timeline'
import { ActivationCache, getActivationCache } from '../../cache/ActivationCache'
import { DbCacheReadCollection, DbCacheWriteCollection } from '../../cache/CacheCollection'
import { DbCacheReadObject, DbCacheWriteObject } from '../../cache/CacheObject'
import { CacheBase, ReadOnlyCache } from '../../cache/CacheBase'
import { profiler } from '../profiler'
import { removeRundownPlaylistFromDb } from '../rundownPlaylist'
import { CacheForStudioBase } from '../studio/cache'
import { getRundownsSegmentsAndPartsFromCache } from './lib'
import { CacheForIngest } from '../ingest/cache'
import { Meteor } from 'meteor/meteor'
import { ShowStyleBaseId } from '../../../lib/collections/ShowStyleBases'

/**
 * This is a cache used for playout operations.
 * It is intentionally very lightweight, with the intention of it to be used only for some initial verification that a playout operation can be performed.
 */
export class CacheForPlayoutPreInit extends CacheBase<CacheForPlayout> {
	public readonly isPlayout = true
	public readonly PlaylistId: RundownPlaylistId

	public readonly activationCache: ActivationCache

	public readonly Studio: DbCacheReadObject<Studio, Studio>
	public readonly PeripheralDevices: DbCacheReadCollection<PeripheralDevice, PeripheralDevice>

	public readonly Playlist: DbCacheWriteObject<RundownPlaylist, DBRundownPlaylist>
	public readonly Rundowns: DbCacheReadCollection<Rundown, DBRundown>

	protected constructor(
		playlistId: RundownPlaylistId,
		activationCache: ActivationCache,
		studio: DbCacheReadObject<Studio, Studio>,
		peripheralDevices: DbCacheReadCollection<PeripheralDevice, PeripheralDevice>,
		playlist: DbCacheWriteObject<RundownPlaylist, DBRundownPlaylist>,
		rundowns: DbCacheReadCollection<Rundown, DBRundown>
	) {
		super()

		this.PlaylistId = playlistId
		this.activationCache = activationCache

		this.Studio = studio
		this.PeripheralDevices = peripheralDevices
		this.Playlist = playlist
		this.Rundowns = rundowns
	}

	static async createPreInit(tmpPlaylist: ReadonlyDeep<RundownPlaylist>): Promise<CacheForPlayoutPreInit> {
		const initData = await CacheForPlayoutPreInit.loadInitData(tmpPlaylist, true, undefined)
		return new CacheForPlayoutPreInit(tmpPlaylist._id, ...initData)
	}

	protected static async loadInitData(
		tmpPlaylist: ReadonlyDeep<RundownPlaylist>,
		reloadPlaylist: boolean,
		existingRundowns: DbCacheReadCollection<Rundown, DBRundown> | undefined
	): Promise<
		[
			ActivationCache,
			DbCacheReadObject<Studio, Studio>,
			DbCacheReadCollection<PeripheralDevice, PeripheralDevice>,
			DbCacheWriteObject<RundownPlaylist, DBRundownPlaylist>,
			DbCacheReadCollection<Rundown, DBRundown>
		]
	> {
		const activationCache = getActivationCache(tmpPlaylist.studioId, tmpPlaylist._id)

		const [playlist, rundowns] = await Promise.all([
			reloadPlaylist
				? await DbCacheWriteObject.createFromDatabase(RundownPlaylists, false, tmpPlaylist._id)
				: DbCacheWriteObject.createFromDoc<RundownPlaylist, DBRundownPlaylist>(
						RundownPlaylists,
						false,
						tmpPlaylist
				  ),
			existingRundowns ?? DbCacheReadCollection.createFromDatabase(Rundowns, { playlistId: tmpPlaylist._id }),
		])

		await activationCache.initialize(playlist.doc, rundowns.findFetch())

		const studio = DbCacheReadObject.createFromDoc(Studios, false, activationCache.getStudio())
		const rawPeripheralDevices = await activationCache.getPeripheralDevices()
		const peripheralDevices = DbCacheReadCollection.createFromArray(PeripheralDevices, rawPeripheralDevices)

		return [activationCache, studio, peripheralDevices, playlist, rundowns]
	}
}

/**
 * This is a cache used for playout operations.
 * It contains everything that is needed to generate the timeline, and everything except for pieces needed to update the partinstances.
 * Anything not in this cache should not be needed often, and only for specific operations (eg, AdlibActions needed to run one).
 */
export class CacheForPlayout extends CacheForPlayoutPreInit implements CacheForStudioBase {
	private toBeRemoved: boolean = false

	public readonly Timeline: DbCacheWriteCollection<TimelineComplete, TimelineComplete>

	public readonly Segments: DbCacheReadCollection<Segment, DBSegment>
	public readonly Parts: DbCacheReadCollection<Part, DBPart>
	public readonly PartInstances: DbCacheWriteCollection<PartInstance, DBPartInstance>
	public readonly PieceInstances: DbCacheWriteCollection<PieceInstance, PieceInstance>

	protected constructor(
		playlistId: RundownPlaylistId,
		activationCache: ActivationCache,
		studio: DbCacheReadObject<Studio, Studio>,
		peripheralDevices: DbCacheReadCollection<PeripheralDevice, PeripheralDevice>,
		playlist: DbCacheWriteObject<RundownPlaylist, DBRundownPlaylist>,
		rundowns: DbCacheReadCollection<Rundown, DBRundown>,
		segments: DbCacheReadCollection<Segment, DBSegment>,
		parts: DbCacheReadCollection<Part, DBPart>,
		partInstances: DbCacheWriteCollection<PartInstance, DBPartInstance>,
		pieceInstances: DbCacheWriteCollection<PieceInstance, PieceInstance>,
		timeline: DbCacheWriteCollection<TimelineComplete, TimelineComplete>
	) {
		super(playlistId, activationCache, studio, peripheralDevices, playlist, rundowns)

		this.Timeline = timeline

		this.Segments = segments
		this.Parts = parts

		this.PartInstances = partInstances
		this.PieceInstances = pieceInstances
	}

	// static async create(tmpPlaylist: ReadonlyDeep<RundownPlaylist>): Promise<CacheForPlayout> {
	// 	const initData = await CacheForPlayoutPreInit.loadInitData(tmpPlaylist, undefined)
	// 	const res = new CacheForPlayout(tmpPlaylist._id, ...initData)

	// 	return res
	// }

	static async fromInit(initCache: CacheForPlayoutPreInit): Promise<CacheForPlayout> {
		// we are claiming the collections
		initCache._abortActiveTimeout()

		const content = await CacheForPlayout.loadContent(
			null,
			initCache.Playlist.doc,
			initCache.Rundowns.findFetch().map((r) => r._id)
		)

		return new CacheForPlayout(
			initCache.PlaylistId,
			initCache.activationCache,
			initCache.Studio,
			initCache.PeripheralDevices,
			initCache.Playlist,
			initCache.Rundowns,
			...content
		)
	}

	static async fromIngest(
		newPlaylist: ReadonlyDeep<RundownPlaylist>,
		newRundowns: ReadonlyDeep<Array<Rundown>>,
		ingestCache: ReadOnlyCache<CacheForIngest>
	): Promise<CacheForPlayout> {
		const initData = await CacheForPlayoutPreInit.loadInitData(
			newPlaylist,
			false,
			DbCacheReadCollection.createFromArray<Rundown, DBRundown>(Rundowns, newRundowns)
		)

		const contentData = await CacheForPlayout.loadContent(
			ingestCache,
			newPlaylist,
			newRundowns.map((r) => r._id)
		)
		const res = new CacheForPlayout(newPlaylist._id, ...initData, ...contentData)

		return res
	}

	/**
	 * Intitialise the full content of the cache
	 * @param ingestCache A CacheForIngest that is pending saving, if this is following an ingest operation
	 */
	private static async loadContent(
		ingestCache: ReadOnlyCache<CacheForIngest> | null,
		playlist: ReadonlyDeep<RundownPlaylist>,
		rundownIds: RundownId[]
	): Promise<
		[
			DbCacheReadCollection<Segment, DBSegment>,
			DbCacheReadCollection<Part, DBPart>,
			DbCacheWriteCollection<PartInstance, DBPartInstance>,
			DbCacheWriteCollection<PieceInstance, PieceInstance>,
			DbCacheWriteCollection<TimelineComplete, TimelineComplete>
		]
	> {
		const selectedPartInstanceIds = _.compact([
			playlist.currentPartInstanceId,
			playlist.nextPartInstanceId,
			playlist.previousPartInstanceId,
		])

		// If there is an ingestCache, then avoid loading some bits from the db for that rundown
		const loadRundownIds = ingestCache ? rundownIds.filter((id) => id !== ingestCache.RundownId) : rundownIds

		const [segments, parts, ...collections] = await Promise.all([
			DbCacheReadCollection.createFromDatabase(Segments, { rundownId: { $in: loadRundownIds } }),
			DbCacheReadCollection.createFromDatabase(Parts, { rundownId: { $in: loadRundownIds } }),
			DbCacheWriteCollection.createFromDatabase(PartInstances, {
				playlistActivationId: playlist.activationId,
				rundownId: { $in: rundownIds },
				$or: [
					{
						reset: { $ne: true },
					},
					{
						_id: { $in: selectedPartInstanceIds },
					},
				],
			}),
			DbCacheWriteCollection.createFromDatabase(PieceInstances, {
				playlistActivationId: playlist.activationId,
				rundownId: { $in: rundownIds },
				partInstanceId: { $in: selectedPartInstanceIds },
			}),
			// Future: This could be defered until we get to updateTimeline. It could be a small performance boost
			DbCacheWriteCollection.createFromDatabase(Timeline, { _id: playlist.studioId }),
		])

		if (ingestCache) {
			// Populate the collections with the cached data instead
			segments.fillWithDataFromArray(ingestCache.Segments.findFetch(), true)
			parts.fillWithDataFromArray(ingestCache.Parts.findFetch(), true)
		}

		return [segments, parts, ...collections]
	}

	/**
	 * Remove the playlist when this cache is saved.
	 * The cache is cleared of any documents, and any deferred functions are discarded
	 * Note: any deferred functions that get added after this will be ignoted
	 */
	removePlaylist() {
		if (this.Playlist.doc.activationId) {
			throw new Meteor.Error(500, 'Cannot remove the active RundownPlaylist')
		}
		this.toBeRemoved = true

		super.markCollectionsForRemoval()
	}

	discardChanges() {
		this._abortActiveTimeout()

		this.toBeRemoved = false
		super.discardChanges()

		// Discard any hooks too
		this._deferredAfterSaveFunctions.length = 0
		this._deferredFunctions.length = 0

		this.assertNoChanges()
	}

	async saveAllToDatabase() {
		if (this.toBeRemoved) {
			const span = profiler.startSpan('CacheForPlayout.saveAllToDatabase')
			this._abortActiveTimeout()

			// Ignoring any deferred functions

			await removeRundownPlaylistFromDb(this.Playlist.doc)

			super.assertNoChanges()
			span?.end()
		} else {
			return super.saveAllToDatabase()
		}
	}
}

export function getOrderedSegmentsAndPartsFromPlayoutCache(cache: CacheForPlayout): {
	segments: Segment[]
	parts: Part[]
} {
	const rundowns = cache.Rundowns.findFetch(
		{},
		{
			sort: {
				_rank: 1,
				_id: 1,
			},
		}
	)
	return getRundownsSegmentsAndPartsFromCache(cache.Parts, cache.Segments, rundowns)
}
export function getRundownIDsFromCache(cache: CacheForPlayout) {
	return cache.Rundowns.findFetch({}).map((r) => r._id)
}
export function getSelectedPartInstancesFromCache(cache: CacheForPlayout): {
	currentPartInstance: PartInstance | undefined
	nextPartInstance: PartInstance | undefined
	previousPartInstance: PartInstance | undefined
} {
	const playlist = cache.Playlist.doc

	return {
		currentPartInstance: playlist.currentPartInstanceId
			? cache.PartInstances.findOne(playlist.currentPartInstanceId)
			: undefined,
		nextPartInstance: playlist.nextPartInstanceId
			? cache.PartInstances.findOne(playlist.nextPartInstanceId)
			: undefined,
		previousPartInstance: playlist.previousPartInstanceId
			? cache.PartInstances.findOne(playlist.previousPartInstanceId)
			: undefined,
	}
}
export function getShowStyleIdsRundownMappingFromCache(cache: CacheForPlayout): Map<RundownId, ShowStyleBaseId> {
	const rundowns = cache.Rundowns.findFetch({})
	const ret = new Map()

	for (const rundown of rundowns) {
		ret.set(rundown._id, rundown.showStyleBaseId)
	}

	return ret
}
