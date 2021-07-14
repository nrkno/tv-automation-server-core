import * as _ from 'underscore'
import {
	setupDefaultStudioEnvironment,
	DefaultEnvironment,
	setupDefaultRundownPlaylist,
} from '../../../../__mocks__/helpers/database'
import { protectString, unprotectString, getRandomId, getCurrentTime, clone } from '../../../../lib/lib'
import { Studio, Studios } from '../../../../lib/collections/Studios'
import { IBlueprintPart, IBlueprintPiece, PieceLifespan } from '@sofie-automation/blueprints-integration'
import { ActionExecutionContext, ActionPartChange } from '../context'
import { Rundown, Rundowns } from '../../../../lib/collections/Rundowns'
import { PartInstance, PartInstanceId, PartInstances } from '../../../../lib/collections/PartInstances'
import {
	PieceInstance,
	ResolvedPieceInstance,
	PieceInstanceId,
	PieceInstances,
} from '../../../../lib/collections/PieceInstances'
import {
	RundownPlaylist,
	RundownPlaylistActivationId,
	RundownPlaylists,
} from '../../../../lib/collections/RundownPlaylists'
import { testInFiber } from '../../../../__mocks__/helpers/jest'
import { isTooCloseToAutonext } from '../../playout/lib'
import { ShowStyleBase } from '../../../../lib/collections/ShowStyleBases'
import { CacheForPlayout, getRundownIDsFromCache } from '../../playout/cache'
import { PlayoutLockFunctionPriority, runPlayoutOperationWithCache } from '../../playout/lockFunction'
import { WatchedPackagesHelper } from '../context/watchedPackages'

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
import { Pieces } from '../../../../lib/collections/Pieces'
import { ReadonlyDeep } from 'type-fest'

type TpostProcessPieces = jest.MockedFunction<typeof postProcessPieces>
const postProcessPiecesMock = postProcessPieces as TpostProcessPieces
postProcessPiecesMock.mockImplementation(() => [])
const { postProcessPieces: postProcessPiecesOrig } = jest.requireActual('../postProcess')

describe('Test blueprint api context', () => {
	function generateSparsePieceInstances(playlist: RundownPlaylist, rundown: Rundown) {
		const activationId = playlist.activationId as RundownPlaylistActivationId
		expect(activationId).toBeTruthy()

		rundown.getParts().forEach((part, i) => {
			// make into a partInstance
			PartInstances.insert({
				_id: protectString(`${part._id}_instance`),
				rundownId: part.rundownId,
				segmentId: part.segmentId,
				playlistActivationId: activationId,
				segmentPlayoutId: protectString(''),
				takeCount: i,
				rehearsal: false,
				part,
			})

			Pieces.find({ startPartId: part._id, startRundownId: rundown._id }).forEach((p) => {
				PieceInstances.insert({
					_id: protectString(`${part._id}_piece_${p._id}`),
					rundownId: rundown._id,
					partInstanceId: protectString(`${part._id}_instance`),
					playlistActivationId: activationId,
					piece: p,
				})
			})

			const count = ((i + 2) % 4) + 1 // Some consistent randomness
			for (let o = 0; o < count; o++) {
				PieceInstances.insert({
					_id: protectString(`${part._id}_piece${o}`),
					rundownId: rundown._id,
					partInstanceId: protectString(`${part._id}_instance`),
					playlistActivationId: activationId,
					piece: {
						_id: protectString(`${part._id}_piece_inner${o}`),
						externalId: '-',
						enable: { start: 0 },
						name: 'mock',
						status: -1,
						sourceLayerId: '',
						outputLayerId: '',
						startPartId: part._id,
						content: {
							index: o,
						} as any,
						lifespan: PieceLifespan.WithinPart,
						invalid: false,
					},
				})
			}
		})
	}

	let env: DefaultEnvironment
	beforeAll(async () => {
		env = await setupDefaultStudioEnvironment()
	})

	async function getActionExecutionContext(cache: CacheForPlayout) {
		const playlist = cache.Playlist.doc
		expect(playlist).toBeTruthy()
		const rundown = cache.Rundowns.findOne() as Rundown
		expect(rundown).toBeTruthy()

		const activationId = playlist.activationId as RundownPlaylistActivationId
		expect(activationId).toBeTruthy()

		const studio = Studios.findOne(playlist.studioId) as Studio
		expect(studio).toBeTruthy()

		// Load all the PieceInstances, as we set the selected instances later
		const rundownIds = getRundownIDsFromCache(cache)
		await cache.PieceInstances.fillWithDataFromDatabase({ rundownId: { $in: rundownIds } })

		const showStyle = await cache.activationCache.getShowStyleCompound(rundown)

		const watchedPackages = WatchedPackagesHelper.empty() // Not needed by the tests for now

		const context = new ActionExecutionContext(
			{
				name: 'fakeContext',
				identifier: 'action',
			},
			cache,
			showStyle,
			rundown,
			watchedPackages
		)
		expect(context.studio).toBeTruthy()

		return {
			playlist,
			rundown,
			context,
			activationId,
		}
	}

	async function wrapWithCache<T>(fcn: (cache: CacheForPlayout) => Promise<T>): Promise<T> {
		const defaultSetup = setupDefaultRundownPlaylist(env)

		// Mark playlist as active
		await RundownPlaylists.updateAsync(defaultSetup.playlistId, {
			$set: {
				activationId: getRandomId(),
			},
		})

		const tmpPlaylist = (await RundownPlaylists.findOneAsync(defaultSetup.playlistId)) as RundownPlaylist
		expect(tmpPlaylist).toBeTruthy()

		const rundown = (await Rundowns.findOneAsync(defaultSetup.rundownId)) as Rundown
		expect(rundown).toBeTruthy()

		generateSparsePieceInstances(tmpPlaylist, rundown)

		return runPlayoutOperationWithCache(
			null,
			'test',
			tmpPlaylist._id,
			PlayoutLockFunctionPriority.USER_PLAYOUT,
			null,
			fcn
		)
	}

	describe('ActionExecutionContext', () => {
		describe('getPartInstance', () => {
			testInFiber('invalid parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					// @ts-ignore
					expect(() => context.getPartInstance()).toThrowError('Unknown part "undefined"')
					// @ts-ignore
					expect(() => context.getPartInstance('abc')).toThrowError('Unknown part "abc"')
					// @ts-ignore
					expect(() => context.getPartInstance(6)).toThrowError('Unknown part "6"')
					// @ts-ignore
					expect(() => context.getPartInstance('previous')).toThrowError('Unknown part "previous"')
				})
			})

			testInFiber('valid parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					const partInstanceIds = cache.PartInstances.findFetch({}).map((pi) => pi._id)
					expect(partInstanceIds).toHaveLength(5)

					expect(context.getPartInstance('next')).toBeUndefined()
					expect(context.getPartInstance('current')).toBeUndefined()

					// Check the current part
					cache.Playlist.update({ $set: { currentPartInstanceId: partInstanceIds[1] } })
					expect(context.getPartInstance('next')).toBeUndefined()
					expect(context.getPartInstance('current')).toMatchObject({ _id: partInstanceIds[1] })

					// Now the next part
					cache.Playlist.update({ $set: { currentPartInstanceId: null } })
					cache.Playlist.update({ $set: { nextPartInstanceId: partInstanceIds[2] } })
					expect(context.getPartInstance('next')).toMatchObject({ _id: partInstanceIds[2] })
					expect(context.getPartInstance('current')).toBeUndefined()
				})
			})
		})
		describe('getPieceInstances', () => {
			testInFiber('invalid parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					// @ts-ignore
					expect(() => context.getPieceInstances()).toThrowError('Unknown part "undefined"')
					// @ts-ignore
					expect(() => context.getPieceInstances('abc')).toThrowError('Unknown part "abc"')
					// @ts-ignore
					expect(() => context.getPieceInstances(6)).toThrowError('Unknown part "6"')
					// @ts-ignore
					expect(() => context.getPieceInstances('previous')).toThrowError('Unknown part "previous"')
				})
			})

			testInFiber('valid parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					const partInstanceIds = cache.PartInstances.findFetch({}).map((pi) => pi._id)
					expect(partInstanceIds).toHaveLength(5)

					expect(context.getPieceInstances('next')).toHaveLength(0)
					expect(context.getPieceInstances('current')).toHaveLength(0)

					// Check the current part
					cache.Playlist.update({ $set: { currentPartInstanceId: partInstanceIds[1] } })
					expect(context.getPieceInstances('next')).toHaveLength(0)
					expect(context.getPieceInstances('current')).toHaveLength(5)

					// Now the next part
					cache.Playlist.update({ $set: { currentPartInstanceId: null } })
					cache.Playlist.update({ $set: { nextPartInstanceId: partInstanceIds[2] } })
					expect(context.getPieceInstances('next')).toHaveLength(1)
					expect(context.getPieceInstances('current')).toHaveLength(0)
				})
			})
		})
		describe('getResolvedPieceInstances', () => {
			testInFiber('invalid parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					// @ts-ignore
					expect(() => context.getResolvedPieceInstances()).toThrowError('Unknown part "undefined"')
					// @ts-ignore
					expect(() => context.getResolvedPieceInstances('abc')).toThrowError('Unknown part "abc"')
					// @ts-ignore
					expect(() => context.getResolvedPieceInstances(6)).toThrowError('Unknown part "6"')
					// @ts-ignore
					expect(() => context.getResolvedPieceInstances('previous')).toThrowError('Unknown part "previous"')
				})
			})

			testInFiber('valid parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					const partInstanceIds = cache.PartInstances.findFetch({}).map((pi) => pi._id)
					expect(partInstanceIds).toHaveLength(5)

					expect(getResolvedPiecesMock).toHaveBeenCalledTimes(0)

					expect(context.getResolvedPieceInstances('next')).toHaveLength(0)
					expect(context.getResolvedPieceInstances('current')).toHaveLength(0)
					expect(getResolvedPiecesMock).toHaveBeenCalledTimes(0)

					let mockCalledIds: PartInstanceId[] = []
					getResolvedPiecesMock.mockImplementation(
						(
							cache2: CacheForPlayout,
							showStyleBase: ReadonlyDeep<ShowStyleBase>,
							partInstance: PartInstance
						) => {
							expect(cache2).toBe(cache)
							expect(showStyleBase).toBeTruthy()
							mockCalledIds.push(partInstance._id)
							return ['abc'] as any as ResolvedPieceInstance[]
						}
					)

					// Check the current part
					cache.Playlist.update({ $set: { currentPartInstanceId: partInstanceIds[1] } })
					expect(context.getResolvedPieceInstances('next')).toHaveLength(0)
					expect(context.getResolvedPieceInstances('current')).toEqual(['abc'])
					expect(getResolvedPiecesMock).toHaveBeenCalledTimes(1)
					expect(mockCalledIds).toEqual([partInstanceIds[1]])

					mockCalledIds = []
					getResolvedPiecesMock.mockClear()

					// Now the next part
					cache.Playlist.update({ $set: { currentPartInstanceId: null } })
					cache.Playlist.update({ $set: { nextPartInstanceId: partInstanceIds[2] } })
					expect(context.getResolvedPieceInstances('next')).toEqual(['abc'])
					expect(context.getResolvedPieceInstances('current')).toHaveLength(0)
					expect(getResolvedPiecesMock).toHaveBeenCalledTimes(1)
					expect(mockCalledIds).toEqual([partInstanceIds[2]])
				})
			})
		})
		describe('findLastPieceOnLayer', () => {
			testInFiber('invalid parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					// We need to push changes back to 'mongo' for these tests
					await cache.saveAllToDatabase()

					// @ts-ignore
					expect(context.findLastPieceOnLayer()).toBeUndefined()
					// @ts-ignore
					expect(context.findLastPieceOnLayer(9867, 'hi')).toBeUndefined()
				})
			})

			testInFiber('basic and original only', async () => {
				await wrapWithCache(async (cache) => {
					const { context, rundown, activationId } = await getActionExecutionContext(cache)

					// We need to push changes back to 'mongo' for these tests
					await cache.saveAllToDatabase()

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
						playlistActivationId: activationId,
						dynamicallyInserted: getCurrentTime(),
						piece: {
							_id: getRandomId(),
							startPartId: partInstances[0].part._id,
							externalId: '',
							name: 'abc',
							sourceLayerId: sourceLayerIds[0],
							outputLayerId: '',
							status: -1,
							enable: { start: 0 },
							lifespan: PieceLifespan.OutOnSegmentChange,
							invalid: false,
							content: {
								timelineObjects: [],
							},
						},
						startedPlayback: 1000,
					})
					// We need to push changes back to 'mongo' for these tests
					await cache.saveAllToDatabase()

					expect(context.findLastPieceOnLayer(sourceLayerIds[0])).toMatchObject({ _id: pieceId0 })
					expect(context.findLastPieceOnLayer(sourceLayerIds[0], { originalOnly: true })).toBeUndefined()

					// Insert another more recent piece that is played
					const pieceId1: PieceInstanceId = getRandomId()
					cache.PieceInstances.insert({
						_id: pieceId1,
						rundownId: rundown._id,
						partInstanceId: partInstances[0]._id,
						playlistActivationId: activationId,
						dynamicallyInserted: getCurrentTime(),
						piece: {
							_id: getRandomId(),
							startPartId: partInstances[0].part._id,
							externalId: '',
							name: 'abc',
							sourceLayerId: sourceLayerIds[0],
							outputLayerId: '',
							status: -1,
							enable: { start: 0 },
							lifespan: PieceLifespan.OutOnSegmentChange,
							invalid: false,
							content: {
								timelineObjects: [],
							},
						},
						startedPlayback: 2000,
					})
					// We need to push changes back to 'mongo' for these tests
					await cache.saveAllToDatabase()

					expect(context.findLastPieceOnLayer(sourceLayerIds[0])).toMatchObject({ _id: pieceId1 })
					expect(context.findLastPieceOnLayer(sourceLayerIds[0], { originalOnly: true })).toBeUndefined()
				})
			})

			testInFiber('excludeCurrentPart', async () => {
				await wrapWithCache(async (cache) => {
					const { context, rundown, activationId } = await getActionExecutionContext(cache)

					// We need to push changes back to 'mongo' for these tests
					await cache.saveAllToDatabase()

					const partInstances = cache.PartInstances.findFetch({})
					expect(partInstances).toHaveLength(5)

					cache.Playlist.update({ $set: { currentPartInstanceId: partInstances[2]._id } })

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
						playlistActivationId: activationId,
						dynamicallyInserted: getCurrentTime(),
						piece: {
							_id: getRandomId(),
							startPartId: partInstances[0].part._id,
							externalId: '',
							name: 'abc',
							sourceLayerId: sourceLayerIds[0],
							outputLayerId: '',
							status: -1,
							enable: { start: 0 },
							lifespan: PieceLifespan.OutOnSegmentChange,
							invalid: false,
							content: {
								timelineObjects: [],
							},
						},
						startedPlayback: 1000,
					})
					const pieceId1: PieceInstanceId = getRandomId()
					cache.PieceInstances.insert({
						_id: pieceId1,
						rundownId: rundown._id,
						partInstanceId: partInstances[2]._id,
						playlistActivationId: activationId,
						dynamicallyInserted: getCurrentTime(),
						piece: {
							_id: getRandomId(),
							startPartId: partInstances[2].part._id,
							externalId: '',
							name: 'abc',
							sourceLayerId: sourceLayerIds[0],
							outputLayerId: '',
							status: -1,
							enable: { start: 0 },
							lifespan: PieceLifespan.OutOnSegmentChange,
							invalid: false,
							content: {
								timelineObjects: [],
							},
						},
						startedPlayback: 2000,
					})
					// We need to push changes back to 'mongo' for these tests
					await cache.saveAllToDatabase()

					// Check it
					expect(context.findLastPieceOnLayer(sourceLayerIds[0])).toMatchObject({ _id: pieceId1 })
					expect(context.findLastPieceOnLayer(sourceLayerIds[0], { excludeCurrentPart: true })).toMatchObject(
						{
							_id: pieceId0,
						}
					)
				})
			})

			testInFiber('pieceMetaDataFilter', async () => {
				await wrapWithCache(async (cache) => {
					const { context, rundown, activationId } = await getActionExecutionContext(cache)

					// We need to push changes back to 'mongo' for these tests
					await cache.saveAllToDatabase()

					const partInstances = cache.PartInstances.findFetch({})
					expect(partInstances).toHaveLength(5)

					cache.Playlist.update({ $set: { currentPartInstanceId: partInstances[2]._id } })

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
						playlistActivationId: activationId,
						piece: {
							_id: getRandomId(),
							startPartId: partInstances[0].part._id,
							externalId: '',
							name: 'abc',
							sourceLayerId: sourceLayerIds[0],
							outputLayerId: '',
							status: -1,
							enable: { start: 0 },
							lifespan: PieceLifespan.OutOnSegmentChange,
							invalid: false,
							content: {
								timelineObjects: [],
							},
						},
						startedPlayback: 1000,
					})
					const pieceId1: PieceInstanceId = getRandomId()
					cache.PieceInstances.insert({
						_id: pieceId1,
						rundownId: rundown._id,
						partInstanceId: partInstances[2]._id,
						playlistActivationId: activationId,
						piece: {
							_id: getRandomId(),
							startPartId: partInstances[2].part._id,
							externalId: '',
							name: 'abc',
							sourceLayerId: sourceLayerIds[0],
							outputLayerId: '',
							status: -1,
							enable: { start: 0 },
							metaData: {
								prop1: 'hello',
								prop2: '5',
							},
							lifespan: PieceLifespan.OutOnSegmentChange,
							invalid: false,
							content: {
								timelineObjects: [],
							},
						},
						startedPlayback: 2000,
					})
					// We need to push changes back to 'mongo' for these tests
					await cache.saveAllToDatabase()

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
		})

		describe('findLastScriptedPieceOnLayer', () => {
			testInFiber('No Current Part', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					// We need to push changes back to 'mongo' for these tests
					await cache.saveAllToDatabase()

					const sourceLayerIds = env.showStyleBase.sourceLayers.map((l) => l._id)
					expect(sourceLayerIds).toHaveLength(2)

					// No playback has begun, so nothing should happen
					expect(context.findLastScriptedPieceOnLayer(sourceLayerIds[0])).toBeUndefined()
					expect(context.findLastScriptedPieceOnLayer(sourceLayerIds[1])).toBeUndefined()
				})
			})

			testInFiber('First Part', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					// We need to push changes back to 'mongo' for these tests
					await cache.saveAllToDatabase()

					const segmentIds = cache.Segments.findFetch()
						.sort((a, b) => a._rank - b._rank)
						.map((s) => s._id)

					const partInstances = cache.PartInstances.findFetch({ segmentId: segmentIds[0] }).sort(
						(a, b) => a.part._rank - b.part._rank
					)
					expect(partInstances).toHaveLength(2)

					const pieceInstances = cache.PieceInstances.findFetch({
						partInstanceId: { $in: partInstances.map((p) => p._id) },
					})
					expect(pieceInstances).toHaveLength(10)

					const sourceLayerIds = env.showStyleBase.sourceLayers.map((l) => l._id)
					expect(sourceLayerIds).toHaveLength(2)

					// Set Part 1 as current part
					// as any to bypass readonly
					;(cache.Playlist.doc.currentPartInstanceId as any) = partInstances[0]._id

					const expectedPieceInstanceSourceLayer0 = pieceInstances.find(
						(p) =>
							p.partInstanceId === cache.Playlist.doc.currentPartInstanceId &&
							p.piece.sourceLayerId === sourceLayerIds[0]
					)
					expect(expectedPieceInstanceSourceLayer0).not.toBeUndefined()

					const expectedPieceSourceLayer0 = Pieces.findOne({
						_id: expectedPieceInstanceSourceLayer0?.piece._id,
					})
					expect(context.findLastScriptedPieceOnLayer(sourceLayerIds[0])).toMatchObject({
						_id: expectedPieceSourceLayer0?._id,
					})

					const expectedPieceInstanceSourceLayer1 = pieceInstances.find(
						(p) =>
							p.partInstanceId === cache.Playlist.doc.currentPartInstanceId &&
							p.piece.sourceLayerId === sourceLayerIds[1]
					)
					expect(expectedPieceInstanceSourceLayer1).not.toBeUndefined()

					const expectedPieceSourceLayer1 = Pieces.findOne({
						_id: expectedPieceInstanceSourceLayer1?.piece._id,
					})
					expect(context.findLastScriptedPieceOnLayer(sourceLayerIds[1])).toMatchObject({
						_id: expectedPieceSourceLayer1?._id,
					})
				})
			})

			testInFiber('First Part, Ignore Current Part', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					// We need to push changes back to 'mongo' for these tests
					await cache.saveAllToDatabase()

					const segmentIds = cache.Segments.findFetch()
						.sort((a, b) => a._rank - b._rank)
						.map((s) => s._id)

					const partInstances = cache.PartInstances.findFetch({ segmentId: segmentIds[0] }).sort(
						(a, b) => a.part._rank - b.part._rank
					)
					expect(partInstances).toHaveLength(2)

					const sourceLayerIds = env.showStyleBase.sourceLayers.map((l) => l._id)
					expect(sourceLayerIds).toHaveLength(2)

					// Set Part 1 as current part
					// as any to bypass readonly
					;(cache.Playlist.doc.currentPartInstanceId as any) = partInstances[0]._id

					expect(
						context.findLastScriptedPieceOnLayer(sourceLayerIds[0], { excludeCurrentPart: true })
					).toBeUndefined()
				})
			})

			testInFiber('Second Part', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					// We need to push changes back to 'mongo' for these tests
					await cache.saveAllToDatabase()

					const segmentIds = cache.Segments.findFetch()
						.sort((a, b) => a._rank - b._rank)
						.map((s) => s._id)

					const partInstances = cache.PartInstances.findFetch({ segmentId: segmentIds[0] }).sort(
						(a, b) => a.part._rank - b.part._rank
					)
					expect(partInstances).toHaveLength(2)

					const pieceInstances = cache.PieceInstances.findFetch({
						partInstanceId: { $in: partInstances.map((p) => p._id) },
					})
					expect(pieceInstances).toHaveLength(10)

					const sourceLayerIds = env.showStyleBase.sourceLayers.map((l) => l._id)
					expect(sourceLayerIds).toHaveLength(2)

					// Set Part 2 as current part
					// as any to bypass readonly
					;(cache.Playlist.doc.currentPartInstanceId as any) = partInstances[1]._id

					const expectedPieceInstanceSourceLayer0 = pieceInstances.find(
						(p) =>
							p.partInstanceId === cache.Playlist.doc.currentPartInstanceId &&
							p.piece.sourceLayerId === sourceLayerIds[0]
					)
					expect(expectedPieceInstanceSourceLayer0).not.toBeUndefined()

					const expectedPieceSourceLayer0 = Pieces.findOne({
						_id: expectedPieceInstanceSourceLayer0?.piece._id,
					})
					expect(context.findLastScriptedPieceOnLayer(sourceLayerIds[0])).toMatchObject({
						_id: expectedPieceSourceLayer0?._id,
					})

					// Part 2 does not have any pieces on this sourcelayer, so we should find the piece from part 1
					const expectedPieceInstanceSourceLayer1 = pieceInstances.find(
						(p) => p.partInstanceId === partInstances[0]._id && p.piece.sourceLayerId === sourceLayerIds[1]
					)
					expect(expectedPieceInstanceSourceLayer0).not.toBeUndefined()

					const expectedPieceSourceLayer1 = Pieces.findOne({
						_id: expectedPieceInstanceSourceLayer1?.piece._id,
					})
					expect(context.findLastScriptedPieceOnLayer(sourceLayerIds[1])).toMatchObject({
						_id: expectedPieceSourceLayer1?._id,
					})
				})
			})
		})

		describe('getPartInstanceForPreviousPiece', () => {
			testInFiber('invalid parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					// @ts-ignore
					expect(() => context.getPartInstanceForPreviousPiece()).toThrowError(
						'Cannot find PartInstance from invalid PieceInstance'
					)
					// @ts-ignore
					expect(() => context.getPartInstanceForPreviousPiece({})).toThrowError(
						'Cannot find PartInstance from invalid PieceInstance'
					)
					// @ts-ignore
					expect(() => context.getPartInstanceForPreviousPiece('abc')).toThrowError(
						'Cannot find PartInstance from invalid PieceInstance'
					)
					expect(() =>
						context.getPartInstanceForPreviousPiece({
							// @ts-ignore
							partInstanceId: 6,
						})
					).toThrowError('Cannot find PartInstance for PieceInstance')
					expect(() =>
						// @ts-ignore
						context.getPartInstanceForPreviousPiece({
							partInstanceId: 'abc',
						})
					).toThrowError('Cannot find PartInstance for PieceInstance')
				})
			})

			testInFiber('valid parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					const partInstanceIds = cache.PartInstances.findFetch({}).map((pi) => pi._id)
					expect(partInstanceIds).toHaveLength(5)

					expect(
						context.getPartInstanceForPreviousPiece({ partInstanceId: partInstanceIds[1] } as any)
					).toMatchObject({
						_id: partInstanceIds[1],
					})

					expect(
						context.getPartInstanceForPreviousPiece({ partInstanceId: partInstanceIds[4] } as any)
					).toMatchObject({
						_id: partInstanceIds[4],
					})
				})
			})
		})

		describe('getPartForPreviousPiece', () => {
			testInFiber('invalid parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					// @ts-ignore
					expect(() => context.getPartForPreviousPiece()).toThrowError('Cannot find Part from invalid Piece')
					// @ts-ignore
					expect(() => context.getPartForPreviousPiece({})).toThrowError(
						'Cannot find Part from invalid Piece'
					)
					// @ts-ignore
					expect(() => context.getPartForPreviousPiece('abc')).toThrowError(
						'Cannot find Part from invalid Piece'
					)
					expect(() =>
						context.getPartForPreviousPiece({
							// @ts-ignore
							partInstanceId: 6,
						})
					).toThrowError('Cannot find Part from invalid Piece')
					expect(() =>
						// @ts-ignore
						context.getPartForPreviousPiece({
							_id: 'abc',
						})
					).toThrowError('Cannot find Piece abc')
				})
			})

			testInFiber('valid parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					const partInstances = cache.PartInstances.findFetch({})
					expect(partInstances).toHaveLength(5)

					const pieceInstance0 = cache.PieceInstances.findOne({ partInstanceId: partInstances[0]._id })
					expect(pieceInstance0).not.toBeUndefined()

					expect(
						context.getPartForPreviousPiece({ _id: unprotectString(pieceInstance0!.piece._id) })
					).toMatchObject({
						_id: partInstances[0].part._id,
					})

					const pieceInstance1 = cache.PieceInstances.findOne({ partInstanceId: partInstances[1]._id })
					expect(pieceInstance1).not.toBeUndefined()

					expect(
						context.getPartForPreviousPiece({ _id: unprotectString(pieceInstance1!.piece._id) })
					).toMatchObject({
						_id: partInstances[1].part._id,
					})
				})
			})
		})

		describe('insertPiece', () => {
			beforeEach(() => {
				postProcessPiecesMock.mockClear()
				innerStartAdLibPieceMock.mockClear()
			})

			testInFiber('bad parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					const partInstance = cache.PartInstances.findOne() as PartInstance
					expect(partInstance).toBeTruthy()
					cache.Playlist.update({ $set: { currentPartInstanceId: partInstance._id } })

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
			})

			testInFiber('good', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					const partInstance = cache.PartInstances.findOne() as PartInstance
					expect(partInstance).toBeTruthy()
					cache.Playlist.update({ $set: { currentPartInstanceId: partInstance._id } })

					postProcessPiecesMock.mockImplementationOnce(() => [
						{
							_id: 'fake4', // Should be ignored
						} as any,
					])
					innerStartAdLibPieceMock.mockImplementationOnce(innerStartAdLibPieceOrig)

					const newPieceInstanceId = context.insertPiece('current', { externalId: 'input1' } as any)._id
					expect(newPieceInstanceId).toMatch(/randomId([0-9]+)_part0_0_instance_randomId([0-9]+)/)
					expect(postProcessPiecesMock).toHaveBeenCalledTimes(1)
					expect(postProcessPiecesMock).toHaveBeenCalledWith(
						expect.anything(),
						[{ externalId: 'input1' }],
						'mockBlueprint1',
						partInstance.rundownId,
						partInstance.segmentId,
						partInstance.part._id,
						true,
						true
					)
					expect(innerStartAdLibPieceMock).toHaveBeenCalledTimes(1)

					// check some properties not exposed to the blueprints
					const newPieceInstance = cache.PieceInstances.findOne(
						protectString(newPieceInstanceId)
					) as PieceInstance
					expect(newPieceInstance.dynamicallyInserted).toBeTruthy()
					expect(newPieceInstance.partInstanceId).toEqual(partInstance._id)
				})
			})
		})

		describe('updatePieceInstance', () => {
			testInFiber('bad parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

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
					cache.Playlist.update({ $set: { currentPartInstanceId: pieceInstance.partInstanceId } })
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
					cache.Playlist.update({ $set: { currentPartInstanceId: null } })
					cache.Playlist.update({ $set: { nextPartInstanceId: pieceInstance.partInstanceId } })
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
					cache.Playlist.update({ $set: { nextPartInstanceId: null } })
					cache.Playlist.update({ $set: { previousPartInstanceId: pieceInstance.partInstanceId } })
					expect(() =>
						context.updatePieceInstance(unprotectString(pieceInstance._id), { sourceLayerId: 'new' })
					).toThrowError('Can only update piece instances in current or next part instance')
					expect(() =>
						context.updatePieceInstance(unprotectString(pieceInstanceOther._id), { sourceLayerId: 'new' })
					).toThrowError('Can only update piece instances in current or next part instance')
				})
			})

			testInFiber('good', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					// Setup the rundown and find a piece to modify
					const pieceInstance0 = cache.PieceInstances.findOne() as PieceInstance
					expect(pieceInstance0).toBeTruthy()
					cache.Playlist.update({ $set: { currentPartInstanceId: pieceInstance0.partInstanceId } })

					// Ensure there are no pending updates already
					expect(cache.PieceInstances.isModified()).toBeFalsy()

					// Update it and expect it to match
					const pieceInstance0Before = clone(pieceInstance0)
					const pieceInstance0Delta = {
						_id: 'sdf', // This will be dropped
						sourceLayerId: 'new',
						enable: { start: 99, end: 123 },
						badProperty: 9, // This will be dropped
					}
					const resultPiece = context.updatePieceInstance(
						unprotectString(pieceInstance0._id),
						pieceInstance0Delta
					)
					const pieceInstance1 = cache.PieceInstances.findOne(pieceInstance0._id) as PieceInstance
					expect(pieceInstance1).toBeTruthy()

					expect(resultPiece).toEqual(pieceInstance1)
					const pieceInstance0After = {
						...pieceInstance0Before,
						piece: {
							...pieceInstance0Before.piece,
							..._.omit(pieceInstance0Delta, 'badProperty', '_id'),
						},
					}
					expect(pieceInstance1).toEqual(pieceInstance0After)
					expect(
						Array.from(cache.PieceInstances.documents.values()).filter((doc) => !doc || !!doc.updated)
					).toMatchObject([
						{
							updated: true,
							document: { _id: pieceInstance1._id },
						},
					])

					expect(context.nextPartState).toEqual(ActionPartChange.NONE)
					expect(context.currentPartState).toEqual(ActionPartChange.SAFE_CHANGE)
				})
			})
		})

		describe('queuePart', () => {
			beforeEach(() => {
				postProcessPiecesMock.mockClear()
				innerStartAdLibPieceMock.mockClear()
				innerStartQueuedAdLibMock.mockClear()
			})

			testInFiber('bad parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					// No next-part
					// @ts-ignore
					expect(() => context.queuePart()).toThrowError('Cannot queue part when no current partInstance')

					const partInstance = cache.PartInstances.findOne() as PartInstance
					expect(partInstance).toBeTruthy()
					cache.Playlist.update({ $set: { currentPartInstanceId: partInstance._id } })

					// Next part has already been modified
					context.nextPartState = ActionPartChange.SAFE_CHANGE
					// @ts-ignore
					expect(() => context.queuePart('previous')).toThrowError(
						'Cannot queue part when next part has already been modified'
					)
					context.nextPartState = ActionPartChange.NONE

					expect(() => context.queuePart({} as any, [])).toThrowError(
						'New part must contain at least one piece'
					)

					// expect(
					// 	context.queuePart(
					// 		// @ts-ignore
					// 		{
					// 			floated: true,
					// 		},
					// 		[{}]
					// 	).part.floated
					// ).toBeFalsy()
					// expect(
					// 	context.queuePart(
					// 		// @ts-ignore
					// 		{
					// 			invalid: true,
					// 		},
					// 		[{}]
					// 	).part.invalid
					// ).toBeFalsy()

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
					partInstance.part.expectedDuration = 700
					partInstance.timings = {
						startedPlayback: getCurrentTime(),
						stoppedPlayback: undefined,
						playOffset: 0,
						take: undefined,
						takeDone: undefined,
						takeOut: undefined,
						next: undefined,
					}
					expect(isTooCloseToAutonext(partInstance, true)).toBeTruthy()
					expect(() => context.queuePart({} as any, [{}] as any)).toThrowError(
						'Too close to an autonext to queue a part'
					)

					expect(context.nextPartState).toEqual(ActionPartChange.NONE)
					expect(context.currentPartState).toEqual(ActionPartChange.NONE)
				})
			})
			testInFiber('good', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					const partInstance = cache.PartInstances.findOne() as PartInstance
					expect(partInstance).toBeTruthy()
					cache.Playlist.update({ $set: { currentPartInstanceId: partInstance._id } })

					const newPiece: IBlueprintPiece = {
						name: 'test piece',
						sourceLayerId: 'sl1',
						outputLayerId: 'o1',
						externalId: '-',
						enable: { start: 0 },
						lifespan: PieceLifespan.OutOnRundownEnd,
						content: {
							timelineObjects: [],
						},
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
					expect(context.queuePart(newPart, [newPiece])._id).toEqual(cache.Playlist.doc.nextPartInstanceId)

					expect(postProcessPiecesMock).toHaveBeenCalledTimes(1)
					expect(innerStartAdLibPieceMock).toHaveBeenCalledTimes(0)
					expect(innerStartQueuedAdLibMock).toHaveBeenCalledTimes(1)

					// Verify some properties not exposed to the blueprints
					const newPartInstance = cache.PartInstances.findOne(
						cache.Playlist.doc.nextPartInstanceId!
					) as PartInstance
					expect(newPartInstance).toBeTruthy()
					expect(newPartInstance.part._rank).toBeLessThan(9000)
					expect(newPartInstance.part._rank).toBeGreaterThan(partInstance.part._rank)
					expect(newPartInstance.orphaned).toEqual('adlib-part')

					const newNextPartInstances = context.getPieceInstances('next')
					expect(newNextPartInstances).toHaveLength(1)
					// @ts-ignore
					expect(newNextPartInstances[0].partInstanceId).toEqual(newPartInstance._id)

					expect(context.nextPartState).toEqual(ActionPartChange.SAFE_CHANGE)
					expect(context.currentPartState).toEqual(ActionPartChange.NONE)
				})
			})
		})

		describe('stopPiecesOnLayers', () => {
			testInFiber('invalid parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					// Bad instance id
					cache.Playlist.update({ $set: { currentPartInstanceId: protectString('abc') } })
					expect(() => context.stopPiecesOnLayers(['lay1'], 34)).toThrowError(
						'Cannot stop pieceInstances when no current partInstance'
					)

					cache.Playlist.update({ $set: { currentPartInstanceId: null } })

					innerStopPiecesMock.mockClear()
					expect(context.stopPiecesOnLayers(['lay1'], 34)).toEqual([])
					expect(innerStopPiecesMock).toHaveBeenCalledTimes(0)

					expect(context.nextPartState).toEqual(ActionPartChange.NONE)
					expect(context.currentPartState).toEqual(ActionPartChange.NONE)
				})
			})
			testInFiber('valid parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					const currentPartInstance = cache.PartInstances.findOne() as PartInstance
					expect(currentPartInstance).toBeTruthy()
					cache.Playlist.update({ $set: { currentPartInstanceId: currentPartInstance._id } })

					innerStopPiecesMock.mockClear()
					let filter: (piece: PieceInstance) => boolean = null as any
					innerStopPiecesMock.mockImplementationOnce(
						(cache2, showStyleBase, partInstance, filter2, offset) => {
							expect(cache2).toBe(cache)
							expect(showStyleBase).toBeTruthy()
							expect(partInstance).toBe(currentPartInstance)
							expect(offset).toEqual(34)
							filter = filter2

							return [protectString('result1')]
						}
					)

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
		})

		describe('stopPieceInstances', () => {
			testInFiber('invalid parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					// Bad instance id
					cache.Playlist.update({ $set: { currentPartInstanceId: protectString('abc') } })
					expect(() => context.stopPieceInstances(['lay1'], 34)).toThrowError(
						'Cannot stop pieceInstances when no current partInstance'
					)

					cache.Playlist.update({ $set: { currentPartInstanceId: null } })

					innerStopPiecesMock.mockClear()
					expect(context.stopPieceInstances(['lay1'], 34)).toEqual([])
					expect(innerStopPiecesMock).toHaveBeenCalledTimes(0)

					expect(context.nextPartState).toEqual(ActionPartChange.NONE)
					expect(context.currentPartState).toEqual(ActionPartChange.NONE)
				})
			})
			testInFiber('valid parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					const currentPartInstance = cache.PartInstances.findOne() as PartInstance
					expect(currentPartInstance).toBeTruthy()
					cache.Playlist.update({ $set: { currentPartInstanceId: currentPartInstance._id } })

					innerStopPiecesMock.mockClear()
					let filter: (piece: PieceInstance) => boolean = null as any
					innerStopPiecesMock.mockImplementationOnce(
						(cache2, showStyleBase, partInstance, filter2, offset) => {
							expect(cache2).toBe(cache)
							expect(showStyleBase).toBeTruthy()
							expect(partInstance).toBe(currentPartInstance)
							expect(offset).toEqual(34)
							filter = filter2

							return [protectString('result1')]
						}
					)

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
		describe('removePieceInstances', () => {
			testInFiber('invalid parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					// No instance id
					cache.Playlist.update({ $set: { nextPartInstanceId: null } })
					expect(() => context.removePieceInstances('next', ['lay1'])).toThrowError(
						'Cannot remove pieceInstances when no selected partInstance'
					)

					// Ensure missing/bad ids dont delete anything
					const beforePieceInstancesCount = cache.PieceInstances.findFetch().length // Because only those frm current, next, prev are included..
					expect(beforePieceInstancesCount).not.toEqual(0)

					cache.Playlist.update({ $set: { nextPartInstanceId: protectString('abc') } })
					expect(context.removePieceInstances('next', [])).toEqual([])
					expect(
						context.removePieceInstances('next', [unprotectString(cache.PieceInstances.findOne()!._id)])
					).toEqual([]) // Try and remove something belonging to a different part
					expect(cache.PieceInstances.findFetch().length).toEqual(beforePieceInstancesCount)
				})
			})

			testInFiber('good', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					expect(cache.PieceInstances.findFetch().length).not.toEqual(0)

					// Find the instance, and create its backing piece
					const targetPieceInstance = cache.PieceInstances.findOne() as PieceInstance
					expect(targetPieceInstance).toBeTruthy()

					cache.Playlist.update({ $set: { nextPartInstanceId: targetPieceInstance.partInstanceId } })
					expect(context.removePieceInstances('next', [unprotectString(targetPieceInstance._id)])).toEqual([
						unprotectString(targetPieceInstance._id),
					])

					// Ensure it was all removed
					expect(cache.PieceInstances.findOne(targetPieceInstance._id)).toBeFalsy()
					expect(context.nextPartState).toEqual(ActionPartChange.SAFE_CHANGE)
				})
			})
		})

		describe('updatePartInstance', () => {
			testInFiber('bad parameters', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					const partInstance = cache.PartInstances.findOne() as PartInstance
					expect(partInstance).toBeTruthy()
					const partInstanceOther = cache.PartInstances.findOne({
						_id: { $ne: partInstance._id },
					}) as PartInstance
					expect(partInstanceOther).toBeTruthy()

					expect(() => context.updatePartInstance('current', {})).toThrowError(
						'Some valid properties must be defined'
					)
					expect(() => context.updatePartInstance('current', { _id: 'bad', nope: 'ok' } as any)).toThrowError(
						'Some valid properties must be defined'
					)
					expect(() => context.updatePartInstance('current', { title: 'new' })).toThrowError(
						'PartInstance could not be found'
					)

					// Set a current part instance
					cache.Playlist.update({ $set: { currentPartInstanceId: partInstance._id } })
					expect(() => context.updatePartInstance('next', { title: 'new' })).toThrowError(
						'PartInstance could not be found'
					)
					context.updatePartInstance('current', { title: 'new' })
				})
			})
			testInFiber('good', async () => {
				await wrapWithCache(async (cache) => {
					const { context } = await getActionExecutionContext(cache)

					// Setup the rundown and find an instance to modify
					const partInstance0 = cache.PartInstances.findOne() as PartInstance
					expect(partInstance0).toBeTruthy()
					cache.Playlist.update({ $set: { nextPartInstanceId: partInstance0._id } })

					// Ensure there are no pending updates already
					expect(cache.PartInstances.isModified()).toBeFalsy()

					// Update it and expect it to match
					const partInstance0Before = clone(partInstance0)
					const partInstance0Delta = {
						_id: 'sdf', // This will be dropped
						title: 'abc',
						expectedDuration: 1234,
						classes: ['123'],
						badProperty: 9, // This will be dropped
					}
					const resultPiece = context.updatePartInstance('next', partInstance0Delta)
					const partInstance1 = cache.PartInstances.findOne() as PartInstance
					expect(partInstance1).toBeTruthy()

					expect(resultPiece).toEqual(partInstance1)

					const pieceInstance0After = {
						...partInstance0Before,
						part: {
							...partInstance0Before.part,
							..._.omit(partInstance0Delta, 'badProperty', '_id'),
						},
					}
					expect(partInstance1).toEqual(pieceInstance0After)
					expect(
						Array.from(cache.PartInstances.documents.values()).filter((doc) => !doc || !!doc.updated)
					).toMatchObject([
						{
							updated: true,
							document: { _id: partInstance1._id },
						},
					])

					expect(context.nextPartState).toEqual(ActionPartChange.SAFE_CHANGE)
					expect(context.currentPartState).toEqual(ActionPartChange.NONE)
				})
			})
		})
	})
})
