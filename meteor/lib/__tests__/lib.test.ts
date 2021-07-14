import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import { testInFiber } from '../../__mocks__/helpers/jest'
import { setLoggerLevel } from '../../server/api/logger'
import {
	getHash,
	MeteorPromiseCall,
	waitForPromise,
	getCurrentTime,
	systemTime,
	literal,
	applyClassToDocument,
	formatDateAsTimecode,
	formatDurationAsTimecode,
	formatDateTime,
	removeNullyProperties,
	objectPathGet,
	objectPathSet,
	stringifyObjects,
	// getRank,
	partial,
	partialExceptId,
	escapeHtml,
	protectString,
	mongoFindOptions,
	ProtectedString,
	equalSets,
	equivalentArrays,
} from '../lib'
import { TimelineObjType, TimelineObjGeneric } from '../collections/Timeline'
import { TSR } from '@sofie-automation/blueprints-integration'
import { FindOptions } from '../typings/meteor'

// require('../../../../../server/api/ingest/mosDevice/api.ts') // include in order to create the Meteor methods needed

describe('lib/lib', () => {
	testInFiber('getHash', () => {
		const h0 = getHash('abc')
		const h1 = getHash('abcd')
		const h2 = getHash('abc')

		expect(h0).toEqual(h2)
		expect(h0).not.toEqual(h1)
	})
	testInFiber('MeteorPromiseCall', () => {
		// set up method:
		Meteor.methods({
			myMethod: (value: any) => {
				// Do an async operation, to ensure that asynchronous operations work:
				const v = waitForPromise(
					new Promise((resolve) => {
						setTimeout(() => {
							resolve(value)
						}, 10)
					})
				)
				return v
			},
		})
		const pValue: any = MeteorPromiseCall('myMethod', 'myValue').catch((e) => {
			throw e
		})
		expect(pValue).toHaveProperty('then') // be a promise
		const value = waitForPromise(pValue)
		expect(value).toEqual('myValue')
	})
	testInFiber('getCurrentTime', () => {
		systemTime.diff = 5439
		expect(getCurrentTime() / 1000).toBeCloseTo((Date.now() - 5439) / 1000, 1)
	})
	testInFiber('literal', () => {
		const obj = literal<TimelineObjGeneric>({
			id: 'abc',
			enable: {
				start: 0,
			},
			layer: 'L1',
			content: { deviceType: TSR.DeviceType.ABSTRACT },
			objectType: TimelineObjType.RUNDOWN,
		})
		expect(obj).toEqual({
			id: 'abc',
			enable: {
				start: 0,
			},
			layer: 'L1',
			content: { deviceType: TSR.DeviceType.ABSTRACT },
			objectType: TimelineObjType.RUNDOWN,
		})
		const layer: string | number = obj.layer // just to check typings
		expect(layer).toBeTruthy()
	})
	testInFiber('applyClassToDocument', () => {
		class MyClass {
			public publ: string
			private priv: string
			constructor(from) {
				Object.keys(from).forEach((key) => {
					this[key] = from[key]
				})
			}
			getPriv() {
				return this.priv
			}
			getPubl() {
				return this.publ
			}
		}
		const doc = applyClassToDocument(MyClass, {
			priv: 'aaa',
			publ: 'bbb',
		})
		expect(doc.getPriv()).toEqual('aaa')
		expect(doc.getPubl()).toEqual('bbb')
	})
	testInFiber('formatDateAsTimecode', () => {
		const d = new Date('2019-01-01 13:04:15.145')
		expect(d.getMilliseconds()).toEqual(145)
		expect(formatDateAsTimecode(d)).toEqual('13:04:15:03')
	})
	testInFiber('formatDurationAsTimecode', () => {
		expect(formatDurationAsTimecode((2 * 3600 + 5 * 60 + 7) * 1000 + 500)).toEqual('02:05:07:12')
	})
	testInFiber('formatDateTime', () => {
		expect(formatDateTime(1556194064374)).toMatch(/2019-04-\d{2} \d{2}:\d{2}:\d{2}/)
	})
	testInFiber('removeNullyProperties', () => {
		expect(
			removeNullyProperties({
				a: 1,
				b: 2,
				c: null,
				e: undefined,
				f: {
					a: 1,
					b: 2,
					c: null,
					e: undefined,
				},
			})
		).toEqual({
			a: 1,
			b: 2,
			e: undefined,
			f: {
				a: 1,
				b: 2,
				e: undefined,
			},
		})
	})
	testInFiber('objectPathGet', () => {
		expect(
			objectPathGet(
				{
					a: 1,
					b: {
						c: 1,
						d: {
							e: 2,
						},
					},
				},
				'b.d.e'
			)
		).toEqual(2)
	})
	testInFiber('objectPathSet', () => {
		const o: any = {
			a: 1,
			b: {
				c: 1,
				d: {
					e: 2,
				},
			},
		}
		objectPathSet(o, 'b.d.f', 42)
		expect(o.b.d.f).toEqual(42)
	})
	testInFiber('stringifyObjects', () => {
		const o: any = {
			a: 1,
			b: {
				c: '1',
				d: {
					e: 2,
				},
			},
		}
		expect(stringifyObjects(o)).toEqual(stringifyObjects(o))
	})
	testInFiber('mongowhere', () => {
		setLoggerLevel('debug')

		// mongoWhere is used my Collection mock
		const MyCollection = new Mongo.Collection<any>('mycollection')

		expect(MyCollection.findOne()).toBeFalsy()

		MyCollection.insert({
			_id: protectString('id0'),
			name: 'abc',
			rank: 0,
		})
		MyCollection.insert({
			_id: protectString('id1'),
			name: 'abc',
			rank: 1,
		})
		MyCollection.insert({
			_id: protectString('id2'),
			name: 'abcd',
			rank: 2,
		})
		MyCollection.insert({
			_id: protectString('id3'),
			name: 'abcd',
			rank: 3,
		})
		MyCollection.insert({
			_id: protectString('id4'),
			name: 'xyz',
			rank: 4,
		})
		MyCollection.insert({
			_id: protectString('id5'),
			name: 'xyz',
			rank: 5,
		})

		expect(MyCollection.find().fetch()).toHaveLength(6)

		expect(MyCollection.find({ _id: protectString('id3') }).fetch()).toHaveLength(1)
		expect(MyCollection.find({ _id: protectString('id99') }).fetch()).toHaveLength(0)

		expect(MyCollection.find({ name: 'abcd' }).fetch()).toHaveLength(2)
		expect(MyCollection.find({ name: 'xyz' }).fetch()).toHaveLength(2)
		expect(MyCollection.find({ name: { $in: ['abc', 'xyz'] } }).fetch()).toHaveLength(4)

		expect(MyCollection.find({ rank: { $gt: 2 } }).fetch()).toHaveLength(3)
		expect(MyCollection.find({ rank: { $gte: 2 } }).fetch()).toHaveLength(4)

		expect(MyCollection.find({ rank: { $lt: 3 } }).fetch()).toHaveLength(3)
		expect(MyCollection.find({ rank: { $lte: 3 } }).fetch()).toHaveLength(4)
	})
	// testInFiber('getRank', () => {
	// 	const objs: { _rank: number }[] = [
	// 		{ _rank: 0 },
	// 		{ _rank: 10 },
	// 		{ _rank: 20 },
	// 		{ _rank: 21 },
	// 		{ _rank: 22 },
	// 		{ _rank: 23 },
	// 	]

	// 	// First:
	// 	expect(getRank(null, objs[0])).toEqual(-0.5)
	// 	// Insert two:
	// 	expect(getRank(null, objs[0], 0, 2)).toEqual(-0.6666666666666667)
	// 	expect(getRank(null, objs[0], 1, 2)).toEqual(-0.33333333333333337)

	// 	// Center:
	// 	expect(getRank(objs[1], objs[2])).toEqual(15)
	// 	// Insert three:
	// 	expect(getRank(objs[1], objs[2], 0, 3)).toEqual(12.5)
	// 	expect(getRank(objs[1], objs[2], 1, 3)).toEqual(15)
	// 	expect(getRank(objs[1], objs[2], 2, 3)).toEqual(17.5)

	// 	// Last:
	// 	expect(getRank(objs[5], undefined)).toEqual(23.5)
	// 	// Insert three:
	// 	expect(getRank(objs[5], undefined, 0, 3)).toEqual(23.25)
	// 	expect(getRank(objs[5], undefined, 1, 3)).toEqual(23.5)
	// 	expect(getRank(objs[5], undefined, 2, 3)).toEqual(23.75)

	// 	// Insert in empty list
	// 	expect(getRank(undefined, undefined)).toEqual(0.5)

	// 	// Insert three:
	// 	expect(getRank(undefined, undefined, 0, 2)).toEqual(0.3333333333333333)
	// 	expect(getRank(undefined, undefined, 1, 2)).toEqual(0.6666666666666666)
	// })
	testInFiber('partial', () => {
		const o = {
			a: 1,
			b: 'asdf',
			c: {
				d: 1,
			},
			e: null,
			f: undefined,
		}
		expect(partial(o)).toEqual(o) // The function only affects typings
	})
	testInFiber('partialExceptId', () => {
		const o = {
			_id: protectString('myId'),
			a: 1,
			b: 'asdf',
			c: {
				d: 1,
			},
			e: null,
			f: undefined,
		}
		expect(partialExceptId(o)).toEqual(o) // The function only affects typings
	})
	testInFiber('formatDateTime', () => {
		if (process.platform === 'win32') {
			// Due to a bug in how timezones are handled in Windows & Node, we just have to skip these tests when running tests locally..
			expect(0).toEqual(0)
			return
		}

		expect(new Date().getTimezoneOffset()).toBe(0) // Timezone is UTC

		expect(formatDateTime(1578295344070)).toBe('2020-01-06 07:22:24')
		expect(formatDateTime(1578389166594)).toBe('2020-01-07 09:26:06')
		expect(formatDateTime(2579299201000)).toBe('2051-09-26 00:00:01')
		expect(formatDateTime(2579299200000)).toBe('2051-09-26 00:00:00')
		expect(formatDateTime(2579299344070)).toBe('2051-09-26 00:02:24')
	})
	testInFiber('escapeHtml', () => {
		expect(escapeHtml(`<div>Hello & goodbye! Please use '"'-signs!</div>`)).toBe(
			`&lt;div&gt;Hello &amp; goodbye! Please use &#039;&quot;&#039;-signs!&lt;/div&gt;`
		)
	})

	describe('mongoFindOptions', () => {
		const rawDocs = ['1', '2', '3', '4', '5', '6', '7'].map((s) => ({ _id: protectString(s) }))

		test('nothing', () => {
			expect(mongoFindOptions(rawDocs)).toEqual(rawDocs)
			expect(mongoFindOptions(rawDocs, {})).toEqual(rawDocs)
		})
		test('range', () => {
			expect(mongoFindOptions(rawDocs, { limit: 4 }).map((s) => s._id)).toEqual(['1', '2', '3', '4'])
			expect(mongoFindOptions(rawDocs, { skip: 4 }).map((s) => s._id)).toEqual(['5', '6', '7'])
			expect(mongoFindOptions(rawDocs, { skip: 2, limit: 3 }).map((s) => s._id)).toEqual(['3', '4', '5'])
		})
		test('transform', () => {
			expect(() => mongoFindOptions(rawDocs, { transform: () => ({ _id: '1' }) })).toThrowError(
				'options.transform not implemented'
			)
		})

		interface SomeDoc {
			_id: ProtectedString<any>
			val: string
			val2: string
		}

		const rawDocs2: SomeDoc[] = [
			{
				_id: protectString('1'),
				val: 'a',
				val2: 'c',
			},
			{
				_id: protectString('2'),
				val: 'x',
				val2: 'c',
			},
			{
				_id: protectString('3'),
				val: 'n',
				val2: 'b',
			},
		]

		test('fields', () => {
			// those are covered by MongoFieldSpecifier type:
			// expect(() => mongoFindOptions(rawDocs, { fields: { val: 0, val2: 1 } })).toThrowError('options.fields cannot contain both include and exclude rules')
			// expect(() => mongoFindOptions(rawDocs, { fields: { _id: 0, val2: 1 } })).not.toThrowError()
			// expect(() => mongoFindOptions(rawDocs, { fields: { _id: '1', val: 0 } })).not.toThrowError()

			expect(mongoFindOptions(rawDocs2, { fields: { val: 0 } } as FindOptions<SomeDoc>)).toEqual([
				{
					_id: '1',
					val2: 'c',
				},
				{
					_id: '2',
					val2: 'c',
				},
				{
					_id: '3',
					val2: 'b',
				},
			])
			expect(mongoFindOptions(rawDocs2, { fields: { val: 0, _id: 0 } } as FindOptions<SomeDoc>)).toEqual([
				{
					val2: 'c',
				},
				{
					val2: 'c',
				},
				{
					val2: 'b',
				},
			])
			expect(mongoFindOptions(rawDocs2, { fields: { val: 1 } } as FindOptions<SomeDoc>)).toEqual([
				{
					_id: '1',
					val: 'a',
				},
				{
					_id: '2',
					val: 'x',
				},
				{
					_id: '3',
					val: 'n',
				},
			])
			// those are covered by MongoFieldSpecifier type:
			// expect(mongoFindOptions(rawDocs2, { fields: { val: 1, _id: 0 } })).toEqual([
			// 	{
			// 		val: 'a',
			// 	},
			// 	{
			// 		val: 'x',
			// 	},
			// 	{
			// 		val: 'n',
			// 	},
			// ])
		})

		test('fields2', () => {
			expect(mongoFindOptions(rawDocs2, { sort: { val: 1 } } as FindOptions<SomeDoc>)).toEqual([
				{
					_id: '1',
					val: 'a',
					val2: 'c',
				},
				{
					_id: '3',
					val: 'n',
					val2: 'b',
				},
				{
					_id: '2',
					val: 'x',
					val2: 'c',
				},
			])
			expect(mongoFindOptions(rawDocs2, { sort: { val: -1 } } as FindOptions<SomeDoc>)).toEqual([
				{
					_id: '2',
					val: 'x',
					val2: 'c',
				},
				{
					_id: '3',
					val: 'n',
					val2: 'b',
				},
				{
					_id: '1',
					val: 'a',
					val2: 'c',
				},
			])

			expect(mongoFindOptions(rawDocs2, { sort: { val2: 1, val: 1 } } as FindOptions<SomeDoc>)).toEqual([
				{
					_id: '3',
					val: 'n',
					val2: 'b',
				},
				{
					_id: '1',
					val: 'a',
					val2: 'c',
				},
				{
					_id: '2',
					val: 'x',
					val2: 'c',
				},
			])
			expect(mongoFindOptions(rawDocs2, { sort: { val2: 1, val: -1 } } as FindOptions<SomeDoc>)).toEqual([
				{
					_id: '3',
					val: 'n',
					val2: 'b',
				},
				{
					_id: '2',
					val: 'x',
					val2: 'c',
				},
				{
					_id: '1',
					val: 'a',
					val2: 'c',
				},
			])
		})
	})
	testInFiber('equalSets', () => {
		expect(equalSets(new Set(['a', 'b', 'c']), new Set(['c', 'b', 'a']))).toBe(true)
		expect(equalSets(new Set(['a', 'b', 'c']), new Set(['d', 'b', 'a']))).toBe(false)
	})
	testInFiber('equivalentArrays', () => {
		expect(equivalentArrays(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true)
		expect(equivalentArrays(['a', 'b', 'c'], ['b', 'g', 'a'])).toBe(false)
	})
})
