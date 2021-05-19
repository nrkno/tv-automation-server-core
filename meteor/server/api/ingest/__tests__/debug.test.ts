import { Meteor } from 'meteor/meteor'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { setupDefaultStudioEnvironment } from '../../../../__mocks__/helpers/database'
import { Rundowns, Rundown } from '../../../../lib/collections/Rundowns'
import { PeripheralDevice } from '../../../../lib/collections/PeripheralDevices'
import { testInFiber } from '../../../../__mocks__/helpers/jest'
import { Segments } from '../../../../lib/collections/Segments'
import { Parts } from '../../../../lib/collections/Parts'
import { IngestRundown } from '@sofie-automation/blueprints-integration'
import { RundownPlaylists, RundownPlaylist } from '../../../../lib/collections/RundownPlaylists'

require('../../peripheralDevice.ts') // include in order to create the Meteor methods needed
require('../debug.ts') // include in order to create the Meteor methods needed

describe('Test ingest actions for rundowns and segments', () => {
	let device: PeripheralDevice
	let externalId = 'abcde'
	beforeAll(() => {
		device = setupDefaultStudioEnvironment().ingestDevice
	})

	testInFiber('dataRundownCreate', () => {
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
					],
				},
			],
		}

		Meteor.call(PeripheralDeviceAPI.methods.dataRundownCreate, device._id, device.token, rundownData)

		const rundown = Rundowns.findOne() as Rundown
		expect(rundown).toMatchObject({
			externalId: rundownData.externalId,
		})
		const playlist = RundownPlaylists.findOne() as RundownPlaylist
		expect(playlist).toMatchObject({
			externalId: rundown._id,
			_id: rundown.playlistId,
		})

		// Remove the parts to make it explicit that the blueprints rerun properly
		Segments.remove({ rundownId: rundown._id })
		Parts.remove({ rundownId: rundown._id })

		Meteor.call('debug_playlistRunBlueprints', playlist._id, false)

		// Ensure they were recreated
		expect(Segments.find({ rundownId: rundown._id }).count()).not.toEqual(0)
		expect(Parts.find({ rundownId: rundown._id }).count()).not.toEqual(0)
	})
})
