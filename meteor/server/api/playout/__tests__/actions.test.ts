import '../../../../__mocks__/_extendJest'
import { testInFiber, beforeEachInFiber } from '../../../../__mocks__/helpers/jest'
import {
	setupDefaultStudioEnvironment,
	DefaultEnvironment,
	setupMockPeripheralDevice,
	setupDefaultRundownPlaylist,
} from '../../../../__mocks__/helpers/database'
import { Rundowns } from '../../../../lib/collections/Rundowns'
import '../api'
import { activateRundownPlaylist, prepareStudioForBroadcast } from '../actions'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { PeripheralDeviceCommands } from '../../../../lib/collections/PeripheralDeviceCommands'
import { PeripheralDevice } from '../../../../lib/collections/PeripheralDevices'
import { RundownPlaylist, RundownPlaylists } from '../../../../lib/collections/RundownPlaylists'
import { protectString, waitForPromise } from '../../../../lib/lib'
import { PlayoutLockFunctionPriority, runPlayoutOperationWithCache } from '../lockFunction'
import { removeRundownsFromDb } from '../../rundownPlaylist'

// const Timeline = mockupCollection(OrgTimeline)

describe('Playout Actions', () => {
	let env: DefaultEnvironment
	let playoutDevice: PeripheralDevice

	function getPeripheralDeviceCommands(device: PeripheralDevice) {
		return PeripheralDeviceCommands.find({ deviceId: device._id }, { sort: { time: 1 } }).fetch()
	}
	function clearPeripheralDeviceCommands(device: PeripheralDevice) {
		return PeripheralDeviceCommands.remove({ deviceId: device._id })
	}

	beforeEachInFiber(() => {
		env = setupDefaultStudioEnvironment()

		playoutDevice = setupMockPeripheralDevice(
			PeripheralDeviceAPI.DeviceCategory.PLAYOUT,
			PeripheralDeviceAPI.DeviceType.PLAYOUT,
			PeripheralDeviceAPI.SUBTYPE_PROCESS,
			env.studio
		)

		waitForPromise(
			removeRundownsFromDb(
				Rundowns.find()
					.fetch()
					.map((r) => r._id)
			)
		)
	})
	testInFiber('activateRundown', () => {
		const { playlistId: playlistId0 } = setupDefaultRundownPlaylist(env, protectString('ro0'))
		expect(playlistId0).toBeTruthy()

		const getPlaylist0 = () => RundownPlaylists.findOne(playlistId0) as RundownPlaylist

		const { playlistId: playlistId1 } = setupDefaultRundownPlaylist(env, protectString('ro1'))
		expect(playlistId1).toBeTruthy()

		// const getPlaylist1 = () => RundownPlaylists.findOne(playlistId1) as RundownPlaylist

		const { playlistId: playlistId2 } = setupDefaultRundownPlaylist(env, protectString('ro2'))
		expect(playlistId2).toBeTruthy()

		expect(getPeripheralDeviceCommands(playoutDevice)).toHaveLength(0)
		// Activating a rundown, to rehearsal
		runPlayoutOperationWithCache(
			null,
			'activateRundownPlaylist',
			playlistId0,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			null,
			async (cache) => activateRundownPlaylist(cache, true)
		)
		expect(getPlaylist0()).toMatchObject({ activationId: expect.stringMatching(/^randomId/), rehearsal: true })

		// Activating a rundown
		runPlayoutOperationWithCache(
			null,
			'activateRundownPlaylist',
			playlistId0,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			null,
			async (cache) => activateRundownPlaylist(cache, false)
		)
		expect(getPlaylist0()).toMatchObject({ activationId: expect.stringMatching(/^randomId/), rehearsal: false })

		// Activating a rundown, back to rehearsal
		runPlayoutOperationWithCache(
			null,
			'activateRundownPlaylist',
			playlistId0,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			null,
			async (cache) => activateRundownPlaylist(cache, true)
		)
		expect(getPlaylist0()).toMatchObject({ activationId: expect.stringMatching(/^randomId/), rehearsal: true })

		// Activating another rundown
		expect(() => {
			runPlayoutOperationWithCache(
				null,
				'activateRundownPlaylist',
				playlistId1,
				PlayoutLockFunctionPriority.USER_PLAYOUT,
				null,
				async (cache) => activateRundownPlaylist(cache, false)
			)
		}).toThrowError(/only one rundown can be active/i)
	})
	testInFiber('prepareStudioForBroadcast', () => {
		expect(getPeripheralDeviceCommands(playoutDevice)).toHaveLength(0)

		const { playlistId } = setupDefaultRundownPlaylist(env, protectString('ro0'))
		expect(playlistId).toBeTruthy()

		const playlist = RundownPlaylists.findOne(playlistId) as RundownPlaylist
		expect(playlist).toBeTruthy()

		// prepareStudioForBroadcast
		const okToDestroyStuff = true
		runPlayoutOperationWithCache(
			null,
			'activateRundownPlaylist',
			playlist._id,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			null,
			(cache) => prepareStudioForBroadcast(cache, okToDestroyStuff)
		)

		expect(getPeripheralDeviceCommands(playoutDevice)).toHaveLength(1)
		expect(getPeripheralDeviceCommands(playoutDevice)[0]).toMatchObject({
			functionName: 'devicesMakeReady',
			args: [okToDestroyStuff, playlist._id],
		})
	})
})
