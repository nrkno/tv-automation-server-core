import { Meteor } from 'meteor/meteor'
import { Random } from 'meteor/random'

import { PeripheralDevice, PeripheralDevices } from '../../../lib/collections/PeripheralDevices'
import { PeripheralDeviceCommands } from '../../../lib/collections/PeripheralDeviceCommands'
import { Rundowns, RundownId } from '../../../lib/collections/Rundowns'
import { Segments, SegmentId } from '../../../lib/collections/Segments'
import { Parts } from '../../../lib/collections/Parts'
import { Pieces } from '../../../lib/collections/Pieces'

import { PeripheralDeviceAPI, PeripheralDeviceAPIMethods } from '../../../lib/api/peripheralDevice'

import { getCurrentTime, literal, protectString, ProtectedString, waitTime, getRandomId } from '../../../lib/lib'
import * as MOS from 'mos-connection'
import { testInFiber } from '../../../__mocks__/helpers/jest'
import { setupDefaultStudioEnvironment, DefaultEnvironment } from '../../../__mocks__/helpers/database'
import { setLoggerLevel } from '../../../server/api/logger'
import { RundownPlaylists, RundownPlaylistId, RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import {
	IngestDeviceSettings,
	IngestDeviceSecretSettings,
} from '../../../lib/collections/PeripheralDeviceSettings/ingestDevice'

jest.mock('../playout/playout.ts')
jest.mock('ntp-client')

const { ServerPlayoutAPI: _ActualServerPlayoutAPI } = jest.requireActual('../playout/playout.ts')

import { ServerPlayoutAPI } from '../playout/playout'
import { RundownAPI } from '../../../lib/api/rundown'
import { PieceInstances } from '../../../lib/collections/PieceInstances'
import { Timeline, TimelineEnableExt } from '../../../lib/collections/Timeline'
import { MediaWorkFlows } from '../../../lib/collections/MediaWorkFlows'
import { MediaWorkFlowSteps } from '../../../lib/collections/MediaWorkFlowSteps'
import { MediaManagerAPI } from '../../../lib/api/mediaManager'
import { MediaObjects } from '../../../lib/collections/MediaObjects'
import { PieceLifespan } from '@sofie-automation/blueprints-integration'
import { VerifiedRundownPlaylistContentAccess } from '../lib'
import { PartInstance } from '../../../lib/collections/PartInstances'

const DEBUG = false

const ActualServerPlayoutAPI: typeof ServerPlayoutAPI = _ActualServerPlayoutAPI

function DEFAULT_ACCESS(rundownPlaylistID: RundownPlaylistId): VerifiedRundownPlaylistContentAccess {
	const playlist = RundownPlaylists.findOne(rundownPlaylistID) as RundownPlaylist
	expect(playlist).toBeTruthy()
	return { userId: null, organizationId: null, studioId: null, playlist: playlist, cred: {} }
}

describe('test peripheralDevice general API methods', () => {
	let device: PeripheralDevice
	let rundownID: RundownId
	let rundownPlaylistID: RundownPlaylistId
	let env: DefaultEnvironment
	beforeAll(async () => {
		env = await setupDefaultStudioEnvironment()
		device = env.ingestDevice
		rundownID = protectString('rundown0')
		rundownPlaylistID = protectString('rundownPlaylist0')
		const rundownExternalID: string = 'rundown0'
		RundownPlaylists.insert({
			_id: rundownPlaylistID,
			externalId: 'mock_rpl',
			name: 'Mock',
			studioId: env.studio._id,
			created: 0,
			modified: 0,
			currentPartInstanceId: null,
			nextPartInstanceId: null,
			previousPartInstanceId: null,
			activationId: protectString('active'),
		})
		Rundowns.insert({
			_id: rundownID,
			externalId: rundownExternalID,
			studioId: env.studio._id,
			showStyleBaseId: env.showStyleBaseId,
			showStyleVariantId: env.showStyleVariantId,
			name: 'test rundown',
			created: 1000,
			playlistId: rundownPlaylistID,
			_rank: 0,
			peripheralDeviceId: env.ingestDevice._id,
			modified: getCurrentTime(),
			importVersions: {
				studio: 'wibble',
				showStyleBase: 'wobble',
				showStyleVariant: 'jelly',
				blueprint: 'on',
				core: 'plate',
			},
			externalNRCSName: 'mockNRCS',
			organizationId: protectString(''),
		})
		const segmentID: SegmentId = protectString('segment0')
		const segmentExternalID = 'segment0'
		Segments.insert({
			_id: segmentID,
			externalId: segmentExternalID,
			_rank: 0,
			rundownId: rundownID,
			name: 'Fire',
			externalModified: 1,
		})
		Parts.insert({
			_id: protectString('part000'),
			_rank: 0,
			externalId: 'part000',
			segmentId: segmentID,
			rundownId: rundownID,
			title: 'Part 000',
		})
		Pieces.insert({
			_id: protectString('piece0001'),
			enable: {
				start: 0,
			},
			externalId: '',
			name: 'Mock',
			sourceLayerId: env.showStyleBase.sourceLayers[0]._id,
			outputLayerId: env.showStyleBase.outputLayers[0]._id,
			startPartId: protectString('part000'),
			startSegmentId: segmentID,
			startRundownId: rundownID,
			status: RundownAPI.PieceStatusCode.UNKNOWN,
			lifespan: PieceLifespan.WithinPart,
			invalid: false,
			content: { timelineObjects: [] },
		})
		Parts.insert({
			_id: protectString('part001'),
			_rank: 1,
			externalId: 'part001',
			segmentId: segmentID,
			rundownId: rundownID,
			title: 'Part 001',
		})
		Segments.insert({
			_id: protectString('segment1'),
			_rank: 1,
			externalId: 'segment01',
			rundownId: rundownID,
			name: 'Water',
			externalModified: 1,
		})
		Segments.insert({
			_id: protectString('segment2'),
			_rank: 2,
			externalId: 'segment02',
			rundownId: rundownID,
			name: 'Earth',
			externalModified: 1,
		})
	})

	testInFiber('initialize', () => {
		if (DEBUG) setLoggerLevel('debug')

		expect(PeripheralDevices.findOne(device._id)).toBeTruthy()

		const options: PeripheralDeviceAPI.InitOptions = {
			category: PeripheralDeviceAPI.DeviceCategory.INGEST,
			type: PeripheralDeviceAPI.DeviceType.MOS,
			subType: 'mos_connection',
			name: 'test',
			connectionId: 'test',
			configManifest: {
				deviceConfig: [],
			},
		}
		Meteor.call(PeripheralDeviceAPIMethods.initialize, device._id, device.token, options)
		const initDevice = PeripheralDevices.findOne(device._id) as PeripheralDevice
		expect(initDevice).toBeTruthy()
		expect(initDevice.lastSeen).toBeGreaterThan(getCurrentTime() - 100)
		expect(initDevice.lastConnected).toBeGreaterThan(getCurrentTime() - 100)
		expect(initDevice.subType).toBe(options.subType)
	})

	testInFiber('setStatus', () => {
		expect(PeripheralDevices.findOne(device._id)).toBeTruthy()
		expect((PeripheralDevices.findOne(device._id) as PeripheralDevice).status).toMatchObject({
			statusCode: PeripheralDeviceAPI.StatusCode.GOOD,
		})
		Meteor.call(PeripheralDeviceAPIMethods.setStatus, device._id, device.token, {
			statusCode: PeripheralDeviceAPI.StatusCode.WARNING_MINOR,
			messages: ["Something's not right"],
		})
		expect((PeripheralDevices.findOne(device._id) as PeripheralDevice).status).toMatchObject({
			statusCode: PeripheralDeviceAPI.StatusCode.WARNING_MINOR,
			messages: ["Something's not right"],
		})
	})

	testInFiber('getPeripheralDevice', () => {
		const gotDevice: PeripheralDevice = Meteor.call(
			PeripheralDeviceAPIMethods.getPeripheralDevice,
			device._id,
			device.token
		)
		expect(gotDevice).toBeTruthy()
		expect(gotDevice._id).toBe(device._id)
	})

	testInFiber('ping', () => {
		expect(PeripheralDevices.findOne(device._id)).toBeTruthy()
		const lastSeen = (PeripheralDevices.findOne(device._id) as PeripheralDevice).lastSeen
		Meteor.call(PeripheralDeviceAPIMethods.ping, device._id, device.token)
		expect((PeripheralDevices.findOne(device._id) as PeripheralDevice).lastSeen).toBeGreaterThan(lastSeen)
	})

	testInFiber('determineDiffTime', () => {
		const response = Meteor.call(PeripheralDeviceAPIMethods.determineDiffTime)
		expect(response).toBeTruthy()
		expect(Math.abs(response.mean - 400)).toBeLessThan(10) // be about 400
		expect(response.stdDev).toBeLessThan(10)
		expect(response.stdDev).toBeGreaterThan(0.1)
	})

	testInFiber('getTimeDiff', () => {
		const now = getCurrentTime()
		const response = Meteor.call(PeripheralDeviceAPIMethods.getTimeDiff)
		expect(response).toBeTruthy()
		expect(response.currentTime).toBeGreaterThan(now - 30)
		expect(response.currentTime).toBeLessThan(now + 30)
		expect(response.systemRawTime).toBeGreaterThan(0)
		expect(response.diff).toBeDefined()
		expect(response.stdDev).toBeDefined()
		expect(response.good).toBeDefined()
	})

	testInFiber('getTime', () => {
		const now = getCurrentTime()
		const response = Meteor.call(PeripheralDeviceAPIMethods.getTime)
		expect(response).toBeGreaterThan(now - 30)
		expect(response).toBeLessThan(now + 30)
	})

	testInFiber('pingWithCommand and functionReply', () => {
		if (DEBUG) setLoggerLevel('debug')

		let resultErr = undefined
		let resultMessage = undefined
		const pingCompleted = (err, msg) => {
			resultErr = err
			resultMessage = msg
		}

		// This is very odd. Ping command is sent and lastSeen updated before response
		const device2 = PeripheralDevices.findOne(device._id) as PeripheralDevice
		expect(device2).toBeTruthy()
		// Decrease lastSeen to ensure that the call below updates it
		const lastSeen = device2.lastSeen - 100
		PeripheralDevices.update(device._id, { $set: { lastSeen: lastSeen } })

		const message = 'Waving!'
		// Note: the null is so that Metor doesnt try to use pingCompleted  as a callback instead of blocking
		Meteor.call(PeripheralDeviceAPIMethods.pingWithCommand, device._id, device.token, message, pingCompleted, null)
		expect((PeripheralDevices.findOne(device._id) as PeripheralDevice).lastSeen).toBeGreaterThan(lastSeen)
		const command = PeripheralDeviceCommands.find({ deviceId: device._id }).fetch()[0]
		expect(command).toBeTruthy()
		expect(command.hasReply).toBeFalsy()
		expect(command.functionName).toBe('pingResponse')
		expect(command.args).toEqual([message])

		expect(resultErr).toBeUndefined()
		expect(resultMessage).toBeUndefined()

		const replyMessage = 'Waving back!'
		Meteor.call(
			PeripheralDeviceAPIMethods.functionReply,
			device._id,
			device.token,
			command._id,
			undefined,
			replyMessage
		)
		waitTime(10)
		expect(PeripheralDeviceCommands.findOne()).toBeFalsy()

		expect(resultErr).toBeNull()
		expect(resultMessage).toEqual(replyMessage)
	})

	testInFiber('partPlaybackStarted', async () => {
		await ActualServerPlayoutAPI.activateRundownPlaylist(
			DEFAULT_ACCESS(rundownPlaylistID),
			rundownPlaylistID,
			false
		)
		await ActualServerPlayoutAPI.takeNextPart(DEFAULT_ACCESS(rundownPlaylistID), rundownPlaylistID)

		if (DEBUG) setLoggerLevel('debug')
		const playlist = RundownPlaylists.findOne(rundownPlaylistID)
		expect(playlist).toBeTruthy()
		const currentPartInstance = playlist?.getSelectedPartInstances()?.currentPartInstance as PartInstance
		expect(currentPartInstance).toBeTruthy()
		const partPlaybackStartedResult: PeripheralDeviceAPI.PartPlaybackStartedResult = {
			rundownPlaylistId: rundownPlaylistID,
			partInstanceId: currentPartInstance._id,
			time: getCurrentTime(),
		}
		Meteor.call(PeripheralDeviceAPIMethods.partPlaybackStarted, device._id, device.token, partPlaybackStartedResult)

		expect(ServerPlayoutAPI.onPartPlaybackStarted).toHaveBeenCalled()

		await ActualServerPlayoutAPI.deactivateRundownPlaylist(DEFAULT_ACCESS(rundownPlaylistID), rundownPlaylistID)
	})

	testInFiber('partPlaybackStopped', async () => {
		await ActualServerPlayoutAPI.activateRundownPlaylist(
			DEFAULT_ACCESS(rundownPlaylistID),
			rundownPlaylistID,
			false
		)
		await ActualServerPlayoutAPI.takeNextPart(DEFAULT_ACCESS(rundownPlaylistID), rundownPlaylistID)

		if (DEBUG) setLoggerLevel('debug')
		const playlist = RundownPlaylists.findOne(rundownPlaylistID)
		expect(playlist).toBeTruthy()
		const currentPartInstance = playlist?.getSelectedPartInstances().currentPartInstance as PartInstance
		expect(currentPartInstance).toBeTruthy()
		const partPlaybackStoppedResult: PeripheralDeviceAPI.PartPlaybackStoppedResult = {
			rundownPlaylistId: rundownPlaylistID,
			partInstanceId: currentPartInstance._id,
			time: getCurrentTime(),
		}

		Meteor.call(PeripheralDeviceAPIMethods.partPlaybackStopped, device._id, device.token, partPlaybackStoppedResult)

		expect(ServerPlayoutAPI.onPartPlaybackStopped).toHaveBeenCalled()

		await ActualServerPlayoutAPI.deactivateRundownPlaylist(DEFAULT_ACCESS(rundownPlaylistID), rundownPlaylistID)
	})

	testInFiber('piecePlaybackStarted', async () => {
		await ActualServerPlayoutAPI.activateRundownPlaylist(
			DEFAULT_ACCESS(rundownPlaylistID),
			rundownPlaylistID,
			false
		)
		await ActualServerPlayoutAPI.takeNextPart(DEFAULT_ACCESS(rundownPlaylistID), rundownPlaylistID)

		if (DEBUG) setLoggerLevel('debug')
		const playlist = RundownPlaylists.findOne(rundownPlaylistID)
		expect(playlist).toBeTruthy()
		const currentPartInstance = playlist?.getSelectedPartInstances().currentPartInstance as PartInstance
		expect(currentPartInstance).toBeTruthy()
		const pieces = PieceInstances.find({
			partInstanceId: currentPartInstance._id,
		}).fetch()
		const piecePlaybackStartedResult: PeripheralDeviceAPI.PiecePlaybackStartedResult = {
			rundownPlaylistId: rundownPlaylistID,
			pieceInstanceId: pieces[0]._id,
			time: getCurrentTime(),
		}

		Meteor.call(
			PeripheralDeviceAPIMethods.piecePlaybackStarted,
			device._id,
			device.token,
			piecePlaybackStartedResult
		)

		expect(ServerPlayoutAPI.onPiecePlaybackStarted).toHaveBeenCalled()

		await ActualServerPlayoutAPI.deactivateRundownPlaylist(DEFAULT_ACCESS(rundownPlaylistID), rundownPlaylistID)
	})

	testInFiber('piecePlaybackStopped', async () => {
		await ActualServerPlayoutAPI.activateRundownPlaylist(
			DEFAULT_ACCESS(rundownPlaylistID),
			rundownPlaylistID,
			false
		)
		await ActualServerPlayoutAPI.takeNextPart(DEFAULT_ACCESS(rundownPlaylistID), rundownPlaylistID)

		if (DEBUG) setLoggerLevel('debug')
		const playlist = RundownPlaylists.findOne(rundownPlaylistID)
		expect(playlist).toBeTruthy()
		const currentPartInstance = playlist?.getSelectedPartInstances().currentPartInstance as PartInstance
		expect(currentPartInstance).toBeTruthy()
		const pieces = PieceInstances.find({
			partInstanceId: currentPartInstance._id,
		}).fetch()
		const piecePlaybackStoppedResult: PeripheralDeviceAPI.PiecePlaybackStoppedResult = {
			rundownPlaylistId: rundownPlaylistID,
			pieceInstanceId: pieces[0]._id,
			time: getCurrentTime(),
		}

		Meteor.call(
			PeripheralDeviceAPIMethods.piecePlaybackStopped,
			device._id,
			device.token,
			piecePlaybackStoppedResult
		)

		expect(ServerPlayoutAPI.onPiecePlaybackStopped).toHaveBeenCalled()

		await ActualServerPlayoutAPI.deactivateRundownPlaylist(DEFAULT_ACCESS(rundownPlaylistID), rundownPlaylistID)
	})

	testInFiber('timelineTriggerTime', async () => {
		await ActualServerPlayoutAPI.activateRundownPlaylist(
			DEFAULT_ACCESS(rundownPlaylistID),
			rundownPlaylistID,
			false
		)
		await ActualServerPlayoutAPI.takeNextPart(DEFAULT_ACCESS(rundownPlaylistID), rundownPlaylistID)

		if (DEBUG) setLoggerLevel('debug')
		const playlist = RundownPlaylists.findOne(rundownPlaylistID)
		expect(playlist).toBeTruthy()
		expect(playlist?.activationId).toBeTruthy()
		const studioTimeline = Timeline.findOne({
			_id: env.studio._id,
		})
		expect(studioTimeline).toBeTruthy()
		const timelineObjs =
			(studioTimeline &&
				studioTimeline.timeline.filter(
					(x) => x.enable && !Array.isArray(x.enable) && x.enable.start === 'now'
				)) ||
			[]
		expect(timelineObjs.length).toBe(1)
		const timelineTriggerTimeResult: PeripheralDeviceAPI.TimelineTriggerTimeResult = timelineObjs.map((tObj) => ({
			id: tObj.id,
			time: getCurrentTime(),
		}))

		Meteor.call(PeripheralDeviceAPIMethods.timelineTriggerTime, device._id, device.token, timelineTriggerTimeResult)

		const updatedStudioTimeline = Timeline.findOne({
			_id: env.studio._id,
		})
		const prevIds = timelineObjs.map((x) => x.id)
		const timelineUpdatedObjs =
			(updatedStudioTimeline && updatedStudioTimeline.timeline.filter((x) => prevIds.indexOf(x.id) >= 0)) || []
		timelineUpdatedObjs.forEach((tlObj) => {
			expect(Array.isArray(tlObj.enable)).toBeFalsy()
			const enable = tlObj.enable as TimelineEnableExt
			expect(enable.setFromNow).toBe(true)
			expect(enable.start).toBeGreaterThan(0)
		})

		await ActualServerPlayoutAPI.deactivateRundownPlaylist(DEFAULT_ACCESS(rundownPlaylistID), rundownPlaylistID)
	})

	testInFiber('killProcess with a rundown present', () => {
		// test this does not shutdown because Rundown stored
		if (DEBUG) setLoggerLevel('debug')
		expect(() => Meteor.call(PeripheralDeviceAPIMethods.killProcess, device._id, device.token, true)).toThrow(
			`[400] Unable to run killProcess: Rundowns not empty!`
		)
	})

	testInFiber('testMethod', () => {
		if (DEBUG) setLoggerLevel('debug')
		const result = Meteor.call(PeripheralDeviceAPIMethods.testMethod, device._id, device.token, 'european')
		expect(result).toBe('european')
		expect(() =>
			Meteor.call(PeripheralDeviceAPIMethods.testMethod, device._id, device.token, 'european', true)
		).toThrow(`[418] Error thrown, as requested`)
	})

	/*
	testInFiber('timelineTriggerTime', () => {
		if (DEBUG) setLoggerLevel('debug')
		let timelineTriggerTimeResult: PeripheralDeviceAPI.TimelineTriggerTimeResult = [
			{ id: 'wibble', time: getCurrentTime() }, { id: 'wobble', time: getCurrentTime() - 100 }]
		Meteor.call(PeripheralDeviceAPIMethods.timelineTriggerTime, device._id, device.token, timelineTriggerTimeResult)
	})
	*/

	testInFiber('requestUserAuthToken', () => {
		if (DEBUG) setLoggerLevel('debug')

		expect(() =>
			Meteor.call(PeripheralDeviceAPIMethods.requestUserAuthToken, device._id, device.token, 'http://auth.url/')
		).toThrow('[400] can only request user auth token for peripheral device of spreadsheet type')

		PeripheralDevices.update(device._id, {
			$set: {
				type: PeripheralDeviceAPI.DeviceType.SPREADSHEET,
			},
		})
		Meteor.call(PeripheralDeviceAPIMethods.requestUserAuthToken, device._id, device.token, 'http://auth.url/')
		const deviceWithAccessToken = PeripheralDevices.findOne(device._id) as PeripheralDevice
		expect(deviceWithAccessToken).toBeTruthy()
		expect(deviceWithAccessToken.accessTokenUrl).toBe('http://auth.url/')

		PeripheralDevices.update(device._id, {
			$set: {
				type: PeripheralDeviceAPI.DeviceType.MOS,
			},
		})
	})

	// Should only really work for SpreadsheetDevice
	testInFiber('storeAccessToken', () => {
		if (DEBUG) setLoggerLevel('debug')
		expect(() =>
			Meteor.call(PeripheralDeviceAPIMethods.storeAccessToken, device._id, device.token, 'http://auth.url/')
		).toThrow('[400] can only store access token for peripheral device of spreadsheet type')

		PeripheralDevices.update(device._id, {
			$set: {
				type: PeripheralDeviceAPI.DeviceType.SPREADSHEET,
			},
		})

		Meteor.call(PeripheralDeviceAPIMethods.storeAccessToken, device._id, device.token, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
		const deviceWithSecretToken = PeripheralDevices.findOne(device._id) as PeripheralDevice
		expect(deviceWithSecretToken).toBeTruthy()
		expect(deviceWithSecretToken.accessTokenUrl).toBe('')
		expect((deviceWithSecretToken.secretSettings as IngestDeviceSecretSettings).accessToken).toBe(
			'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
		)
		expect((deviceWithSecretToken.settings as IngestDeviceSettings).secretAccessToken).toBe(true)
	})

	testInFiber('uninitialize', async () => {
		if (DEBUG) setLoggerLevel('debug')
		Meteor.call(PeripheralDeviceAPIMethods.unInitialize, device._id, device.token)
		expect(PeripheralDevices.findOne()).toBeFalsy()

		device = (await setupDefaultStudioEnvironment()).ingestDevice
		expect(PeripheralDevices.findOne()).toBeTruthy()
	})

	// Note: this test fails, due to a backwards-compatibility hack in #c579c8f0
	// testInFiber('initialize with bad arguments', () => {
	// 	let options: PeripheralDeviceAPI.InitOptions = {
	// 		category: PeripheralDeviceAPI.DeviceCategory.INGEST,
	// 		type: PeripheralDeviceAPI.DeviceType.MOS,
	// 		subType: 'mos_connection',
	// 		name: 'test',
	// 		connectionId: 'test',
	// 		configManifest: {
	// 			deviceConfig: [],
	// 		},
	// 	}

	// 	try {
	// 		Meteor.call(PeripheralDeviceAPIMethods.initialize, device._id, device.token.slice(0, -1), options)
	// 		fail('expected to throw')
	// 	} catch (e) {
	// 		expect(e.message).toBe(`[401] Not allowed access to peripheralDevice`)
	// 	}
	// })

	// testInFiber('setStatus with bad arguments', () => {
	// 	try {
	// 		Meteor.call(PeripheralDeviceAPIMethods.setStatus, 'wibbly', device.token, { statusCode: 0 })
	// 		fail('expected to throw')
	// 	} catch (e) {
	// 		expect(e.message).toBe(`[404] PeripheralDevice "wibbly" not found`)
	// 	}

	// 	try {
	// 		Meteor.call(PeripheralDeviceAPIMethods.setStatus, device._id, device.token.slice(0, -1), { statusCode: 0 })
	// 		fail('expected to throw')
	// 	} catch (e) {
	// 		expect(e.message).toBe(`[401] Not allowed access to peripheralDevice`)
	// 	}

	// 	try {
	// 		Meteor.call(PeripheralDeviceAPIMethods.setStatus, device._id, device.token, { statusCode: 42 })
	// 		fail('expected to throw')
	// 	} catch (e) {
	// 		expect(e.message).toBe(`[400] device status code is not known`)
	// 	}
	// })

	testInFiber('removePeripheralDevice', () => {
		{
			const deviceObj = PeripheralDevices.findOne(device?._id)
			expect(deviceObj).toBeDefined()

			Meteor.call(PeripheralDeviceAPIMethods.removePeripheralDevice, device?._id, device?.token)
		}

		{
			const deviceObj = PeripheralDevices.findOne(device?._id)
			expect(deviceObj).toBeUndefined()
		}
	})

	// test MediaManagerIntegration API
	describe('Media Manager API', () => {
		let workFlowId: ProtectedString<any>
		let workStepIds: ProtectedString<any>[]
		let deviceId: ProtectedString<any>
		let device: PeripheralDevice
		beforeEach(async () => {
			workFlowId = getRandomId()
			workStepIds = [getRandomId(), getRandomId()]
			deviceId = getRandomId()
			env = await setupDefaultStudioEnvironment()
			PeripheralDevices.insert({
				_id: deviceId,
				organizationId: null,
				name: 'Mock Media Manager',
				studioId: env.studio._id,
				category: PeripheralDeviceAPI.DeviceCategory.MEDIA_MANAGER,
				configManifest: {
					deviceConfig: [],
				},
				connected: true,
				connectionId: '0',
				created: 0,
				lastConnected: 0,
				lastSeen: 0,
				status: {
					statusCode: PeripheralDeviceAPI.StatusCode.GOOD,
				},
				subType: '_process',
				token: 'MockToken',
				type: PeripheralDeviceAPI.DeviceType.MEDIA_MANAGER,
			})
			device = PeripheralDevices.findOne(deviceId)!
			MediaWorkFlows.insert({
				_id: workFlowId,
				_rev: '1',
				created: 0,
				deviceId: device._id,
				priority: 1,
				source: 'MockSource',
				studioId: device.studioId!,
				finished: false,
				success: false,
			})
			MediaWorkFlowSteps.insert({
				_id: workStepIds[0],
				_rev: '1',
				criticalStep: false,
				action: MediaManagerAPI.WorkStepAction.COPY,
				deviceId: device._id,
				priority: 2,
				status: MediaManagerAPI.WorkStepStatus.IDLE,
				studioId: device.studioId!,
				workFlowId: workFlowId,
			})
			MediaWorkFlowSteps.insert({
				_id: workStepIds[1],
				_rev: '1',
				criticalStep: false,
				action: MediaManagerAPI.WorkStepAction.GENERATE_METADATA,
				deviceId: device._id,
				priority: 1,
				status: MediaManagerAPI.WorkStepStatus.IDLE,
				studioId: device.studioId!,
				workFlowId: workFlowId,
			})
		})
		testInFiber('getMediaWorkFlowRevisions', () => {
			const workFlows = MediaWorkFlows.find({
				studioId: device.studioId,
			})
				.fetch()
				.map((wf) => ({
					_id: wf._id,
					_rev: wf._rev,
				}))
			expect(workFlows.length).toBeGreaterThan(0)
			const res = Meteor.call(PeripheralDeviceAPIMethods.getMediaWorkFlowRevisions, device._id, device.token)
			expect(res).toHaveLength(workFlows.length)
			expect(res).toMatchObject(workFlows)
		})
		testInFiber('getMediaWorkFlowStepRevisions', () => {
			const workFlowSteps = MediaWorkFlowSteps.find({
				studioId: device.studioId,
			})
				.fetch()
				.map((wf) => ({
					_id: wf._id,
					_rev: wf._rev,
				}))
			expect(workFlowSteps.length).toBeGreaterThan(0)
			const res = Meteor.call(PeripheralDeviceAPIMethods.getMediaWorkFlowStepRevisions, device._id, device.token)
			expect(res).toHaveLength(workFlowSteps.length)
			expect(res).toMatchObject(workFlowSteps)
		})
		describe('updateMediaWorkFlow', () => {
			testInFiber('update', () => {
				const workFlow = MediaWorkFlows.findOne(workFlowId)

				expect(workFlow).toBeTruthy()
				const newWorkFlow = Object.assign({}, workFlow)
				newWorkFlow._rev = '2'
				newWorkFlow.comment = 'New comment'

				Meteor.call(
					PeripheralDeviceAPIMethods.updateMediaWorkFlow,
					device._id,
					device.token,
					newWorkFlow._id,
					newWorkFlow
				)

				const updatedWorkFlow = MediaWorkFlows.findOne(workFlowId)
				expect(updatedWorkFlow).toMatchObject(newWorkFlow)
			})
			testInFiber('remove', () => {
				const workFlow = MediaWorkFlows.findOne(workFlowId)

				expect(workFlow).toBeTruthy()

				Meteor.call(
					PeripheralDeviceAPIMethods.updateMediaWorkFlow,
					device._id,
					device.token,
					workFlow?._id,
					null
				)

				const updatedWorkFlow = MediaWorkFlows.findOne(workFlowId)
				expect(updatedWorkFlow).toBeFalsy()
			})
		})
		describe('updateMediaWorkFlowStep', () => {
			testInFiber('update', () => {
				const workStep = MediaWorkFlowSteps.findOne(workStepIds[0])

				expect(workStep).toBeTruthy()
				const newWorkStep = Object.assign({}, workStep)
				newWorkStep._rev = '2'
				newWorkStep.status = MediaManagerAPI.WorkStepStatus.WORKING

				Meteor.call(
					PeripheralDeviceAPIMethods.updateMediaWorkFlowStep,
					device._id,
					device.token,
					newWorkStep._id,
					newWorkStep
				)

				const updatedWorkFlow = MediaWorkFlowSteps.findOne(workStepIds[0])
				expect(updatedWorkFlow).toMatchObject(newWorkStep)
			})
			testInFiber('remove', () => {
				const workStep = MediaWorkFlowSteps.findOne(workStepIds[0])

				expect(workStep).toBeTruthy()

				Meteor.call(
					PeripheralDeviceAPIMethods.updateMediaWorkFlowStep,
					device._id,
					device.token,
					workStep?._id,
					null
				)

				const updatedWorkFlow = MediaWorkFlowSteps.findOne(workStepIds[0])
				expect(updatedWorkFlow).toBeFalsy()
			})
		})
	})

	// test Media Scanner API
	describe('Media Scanner API', () => {
		let deviceId: ProtectedString<any>
		const MOCK_COLLECTION = 'MockCollection'
		const MOCK_MEDIA_ID = 'SOME_FILE'.toUpperCase()
		const MOCK_OBJID = Random.id()
		beforeEach(async () => {
			deviceId = getRandomId()
			env = await setupDefaultStudioEnvironment()
			PeripheralDevices.insert({
				_id: deviceId,
				organizationId: null,
				name: 'Mock Media Manager',
				studioId: env.studio._id,
				category: PeripheralDeviceAPI.DeviceCategory.MEDIA_MANAGER,
				configManifest: {
					deviceConfig: [],
				},
				connected: true,
				connectionId: '0',
				created: 0,
				lastConnected: 0,
				lastSeen: 0,
				status: {
					statusCode: PeripheralDeviceAPI.StatusCode.GOOD,
				},
				subType: '_process',
				token: 'MockToken',
				type: PeripheralDeviceAPI.DeviceType.MEDIA_MANAGER,
			})
			device = PeripheralDevices.findOne(deviceId)!

			MediaObjects.remove({
				collectionId: MOCK_COLLECTION,
			})
			MediaObjects.insert({
				_id: protectString(MOCK_COLLECTION + '_' + MOCK_OBJID),
				_rev: '1',
				_attachments: {},
				cinf: '',
				collectionId: MOCK_COLLECTION,
				mediaId: MOCK_MEDIA_ID,
				mediaPath: '',
				mediaSize: 10,
				mediaTime: 0,
				objId: MOCK_OBJID,
				studioId: device.studioId!,
				thumbSize: 0,
				thumbTime: 0,
				tinf: '',
			})
		})
		testInFiber('getMediaObjectRevisions', () => {
			const mobjects = MediaObjects.find({
				studioId: device.studioId,
			})
				.fetch()
				.map((mo) => ({
					_id: mo._id,
					_rev: mo._rev,
				}))
			expect(mobjects.length).toBeGreaterThan(0)

			const revs = Meteor.call(
				PeripheralDeviceAPIMethods.getMediaObjectRevisions,
				device._id,
				device.token,
				MOCK_COLLECTION
			)

			expect(revs.length).toBe(mobjects.length)
			expect(mobjects).toMatchObject(mobjects)
		})
		describe('updateMediaObject', () => {
			testInFiber('update', () => {
				const mo = MediaObjects.findOne({
					collectionId: MOCK_COLLECTION,
					studioId: device.studioId!,
				})
				expect(mo).toBeTruthy()

				const newMo = Object.assign({}, mo)
				newMo._rev = '2'
				newMo.cinf = 'MOCK CINF'

				Meteor.call(
					PeripheralDeviceAPIMethods.updateMediaObject,
					device._id,
					device.token,
					MOCK_COLLECTION,
					mo?.objId,
					newMo
				)

				const updateMo = MediaObjects.findOne({
					collectionId: MOCK_COLLECTION,
					studioId: device.studioId!,
				})
				expect(updateMo).toMatchObject(newMo)
			})
			testInFiber('remove', () => {
				const mo = MediaObjects.findOne({
					collectionId: MOCK_COLLECTION,
					studioId: device.studioId!,
				})
				expect(mo).toBeTruthy()

				Meteor.call(
					PeripheralDeviceAPIMethods.updateMediaObject,
					device._id,
					device.token,
					MOCK_COLLECTION,
					mo?.objId,
					null
				)

				const updateMo = MediaObjects.findOne({
					collectionId: MOCK_COLLECTION,
					studioId: device.studioId!,
				})
				expect(updateMo).toBeFalsy()
			})
		})
	})
})

// Note: The data below is copied straight from the test data in mos-connection
const _xmlApiData = {
	rundownCreate: literal<MOS.IMOSRunningOrder>({
		ID: new MOS.MosString128('96857485'),
		Slug: new MOS.MosString128('5PM RUNDOWN'),
		// DefaultChannel?: MOS.MosString128,
		EditorialStart: new MOS.MosTime('2009-04-17T17:02:00'),
		EditorialDuration: new MOS.MosDuration('00:58:25'), // @todo: change this into a real Duration
		// Trigger?: any // TODO: Johan frågar vad denna gör,
		// MacrundownIn?: MOS.MosString128,
		// MacrundownOut?: MOS.MosString128,
		// MosExternalMetaData?: Array<IMOSExternalMetaData>,
		Stories: [
			literal<MOS.IMOSROStory>({
				ID: new MOS.MosString128('5983A501:0049B924:8390EF2B'),
				Slug: new MOS.MosString128('COLSTAT MURDER'),
				Number: new MOS.MosString128('A5'),
				// MosExternalMetaData: Array<IMOSExternalMetaData>
				Items: [
					literal<MOS.IMOSItem>({
						ID: new MOS.MosString128('0'),
						Slug: new MOS.MosString128('OLSTAT MURDER:VO'),
						ObjectID: new MOS.MosString128('M000224'),
						MOSID: 'testmos.enps.com',
						// mosAbstract?: '',
						Paths: [
							literal<MOS.IMOSObjectPath>({
								Type: MOS.IMOSObjectPathType.PATH,
								Description: 'MPEG2 Video',
								Target: '\\server\\media\\clip392028cd2320s0d.mxf',
							}),
							literal<MOS.IMOSObjectPath>({
								Type: MOS.IMOSObjectPathType.PROXY_PATH,
								Description: 'WM9 750Kbps',
								Target: 'http://server/proxy/clipe.wmv',
							}),
							literal<MOS.IMOSObjectPath>({
								Type: MOS.IMOSObjectPathType.METADATA_PATH,
								Description: 'MOS Object',
								Target: 'http://server/proxy/clipe.xml',
							}),
						],
						// Channel?: new MOS.MosString128(),
						// EditorialStart?: MOS.MosTime
						EditorialDuration: 645,
						UserTimingDuration: 310,
						Trigger: 'CHAINED', // TODO: Johan frågar
						// MacrundownIn?: new MOS.MosString128(),
						// MacrundownOut?: new MOS.MosString128(),
						// MosExternalMetaData?: Array<IMOSExternalMetaData>
					}),
				],
			}),
			literal<MOS.IMOSROStory>({
				ID: new MOS.MosString128('3854737F:0003A34D:983A0B28'),
				Slug: new MOS.MosString128('AIRLINE INSPECTIONS'),
				Number: new MOS.MosString128('A6'),
				// MosExternalMetaData: Array<IMOSExternalMetaData>
				Items: [
					literal<MOS.IMOSItem>({
						ID: new MOS.MosString128('0'),
						// Slug: new MOS.MosString128(''),
						ObjectID: new MOS.MosString128('M000133'),
						MOSID: 'testmos.enps.com',
						// mosAbstract?: '',
						// Channel?: new MOS.MosString128(),
						EditorialStart: 55,
						EditorialDuration: 310,
						UserTimingDuration: 200,
						// Trigger: 'CHAINED' // TODO: Johan frågar
						// MacrundownIn?: new MOS.MosString128(),
						// MacrundownOut?: new MOS.MosString128(),
						// MosExternalMetaData?: Array<IMOSExternalMetaData>
					}),
				],
			}),
		],
	}),
	rundownReplace: literal<MOS.IMOSRunningOrder>({
		ID: new MOS.MosString128('96857485'),
		Slug: new MOS.MosString128('5PM RUNDOWN'),
		// DefaultChannel?: MOS.MosString128,
		// EditorialStart: new MOS.MosTime('2009-04-17T17:02:00'),
		// EditorialDuration: '00:58:25', // @todo: change this into a real Duration
		// Trigger?: any // TODO: Johan frågar vad denna gör,
		// MacrundownIn?: MOS.MosString128,
		// MacrundownOut?: MOS.MosString128,
		// MosExternalMetaData?: Array<IMOSExternalMetaData>,
		Stories: [
			literal<MOS.IMOSROStory>({
				ID: new MOS.MosString128('5983A501:0049B924:8390EF2B'),
				Slug: new MOS.MosString128('COLSTAT MURDER'),
				Number: new MOS.MosString128('A1'),
				// MosExternalMetaData: Array<IMOSExternalMetaData>
				Items: [
					literal<MOS.IMOSItem>({
						ID: new MOS.MosString128('0'),
						Slug: new MOS.MosString128('OLSTAT MURDER:VO'),
						ObjectID: new MOS.MosString128('M000224'),
						MOSID: 'testmos.enps.com',
						// mosAbstract?: '',
						Paths: [
							literal<MOS.IMOSObjectPath>({
								Type: MOS.IMOSObjectPathType.PATH,
								Description: 'MPEG2 Video',
								Target: '\\servermediaclip392028cd2320s0d.mxf',
							}),
							literal<MOS.IMOSObjectPath>({
								Type: MOS.IMOSObjectPathType.PROXY_PATH,
								Description: 'WM9 750Kbps',
								Target: 'http://server/proxy/clipe.wmv',
							}),
							literal<MOS.IMOSObjectPath>({
								Type: MOS.IMOSObjectPathType.METADATA_PATH,
								Description: 'MOS Object',
								Target: 'http://server/proxy/clipe.xml',
							}),
						],
						// Channel?: new MOS.MosString128(),
						// EditorialStart?: MOS.MosTime
						EditorialDuration: 645,
						UserTimingDuration: 310,
						Trigger: 'CHAINED', // TODO: Johan frågar
						// MacrundownIn?: new MOS.MosString128(),
						// MacrundownOut?: new MOS.MosString128(),
						// MosExternalMetaData?: Array<IMOSExternalMetaData>
					}),
				],
			}),
			literal<MOS.IMOSROStory>({
				ID: new MOS.MosString128('3852737F:0013A64D:923A0B28'),
				Slug: new MOS.MosString128('AIRLINE SAFETY'),
				Number: new MOS.MosString128('A2'),
				// MosExternalMetaData: Array<IMOSExternalMetaData>
				Items: [
					literal<MOS.IMOSItem>({
						ID: new MOS.MosString128('0'),
						// Slug: new MOS.MosString128(''),
						ObjectID: new MOS.MosString128('M000295'),
						MOSID: 'testmos.enps.com',
						// mosAbstract?: '',
						// Channel?: new MOS.MosString128(),
						EditorialStart: 500,
						EditorialDuration: 600,
						UserTimingDuration: 310,
						// Trigger: 'CHAINED' // TODO: Johan frågar
						// MacrundownIn?: new MOS.MosString128(),
						// MacrundownOut?: new MOS.MosString128(),
						// MosExternalMetaData?: Array<IMOSExternalMetaData>
					}),
				],
			}),
		],
	}),
	rundownDelete: 49478285,
	rundownList: literal<MOS.IMOSObject>({
		ID: new MOS.MosString128('M000123'),
		Slug: new MOS.MosString128('Hotel Fire'),
		// MosAbstract: string,
		Group: 'Show 7',
		Type: MOS.IMOSObjectType.VIDEO,
		TimeBase: 59.94,
		Revision: 1,
		Duration: 1800,
		Status: MOS.IMOSObjectStatus.NEW,
		AirStatus: MOS.IMOSObjectAirStatus.READY,
		Paths: [
			{
				Type: MOS.IMOSObjectPathType.PATH,
				Description: 'MPEG2 Video',
				Target: '\\servermediaclip392028cd2320s0d.mxf',
			},
			{
				Type: MOS.IMOSObjectPathType.PROXY_PATH,
				Description: 'WM9 750Kbps',
				Target: 'http://server/proxy/clipe.wmv',
			},
			{
				Type: MOS.IMOSObjectPathType.METADATA_PATH,
				Description: 'MOS Object',
				Target: 'http://server/proxy/clipe.xml',
			},
		],
		CreatedBy: new MOS.MosString128('Chris'),
		Created: new MOS.MosTime('2009-10-31T23:39:12'),
		ChangedBy: new MOS.MosString128('Chris'),
		Changed: new MOS.MosTime('2009-10-31T23:39:12'),
		// Description: string
		// mosExternalMetaData?: Array<IMOSExternalMetaData>
	}),
	rundownMetadataReplace: literal<MOS.IMOSRunningOrderBase>({
		ID: new MOS.MosString128('96857485'),
		Slug: new MOS.MosString128('5PM RUNDOWN'),
		// DefaultChannel?: new MOS.MosString128(''),
		EditorialStart: new MOS.MosTime('2009-04-17T17:02:00'),
		EditorialDuration: new MOS.MosDuration('00:58:25'),
		// Trigger?: any // TODO: Johan frågar vad denna gör
		// MacrundownIn?: new MOS.MosString128(''),
		// MacrundownOut?: new MOS.MosString128(''),
		// MosExternalMetaData?: Array<IMOSExternalMetaData>
	}),
	rundownElementStat_rundown: literal<MOS.IMOSRunningOrderStatus>({
		ID: new MOS.MosString128('5PM'),
		Status: MOS.IMOSObjectStatus.MANUAL_CTRL,
		Time: new MOS.MosTime('2009-04-11T14:13:53'),
	}),
	rundownElementStat_story: literal<MOS.IMOSStoryStatus>({
		RunningOrderId: new MOS.MosString128('5PM'),
		ID: new MOS.MosString128('HOTEL FIRE'),
		Status: MOS.IMOSObjectStatus.PLAY,
		Time: new MOS.MosTime('1999-04-11T14:13:53'),
	}),
	rundownElementStat_item: literal<MOS.IMOSItemStatus>({
		RunningOrderId: new MOS.MosString128('5PM'),
		StoryId: new MOS.MosString128('HOTEL FIRE '),
		ID: new MOS.MosString128('0'),
		ObjectId: new MOS.MosString128('A0295'),
		Channel: new MOS.MosString128('B'),
		Status: MOS.IMOSObjectStatus.PLAY,
		Time: new MOS.MosTime('2009-04-11T14:13:53'),
	}),
	rundownReadyToAir: literal<MOS.IMOSROReadyToAir>({
		ID: new MOS.MosString128('5PM'),
		Status: MOS.IMOSObjectAirStatus.READY,
	}),
	rundownElementAction_insert_story_Action: literal<MOS.IMOSStoryAction>({
		RunningOrderID: new MOS.MosString128('5PM'),
		StoryID: new MOS.MosString128('2'),
	}),
	rundownElementAction_insert_story_Stories: [
		literal<MOS.IMOSROStory>({
			ID: new MOS.MosString128('17'),
			Slug: new MOS.MosString128('Barcelona Football'),
			Number: new MOS.MosString128('A2'),
			// MosExternalMetaData?: Array<IMOSExternalMetaData>,
			Items: [
				literal<MOS.IMOSItem>({
					ID: new MOS.MosString128('27'),
					// Slug?: new MOS.MosString128(''),
					ObjectID: new MOS.MosString128('M73627'),
					MOSID: 'testmos',
					// mosAbstract?: '',
					Paths: [
						{
							Type: MOS.IMOSObjectPathType.PATH,
							Description: 'MPEG2 Video',
							Target: '\\servermediaclip392028cd2320s0d.mxf',
						},
						{
							Type: MOS.IMOSObjectPathType.PROXY_PATH,
							Description: 'WM9 750Kbps',
							Target: 'http://server/proxy/clipe.wmv',
						},
						{
							Type: MOS.IMOSObjectPathType.METADATA_PATH,
							Description: 'MOS Object',
							Target: 'http://server/proxy/clipe.xml',
						},
					],
					EditorialStart: 0,
					EditorialDuration: 715,
					UserTimingDuration: 415,
				}),
				literal<MOS.IMOSItem>({
					ID: new MOS.MosString128('28'),
					ObjectID: new MOS.MosString128('M73628'),
					MOSID: 'testmos',
					// mosAbstract?: '',
					EditorialStart: 0,
					EditorialDuration: 315,
				}),
			],
		}),
	],
	rundownElementAction_insert_item_Action: literal<MOS.IMOSItemAction>({
		RunningOrderID: new MOS.MosString128('5PM'),
		StoryID: new MOS.MosString128('2'),
		ItemID: new MOS.MosString128('23'),
	}),
	rundownElementAction_insert_item_Items: [
		literal<MOS.IMOSItem>({
			ID: new MOS.MosString128('27'),
			Slug: new MOS.MosString128('NHL PKG'),
			ObjectID: new MOS.MosString128('M19873'),
			MOSID: 'testmos',
			Paths: [
				{
					Type: MOS.IMOSObjectPathType.PATH,
					Description: 'MPEG2 Video',
					Target: '\\servermediaclip392028cd2320s0d.mxf',
				},
				{
					Type: MOS.IMOSObjectPathType.PROXY_PATH,
					Description: 'WM9 750Kbps',
					Target: 'http://server/proxy/clipe.wmv',
				},
				{
					Type: MOS.IMOSObjectPathType.METADATA_PATH,
					Description: 'MOS Object',
					Target: 'http://server/proxy/clipe.xml',
				},
			],
			EditorialStart: 0,
			EditorialDuration: 700,
			UserTimingDuration: 690,
		}),
	],
	rundownElementAction_replace_story_Action: literal<MOS.IMOSStoryAction>({
		RunningOrderID: new MOS.MosString128('5PM'),
		StoryID: new MOS.MosString128('2'),
	}),
	rundownElementAction_replace_story_Stories: [
		literal<MOS.IMOSROStory>({
			ID: new MOS.MosString128('17'),
			Slug: new MOS.MosString128('Porto Football'),
			Number: new MOS.MosString128('A2'),
			// MosExternalMetaData?: Array<IMOSExternalMetaData>,
			Items: [
				literal<MOS.IMOSItem>({
					ID: new MOS.MosString128('27'),
					// Slug?: new MOS.MosString128(''),
					ObjectID: new MOS.MosString128('M73627'),
					MOSID: 'testmos',
					// mosAbstract?: '',
					Paths: [
						{
							Type: MOS.IMOSObjectPathType.PATH,
							Description: 'MPEG2 Video',
							Target: '\\servermediaclip392028cd2320s0d.mxf',
						},
						{
							Type: MOS.IMOSObjectPathType.PROXY_PATH,
							Description: 'WM9 750Kbps',
							Target: 'http://server/proxy/clipe.wmv',
						},
						{
							Type: MOS.IMOSObjectPathType.METADATA_PATH,
							Description: 'MOS Object',
							Target: 'http://server/proxy/clipe.xml',
						},
					],
					EditorialStart: 0,
					EditorialDuration: 715,
					UserTimingDuration: 415,
				}),
				literal<MOS.IMOSItem>({
					ID: new MOS.MosString128('28'),
					ObjectID: new MOS.MosString128('M73628'),
					MOSID: 'testmos',
					// mosAbstract?: '',
					EditorialStart: 0,
					EditorialDuration: 315,
				}),
			],
		}),
	],
	rundownElementAction_replace_item_Action: literal<MOS.IMOSItemAction>({
		RunningOrderID: new MOS.MosString128('5PM'),
		StoryID: new MOS.MosString128('2'),
		ItemID: new MOS.MosString128('23'),
	}),
	rundownElementAction_replace_item_Items: [
		literal<MOS.IMOSItem>({
			ID: new MOS.MosString128('27'),
			Slug: new MOS.MosString128('NHL PKG'),
			ObjectID: new MOS.MosString128('M19873'),
			MOSID: 'testmos',
			Paths: [
				{
					Type: MOS.IMOSObjectPathType.PATH,
					Description: 'MPEG2 Video',
					Target: '\\servermediaclip392028cd2320s0d.mxf',
				},
				{
					Type: MOS.IMOSObjectPathType.PROXY_PATH,
					Description: 'WM9 750Kbps',
					Target: 'http://server/proxy/clipe.wmv',
				},
				{
					Type: MOS.IMOSObjectPathType.METADATA_PATH,
					Description: 'MOS Object',
					Target: 'http://server/proxy/clipe.xml',
				},
			],
			EditorialStart: 0,
			EditorialDuration: 700,
			UserTimingDuration: 690,
		}),
	],
	rundownElementAction_move_story_Action: literal<MOS.IMOSStoryAction>({
		RunningOrderID: new MOS.MosString128('5PM'),
		StoryID: new MOS.MosString128('2'),
	}),
	rundownElementAction_move_story_Stories: [new MOS.MosString128('7')],
	rundownElementAction_move_stories_Action: literal<MOS.IMOSStoryAction>({
		RunningOrderID: new MOS.MosString128('5PM'),
		StoryID: new MOS.MosString128('2'),
	}),
	rundownElementAction_move_stories_Stories: [new MOS.MosString128('7'), new MOS.MosString128('12')],
	rundownElementAction_move_items_Action: literal<MOS.IMOSItemAction>({
		RunningOrderID: new MOS.MosString128('5PM'),
		StoryID: new MOS.MosString128('2'),
		ItemID: new MOS.MosString128('12'),
	}),
	rundownElementAction_move_items_Items: [new MOS.MosString128('23'), new MOS.MosString128('24')],
	rundownElementAction_delete_story_Action: literal<MOS.IMOSROAction>({
		RunningOrderID: new MOS.MosString128('5PM'),
	}),
	rundownElementAction_delete_story_Stories: [new MOS.MosString128('3')],
	rundownElementAction_delete_items_Action: literal<MOS.IMOSStoryAction>({
		RunningOrderID: new MOS.MosString128('5PM'),
		StoryID: new MOS.MosString128('2'),
	}),
	rundownElementAction_delete_items_Items: [new MOS.MosString128('23'), new MOS.MosString128('24')],
	rundownElementAction_swap_stories_Action: literal<MOS.IMOSROAction>({
		RunningOrderID: new MOS.MosString128('5PM'),
	}),
	rundownElementAction_swap_stories_StoryId0: new MOS.MosString128('3'),
	rundownElementAction_swap_stories_StoryId1: new MOS.MosString128('5'),
	rundownElementAction_swap_items_Action: literal<MOS.IMOSStoryAction>({
		RunningOrderID: new MOS.MosString128('5PM'),
		StoryID: new MOS.MosString128('2'),
	}),
	rundownElementAction_swap_items_ItemId0: new MOS.MosString128('23'),
	rundownElementAction_swap_items_ItemId1: new MOS.MosString128('24'),
}
