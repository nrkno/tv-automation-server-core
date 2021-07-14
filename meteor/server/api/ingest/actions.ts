import { getPeripheralDeviceFromRundown } from './lib'
import { PeripheralDeviceAPI } from '../../../lib/api/peripheralDevice'
import { MOSDeviceActions } from './mosDevice/actions'
import { Meteor } from 'meteor/meteor'
import { Rundowns, Rundown } from '../../../lib/collections/Rundowns'
import { Part } from '../../../lib/collections/Parts'
import { check } from '../../../lib/check'
import { resetRundownPlaylist } from '../playout/lib'
import { regenerateRundown } from './rundownInput'
import { logger } from '../../logging'
import { RundownPlaylists, RundownPlaylistId } from '../../../lib/collections/RundownPlaylists'
import { TriggerReloadDataResponse } from '../../../lib/api/userActions'
import { waitForPromise, waitForPromiseAll } from '../../../lib/lib'
import { Segment } from '../../../lib/collections/Segments'
import { GenericDeviceActions } from './genericDevice/actions'
import {
	runPlayoutOperationWithLock,
	runPlayoutOperationWithCacheFromStudioOperation,
	PlayoutLockFunctionPriority,
} from '../playout/lockFunction'
import { removeRundownsFromDb } from '../rundownPlaylist'
import { VerifiedRundownPlaylistContentAccess } from '../lib'

/*
This file contains actions that can be performed on an ingest-device (MOS-device)
*/
export namespace IngestActions {
	/**
	 * Trigger a reload of a rundown
	 */
	export function reloadRundown(rundown: Rundown): TriggerReloadDataResponse {
		const device = getPeripheralDeviceFromRundown(rundown)

		// TODO: refacor this into something nicer perhaps?
		if (device.type === PeripheralDeviceAPI.DeviceType.MOS) {
			return MOSDeviceActions.reloadRundown(device, rundown)
		} else if (device.type === PeripheralDeviceAPI.DeviceType.SPREADSHEET) {
			return GenericDeviceActions.reloadRundown(device, rundown)
		} else if (device.type === PeripheralDeviceAPI.DeviceType.INEWS) {
			return GenericDeviceActions.reloadRundown(device, rundown)
		} else {
			throw new Meteor.Error(400, `The device ${device._id} does not support the method "reloadRundown"`)
		}
	}

	export function reloadSegment(rundown: Rundown, segment: Segment): TriggerReloadDataResponse {
		const device = getPeripheralDeviceFromRundown(rundown)

		if (device.type === PeripheralDeviceAPI.DeviceType.MOS) {
			// MOS doesn't support reloading a segment, so do the whole rundown
			return MOSDeviceActions.reloadRundown(device, rundown)
		} else if (device.type === PeripheralDeviceAPI.DeviceType.INEWS) {
			return GenericDeviceActions.reloadSegment(device, rundown, segment)
		} else {
			throw new Meteor.Error(400, `The device ${device._id} does not support the method "reloadRundown"`)
		}
	}

	/**
	 * Notify the device on what part is currently playing
	 * @param rundown
	 * @param currentPlayingPart
	 */
	export function notifyCurrentPlayingPart(rundown: Rundown, currentPlayingPart: Part | null) {
		if (!rundown.peripheralDeviceId) {
			logger.warn(`Rundown "${rundown._id} has no peripheralDevice. Skipping notifyCurrentPlayingPart`)
			return
		}
		const device = getPeripheralDeviceFromRundown(rundown)
		const playlist = RundownPlaylists.findOne(rundown.playlistId)

		if (!playlist) throw new Meteor.Error(501, `Orphaned rundown: "${rundown._id}"`)
		if (playlist.rehearsal) currentPlayingPart = null

		const currentPlayingPartExternalId: string | null = currentPlayingPart ? currentPlayingPart.externalId : null
		if (currentPlayingPartExternalId) {
			Rundowns.update(this._id, {
				$set: {
					notifiedCurrentPlayingPartExternalId: currentPlayingPartExternalId,
				},
			})
			rundown.notifiedCurrentPlayingPartExternalId = currentPlayingPartExternalId
		} else {
			Rundowns.update(this._id, {
				$unset: {
					currentPlayingStoryStatus: 1,
				},
			})
			delete rundown.notifiedCurrentPlayingPartExternalId
		}

		if (
			device.category === PeripheralDeviceAPI.DeviceCategory.INGEST &&
			device.type === PeripheralDeviceAPI.DeviceType.MOS // TODO: refacor this into something nicer perhaps?
		) {
			MOSDeviceActions.notifyCurrentPlayingPart(
				device,
				rundown,
				rundown.notifiedCurrentPlayingPartExternalId || null,
				currentPlayingPartExternalId
			)
		}
	}
	/**
	 * Run the cached data through blueprints in order to re-generate the Rundown
	 */
	export function regenerateRundownPlaylist(
		access: VerifiedRundownPlaylistContentAccess | null,
		rundownPlaylistId: RundownPlaylistId,
		purgeExisting?: boolean
	) {
		check(rundownPlaylistId, String)

		const ingestData = waitForPromise(
			runPlayoutOperationWithLock(
				access,
				'regenerateRundownPlaylist',
				rundownPlaylistId,
				PlayoutLockFunctionPriority.MISC,
				async (playlistLock) => {
					const rundownPlaylist = RundownPlaylists.findOne(rundownPlaylistId)
					if (!rundownPlaylist)
						throw new Meteor.Error(404, `Rundown Playlist "${rundownPlaylistId}" not found`)

					const studio = rundownPlaylist.getStudio()
					if (!studio) {
						throw new Meteor.Error(
							404,
							`Studios "${rundownPlaylist.studioId}" was not found for Rundown Playlist "${rundownPlaylist._id}"`
						)
					}

					logger.info(`Regenerating rundown playlist ${rundownPlaylist.name} (${rundownPlaylist._id})`)

					const rundowns = Rundowns.find({ playlistId: rundownPlaylistId }).fetch()
					if (rundowns.length === 0) return []

					// Cleanup old state
					if (purgeExisting) {
						await removeRundownsFromDb(rundowns.map((r) => r._id))
					} else {
						await runPlayoutOperationWithCacheFromStudioOperation(
							'regenerateRundownPlaylist:init',
							playlistLock,
							rundownPlaylist,
							PlayoutLockFunctionPriority.MISC,
							null,
							async (cache) => resetRundownPlaylist(cache)
						)
					}

					// exit the sync function, so the cache is written back
					return rundowns.map((rundown) => ({
						rundownExternalId: rundown.externalId,
						studio,
					}))
				}
			)
		)

		// Fire off all the updates in parallel, in their own low-priority tasks
		waitForPromiseAll(
			ingestData.map(async ({ rundownExternalId, studio }) =>
				regenerateRundown(studio, rundownExternalId, undefined)
			)
		)
	}
}
