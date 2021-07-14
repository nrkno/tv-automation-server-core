import { Meteor } from 'meteor/meteor'
import { check } from '../../../lib/check'
import { IngestActions } from './actions'
import { RundownPlaylistId } from '../../../lib/collections/RundownPlaylists'
import { Settings } from '../../../lib/Settings'
import { SegmentId, Segments } from '../../../lib/collections/Segments'
import { RundownIngestDataCache } from './ingestCache'
import { Rundowns } from '../../../lib/collections/Rundowns'
import { handleUpdatedSegment } from './rundownInput'
import { PeripheralDevice } from '../../../lib/collections/PeripheralDevices'
import { logger } from '../../logging'
import { waitForPromise } from '../../../lib/lib'
import { updateExpectedMediaItemsOnRundown } from './expectedMediaItems'
import { runIngestOperationFromRundown } from './lockFunction'
import { updateExpectedPackagesOnRundown } from './expectedPackages'

if (!Settings.enableUserAccounts) {
	Meteor.methods({
		/**
		 * Simulate a 'Reload from NRCS' for the specified playlist
		 */
		debug_playlistRunBlueprints: (rundownPlaylistId: RundownPlaylistId, purgeExisting?: boolean) => {
			try {
				check(rundownPlaylistId, String)
				IngestActions.regenerateRundownPlaylist(null, rundownPlaylistId, purgeExisting)
			} catch (e) {
				logger.error(e)
				throw e
			}
		},
		/**
		 * Simulate a 'Reload from NRCS' for a particular segment in a rundown
		 * Getting the segmentId is tricky, but can be done by either inspecting the DOM, or the mongo database
		 */
		debug_segmentRunBlueprints: (segmentId: SegmentId) => {
			check(segmentId, String)

			const segment = Segments.findOne(segmentId)
			if (!segment) throw new Meteor.Error(404, 'Segment not found')
			const rundown = Rundowns.findOne(segment.rundownId)
			if (!rundown) throw new Meteor.Error(404, 'Rundown not found')

			const ingestCache = waitForPromise(RundownIngestDataCache.create(rundown._id))
			const ingestSegment = ingestCache.fetchSegment(segment._id)
			if (!ingestSegment) throw new Meteor.Error(404, 'Segment ingest data not found')

			handleUpdatedSegment(
				{ studioId: rundown.studioId } as PeripheralDevice,
				rundown.externalId,
				ingestSegment,
				true
			)
		},
		/**
		 * Regenerate all the expected media items for all rundowns in the system
		 * This shouldn't be necessary as ingest will do this for each rundown as part of its workflow
		 */
		debug_recreateExpectedMediaItems() {
			const rundowns = Rundowns.find().fetch()

			rundowns.forEach((rundown) => {
				runIngestOperationFromRundown('', rundown, async (cache) => updateExpectedMediaItemsOnRundown(cache))
			})
		},
		/**
		 * Regenerate all the expected packages for all rundowns in the system
		 * This shouldn't be necessary as ingest will do this for each rundown as part of its workflow
		 */
		debug_recreateExpectedPackages() {
			const rundowns = Rundowns.find().fetch()

			rundowns.forEach((rundown) => {
				runIngestOperationFromRundown('', rundown, async (cache) => updateExpectedPackagesOnRundown(cache))
			})
		},
	})
}
