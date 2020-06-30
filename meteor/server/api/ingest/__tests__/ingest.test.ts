import { Meteor } from 'meteor/meteor'
import { PeripheralDeviceAPI, PeripheralDeviceAPIMethods } from '../../../../lib/api/peripheralDevice'
import { setupDefaultStudioEnvironment, setupMockPeripheralDevice } from '../../../../__mocks__/helpers/database'
import { Rundowns, Rundown } from '../../../../lib/collections/Rundowns'
import { PeripheralDevice } from '../../../../lib/collections/PeripheralDevices'
import { testInFiber } from '../../../../__mocks__/helpers/jest'
import { Segment, Segments } from '../../../../lib/collections/Segments'
import { Part, Parts, PartId } from '../../../../lib/collections/Parts'
import { IngestRundown, IngestSegment, IngestPart } from 'tv-automation-sofie-blueprints-integration'
import { updatePartRanks, ServerRundownAPI } from '../../rundown'
import { ServerPlayoutAPI } from '../../playout/playout'
import { RundownInput } from '../rundownInput'
import { RundownPlaylists, RundownPlaylist } from '../../../../lib/collections/RundownPlaylists'
import { unprotectString, protectString } from '../../../../lib/lib'
import { PartInstances } from '../../../../lib/collections/PartInstances'
import { getSegmentId } from '../lib'
import { wrapWithCacheForRundownPlaylistFromRundown, wrapWithCacheForRundownPlaylist } from '../../../DatabaseCaches'
import { removeRundownPlaylistFromCache } from '../../playout/lib'

require('../../peripheralDevice.ts') // include in order to create the Meteor methods needed

describe('Test ingest actions for rundowns and segments', () => {
	let device: PeripheralDevice
	let device2: PeripheralDevice
	let externalId = 'abcde'
	let segExternalId = 'zyxwv'
	beforeAll(() => {
		const env = setupDefaultStudioEnvironment()
		device = env.ingestDevice

		device2 = setupMockPeripheralDevice(
			PeripheralDeviceAPI.DeviceCategory.INGEST,
			// @ts-ignore
			'mockDeviceType',
			PeripheralDeviceAPI.SUBTYPE_PROCESS,
			env.studio
		)
	})

	testInFiber('dataRundownCreate', () => {
		// setLoggerLevel('debug')

		expect(Rundowns.findOne()).toBeFalsy()

		const rundownData: IngestRundown = {
			externalId: externalId,
			name: 'MyMockRundown',
			type: 'mock',
			// payload: {},
			segments: [
				{
					externalId: 'segment0',
					name: 'Segment 0',
					rank: 0,
					// payload?: any,
					parts: [
						{
							externalId: 'part0',
							name: 'Part 0',
							rank: 0,
							// payload?: any,
						},
						{
							externalId: 'part1',
							name: 'Part 1',
							rank: 0,
							// payload?: any,
						},
					],
				},
				{
					externalId: 'segment1',
					name: 'Segment 1',
					rank: 0,
					// payload?: any,
					parts: [
						{
							externalId: 'part2',
							name: 'Part 2',
							rank: 0,
							// payload?: any,
						},
					],
				},
			],
		}

		Meteor.call(PeripheralDeviceAPIMethods.dataRundownCreate, device._id, device.token, rundownData)

		const rundownPlaylist = RundownPlaylists.findOne() as RundownPlaylist
		const rundown = Rundowns.findOne() as Rundown
		expect(rundownPlaylist).toMatchObject({
			externalId: rundown._id,
		})

		expect(rundown).toMatchObject({
			externalId: rundownData.externalId,
			playlistId: rundownPlaylist._id,
		})
		expect(typeof rundown.touch).toEqual('function')

		const segments = Segments.find({ rundownId: rundown._id }).fetch()
		expect(segments).toHaveLength(2)

		const parts0 = Parts.find({ rundownId: rundown._id, segmentId: segments[0]._id }).fetch()
		expect(parts0).toHaveLength(2)

		const parts1 = Parts.find({ rundownId: rundown._id, segmentId: segments[1]._id }).fetch()
		expect(parts1).toHaveLength(1)
	})

	testInFiber('dataRundownUpdate change name', () => {
		expect(Rundowns.findOne()).toBeTruthy()
		const rundownData: IngestRundown = {
			externalId: externalId,
			name: 'MyMockRundownRenamed',
			type: 'mock',
			// payload: {},
			segments: [
				{
					externalId: 'segment0',
					name: 'Segment 0',
					rank: 0,
					// payload?: any,
					parts: [
						{
							externalId: 'part0',
							name: 'Part 0',
							rank: 0,
							// payload?: any,
						},
						{
							externalId: 'part1',
							name: 'Part 1',
							rank: 0,
							// payload?: any,
						},
					],
				},
				{
					externalId: 'segment1',
					name: 'Segment 1',
					rank: 0,
					// payload?: any,
					parts: [
						{
							externalId: 'part2',
							name: 'Part 2',
							rank: 0,
							// payload?: any,
						},
					],
				},
			],
		}
		Meteor.call(PeripheralDeviceAPIMethods.dataRundownUpdate, device._id, device.token, rundownData)

		const rundownPlaylist = RundownPlaylists.findOne() as RundownPlaylist
		const rundown = Rundowns.findOne() as Rundown
		expect(rundownPlaylist).toMatchObject({
			externalId: rundown._id,
			name: rundownData.name,
		})
		expect(RundownPlaylists.find().count()).toBe(1)

		expect(rundown).toMatchObject({
			externalId: rundownData.externalId,
			name: rundownData.name,
			playlistId: rundownPlaylist._id,
		})
		expect(typeof rundown.touch).toEqual('function')
		expect(Rundowns.find().count()).toBe(1)

		const segments = Segments.find({ rundownId: rundown._id }).fetch()
		expect(segments).toHaveLength(2)

		const parts0 = Parts.find({ rundownId: rundown._id, segmentId: segments[0]._id }).fetch()
		expect(parts0).toHaveLength(2)

		const parts1 = Parts.find({ rundownId: rundown._id, segmentId: segments[1]._id }).fetch()
		expect(parts1).toHaveLength(1)
	})

	testInFiber('dataRundownUpdate add a segment', () => {
		expect(Rundowns.findOne()).toBeTruthy()
		const rundownData: IngestRundown = {
			externalId: externalId,
			name: 'MyMockRundown',
			type: 'mock',
			// payload: {},
			segments: [
				{
					externalId: 'segment0',
					name: 'Segment 0',
					rank: 0,
					// payload?: any,
					parts: [
						{
							externalId: 'part0',
							name: 'Part 0',
							rank: 0,
							// payload?: any,
						},
						{
							externalId: 'part1',
							name: 'Part 1',
							rank: 0,
							// payload?: any,
						},
					],
				},
				{
					externalId: 'segment1',
					name: 'Segment 1',
					rank: 0,
					// payload?: any,
					parts: [
						{
							externalId: 'part2',
							name: 'Part 2',
							rank: 0,
							// payload?: any,
						},
					],
				},
				{
					externalId: 'segment2',
					name: 'Segment 2',
					rank: 0,
					// payload?: any,
					parts: [
						{
							externalId: 'part3',
							name: 'Part 3',
							rank: 0,
							// payload?: any,
						},
					],
				},
			],
		}
		Meteor.call(PeripheralDeviceAPIMethods.dataRundownUpdate, device._id, device.token, rundownData)

		const rundown = Rundowns.findOne() as Rundown
		expect(rundown).toMatchObject({
			externalId: rundownData.externalId,
		})
		expect(typeof rundown.touch).toEqual('function')
		expect(Rundowns.find().count()).toBe(1)

		const segments = Segments.find({ rundownId: rundown._id }).fetch()
		expect(segments).toHaveLength(3)

		const parts0 = Parts.find({ rundownId: rundown._id, segmentId: segments[0]._id }).fetch()
		expect(parts0).toHaveLength(2)

		const parts1 = Parts.find({ rundownId: rundown._id, segmentId: segments[1]._id }).fetch()
		expect(parts1).toHaveLength(1)

		const parts2 = Parts.find({ rundownId: rundown._id, segmentId: segments[2]._id }).fetch()
		expect(parts2).toHaveLength(1)
	})

	testInFiber('dataRundownUpdate add a part', () => {
		expect(Rundowns.findOne()).toBeTruthy()
		const rundownData: IngestRundown = {
			externalId: externalId,
			name: 'MyMockRundown',
			type: 'mock',
			// payload: {},
			segments: [
				{
					externalId: 'segment0',
					name: 'Segment 0',
					rank: 0,
					// payload?: any,
					parts: [
						{
							externalId: 'part0',
							name: 'Part 0',
							rank: 0,
							// payload?: any,
						},
						{
							externalId: 'part1',
							name: 'Part 1',
							rank: 0,
							// payload?: any,
						},
					],
				},
				{
					externalId: 'segment1',
					name: 'Segment 1',
					rank: 0,
					// payload?: any,
					parts: [
						{
							externalId: 'part2',
							name: 'Part 2',
							rank: 0,
							// payload?: any,
						},
						{
							externalId: 'partZ',
							name: 'Part Z',
							rank: 0,
						},
					],
				},
				{
					externalId: 'segment2',
					name: 'Segment 2',
					rank: 0,
					// payload?: any,
					parts: [
						{
							externalId: 'part3',
							name: 'Part 3',
							rank: 0,
							// payload?: any,
						},
					],
				},
			],
		}
		Meteor.call(PeripheralDeviceAPIMethods.dataRundownUpdate, device._id, device.token, rundownData)

		const rundownPlaylist = RundownPlaylists.findOne() as RundownPlaylist
		const rundown = Rundowns.findOne() as Rundown
		expect(rundownPlaylist).toMatchObject({
			externalId: rundown._id,
		})
		expect(RundownPlaylists.find().count()).toBe(1)

		expect(rundown).toMatchObject({
			externalId: rundownData.externalId,
		})
		expect(typeof rundown.touch).toEqual('function')
		expect(Rundowns.find().count()).toBe(1)

		const segments = Segments.find({ rundownId: rundown._id }).fetch()
		expect(segments).toHaveLength(3)

		const parts0 = Parts.find({ rundownId: rundown._id, segmentId: segments[0]._id }).fetch()
		expect(parts0).toHaveLength(2)

		const parts1 = Parts.find({ rundownId: rundown._id, segmentId: segments[1]._id }).fetch()
		expect(parts1).toHaveLength(2)
		expect(parts1.map((x) => x.title)).toEqual(['Part 2', 'Part Z'])

		const parts2 = Parts.find({ rundownId: rundown._id, segmentId: segments[2]._id }).fetch()
		expect(parts2).toHaveLength(1)
	})

	testInFiber('dataRundownUpdate remove a segment', () => {
		expect(Rundowns.findOne()).toBeTruthy()
		const rundownData: IngestRundown = {
			externalId: externalId,
			name: 'MyMockRundown',
			type: 'mock',
			// payload: {},
			segments: [
				{
					externalId: 'segment0',
					name: 'Segment 0',
					rank: 0,
					// payload?: any,
					parts: [
						{
							externalId: 'part0',
							name: 'Part 0',
							rank: 0,
							// payload?: any,
						},
						{
							externalId: 'part1',
							name: 'Part 1',
							rank: 0,
							// payload?: any,
						},
					],
				},
				{
					externalId: 'segment2',
					name: 'Segment 2',
					rank: 0,
					// payload?: any,
					parts: [
						{
							externalId: 'part3',
							name: 'Part 3',
							rank: 0,
							// payload?: any,
						},
					],
				},
			],
		}
		Meteor.call(PeripheralDeviceAPIMethods.dataRundownUpdate, device._id, device.token, rundownData)

		const rundownPlaylist = RundownPlaylists.findOne() as RundownPlaylist
		const rundown = Rundowns.findOne() as Rundown
		expect(rundownPlaylist).toMatchObject({
			externalId: rundown._id,
		})
		expect(RundownPlaylists.find().count()).toBe(1)

		expect(rundown).toMatchObject({
			externalId: rundownData.externalId,
		})
		expect(typeof rundown.touch).toEqual('function')
		expect(Rundowns.find().count()).toBe(1)

		const segments = Segments.find({ rundownId: rundown._id }).fetch()
		expect(segments).toHaveLength(2)

		const parts0 = Parts.find({ rundownId: rundown._id, segmentId: segments[0]._id }).fetch()
		expect(parts0).toHaveLength(2)

		const parts1 = Parts.find({ rundownId: rundown._id, segmentId: segments[1]._id }).fetch()
		expect(parts1).toHaveLength(1)
	})

	testInFiber('dataRundownUpdate remove a part', () => {
		expect(Rundowns.findOne()).toBeTruthy()
		const rundownData: IngestRundown = {
			externalId: externalId,
			name: 'MyMockRundown',
			type: 'mock',
			// payload: {},
			segments: [
				{
					externalId: 'segment0',
					name: 'Segment 0',
					rank: 0,
					// payload?: any,
					parts: [
						{
							externalId: 'part1',
							name: 'Part 1',
							rank: 0,
							// payload?: any,
						},
					],
				},
				{
					externalId: 'segment2',
					name: 'Segment 2',
					rank: 0,
					// payload?: any,
					parts: [
						{
							externalId: 'part3',
							name: 'Part 3',
							rank: 0,
							// payload?: any,
						},
					],
				},
			],
		}
		Meteor.call(PeripheralDeviceAPIMethods.dataRundownUpdate, device._id, device.token, rundownData)

		const rundown = Rundowns.findOne() as Rundown
		expect(rundown).toMatchObject({
			externalId: rundownData.externalId,
		})
		expect(typeof rundown.touch).toEqual('function')
		expect(Rundowns.find().count()).toBe(1)

		const segments = Segments.find({ rundownId: rundown._id }).fetch()
		expect(segments).toHaveLength(2)

		const parts0 = Parts.find({ rundownId: rundown._id, segmentId: segments[0]._id }).fetch()
		expect(parts0).toHaveLength(1)
		expect(parts0[0].externalId).toBe('part1')

		const parts1 = Parts.find({ rundownId: rundown._id, segmentId: segments[1]._id }).fetch()
		expect(parts1).toHaveLength(1)
	})

	testInFiber('dataRundownDelete', () => {
		expect(Rundowns.findOne()).toBeTruthy()
		Meteor.call(PeripheralDeviceAPIMethods.dataRundownDelete, device._id, device.token, externalId)
		expect(Rundowns.findOne()).toBeFalsy()
		expect(Segments.find().count()).toBe(0)
		expect(Parts.find().count()).toBe(0)
	})

	testInFiber('dataRundownDelete for a second time', () => {
		expect(Rundowns.findOne()).toBeFalsy()
		try {
			Meteor.call(PeripheralDeviceAPIMethods.dataRundownDelete, device._id, device.token, externalId)
			expect(true).toBe(false) // Please throw and don't get here
		} catch (e) {
			expect(e.message).toMatch(/Rundown.*not found/i)
		}
	})

	testInFiber('dataRundownDelete bad device', () => {
		expect(Rundowns.findOne()).toBeFalsy()
		try {
			Meteor.call(
				PeripheralDeviceAPIMethods.dataRundownDelete,
				unprotectString(device._id).slice(0, -1),
				device.token,
				externalId
			)
			expect(true).toBe(false) // Please throw and don't get here
		} catch (e) {
			expect(e.message).toBe('[404] PeripheralDevice "mockDevice" not found')
		}
		try {
			Meteor.call(PeripheralDeviceAPIMethods.dataRundownDelete, device._id, device.token.slice(0, -1), externalId)
			expect(true).toBe(false) // Please throw and don't get here
		} catch (e) {
			expect(e.message).toBe('[401] Not allowed access to peripheralDevice')
		}
	})

	// Allow update even though no preceeding create
	testInFiber('dataRundownUpdate even though not yet created', () => {
		expect(Rundowns.findOne()).toBeFalsy()
		const rundownData: IngestRundown = {
			externalId: externalId,
			name: 'MyMockRundown',
			type: 'mock',
			// payload: {},
			segments: [
				{
					externalId: 'segment0',
					name: 'Segment 0',
					rank: 0,
					// payload?: any,
					parts: [
						{
							externalId: 'part1',
							name: 'Part 1',
							rank: 0,
							// payload?: any,
						},
					],
				},
				{
					externalId: 'segment2',
					name: 'Segment 2',
					rank: 0,
					// payload?: any,
					parts: [
						{
							externalId: 'part3',
							name: 'Part 3',
							rank: 0,
							// payload?: any,
						},
					],
				},
			],
		}
		Meteor.call(PeripheralDeviceAPIMethods.dataRundownUpdate, device._id, device.token, rundownData)
		expect(Rundowns.findOne()).toBeTruthy()
	})

	testInFiber('dataSegmentCreate', () => {
		expect(Rundowns.findOne()).toBeTruthy()
		const rundown = Rundowns.findOne() as Rundown
		expect(Segments.find({ rundownId: rundown._id }).count()).toBe(2)
		const ingestSegment: IngestSegment = {
			externalId: segExternalId,
			name: 'MyMockSegment',
			rank: 0,
			// payload?: any;
			parts: [],
		}
		Meteor.call(PeripheralDeviceAPIMethods.dataSegmentCreate, device._id, device.token, externalId, ingestSegment)

		const segment = Segments.find({ externalId: segExternalId }).fetch()
		expect(segment).toHaveLength(1)
		expect(segment[0]).toMatchObject({
			externalId: ingestSegment.externalId,
			name: 'MyMockSegment', // fails here because name is set to segments externalId instead
		})

		const segments = Segments.find({ rundownId: rundown._id }).fetch()
		expect(segments).toHaveLength(3)
	})

	testInFiber('dataSegmentUpdate add a part', () => {
		const rundown = Rundowns.findOne() as Rundown
		expect(Segments.find({ rundownId: rundown._id }).count()).toBe(3)

		const ingestSegment: IngestSegment = {
			externalId: segExternalId,
			name: 'MyMockSegment',
			rank: 0,
			// payload?: any;
			parts: [
				{
					externalId: 'part42',
					name: 'Part 42',
					rank: 0,
				},
			],
		}
		Meteor.call(PeripheralDeviceAPIMethods.dataSegmentUpdate, device._id, device.token, externalId, ingestSegment)

		const segments = Segments.find({ rundownId: rundown._id }).fetch()
		expect(segments).toHaveLength(3)

		const parts3 = Parts.find({ rundownId: rundown._id, segmentId: segments[2]._id }).fetch()
		expect(parts3).toHaveLength(1)
		expect(parts3[0]).toMatchObject({
			externalId: 'part42',
			title: 'Part 42',
		})
	})

	testInFiber('dataSegmentUpdate non-existant rundown', () => {
		const ingestSegment: IngestSegment = {
			externalId: segExternalId,
			name: 'MyMockSegment',
			rank: 0,
			// payload?: any;
			parts: [],
		}

		try {
			Meteor.call(PeripheralDeviceAPIMethods.dataSegmentUpdate, device._id, device.token, 'wibble', ingestSegment)
			expect(true).toBe(false)
		} catch (e) {
			expect(e.message).toMatch(/Rundown.*not found/i)
		}
	})

	testInFiber('dataSegmentUpdate no change', () => {
		const rundown = Rundowns.findOne() as Rundown
		expect(Segments.find({ rundownId: rundown._id }).count()).toBe(3)

		const ingestSegment: IngestSegment = {
			externalId: segExternalId,
			name: 'MyMockSegment',
			rank: 0,
			// payload?: any;
			parts: [
				{
					externalId: 'part42',
					name: 'Part 42',
					rank: 0,
				},
			],
		}
		Meteor.call(PeripheralDeviceAPIMethods.dataSegmentUpdate, device._id, device.token, externalId, ingestSegment)

		const segments = Segments.find({ rundownId: rundown._id }).fetch()
		expect(segments).toHaveLength(3)

		const parts3 = Parts.find({ rundownId: rundown._id, segmentId: segments[2]._id }).fetch()
		expect(parts3).toHaveLength(1)
		expect(parts3[0]).toMatchObject({
			externalId: 'part42',
			title: 'Part 42',
		})
	})

	testInFiber('dataSegmentUpdate remove a part', () => {
		const rundown = Rundowns.findOne() as Rundown
		expect(Segments.find({ rundownId: rundown._id }).count()).toBe(3)

		const ingestSegment: IngestSegment = {
			externalId: segExternalId,
			name: 'MyMockSegment',
			rank: 0,
			// payload?: any;
			parts: [],
		}
		Meteor.call(PeripheralDeviceAPIMethods.dataSegmentUpdate, device._id, device.token, externalId, ingestSegment)

		const segments = Segments.find({ rundownId: rundown._id }).fetch()
		expect(segments).toHaveLength(3)

		const parts3 = Parts.find({ rundownId: rundown._id, segmentId: segments[2]._id }).fetch()
		expect(parts3).toHaveLength(0)
	})

	testInFiber('dataSegmentUpdate no external id', () => {
		const rundown = Rundowns.findOne() as Rundown
		expect(Segments.find({ rundownId: rundown._id }).count()).toBe(3)
		const ingestSegment: IngestSegment = {
			externalId: '',
			name: 'MyMockSegment',
			rank: 0,
			// payload?: any;
			parts: [],
		}
		try {
			Meteor.call(
				PeripheralDeviceAPIMethods.dataSegmentUpdate,
				device._id,
				device.token,
				externalId,
				ingestSegment
			)
			expect(false).toBe(true)
		} catch (e) {
			expect(e.message).toBe(`[401] getSegmentId: segmentExternalId must be set!`)
		}
	})

	testInFiber('dataSegmentDelete', () => {
		const rundown = Rundowns.findOne() as Rundown
		expect(Segments.find({ rundownId: rundown._id }).count()).toBe(3)

		Meteor.call(PeripheralDeviceAPIMethods.dataSegmentDelete, device._id, device.token, externalId, segExternalId)

		expect(Segments.find({ rundownId: rundown._id }).count()).toBe(2)
		expect(Segments.findOne({ externalId: segExternalId })).toBeFalsy()
	})

	testInFiber('dataSegmentDelete for a second time', () => {
		const rundown = Rundowns.findOne() as Rundown
		expect(Segments.find({ rundownId: rundown._id, externalID: segExternalId }).count()).toBe(0)

		try {
			Meteor.call(
				PeripheralDeviceAPIMethods.dataSegmentDelete,
				device._id,
				device.token,
				externalId,
				segExternalId
			)
			expect(true).toBe(false) // Should throw rather than run this test
		} catch (e) {
			expect(e.message).toBe(
				`[404] handleRemovedSegment: Segment "${getSegmentId(rundown._id, segExternalId)}" not found`
			)
		}

		expect(Segments.find({ rundownId: rundown._id }).count()).toBe(2)
	})

	testInFiber('dataSegmentDelete from non-existant rundown', () => {
		const rundown = Rundowns.findOne() as Rundown
		expect(Segments.find({ rundownId: rundown._id }).count()).toBe(2)

		try {
			Meteor.call(PeripheralDeviceAPIMethods.dataSegmentDelete, device._id, device.token, 'wibble', segExternalId)
			expect(true).toBe(false) // Should throw rather than run this test
		} catch (e) {
			expect(e.message).toMatch(/Rundown.*not found/i)
		}
	})

	testInFiber('dataSegmentCreate non-existant rundown', () => {
		const rundown = Rundowns.findOne() as Rundown
		expect(rundown).toBeTruthy()

		const ingestSegment: IngestSegment = {
			externalId: segExternalId,
			name: 'MyMockSegment',
			rank: 0,
			// payload?: any;
			parts: [],
		}
		try {
			Meteor.call(PeripheralDeviceAPIMethods.dataSegmentCreate, device._id, device.token, 'wibble', ingestSegment)
			expect(true).toBe(false)
		} catch (e) {
			expect(e.message).toMatch(/not found/)
		}
	})

	testInFiber('dataRundownCreate with not enough arguments', () => {
		try {
			Meteor.call(PeripheralDeviceAPIMethods.dataSegmentCreate)
			expect(0).toBe(1)
		} catch (e) {
			expect(e).toBeTruthy()
		}
		try {
			Meteor.call(PeripheralDeviceAPIMethods.dataSegmentCreate, device._id)
			expect(0).toBe(1)
		} catch (e) {
			expect(e).toBeTruthy()
		}
		try {
			Meteor.call(PeripheralDeviceAPIMethods.dataSegmentCreate, device._id, device.token)
			expect(0).toBe(1)
		} catch (e) {
			expect(e).toBeTruthy()
		}
		try {
			Meteor.call(PeripheralDeviceAPIMethods.dataSegmentCreate, device._id, device.token, null)
			expect(0).toBe(1)
		} catch (e) {
			expect(e).toBeTruthy()
		}
	})

	testInFiber('dataSegmentCreate with not enough arguments', () => {
		try {
			Meteor.call(PeripheralDeviceAPIMethods.dataSegmentCreate)
			expect(0).toBe(1)
		} catch (e) {
			expect(e).toBeTruthy()
		}
		try {
			Meteor.call(PeripheralDeviceAPIMethods.dataSegmentCreate, device._id)
			expect(0).toBe(1)
		} catch (e) {
			expect(e).toBeTruthy()
		}
		try {
			Meteor.call(PeripheralDeviceAPIMethods.dataSegmentCreate, device._id, device.token)
			expect(0).toBe(1)
		} catch (e) {
			expect(e).toBeTruthy()
		}
		try {
			Meteor.call(PeripheralDeviceAPIMethods.dataSegmentCreate, device._id, device.token, externalId)
			expect(0).toBe(1)
		} catch (e) {
			expect(e).toBeTruthy()
		}
		try {
			Meteor.call(PeripheralDeviceAPIMethods.dataSegmentCreate, device._id, device.token, externalId, null)
			expect(0).toBe(1)
		} catch (e) {
			expect(e).toBeTruthy()
		}
	})

	testInFiber('dataPartCreate', () => {
		const rundown = Rundowns.findOne() as Rundown
		const segment = Segments.findOne({ externalId: 'segment0' }) as Segment
		expect(Parts.find({ rundownId: rundown._id, segmentId: segment._id }).count()).toBe(1)

		const ingestPart: IngestPart = {
			externalId: 'party',
			name: 'Part Y',
			rank: 0,
			// payload: any?
		}

		Meteor.call(
			PeripheralDeviceAPIMethods.dataPartCreate,
			device._id,
			device.token,
			externalId,
			segment.externalId,
			ingestPart
		)

		expect(Parts.find({ rundownId: rundown._id, segmentId: segment._id }).count()).toBe(2)

		let part = Parts.findOne({ externalId: 'party' }) as Part
		expect(part).toMatchObject({
			externalId: ingestPart.externalId,
			title: ingestPart.name,
		})
	})

	testInFiber('dataPartUpdate', () => {
		const rundown = Rundowns.findOne() as Rundown
		const segment = Segments.findOne({ externalId: 'segment0' }) as Segment
		expect(Parts.find({ rundownId: rundown._id, segmentId: segment._id }).count()).toBe(2)

		const ingestPart: IngestPart = {
			externalId: 'party',
			name: 'Part Z',
			rank: 0,
			// payload: any?
		}

		Meteor.call(
			PeripheralDeviceAPIMethods.dataPartUpdate,
			device._id,
			device.token,
			externalId,
			segment.externalId,
			ingestPart
		)

		expect(Parts.find({ rundownId: rundown._id, segmentId: segment._id }).count()).toBe(2)

		let part = Parts.findOne({ externalId: 'party' }) as Part
		expect(part).toMatchObject({
			externalId: ingestPart.externalId,
			title: ingestPart.name,
		})
	})

	testInFiber('dataPartDelete', () => {
		const rundown = Rundowns.findOne() as Rundown
		const segment = Segments.findOne({ rundownId: rundown._id, externalId: 'segment0' }) as Segment
		expect(Parts.find({ rundownId: rundown._id, segmentId: segment._id }).count()).toBe(2)

		Meteor.call(
			PeripheralDeviceAPIMethods.dataPartDelete,
			device._id,
			device.token,
			externalId,
			segment.externalId,
			'party'
		)

		expect(Parts.find({ rundownId: rundown._id, segmentId: segment._id }).count()).toBe(1)
		expect(Parts.findOne({ externalId: 'party' })).toBeFalsy()
	})

	// TODO Part tests are minimal/happy path only on the assumption the API gets little use

	testInFiber('dataRundownUpdate remove dynamicInserted Part', () => {
		Rundowns.remove({})
		expect(Rundowns.findOne()).toBeFalsy()
		const rundownData: IngestRundown = {
			externalId: externalId,
			name: 'MyMockRundown',
			type: 'mock',
			// payload: {},
			segments: [
				{
					externalId: 'segment0',
					name: 'Segment 0',
					rank: 1,
					// payload?: any,
					parts: [
						{
							externalId: 'part0',
							name: 'Part 0',
							rank: 1,
							// payload?: any,
						},
						{
							externalId: 'part1',
							name: 'Part 1',
							rank: 2,
							// payload?: any,
						},
					],
				},
				{
					externalId: 'segment1',
					name: 'Segment 1',
					rank: 2,
					// payload?: any,
					parts: [
						{
							externalId: 'part2',
							name: 'Part 2',
							rank: 1,
							// payload?: any,
						},
					],
				},
			],
		}
		Meteor.call(PeripheralDeviceAPIMethods.dataRundownCreate, device._id, device.token, rundownData)

		const rundown = Rundowns.findOne() as Rundown
		expect(rundown).toBeTruthy()

		const part = Parts.findOne({ externalId: 'part1' }) as Part
		expect(part).toBeTruthy()

		const dynamicPartId: PartId = protectString('dynamic1')
		Parts.insert({
			_id: dynamicPartId,
			_rank: 999999,
			rundownId: rundown._id,
			segmentId: part.segmentId,
			externalId: '',
			title: 'Dynamic',
			dynamicallyInserted: true,
			afterPart: part._id,
		})
		expect(Parts.findOne(dynamicPartId)).toBeTruthy()

		// Let the logic generate the correct rank first
		wrapWithCacheForRundownPlaylistFromRundown(rundown._id, (cache) => {
			updatePartRanks(cache, rundown)
		})
		let dynamicPart = Parts.findOne(dynamicPartId) as Part
		expect(dynamicPart).toBeTruthy()
		expect(dynamicPart._rank).toEqual(1.5) // TODO - this value is bad

		// Update the rundown and it should have been removed
		Meteor.call(PeripheralDeviceAPIMethods.dataRundownUpdate, device._id, device.token, rundownData)

		dynamicPart = Parts.findOne(dynamicPartId) as Part
		expect(dynamicPart).toBeFalsy() // TODO - is this the desired behaviour
	})
	testInFiber('dataSegmentUpdate update dynamicInserted Part', () => {
		Rundowns.remove({})
		expect(Rundowns.findOne()).toBeFalsy()
		const rundownData: IngestRundown = {
			externalId: externalId,
			name: 'MyMockRundown',
			type: 'mock',
			// payload: {},
			segments: [
				{
					externalId: 'segment0',
					name: 'Segment 0',
					rank: 1,
					// payload?: any,
					parts: [
						{
							externalId: 'part0',
							name: 'Part 0',
							rank: 1,
							// payload?: any,
						},
						{
							externalId: 'part1',
							name: 'Part 1',
							rank: 2,
							// payload?: any,
						},
					],
				},
				{
					externalId: 'segment1',
					name: 'Segment 1',
					rank: 2,
					// payload?: any,
					parts: [
						{
							externalId: 'part2',
							name: 'Part 2',
							rank: 1,
							// payload?: any,
						},
					],
				},
			],
		}
		Meteor.call(PeripheralDeviceAPIMethods.dataRundownCreate, device._id, device.token, rundownData)

		const rundown = Rundowns.findOne() as Rundown
		expect(rundown).toBeTruthy()

		const part = Parts.findOne({ externalId: 'part1' }) as Part
		expect(part).toBeTruthy()

		Parts.insert({
			_id: protectString('dynamic0'),
			_rank: 999998,
			rundownId: rundown._id,
			segmentId: part.segmentId,
			externalId: '',
			title: 'Dynamic',
			dynamicallyInserted: true,
			afterPart: part._id,
		})
		Parts.insert({
			_id: protectString('dynamic1'),
			_rank: 999999,
			rundownId: rundown._id,
			segmentId: part.segmentId,
			externalId: '',
			title: 'Dynamic',
			dynamicallyInserted: true,
			afterPart: protectString('dynamic0'),
		})
		Parts.insert({
			_id: protectString('dynamic2'),
			_rank: 999999,
			rundownId: rundown._id,
			segmentId: part.segmentId,
			externalId: '',
			title: 'Dynamic',
			dynamicallyInserted: true,
			afterPart: part._id,
		})
		expect(Parts.findOne(protectString('dynamic0'))).toBeTruthy()
		expect(Parts.findOne(protectString('dynamic1'))).toBeTruthy()
		expect(Parts.findOne(protectString('dynamic2'))).toBeTruthy()

		// Let the logic generate the correct rank first
		wrapWithCacheForRundownPlaylistFromRundown(rundown._id, (cache) => {
			updatePartRanks(cache, rundown)
		})

		let part1 = Parts.findOne({ externalId: 'part1' }) as Part
		expect(part1._rank).toEqual(1)

		let dynamicPart0 = Parts.findOne(protectString('dynamic0')) as Part
		let dynamicPart1 = Parts.findOne(protectString('dynamic1')) as Part
		let dynamicPart2 = Parts.findOne(protectString('dynamic2')) as Part

		expect(dynamicPart0._rank).toBeGreaterThan(part1._rank)
		expect(dynamicPart1._rank).toBeGreaterThan(dynamicPart0._rank)
		expect(dynamicPart2._rank).toBeGreaterThan(dynamicPart1._rank)

		// Update the segment owning the part and it should remain
		const segmentData = rundownData.segments[0]
		Meteor.call(
			PeripheralDeviceAPIMethods.dataSegmentUpdate,
			device._id,
			device.token,
			rundownData.externalId,
			segmentData
		)
		const dynamicPart0New = Parts.findOne(protectString('dynamic0')) as Part
		expect(dynamicPart0New).toBeTruthy()

		// Change the rank of the part it belongs to and this rank should update
		segmentData.parts[0].rank = 5
		Meteor.call(
			PeripheralDeviceAPIMethods.dataSegmentUpdate,
			device._id,
			device.token,
			rundownData.externalId,
			segmentData
		)
		part1 = Parts.findOne({ externalId: 'part1' }) as Part
		expect(part1._rank).toEqual(0)
		let part0 = Parts.findOne({ externalId: 'part0' }) as Part
		expect(part0._rank).toEqual(1)
		dynamicPart0 = Parts.findOne(protectString('dynamic0')) as Part
		dynamicPart1 = Parts.findOne(protectString('dynamic1')) as Part
		dynamicPart2 = Parts.findOne(protectString('dynamic2')) as Part

		expect(dynamicPart0._rank).toBeGreaterThan(part1._rank)
		expect(dynamicPart1._rank).toBeGreaterThan(dynamicPart0._rank)
		expect(dynamicPart2._rank).toBeGreaterThan(dynamicPart1._rank)
		expect(part0._rank).toBeGreaterThan(dynamicPart2._rank)

		// // Invalidate the part it is set to be after, and it should be removed
		// segmentData.parts[0].rank = 0
		// Parts.update(dynamicPart0Id, { $set: { afterPart: 'not-a-real-part' } })
		// Meteor.call(PeripheralDeviceAPIMethods.dataSegmentUpdate, device._id, device.token, rundownData.externalId, segmentData)
		// dynamicPart0 = Parts.findOne(dynamicPart0Id) as Part
		// expect(dynamicPart0).toBeFalsy()
	})

	testInFiber('unsyncing of rundown', () => {
		// Cleanup any rundowns / playlists
		RundownPlaylists.find()
			.fetch()
			.forEach((playlist) =>
				wrapWithCacheForRundownPlaylist(playlist, (cache) => removeRundownPlaylistFromCache(cache, playlist))
			)

		const rundownData: IngestRundown = {
			externalId: externalId,
			name: 'MyMockRundown',
			type: 'mock',
			segments: [
				{
					externalId: 'segment0',
					name: 'Segment 0',
					rank: 0,
					parts: [
						{
							externalId: 'part0',
							name: 'Part 0',
							rank: 0,
						},
						{
							externalId: 'part1',
							name: 'Part 1',
							rank: 0,
						},
					],
				},
				{
					externalId: 'segment1',
					name: 'Segment 1',
					rank: 0,
					parts: [
						{
							externalId: 'part2',
							name: 'Part 2',
							rank: 0,
						},
					],
				},
			],
		}

		// Preparation: set up rundown
		expect(Rundowns.findOne()).toBeFalsy()
		Meteor.call(PeripheralDeviceAPIMethods.dataRundownCreate, device2._id, device2.token, rundownData)
		const rundown = Rundowns.findOne() as Rundown
		expect(rundown).toMatchObject({
			externalId: rundownData.externalId,
		})
		const playlist = rundown.getRundownPlaylist()
		expect(playlist).toBeTruthy()

		const getRundown = () => Rundowns.findOne(rundown._id) as Rundown
		const getPlaylist = () => rundown.getRundownPlaylist() as RundownPlaylist
		const resyncRundown = () => {
			try {
				ServerRundownAPI.resyncRundown(rundown._id)
			} catch (e) {
				if (e.toString().match(/does not support the method "reloadRundown"/)) {
					// This is expected
					return
				}
				throw e
			}
		}

		const segments = getRundown().getSegments()
		const parts = getRundown().getParts()

		expect(segments).toHaveLength(2)
		expect(parts).toHaveLength(3)

		// Activate the rundown, make data updates and verify that it gets unsynced properly
		ServerPlayoutAPI.activateRundownPlaylist(playlist._id, true)
		expect(getRundown().unsynced).toEqual(false)

		RundownInput.dataRundownDelete({}, device2._id, device2.token, rundownData.externalId)
		expect(getRundown().unsynced).toEqual(true)

		resyncRundown()
		expect(getRundown().unsynced).toEqual(false)

		ServerPlayoutAPI.takeNextPart(playlist._id)
		const partInstance = PartInstances.find({ 'part._id': parts[0]._id }).fetch()
		expect(partInstance).toHaveLength(1)
		expect(getPlaylist().currentPartInstanceId).toEqual(partInstance[0]._id)

		RundownInput.dataSegmentDelete({}, device2._id, device2.token, rundownData.externalId, segments[0].externalId)
		expect(getRundown().unsynced).toEqual(true)

		resyncRundown()
		expect(getRundown().unsynced).toEqual(false)

		RundownInput.dataPartDelete(
			{},
			device2._id,
			device2.token,
			rundownData.externalId,
			segments[0].externalId,
			parts[0].externalId
		)
		expect(getRundown().unsynced).toEqual(true)

		resyncRundown()
		expect(getRundown().unsynced).toEqual(false)
	})
})
