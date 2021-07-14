import { Meteor } from 'meteor/meteor'
import { Random } from 'meteor/random'
import '../../../__mocks__/_extendJest'
import { testInFiber } from '../../../__mocks__/helpers/jest'
import { setupDefaultStudioEnvironment, DefaultEnvironment } from '../../../__mocks__/helpers/database'
import { protectString, literal, unprotectString } from '../../../lib/lib'
import { PickerMock, parseResponseBuffer, MockResponseDataString } from '../../../__mocks__/meteorhacks-picker'
import { Response as MockResponse, Request as MockRequest } from 'mock-http'
import { RundownLayoutType, RundownLayouts, RundownLayout } from '../../../lib/collections/RundownLayouts'

require('../client') // include in order to create the Meteor methods needed
require('../rundownLayouts') // include in order to create the Meteor methods needed

enum RundownLayoutsAPIMethods { // Using our own method definition, to catch external API changes
	'removeRundownLayout' = 'rundownLayout.removeRundownLayout',
	'createRundownLayout' = 'rundownLayout.createRundownLayout',
}

describe('Rundown Layouts', () => {
	let env: DefaultEnvironment
	beforeAll(async () => {
		env = await setupDefaultStudioEnvironment()
	})
	let rundownLayoutId: string
	testInFiber('Create rundown layout', () => {
		const res = Meteor.call(
			RundownLayoutsAPIMethods.createRundownLayout,
			'Test',
			RundownLayoutType.RUNDOWN_LAYOUT,
			env.showStyleBaseId
		)
		expect(typeof res).toBe('string') // this should contain the ID for the rundown layout
		rundownLayoutId = res

		const item = RundownLayouts.findOne(protectString(rundownLayoutId))
		expect(item).toMatchObject({
			_id: rundownLayoutId,
		})
	})
	testInFiber('Remove rundown layout', () => {
		const item0 = RundownLayouts.findOne(protectString(rundownLayoutId))
		expect(item0).toMatchObject({
			_id: rundownLayoutId,
		})

		Meteor.call(RundownLayoutsAPIMethods.removeRundownLayout, rundownLayoutId)

		const item1 = RundownLayouts.findOne(protectString(rundownLayoutId))
		expect(item1).toBeUndefined()
	})

	describe('HTTP API', () => {
		function makeMockLayout(env: DefaultEnvironment) {
			const rundownLayoutId = Random.id()
			const mockLayout = literal<RundownLayout>({
				_id: protectString(rundownLayoutId),
				name: 'MOCK LAYOUT',
				filters: [],
				showStyleBaseId: env.showStyleBaseId,
				type: RundownLayoutType.RUNDOWN_LAYOUT,
				exposeAsShelf: false,
				exposeAsStandalone: false,
				icon: '',
				iconColor: '',
				openByDefault: false,
			})
			return { rundownLayout: mockLayout, rundownLayoutId }
		}

		testInFiber('download shelf layout', () => {
			const { rundownLayout: mockLayout, rundownLayoutId } = makeMockLayout(env)
			RundownLayouts.insert(mockLayout)

			const routeName = '/shelfLayouts/download/:id'
			const route = PickerMock.mockRoutes[routeName]
			expect(route).toBeTruthy()

			{
				const fakeId = 'FAKE_ID'
				const res = new MockResponse()
				const req = new MockRequest({
					method: 'GET',
					url: `/shelfLayouts/download/${fakeId}`,
				})

				route.handler({ id: fakeId }, req, res, jest.fn())

				const resStr = parseResponseBuffer(res)
				expect(resStr).toMatchObject(
					literal<Partial<MockResponseDataString>>({
						statusCode: 404,
						timedout: false,
						ended: true,
					})
				)
				expect(resStr.bufferStr).toContain('not found')
			}

			{
				const res = new MockResponse()
				const req = new MockRequest({
					method: 'GET',
					url: `/shelfLayouts/download/${rundownLayoutId}`,
				})

				route.handler({ id: rundownLayoutId }, req, res, jest.fn())

				const resStr = parseResponseBuffer(res)
				expect(resStr).toMatchObject(
					literal<Partial<MockResponseDataString>>({
						statusCode: 200,
						headers: {
							'content-type': 'application/json',
						},
						timedout: false,
						ended: true,
					})
				)

				const layout = JSON.parse(resStr.bufferStr)
				expect(layout).toMatchObject(mockLayout)
			}
		})

		testInFiber('upload shelf layout', () => {
			const { rundownLayout: mockLayout } = makeMockLayout(env)
			const routeName = '/shelfLayouts/upload/:showStyleBaseId'
			const route = PickerMock.mockRoutes[routeName]
			expect(route).toBeTruthy()

			{
				// try to upload to a non-existent showStyleBase
				const fakeId = 'FAKE_ID'
				const res = new MockResponse()
				const req = new MockRequest({
					method: 'POST',
					url: `/shelfLayouts/upload/${fakeId}`,
				})
				req.body = JSON.stringify(mockLayout)

				route.handler({ showStyleBaseId: fakeId }, req, res, jest.fn())

				const resStr = parseResponseBuffer(res)
				expect(resStr).toMatchObject(
					literal<Partial<MockResponseDataString>>({
						statusCode: 500,
						timedout: false,
						ended: true,
					})
				)
				expect(resStr.bufferStr).toContain('not found')
			}

			{
				// try not to send a request body
				const res = new MockResponse()
				const req = new MockRequest({
					method: 'POST',
					url: `/shelfLayouts/upload/${env.showStyleBaseId}`,
				})

				route.handler({ showStyleBaseId: unprotectString(env.showStyleBaseId) }, req, res, jest.fn())

				const resStr = parseResponseBuffer(res)
				expect(resStr).toMatchObject(
					literal<Partial<MockResponseDataString>>({
						statusCode: 500,
						timedout: false,
						ended: true,
					})
				)
				expect(resStr.bufferStr).toContain('body')
			}

			{
				// try to send too short a body
				const res = new MockResponse()
				const req = new MockRequest({
					method: 'POST',
					url: `/shelfLayouts/upload/${env.showStyleBaseId}`,
				})
				req.body = 'sdf'

				route.handler({ showStyleBaseId: unprotectString(env.showStyleBaseId) }, req, res, jest.fn())

				const resStr = parseResponseBuffer(res)
				expect(resStr).toMatchObject(
					literal<Partial<MockResponseDataString>>({
						statusCode: 500,
						timedout: false,
						ended: true,
					})
				)
				expect(resStr.bufferStr).toContain('body')
			}

			{
				// try to send a malformed body
				const res = new MockResponse()
				const req = new MockRequest({
					method: 'POST',
					url: `/shelfLayouts/upload/${env.showStyleBaseId}`,
				})
				req.body = '{ type: dsfgsdfgsdf gsdfgsdfg sdfgsdfg sdf gsdfgsdfg sdfg }'

				route.handler({ showStyleBaseId: unprotectString(env.showStyleBaseId) }, req, res, jest.fn())

				const resStr = parseResponseBuffer(res)
				expect(resStr).toMatchObject(
					literal<Partial<MockResponseDataString>>({
						statusCode: 500,
						timedout: false,
						ended: true,
					})
				)
				expect(resStr.bufferStr).toContain('SyntaxError')
			}

			{
				const res = new MockResponse()
				const req = new MockRequest({
					method: 'POST',
					url: `/shelfLayouts/upload/${env.showStyleBaseId}`,
				})
				req.body = JSON.stringify(mockLayout)

				route.handler({ showStyleBaseId: unprotectString(env.showStyleBaseId) }, req, res, jest.fn())

				const resStr = parseResponseBuffer(res)
				expect(resStr).toMatchObject(
					literal<Partial<MockResponseDataString>>({
						statusCode: 200,
						timedout: false,
						ended: true,
					})
				)

				expect(RundownLayouts.findOne(mockLayout._id)).toBeTruthy()
			}
		})
	})
})
