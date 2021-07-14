import { Meteor } from 'meteor/meteor'
import '../../../../__mocks__/_extendJest'
import { testInFiber } from '../../../../__mocks__/helpers/jest'
import {
	setupDefaultStudioEnvironment,
	DefaultEnvironment,
	setupDefaultRundownPlaylist,
} from '../../../../__mocks__/helpers/database'
import { Rundowns, Rundown } from '../../../../lib/collections/Rundowns'
import { setMinimumTakeSpan } from '../../userActions'
import { RundownPlaylists, RundownPlaylist } from '../../../../lib/collections/RundownPlaylists'
import { RESTART_SALT } from '../../../../lib/api/userActions'
import { getHash } from '../../../../lib/lib'
import { UserActionsLog } from '../../../../lib/collections/UserActionsLog'

require('../../client') // include in order to create the Meteor methods needed
require('../../userActions') // include in order to create the Meteor methods needed

namespace UserActionAPI {
	// Using our own method definition, to catch external API changes
	export enum methods {
		'take' = 'userAction.take',
		'setNext' = 'userAction.setNext',
		'moveNext' = 'userAction.moveNext',

		'prepareForBroadcast' = 'userAction.prepareForBroadcast',
		'resetRundownPlaylist' = 'userAction.resetRundownPlaylist',
		'resetAndActivate' = 'userAction.resetAndActivate',
		'forceResetAndActivate' = 'userAction.forceResetAndActivate',
		'activate' = 'userAction.activate',
		'deactivate' = 'userAction.deactivate',
		'unsyncRundown' = 'userAction.unsyncRundown',

		'disableNextPiece' = 'userAction.disableNextPiece',
		'pieceTakeNow' = 'userAction.pieceTakeNow',
		'setInOutPoints' = 'userAction.pieceSetInOutPoints',

		'segmentAdLibPieceStart' = 'userAction.segmentAdLibPieceStart',
		'sourceLayerOnPartStop' = 'userAction.sourceLayerOnPartStop',
		'baselineAdLibPieceStart' = 'userAction.baselineAdLibPieceStart',

		'sourceLayerStickyPieceStart' = 'userAction.sourceLayerStickyPieceStart',

		'activateHold' = 'userAction.activateHold',

		'saveEvaluation' = 'userAction.saveEvaluation',

		// 'partPlaybackStartedCallback'	= 'userAction.partPlaybackStartedCallback',
		// 'piecePlaybackStartedCallback'= 'userAction.piecePlaybackStartedCallback',

		'storeRundownSnapshot' = 'userAction.storeRundownSnapshot',

		'removeRundownPlaylist' = 'userAction.removeRundownPlaylist',
		'resyncRundownPlaylist' = 'userAction.resyncRundownPlaylist',

		'removeRundown' = 'userAction.removeRundown',
		'resyncRundown' = 'userAction.resyncRundown',
		'resyncSegment' = 'userAction.resyncSegment',

		'mediaRestartWorkflow' = 'userAction.mediamanager.restartWorkflow',
		'mediaAbortWorkflow' = 'userAction.mediamanager.abortWorkflow',
		'mediaRestartAllWorkflows' = 'userAction.mediamanager.restartAllWorkflows',
		'mediaAbortAllWorkflows' = 'userAction.mediamanager.abortAllWorkflows',
		'mediaPrioritizeWorkflow' = 'userAction.mediamanager.mediaPrioritizeWorkflow',

		'regenerateRundownPlaylist' = 'userAction.ingest.regenerateRundownPlaylist',

		'generateRestartToken' = 'userAction.system.generateRestartToken',
		'restartCore' = 'userAction.system.restartCore',

		'guiFocused' = 'userAction.focused',
		'guiBlurred' = 'userAction.blurred',

		'bucketAdlibImport' = 'userAction.bucketAdlibImport',
		'bucketAdlibStart' = 'userAction.bucketAdlibStart',

		'bucketsCreateNewBucket' = 'userAction.createBucket',
		'bucketsRemoveBucket' = 'userAction.removeBucket',
		'bucketsEmptyBucket' = 'userAction.emptyBucket',
		'bucketsModifyBucket' = 'userAction.modifyBucket',
		'bucketsRemoveBucketAdLib' = 'userAction.removeBucketAdLib',
		'bucketsModifyBucketAdLib' = 'userAction.bucketsModifyBucketAdLib',
	}
}

describe('User Actions - General', () => {
	let env: DefaultEnvironment
	beforeEach(async () => {
		env = await setupDefaultStudioEnvironment()
		setMinimumTakeSpan(0)
	})
	testInFiber('Basic rundown control', () => {
		const { rundownId: rundownId0, playlistId: playlistId0 } = setupDefaultRundownPlaylist(env)
		const { rundownId: rundownId1, playlistId: playlistId1 } = setupDefaultRundownPlaylist(env)
		expect(rundownId0).toBeTruthy()
		expect(rundownId1).toBeTruthy()
		expect(playlistId0).toBeTruthy()
		expect(playlistId1).toBeTruthy()

		const getRundown0 = () => {
			return Rundowns.findOne(rundownId0) as Rundown
		}
		const getPlaylist0 = () => {
			const playlist = RundownPlaylists.findOne(playlistId0) as RundownPlaylist
			playlist.activationId = playlist.activationId ?? undefined
			return playlist
		}
		const getRundown1 = () => {
			return Rundowns.findOne(rundownId1) as Rundown
		}

		expect(getRundown0()).toBeTruthy()
		expect(getPlaylist0()).toBeTruthy()
		expect(getRundown1()).toBeTruthy()
		expect(getRundown0()._id).not.toEqual(getRundown1()._id)

		const parts = getRundown0().getParts()

		expect(getPlaylist0()).toMatchObject({
			activationId: undefined,
			rehearsal: false,
		})

		{
			// Prepare and activate in rehersal:
			expect(Meteor.call(UserActionAPI.methods.prepareForBroadcast, 'e', playlistId0)).toMatchObject({
				success: 200,
			})

			const { currentPartInstance, nextPartInstance } = getPlaylist0().getSelectedPartInstances()
			expect(currentPartInstance).toBeFalsy()
			expect(nextPartInstance).toBeTruthy()
			expect(nextPartInstance!.part._id).toEqual(parts[0]._id)

			expect(getPlaylist0()).toMatchObject({
				activationId: expect.stringMatching(/^randomId/),
				rehearsal: true,
				currentPartInstanceId: null,
				// nextPartInstanceId: parts[0]._id,
			})
		}
		// Activate a second rundown (this should throw an error)
		expect(Meteor.call(UserActionAPI.methods.activate, 'e', playlistId1, false)).toMatchObject({
			error: 409,
			message: expect.stringMatching(/only one rundown/i),
		})

		{
			// Take the first Part:
			expect(Meteor.call(UserActionAPI.methods.take, 'e', playlistId0)).toMatchObject({ success: 200 })

			const { currentPartInstance, nextPartInstance } = getPlaylist0().getSelectedPartInstances()
			expect(currentPartInstance).toBeTruthy()
			expect(nextPartInstance).toBeTruthy()
			expect(currentPartInstance!.part._id).toEqual(parts[0]._id)
			expect(nextPartInstance!.part._id).toEqual(parts[1]._id)
		}

		{
			// Take the second Part:
			expect(Meteor.call(UserActionAPI.methods.take, 'e', playlistId0)).toMatchObject({ success: 200 })

			const { currentPartInstance, nextPartInstance } = getPlaylist0().getSelectedPartInstances()
			expect(currentPartInstance).toBeTruthy()
			expect(nextPartInstance).toBeTruthy()
			expect(currentPartInstance!.part._id).toEqual(parts[1]._id)
			expect(nextPartInstance!.part._id).toEqual(parts[2]._id)
		}

		{
			// Reset rundown:
			expect(Meteor.call(UserActionAPI.methods.resetRundownPlaylist, 'e', playlistId0)).toMatchObject({
				success: 200,
			})

			const { currentPartInstance, nextPartInstance } = getPlaylist0().getSelectedPartInstances()
			expect(currentPartInstance).toBeFalsy()
			expect(nextPartInstance).toBeTruthy()
			expect(nextPartInstance!.part._id).toEqual(parts[0]._id)

			expect(getPlaylist0()).toMatchObject({
				currentPartInstanceId: null,
				// nextPartInstanceId: parts[0]._id,
			})
		}

		{
			// Set Part as next:
			expect(
				Meteor.call(UserActionAPI.methods.setNext, 'e', playlistId0, parts[parts.length - 2]._id)
			).toMatchObject({ success: 200 })

			const { currentPartInstance, nextPartInstance } = getPlaylist0().getSelectedPartInstances()
			expect(currentPartInstance).toBeFalsy()
			expect(nextPartInstance).toBeTruthy()
			expect(nextPartInstance!.part._id).toEqual(parts[parts.length - 2]._id)

			expect(getPlaylist0()).toMatchObject({
				currentPartInstanceId: null,
				// nextPartInstanceId: parts[parts.length - 2]._id,
			})
		}

		{
			// Take the Nexted Part:
			expect(Meteor.call(UserActionAPI.methods.take, 'e', playlistId0)).toMatchObject({ success: 200 })

			const { currentPartInstance, nextPartInstance } = getPlaylist0().getSelectedPartInstances()
			expect(currentPartInstance).toBeTruthy()
			expect(nextPartInstance).toBeTruthy()
			expect(currentPartInstance!.part._id).toEqual(parts[parts.length - 2]._id)
			expect(nextPartInstance!.part._id).toEqual(parts[parts.length - 1]._id)
		}

		{
			// Take the last Part:
			expect(Meteor.call(UserActionAPI.methods.take, 'e', playlistId0)).toMatchObject({ success: 200 })
			const { currentPartInstance, nextPartInstance } = getPlaylist0().getSelectedPartInstances()
			expect(currentPartInstance).toBeTruthy()
			expect(nextPartInstance).toBeFalsy()
			expect(currentPartInstance!.part._id).toEqual(parts[parts.length - 1]._id)

			expect(getPlaylist0()).toMatchObject({
				// currentPartInstanceId: parts[parts.length - 1]._id,
				nextPartInstanceId: null,
			})
		}

		{
			// Move the next-point backwards:
			expect(Meteor.call(UserActionAPI.methods.moveNext, 'e', playlistId0, -1, 0)).toMatchObject({ success: 200 })

			const { currentPartInstance, nextPartInstance } = getPlaylist0().getSelectedPartInstances()
			expect(currentPartInstance).toBeTruthy()
			expect(nextPartInstance).toBeTruthy()
			expect(currentPartInstance!.part._id).toEqual(parts[parts.length - 1]._id)
			expect(nextPartInstance!.part._id).toEqual(parts[parts.length - 2]._id)
		}

		{
			// Move the next-point backwards:
			expect(Meteor.call(UserActionAPI.methods.moveNext, 'e', playlistId0, -1, 0)).toMatchObject({ success: 200 })

			const { currentPartInstance, nextPartInstance } = getPlaylist0().getSelectedPartInstances()
			expect(currentPartInstance).toBeTruthy()
			expect(nextPartInstance).toBeTruthy()
			expect(currentPartInstance!.part._id).toEqual(parts[parts.length - 1]._id)
			expect(nextPartInstance!.part._id).toEqual(parts[parts.length - 3]._id)
		}

		{
			// Take the nexted Part:
			expect(Meteor.call(UserActionAPI.methods.take, 'e', playlistId0)).toMatchObject({ success: 200 })

			const { currentPartInstance, nextPartInstance } = getPlaylist0().getSelectedPartInstances()
			expect(currentPartInstance).toBeTruthy()
			expect(nextPartInstance).toBeTruthy()
			expect(currentPartInstance!.part._id).toEqual(parts[parts.length - 3]._id)
			expect(nextPartInstance!.part._id).toEqual(parts[parts.length - 2]._id)
		}

		// Deactivate rundown:
		expect(Meteor.call(UserActionAPI.methods.deactivate, 'e', playlistId0)).toMatchObject({ success: 200 })
		expect(getPlaylist0()).toMatchObject({
			activationId: undefined,
			currentPartInstanceId: null,
			nextPartInstanceId: null,
		})
	})

	testInFiber('Restart Core', () => {
		jest.useFakeTimers()

		// Generate restart token
		const res = Meteor.call(UserActionAPI.methods.generateRestartToken, 'e')
		expect(res).toMatchObject({ success: 200 })
		expect(typeof res.result).toBe('string')

		const mockExit = jest.spyOn(process, 'exit').mockImplementation()

		// Use an invalid token to try and restart it
		try {
			Meteor.call(UserActionAPI.methods.restartCore, 'e', 'invalidToken')
			// calling this method with an invalid token should throw
			expect(false).toBeTruthy()
		} catch (e) {
			expect(true).toBeTruthy()
		}

		expect(Meteor.call(UserActionAPI.methods.restartCore, 'e', getHash(RESTART_SALT + res.result))).toMatchObject({
			success: 200,
		})

		jest.runAllTimers()

		expect(mockExit).toHaveBeenCalledTimes(1)
		jest.useRealTimers()
	})

	testInFiber('GUI Status', () => {
		expect(Meteor.call(UserActionAPI.methods.guiFocused, 'click')).toMatchObject({ success: 200 })
		const logs0 = UserActionsLog.find({
			method: UserActionAPI.methods.guiFocused,
		}).fetch()
		expect(logs0).toHaveLength(1)
		// expect(logs0[0]).toMatchObject({
		// 	context: 'mousedown',
		// 	args: JSON.stringify([ [ 'dummyClientData' ] ])
		// })
		expect(Meteor.call(UserActionAPI.methods.guiBlurred, 'click')).toMatchObject({ success: 200 })
		const logs1 = UserActionsLog.find({
			method: UserActionAPI.methods.guiBlurred,
		}).fetch()
		expect(logs1).toHaveLength(1)
		// expect(logs1[0]).toMatchObject({
		// 	context: 'interval',
		// 	args: JSON.stringify([ [ 'dummyClientData' ] ])
		// })
	})
})
