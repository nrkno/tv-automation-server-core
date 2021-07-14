import { setupDefaultStudioEnvironment, setupMockStudio } from '../../../../__mocks__/helpers/database'
import { getHash, protectString, unprotectString } from '../../../../lib/lib'
import { Studio } from '../../../../lib/collections/Studios'
import {
	LookaheadMode,
	TSR,
	ConfigManifestEntryType,
	BlueprintManifestType,
	ConfigManifestEntry,
	SomeBlueprintManifest,
} from '@sofie-automation/blueprints-integration'
import { CommonContext, StudioContext, ShowStyleContext } from '../context'
import { ConfigRef } from '../config'
import { ShowStyleBase, ShowStyleBases } from '../../../../lib/collections/ShowStyleBases'
import { ShowStyleCompound, ShowStyleVariant, ShowStyleVariants } from '../../../../lib/collections/ShowStyleVariants'
import { RundownId } from '../../../../lib/collections/Rundowns'
import { SegmentId } from '../../../../lib/collections/Segments'
import { testInFiber } from '../../../../__mocks__/helpers/jest'
import { Blueprints } from '../../../../lib/collections/Blueprints'
import { generateFakeBlueprint } from './lib'
import { createShowStyleCompound } from '../../showStyles'

describe('Test blueprint api context', () => {
	beforeAll(async () => {
		await setupDefaultStudioEnvironment()
	})

	describe('CommonContext', () => {
		testInFiber('no param', () => {
			const context = new CommonContext({ name: 'name', identifier: 'pre' })

			const res = context.getHashId(undefined as any)
			expect(res).toEqual(getHash('pre_hash0'))
			expect(context.unhashId(res)).toEqual('hash0')
		})
		testInFiber('no param + notUnique', () => {
			const context = new CommonContext({ name: 'name', identifier: 'pre' })

			const res = context.getHashId(undefined as any, true)
			expect(res).toEqual(getHash('pre_hash0_1'))
			expect(context.unhashId(res)).toEqual('hash0_1')
		})
		testInFiber('empty param', () => {
			const context = new CommonContext({ name: 'name', identifier: 'pre' })

			const res = context.getHashId('')
			expect(res).toEqual(getHash('pre_hash0'))
			expect(context.unhashId(res)).toEqual('hash0')

			const res2 = context.getHashId('')
			expect(res2).toEqual(getHash('pre_hash1'))
			expect(context.unhashId(res2)).toEqual('hash1')

			expect(res2).not.toEqual(res)
		})
		testInFiber('string', () => {
			const context = new CommonContext({ name: 'name', identifier: 'pre' })

			const res = context.getHashId('something')
			expect(res).toEqual(getHash('pre_something'))
			expect(context.unhashId(res)).toEqual('something')

			const res2 = context.getHashId('something')
			expect(res2).toEqual(getHash('pre_something'))
			expect(context.unhashId(res2)).toEqual('something')

			expect(res2).toEqual(res)
		})
		testInFiber('string + notUnique', () => {
			const context = new CommonContext({ name: 'name', identifier: 'pre' })

			const res = context.getHashId('something', true)
			expect(res).toEqual(getHash('pre_something_0'))
			expect(context.unhashId(res)).toEqual('something_0')

			const res2 = context.getHashId('something', true)
			expect(res2).toEqual(getHash('pre_something_1'))
			expect(context.unhashId(res2)).toEqual('something_1')

			expect(res2).not.toEqual(res)
		})
	})

	describe('StudioContext', () => {
		function mockStudio() {
			const manifest = () => ({
				blueprintType: 'studio' as BlueprintManifestType.STUDIO,
				blueprintVersion: '0.0.0',
				integrationVersion: '0.0.0',
				TSRVersion: '0.0.0',

				studioConfigManifest: [
					{
						id: 'abc',
						name: '',
						description: '',
						type: 'boolean' as ConfigManifestEntryType.BOOLEAN,
						defaultVal: false,
						required: false,
					},
					{
						id: '123',
						name: '',
						description: '',
						type: 'string' as ConfigManifestEntryType.STRING,
						defaultVal: '',
						required: false,
					},
				] as ConfigManifestEntry[],

				studioMigrations: [],
				getBaseline: () => {
					return {
						timelineObjects: [],
					}
				},
				getShowStyleId: () => null,
			})
			const blueprint = generateFakeBlueprint('', BlueprintManifestType.STUDIO, manifest)
			return setupMockStudio({
				settings: {
					sofieUrl: 'testUrl',
					mediaPreviewsUrl: '',
				},
				mappings: {
					abc: {
						deviceId: protectString('abc'),
						device: TSR.DeviceType.ABSTRACT,
						lookahead: LookaheadMode.PRELOAD,
					},
				},
				blueprintConfig: { abc: true, '123': 'val2', notInManifest: 'val3' },
				blueprintId: Blueprints.insert(blueprint),
			})
		}

		testInFiber('getStudio', () => {
			const studio = mockStudio()
			const context = new StudioContext({ name: 'studio', identifier: unprotectString(studio._id) }, studio)

			expect(context.studio).toEqual(studio)
		})
		testInFiber('getStudioConfig', () => {
			const studio = mockStudio()
			const context = new StudioContext({ name: 'studio', identifier: unprotectString(studio._id) }, studio)

			expect(context.getStudioConfig()).toEqual({
				SofieHostURL: 'testUrl', // Injected
				abc: true,
				'123': 'val2',
			})
		})
		testInFiber('getStudioConfigRef', () => {
			const studio = mockStudio()
			const context = new StudioContext({ name: 'studio', identifier: unprotectString(studio._id) }, studio)

			const getStudioConfigRef = jest.spyOn(ConfigRef, 'getStudioConfigRef')
			getStudioConfigRef.mockImplementation(() => {
				return 'configVal1'
			})

			try {
				expect(context.getStudioConfigRef('conf1')).toEqual('configVal1')

				expect(getStudioConfigRef).toHaveBeenCalledTimes(1)
				expect(getStudioConfigRef).toHaveBeenCalledWith(studio._id, 'conf1')
			} finally {
				getStudioConfigRef.mockRestore()
			}
		})

		testInFiber('getStudioMappings', () => {
			const studio = mockStudio()
			const context = new StudioContext({ name: 'studio', identifier: unprotectString(studio._id) }, studio)

			expect(context.getStudioMappings()).toEqual({
				abc: {
					deviceId: 'abc',
					device: TSR.DeviceType.ABSTRACT,
					lookahead: LookaheadMode.PRELOAD,
				},
			})
		})
	})

	describe('ShowStyleContext', () => {
		function mockStudio() {
			return setupMockStudio({
				mappings: {
					abc: {
						deviceId: protectString('abc'),
						device: TSR.DeviceType.ABSTRACT,
						lookahead: LookaheadMode.PRELOAD,
					},
				},
			})
		}

		function getContext(studio: Studio, contextName?: string, rundownId?: RundownId, segmentId?: SegmentId) {
			const showStyleVariant = ShowStyleVariants.findOne() as ShowStyleVariant
			expect(showStyleVariant).toBeTruthy()

			const manifest = () => ({
				blueprintType: 'showstyle' as BlueprintManifestType.SHOWSTYLE,
				blueprintVersion: '0.0.0',
				integrationVersion: '0.0.0',
				TSRVersion: '0.0.0',

				showStyleConfigManifest: [
					{
						id: 'one',
						name: '',
						description: '',
						type: 'boolean' as ConfigManifestEntryType.BOOLEAN,
						defaultVal: false,
						required: false,
					},
					{
						id: 'two',
						name: '',
						description: '',
						type: 'string' as ConfigManifestEntryType.STRING,
						defaultVal: '',
						required: false,
					},
					{
						id: 'three',
						name: '',
						description: '',
						type: 'number' as ConfigManifestEntryType.NUMBER,
						defaultVal: 0,
						required: false,
					},
					{
						id: 'four.a',
						name: '',
						description: '',
						type: 'string' as ConfigManifestEntryType.STRING,
						defaultVal: '',
						required: false,
					},
					{
						id: 'four.b',
						name: '',
						description: '',
						type: 'table' as ConfigManifestEntryType.TABLE,
						defaultVal: [],
						required: false,
						columns: [
							{
								id: 'x',
								name: '',
								description: '',
								type: 'number' as ConfigManifestEntryType.NUMBER,
								required: false,
								defaultVal: 0,
								rank: 0,
							},
						],
					},
					{
						id: 'four.c',
						name: '',
						description: '',
						type: 'number' as ConfigManifestEntryType.NUMBER,
						defaultVal: 0,
						required: false,
					},
				] as ConfigManifestEntry[],
				showStyleMigrations: [],
				getRundown: () => null,
				getSegment: () => null,
				getShowStyleVariantId: () => null,
			})
			const showStyleBase = ShowStyleBases.findOne() as ShowStyleBase
			expect(showStyleBase).toBeTruthy()
			const blueprint = generateFakeBlueprint(
				unprotectString(showStyleBase.blueprintId),
				BlueprintManifestType.SHOWSTYLE,
				manifest as any as () => SomeBlueprintManifest
			)
			Blueprints.update(blueprint._id, blueprint)

			const showStyleCompund = createShowStyleCompound(showStyleBase, showStyleVariant) as ShowStyleCompound
			expect(showStyleCompund).toBeTruthy()

			return new ShowStyleContext(
				{
					name: contextName || 'N/A',
					identifier: `rundownId=${rundownId},segmentId=${segmentId}`,
				},
				studio,
				showStyleCompund
			)
		}

		testInFiber('getShowStyleConfig', () => {
			const studio = mockStudio()
			const context = getContext(studio)

			// Set some config
			ShowStyleVariants.update(context.showStyleCompound.showStyleVariantId, {
				$set: {
					blueprintConfig: {
						one: true,
						two: 'val2',
						four: {
							a: 'abc',
							b: [
								{ _id: '0', x: 789 },
								{ _id: '1', x: 567 },
							],
						},
					},
				},
			})
			ShowStyleBases.update(context.showStyleCompound._id, {
				$set: {
					blueprintConfig: {
						two: 'default',
						three: 765,
						four: {
							a: 'xyz',
							b: [
								{ _id: '0', x: 123 },
								{ _id: '1', x: 456 },
								{ _id: '2', x: 789 },
							],
							c: 1234,
						},
					},
				},
			})

			const context2 = getContext(studio)
			expect(context2.getShowStyleConfig()).toEqual({
				one: true,
				two: 'val2',
				three: 765,
				four: {
					a: 'abc',
					b: [
						{ _id: '0', x: 789 },
						{ _id: '1', x: 567 },
					],
					c: 1234,
				},
			})
		})

		testInFiber('getShowStyleConfigRef', () => {
			const studio = mockStudio()
			const context = getContext(studio)

			const getShowStyleConfigRef = jest.spyOn(ConfigRef, 'getShowStyleConfigRef')
			getShowStyleConfigRef.mockImplementation(() => {
				return 'configVal1'
			})

			try {
				expect(context.getShowStyleConfigRef('conf1')).toEqual('configVal1')

				expect(getShowStyleConfigRef).toHaveBeenCalledTimes(1)
				expect(getShowStyleConfigRef).toHaveBeenCalledWith(
					context.showStyleCompound.showStyleVariantId,
					'conf1'
				)
			} finally {
				getShowStyleConfigRef.mockRestore()
			}
		})
	})

	describe('SegmentUserContext', () => {
		// TODO?
	})
})
