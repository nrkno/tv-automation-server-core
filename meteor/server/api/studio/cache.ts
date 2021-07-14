import { PeripheralDevice, PeripheralDevices } from '../../../lib/collections/PeripheralDevices'
import {
	RundownPlaylist,
	DBRundownPlaylist,
	RundownPlaylists,
	RundownPlaylistId,
} from '../../../lib/collections/RundownPlaylists'
import { Studio, Studios, StudioId } from '../../../lib/collections/Studios'
import { Timeline, TimelineComplete } from '../../../lib/collections/Timeline'
import { protectString } from '../../../lib/lib'
import { DbCacheReadCollection, DbCacheWriteCollection } from '../../cache/CacheCollection'
import { DbCacheReadObject } from '../../cache/CacheObject'
import { CacheBase } from '../../cache/CacheBase'

export interface CacheForStudioBase {
	readonly Studio: DbCacheReadObject<Studio, Studio>
	readonly PeripheralDevices: DbCacheReadCollection<PeripheralDevice, PeripheralDevice>

	readonly Timeline: DbCacheWriteCollection<TimelineComplete, TimelineComplete>
}

/**
 * This is a cache used for studio operations.
 */
export class CacheForStudio extends CacheBase<CacheForStudio> implements CacheForStudioBase {
	public readonly isStudio = true

	public readonly Studio: DbCacheReadObject<Studio, Studio>
	public readonly PeripheralDevices: DbCacheReadCollection<PeripheralDevice, PeripheralDevice>

	public readonly RundownPlaylists: DbCacheReadCollection<RundownPlaylist, DBRundownPlaylist>
	public readonly Timeline: DbCacheWriteCollection<TimelineComplete, TimelineComplete>

	private constructor(
		studio: DbCacheReadObject<Studio, Studio>,
		peripheralDevices: DbCacheReadCollection<PeripheralDevice, PeripheralDevice>,
		rundownPlaylists: DbCacheReadCollection<RundownPlaylist, DBRundownPlaylist>,
		timeline: DbCacheWriteCollection<TimelineComplete, TimelineComplete>
	) {
		super()

		this.Studio = studio
		this.PeripheralDevices = peripheralDevices

		this.RundownPlaylists = rundownPlaylists
		this.Timeline = timeline
	}

	static async create(studioId: StudioId): Promise<CacheForStudio> {
		const studio = await DbCacheReadObject.createFromDatabase(Studios, false, studioId)

		const collections = await Promise.all([
			DbCacheReadCollection.createFromDatabase(PeripheralDevices, { studioId }),
			DbCacheReadCollection.createFromDatabase(RundownPlaylists, { studioId }),
			DbCacheWriteCollection.createFromDatabase(Timeline, { _id: studioId }),
		])

		return new CacheForStudio(studio, ...collections)
	}

	public getActiveRundownPlaylists(excludeRundownPlaylistId?: RundownPlaylistId): RundownPlaylist[] {
		return this.RundownPlaylists.findFetch({
			activationId: { $exists: true },
			_id: {
				$ne: excludeRundownPlaylistId || protectString(''),
			},
		})
	}
}
