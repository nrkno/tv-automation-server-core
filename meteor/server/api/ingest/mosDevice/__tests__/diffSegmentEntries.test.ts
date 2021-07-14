import * as _ from 'underscore'

import { diffSegmentEntries, compileSegmentEntries } from '../diff'
import { IngestSegment } from '@sofie-automation/blueprints-integration'
import { LocalIngestSegment } from '../../ingestCache'

function clone<T>(o: T): T {
	return JSON.parse(JSON.stringify(o))
}
function recalculateRank(ingestSegments: IngestSegment[]) {
	ingestSegments.sort((a, b) => {
		if (a.rank < b.rank) return -1
		if (a.rank > b.rank) return 1
		return 0
	})
	_.each(ingestSegments, (ingestSegment, i) => {
		ingestSegment.rank = i
	})
}
describe('Ingest: MOS', () => {
	describe('diffSegmentEntries', () => {
		const ingestSegments: LocalIngestSegment[] = [
			{
				rank: 0,
				externalId: 'first',
				name: 'Overblik',
				parts: [
					{
						name: 'AA3D07094F51297F',
						rank: 0,
						externalId:
							'2012R2ENPS8VM;P_ENPSMOS\\W\\F_HOLD ROs\\R_B10067B2-434B-4CF3-AFB1A02EEF8760CB;C355011E-B1E2-425E-AA3D07094F51297F',
						modified: Date.now(),
					},
					{
						name: 'AC9369C6A140CEBB',
						rank: 1,
						externalId:
							'2012R2ENPS8VM;P_ENPSMOS\\W\\F_HOLD ROs\\R_B10067B2-434B-4CF3-AFB1A02EEF8760CB;484B952B-DE0F-40A0-AC9369C6A140CEBB',
						modified: Date.now(),
					},
					{
						name: '8DAE5BF534A0EAD8',
						rank: 2,
						externalId:
							'2012R2ENPS8VM;P_ENPSMOS\\W\\F_HOLD ROs\\R_B10067B2-434B-4CF3-AFB1A02EEF8760CB;F285B8FA-BD5F-492B-8DAE5BF534A0EAD8',
						modified: Date.now(),
					},
					{
						name: 'B7D35BBDBFD9A4D2',
						rank: 3,
						externalId:
							'2012R2ENPS8VM;P_ENPSMOS\\W\\F_HOLD ROs\\R_B10067B2-434B-4CF3-AFB1A02EEF8760CB;AE66B8D8-4595-4CA5-B7D35BBDBFD9A4D2',
						modified: Date.now(),
					},
					{
						name: '8A872A00510269E',
						rank: 4,
						externalId:
							'2012R2ENPS8VM;P_ENPSMOS\\W\\F_HOLD ROs\\R_B10067B2-434B-4CF3-AFB1A02EEF8760CB;5C4EE8B8-5459-4A94-8A872A00510269E8',
						modified: Date.now(),
					},
				],
				modified: Date.now(),
			},
			{
				rank: 1,
				externalId: 'second',
				name: 'Møller og DBU',
				parts: [
					{
						name: 'BB605A012DFAF93E',
						rank: 0,
						externalId:
							'2012R2ENPS8VM;P_ENPSMOS\\W\\F_HOLD ROs\\R_B10067B2-434B-4CF3-AFB1A02EEF8760CB;0D1D077D-9720-4560-BB605A012DFAF93E',
						modified: Date.now(),
					},
					{
						name: 'B21E0F016576BC73',
						rank: 1,
						externalId:
							'2012R2ENPS8VM;P_ENPSMOS\\W\\F_HOLD ROs\\R_B10067B2-434B-4CF3-AFB1A02EEF8760CB;D7CCC920-28E9-41AC-B21E0F016576BC73',
						modified: Date.now(),
					},
					{
						name: '8E100AB374A15DEA',
						rank: 2,
						externalId:
							'2012R2ENPS8VM;P_ENPSMOS\\W\\F_HOLD ROs\\R_B10067B2-434B-4CF3-AFB1A02EEF8760CB;D87D86D3-FD0A-42AC-8E100AB374A15DEA',
						modified: Date.now(),
					},
					{
						name: '86360F634827C56A',
						rank: 3,
						externalId:
							'2012R2ENPS8VM;P_ENPSMOS\\W\\F_HOLD ROs\\R_B10067B2-434B-4CF3-AFB1A02EEF8760CB;950A200E-31CA-4DEA-86360F634827C56A',
						modified: Date.now(),
					},
				],
				modified: Date.now(),
			},
			{
				rank: 2,
				externalId: 'third',
				name: 'Webhenvisning TV 2 Sporten',
				parts: [
					{
						name: 'A0C24CCA21FE9969',
						rank: 0,
						externalId:
							'2012R2ENPS8VM;P_ENPSMOS\\W\\F_HOLD ROs\\R_B10067B2-434B-4CF3-AFB1A02EEF8760CB;56CB0445-5782-4F92-A0C24CCA21FE9969',
						modified: Date.now(),
					},
				],
				modified: Date.now(),
			},
			{
				rank: 3,
				externalId: 'fourth',
				name: 'Møller og DBU',
				parts: [
					{
						name: 'B41C095014F35C2E',
						rank: 0,
						externalId:
							'2012R2ENPS8VM;P_ENPSMOS\\W\\F_HOLD ROs\\R_B10067B2-434B-4CF3-AFB1A02EEF8760CB;3487F683-5939-4A37-B41C095014F35C2E',
						modified: Date.now(),
					},
					{
						name: 'B9D0B70BA3F30F69',
						rank: 1,
						externalId:
							'2012R2ENPS8VM;P_ENPSMOS\\W\\F_HOLD ROs\\R_B10067B2-434B-4CF3-AFB1A02EEF8760CB;A0BF2B88-EE9E-40B7-B9D0B70BA3F30F69',
						modified: Date.now(),
					},
					{
						name: '87B4F8206386BBDD',
						rank: 2,
						externalId:
							'2012R2ENPS8VM;P_ENPSMOS\\W\\F_HOLD ROs\\R_B10067B2-434B-4CF3-AFB1A02EEF8760CB;D05B62C7-19F8-4CD7-87B4F8206386BBDD',
						modified: Date.now(),
					},
				],
				modified: Date.now(),
			},
		]

		test('No changes', async () => {
			const segmentEntries = compileSegmentEntries(ingestSegments)
			const diff = diffSegmentEntries(segmentEntries, segmentEntries, null)
			expect(_.keys(diff.added)).toHaveLength(0)
			expect(_.keys(diff.changed)).toHaveLength(0)
			expect(_.keys(diff.onlyRankChanged)).toHaveLength(0)
			expect(_.keys(diff.removed)).toHaveLength(0)
			expect(_.keys(diff.unchanged)).toEqual(['first', 'second', 'third', 'fourth'])
		})
		test('Remove middle of segment', async () => {
			const segmentEntries = compileSegmentEntries(ingestSegments)
			// First segment
			const ingestSegments2 = clone(ingestSegments)
			ingestSegments2[0].parts.splice(1, 1)
			const segmentEntries2 = compileSegmentEntries(ingestSegments2)

			const diff = diffSegmentEntries(segmentEntries, segmentEntries2, null)
			expect(_.keys(diff.changed)).toEqual(['first'])
			expect(_.keys(diff.onlyRankChanged)).toHaveLength(0)
			expect(_.keys(diff.removed)).toHaveLength(0)
			expect(_.keys(diff.unchanged)).toEqual(['second', 'third', 'fourth'])

			// Middle segment
			const ingestSegments3 = clone(ingestSegments)
			ingestSegments3[1].parts.splice(1, 1)
			const segmentEntries3 = compileSegmentEntries(ingestSegments3)

			const diff2 = diffSegmentEntries(segmentEntries, segmentEntries3, null)
			expect(_.keys(diff2.changed)).toEqual(['second'])
			expect(_.keys(diff2.onlyRankChanged)).toHaveLength(0)
			expect(_.keys(diff2.removed)).toHaveLength(0)
			expect(_.keys(diff2.unchanged)).toEqual(['first', 'third', 'fourth'])

			// Last segment
			const ingestSegments4 = clone(ingestSegments)
			ingestSegments4[3].parts.splice(1, 1)
			const segmentEntries4 = compileSegmentEntries(ingestSegments4)

			const diff3 = diffSegmentEntries(segmentEntries, segmentEntries4, null)
			expect(_.keys(diff3.changed)).toEqual(['fourth'])
			expect(_.keys(diff3.onlyRankChanged)).toHaveLength(0)
			expect(_.keys(diff3.removed)).toHaveLength(0)
			expect(_.keys(diff3.unchanged)).toEqual(['first', 'second', 'third'])
		})

		test('Remove start of segment', async () => {
			const segmentEntries = compileSegmentEntries(ingestSegments)
			// First segment
			const ingestSegments2 = clone(ingestSegments)
			ingestSegments2[0].parts.splice(0, 1)
			const segmentEntries2 = compileSegmentEntries(ingestSegments2)

			const diff = diffSegmentEntries(segmentEntries, segmentEntries2, null)
			expect(_.keys(diff.changed)).toEqual(['first'])
			expect(_.keys(diff.onlyRankChanged)).toHaveLength(0)
			expect(_.keys(diff.removed)).toHaveLength(0)
			expect(_.keys(diff.unchanged)).toEqual(['second', 'third', 'fourth'])

			// Middle segment
			const ingestSegments3 = clone(ingestSegments)
			ingestSegments3[1].parts.splice(0, 1)
			const segmentEntries3 = compileSegmentEntries(ingestSegments3)

			const diff2 = diffSegmentEntries(segmentEntries, segmentEntries3, null)
			expect(_.keys(diff2.changed)).toEqual(['second'])
			expect(_.keys(diff2.onlyRankChanged)).toHaveLength(0)
			expect(_.keys(diff2.removed)).toHaveLength(0)
			expect(_.keys(diff2.unchanged)).toEqual(['first', 'third', 'fourth'])

			// Last segment
			const ingestSegments4 = clone(ingestSegments)
			ingestSegments4[3].parts.splice(0, 1)
			const segmentEntries4 = compileSegmentEntries(ingestSegments4)

			const diff3 = diffSegmentEntries(segmentEntries, segmentEntries4, null)
			expect(_.keys(diff3.changed)).toEqual(['fourth'])
			expect(_.keys(diff3.onlyRankChanged)).toHaveLength(0)
			expect(_.keys(diff3.removed)).toHaveLength(0)
			expect(_.keys(diff3.unchanged)).toEqual(['first', 'second', 'third'])
		})

		test('Remove end of segment', async () => {
			const segmentEntries = compileSegmentEntries(ingestSegments)
			// First segment
			const ingestSegments2 = clone(ingestSegments)
			ingestSegments2[0].parts.splice(4, 1)
			const segmentEntries2 = compileSegmentEntries(ingestSegments2)

			const diff = diffSegmentEntries(segmentEntries, segmentEntries2, null)
			expect(_.keys(diff.changed)).toEqual(['first'])
			expect(_.keys(diff.onlyRankChanged)).toHaveLength(0)
			expect(_.keys(diff.removed)).toHaveLength(0)
			expect(_.keys(diff.unchanged)).toEqual(['second', 'third', 'fourth'])

			// Middle segment
			const ingestSegments3 = clone(ingestSegments)
			ingestSegments3[1].parts.splice(3, 1)
			const segmentEntries3 = compileSegmentEntries(ingestSegments3)

			const diff2 = diffSegmentEntries(segmentEntries, segmentEntries3, null)
			expect(_.keys(diff2.changed)).toEqual(['second'])
			expect(_.keys(diff2.onlyRankChanged)).toHaveLength(0)
			expect(_.keys(diff2.removed)).toHaveLength(0)
			expect(_.keys(diff2.unchanged)).toEqual(['first', 'third', 'fourth'])

			// Last segment
			const ingestSegments4 = clone(ingestSegments)
			ingestSegments4[3].parts.splice(2, 1)
			const segmentEntries4 = compileSegmentEntries(ingestSegments4)

			const diff3 = diffSegmentEntries(segmentEntries, segmentEntries4, null)
			expect(_.keys(diff3.changed)).toEqual(['fourth'])
			expect(_.keys(diff3.onlyRankChanged)).toHaveLength(0)
			expect(_.keys(diff3.removed)).toHaveLength(0)
			expect(_.keys(diff3.unchanged)).toEqual(['first', 'second', 'third'])
		})

		test('Remove whole segment', async () => {
			const segmentEntries = compileSegmentEntries(ingestSegments)
			// First segment
			const ingestSegments2 = clone(ingestSegments)
			ingestSegments2.splice(0, 1)
			recalculateRank(ingestSegments2)
			const segmentEntries2 = compileSegmentEntries(ingestSegments2)

			const diff = diffSegmentEntries(segmentEntries, segmentEntries2, null)
			expect(_.keys(diff.changed)).toHaveLength(3)
			expect(diff.onlyRankChanged).toEqual({
				second: 0,
				third: 1,
				fourth: 2,
			})
			expect(_.keys(diff.removed)).toEqual(['first'])
			expect(_.keys(diff.unchanged)).toHaveLength(0)

			// Middle segment
			const ingestSegments3 = clone(ingestSegments)
			ingestSegments3.splice(1, 1)
			recalculateRank(ingestSegments3)
			const segmentEntries3 = compileSegmentEntries(ingestSegments3)

			const diff2 = diffSegmentEntries(segmentEntries, segmentEntries3, null)
			expect(_.keys(diff2.changed)).toHaveLength(2)
			expect(diff2.onlyRankChanged).toEqual({
				third: 1,
				fourth: 2,
				// { oldRank: 2, newRank: 1 },
				// { oldRank: 3, newRank: 2 }
			})
			expect(_.keys(diff2.removed)).toEqual(['second'])
			expect(_.keys(diff2.unchanged)).toEqual(['first'])

			// Last segment
			const ingestSegments4 = clone(ingestSegments)
			ingestSegments4.splice(3, 1)
			recalculateRank(ingestSegments4)
			const segmentEntries4 = compileSegmentEntries(ingestSegments4)

			const diff3 = diffSegmentEntries(segmentEntries, segmentEntries4, null)
			// expect(_.keys(diff3.changed)).toHaveLength(3)
			expect(_.keys(diff3.onlyRankChanged)).toHaveLength(0)
			expect(_.keys(diff3.removed)).toEqual(['fourth'])
			expect(_.keys(diff3.unchanged)).toEqual(['first', 'second', 'third'])
		})
		test('Remove to combine segments', async () => {
			const segmentEntries = compileSegmentEntries(ingestSegments)

			const ingestSegments2 = clone(ingestSegments)
			ingestSegments2[1].parts = ingestSegments2[1].parts.concat(ingestSegments2[3].parts)

			ingestSegments2.splice(2, 2)
			// ingestSegments2.splice(3, 1)
			recalculateRank(ingestSegments2)
			const segmentEntries2 = compileSegmentEntries(ingestSegments2)

			const diff = diffSegmentEntries(segmentEntries, segmentEntries2, null)
			expect(_.keys(diff.changed)).toEqual(['second'])
			expect(_.keys(diff.onlyRankChanged)).toEqual([])
			expect(_.keys(diff.removed)).toEqual(['third', 'fourth'])
			expect(_.keys(diff.unchanged)).toEqual(['first'])
		})

		test('Rename/replace segment', async () => {
			const segmentEntries = compileSegmentEntries(ingestSegments)
			// First segment
			const ingestSegments2 = clone(ingestSegments)
			ingestSegments2[0].externalId = 'NEW'
			const segmentEntries2 = compileSegmentEntries(ingestSegments2)

			const diff = diffSegmentEntries(segmentEntries, segmentEntries2, null)
			expect(_.keys(diff.added)).toEqual(['NEW'])
			expect(_.keys(diff.changed)).toEqual([])
			expect(_.keys(diff.removed)).toEqual(['first'])
			expect(_.keys(diff.unchanged)).toEqual(['second', 'third', 'fourth'])
			expect(_.keys(diff.onlyRankChanged)).toHaveLength(0)
			expect(diff.externalIdChanged).toEqual({
				first: 'NEW',
			})

			// Middle segment
			const ingestSegments3 = clone(ingestSegments)
			ingestSegments3[1].externalId = 'NEW'
			const segmentEntries3 = compileSegmentEntries(ingestSegments3)

			const diff2 = diffSegmentEntries(segmentEntries, segmentEntries3, null)
			expect(_.keys(diff2.added)).toEqual(['NEW'])
			expect(_.keys(diff2.changed)).toEqual([])
			expect(_.keys(diff2.removed)).toEqual(['second'])
			expect(_.keys(diff2.unchanged)).toEqual(['first', 'third', 'fourth'])
			expect(_.keys(diff2.onlyRankChanged)).toHaveLength(0)
			expect(diff2.externalIdChanged).toEqual({
				second: 'NEW',
			})

			// Last segment
			const ingestSegments4 = clone(ingestSegments)
			ingestSegments4[3].externalId = 'NEW'
			const segmentEntries4 = compileSegmentEntries(ingestSegments4)

			const diff3 = diffSegmentEntries(segmentEntries, segmentEntries4, null)
			expect(_.keys(diff3.added)).toEqual(['NEW'])
			expect(_.keys(diff3.changed)).toEqual([])
			expect(_.keys(diff3.removed)).toEqual(['fourth'])
			expect(_.keys(diff3.unchanged)).toEqual(['first', 'second', 'third'])
			expect(_.keys(diff3.onlyRankChanged)).toHaveLength(0)
			expect(diff3.externalIdChanged).toEqual({
				fourth: 'NEW',
			})
		})

		test('Insert into segment', async () => {
			const segmentEntries = compileSegmentEntries(ingestSegments)
			// First segment
			const ingestSegments2 = clone(ingestSegments)
			ingestSegments2[0].parts.splice(2, 0, { name: 'abc', rank: 2.5, externalId: 'abc', modified: Date.now() })
			// segmentEntries2['first'].parts.splice(2, 0, 'abc')
			const segmentEntries2 = compileSegmentEntries(ingestSegments2)

			const diff = diffSegmentEntries(segmentEntries, segmentEntries2, null)
			expect(_.keys(diff.changed)).toEqual(['first'])
			expect(_.keys(diff.onlyRankChanged)).toHaveLength(0)
			expect(_.keys(diff.removed)).toHaveLength(0)
			expect(_.keys(diff.unchanged)).toEqual(['second', 'third', 'fourth'])

			// Middle segment
			const ingestSegments3 = clone(ingestSegments)
			ingestSegments3[1].parts.splice(2, 0, { name: 'abc', rank: 2.5, externalId: 'abc', modified: Date.now() })
			// segmentEntries3['second'].parts.splice(2, 0, 'abc')
			const segmentEntries3 = compileSegmentEntries(ingestSegments3)

			const diff2 = diffSegmentEntries(segmentEntries, segmentEntries3, null)
			expect(_.keys(diff2.changed)).toEqual(['second'])
			expect(_.keys(diff2.onlyRankChanged)).toHaveLength(0)
			expect(_.keys(diff2.removed)).toHaveLength(0)
			expect(_.keys(diff2.unchanged)).toEqual(['first', 'third', 'fourth'])

			// Last segment
			const ingestSegments4 = clone(ingestSegments)
			ingestSegments4[3].parts.splice(2, 0, { name: 'abc', rank: 2.5, externalId: 'abc', modified: Date.now() })
			// segmentEntries4['fourth'].parts.splice(2, 0, 'abc')
			const segmentEntries4 = compileSegmentEntries(ingestSegments4)

			const diff3 = diffSegmentEntries(segmentEntries, segmentEntries4, null)
			expect(_.keys(diff3.changed)).toEqual(['fourth'])
			expect(_.keys(diff3.onlyRankChanged)).toHaveLength(0)
			expect(_.keys(diff3.removed)).toHaveLength(0)
			expect(_.keys(diff3.unchanged)).toEqual(['first', 'second', 'third'])
		})

		test('Insert new segment', async () => {
			const segmentEntries = compileSegmentEntries(ingestSegments)
			// First segment
			const ingestSegments2 = clone(ingestSegments)
			ingestSegments2.splice(0, 0, {
				rank: -1,
				externalId: 'new',
				name: 'New Name',
				parts: [{ name: 'abc', rank: 0, externalId: 'abc', modified: Date.now() }],
				modified: Date.now(),
			})
			recalculateRank(ingestSegments2)
			const segmentEntries2 = compileSegmentEntries(ingestSegments2)

			const diff = diffSegmentEntries(segmentEntries, segmentEntries2, null)
			expect(_.keys(diff.changed)).toEqual(['first', 'second', 'third', 'fourth'])
			expect(diff.onlyRankChanged).toEqual({
				first: 1,
				second: 2,
				third: 3,
				fourth: 4,
			})
			expect(_.keys(diff.added)).toEqual(['new'])
			expect(_.keys(diff.removed)).toHaveLength(0)
			expect(_.keys(diff.unchanged)).toHaveLength(0)

			// Middle segment
			const ingestSegments3 = clone(ingestSegments)
			ingestSegments3.splice(1, 0, {
				rank: 0.5,
				externalId: 'new',
				name: 'New Name',
				parts: [{ name: 'abc', rank: 0, externalId: 'abc', modified: Date.now() }],
				modified: Date.now(),
			})
			recalculateRank(ingestSegments3)
			const segmentEntries3 = compileSegmentEntries(ingestSegments3)

			const diff2 = diffSegmentEntries(segmentEntries, segmentEntries3, null)
			expect(_.keys(diff2.changed)).toEqual(['second', 'third', 'fourth'])
			expect(diff2.onlyRankChanged).toEqual({
				second: 2,
				third: 3,
				fourth: 4,
			})
			expect(_.keys(diff.added)).toEqual(['new'])
			expect(_.keys(diff2.removed)).toHaveLength(0)
			expect(_.keys(diff2.unchanged)).toEqual(['first'])

			// Last segment
			const ingestSegments4 = clone(ingestSegments)
			ingestSegments4.splice(-1, 0, {
				rank: 99,
				externalId: 'new',
				name: 'New Name',
				parts: [{ name: 'abc', rank: 0, externalId: 'abc', modified: Date.now() }],
				modified: Date.now(),
			})
			recalculateRank(ingestSegments4)
			const segmentEntries4 = compileSegmentEntries(ingestSegments4)

			const diff3 = diffSegmentEntries(segmentEntries, segmentEntries4, null)
			expect(_.keys(diff3.onlyRankChanged)).toHaveLength(0)
			expect(_.keys(diff3.removed)).toHaveLength(0)
			expect(_.keys(diff.added)).toEqual(['new'])
			expect(_.keys(diff3.changed)).toEqual([])
			expect(_.keys(diff3.unchanged)).toEqual(['first', 'second', 'third', 'fourth'])
		})
		test('Insert new segment, split existing', async () => {
			const segmentEntries = compileSegmentEntries(ingestSegments)
			// // First segment
			const ingestSegments2 = clone(ingestSegments)
			ingestSegments2.splice(
				1,
				0,
				{
					rank: 0.5,
					externalId: 'new',
					name: 'New Name',
					parts: [{ name: 'abc', rank: 0, externalId: 'abc', modified: Date.now() }],
					modified: Date.now(),
				},
				{
					rank: 0.7,
					externalId: 'new2',
					name: 'New Name2',
					parts: [{ name: 'abc2', rank: 0, externalId: 'abc2', modified: Date.now() }],
					modified: Date.now(),
				}
			)
			recalculateRank(ingestSegments2)
			const segmentEntries2 = compileSegmentEntries(ingestSegments2)

			const diff = diffSegmentEntries(segmentEntries, segmentEntries2, null)
			expect(_.keys(diff.added)).toEqual(['new', 'new2'])
			expect(_.keys(diff.changed)).toEqual(['second', 'third', 'fourth'])
			expect(diff.onlyRankChanged).toEqual({
				second: 3,
				third: 4,
				fourth: 5,
			})
			expect(_.keys(diff.removed)).toHaveLength(0)
			expect(_.keys(diff.unchanged)).toEqual(['first'])

			// Middle segment
			const ingestSegments3 = clone(ingestSegments)
			ingestSegments3.splice(
				2,
				0,
				{
					rank: 1.5,
					externalId: 'new',
					name: 'New Name',
					parts: [{ name: 'abc', rank: 0, externalId: 'abc', modified: Date.now() }],
					modified: Date.now(),
				},
				{
					rank: 1.7,
					externalId: 'new2',
					name: 'New Name2',
					parts: [{ name: 'abc2', rank: 0, externalId: 'abc2', modified: Date.now() }],
					modified: Date.now(),
				}
			)
			recalculateRank(ingestSegments3)
			const segmentEntries3 = compileSegmentEntries(ingestSegments3)

			const diff2 = diffSegmentEntries(segmentEntries, segmentEntries3, null)
			expect(_.keys(diff2.added)).toEqual(['new', 'new2'])
			expect(_.keys(diff2.changed)).toEqual(['third', 'fourth'])
			expect(diff2.onlyRankChanged).toEqual({
				third: 4,
				fourth: 5,
			})
			expect(_.keys(diff2.removed)).toHaveLength(0)
			expect(_.keys(diff2.unchanged)).toEqual(['first', 'second'])
		})
	})
})
