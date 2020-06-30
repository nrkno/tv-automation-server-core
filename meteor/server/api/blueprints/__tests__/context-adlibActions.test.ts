import * as _ from 'underscore'
import {
	setupDefaultStudioEnvironment,
	setupMockStudio,
	setupDefaultRundown,
	DefaultEnvironment,
	setupDefaultRundownPlaylist,
} from '../../../../__mocks__/helpers/database'
import {
	getHash,
	literal,
	protectString,
	unprotectObject,
	unprotectString,
	waitForPromise,
	getRandomId,
	getCurrentTime,
} from '../../../../lib/lib'
import { Studio } from '../../../../lib/collections/Studios'
import {
	LookaheadMode,
	NotesContext as INotesContext,
	IBlueprintPart,
	IBlueprintPartDB,
	IBlueprintAsRunLogEventContent,
	IBlueprintSegment,
	IBlueprintSegmentDB,
	IBlueprintPieceDB,
	TSR,
	IBlueprintPartInstance,
	IBlueprintPieceInstance,
	IBlueprintPiece,
} from 'tv-automation-sofie-blueprints-integration'
import {
	CommonContext,
	StudioConfigContext,
	StudioContext,
	ShowStyleContext,
	NotesContext,
	SegmentContext,
	PartEventContext,
	AsRunEventContext,
	ActionExecutionContext,
	ActionPartChange,
} from '../context'
import { ConfigRef } from '../config'
import { ShowStyleBases } from '../../../../lib/collections/ShowStyleBases'
import { ShowStyleVariant, ShowStyleVariants } from '../../../../lib/collections/ShowStyleVariants'
import { Rundowns, Rundown, RundownId } from '../../../../lib/collections/Rundowns'
import { DBPart, PartId } from '../../../../lib/collections/Parts'
import { AsRunLogEvent, AsRunLog } from '../../../../lib/collections/AsRunLog'
import { IngestDataCache, IngestCacheType } from '../../../../lib/collections/IngestDataCache'
import { Pieces } from '../../../../lib/collections/Pieces'
import {
	wrapPartToTemporaryInstance,
	PartInstance,
	PartInstances,
	unprotectPartInstance,
	PartInstanceId,
} from '../../../../lib/collections/PartInstances'
import {
	PieceInstances,
	PieceInstance,
	ResolvedPieceInstance,
	PieceInstanceId,
} from '../../../../lib/collections/PieceInstances'
import { SegmentId } from '../../../../lib/collections/Segments'
import { initCacheForRundownPlaylist, CacheForRundownPlaylist } from '../../../DatabaseCaches'
import { RundownPlaylist, RundownPlaylists } from '../../../../lib/collections/RundownPlaylists'
import { testInFiber } from '../../../../__mocks__/helpers/jest'
import { RundownAPI } from '../../../../lib/api/rundown'

import { ServerPlayoutAdLibAPI } from '../../playout/adlib'
ServerPlayoutAdLibAPI.innerStopPieces = jest.fn()
type TinnerStopPieces = jest.MockedFunction<typeof ServerPlayoutAdLibAPI.innerStopPieces>
const innerStopPiecesMock = ServerPlayoutAdLibAPI.innerStopPieces as TinnerStopPieces

const innerStartAdLibPieceOrig = ServerPlayoutAdLibAPI.innerStartAdLibPiece
ServerPlayoutAdLibAPI.innerStartAdLibPiece = jest.fn()
type TinnerStartAdLibPiece = jest.MockedFunction<typeof ServerPlayoutAdLibAPI.innerStartAdLibPiece>
const innerStartAdLibPieceMock = ServerPlayoutAdLibAPI.innerStartAdLibPiece as TinnerStartAdLibPiece

const innerStartQueuedAdLibOrig = ServerPlayoutAdLibAPI.innerStartQueuedAdLib
ServerPlayoutAdLibAPI.innerStartQueuedAdLib = jest.fn()
type TinnerStartQueuedAdLib = jest.MockedFunction<typeof ServerPlayoutAdLibAPI.innerStartQueuedAdLib>
const innerStartQueuedAdLibMock = ServerPlayoutAdLibAPI.innerStartQueuedAdLib as TinnerStartQueuedAdLib

jest.mock('../../playout/pieces')
import { getResolvedPieces } from '../../playout/pieces'
type TgetResolvedPieces = jest.MockedFunction<typeof getResolvedPieces>
const getResolvedPiecesMock = getResolvedPieces as TgetResolvedPieces

jest.mock('../postProcess')
import { postProcessPieces } from '../postProcess'
import { isTooCloseToAutonext } from '../../playout/lib'
type TpostProcessPieces = jest.MockedFunction<typeof postProcessPieces>
const postProcessPiecesMock = postProcessPieces as TpostProcessPieces
postProcessPiecesMock.mockImplementation(() => [])
const { postProcessPieces: postProcessPiecesOrig } = jest.requireActual('../postProcess')

describe('Test blueprint api context', () => {
	function generateSparsePieceInstances(rundown: Rundown, cache: CacheForRundownPlaylist) {
		_.each(rundown.getParts(), (part, i) => {
			// make into a partInstance
			cache.PartInstances.insert({
				_id: protectString(`${part._id}_instance`),
				rundownId: part.rundownId,
				segmentId: part.segmentId,
				takeCount: i,
				rehearsal: false,
				part,
			})

			const count = ((i + 2) % 4) + 1 // Some consistent randomness
			for (let i = 0; i < count; i++) {
				cache.PieceInstances.insert({
					_id: protectString(`${part._id}_piece${i}`),
					rundownId: rundown._id,
					partInstanceId: protectString(`${part._id}_instance`),
					piece: {
						_id: protectString(`${part._id}_piece_inner${i}`),
						rundownId: rundown._id,
						partId: part._id,
						content: {
							index: i,
						},
					},
				} as any)
			}
		})
	}

	let env: DefaultEnvironment
	beforeAll(() => {
		env = setupDefaultStudioEnvironment()
	})

	function getActionExecutionContext() {
		const defaultSetup = setupDefaultRundownPlaylist(env)
		const tmpPlaylist = RundownPlaylists.findOne(defaultSetup.playlistId) as RundownPlaylist
		expect(tmpPlaylist).toBeTruthy()

		const cache = waitForPromise(initCacheForRundownPlaylist(tmpPlaylist))
		const playlist = cache.RundownPlaylists.findOne(defaultSetup.playlistId) as RundownPlaylist
		expect(playlist).toBeTruthy()
		const rundown = cache.Rundowns.findOne(defaultSetup.rundownId) as Rundown
		expect(rundown).toBeTruthy()

		const studio = cache.Studios.findOne(rundown.studioId) as Studio
		expect(studio).toBeTruthy()

		// Generate some instances for the rundown
		generateSparsePieceInstances(rundown, cache)

		const notesContext = new NotesContext('fakeContext', `fakeContext`, true)
		const context = new ActionExecutionContext(cache, notesContext, studio, playlist, rundown)
		expect(context.getStudio()).toBeTruthy()

		return {
			defaultSetup,
			cache,
			playlist,
			rundown,
			notesContext,
			context,
		}
	}

	describe('ActionExecutionContext', () => {
		describe('getPartInstance', () => {
			testInFiber('invalid parameters', () => {
				const { context } = getActionExecutionContext()

				// @ts-ignore
				expect(() => context.getPartInstance()).toThrowError('Unknown part "undefined"')
				// @ts-ignore
				expect(() => context.getPartInstance('abc')).toThrowError('Unknown part "abc"')
				// @ts-ignore
				expect(() => context.getPartInstance(6)).toThrowError('Unknown part "6"')
				// @ts-ignore
				expect(() => context.getPartInstance('previous')).toThrowError('Unknown part "previous"')
			})

			testInFiber('valid parameters', () => {
				const { context, cache, playlist } = getActionExecutionContext()

				const partInstanceIds = cache.PartInstances.findFetch({}).map((pi) => pi._id)
				expect(partInstanceIds).toHaveLength(5)

				expect(context.getPartInstance('next')).toBeUndefined()
				expect(context.getPartInstance('current')).toBeUndefined()

				// Check the current part
				playlist.currentPartInstanceId = partInstanceIds[1]
				expect(context.getPartInstance('next')).toBeUndefined()
				expect(context.getPartInstance('current')).toMatchObject({ _id: partInstanceIds[1] })

				// Now the next part
				playlist.currentPartInstanceId = null
				playlist.nextPartInstanceId = partInstanceIds[2]
				expect(context.getPartInstance('next')).toMatchObject({ _id: partInstanceIds[2] })
				expect(context.getPartInstance('current')).toBeUndefined()
			})
		})
		describe('getPieceInstances', () => {
			testInFiber('invalid parameters', () => {
				const { context } = getActionExecutionContext()

				// @ts-ignore
				expect(() => context.getPieceInstances()).toThrowError('Unknown part "undefined"')
				// @ts-ignore
				expect(() => context.getPieceInstances('abc')).toThrowError('Unknown part "abc"')
				// @ts-ignore
				expect(() => context.getPieceInstances(6)).toThrowError('Unknown part "6"')
				// @ts-ignore
				expect(() => context.getPieceInstances('previous')).toThrowError('Unknown part "previous"')
			})

			testInFiber('valid parameters', () => {
				const { context, cache, playlist } = getActionExecutionContext()

				const partInstanceIds = cache.PartInstances.findFetch({}).map((pi) => pi._id)
				expect(partInstanceIds).toHaveLength(5)

				expect(context.getPieceInstances('next')).toHaveLength(0)
				expect(context.getPieceInstances('current')).toHaveLength(0)

				// Check the current part
				playlist.currentPartInstanceId = partInstanceIds[1]
				expect(context.getPieceInstances('next')).toHaveLength(0)
				expect(context.getPieceInstances('current')).toHaveLength(4)

				// Now the next part
				playlist.currentPartInstanceId = null
				playlist.nextPartInstanceId = partInstanceIds[2]
				expect(context.getPieceInstances('next')).toHaveLength(1)
				expect(context.getPieceInstances('current')).toHaveLength(0)
			})
		})
		describe('getResolvedPieceInstances', () => {
			testInFiber('invalid parameters', () => {
				const { context } = getActionExecutionContext()

				// @ts-ignore
				expect(() => context.getResolvedPieceInstances()).toThrowError('Unknown part "undefined"')
				// @ts-ignore
				expect(() => context.getResolvedPieceInstances('abc')).toThrowError('Unknown part "abc"')
				// @ts-ignore
				expect(() => context.getResolvedPieceInstances(6)).toThrowError('Unknown part "6"')
				// @ts-ignore
				expect(() => context.getResolvedPieceInstances('previous')).toThrowError('Unknown part "previous"')
			})

			testInFiber('valid parameters', () => {
				const { context, cache, playlist } = getActionExecutionContext()

				const partInstanceIds = cache.PartInstances.findFetch({}).map((pi) => pi._id)
				expect(partInstanceIds).toHaveLength(5)

				expect(getResolvedPiecesMock).toHaveBeenCalledTimes(0)

				expect(context.getResolvedPieceInstances('next')).toHaveLength(0)
				expect(context.getResolvedPieceInstances('current')).toHaveLength(0)
				expect(getResolvedPiecesMock).toHaveBeenCalledTimes(0)

				let mockCalledIds: PartInstanceId[] = []
				getResolvedPiecesMock.mockImplementation(
					(cache2: CacheForRundownPlaylist, partInstance: PartInstance) => {
						expect(cache2).toBe(cache)
						mockCalledIds.push(partInstance._id)
						return (['abc'] as any) as ResolvedPieceInstance[]
					}
				)

				// Check the current part
				playlist.currentPartInstanceId = partInstanceIds[1]
				expect(context.getResolvedPieceInstances('next')).toHaveLength(0)
				expect(context.getResolvedPieceInstances('current')).toEqual(['abc'])
				expect(getResolvedPiecesMock).toHaveBeenCalledTimes(1)
				expect(mockCalledIds).toEqual([partInstanceIds[1]])

				mockCalledIds = []
				getResolvedPiecesMock.mockClear()

				// Now the next part
				playlist.currentPartInstanceId = null
				playlist.nextPartInstanceId = partInstanceIds[2]
				expect(context.getResolvedPieceInstances('next')).toEqual(['abc'])
				expect(context.getResolvedPieceInstances('current')).toHaveLength(0)
				expect(getResolvedPiecesMock).toHaveBeenCalledTimes(1)
				expect(mockCalledIds).toEqual([partInstanceIds[2]])
			})
		})

		describe('findLastPieceOnLayer', () => {
			testInFiber('invalid parameters', () => {
				const { context, cache } = getActionExecutionContext()

				// We need to push changes back to 'mongo' for these tests
				waitForPromise(cache.saveAllToDatabase())

				// @ts-ignore
				expect(context.findLastPieceOnLayer()).toBeUndefined()
				// @ts-ignore
				expect(context.findLastPieceOnLayer(9867, 'hi')).toBeUndefined()
			})

			testInFiber('basic and original only', () => {
				const { context, cache, rundown, playlist } = getActionExecutionContext()

				// We need to push changes back to 'mongo' for these tests
				waitForPromise(cache.saveAllToDatabase())

				const partInstances = cache.PartInstances.findFetch({})
				expect(partInstances).toHaveLength(5)

				const sourceLayerIds = env.showStyleBase.sourceLayers.map((l) => l._id)
				expect(sourceLayerIds).toHaveLength(2)

				// No playback has begun, so nothing should happen
				expect(context.findLastPieceOnLayer(sourceLayerIds[0])).toBeUndefined()
				expect(context.findLastPieceOnLayer(sourceLayerIds[1])).toBeUndefined()

				// Insert a piece that is played
				const pieceId0: PieceInstanceId = getRandomId()
				cache.PieceInstances.insert({
					_id: pieceId0,
					rundownId: rundown._id,
					partInstanceId: partInstances[0]._id,
					piece: {
						_id: getRandomId(),
						partId: partInstances[0].part._id,
						rundownId: rundown._id,
						externalId: '',
						name: 'abc',
						sourceLayerId: sourceLayerIds[0],
						outputLayerId: '',
						status: -1,
						enable: { start: 0 },
						startedPlayback: 1000,
						dynamicallyInserted: true,
					},
				})
				// We need to push changes back to 'mongo' for these tests
				waitForPromise(cache.saveAllToDatabase())

				expect(context.findLastPieceOnLayer(sourceLayerIds[0])).toMatchObject({ _id: pieceId0 })
				expect(context.findLastPieceOnLayer(sourceLayerIds[0], { originalOnly: true })).toBeUndefined()

				// Insert another more recent piece that is played
				const pieceId1: PieceInstanceId = getRandomId()
				cache.PieceInstances.insert({
					_id: pieceId1,
					rundownId: rundown._id,
					partInstanceId: partInstances[0]._id,
					piece: {
						_id: getRandomId(),
						partId: partInstances[0].part._id,
						rundownId: rundown._id,
						externalId: '',
						name: 'abc',
						sourceLayerId: sourceLayerIds[0],
						outputLayerId: '',
						status: -1,
						enable: { start: 0 },
						startedPlayback: 2000,
						dynamicallyInserted: true,
					},
				})
				// We need to push changes back to 'mongo' for these tests
				waitForPromise(cache.saveAllToDatabase())

				expect(context.findLastPieceOnLayer(sourceLayerIds[0])).toMatchObject({ _id: pieceId1 })
				expect(context.findLastPieceOnLayer(sourceLayerIds[0], { originalOnly: true })).toBeUndefined()
			})

			testInFiber('excludeCurrentPart', () => {
				const { context, cache, rundown, playlist } = getActionExecutionContext()

				// We need to push changes back to 'mongo' for these tests
				waitForPromise(cache.saveAllToDatabase())

				const partInstances = cache.PartInstances.findFetch({})
				expect(partInstances).toHaveLength(5)

				playlist.currentPartInstanceId = partInstances[2]._id

				const sourceLayerIds = env.showStyleBase.sourceLayers.map((l) => l._id)
				expect(sourceLayerIds).toHaveLength(2)

				// No playback has begun, so nothing should happen
				expect(context.findLastPieceOnLayer(sourceLayerIds[0])).toBeUndefined()
				expect(context.findLastPieceOnLayer(sourceLayerIds[1])).toBeUndefined()

				// Insert a couple of pieces that are played
				const pieceId0: PieceInstanceId = getRandomId()
				cache.PieceInstances.insert({
					_id: pieceId0,
					rundownId: rundown._id,
					partInstanceId: partInstances[0]._id,
					piece: {
						_id: getRandomId(),
						partId: partInstances[0].part._id,
						rundownId: rundown._id,
						externalId: '',
						name: 'abc',
						sourceLayerId: sourceLayerIds[0],
						outputLayerId: '',
						status: -1,
						enable: { start: 0 },
						startedPlayback: 1000,
						dynamicallyInserted: true,
					},
				})
				const pieceId1: PieceInstanceId = getRandomId()
				cache.PieceInstances.insert({
					_id: pieceId1,
					rundownId: rundown._id,
					partInstanceId: partInstances[2]._id,
					piece: {
						_id: getRandomId(),
						partId: partInstances[2].part._id,
						rundownId: rundown._id,
						externalId: '',
						name: 'abc',
						sourceLayerId: sourceLayerIds[0],
						outputLayerId: '',
						status: -1,
						enable: { start: 0 },
						startedPlayback: 2000,
						dynamicallyInserted: true,
					},
				})
				// We need to push changes back to 'mongo' for these tests
				waitForPromise(cache.saveAllToDatabase())

				// Check it
				expect(context.findLastPieceOnLayer(sourceLayerIds[0])).toMatchObject({ _id: pieceId1 })
				expect(context.findLastPieceOnLayer(sourceLayerIds[0], { excludeCurrentPart: true })).toMatchObject({
					_id: pieceId0,
				})
			})

			testInFiber('pieceMetaDataFilter', () => {
				const { context, cache, rundown, playlist } = getActionExecutionContext()

				// We need to push changes back to 'mongo' for these tests
				waitForPromise(cache.saveAllToDatabase())

				const partInstances = cache.PartInstances.findFetch({})
				expect(partInstances).toHaveLength(5)

				playlist.currentPartInstanceId = partInstances[2]._id

				const sourceLayerIds = env.showStyleBase.sourceLayers.map((l) => l._id)
				expect(sourceLayerIds).toHaveLength(2)

				// No playback has begun, so nothing should happen
				expect(context.findLastPieceOnLayer(sourceLayerIds[0])).toBeUndefined()
				expect(context.findLastPieceOnLayer(sourceLayerIds[1])).toBeUndefined()

				// Insert a couple of pieces that are played
				const pieceId0: PieceInstanceId = getRandomId()
				cache.PieceInstances.insert({
					_id: pieceId0,
					rundownId: rundown._id,
					partInstanceId: partInstances[0]._id,
					piece: {
						_id: getRandomId(),
						partId: partInstances[0].part._id,
						rundownId: rundown._id,
						externalId: '',
						name: 'abc',
						sourceLayerId: sourceLayerIds[0],
						outputLayerId: '',
						status: -1,
						enable: { start: 0 },
						startedPlayback: 1000,
						dynamicallyInserted: true,
					},
				})
				const pieceId1: PieceInstanceId = getRandomId()
				cache.PieceInstances.insert({
					_id: pieceId1,
					rundownId: rundown._id,
					partInstanceId: partInstances[2]._id,
					piece: {
						_id: getRandomId(),
						partId: partInstances[2].part._id,
						rundownId: rundown._id,
						externalId: '',
						name: 'abc',
						sourceLayerId: sourceLayerIds[0],
						outputLayerId: '',
						status: -1,
						enable: { start: 0 },
						startedPlayback: 2000,
						dynamicallyInserted: true,
						metaData: {
							prop1: 'hello',
							prop2: '5',
						},
					},
				})
				// We need to push changes back to 'mongo' for these tests
				waitForPromise(cache.saveAllToDatabase())

				// Check it
				expect(context.findLastPieceOnLayer(sourceLayerIds[0])).toMatchObject({ _id: pieceId1 })
				expect(context.findLastPieceOnLayer(sourceLayerIds[0], { pieceMetaDataFilter: {} })).toMatchObject({
					_id: pieceId1,
				})
				expect(
					context.findLastPieceOnLayer(sourceLayerIds[0], { pieceMetaDataFilter: { prop1: 'hello' } })
				).toMatchObject({ _id: pieceId1 })
				expect(
					context.findLastPieceOnLayer(sourceLayerIds[0], {
						pieceMetaDataFilter: { prop1: { $ne: 'hello' } },
					})
				).toMatchObject({ _id: pieceId0 })
			})
		})

		describe('insertPiece', () => {
			beforeEach(() => {
				postProcessPiecesMock.mockClear()
				innerStartAdLibPieceMock.mockClear()
			})

			testInFiber('bad parameters', () => {
				const { context, cache, playlist } = getActionExecutionContext()

				const partInstance = cache.PartInstances.findOne() as PartInstance
				expect(partInstance).toBeTruthy()
				playlist.currentPartInstanceId = partInstance._id

				// @ts-ignore
				expect(() => context.insertPiece()).toThrowError('Unknown part "undefined"')
				// @ts-ignore
				expect(() => context.insertPiece('previous')).toThrowError('Unknown part "previous"')
				// @ts-ignore
				expect(() => context.insertPiece('next')).toThrowError('Cannot insert piece when no active part')

				expect(postProcessPiecesMock).toHaveBeenCalledTimes(0)
				expect(innerStartAdLibPieceMock).toHaveBeenCalledTimes(0)

				postProcessPiecesMock.mockImplementationOnce(() => {
					throw new Error('Mock process error')
				})
				expect(() => context.insertPiece('current', {} as any)).toThrowError('Mock process error')
				expect(postProcessPiecesMock).toHaveBeenCalledTimes(1)
				expect(innerStartAdLibPieceMock).toHaveBeenCalledTimes(0)
			})

			testInFiber('good', () => {
				const { context, cache, playlist } = getActionExecutionContext()

				const partInstance = cache.PartInstances.findOne() as PartInstance
				expect(partInstance).toBeTruthy()
				playlist.currentPartInstanceId = partInstance._id

				postProcessPiecesMock.mockImplementationOnce(() => [
					{
						_id: 'fake4',
					} as any,
				])
				innerStartAdLibPieceMock.mockImplementationOnce(innerStartAdLibPieceOrig)

				const newPieceInstanceId = context.insertPiece('current', { _id: 'input1' } as any)._id
				expect(newPieceInstanceId).toMatch(/randomId([0-9]+)_part0_0_instance_fake4/)
				expect(postProcessPiecesMock).toHaveBeenCalledTimes(1)
				expect(postProcessPiecesMock).toHaveBeenCalledWith(
					expect.anything(),
					[{ _id: 'input1' }],
					'mockBlueprint1',
					partInstance.rundownId,
					partInstance.part._id,
					true,
					true
				)
				expect(innerStartAdLibPieceMock).toHaveBeenCalledTimes(1)

				// check some properties not exposed to the blueprints
				const newPieceInstance = cache.PieceInstances.findOne(
					protectString(newPieceInstanceId!)
				) as PieceInstance
				expect(newPieceInstance.piece.dynamicallyInserted).toBeTruthy()
				expect(newPieceInstance.partInstanceId).toEqual(partInstance._id)
			})
		})

		describe('updatePieceInstance', () => {
			testInFiber('bad parameters', () => {
				const { context, cache, playlist } = getActionExecutionContext()

				const pieceInstance = cache.PieceInstances.findOne() as PieceInstance
				expect(pieceInstance).toBeTruthy()
				const pieceInstanceOther = cache.PieceInstances.findOne({
					partInstanceId: { $ne: pieceInstance.partInstanceId },
				}) as PieceInstance
				expect(pieceInstanceOther).toBeTruthy()

				expect(() => context.updatePieceInstance('abc', {})).toThrowError(
					'Some valid properties must be defined'
				)
				expect(() => context.updatePieceInstance('abc', { _id: 'bad', nope: 'ok' } as any)).toThrowError(
					'Some valid properties must be defined'
				)
				expect(() => context.updatePieceInstance('abc', { sourceLayerId: 'new' })).toThrowError(
					'PieceInstance could not be found'
				)
				expect(() =>
					context.updatePieceInstance(unprotectString(pieceInstance._id), { sourceLayerId: 'new' })
				).toThrowError('Can only update piece instances in current or next part instance')
				expect(() =>
					context.updatePieceInstance(unprotectString(pieceInstanceOther._id), { sourceLayerId: 'new' })
				).toThrowError('Can only update piece instances in current or next part instance')

				// Set a current part instance
				playlist.currentPartInstanceId = pieceInstance.partInstanceId
				expect(() => context.updatePieceInstance('abc', { sourceLayerId: 'new' })).toThrowError(
					'PieceInstance could not be found'
				)
				expect(
					context.updatePieceInstance(unprotectString(pieceInstance._id), { sourceLayerId: 'new' })
				).toBeTruthy()
				expect(() =>
					context.updatePieceInstance(unprotectString(pieceInstanceOther._id), { sourceLayerId: 'new' })
				).toThrowError('Can only update piece instances in current or next part instance')

				// Set as next part instance
				playlist.currentPartInstanceId = null
				playlist.nextPartInstanceId = pieceInstance.partInstanceId
				expect(() => context.updatePieceInstance('abc', { sourceLayerId: 'new' })).toThrowError(
					'PieceInstance could not be found'
				)
				expect(
					context.updatePieceInstance(unprotectString(pieceInstance._id), { sourceLayerId: 'new' })
				).toBeTruthy()
				expect(() =>
					context.updatePieceInstance(unprotectString(pieceInstanceOther._id), { sourceLayerId: 'new' })
				).toThrowError('Can only update piece instances in current or next part instance')

				// Set as previous instance
				playlist.nextPartInstanceId = null
				playlist.previousPartInstanceId = pieceInstance.partInstanceId
				expect(() =>
					context.updatePieceInstance(unprotectString(pieceInstance._id), { sourceLayerId: 'new' })
				).toThrowError('Can only update piece instances in current or next part instance')
				expect(() =>
					context.updatePieceInstance(unprotectString(pieceInstanceOther._id), { sourceLayerId: 'new' })
				).toThrowError('Can only update piece instances in current or next part instance')
			})

			testInFiber('good', () => {
				const { context, cache, playlist } = getActionExecutionContext()

				// Setup the rundown and find a piece to modify
				const pieceInstance0 = cache.PieceInstances.findOne() as PieceInstance
				expect(pieceInstance0).toBeTruthy()
				playlist.currentPartInstanceId = pieceInstance0.partInstanceId

				// Ensure there are no pending updates already
				expect(Object.values(cache.PieceInstances.documents).filter((doc) => !!doc.updated)).toHaveLength(0)

				// Update it and expect it to match
				const pieceInstance0Before = _.clone(pieceInstance0)
				const pieceInstance0Delta = {
					_id: 'sdf', // This will be dropped
					sourceLayerId: 'new',
					enable: { start: 99, end: 123 },
					badProperty: 9, // This will be dropped
				}
				expect(context.updatePieceInstance(unprotectString(pieceInstance0._id), pieceInstance0Delta)).toEqual(
					pieceInstance0
				)
				const pieceInstance0After = {
					...pieceInstance0Before,
					piece: {
						...pieceInstance0Before.piece,
						..._.omit(pieceInstance0Delta, 'badProperty', '_id'),
					},
				}
				expect(pieceInstance0).toEqual(pieceInstance0After)
				expect(Object.values(cache.PieceInstances.documents).filter((doc) => !!doc.updated)).toMatchObject([
					{
						updated: true,
						document: { _id: pieceInstance0._id },
					},
				])

				expect(context.nextPartState).toEqual(ActionPartChange.NONE)
				expect(context.currentPartState).toEqual(ActionPartChange.MARK_DIRTY)
			})
		})

		describe('queuePart', () => {
			beforeEach(() => {
				postProcessPiecesMock.mockClear()
				innerStartAdLibPieceMock.mockClear()
				innerStartQueuedAdLibMock.mockClear()
			})

			testInFiber('bad parameters', () => {
				const { context, cache, playlist } = getActionExecutionContext()

				// No next-part
				// @ts-ignore
				expect(() => context.queuePart()).toThrowError('Cannot queue part when no current partInstance')

				const partInstance = cache.PartInstances.findOne() as PartInstance
				expect(partInstance).toBeTruthy()
				playlist.currentPartInstanceId = partInstance._id

				// Next part has already been modified
				context.nextPartState = ActionPartChange.SAFE_CHANGE
				// @ts-ignore
				expect(() => context.queuePart('previous')).toThrowError(
					'Cannot queue part when next part has already been modified'
				)
				context.nextPartState = ActionPartChange.NONE

				expect(() => context.queuePart({} as any, [])).toThrowError('New part must contain at least one piece')

				expect(() =>
					context.queuePart(
						// @ts-ignore
						{
							floated: true,
						},
						[{}]
					)
				).toThrowError('Cannot queue a part which is not playable')
				expect(() =>
					context.queuePart(
						// @ts-ignore
						{
							invalid: true,
						},
						[{}]
					)
				).toThrowError('Cannot queue a part which is not playable')

				expect(postProcessPiecesMock).toHaveBeenCalledTimes(0)
				expect(innerStartAdLibPieceMock).toHaveBeenCalledTimes(0)
				expect(innerStartQueuedAdLibMock).toHaveBeenCalledTimes(0)

				postProcessPiecesMock.mockImplementationOnce(() => {
					throw new Error('Mock process error')
				})
				expect(() => context.queuePart({} as any, [{}] as any)).toThrowError('Mock process error')
				expect(postProcessPiecesMock).toHaveBeenCalledTimes(1)
				expect(innerStartAdLibPieceMock).toHaveBeenCalledTimes(0)
				expect(innerStartQueuedAdLibMock).toHaveBeenCalledTimes(0)

				partInstance.part.autoNext = true
				partInstance.part.expectedDuration = 4000
				partInstance.part.startedPlayback = true
				partInstance.part.timings = {
					startedPlayback: [getCurrentTime()],
					stoppedPlayback: [],
					playOffset: [0],
					take: [],
					takeDone: [],
					takeOut: [],
					next: [],
				}
				expect(isTooCloseToAutonext(partInstance, false)).toBeTruthy()
				expect(() => context.queuePart({} as any, [{}] as any)).toThrowError(
					'Too close to an autonext to queue a part'
				)

				expect(context.nextPartState).toEqual(ActionPartChange.NONE)
				expect(context.currentPartState).toEqual(ActionPartChange.NONE)
			})
			testInFiber('good', () => {
				const { context, cache, playlist } = getActionExecutionContext()

				const partInstance = cache.PartInstances.findOne() as PartInstance
				expect(partInstance).toBeTruthy()
				playlist.currentPartInstanceId = partInstance._id

				const newPiece: IBlueprintPiece = {
					_id: '',
					name: 'test piece',
					sourceLayerId: 'sl1',
					outputLayerId: 'o1',
					externalId: '-',
					enable: { start: 0 },
				}
				const newPart: IBlueprintPart = {
					externalId: 'nope',
					title: 'something',
				}

				expect(postProcessPiecesMock).toHaveBeenCalledTimes(0)
				expect(innerStartAdLibPieceMock).toHaveBeenCalledTimes(0)
				expect(innerStartQueuedAdLibMock).toHaveBeenCalledTimes(0)

				// Create it with most of the real flow
				postProcessPiecesMock.mockImplementationOnce(postProcessPiecesOrig)
				innerStartQueuedAdLibMock.mockImplementationOnce(innerStartQueuedAdLibOrig)
				expect(context.queuePart(newPart, [newPiece])._id).toEqual(playlist.nextPartInstanceId)

				expect(postProcessPiecesMock).toHaveBeenCalledTimes(1)
				expect(innerStartAdLibPieceMock).toHaveBeenCalledTimes(0)
				expect(innerStartQueuedAdLibMock).toHaveBeenCalledTimes(1)

				// Verify some properties not exposed to the blueprints
				const newPartInstance = cache.PartInstances.findOne(playlist.nextPartInstanceId!) as PartInstance
				expect(newPartInstance).toBeTruthy()
				expect(newPartInstance.part._rank).toBeLessThan(9000)
				expect(newPartInstance.part._rank).toBeGreaterThan(partInstance.part._rank)
				expect(newPartInstance.part.dynamicallyInserted).toBeTruthy()

				const newNextPartInstances = context.getPieceInstances('next')
				expect(newNextPartInstances).toHaveLength(1)
				// @ts-ignore
				expect(newNextPartInstances[0].partInstanceId).toEqual(newPartInstance._id)

				expect(context.nextPartState).toEqual(ActionPartChange.SAFE_CHANGE)
				expect(context.currentPartState).toEqual(ActionPartChange.NONE)
			})
		})

		describe('stopPiecesOnLayers', () => {
			testInFiber('invalid parameters', () => {
				const { context, cache, playlist } = getActionExecutionContext()

				// Bad instance id
				playlist.currentPartInstanceId = protectString('abc')
				expect(() => context.stopPiecesOnLayers(['lay1'], 34)).toThrowError(
					'Cannot stop pieceInstances when no current partInstance'
				)

				playlist.currentPartInstanceId = null

				innerStopPiecesMock.mockClear()
				expect(context.stopPiecesOnLayers(['lay1'], 34)).toEqual([])
				expect(innerStopPiecesMock).toHaveBeenCalledTimes(0)

				expect(context.nextPartState).toEqual(ActionPartChange.NONE)
				expect(context.currentPartState).toEqual(ActionPartChange.NONE)
			})
			testInFiber('valid parameters', () => {
				const { context, cache, playlist } = getActionExecutionContext()

				const currentPartInstance = cache.PartInstances.findOne() as PartInstance
				expect(currentPartInstance).toBeTruthy()
				playlist.currentPartInstanceId = currentPartInstance._id

				innerStopPiecesMock.mockClear()
				let filter: (piece: PieceInstance) => boolean = null as any
				innerStopPiecesMock.mockImplementationOnce((cache2, partInstance, filter2, offset) => {
					expect(cache2).toBe(cache)
					expect(partInstance).toBe(currentPartInstance)
					expect(offset).toEqual(34)
					filter = filter2

					return [protectString('result1')]
				})

				// Ensure it behaves as expected
				expect(context.stopPiecesOnLayers(['lay1'], 34)).toEqual(['result1'])
				expect(innerStopPiecesMock).toHaveBeenCalledTimes(1)
				expect(filter).toBeTruthy()

				// Now verify the filter works as intended
				expect(filter({ piece: { sourceLayerId: 'lay1' } } as any)).toBeTruthy()
				expect(filter({ piece: {} } as any)).toBeFalsy()
				expect(filter({ piece: { sourceLayerId: 'lay2' } } as any)).toBeFalsy()

				expect(context.nextPartState).toEqual(ActionPartChange.NONE)
				expect(context.currentPartState).toEqual(ActionPartChange.SAFE_CHANGE)
			})
		})

		describe('stopPieceInstances', () => {
			testInFiber('invalid parameters', () => {
				const { context, cache, playlist } = getActionExecutionContext()

				// Bad instance id
				playlist.currentPartInstanceId = protectString('abc')
				expect(() => context.stopPieceInstances(['lay1'], 34)).toThrowError(
					'Cannot stop pieceInstances when no current partInstance'
				)

				playlist.currentPartInstanceId = null

				innerStopPiecesMock.mockClear()
				expect(context.stopPieceInstances(['lay1'], 34)).toEqual([])
				expect(innerStopPiecesMock).toHaveBeenCalledTimes(0)

				expect(context.nextPartState).toEqual(ActionPartChange.NONE)
				expect(context.currentPartState).toEqual(ActionPartChange.NONE)
			})
			testInFiber('valid parameters', () => {
				const { context, cache, playlist } = getActionExecutionContext()

				const currentPartInstance = cache.PartInstances.findOne() as PartInstance
				expect(currentPartInstance).toBeTruthy()
				playlist.currentPartInstanceId = currentPartInstance._id

				innerStopPiecesMock.mockClear()
				let filter: (piece: PieceInstance) => boolean = null as any
				innerStopPiecesMock.mockImplementationOnce((cache2, partInstance, filter2, offset) => {
					expect(cache2).toBe(cache)
					expect(partInstance).toBe(currentPartInstance)
					expect(offset).toEqual(34)
					filter = filter2

					return [protectString('result1')]
				})

				// Ensure it behaves as expected
				expect(context.stopPieceInstances(['lay1'], 34)).toEqual(['result1'])
				expect(innerStopPiecesMock).toHaveBeenCalledTimes(1)
				expect(filter).toBeTruthy()

				// Now verify the filter works as intended
				expect(filter({ _id: 'lay1' } as any)).toBeTruthy()
				expect(filter({} as any)).toBeFalsy()
				expect(filter({ id: 'lay2' } as any)).toBeFalsy()

				expect(context.nextPartState).toEqual(ActionPartChange.NONE)
				expect(context.currentPartState).toEqual(ActionPartChange.SAFE_CHANGE)
			})
		})
	})
})
