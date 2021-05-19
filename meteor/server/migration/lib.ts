import { Mongo } from 'meteor/mongo'
import * as _ from 'underscore'
import {
	MigrationStepInput,
	MigrationStepInputFilteredResult,
	MigrationStepBase,
} from '@sofie-automation/blueprints-integration'
import { Collections, objectPathGet, DBObj, ProtectedString } from '../../lib/lib'
import { Meteor } from 'meteor/meteor'
import { PeripheralDevices } from '../../lib/collections/PeripheralDevices'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { logger } from '../logging'
import * as semver from 'semver'
import { TransformedCollection } from '../../lib/typings/meteor'

/**
 * Returns a migration step that ensures the provided property is set in the collection
 */
export function ensureCollectionProperty<T = any>(
	collectionName: string,
	selector: Mongo.Selector<T>,
	property: string,
	defaultValue: any,
	dependOnResultFrom?: string
): MigrationStepBase {
	let collection: TransformedCollection<T, any> = Collections[collectionName]
	if (!collection) throw new Meteor.Error(404, `Collection ${collectionName} not found`)

	return {
		id: `${collectionName}.${property}`,
		canBeRunAutomatically: true,
		validate: () => {
			let objects = collection.find(selector).fetch()
			let propertyMissing: string | boolean = false
			_.each(objects, (obj: any) => {
				let objValue = objectPathGet(obj, property)
				if (!objValue && objValue !== defaultValue) {
					propertyMissing = `${property} is missing on ${obj._id}`
				}
			})
			// logger.info('')
			return propertyMissing
		},
		migrate: (input: MigrationStepInputFilteredResult) => {
			let objects = collection.find(selector).fetch()
			_.each(objects, (obj: any) => {
				if (obj && objectPathGet(obj, property) !== defaultValue) {
					let m = {}
					m[property] = defaultValue
					logger.info(
						`Migration: Setting ${collectionName} object "${obj._id}".${property} to ${defaultValue}`
					)
					collection.update(obj._id, { $set: m })
				} else {
				}
			})
		},
		dependOnResultFrom: dependOnResultFrom,
	}
}
/**
 * Returns a migration step that ensures the provided property is set in the collection
 */
export function ensureCollectionPropertyManual<T = any>(
	collectionName: string,
	selector: Mongo.Selector<T>,
	property: string,
	inputType?: 'text' | 'multiline' | 'int' | 'checkbox' | 'dropdown' | 'switch', // EditAttribute types
	label?: string,
	description?: string,
	defaultValue?: any,
	dependOnResultFrom?: string
): MigrationStepBase {
	let collection: TransformedCollection<T, any> = Collections[collectionName]
	if (!collection) throw new Meteor.Error(404, `Collection ${collectionName} not found`)

	return {
		id: `${collectionName}.${property}`,
		canBeRunAutomatically: false,
		validate: () => {
			let objects = collection.find(selector).fetch()
			let propertyMissing: string | boolean = false
			_.each(objects, (obj: any) => {
				let objValue = objectPathGet(obj, property)
				if (objValue === undefined) {
					propertyMissing = `${property} is missing on ${obj._id}`
				}
			})
			return propertyMissing
		},
		input: () => {
			let objects = collection.find(selector).fetch()

			let inputs: Array<MigrationStepInput> = []
			_.each(objects, (obj: any) => {
				let localLabel = (label + '').replace(/\$id/g, obj._id)
				let localDescription = (description + '').replace(/\$id/g, obj._id)
				if (inputType && !obj[property]) {
					inputs.push({
						label: localLabel,
						description: localDescription,
						inputType: inputType,
						attribute: obj._id,
						defaultValue: defaultValue,
					})
				}
			})
			return inputs
		},
		migrate: (input: MigrationStepInputFilteredResult) => {
			_.each(input, (value, objectId: string) => {
				if (!_.isUndefined(value)) {
					let obj = collection.findOne(objectId)
					if (obj && objectPathGet(obj, property) !== value) {
						let m = {}
						m[property] = value
						logger.info(`Migration: Setting ${collectionName} object "${objectId}".${property} to ${value}`)
						collection.update(objectId, { $set: m })
					}
				}
			})
		},
		dependOnResultFrom: dependOnResultFrom,
	}
}
export function removeCollectionProperty<T = any>(
	collectionName: string,
	selector: Mongo.Selector<T>,
	property: string,
	dependOnResultFrom?: string
): MigrationStepBase {
	let collection: TransformedCollection<T, any> = Collections[collectionName]
	if (!collection) throw new Meteor.Error(404, `Collection ${collectionName} not found`)

	return {
		id: `${collectionName}.${property}`,
		canBeRunAutomatically: true,
		validate: () => {
			let objects = collection.find(selector).fetch()
			let propertySet: string | boolean = false
			_.each(objects, (obj: any) => {
				let objValue = objectPathGet(obj, property)
				if (objValue !== undefined) {
					propertySet = `${property} is set ${obj._id}`
				}
			})

			return propertySet
		},
		migrate: () => {
			const objects = collection.find(selector).fetch()
			_.each(objects, (obj: any) => {
				if (obj && objectPathGet(obj, property) !== undefined) {
					let m = {}
					m[property] = 1
					logger.info(`Migration: Removing property ${collectionName}."${obj._id}".${property}`)
					collection.update(obj._id, { $unset: m })
				}
			})
		},
		dependOnResultFrom: dependOnResultFrom,
	}
}
function getMinVersion(versionStr: string | undefined): string {
	return (semver.minVersion(versionStr || '0.0.0') || { version: '0.0.0' }).version
}

export function setExpectedVersion(
	id: string,
	deviceType: PeripheralDeviceAPI.DeviceType,
	libraryName: string,
	versionStr: string
): MigrationStepBase {
	return {
		id: id,
		canBeRunAutomatically: true,
		validate: () => {
			const minVersion = getMinVersion(versionStr)

			let devices = PeripheralDevices.find({
				type: deviceType,
				subType: PeripheralDeviceAPI.SUBTYPE_PROCESS,
			}).fetch()

			for (let i in devices) {
				let device = devices[i]
				if (!device.expectedVersions) device.expectedVersions = {}

				const expectedVersion = device.expectedVersions[libraryName] || '0.0.0'
				const minExpectedVersion = getMinVersion(expectedVersion)

				if (expectedVersion) {
					try {
						if (semver.lt(minExpectedVersion, minVersion)) {
							return `Expected version ${libraryName}: ${expectedVersion} should be at least ${versionStr}`
						}
					} catch (e) {
						return 'Error: ' + e.toString()
					}
				} else return `Expected version ${libraryName}: not set`
			}
			return false
		},
		migrate: () => {
			let devices = PeripheralDevices.find({ type: deviceType }).fetch()
			const minVersion = getMinVersion(versionStr)

			_.each(devices, (device) => {
				if (!device.expectedVersions) device.expectedVersions = {}

				const expectedVersion = device.expectedVersions[libraryName] || '0.0.0'
				const minExpectedVersion = getMinVersion(expectedVersion)

				if (!expectedVersion || semver.lt(minExpectedVersion, minVersion)) {
					let m = {}
					m['expectedVersions.' + libraryName] = versionStr
					logger.info(
						`Migration: Updating expectedVersion ${libraryName} of device ${device._id} from "${expectedVersion}" to "${versionStr}"`
					)
					PeripheralDevices.update(device._id, { $set: m })
				}
			})
		},
		overrideSteps: [id],
	}
}

interface RenameContent {
	content: { [newValue: string]: string }
}
export function renamePropertiesInCollection<T extends DBInterface, DBInterface extends { _id: ProtectedString<any> }>(
	id: string,
	collection: TransformedCollection<T, DBInterface>,
	collectionName: string,
	renames: Partial<{ [newAttr in keyof T]: string | RenameContent }>,
	dependOnResultFrom?: string
) {
	const m: any = {
		$or: [],
	}
	const oldNames: { [oldAttr: string]: string } = {}
	_.each(_.keys(renames), (newAttr) => {
		const oldAttr = renames[newAttr]
		if (_.isString(oldAttr)) {
			oldNames[oldAttr] = newAttr
		}
	})

	_.each(_.keys(renames), (newAttr) => {
		const oldAttr: string | RenameContent | undefined = renames[newAttr]
		if (oldAttr) {
			if (_.isString(oldAttr)) {
				const o = {}
				o[oldAttr] = { $exists: true }
				m.$or.push(o)
			} else {
				const oldAttrRenameContent: RenameContent = oldAttr // for some reason, tsc complains otherwise

				const oldAttrActual = oldNames[newAttr] || newAttr // If the attribute has been renamed, rename it here as well

				// Select where a value is of the old, to-be-replaced value:
				const o = {}
				o[oldAttrActual] = { $in: _.values(oldAttrRenameContent.content) }
				m.$or.push(o)
			}
		}
	})
	return {
		id: id,
		canBeRunAutomatically: true,
		dependOnResultFrom: dependOnResultFrom,
		validate: () => {
			const objCount = collection.find(m).count()
			if (objCount > 0) return `${objCount} documents in ${collectionName} needs to be updated`
			return false
		},
		migrate: () => {
			collection.find(m).forEach((doc) => {
				// Rename properties:
				_.each(_.keys(renames), (newAttr) => {
					const oldAttr: string | RenameContent | undefined = renames[newAttr]
					if (newAttr && oldAttr && newAttr !== oldAttr) {
						if (_.isString(oldAttr)) {
							if (_.has(doc, oldAttr) && !_.has(doc, newAttr)) {
								doc[newAttr] = doc[oldAttr]
							}
							delete doc[oldAttr]
						}
					}
				})
				// Translate property contents:
				_.each(_.keys(renames), (newAttr) => {
					const oldAttr: string | RenameContent | undefined = renames[newAttr]
					if (newAttr && oldAttr && newAttr !== oldAttr) {
						if (!_.isString(oldAttr)) {
							const oldAttrRenameContent: RenameContent = oldAttr // for some reason, tsc complains otherwise

							_.each(oldAttrRenameContent.content, (oldValue, newValue) => {
								if (doc[newAttr] === oldValue) {
									doc[newAttr] = newValue
								}
							})
						}
					}
				})
				collection.update(doc._id, doc)
			})
			//
		},
	}
}
