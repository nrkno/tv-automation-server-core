import { PartInstance } from '../../../../lib/collections/PartInstances'
import { Part } from '../../../../lib/collections/Parts'
import { DBSegment, SegmentId } from '../../../../lib/collections/Segments'
import { protectString } from '../../../../lib/lib'
import { PartsAndSegments, selectNextPart } from '../lib'

class MockPart {
	constructor(
		public _id: string,
		public _rank: number,
		public segmentId: SegmentId,
		public playable: boolean = true
	) {}

	get invalid(): boolean {
		return !this.playable
	}

	toPartInstance() {
		return {
			part: this,
			segmentId: this.segmentId,
		} as unknown as PartInstance
	}
}
class MockSegment {
	constructor(public _id: SegmentId, public _rank: number) {}
}

describe('selectNextPart', () => {
	let defaultPlaylist: Parameters<typeof selectNextPart>[0]

	const segment1: SegmentId = protectString('segment1')
	const segment2: SegmentId = protectString('segment2')
	const segment3: SegmentId = protectString('segment3')

	let defaultParts: MockPart[]
	let defaultSegments: MockSegment[]

	beforeEach(() => {
		defaultPlaylist = {
			nextSegmentId: undefined,
			loop: false,
		}

		defaultParts = [
			new MockPart('part1', 1, segment1),
			new MockPart('part2', 2, segment1),
			new MockPart('part3', 3, segment1),
			new MockPart('part4', 4, segment2, false),
			new MockPart('part5', 5, segment2),
			new MockPart('part6', 6, segment2),
			new MockPart('part7', 7, segment3),
			new MockPart('part8', 8, segment3, false),
			new MockPart('part9', 9, segment3),
		]
		defaultSegments = [new MockSegment(segment1, 1), new MockSegment(segment2, 2), new MockSegment(segment3, 3)]
	})

	function getSegmentsAndParts(): PartsAndSegments {
		return {
			parts: [...(defaultParts as unknown as Part[])],
			segments: [...(defaultSegments as unknown as DBSegment[])],
		}
	}

	test('from nothing', () => {
		{
			// default
			const nextPart = selectNextPart(defaultPlaylist, null, getSegmentsAndParts())
			expect(nextPart).toEqual({ index: 0, part: defaultParts[0] })
		}

		{
			// first isnt playable
			defaultParts[0].playable = false
			const nextPart = selectNextPart(defaultPlaylist, null, getSegmentsAndParts())
			expect(nextPart).toEqual({ index: 1, part: defaultParts[1] })
		}

		{
			// nextSegmentId is set
			defaultPlaylist.nextSegmentId = segment3
			const nextPart = selectNextPart(defaultPlaylist, null, getSegmentsAndParts())
			expect(nextPart).toEqual({ index: 6, part: defaultParts[6], consumesNextSegmentId: true })
		}

		{
			// nextSegmentId is set (and first there isnt playable)
			defaultPlaylist.nextSegmentId = segment2
			const nextPart = selectNextPart(defaultPlaylist, null, getSegmentsAndParts())
			expect(nextPart).toEqual({ index: 4, part: defaultParts[4], consumesNextSegmentId: true })
		}
	})

	test('from nothing - allow unplayable', () => {
		{
			// default
			const nextPart = selectNextPart(defaultPlaylist, null, getSegmentsAndParts(), false)
			expect(nextPart).toEqual({ index: 0, part: defaultParts[0] })
		}

		{
			// first isnt playable
			defaultParts[0].playable = false
			const nextPart = selectNextPart(defaultPlaylist, null, getSegmentsAndParts(), false)
			expect(nextPart).toEqual({ index: 0, part: defaultParts[0] })
		}

		{
			// nextSegmentId is set
			defaultPlaylist.nextSegmentId = segment3
			const nextPart = selectNextPart(defaultPlaylist, null, getSegmentsAndParts(), false)
			expect(nextPart).toEqual({ index: 6, part: defaultParts[6], consumesNextSegmentId: true })
		}

		{
			// nextSegmentId is set (and first there isnt playable)
			defaultPlaylist.nextSegmentId = segment2
			const nextPart = selectNextPart(defaultPlaylist, null, getSegmentsAndParts(), false)
			expect(nextPart).toEqual({ index: 3, part: defaultParts[3], consumesNextSegmentId: true })
		}
	})

	test('from partInstance', () => {
		const previousPartInstance = defaultParts[4].toPartInstance()
		{
			// default
			const nextPart = selectNextPart(defaultPlaylist, previousPartInstance, getSegmentsAndParts())
			expect(nextPart).toEqual({ index: 5, part: defaultParts[5] })
		}

		{
			// next isnt playable
			defaultParts[5].playable = false
			const nextPart = selectNextPart(defaultPlaylist, previousPartInstance, getSegmentsAndParts())
			expect(nextPart).toEqual({ index: 6, part: defaultParts[6] })
		}

		{
			// nextSegmentId is set
			defaultParts[0].playable = false
			defaultPlaylist.nextSegmentId = segment1
			const nextPart = selectNextPart(defaultPlaylist, previousPartInstance, getSegmentsAndParts())
			expect(nextPart).toEqual({ index: 1, part: defaultParts[1], consumesNextSegmentId: true })
		}

		{
			// nextSegmentId is set (and first there isnt playable)
			defaultPlaylist.nextSegmentId = segment2
			const nextPart = selectNextPart(defaultPlaylist, previousPartInstance, getSegmentsAndParts())
			expect(nextPart).toEqual({ index: 4, part: defaultParts[4], consumesNextSegmentId: true })
		}
	})

	test('from partInstance - orphaned', () => {
		const previousPartInstance = defaultParts[4].toPartInstance()
		defaultParts.splice(4, 1)
		previousPartInstance.orphaned = 'deleted'

		{
			// single part is orphaned
			const nextPart = selectNextPart(defaultPlaylist, previousPartInstance, getSegmentsAndParts())
			expect(nextPart).toEqual({ index: 4, part: defaultParts[4] })
		}

		{
			// whole segment is orphaned/deleted
			defaultParts = defaultParts.filter((p) => p.segmentId !== previousPartInstance.segmentId)
			const nextPart = selectNextPart(defaultPlaylist, previousPartInstance, getSegmentsAndParts())
			expect(nextPart).toEqual({ index: 3, part: defaultParts[3] })
		}

		{
			// no parts after
			defaultParts = defaultParts.filter((p) => p.segmentId !== segment3)
			const nextPart = selectNextPart(defaultPlaylist, previousPartInstance, getSegmentsAndParts())
			expect(nextPart).toEqual(null)
		}

		{
			// no parts after, but looping
			defaultPlaylist.loop = true
			defaultParts = defaultParts.filter((p) => p.segmentId !== segment3)
			const nextPart = selectNextPart(defaultPlaylist, previousPartInstance, getSegmentsAndParts())
			expect(nextPart).toEqual({ index: 0, part: defaultParts[0] })
		}
	})

	test('from partInstance - allow unplayable', () => {
		const previousPartInstance = defaultParts[4].toPartInstance()
		{
			// default
			const nextPart = selectNextPart(defaultPlaylist, previousPartInstance, getSegmentsAndParts(), false)
			expect(nextPart).toEqual({ index: 5, part: defaultParts[5] })
		}

		{
			// next isnt playable
			defaultParts[5].playable = false
			const nextPart = selectNextPart(defaultPlaylist, previousPartInstance, getSegmentsAndParts(), false)
			expect(nextPart).toEqual({ index: 5, part: defaultParts[5] })
		}
	})
})
