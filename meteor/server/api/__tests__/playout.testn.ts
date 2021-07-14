/* eslint-disable jest/no-commented-out-tests */
// import * as chai from 'chai'
// import * as _ from 'underscore'
// import {} from 'mocha'

// import { Rundown, DBRundown } from '../../../lib/collections/Rundowns'
// import { Part, DBPart } from '../../../lib/collections/Parts'
// import { Piece } from '../../../lib/collections/Pieces'

// import { buildTimelineObjsForRundown } from '../playout'
// import { getPartGroupId, getPartFirstObjectId, getPieceGroupId, getPieceFirstObjectId } from '@sofie-automation/blueprints-integration/dist/timeline'
// import { TriggerType } from 'superfly-timeline'
// import { RundownAPI } from '../../../lib/api/rundown'

// const expect = chai.expect
// const assert = chai.assert

describe('playout: buildTimelineObjsForRundown', function () {
	test('mockTest', () => {
		expect(1).toEqual(1)
	})

	// test('Empty rundown', function () {
	// 	const rundownData = createEmptyRundownData()

	// 	const res = buildTimelineObjsForRundown(rundownData, [])
	// 	expect(res).toHaveLength(1)
	// 	expect(res[0]._id).toEqual('mock_status')
	// })
	/*

	test('Simple rundown', function () {
		const rundownData = createEmptyRundownData()
		rundownData.partsMap = {
			a: createEmptyPart('a', rundownData),
			b: createEmptyPart('b', rundownData)
		}
		rundownData.parts = _.values(rundownData.partsMap)
		rundownData.rundown.previousPartId = 'a'
		rundownData.rundown.currentPartId = 'b'

		const res = buildTimelineObjsForRundown(rundownData, [])
		expect(res).not.empty

		// Not defined as no startedPlayback on a
		const grpA = res.find(o => o._id === getPartGroupId('a'))
		expect(grpA).undefined

		const grpB = res.find(o => o._id === getPartGroupId('b'))
		expect(grpB).not.undefined
		const objB = res.find(o => o._id === getPartFirstObjectId('b'))
		expect(objB).not.undefined
	})

	function createBasicTransitionScenario (prerollDuration: number, transitionPrerollDuration: number, transitionKeepaliveDuration: number) {
		const rundownData = createEmptyRundownData()

		const partA = createEmptyPart('a', rundownData)
		partA.expectedDuration = 1000
		addStartedPlayback(partA, 700)

		const partB = createEmptyPart('b', rundownData)
		addStartedPlayback(partB, 5000)
		partB.expectedDuration = 4000
		partB.prerollDuration = prerollDuration
		partB.transitionPrerollDuration = transitionPrerollDuration
		partB.transitionKeepaliveDuration = transitionKeepaliveDuration
		partB.autoNext = true
		partB.autoNextOverlap = 500

		const partC = createEmptyPart('c', rundownData)
		partC.expectedDuration = 0

		const pieceA1 = createEmptyPiece('a_1', 'a')
		const pieceB1 = createEmptyPiece('b_1', 'b')
		const pieceBTrans = createEmptyPiece('b_trans', 'b')
		pieceBTrans.isTransition = true
		pieceBTrans.expectedDuration = 2500

		rundownData.partsMap = {
			a: partA,
			b: partB,
			c: partC
		}
		rundownData.parts = _.values(rundownData.partsMap)
		rundownData.pieces = [
			pieceA1,
			pieceB1, pieceBTrans
		]

		rundownData.rundown.previousPartId = 'a'
		rundownData.rundown.currentPartId = 'b'
		rundownData.rundown.nextPartId = 'c'

		return rundownData
	}

	function createBasicNextTransitionScenario (prerollDuration: number, transitionPrerollDuration: number, transitionKeepaliveDuration: number) {
		const rundownData = createEmptyRundownData()

		const partA = createEmptyPart('a', rundownData)
		partA.expectedDuration = 1000
		addStartedPlayback(partA, 700)
		partA.autoNext = true
		partA.autoNextOverlap = 670

		const partB = createEmptyPart('b', rundownData)
		partB.expectedDuration = 0
		partB.prerollDuration = prerollDuration
		partB.transitionPrerollDuration = transitionPrerollDuration
		partB.transitionKeepaliveDuration = transitionKeepaliveDuration

		const pieceA1 = createEmptyPiece('a_1', 'a')
		const pieceB1 = createEmptyPiece('b_1', 'b')
		const pieceBTrans = createEmptyPiece('b_trans', 'b')
		pieceBTrans.isTransition = true
		pieceBTrans.expectedDuration = 2500

		rundownData.partsMap = {
			a: partA,
			b: partB
		}
		rundownData.parts = _.values(rundownData.partsMap)
		rundownData.pieces = [
			pieceA1,
			pieceB1, pieceBTrans
		]

		rundownData.rundown.currentPartId = 'a'
		rundownData.rundown.nextPartId = 'b'

		return rundownData
	}

	function createBasicCutScenario (autoNext: boolean) {
		const rundownData = createEmptyRundownData()

		const partA = createEmptyPart('a', rundownData)
		partA.expectedDuration = 1000
		addStartedPlayback(partA, 700)

		const partB = createEmptyPart('b', rundownData)
		addStartedPlayback(partB, 5000)
		partB.expectedDuration = 4000
		partB.prerollDuration = 250 // content starts this far into the part

		if (autoNext) {
			partB.autoNext = true
			partB.autoNextOverlap = 500
		}

		const partC = createEmptyPart('c', rundownData)
		partC.expectedDuration = 0
		partC.prerollDuration = 350

		const pieceA1 = createEmptyPiece('a_1', 'a')
		const pieceB1 = createEmptyPiece('b_1', 'b')

		rundownData.partsMap = {
			a: partA,
			b: partB,
			c: partC
		}
		rundownData.parts = _.values(rundownData.partsMap)
		rundownData.pieces = [
			pieceA1,
			pieceB1
		]

		rundownData.rundown.previousPartId = 'a'
		rundownData.rundown.currentPartId = 'b'
		rundownData.rundown.nextPartId = 'c'

		return rundownData
	}

	test('Overlap - no transition (cut)', function () {
		const rundownData = createBasicCutScenario(false)

		const res = buildTimelineObjsForRundown(rundownData, [])
		expect(res).not.empty

		const ids = res.map(o => o._id)
		expect(ids.sort()).eql([
			'mock_status',
			'previous_' + getPartGroupId('a'),
			'previous_' + getPieceGroupId('a_1'),
			'previous_' + getPieceFirstObjectId('a_1'),
			getPartGroupId('b'),
			getPartFirstObjectId('b'),
			getPieceGroupId('b_1'),
			getPieceFirstObjectId('b_1')
		].sort())

		const grpA = res.find(o => o._id === 'previous_' + getPartGroupId('a'))
		expect(grpA).not.undefined
		expect(grpA.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 700 })
		expect(grpA.duration).eql(`#${getPartGroupId('b')}.start + 250 - #.start`)

		const grpB = res.find(o => o._id === getPartGroupId('b'))
		expect(grpB).not.undefined
		expect(grpB.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 5000 })
		expect(grpB.duration).eql(0)

		const grpB1 = res.find(o => o._id === getPieceGroupId('b_1'))
		expect(grpB1).not.undefined
		expect(grpB1.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 0 })
		expect(grpB1.duration).eql(0)
	})

	test('Overlap - no transition (cut) and autonext', function () {
		const rundownData = createBasicCutScenario(true)

		const res = buildTimelineObjsForRundown(rundownData, [])
		expect(res).not.empty

		const ids = res.map(o => o._id)
		expect(ids.sort()).eql([
			'mock_status',
			'previous_' + getPartGroupId('a'),
			'previous_' + getPieceGroupId('a_1'),
			'previous_' + getPieceFirstObjectId('a_1'),
			getPartGroupId('b'),
			getPartFirstObjectId('b'),
			getPieceGroupId('b_1'),
			getPieceFirstObjectId('b_1'),
			getPartGroupId('c'),
			getPartFirstObjectId('c')
		].sort())

		const grpA = res.find(o => o._id === 'previous_' + getPartGroupId('a'))
		expect(grpA).not.undefined
		expect(grpA.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 700 })
		expect(grpA.duration).eql(`#${getPartGroupId('b')}.start + 250 - #.start`)

		const grpB = res.find(o => o._id === getPartGroupId('b'))
		expect(grpB).not.undefined
		expect(grpB.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 5000 })
		expect(grpB.duration).eql(4750)

		const grpB1 = res.find(o => o._id === getPieceGroupId('b_1'))
		expect(grpB1).not.undefined
		expect(grpB1.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 0 })
		expect(grpB1.duration).eql(0)

		const grpC = res.find(o => o._id === getPartGroupId('c'))
		expect(grpC).not.undefined
		expect(grpC.trigger).eql({ type: TriggerType.TIME_RELATIVE, value: `#${getPartGroupId('b')}.end - 850` })
		expect(grpC.duration).eql(0)
	})

	test('Overlap - "normal" transition with gap', function () {
		const rundownData = createBasicTransitionScenario(300, 500, 400)

		const res = buildTimelineObjsForRundown(rundownData, [])
		expect(res).not.empty

		const ids = res.map(o => o._id)
		expect(ids.sort()).eql([
			'mock_status',
			'previous_' + getPartGroupId('a'),
			'previous_' + getPieceGroupId('a_1'),
			'previous_' + getPieceFirstObjectId('a_1'),
			getPartGroupId('b'),
			getPartFirstObjectId('b'),
			getPieceGroupId('b_1'),
			getPieceFirstObjectId('b_1'),
			getPieceGroupId('b_trans'),
			getPieceFirstObjectId('b_trans'),
			getPartGroupId('c'),
			getPartFirstObjectId('c')
		].sort())

		const grpA = res.find(o => o._id === 'previous_' + getPartGroupId('a'))
		expect(grpA).not.undefined
		expect(grpA.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 700 })
		expect(grpA.duration).eql(`#${getPartGroupId('b')}.start + 400 - #.start`)

		const grpB = res.find(o => o._id === getPartGroupId('b'))
		expect(grpB).not.undefined
		expect(grpB.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 5000 })
		expect(grpB.duration).eql(5000)

		const grpBTrans = res.find(o => o._id === getPieceGroupId('b_trans'))
		expect(grpBTrans).not.undefined
		expect(grpBTrans.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 0 })
		expect(grpBTrans.duration).eql(2500)

		const grpB1 = res.find(o => o._id === getPieceGroupId('b_1'))
		expect(grpB1).not.undefined
		expect(grpB1.trigger).eql({ type: TriggerType.TIME_RELATIVE, value: `#${getPieceGroupId('b_trans')}.start + 200` })
		expect(grpB1.duration).eql(0)

		const grpC = res.find(o => o._id === getPartGroupId('c'))
		expect(grpC).not.undefined
		expect(grpC.trigger).eql({ type: TriggerType.TIME_RELATIVE, value: `#${getPartGroupId('b')}.end - 500` })
		expect(grpC.duration).eql(0)
	})

	test('Overlap - "normal" transition no gap', function () {
		const rundownData = createBasicTransitionScenario(300, 500, 500)

		const res = buildTimelineObjsForRundown(rundownData, [])
		expect(res).not.empty

		const ids = res.map(o => o._id)
		expect(ids.sort()).eql([
			'mock_status',
			'previous_' + getPartGroupId('a'),
			'previous_' + getPieceGroupId('a_1'),
			'previous_' + getPieceFirstObjectId('a_1'),
			getPartGroupId('b'),
			getPartFirstObjectId('b'),
			getPieceGroupId('b_1'),
			getPieceFirstObjectId('b_1'),
			getPieceGroupId('b_trans'),
			getPieceFirstObjectId('b_trans'),
			getPartGroupId('c'),
			getPartFirstObjectId('c')
		].sort())

		const grpA = res.find(o => o._id === 'previous_' + getPartGroupId('a'))
		expect(grpA).not.undefined
		expect(grpA.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 700 })
		expect(grpA.duration).eql(`#${getPartGroupId('b')}.start + 500 - #.start`)

		const grpB = res.find(o => o._id === getPartGroupId('b'))
		expect(grpB).not.undefined
		expect(grpB.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 5000 })
		expect(grpB.duration).eql(5000)

		const grpBTrans = res.find(o => o._id === getPieceGroupId('b_trans'))
		expect(grpBTrans).not.undefined
		expect(grpBTrans.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 0 })
		expect(grpBTrans.duration).eql(2500)

		const grpB1 = res.find(o => o._id === getPieceGroupId('b_1'))
		expect(grpB1).not.undefined
		expect(grpB1.trigger).eql({ type: TriggerType.TIME_RELATIVE, value: `#${getPieceGroupId('b_trans')}.start + 200` })
		expect(grpB1.duration).eql(0)

		const grpC = res.find(o => o._id === getPartGroupId('c'))
		expect(grpC).not.undefined
		expect(grpC.trigger).eql({ type: TriggerType.TIME_RELATIVE, value: `#${getPartGroupId('b')}.end - 500` })
		expect(grpC.duration).eql(0)
	})

	test('Overlap - "fast" transition with gap', function () {
		const rundownData = createBasicTransitionScenario(500, 300, 200)

		const res = buildTimelineObjsForRundown(rundownData, [])
		expect(res).not.empty

		const ids = res.map(o => o._id)
		expect(ids.sort()).eql([
			'mock_status',
			'previous_' + getPartGroupId('a'),
			'previous_' + getPieceGroupId('a_1'),
			'previous_' + getPieceFirstObjectId('a_1'),
			getPartGroupId('b'),
			getPartFirstObjectId('b'),
			getPieceGroupId('b_1'),
			getPieceFirstObjectId('b_1'),
			getPieceGroupId('b_trans'),
			getPieceFirstObjectId('b_trans'),
			getPartGroupId('c'),
			getPartFirstObjectId('c')
		].sort())

		const grpA = res.find(o => o._id === 'previous_' + getPartGroupId('a'))
		expect(grpA).not.undefined
		expect(grpA.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 700 })
		expect(grpA.duration).eql(`#${getPartGroupId('b')}.start + 400 - #.start`)

		const grpB = res.find(o => o._id === getPartGroupId('b'))
		expect(grpB).not.undefined
		expect(grpB.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 5000 })
		expect(grpB.duration).eql(4800)

		const grpBTrans = res.find(o => o._id === getPieceGroupId('b_trans'))
		expect(grpBTrans).not.undefined
		expect(grpBTrans.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 200 })
		expect(grpBTrans.duration).eql(2500)

		const grpB1 = res.find(o => o._id === getPieceGroupId('b_1'))
		expect(grpB1).not.undefined
		expect(grpB1.trigger).eql({ type: TriggerType.TIME_RELATIVE, value: `#${getPieceGroupId('b_trans')}.start - 200` })
		expect(grpB1.duration).eql(0)

		const grpC = res.find(o => o._id === getPartGroupId('c'))
		expect(grpC).not.undefined
		expect(grpC.trigger).eql({ type: TriggerType.TIME_RELATIVE, value: `#${getPartGroupId('b')}.end - 500` })
		expect(grpC.duration).eql(0)
	})

	test('Overlap - "fast" transition no gap', function () {
		const rundownData = createBasicTransitionScenario(500, 300, 400)

		const res = buildTimelineObjsForRundown(rundownData, [])
		expect(res).not.empty

		const ids = res.map(o => o._id)
		expect(ids.sort()).eql([
			'mock_status',
			'previous_' + getPartGroupId('a'),
			'previous_' + getPieceGroupId('a_1'),
			'previous_' + getPieceFirstObjectId('a_1'),
			getPartGroupId('b'),
			getPartFirstObjectId('b'),
			getPieceGroupId('b_1'),
			getPieceFirstObjectId('b_1'),
			getPieceGroupId('b_trans'),
			getPieceFirstObjectId('b_trans'),
			getPartGroupId('c'),
			getPartFirstObjectId('c')
		].sort())

		const grpA = res.find(o => o._id === 'previous_' + getPartGroupId('a'))
		expect(grpA).not.undefined
		expect(grpA.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 700 })
		expect(grpA.duration).eql(`#${getPartGroupId('b')}.start + 600 - #.start`)

		const grpB = res.find(o => o._id === getPartGroupId('b'))
		expect(grpB).not.undefined
		expect(grpB.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 5000 })
		expect(grpB.duration).eql(4800)

		const grpBTrans = res.find(o => o._id === getPieceGroupId('b_trans'))
		expect(grpBTrans).not.undefined
		expect(grpBTrans.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 200 })
		expect(grpBTrans.duration).eql(2500)

		const grpB1 = res.find(o => o._id === getPieceGroupId('b_1'))
		expect(grpB1).not.undefined
		expect(grpB1.trigger).eql({ type: TriggerType.TIME_RELATIVE, value: `#${getPieceGroupId('b_trans')}.start - 200` })
		expect(grpB1.duration).eql(0)

		const grpC = res.find(o => o._id === getPartGroupId('c'))
		expect(grpC).not.undefined
		expect(grpC.trigger).eql({ type: TriggerType.TIME_RELATIVE, value: `#${getPartGroupId('b')}.end - 500` })
		expect(grpC.duration).eql(0)
	})

	test('Overlap - next is "normal" transition with gap', function () {
		const rundownData = createBasicNextTransitionScenario(300, 500, 400)

		const res = buildTimelineObjsForRundown(rundownData, [])
		expect(res).not.empty

		const ids = res.map(o => o._id)
		expect(ids.sort()).eql([
			'mock_status',
			getPartGroupId('a'),
			getPartFirstObjectId('a'),
			getPieceGroupId('a_1'),
			getPieceFirstObjectId('a_1'),
			getPartGroupId('b'),
			getPartFirstObjectId('b'),
			getPieceGroupId('b_1'),
			getPieceFirstObjectId('b_1'),
			getPieceGroupId('b_trans'),
			getPieceFirstObjectId('b_trans')
		].sort())

		const grpA = res.find(o => o._id === getPartGroupId('a'))
		expect(grpA).not.undefined
		expect(grpA.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 700 })
		expect(grpA.duration).eql(1670)

		const grpB = res.find(o => o._id === getPartGroupId('b'))
		expect(grpB).not.undefined
		expect(grpB.trigger).eql({ type: TriggerType.TIME_RELATIVE, value: `#${getPartGroupId('a')}.end - 1070` })
		expect(grpB.duration).eql(0)

		const grpBTrans = res.find(o => o._id === getPieceGroupId('b_trans'))
		expect(grpBTrans).not.undefined
		expect(grpBTrans.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 0 })
		expect(grpBTrans.duration).eql(2500)

		const grpB1 = res.find(o => o._id === getPieceGroupId('b_1'))
		expect(grpB1).not.undefined
		expect(grpB1.trigger).eql({ type: TriggerType.TIME_RELATIVE, value: `#${getPieceGroupId('b_trans')}.start + 200` })
		expect(grpB1.duration).eql(0)
	})

	test('Overlap - next is "normal" transition no gap', function () {
		const rundownData = createBasicNextTransitionScenario(300, 500, 500)

		const res = buildTimelineObjsForRundown(rundownData, [])
		expect(res).not.empty

		const ids = res.map(o => o._id)
		expect(ids.sort()).eql([
			'mock_status',
			getPartGroupId('a'),
			getPartFirstObjectId('a'),
			getPieceGroupId('a_1'),
			getPieceFirstObjectId('a_1'),
			getPartGroupId('b'),
			getPartFirstObjectId('b'),
			getPieceGroupId('b_1'),
			getPieceFirstObjectId('b_1'),
			getPieceGroupId('b_trans'),
			getPieceFirstObjectId('b_trans')
		].sort())

		const grpA = res.find(o => o._id === getPartGroupId('a'))
		expect(grpA).not.undefined
		expect(grpA.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 700 })
		expect(grpA.duration).eql(1670)

		const grpB = res.find(o => o._id === getPartGroupId('b'))
		expect(grpB).not.undefined
		expect(grpB.trigger).eql({ type: TriggerType.TIME_RELATIVE, value: `#${getPartGroupId('a')}.end - 1170` })
		expect(grpB.duration).eql(0)

		const grpBTrans = res.find(o => o._id === getPieceGroupId('b_trans'))
		expect(grpBTrans).not.undefined
		expect(grpBTrans.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 0 })
		expect(grpBTrans.duration).eql(2500)

		const grpB1 = res.find(o => o._id === getPieceGroupId('b_1'))
		expect(grpB1).not.undefined
		expect(grpB1.trigger).eql({ type: TriggerType.TIME_RELATIVE, value: `#${getPieceGroupId('b_trans')}.start + 200` })
		expect(grpB1.duration).eql(0)
	})

	test('Overlap - next is "fast" transition with gap', function () {
		const rundownData = createBasicNextTransitionScenario(500, 300, 200)

		const res = buildTimelineObjsForRundown(rundownData, [])
		expect(res).not.empty

		const ids = res.map(o => o._id)
		expect(ids.sort()).eql([
			'mock_status',
			getPartGroupId('a'),
			getPartFirstObjectId('a'),
			getPieceGroupId('a_1'),
			getPieceFirstObjectId('a_1'),
			getPartGroupId('b'),
			getPartFirstObjectId('b'),
			getPieceGroupId('b_1'),
			getPieceFirstObjectId('b_1'),
			getPieceGroupId('b_trans'),
			getPieceFirstObjectId('b_trans')
		].sort())

		const grpA = res.find(o => o._id === getPartGroupId('a'))
		expect(grpA).not.undefined
		expect(grpA.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 700 })
		expect(grpA.duration).eql(1670)

		const grpB = res.find(o => o._id === getPartGroupId('b'))
		expect(grpB).not.undefined
		expect(grpB.trigger).eql({ type: TriggerType.TIME_RELATIVE, value: `#${getPartGroupId('a')}.end - 1070` })
		expect(grpB.duration).eql(0)

		const grpBTrans = res.find(o => o._id === getPieceGroupId('b_trans'))
		expect(grpBTrans).not.undefined
		expect(grpBTrans.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 200 })
		expect(grpBTrans.duration).eql(2500)

		const grpB1 = res.find(o => o._id === getPieceGroupId('b_1'))
		expect(grpB1).not.undefined
		expect(grpB1.trigger).eql({ type: TriggerType.TIME_RELATIVE, value: `#${getPieceGroupId('b_trans')}.start - 200` })
		expect(grpB1.duration).eql(0)
	})

	test('Overlap - next is "fast" transition no gap', function () {
		const rundownData = createBasicNextTransitionScenario(500, 300, 400)

		const res = buildTimelineObjsForRundown(rundownData, [])
		expect(res).not.empty

		const ids = res.map(o => o._id)
		expect(ids.sort()).eql([
			'mock_status',
			getPartGroupId('a'),
			getPartFirstObjectId('a'),
			getPieceGroupId('a_1'),
			getPieceFirstObjectId('a_1'),
			getPartGroupId('b'),
			getPartFirstObjectId('b'),
			getPieceGroupId('b_1'),
			getPieceFirstObjectId('b_1'),
			getPieceGroupId('b_trans'),
			getPieceFirstObjectId('b_trans')
		].sort())

		const grpA = res.find(o => o._id === getPartGroupId('a'))
		expect(grpA).not.undefined
		expect(grpA.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 700 })
		expect(grpA.duration).eql(1670)

		const grpB = res.find(o => o._id === getPartGroupId('b'))
		expect(grpB).not.undefined
		expect(grpB.trigger).eql({ type: TriggerType.TIME_RELATIVE, value: `#${getPartGroupId('a')}.end - 1270` })
		expect(grpB.duration).eql(0)

		const grpBTrans = res.find(o => o._id === getPieceGroupId('b_trans'))
		expect(grpBTrans).not.undefined
		expect(grpBTrans.trigger).eql({ type: TriggerType.TIME_ABSOLUTE, value: 200 })
		expect(grpBTrans.duration).eql(2500)

		const grpB1 = res.find(o => o._id === getPieceGroupId('b_1'))
		expect(grpB1).not.undefined
		expect(grpB1.trigger).eql({ type: TriggerType.TIME_RELATIVE, value: `#${getPieceGroupId('b_trans')}.start - 200` })
		expect(grpB1.duration).eql(0)
	})
	*/
})

// ----------------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------------
/*
function createEmptyRundownData () {
	const rundown: DBRundown = {
		_id: 'mock',
		externalId: '',
		studioId: protectString(''),
		showStyleBaseId: '',
		showStyleVariantId: '',
		peripheralDeviceId: protectString(''),
		name: 'Mock',
		created: 0,
		modified: 0,
		previousPartId: null,
		currentPartId: null,
		nextPartId: null,
		importVersions: {
			studio: '',
			showStyleBase: '',
			showStyleVariant: '',
			blueprint: '',
			core: '',
		}
	}
	const rundownData: RundownData = {
		rundown: rundown as Rundown,
		segments: [],
		segmentsMap: {},
		parts: [],
		partsMap: {},
		pieces: []
	}
	return rundownData
}

function createEmptyPart (id: string, rundownData: RundownData) {
	const part: DBPart = {
		_id: id,
		_rank: 1,
		externalId: '',
		segmentId: protectString(''),
		rundownId: rundownData.rundown._id,
		title: '',
	}
	const part2 = part as Part
	part2.getAllPieces = () => {
		return rundownData.pieces.filter(i => i.partId === part2._id)
	}
	part2.getLastStartedPlayback = () => {
		if (part2.startedPlayback && part2.timings && part2.timings.startedPlayback) {
			return _.last(part2.timings.startedPlayback)
		}

		return undefined
	}

	return part2
}

function addStartedPlayback (part: Part, time: number) {
	if (!part.timings) {
		part.timings = {
			take: [],
			takeDone: [],
			takeOut: [],
			startedPlayback: [],
			stoppedPlayback: [],
			next: [],
			playOffset: []
		}
	}

	part.startedPlayback = true
	part.timings.startedPlayback.push(time)
}

function createEmptyPiece (id: string, partId: PartId) {
	const piece: Piece = {
		_id: id,
		externalId: id,
		partId: partId,
		rundownId: '',
		name: 'Mock Piece',
		trigger: {
			type: TriggerType.TIME_ABSOLUTE,
			value: 0
		},
		status: RundownAPI.TakeItemStatusCode.UNKNOWN,
		sourceLayerId: 'source0',
		outputLayerId: 'output0',
		expectedDuration: 0,
		content: {
			timelineObjects: []
		}
	}
	return piece

}
*/
