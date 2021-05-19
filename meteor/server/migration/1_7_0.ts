import { getCurrentTime, protectString, getRandomId } from '../../lib/lib'
import { Rundowns } from '../../lib/collections/Rundowns'
import { RundownPlaylists, RundownPlaylistId } from '../../lib/collections/RundownPlaylists'
import { makePlaylistFromRundown_1_0_0 } from './deprecatedDataTypes/1_0_1'
import { Random } from 'meteor/random'
import { addMigrationSteps } from './databaseMigration'
import { setExpectedVersion } from './lib'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'

// 1.7.0 (Release 19)
export const addSteps = addMigrationSteps('1.7.0', [
	{
		// migrate from Rundowns to RundownPlaylists
		id: 'convert Rundowns to RundownPlaylists',
		canBeRunAutomatically: true,
		validate: () => {
			let validate: boolean | string = false
			let count = Rundowns.find({
				$or: [
					{
						playlistId: {
							$exists: false,
						},
					},
					{
						playlistId: protectString(''),
					},
				],
			}).count()
			if (count > 0) {
				validate = `Orphaned rundowns: ${count}`
			}

			return validate
		},
		migrate: () => {
			Rundowns.find({
				$or: [
					{
						playlistId: {
							$exists: false,
						},
					},
					{
						playlistId: protectString(''),
					},
				],
			}).forEach((rundown) => {
				const playlistId: RundownPlaylistId = getRandomId()
				const playlist = makePlaylistFromRundown_1_0_0(rundown, playlistId)
				playlist.modified = getCurrentTime()
				RundownPlaylists.insert(playlist)
				Rundowns.update(rundown._id, {
					$set: {
						playlistId,
						_rank: 1,
					},
				})
			})
		},
	},
	setExpectedVersion('expectedVersion.playoutDevice', PeripheralDeviceAPI.DeviceType.PLAYOUT, '_process', '^1.6.2'),
	setExpectedVersion('expectedVersion.mosDevice', PeripheralDeviceAPI.DeviceType.MOS, '_process', '^1.2.0'),
])
