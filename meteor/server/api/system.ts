import * as _ from 'underscore'
import { SystemAPI, SystemAPIMethods } from '../../lib/api/system'
import { makePromise, unprotectString, waitTime, sumChanges } from '../../lib/lib'
import { registerClassToMeteorMethods } from '../methods'
import { RundownAPIMethods } from '../../lib/api/rundown'
import { TransformedCollection } from '../../lib/typings/meteor'
import { PeripheralDevices, PeripheralDevice } from '../../lib/collections/PeripheralDevices'
import { PeripheralDeviceAPI } from '../../lib/api/peripheralDevice'
import { MeteorWrapAsync } from '../codeControl'
import { createMongoCollection } from '../../lib/collections/lib'

interface BenchmarkResults {
	mongoWriteSmall: number
	mongoWriteBig: number
	mongoRead: number
	mongoIndexedRead: number
	cpuCalculations: number
	cpuStringifying: number
}
let mongoTest: TransformedCollection<any, any> | undefined = undefined
async function doSystemBenchmark() {
	if (!mongoTest) {
		mongoTest = createMongoCollection<any>('benchmark-test')
		mongoTest._ensureIndex({
			indexedProp: 1,
		})
	}
	const cleanup = () => {
		if (mongoTest) {
			// clean up
			mongoTest.remove({})
		}
	}

	const result: BenchmarkResults = {
		mongoWriteSmall: -1,
		mongoWriteBig: -1,
		mongoRead: -1,
		mongoIndexedRead: -1,
		cpuCalculations: -1,
		cpuStringifying: -1,
	}
	// Note: The tests "sizes" / iterations are chosen so that they should run somewhere around 100ms
	try {
		waitTime(10)
		{
			// MongoDB test: Do a number of small writes:
			let startTime = Date.now()
			const insertedIds: string[] = []
			for (let i = 0; i < 100; i++) {
				const objectToInsert = {
					_id: 'myObject' + i,
					prop0: {
						asdf: 'asdf',
						ghjk: 123456,
					},
				}
				insertedIds.push(mongoTest.insert(objectToInsert))
				mongoTest.update(objectToInsert._id, {
					$set: {
						prop1: 'qwerty',
					},
				})
			}
			for (const id of insertedIds) {
				mongoTest.remove(id)
			}
			result.mongoWriteSmall = Date.now() - startTime
		}
		waitTime(10)
		{
			// MongoDB test: Do a number of large writes:
			let startTime = Date.now()
			const insertedIds: string[] = []
			for (let i = 0; i < 10; i++) {
				const objectToInsert = {
					_id: 'myObject' + i,
					objs: _.range(0, 1000).map((j) => {
						return {
							id: 'innerObj' + j,
							data0: 'asdfkawhbeckjawhefkjashvdfckasdf',
							data1: 'we4roivbnworeitgv398rvnw9384rvnf34',
							data2: '234f23f423f4',
							data3: Date.now(),
							data4: 'wvklwjnserolvjwn3erlkvjwnerlkvn',
							data5: '3oig23oi45ugnf2o3iu4nf2o3iu4nf',
							data6: '5g2987543hg9285hg3',
							data7:
								'20359gj2834hf2390874fh203874hf02387h4f02837h4f0238h028h428734f0273h4f08723h4tpo2n,mnbsdfljbvslfkvnkjgv',
						}
					}),
					prop0: 'asdf',
				}
				insertedIds.push(mongoTest.insert(objectToInsert))
				mongoTest.update(objectToInsert._id, {
					$set: {
						prop1: 'qwerty',
					},
				})
			}
			for (const id of insertedIds) {
				mongoTest.remove(id)
			}
			result.mongoWriteBig = Date.now() - startTime
		}
		{
			// MongoDB test: read
			const DOC_COUNT = 100
			// Prepare data in db:
			const insertedIds: string[] = []
			for (let i = 0; i < DOC_COUNT; i++) {
				const objectToInsert = {
					_id: 'myObject' + i,
					objs: _.range(0, 100).map((j) => {
						return {
							id: 'innerObj' + j,
							data0:
								'asdfkawhbeckjawhefkjashvdfckasdf9q37246fg2w9375fhg209485hf0238757h834h08273h50235h4gf+0237h5u7hg2475hg082475hgt',
						}
					}),
					prop0: i,
					indexedProp: i,
				}
				insertedIds.push(mongoTest.insert(objectToInsert))
				mongoTest.update(objectToInsert._id, {
					$set: {
						prop1: 'qwerty',
					},
				})
			}
			waitTime(10)

			// Reads with no help from index:
			let startTime = Date.now()
			for (let i = 0; i < DOC_COUNT; i++) {
				const readData = mongoTest.find({ prop0: i }).fetch()
				if (readData.length !== 1) throw Error('Expected to have read 1 document')
			}
			result.mongoRead = Date.now() - startTime

			// Reads with help from index:
			startTime = Date.now()
			for (let i = 0; i < DOC_COUNT; i++) {
				const readData = mongoTest.find({ indexedProp: i }).fetch()
				if (readData.length !== 1) throw Error('Expected to have read 1 document')
			}
			result.mongoIndexedRead = Date.now() - startTime

			// cleanup:
			mongoTest.remove({})
		}
		waitTime(10)
		// CPU test: calculations:
		{
			let startTime = Date.now()
			const map: any = {}
			let number = 0
			for (let i = 0; i < 6e4; i++) {
				number += i
				if (number > 10e5) number -= 10e5
				map[`v_${number}`] = `${number}`.slice(1)
			}
			_.values(map).sort((a, b) => {
				if (a < b) return 1
				if (a > b) return -1
				return 0
			})
			result.cpuCalculations = Date.now() - startTime
		}
		waitTime(10)
		// CPU test: JSON stringifying:
		{
			const objectsToStringify = _.range(0, 40e3).map((i) => {
				return {
					_id: 'myObject' + i,
					prop0: {
						asdf: 'asdf' + i,
						ghjk: 123456,
					},
				}
			})
			let startTime = Date.now()

			const strings: string[] = objectsToStringify.map((o) => JSON.stringify(o))
			const newObjects = strings.map((str) => JSON.parse(str))

			result.cpuStringifying = Date.now() - startTime
		}
		waitTime(10)

		cleanup()
	} catch (error) {
		cleanup()
		throw error
	}

	return result
}
const pingDevice: (device: PeripheralDevice) => boolean = MeteorWrapAsync((device: PeripheralDevice, cb) => {
	// ServerPeripheralDeviceAPI.pingWithCommand(device._id, device.token, 'hello', cb)
	PeripheralDeviceAPI.executeFunctionWithCustomTimeout(
		device._id,
		(error) => {
			if (error) console.log(error)
			// we don't care if the function exists or not:
			cb(true)
		},
		500,
		'ping'
	)
})

class SystemAPIClass implements SystemAPI {
	async doSystemBenchmark(runCount: number = 1) {
		if (runCount < 1) throw new Error(`runCount must be >= 1`)

		const results: BenchmarkResults[] = []
		for (let i of _.range(0, runCount)) {
			results.push(await doSystemBenchmark())
			waitTime(50)
		}

		const keys = [
			'mongoWriteSmall',
			'mongoWriteBig',
			'mongoRead',
			'mongoIndexedRead',
			'cpuCalculations',
			'cpuStringifying',
		]

		const sum: BenchmarkResults = results.reduce(
			(prev, current) => {
				const o: any = {}
				keys.forEach((key) => {
					o[key] = current[key] + prev[key]
				})
				return o
			},
			{
				mongoWriteSmall: 0,
				mongoWriteBig: 0,
				mongoRead: 0,
				mongoIndexedRead: 0,
				cpuCalculations: 0,
				cpuStringifying: 0,
			}
		)
		const avg: any = {}
		keys.forEach((key) => {
			avg[key] = Math.floor(sum[key] / runCount)
		})
		// These numbers are the average performance of known systems
		// Note: these numbers are preliminary
		const baseline = {
			cpuCalculations: 100,
			cpuStringifying: 116,
			mongoIndexedRead: 68,
			mongoRead: 82,
			mongoWriteBig: 163,
			mongoWriteSmall: 172,
		}

		const comparison: any = {}
		keys.forEach((key) => {
			comparison[key] = Math.floor((100 * avg[key]) / baseline[key])
		})

		return {
			description: `Benchmark results, averaged after ${runCount} runs:
MongoDB small writes:        ${avg.mongoWriteSmall} ms (${comparison.mongoWriteSmall}%)
MongoDB large writes:        ${avg.mongoWriteBig} ms (${comparison.mongoWriteBig}%)
MongoDB reads with no index: ${avg.mongoRead} ms (${comparison.mongoRead}%)
MongoDB reads with index:    ${avg.mongoIndexedRead} ms (${comparison.mongoIndexedRead}%)

CPU calculations:            ${avg.cpuCalculations} ms (${comparison.cpuCalculations}%)
CPU JSON stringifying:       ${avg.cpuStringifying} ms (${comparison.cpuStringifying}%)`,
			results: avg,
		}
	}
}
registerClassToMeteorMethods(SystemAPIMethods, SystemAPIClass, false)
