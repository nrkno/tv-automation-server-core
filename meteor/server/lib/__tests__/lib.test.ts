import { TSR } from '@sofie-automation/blueprints-integration'
import { TimelineObjGeneric, TimelineObjType, TimelineComplete, Timeline } from '../../../lib/collections/Timeline'
import { protectString } from '../../../lib/lib'
import { testInFiber } from '../../../__mocks__/helpers/jest'
import { SaveIntoDbHooks, saveIntoDb, sumChanges, anythingChanged } from '../database'

describe('server/lib', () => {
	testInFiber('saveIntoDb', async () => {
		const mystudioObjs: Array<TimelineObjGeneric> = [
			{
				id: 'abc',
				enable: {
					start: 0,
				},
				layer: 'L1',
				content: { deviceType: TSR.DeviceType.ABSTRACT },
				objectType: TimelineObjType.RUNDOWN,
				classes: ['abc'], // to be removed
			},
			{
				id: 'abc2',
				enable: {
					start: 0,
				},
				layer: 'L1',
				content: { deviceType: TSR.DeviceType.ABSTRACT },
				objectType: TimelineObjType.RUNDOWN,
			},
		]
		Timeline.insert({
			_id: protectString('myStudio'),
			timelineHash: protectString('abc'),
			generated: 1234,
			timeline: mystudioObjs,
		})

		const mystudio2Objs: Array<TimelineObjGeneric> = [
			{
				id: 'abc10',
				enable: {
					start: 0,
				},
				layer: 'L1',
				content: { deviceType: TSR.DeviceType.ABSTRACT },
				objectType: TimelineObjType.RUNDOWN,
			},
		]
		Timeline.insert({
			_id: protectString('myStudio2'),
			timelineHash: protectString('abc'),
			generated: 1234,
			timeline: mystudio2Objs,
		})

		const options: SaveIntoDbHooks<any, any> = {
			beforeInsert: jest.fn((o) => o),
			beforeUpdate: jest.fn((o) => o),
			beforeRemove: jest.fn((o) => o),
			beforeDiff: jest.fn((o) => o),
			// insert: jest.fn((o) => o),
			// update: jest.fn((id, o,) => { return undefined }),
			// remove: jest.fn((o) => { return undefined }),
			afterInsert: jest.fn((_o) => {
				return undefined
			}),
			afterUpdate: jest.fn((_o) => {
				return undefined
			}),
			afterRemove: jest.fn((_o) => {
				return undefined
			}),
		}

		const changes = await saveIntoDb(
			Timeline,
			{
				_id: protectString('myStudio'),
			},
			[
				{
					_id: protectString('myStudio'),
					timeline: [
						{
							id: 'abc',
							enable: {
								start: 0,
							},
							layer: 'L2', // changed property
							content: { deviceType: TSR.DeviceType.ABSTRACT },
							studioId: protectString('myStudio'),
						},
						{
							// insert object
							id: 'abc3',
							enable: {
								start: 0,
							},
							layer: 'L1',
							content: { deviceType: TSR.DeviceType.ABSTRACT },
							objectType: TimelineObjType.RUNDOWN,
						}, // remove abc2
					],
				},
			],
			options
		)

		expect(
			Timeline.find({
				_id: protectString('myStudio'),
			}).count()
		).toEqual(1)
		const abc = Timeline.findOne(protectString('myStudio')) as TimelineComplete
		expect(abc).toBeTruthy()
		expect(abc.timeline).toHaveLength(2)
		expect(abc.timeline[0].classes).toEqual(undefined)
		expect(abc.timeline[0].layer).toEqual('L2')

		expect(
			Timeline.find({
				_id: protectString('myStudio2'),
			}).count()
		).toEqual(1)

		// expect(options.beforeInsert).toHaveBeenCalledTimes(1) - overwrites with single timeline object
		expect(options.beforeUpdate).toHaveBeenCalledTimes(1)
		// expect(options.beforeRemove).toHaveBeenCalledTimes(1) - overwrites with single timeline object
		expect(options.beforeDiff).toHaveBeenCalledTimes(1)
		// expect(options.insert).toHaveBeenCalledTimes(1)
		// expect(options.update).toHaveBeenCalledTimes(1)
		// expect(options.remove).toHaveBeenCalledTimes(1)
		// expect(options.afterInsert).toHaveBeenCalledTimes(1)
		expect(options.afterUpdate).toHaveBeenCalledTimes(1)
		// expect(options.afterRemove).toHaveBeenCalledTimes(1)

		expect(changes).toMatchObject({
			updated: 1,
		})
		expect(
			sumChanges(
				{
					added: 1,
					updated: 2,
					removed: 3,
				},
				changes
			)
		).toMatchObject({
			added: 1,
			updated: 3,
			removed: 3,
		})
	})
	testInFiber('anythingChanged', () => {
		expect(
			anythingChanged({
				added: 0,
				updated: 0,
				removed: 0,
			})
		).toBeFalsy()
		expect(
			anythingChanged({
				added: 1,
				updated: 0,
				removed: 0,
			})
		).toBeTruthy()
		expect(
			anythingChanged({
				added: 0,
				updated: 9,
				removed: 0,
			})
		).toBeTruthy()
		expect(
			anythingChanged({
				added: 0,
				updated: 0,
				removed: 547,
			})
		).toBeTruthy()
	})
})
