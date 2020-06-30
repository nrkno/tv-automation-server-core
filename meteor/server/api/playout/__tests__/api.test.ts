import { Meteor } from 'meteor/meteor'
import '../../../../__mocks__/_extendJest'
import { testInFiber, testInFiberOnly } from '../../../../__mocks__/helpers/jest'
import {
	setupDefaultStudioEnvironment,
	DefaultEnvironment,
	setupDefaultRundownPlaylist,
} from '../../../../__mocks__/helpers/database'
import { Rundowns, Rundown } from '../../../../lib/collections/Rundowns'
import '../api'
import { RundownPlaylists, RundownPlaylist } from '../../../../lib/collections/RundownPlaylists'
import { Piece } from '../../../../lib/collections/Pieces'
import { PartInstances } from '../../../../lib/collections/PartInstances'
import { resetRandomId } from '../../../../__mocks__/random'
import { PieceInstances } from '../../../../lib/collections/PieceInstances'

namespace PlayoutAPI {
	// Using our own method definition, to catch external API changes
	export enum methods {
		'rundownPrepareForBroadcast' = 'playout.rundownPrepareForBroadcast',
		'rundownResetRundown' = 'playout.rundownResetRundownt',
		'rundownResetAndActivate' = 'playout.rundownResetAndActivate',
		'rundownActivate' = 'playout.rundownActivate',
		'rundownDeactivate' = 'playout.rundownDeactivate',
		'reloadData' = 'playout.reloadData',

		'updateStudioBaseline' = 'playout.updateStudioBaseline',
		'shouldUpdateStudioBaseline' = 'playout.shouldUpdateStudioBaseline',

		'rundownTake' = 'playout.rundownTake',
		'rundownSetNext' = 'playout.rundownSetNext',
		'rundownMoveNext' = 'playout.rundownMoveNext',
		'rundownActivateHold' = 'playout.rundownActivateHold',
		'rundownDisableNextPiece' = 'playout.rundownDisableNextPiece',
		'rundownTogglePartArgument' = 'playout.rundownTogglePartArgument',
		// 'partPlaybackStartedCallback'		= 'playout.partPlaybackStartedCallback',
		// 'piecePlaybackStartedCallback'		= 'playout.piecePlaybackStartedCallback',
		'pieceTakeNow' = 'playout.pieceTakeNow',
		'segmentAdLibPieceStart' = 'playout.segmentAdLibPieceStart',
		'rundownBaselineAdLibPieceStart' = 'playout.rundownBaselineAdLibPieceStart',
		'sourceLayerOnPartStop' = 'playout.sourceLayerOnPartStop',
		'sourceLayerStickyPieceStart' = 'playout.sourceLayerStickyPieceStart',
	}
}

describe('Playout API', () => {
	let env: DefaultEnvironment
	beforeEach(() => {
		env = setupDefaultStudioEnvironment()
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
		const getRundown1 = () => {
			return Rundowns.findOne(rundownId1) as Rundown
		}
		const getPlaylist0 = () => {
			return RundownPlaylists.findOne(playlistId0) as RundownPlaylist
		}
		const getPlaylist1 = () => {
			return RundownPlaylists.findOne(playlistId1) as RundownPlaylist
		}

		expect(getRundown0()).toBeTruthy()
		expect(getRundown1()).toBeTruthy()
		expect(getRundown0()._id).not.toEqual(getRundown1()._id)
		expect(getPlaylist0()).toBeTruthy()
		expect(getPlaylist1()).toBeTruthy()

		const parts = getRundown0().getParts()

		expect(getPlaylist0()).toMatchObject({
			active: false,
			rehearsal: false,
		})

		// Prepare and activate in rehersal:
		{
			Meteor.call(PlayoutAPI.methods.rundownPrepareForBroadcast, playlistId0)
			const instances = PartInstances.find({ rundownId: rundownId0 }).fetch()
			expect(instances).toHaveLength(1)
			expect(instances[0].part._id).toEqual(parts[0]._id)
			expect(getPlaylist0()).toMatchObject({
				active: true,
				rehearsal: true,
				currentPartInstanceId: null,
				nextPartInstanceId: instances[0]._id,
			})
		}
		// Activate a second rundown (this should throw an error)
		expect(() => {
			Meteor.call(PlayoutAPI.methods.rundownActivate, playlistId1, false)
		}).toThrowError(/only one rundown/i)

		{
			// Take the first Part:
			Meteor.call(PlayoutAPI.methods.rundownTake, playlistId0)
			const instances = PartInstances.find({ rundownId: rundownId0 }).fetch()
			expect(instances).toHaveLength(2)
			expect(instances[0].part._id).toEqual(parts[0]._id)
			expect(instances[1].part._id).toEqual(parts[1]._id)
			expect(getPlaylist0()).toMatchObject({
				currentPartInstanceId: instances[0]._id,
				nextPartInstanceId: instances[1]._id,
			})
		}

		{
			// Take the second Part:
			Meteor.call(PlayoutAPI.methods.rundownTake, playlistId0)
			const instances = PartInstances.find({ rundownId: rundownId0 }).fetch()
			expect(instances).toHaveLength(3)
			expect(instances[1].part._id).toEqual(parts[1]._id)
			expect(instances[2].part._id).toEqual(parts[2]._id)
			expect(getPlaylist0()).toMatchObject({
				currentPartInstanceId: instances[1]._id,
				nextPartInstanceId: instances[2]._id,
			})
		}
		{
			// Reset rundown:
			Meteor.call(PlayoutAPI.methods.rundownResetRundown, playlistId0)
			const instances = PartInstances.find({ rundownId: rundownId0 }).fetch()
			expect(instances).toHaveLength(1)
			expect(instances[0].part._id).toEqual(parts[0]._id)
			expect(getPlaylist0()).toMatchObject({
				currentPartInstanceId: null,
				nextPartInstanceId: instances[0]._id,
			})
		}

		{
			// Set Part as next:
			Meteor.call(PlayoutAPI.methods.rundownSetNext, playlistId0, parts[parts.length - 2]._id)
			const instances = PartInstances.find({ rundownId: rundownId0 }).fetch()
			expect(instances).toHaveLength(1)
			expect(instances[0].part._id).toEqual(parts[parts.length - 2]._id)
			expect(getPlaylist0()).toMatchObject({
				currentPartInstanceId: null,
				nextPartInstanceId: instances[0]._id,
			})
		}

		{
			// Take the Nexted Part:
			Meteor.call(PlayoutAPI.methods.rundownTake, playlistId0)
			const instances = PartInstances.find({ rundownId: rundownId0 }).fetch()
			expect(instances).toHaveLength(2)
			expect(instances[0].part._id).toEqual(parts[parts.length - 2]._id)
			expect(instances[1].part._id).toEqual(parts[parts.length - 1]._id)
			expect(getPlaylist0()).toMatchObject({
				currentPartInstanceId: instances[0]._id,
				nextPartInstanceId: instances[1]._id,
			})
		}

		{
			// Take the last Part:
			Meteor.call(PlayoutAPI.methods.rundownTake, playlistId0)
			const instances = PartInstances.find({ rundownId: rundownId0 }).fetch()
			expect(instances).toHaveLength(2)
			expect(instances[1].part._id).toEqual(parts[parts.length - 1]._id)
			expect(getPlaylist0()).toMatchObject({
				currentPartInstanceId: instances[1]._id,
				nextPartInstanceId: null,
			})
		}

		{
			// Move the next-point backwards:
			Meteor.call(PlayoutAPI.methods.rundownMoveNext, playlistId0, -1, 0)
			const instances = PartInstances.find({ rundownId: rundownId0 }).fetch()
			expect(instances).toHaveLength(3)
			expect(instances[1].part._id).toEqual(parts[parts.length - 1]._id)
			expect(instances[2].part._id).toEqual(parts[parts.length - 2]._id)
			expect(getPlaylist0()).toMatchObject({
				currentPartInstanceId: instances[1]._id,
				nextPartInstanceId: instances[2]._id,
			})
		}
		{
			// Move the next-point backwards:
			Meteor.call(PlayoutAPI.methods.rundownMoveNext, playlistId0, -1, 0)
			const instances = PartInstances.find({ rundownId: rundownId0 }).fetch()
			expect(instances).toHaveLength(3)
			expect(instances[1].part._id).toEqual(parts[parts.length - 1]._id)
			expect(instances[2].part._id).toEqual(parts[parts.length - 3]._id)
			expect(getPlaylist0()).toMatchObject({
				currentPartInstanceId: instances[1]._id,
				nextPartInstanceId: instances[2]._id,
			})
		}

		{
			// Take the nexted Part:
			Meteor.call(PlayoutAPI.methods.rundownTake, playlistId0)
			const instances = PartInstances.find({ rundownId: rundownId0 }).fetch()
			expect(instances).toHaveLength(4)
			expect(instances[2].part._id).toEqual(parts[parts.length - 3]._id)
			expect(instances[3].part._id).toEqual(parts[parts.length - 2]._id)
			expect(getPlaylist0()).toMatchObject({
				currentPartInstanceId: instances[2]._id,
				nextPartInstanceId: instances[3]._id,
			})
		}

		{
			// Deactivate rundown:
			Meteor.call(PlayoutAPI.methods.rundownDeactivate, playlistId0)
			const instances = PartInstances.find({ rundownId: rundownId0 }).fetch()
			expect(instances).toHaveLength(3)
			expect(getPlaylist0()).toMatchObject({
				active: false,
				currentPartInstanceId: null,
				nextPartInstanceId: null,
			})
		}
	})
	testInFiber('Global and Part Ad-Libs', () => {
		const nowSpy = jest.spyOn(Date, 'now')
		nowSpy.mockReturnValue(1000)

		const { rundownId: rundownId0, playlistId: playlistId0 } = setupDefaultRundownPlaylist(env)

		const getRundown0 = () => {
			return Rundowns.findOne(rundownId0) as Rundown
		}
		const getPlaylist0 = () => {
			return RundownPlaylists.findOne(playlistId0) as RundownPlaylist
		}

		expect(getRundown0()).toBeTruthy()
		expect(getPlaylist0()).toBeTruthy()

		const parts = getRundown0().getParts()
		const globalAdLibs = getRundown0().getGlobalAdLibPieces()
		expect(globalAdLibs).toHaveLength(2)

		const adLibs = parts[0].getAdLibPieces()
		expect(adLibs).toHaveLength(1)

		expect(() => {
			Meteor.call(
				PlayoutAPI.methods.rundownBaselineAdLibPieceStart,
				playlistId0,
				parts[0]._id,
				globalAdLibs[0]._id
			)
		}).toThrowError(/active/)

		expect(() => {
			Meteor.call(PlayoutAPI.methods.segmentAdLibPieceStart, playlistId0, parts[0]._id, adLibs[0]._id)
		}).toThrowError(/active/)

		{
			// Prepare and activate in rehersal:
			Meteor.call(PlayoutAPI.methods.rundownPrepareForBroadcast, playlistId0)
			const instances = PartInstances.find({ rundownId: rundownId0 }).fetch()
			expect(instances).toHaveLength(1)
			expect(instances[0].part._id).toEqual(parts[0]._id)
			expect(getPlaylist0()).toMatchObject({
				active: true,
				rehearsal: true,
				currentPartInstanceId: null,
				nextPartInstanceId: instances[0]._id,
			})
		}

		{
			const instances = PartInstances.find({ rundownId: rundownId0 }).fetch()
			expect(() => {
				Meteor.call(
					PlayoutAPI.methods.rundownBaselineAdLibPieceStart,
					playlistId0,
					instances[0]._id,
					globalAdLibs[0]._id
				)
			}).toThrowError(/currently playing part/)
		}

		{
			Meteor.call(PlayoutAPI.methods.rundownTake, playlistId0)
			const instances = PartInstances.find({ rundownId: rundownId0 }).fetch()
			expect(instances).toHaveLength(2)
			expect(instances[0].part._id).toEqual(parts[0]._id)
			expect(instances[1].part._id).toEqual(parts[1]._id)
			expect(getPlaylist0()).toMatchObject({
				currentPartInstanceId: instances[0]._id,
				nextPartInstanceId: instances[1]._id,
			})
		}

		nowSpy.mockReturnValue(1000)

		{
			const instances = PartInstances.find({ rundownId: rundownId0 }).fetch()
			Meteor.call(
				PlayoutAPI.methods.rundownBaselineAdLibPieceStart,
				playlistId0,
				instances[0]._id,
				globalAdLibs[0]._id
			)
			const pieces0 = PieceInstances.find({ partInstanceId: instances[0]._id }).fetch()
			expect(pieces0).toMatchSnapshot()
		}

		nowSpy.mockReturnValue(3000)

		{
			const instances = PartInstances.find({ rundownId: rundownId0 }).fetch()
			Meteor.call(PlayoutAPI.methods.segmentAdLibPieceStart, playlistId0, instances[0]._id, adLibs[0]._id)
			const pieces1 = PieceInstances.find({ partInstanceId: instances[0]._id }).fetch()
			expect(pieces1).toMatchSnapshot()
		}
	})
})
