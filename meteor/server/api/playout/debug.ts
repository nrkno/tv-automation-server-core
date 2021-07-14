import { Meteor } from 'meteor/meteor'
import { logger } from '../../logging'
import { waitForPromise, waitForPromiseAll } from '../../../lib/lib'
import { RundownPlaylists, RundownPlaylistId } from '../../../lib/collections/RundownPlaylists'
import { Settings } from '../../../lib/Settings'
import { setNextPart } from './lib'
import { syncPlayheadInfinitesForNextPartInstance } from './infinites'
import { forceClearAllActivationCaches } from '../../cache/ActivationCache'
import { PartInstances } from '../../../lib/collections/PartInstances'
import { PieceInstances } from '../../../lib/collections/PieceInstances'
import { updateStudioOrPlaylistTimeline, updateTimeline } from './timeline'
import { forceClearAllBlueprintConfigCaches } from '../blueprints/config'
import {
	PlayoutLockFunctionPriority,
	runPlayoutOperationWithCache,
	runPlayoutOperationWithCacheFromStudioOperation,
} from './lockFunction'
import { getSelectedPartInstancesFromCache } from './cache'
import { removeRundownPlaylistFromDb } from '../rundownPlaylist'
import { check } from 'meteor/check'
import { StudioId } from '../../../lib/collections/Studios'
import { ensureNextPartIsValid } from '../ingest/updateNext'
import { runStudioOperationWithCache, StudioLockFunctionPriority } from '../studio/lockFunction'

if (!Settings.enableUserAccounts) {
	// These are temporary method to fill the rundown database with some sample data
	// for development

	Meteor.methods({
		/**
		 * Remove a playlist from the system.
		 * This can be done in the ui too, but this will bypass any checks that are usually performed
		 */
		debug_removePlaylist(id: RundownPlaylistId) {
			logger.debug('Remove rundown "' + id + '"')

			const playlist = RundownPlaylists.findOne(id)
			if (!playlist) throw new Meteor.Error(404, `RundownPlaylist "${id}" not found`)
			waitForPromise(removeRundownPlaylistFromDb(playlist))
		},

		/**
		 * Remove ALL playlists from the system.
		 * Be careful with this, it doesn't care that they might be active
		 */
		debug_removeAllPlaylists() {
			logger.debug('Remove all rundowns')

			waitForPromiseAll(RundownPlaylists.find({}).map((playlist) => removeRundownPlaylistFromDb(playlist)))
		},

		/**
		 * Regenerate the timeline for the specified studio
		 * This will rerun the onTimelineGenerate for your showstyle blueprints, and is particularly useful for debugging that
		 */
		debug_updateTimeline: (studioId: StudioId) => {
			try {
				check(studioId, String)
				logger.info(`debug_updateTimeline: "${studioId}"`)

				runStudioOperationWithCache(
					'debug_updateTimeline',
					studioId,
					StudioLockFunctionPriority.USER_PLAYOUT,
					async (cache) => {
						await updateStudioOrPlaylistTimeline(cache)
					}
				)
			} catch (e) {
				logger.error(e)
				throw e
			}
		},
		/**
		 * For the active rundown in the studio, ensure that the nexted-part is correct
		 * This was added while debugging issues with the nexted-part not updating after an ingest operation
		 * Likely not very useful
		 */
		debug_updateNext: (studioId: StudioId) => {
			try {
				check(studioId, String)
				logger.info(`debug_updateNext: "${studioId}"`)

				runStudioOperationWithCache(
					'debug_updateNext',
					studioId,
					StudioLockFunctionPriority.USER_PLAYOUT,
					(cache) => {
						const playlists = cache.getActiveRundownPlaylists()
						if (playlists.length === 1) {
							return runPlayoutOperationWithCacheFromStudioOperation(
								'updateStudioOrPlaylistTimeline',
								cache,
								playlists[0],
								PlayoutLockFunctionPriority.USER_PLAYOUT,
								null,
								async (playlistCache) => {
									await ensureNextPartIsValid(playlistCache)
								}
							)
						} else {
							throw new Error('No playlist active')
						}
					}
				)
			} catch (e) {
				logger.error(e)
				throw e
			}
		},

		/**
		 * Ensure that the infinite pieces on the nexted-part are correct
		 * Added to debug some issues with infinites not updating
		 */
		debug_syncPlayheadInfinitesForNextPartInstance(id: RundownPlaylistId) {
			logger.info(`syncPlayheadInfinitesForNextPartInstance ${id}`)

			runPlayoutOperationWithCache(
				null,
				'debug_syncPlayheadInfinitesForNextPartInstance',
				id,
				PlayoutLockFunctionPriority.MISC,
				null,
				async (cache) => {
					await syncPlayheadInfinitesForNextPartInstance(cache)
				}
			)
		},

		/**
		 * Clear various caches in the system
		 * Good to run if you suspect a cache is stuck with some stale data
		 */
		debug_forceClearAllCaches() {
			logger.info('forceClearAllCaches')

			forceClearAllActivationCaches()
			forceClearAllBlueprintConfigCaches()
		},

		/**
		 * Remove all 'reset' partisntances and pieceinstances
		 * I don't know when this would be useful
		 */
		debug_clearAllResetInstances() {
			logger.info('clearAllResetInstances')

			PartInstances.remove({ reset: true })
			PieceInstances.remove({ reset: true })
		},

		/**
		 * Regenerate the nexted-partinstance from its part.
		 * This can be useful to get ingest updates across when the blueprint syncIngestUpdateToPartInstance method is not implemented, or to bypass that method when it is defined
		 */
		debug_regenerateNextPartInstance(id: RundownPlaylistId) {
			logger.info('regenerateNextPartInstance')

			runPlayoutOperationWithCache(
				null,
				'debug_regenerateNextPartInstance',
				id,
				PlayoutLockFunctionPriority.MISC,
				null,
				async (cache) => {
					const playlist = cache.Playlist.doc
					if (playlist.nextPartInstanceId && playlist.activationId) {
						const { nextPartInstance } = getSelectedPartInstancesFromCache(cache)
						const part = nextPartInstance ? cache.Parts.findOne(nextPartInstance.part._id) : undefined
						if (part) {
							setNextPart(cache, null)
							setNextPart(cache, { part: part })

							await updateTimeline(cache)
						}
					}
				}
			)
		},
	})
}
