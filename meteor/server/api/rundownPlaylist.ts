import { Studio } from '../../lib/collections/Studios'
import { RundownPlaylists } from '../../lib/collections/RundownPlaylists'
import { Rundowns } from '../../lib/collections/Rundowns'
import { removeRundownPlaylistFromCache } from './playout/lib'
import { waitForPromise } from '../../lib/lib'
import { initCacheForRundownPlaylistFromStudio, initCacheForRundownPlaylist } from '../DatabaseCaches'
import * as _ from 'underscore'

export function removeEmptyPlaylists(studio: Studio) {
	const playlistsInStudio = RundownPlaylists.find({
		studioId: studio._id,
	}).fetch()
	const rundowns = Rundowns.find({
		playlistId: { $in: playlistsInStudio.map((p) => p._id) },
	}).fetch()

	_.each(playlistsInStudio, (playlist) => {
		if (rundowns.filter((r) => r.playlistId === playlist._id).length === 0) {
			// playlist is empty, remove it:

			const cache = waitForPromise(initCacheForRundownPlaylist(playlist))
			removeRundownPlaylistFromCache(cache, playlist)
			waitForPromise(cache.saveAllToDatabase())
		}
	})
}
