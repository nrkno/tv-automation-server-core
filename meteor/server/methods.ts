import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'
import { logger } from './logging'
import { extractFunctionSignature } from './lib'
import { MethodContext } from '../lib/api/methods'

type MeteorMethod = (this: Meteor.MethodThisType, ...args: any[]) => any

interface Methods {
	[method: string]: MeteorMethod
}
export interface MethodsInner {
	[method: string]: { wrapped: MeteorMethod; original: MeteorMethod }
}
export const MeteorMethodSignatures: { [key: string]: string[] } = {}

let runningMethods: {
	[methodId: string]: {
		method: string
		startTime: number
		i: number
	}
} = {}
let runningMethodstudio: number = 0

function getAllClassMethods(myClass: any): string[] {
	const objectProtProps = Object.getOwnPropertyNames(Object.prototype)
	const classProps = Object.getOwnPropertyNames(myClass.prototype)

	return classProps
		.filter((name) => objectProtProps.indexOf(name) < 0)
		.filter((name) => typeof myClass.prototype[name] === 'function')
}

export function registerClassToMeteorMethods(
	methodEnum: any,
	orgClass: any,
	secret?: boolean,
	wrapper?: (methodContext: MethodContext, methodName: string, args: any[], fcn: Function) => any
): void {
	const methods: MethodsInner = {}
	_.each(getAllClassMethods(orgClass), (classMethodName) => {
		const enumValue = methodEnum[classMethodName]
		if (!enumValue)
			throw new Meteor.Error(
				500,
				`registerClassToMeteorMethods: The method "${classMethodName}" is not set in the enum containing methods.`
			)
		if (wrapper) {
			methods[enumValue] = {
				wrapped: function(...args: any[]) {
					return wrapper(this, enumValue, args, orgClass.prototype[classMethodName])
				},
				original: orgClass.prototype[classMethodName],
			}
		} else {
			methods[enumValue] = {
				wrapped: orgClass.prototype[classMethodName],
				original: orgClass.prototype[classMethodName],
			}
		}
	})
	setMeteorMethods(methods, secret)
}
/**
 * Wrapper for Meteor.methods(), keeps track of which methods are currently running
 * @param orgMethods The methods to add
 * @param secret Set to true to not expose methods to API
 */
function setMeteorMethods(orgMethods: MethodsInner, secret?: boolean): void {
	// Wrap methods
	let methods: Methods = {}
	_.each(orgMethods, (m, methodName: string) => {
		let method = m.wrapped
		if (method) {
			methods[methodName] = function(...args: any[]) {
				let i = runningMethodstudio++
				let methodId = 'm' + i

				runningMethods[methodId] = {
					method: methodName,
					startTime: Date.now(),
					i: i,
				}
				try {
					let result = method.apply(this, args)

					if (typeof result === 'object' && result.then) {
						// The method result is a promise
						return Promise.resolve(result).then((result) => {
							delete runningMethods[methodId]
							return result
						})
					} else {
						delete runningMethods[methodId]
						return result
					}
				} catch (err) {
					logger.error(err.message || err.reason || (err.toString ? err.toString() : null) || err)
					delete runningMethods[methodId]
					throw err
				}
			}
			if (!secret) {
				const signature = extractFunctionSignature(m.original)
				if (signature) MeteorMethodSignatures[methodName] = signature
			}
		}
	})
	Meteor.methods(methods)
}
export function getRunningMethods() {
	return runningMethods
}
export function resetRunningMethods() {
	runningMethods = {}
}
