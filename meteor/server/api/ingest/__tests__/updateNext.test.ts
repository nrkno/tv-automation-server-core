import { testInFiber } from '../../../../__mocks__/helpers/jest'
import { Rundowns, RundownId } from '../../../../lib/collections/Rundowns'
import { Segments, DBSegment } from '../../../../lib/collections/Segments'
import { Parts, DBPart } from '../../../../lib/collections/Parts'
import { literal, protectString, waitForPromise } from '../../../../lib/lib'
import { ensureNextPartIsValid as ensureNextPartIsValidRaw } from '../updateNext'
import { ServerPlayoutAPI } from '../../playout/playout'
import { RundownPlaylists, RundownPlaylistId } from '../../../../lib/collections/RundownPlaylists'
import { PartInstances, DBPartInstance, PartInstanceId } from '../../../../lib/collections/PartInstances'
import { Studios } from '../../../../lib/collections/Studios'
import { defaultStudio } from '../../../../__mocks__/defaultCollectionObjects'
import { removeRundownsFromDb } from '../../rundownPlaylist'
import { PlayoutLockFunctionPriority, runPlayoutOperationWithCache } from '../../playout/lockFunction'
import { saveIntoDb } from '../../../lib/database'
jest.mock('../../playout/playout')

require('../../peripheralDevice.ts') // include in order to create the Meteor methods needed

const rundownId: RundownId = protectString('mock_ro')
const rundownPlaylistId: RundownPlaylistId = protectString('mock_rpl')
async function createMockRO(): Promise<RundownId> {
	const existing = Rundowns.findOne(rundownId)
	if (existing) await removeRundownsFromDb([existing._id])

	Studios.insert({
		...defaultStudio(protectString('mock_studio')),
		name: 'mock studio',
	})

	RundownPlaylists.insert({
		_id: rundownPlaylistId,
		externalId: 'mock_rpl',
		name: 'Mock',
		studioId: protectString('mock_studio'),
		created: 0,
		modified: 0,
		currentPartInstanceId: null,
		nextPartInstanceId: null,
		previousPartInstanceId: null,
		activationId: protectString('active'),
	})

	Rundowns.insert({
		_id: rundownId,
		externalId: 'mock_ro',
		name: 'Mock',
		studioId: protectString('mock_studio'),
		showStyleBaseId: protectString(''),
		showStyleVariantId: protectString(''),
		peripheralDeviceId: protectString(''),
		created: 0,
		modified: 0,
		importVersions: {} as any,
		playlistId: rundownPlaylistId,
		_rank: 0,
		externalNRCSName: 'mockNRCS',
		organizationId: protectString(''),
	})

	await saveIntoDb(
		Segments,
		{
			rundownId: rundownId,
		},
		[
			literal<DBSegment>({
				_id: protectString('mock_segment1'),
				_rank: 1,
				externalId: 's1',
				rundownId: rundownId,
				name: 'Segment1',
				externalModified: 1,
			}),
			literal<DBSegment>({
				_id: protectString('mock_segment2'),
				_rank: 2,
				externalId: 's2',
				rundownId: rundownId,
				name: 'Segment2',
				externalModified: 1,
			}),
			literal<DBSegment>({
				_id: protectString('mock_segment3'),
				_rank: 3,
				externalId: 's3',
				rundownId: rundownId,
				name: 'Segment3',
				externalModified: 1,
			}),
			literal<DBSegment>({
				_id: protectString('mock_segment4'),
				_rank: 4,
				externalId: 's4',
				rundownId: rundownId,
				name: 'Segment4',
				externalModified: 1,
			}),
		]
	)

	const rawInstances = [
		// Segment 1
		literal<DBPartInstance>({
			_id: protectString('mock_part_instance1'),
			rundownId: rundownId,
			segmentId: protectString('mock_segment1'),
			playlistActivationId: protectString('active'),
			segmentPlayoutId: protectString(''),
			takeCount: 0,
			rehearsal: false,
			part: literal<DBPart>({
				_id: protectString('mock_part1'),
				_rank: 1,
				rundownId: rundownId,
				segmentId: protectString('mock_segment1'),
				externalId: 'p1',
				title: 'Part 1',
			}),
		}),
		literal<DBPartInstance>({
			_id: protectString('mock_part_instance2'),
			rundownId: rundownId,
			segmentId: protectString('mock_segment1'),
			playlistActivationId: protectString('active'),
			segmentPlayoutId: protectString(''),
			takeCount: 0,
			rehearsal: false,
			part: literal<DBPart>({
				_id: protectString('mock_part2'),
				_rank: 2,
				rundownId: rundownId,
				segmentId: protectString('mock_segment1'),
				externalId: 'p2',
				title: 'Part 2',
			}),
		}),
		literal<DBPartInstance>({
			_id: protectString('mock_part_instance3'),
			rundownId: rundownId,
			segmentId: protectString('mock_segment1'),
			playlistActivationId: protectString('active'),
			segmentPlayoutId: protectString(''),
			takeCount: 0,
			rehearsal: false,
			part: literal<DBPart>({
				_id: protectString('mock_part3'),
				_rank: 3,
				rundownId: rundownId,
				segmentId: protectString('mock_segment1'),
				externalId: 'p3',
				title: 'Part 3',
			}),
		}),
		// Segment 2
		literal<DBPartInstance>({
			_id: protectString('mock_part_instance4'),
			rundownId: rundownId,
			segmentId: protectString('mock_segment2'),
			playlistActivationId: protectString('active'),
			segmentPlayoutId: protectString(''),
			takeCount: 0,
			rehearsal: false,
			part: literal<DBPart>({
				_id: protectString('mock_part4'),
				_rank: 0,
				rundownId: rundownId,
				segmentId: protectString('mock_segment2'),
				externalId: 'p4',
				title: 'Part 4',
			}),
		}),
		literal<DBPartInstance>({
			_id: protectString('mock_part_instance5'),
			rundownId: rundownId,
			segmentId: protectString('mock_segment2'),
			playlistActivationId: protectString('active'),
			segmentPlayoutId: protectString(''),
			takeCount: 0,
			rehearsal: false,
			part: literal<DBPart>({
				_id: protectString('mock_part5'),
				_rank: 1,
				rundownId: rundownId,
				segmentId: protectString('mock_segment2'),
				externalId: 'p5',
				title: 'Part 5',
			}),
		}),
		// Segment 3
		literal<DBPartInstance>({
			_id: protectString('mock_part_instance6'),
			rundownId: rundownId,
			segmentId: protectString('mock_segment3'),
			playlistActivationId: protectString('active'),
			segmentPlayoutId: protectString(''),
			takeCount: 0,
			rehearsal: false,
			part: literal<DBPart>({
				_id: protectString('mock_part6'),
				_rank: 0,
				rundownId: rundownId,
				segmentId: protectString('mock_segment3'),
				externalId: 'p6',
				title: 'Part 6',
			}),
		}),
		// Segment 4
		literal<DBPartInstance>({
			_id: protectString('mock_part_instance7'),
			rundownId: rundownId,
			segmentId: protectString('mock_segment4'),
			playlistActivationId: protectString('active'),
			segmentPlayoutId: protectString(''),
			takeCount: 0,
			rehearsal: false,
			part: literal<DBPart>({
				_id: protectString('mock_part7'),
				_rank: 0,
				rundownId: rundownId,
				segmentId: protectString('mock_segment4'),
				externalId: 'p7',
				title: 'Part 7',
			}),
		}),
		literal<DBPartInstance>({
			_id: protectString('mock_part_instance8'),
			rundownId: rundownId,
			segmentId: protectString('mock_segment4'),
			playlistActivationId: protectString('active'),
			segmentPlayoutId: protectString(''),
			takeCount: 0,
			rehearsal: false,
			part: literal<DBPart>({
				_id: protectString('mock_part8'),
				_rank: 1,
				rundownId: rundownId,
				segmentId: protectString('mock_segment4'),
				externalId: 'p8',
				title: 'Part 8',
				floated: true,
			}),
		}),
		literal<DBPartInstance>({
			_id: protectString('mock_part_instance9'),
			rundownId: rundownId,
			segmentId: protectString('mock_segment4'),
			playlistActivationId: protectString('active'),
			segmentPlayoutId: protectString(''),
			takeCount: 0,
			rehearsal: false,
			part: literal<DBPart>({
				_id: protectString('mock_part9'),
				_rank: 2,
				rundownId: rundownId,
				segmentId: protectString('mock_segment4'),
				externalId: 'p9',
				title: 'Part 9',
			}),
		}),

		literal<DBPartInstance>({
			_id: protectString('orphan_part_instance1'), // after mock_part_instance8
			rundownId: rundownId,
			segmentId: protectString('mock_segment4'),
			playlistActivationId: protectString('active'),
			segmentPlayoutId: protectString(''),
			takeCount: 0,
			rehearsal: false,
			part: literal<DBPart>({
				_id: protectString('orphan_1'),
				_rank: 1.5,
				rundownId: rundownId,
				segmentId: protectString('mock_segment4'),
				externalId: 'o1',
				title: 'Orphan 1',
			}),
			orphaned: 'adlib-part',
		}),
	]

	await saveIntoDb(
		PartInstances,
		{
			rundownId: rundownId,
		},
		rawInstances
	)
	await saveIntoDb(
		Parts,
		{
			rundownId: rundownId,
		},
		rawInstances.filter((p) => !p.orphaned).map((i) => i.part)
	)

	return rundownId
}

describe('ensureNextPartIsValid', () => {
	beforeAll(async () => {
		await createMockRO()
	})
	beforeEach(() => {
		jest.clearAllMocks()
	})

	function resetPartIds(
		currentPartInstanceId: string | PartInstanceId | null,
		nextPartInstanceId: string | PartInstanceId | null,
		nextPartManual?: boolean
	) {
		RundownPlaylists.update(rundownPlaylistId, {
			$set: {
				nextPartInstanceId: nextPartInstanceId as any,
				currentPartInstanceId: currentPartInstanceId as any,
				previousPartInstanceId: null,
				nextPartManual: nextPartManual || false,
			},
		})
	}
	function ensureNextPartIsValid() {
		return waitForPromise(
			runPlayoutOperationWithCache(
				null,
				'ensureNextPartIsValid',
				rundownPlaylistId,
				PlayoutLockFunctionPriority.USER_PLAYOUT,
				null,
				async (cache) => ensureNextPartIsValidRaw(cache)
			)
		)
	}

	testInFiber('Start with null', () => {
		resetPartIds(null, null)

		ensureNextPartIsValid()

		expect(ServerPlayoutAPI.setNextPartInner).toHaveBeenCalledTimes(1)
		expect(ServerPlayoutAPI.setNextPartInner).toHaveBeenCalledWith(
			expect.objectContaining({ PlaylistId: rundownPlaylistId }),
			expect.objectContaining({ _id: 'mock_part1' })
		)
	})
	testInFiber('Missing next PartInstance', () => {
		resetPartIds('mock_part_instance3', 'fake_part')

		ensureNextPartIsValid()

		expect(ServerPlayoutAPI.setNextPartInner).toHaveBeenCalledTimes(1)
		expect(ServerPlayoutAPI.setNextPartInner).toHaveBeenCalledWith(
			expect.objectContaining({ PlaylistId: rundownPlaylistId }),
			expect.objectContaining({ _id: 'mock_part4' })
		)

		// expectNextPartId('mock_part4')
	})
	// testInFiber('Missing distant future part', () => {
	// 	resetPartIds('mock_part_instance3', 'mock_part_instance4')

	// 	UpdateNext.ensureNextPartIsValid(getRundownPlaylist())

	// 	expectNextPartId(null)
	// })
	testInFiber('Missing current PartInstance with valid next', () => {
		resetPartIds('fake_part', 'mock_part_instance4')

		ensureNextPartIsValid()

		expect(ServerPlayoutAPI.setNextPartInner).toHaveBeenCalledTimes(0)
	})
	testInFiber('Missing current and next PartInstance', () => {
		resetPartIds('fake_part', 'not_real_either')

		ensureNextPartIsValid()

		expect(ServerPlayoutAPI.setNextPartInner).toHaveBeenCalledTimes(1)
		expect(ServerPlayoutAPI.setNextPartInner).toHaveBeenCalledWith(
			expect.objectContaining({ PlaylistId: rundownPlaylistId }),
			expect.objectContaining({ _id: 'mock_part1' })
		)
	})
	testInFiber('Ensure correct PartInstance doesnt change', () => {
		resetPartIds('mock_part_instance3', 'mock_part_instance4')

		ensureNextPartIsValid()

		expect(ServerPlayoutAPI.setNextPartInner).not.toHaveBeenCalled()
	})
	testInFiber('Ensure manual PartInstance doesnt change', () => {
		resetPartIds('mock_part_instance3', 'mock_part_instance5', true)

		ensureNextPartIsValid()

		expect(ServerPlayoutAPI.setNextPartInner).not.toHaveBeenCalled()
	})
	testInFiber('Ensure non-manual PartInstance does change', () => {
		resetPartIds('mock_part_instance3', 'mock_part_instance5', false)

		ensureNextPartIsValid()

		expect(ServerPlayoutAPI.setNextPartInner).toHaveBeenCalledTimes(1)
		expect(ServerPlayoutAPI.setNextPartInner).toHaveBeenCalledWith(
			expect.objectContaining({ PlaylistId: rundownPlaylistId }),
			expect.objectContaining({ _id: 'mock_part4' })
		)
	})
	testInFiber('Ensure manual but missing PartInstance does change', () => {
		resetPartIds('mock_part_instance3', 'fake_part', true)

		ensureNextPartIsValid()

		expect(ServerPlayoutAPI.setNextPartInner).toHaveBeenCalledTimes(1)
		expect(ServerPlayoutAPI.setNextPartInner).toHaveBeenCalledWith(
			expect.objectContaining({ PlaylistId: rundownPlaylistId }),
			expect.objectContaining({ _id: 'mock_part4' })
		)
	})
	testInFiber('Ensure manual but floated PartInstance does change', () => {
		resetPartIds('mock_part_instance7', 'mock_part_instance8', true)

		ensureNextPartIsValid()

		expect(ServerPlayoutAPI.setNextPartInner).toHaveBeenCalledTimes(1)
		expect(ServerPlayoutAPI.setNextPartInner).toHaveBeenCalledWith(
			expect.objectContaining({ PlaylistId: rundownPlaylistId }),
			expect.objectContaining({ _id: 'mock_part9' })
		)
	})
	testInFiber('Ensure floated PartInstance does change', () => {
		resetPartIds('mock_part_instance7', 'mock_part_instance8', false)

		ensureNextPartIsValid()

		expect(ServerPlayoutAPI.setNextPartInner).toHaveBeenCalledTimes(1)
		expect(ServerPlayoutAPI.setNextPartInner).toHaveBeenCalledWith(
			expect.objectContaining({ PlaylistId: rundownPlaylistId }),
			expect.objectContaining({ _id: 'mock_part9' })
		)
	})
	testInFiber('Next part instance is orphaned: "deleted"', () => {
		// Insert a temporary instance
		const instanceId: PartInstanceId = protectString('orphaned_first_part')
		PartInstances.insert(
			literal<DBPartInstance>({
				_id: instanceId,
				rundownId: rundownId,
				segmentId: protectString('mock_segment1'),
				playlistActivationId: protectString('active'),
				segmentPlayoutId: protectString(''),
				takeCount: 0,
				rehearsal: false,
				part: literal<DBPart>({
					_id: protectString('orphan_1'),
					_rank: 1.5,
					rundownId: rundownId,
					segmentId: protectString('mock_segment4'),
					externalId: 'o1',
					title: 'Orphan 1',
				}),
				orphaned: 'deleted',
			})
		)

		try {
			resetPartIds(null, instanceId, false)

			ensureNextPartIsValid()

			expect(ServerPlayoutAPI.setNextPartInner).toHaveBeenCalledTimes(1)
			expect(ServerPlayoutAPI.setNextPartInner).toHaveBeenCalledWith(
				expect.objectContaining({ PlaylistId: rundownPlaylistId }),
				expect.objectContaining({ _id: 'mock_part1' })
			)
		} finally {
			// Cleanup to not mess with other tests
			PartInstances.remove(instanceId)
		}
	})
})
