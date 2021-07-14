import { literal, protectString, getRandomId } from '../../../../lib/lib'
import { setupDefaultStudioEnvironment, LAYER_IDS, DefaultEnvironment } from '../../../../__mocks__/helpers/database'
import { DBPart, Parts, PartId } from '../../../../lib/collections/Parts'
import { VTContent, PieceLifespan, WithTimeline, ExpectedPackage } from '@sofie-automation/blueprints-integration'
import { Segments, DBSegment } from '../../../../lib/collections/Segments'
import { Pieces, Piece, PieceId } from '../../../../lib/collections/Pieces'
import { RundownAPI } from '../../../../lib/api/rundown'
import { ExpectedMediaItems } from '../../../../lib/collections/ExpectedMediaItems'
import { testInFiber, beforeAllInFiber } from '../../../../__mocks__/helpers/jest'
import { AdLibPieces, AdLibPiece } from '../../../../lib/collections/AdLibPieces'
import { RundownPlaylists, RundownPlaylistId } from '../../../../lib/collections/RundownPlaylists'
import {
	defaultRundownPlaylist,
	defaultRundown,
	defaultSegment,
	defaultPart,
	defaultPiece,
	defaultAdLibPiece,
} from '../../../../__mocks__/defaultCollectionObjects'
import { runIngestOperationFromRundown } from '../lockFunction'
import { updateExpectedPackagesOnRundown } from '../expectedPackages'
import { ExpectedPackages } from '../../../../lib/collections/ExpectedPackages'
import { DBRundown, RundownId, Rundowns } from '../../../../lib/collections/Rundowns'
require('../expectedMediaItems') // include in order to create the Meteor methods needed

describe('Expected Media Items', () => {
	const rplId0: RundownPlaylistId = protectString('playlist0')
	const rplId1: RundownPlaylistId = protectString('playlist1')
	const rdExtId0 = 'rundown0'
	const rdExtId1 = 'rundown1'
	let rdId0: RundownId = protectString('rundown0')
	// let rdId1: RundownId = protectString('rundown1')
	const mockPart0: PartId = protectString('mockPart0')
	const mockPiece0: PieceId = protectString('mockPiece0')
	const mockPart1: PartId = protectString('mockPart1')
	const mockPiece1: PieceId = protectString('mockPiece1')
	const mockAdLibPiece0: PieceId = protectString('mockAdLib0')

	const mockBase = '\\RAZ_DWA_TRZY\\C\\'
	const mockFileName0 = 'mockFileName0'
	const mockPath0 = mockBase + mockFileName0
	const mockFileName1 = 'mockFileName1'
	const mockPath1 = mockBase + mockFileName1

	const mockFlow0 = 'mockFlow0'
	const mockFlow1 = 'mockFlow1'

	let env: DefaultEnvironment
	beforeAll(async () => {
		env = await setupDefaultStudioEnvironment()
	})

	const getExpectedPackage = (id: string, filePath: string) => {
		return literal<ExpectedPackage.ExpectedPackageMediaFile>({
			_id: id,
			layers: ['layer0'],
			contentVersionHash: 'abc',
			type: ExpectedPackage.PackageType.MEDIA_FILE,
			content: {
				filePath: filePath,
			},
			version: {},
			sources: [
				{
					containerId: 'source0',
					accessors: {},
				},
			],
			sideEffect: {},
		})
	}

	function setupRundown(rdId: string, rplId: RundownPlaylistId) {
		RundownPlaylists.insert({
			...defaultRundownPlaylist(rplId, env.studio._id),
			externalId: 'mock_rpl',
			name: 'Mock Playlist',

			// currentPartInstanceId: protectString(''),
			// previousPartInstanceId: protectString(''),
			// nextPartInstanceId: protectString(''),
			activationId: protectString('active'),
		})

		const rd = literal<DBRundown>({
			...defaultRundown(
				rdId,
				env.studio._id,
				env.ingestDevice._id,
				rplId,
				env.showStyleBase._id,
				env.showStyleVariant._id
			),
		})
		Rundowns.insert(rd)
		Segments.insert(
			literal<DBSegment>({
				...defaultSegment(getRandomId(), rd._id),
				_rank: 1,
			})
		)
		Parts.insert(
			literal<DBPart>({
				...defaultPart(protectString(rdId + '_' + mockPart0), rd._id, protectString('segment1')),
				_rank: 1,
				title: '',
			})
		)
		Pieces.insert(
			literal<Piece>({
				...defaultPiece(
					protectString(rdId + '_' + mockPiece0),
					rd._id,
					protectString(''),
					protectString(rdId + '_' + mockPart0)
				),
				name: '',
				outputLayerId: LAYER_IDS.OUTPUT_PGM,
				sourceLayerId: LAYER_IDS.SOURCE_VT0,
				status: RundownAPI.PieceStatusCode.UNKNOWN,
				lifespan: PieceLifespan.OutOnSegmentChange,
				content: literal<WithTimeline<VTContent>>({
					fileName: mockFileName0,
					path: mockPath0,
					mediaFlowIds: [mockFlow0, mockFlow1],
					sourceDuration: 0,
					timelineObjects: [],
				}),
				expectedPackages: [getExpectedPackage('id0', mockPath0), getExpectedPackage('id1', mockPath0)],
			})
		)
		Parts.insert(
			literal<DBPart>({
				...defaultPart(protectString(rdId + '_' + mockPart1), rd._id, protectString('segment1')),
				_rank: 1,
				externalId: '',
				title: '',
			})
		)
		Pieces.insert(
			literal<Piece>({
				...defaultPiece(
					protectString(rdId + '_' + mockPiece1),
					rd._id,
					protectString(''),
					protectString(rdId + '_' + mockPart1)
				),
				name: '',
				outputLayerId: LAYER_IDS.OUTPUT_PGM,
				sourceLayerId: LAYER_IDS.SOURCE_VT0,
				status: RundownAPI.PieceStatusCode.UNKNOWN,
				lifespan: PieceLifespan.OutOnSegmentChange,
				content: literal<WithTimeline<VTContent>>({
					fileName: mockFileName1,
					path: mockPath1,
					mediaFlowIds: [mockFlow0],
					sourceDuration: 0,
					timelineObjects: [],
				}),
				expectedPackages: [getExpectedPackage('id0', mockPath1)],
			})
		)
		AdLibPieces.insert(
			literal<AdLibPiece>({
				...defaultAdLibPiece(
					protectString(rdId + '_' + mockAdLibPiece0),
					rd._id,
					protectString(rdId + '_' + mockPart1)
				),
				_id: protectString(rdId + '_' + mockAdLibPiece0),
				name: '',
				_rank: 0,
				lifespan: PieceLifespan.WithinPart,
				outputLayerId: LAYER_IDS.OUTPUT_PGM,
				sourceLayerId: LAYER_IDS.SOURCE_VT0,
				status: RundownAPI.PieceStatusCode.UNKNOWN,
				content: literal<WithTimeline<VTContent>>({
					fileName: mockFileName1,
					path: mockPath1,
					mediaFlowIds: [mockFlow0],
					sourceDuration: 0,
					timelineObjects: [],
				}),
				expectedPackages: [getExpectedPackage('id0', mockPath1)],
			})
		)
		return rd._id
	}

	beforeAllInFiber(() => {
		rdId0 = setupRundown(rdExtId0, rplId0)
		setupRundown(rdExtId1, rplId1)
	})

	describe('Based on a Rundown', () => {
		testInFiber('Generates ExpectedPackages(/ExpectedMediaItems) based on a Rundown', () => {
			const rundown = Rundowns.findOne(rdId0) as DBRundown
			expect(rundown).toBeTruthy()

			runIngestOperationFromRundown('test', rundown, async (cache) => updateExpectedPackagesOnRundown(cache))

			const packages = ExpectedPackages.find({
				rundownId: rdId0,
				studioId: env.studio._id,
			}).fetch()
			expect(packages).toHaveLength(4)

			// to be deprecated:
			const items = ExpectedMediaItems.find({
				rundownId: rdId0,
				studioId: env.studio._id,
			}).fetch()
			expect(items).toHaveLength(4)
		})
		// testInFiber('Removes associated ExpectedMediaItems if a Rundown has been removed', () => {
		// 	const rd = Rundowns.findOne(rdId0)
		// 	if (!rd) {
		// 		fail()
		// 		return
		// 	}
		// 	const cache = waitForPromise(initCacheForRundownPlaylistFromRundown(rdId0))
		// 	removeRundownFromCache(cache, rd)
		// 	updateExpectedPackagesOnRundown(cache)

		// 	waitForPromise(cache.saveAllToDatabase())
		// 	const items = ExpectedMediaItems.find({
		// 		rundownId: rdId0,
		// 		studioId: env.studio._id,
		// 	}).fetch()
		// 	expect(items).toHaveLength(0)
		// })
	})
})
