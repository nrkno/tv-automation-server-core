import { Meteor } from 'meteor/meteor'
import '../server/api/logger'

// Include this file in to get access to the extended functions

expect.extend({
	toBeWithinRange(received, floor, ceiling) {
		const pass = received >= floor && received <= ceiling
		return {
			message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
			pass: pass,
		}
	},
	toBeFuzzy(received, target, fuzzyness) {
		const pass = received >= target - fuzzyness && received <= target + fuzzyness
		return {
			message: () => `expected ${received} to be within ${fuzzyness} to ${target}`,
			pass: pass,
		}
	},
	toThrowMeteor(received, error, ...args) {
		const expected = new Meteor.Error(error, ...args)
		const pass = expected.toString() === received.toString()
		return {
			message: () => `expected ${received} to be ${expected}`,
			pass: pass,
		}
	},
	toMatchToString(received, regexp) {
		const pass = !!received.toString().match(regexp)
		return {
			message: () => `expected ${received} to match ${regexp}`,
			pass: pass,
		}
	},
})
declare global {
	namespace jest {
		interface Matchers<R> {
			toBeWithinRange(floor: number, ceiling: number): R
			toBeFuzzy(target: number, fuzzyness: number): R

			toThrowMeteor(...args: ConstructorParameters<typeof Meteor.Error>): R
			toMatchToString(reg: RegExp): R
		}
	}
}
