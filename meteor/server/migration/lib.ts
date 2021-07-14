import { Mongo } from 'meteor/mongo'
import * as _ from 'underscore'
import {
	MigrationStepInput,
	MigrationStepInputFilteredResult,
	MigrationStepBase,
} from '@sofie-automation/blueprints-integration'
import { Collections, objectPathGet, ProtectedString } from '../../lib/lib'
import { Meteor } from 'meteor/meteor'
import { logger } from '../logging'
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
	const collection: TransformedCollection<T, any> = Collections[collectionName]
	if (!collection) throw new Meteor.Error(404, `Collection ${collectionName} not found`)

	return {
		id: `${collectionName}.${property}`,
		canBeRunAutomatically: true,
		validate: () => {
			const objects = collection.find(selector).fetch()
			let propertyMissing: string | boolean = false
			_.each(objects, (obj: any) => {
				const objValue = objectPathGet(obj, property)
				if (!objValue && objValue !== defaultValue) {
					propertyMissing = `${property} is missing on ${obj._id}`
				}
			})
			// logger.info('')
			return propertyMissing
		},
		migrate: () => {
			const objects = collection.find(selector).fetch()
			_.each(objects, (obj: any) => {
				if (obj && objectPathGet(obj, property) !== defaultValue) {
					const m = {}
					m[property] = defaultValue
					logger.info(
						`Migration: Setting ${collectionName} object "${obj._id}".${property} to ${defaultValue}`
					)
					collection.update(obj._id, { $set: m })
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
	const collection: TransformedCollection<T, any> = Collections[collectionName]
	if (!collection) throw new Meteor.Error(404, `Collection ${collectionName} not found`)

	return {
		id: `${collectionName}.${property}`,
		canBeRunAutomatically: false,
		validate: () => {
			const objects = collection.find(selector).fetch()
			let propertyMissing: string | boolean = false
			_.each(objects, (obj: any) => {
				const objValue = objectPathGet(obj, property)
				if (objValue === undefined) {
					propertyMissing = `${property} is missing on ${obj._id}`
				}
			})
			return propertyMissing
		},
		input: () => {
			const objects = collection.find(selector).fetch()

			const inputs: Array<MigrationStepInput> = []
			_.each(objects, (obj: any) => {
				const localLabel = (label + '').replace(/\$id/g, obj._id)
				const localDescription = (description + '').replace(/\$id/g, obj._id)
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
					const obj = collection.findOne(objectId)
					if (obj && objectPathGet(obj, property) !== value) {
						const m = {}
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
	const collection: TransformedCollection<T, any> = Collections[collectionName]
	if (!collection) throw new Meteor.Error(404, `Collection ${collectionName} not found`)

	return {
		id: `${collectionName}.${property}`,
		canBeRunAutomatically: true,
		validate: () => {
			const objects = collection.find(selector).fetch()
			let propertySet: string | boolean = false
			_.each(objects, (obj: any) => {
				const objValue = objectPathGet(obj, property)
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
					const m = {}
					m[property] = 1
					logger.info(`Migration: Removing property ${collectionName}."${obj._id}".${property}`)
					collection.update(obj._id, { $unset: m })
				}
			})
		},
		dependOnResultFrom: dependOnResultFrom,
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
