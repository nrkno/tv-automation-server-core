import * as _ from 'underscore'
import * as objectPath from 'object-path'
import {
	trimIfString,
	getHash,
	unprotectObject,
	protectString,
	unprotectString,
	objectPathGet,
	objectPathSet,
} from '../../../lib/lib'
import { Studios, Studio, DBStudio } from '../../../lib/collections/Studios'
import { ShowStyleBase, ShowStyleBases, DBShowStyleBase } from '../../../lib/collections/ShowStyleBases'
import { Meteor } from 'meteor/meteor'
import {
	ConfigItemValue,
	MigrationContextStudio as IMigrationContextStudio,
	MigrationContextShowStyle as IMigrationContextShowStyle,
	BlueprintMapping,
	IOutputLayer,
	ISourceLayer,
	ShowStyleVariantPart,
	IBlueprintShowStyleVariant,
	TSR,
	OmitId,
} from '@sofie-automation/blueprints-integration'

import {
	ShowStyleVariants,
	ShowStyleVariant,
	ShowStyleVariantId,
	DBShowStyleVariant,
} from '../../../lib/collections/ShowStyleVariants'
import { check } from '../../../lib/check'
import { PeripheralDeviceAPI } from '../../../lib/api/peripheralDevice'
import { PeripheralDevices, PeripheralDevice } from '../../../lib/collections/PeripheralDevices'
import { PlayoutDeviceSettings } from '../../../lib/collections/PeripheralDeviceSettings/playoutDevice'
import { Mongo } from 'meteor/mongo'

export class MigrationContextStudio implements IMigrationContextStudio {
	private studio: Studio

	constructor(studio: Studio) {
		this.studio = studio
	}

	getMapping(mappingId: string): BlueprintMapping | undefined {
		check(mappingId, String)
		const mapping = this.studio.mappings[mappingId]
		if (mapping) return unprotectObject(_.clone(mapping))
	}
	insertMapping(mappingId: string, mapping: OmitId<BlueprintMapping>): string {
		check(mappingId, String)
		if (this.studio.mappings[mappingId]) {
			throw new Meteor.Error(404, `Mapping "${mappingId}" cannot be inserted as it already exists`)
		}
		if (!mappingId) {
			throw new Meteor.Error(500, `Mapping id "${mappingId}" is invalid`)
		}

		const m: any = {}
		m['mappings.' + mappingId] = mapping
		Studios.update(this.studio._id, { $set: m })
		this.studio.mappings[mappingId] = m['mappings.' + mappingId] // Update local
		return mappingId
	}
	updateMapping(mappingId: string, mapping: Partial<BlueprintMapping>): void {
		check(mappingId, String)
		if (!this.studio.mappings[mappingId]) {
			throw new Meteor.Error(404, `Mapping "${mappingId}" cannot be updated as it does not exist`)
		}

		if (mappingId) {
			const m: any = {}
			m['mappings.' + mappingId] = _.extend(this.studio.mappings[mappingId], mapping)
			Studios.update(this.studio._id, { $set: m })
			this.studio.mappings[mappingId] = m['mappings.' + mappingId] // Update local
		}
	}
	removeMapping(mappingId: string): void {
		check(mappingId, String)
		if (mappingId) {
			const m: any = {}
			m['mappings.' + mappingId] = 1
			Studios.update(this.studio._id, { $unset: m })
			delete this.studio.mappings[mappingId] // Update local
		}
	}

	getConfig(configId: string): ConfigItemValue | undefined {
		check(configId, String)
		if (configId === '') return undefined
		const configItem = objectPathGet(this.studio.blueprintConfig, configId)
		return trimIfString(configItem)
	}
	setConfig(configId: string, value: ConfigItemValue): void {
		check(configId, String)
		if (!configId) {
			throw new Meteor.Error(500, `Config id "${configId}" is invalid`)
		}

		value = trimIfString(value)

		let modifier: Mongo.Modifier<DBStudio> = {}
		if (value === undefined) {
			modifier = {
				$unset: {
					[`blueprintConfig.${configId}`]: 1,
				},
			}
			objectPath.del(this.studio.blueprintConfig, configId) // Update local
		} else {
			modifier = {
				$set: {
					[`blueprintConfig.${configId}`]: value,
				},
			}
			objectPathSet(this.studio.blueprintConfig, configId, value) // Update local
		}
		Studios.update(
			{
				_id: this.studio._id,
			},
			modifier
		)
	}
	removeConfig(configId: string): void {
		check(configId, String)

		if (configId) {
			Studios.update(
				{
					_id: this.studio._id,
				},
				{
					$unset: {
						[`blueprintConfig.${configId}`]: 1,
					},
				}
			)
			// Update local:
			objectPath.del(this.studio.blueprintConfig, configId)
		}
	}

	getDevice(deviceId: string): TSR.DeviceOptionsAny | undefined {
		check(deviceId, String)

		const selector: Mongo.Selector<PeripheralDevice> = {
			type: PeripheralDeviceAPI.DeviceType.PLAYOUT,
			studioId: this.studio._id,
		}
		selector[`settings.devices.${deviceId}`] = { $exists: 1 }

		const parentDevice = PeripheralDevices.findOne(selector, {
			sort: {
				created: 1,
			},
		})

		if (!parentDevice || !parentDevice.settings) return undefined
		return (parentDevice.settings as PlayoutDeviceSettings).devices[deviceId]
	}
	insertDevice(deviceId: string, device: TSR.DeviceOptionsAny): string {
		check(deviceId, String)

		if (!deviceId) {
			throw new Meteor.Error(500, `Device id "${deviceId}" is invalid`)
		}

		const parentDevice = PeripheralDevices.findOne(
			{
				type: PeripheralDeviceAPI.DeviceType.PLAYOUT,
				studioId: this.studio._id,
			},
			{
				sort: {
					created: 1,
				},
			}
		)
		if (!parentDevice) {
			throw new Meteor.Error(404, `No parent device for new device id "${deviceId}"`)
		}

		const settings = parentDevice.settings as PlayoutDeviceSettings | undefined
		if (settings && settings.devices[deviceId]) {
			throw new Meteor.Error(404, `Device "${deviceId}" cannot be inserted as it already exists`)
		}

		const m: any = {}
		m[`settings.devices.${deviceId}`] = device

		PeripheralDevices.update(parentDevice._id, {
			$set: m,
		})

		return deviceId
	}
	updateDevice(deviceId: string, device: Partial<TSR.DeviceOptionsAny>): void {
		check(deviceId, String)

		if (!deviceId) {
			throw new Meteor.Error(500, `Device id "${deviceId}" is invalid`)
		}

		const selector: Mongo.Selector<PeripheralDevice> = {
			type: PeripheralDeviceAPI.DeviceType.PLAYOUT,
			studioId: this.studio._id,
		}
		selector[`settings.devices.${deviceId}`] = { $exists: 1 }

		const parentDevice = PeripheralDevices.findOne(selector, {
			sort: {
				created: 1,
			},
		})
		if (!parentDevice || !parentDevice.settings) {
			throw new Meteor.Error(404, `Device "${deviceId}" cannot be updated as it does not exist`)
		}

		const m: any = {}
		m[`settings.devices.${deviceId}`] = _.extend(
			(parentDevice.settings as PlayoutDeviceSettings).devices[deviceId],
			device
		)
		PeripheralDevices.update(selector, {
			$set: m,
		})
	}
	removeDevice(deviceId: string): void {
		check(deviceId, String)

		if (!deviceId) {
			throw new Meteor.Error(500, `Device id "${deviceId}" is invalid`)
		}

		const m: any = {}
		m[`settings.devices.${deviceId}`] = 1
		PeripheralDevices.update(
			{
				type: PeripheralDeviceAPI.DeviceType.PLAYOUT,
				studioId: this.studio._id,
			},
			{
				$unset: m,
			}
		)
	}
}

export class MigrationContextShowStyle implements IMigrationContextShowStyle {
	private showStyleBase: ShowStyleBase

	constructor(showStyleBase: ShowStyleBase) {
		this.showStyleBase = showStyleBase
	}

	getAllVariants(): IBlueprintShowStyleVariant[] {
		return ShowStyleVariants.find({
			showStyleBaseId: this.showStyleBase._id,
		}).map((variant) => unprotectObject(variant)) as any
	}
	getVariantId(variantId: string): string {
		return getHash(this.showStyleBase._id + '_' + variantId)
	}
	private getProtectedVariantId(variantId: string): ShowStyleVariantId {
		return protectString<ShowStyleVariantId>(this.getVariantId(variantId))
	}
	private getVariantFromDb(variantId: string): ShowStyleVariant | undefined {
		const variant = ShowStyleVariants.findOne({
			showStyleBaseId: this.showStyleBase._id,
			_id: this.getProtectedVariantId(variantId),
		})
		if (variant) return variant

		// Assume we were given the full id
		return ShowStyleVariants.findOne({
			showStyleBaseId: this.showStyleBase._id,
			_id: protectString(variantId),
		})
	}
	getVariant(variantId: string): IBlueprintShowStyleVariant | undefined {
		check(variantId, String)
		if (!variantId) {
			throw new Meteor.Error(500, `Variant id "${variantId}" is invalid`)
		}

		return unprotectObject(this.getVariantFromDb(variantId)) as any
	}
	insertVariant(variantId: string, variant: OmitId<ShowStyleVariantPart>): string {
		check(variantId, String)
		if (!variantId) {
			throw new Meteor.Error(500, `Variant id "${variantId}" is invalid`)
		}

		return unprotectString(
			ShowStyleVariants.insert({
				...variant,
				_id: this.getProtectedVariantId(variantId),
				showStyleBaseId: this.showStyleBase._id,
				blueprintConfig: {},
				_rundownVersionHash: '',
			})
		)
	}
	updateVariant(variantId: string, newVariant: Partial<ShowStyleVariantPart>): void {
		check(variantId, String)
		if (!variantId) {
			throw new Meteor.Error(500, `Variant id "${variantId}" is invalid`)
		}
		const variant = this.getVariantFromDb(variantId)
		if (!variant) throw new Meteor.Error(404, `Variant "${variantId}" not found`)

		ShowStyleVariants.update(variant._id, { $set: newVariant })
	}
	removeVariant(variantId: string): void {
		check(variantId, String)
		if (!variantId) {
			throw new Meteor.Error(500, `Variant id "${variantId}" is invalid`)
		}

		ShowStyleVariants.remove({
			_id: this.getProtectedVariantId(variantId),
			showStyleBaseId: this.showStyleBase._id,
		})
	}
	getSourceLayer(sourceLayerId: string): ISourceLayer | undefined {
		check(sourceLayerId, String)
		if (!sourceLayerId) {
			throw new Meteor.Error(500, `SourceLayer id "${sourceLayerId}" is invalid`)
		}

		return _.find(this.showStyleBase.sourceLayers, (part) => part._id === sourceLayerId)
	}
	insertSourceLayer(sourceLayerId: string, layer: OmitId<ISourceLayer>): string {
		check(sourceLayerId, String)
		if (!sourceLayerId) {
			throw new Meteor.Error(500, `SourceLayer id "${sourceLayerId}" is invalid`)
		}

		const oldLayer = _.find(this.showStyleBase.sourceLayers, (part) => part._id === sourceLayerId)
		if (oldLayer) {
			throw new Meteor.Error(500, `SourceLayer "${sourceLayerId}" already exists`)
		}

		const fullLayer: ISourceLayer = {
			...layer,
			_id: sourceLayerId,
		}
		ShowStyleBases.update(
			{
				_id: this.showStyleBase._id,
			},
			{
				$push: {
					sourceLayers: fullLayer,
				},
			}
		)
		if (!this.showStyleBase.sourceLayers) this.showStyleBase.sourceLayers = []
		this.showStyleBase.sourceLayers.push(fullLayer) // Update local
		return fullLayer._id
	}
	updateSourceLayer(sourceLayerId: string, layer: Partial<ISourceLayer>): void {
		check(sourceLayerId, String)
		if (!sourceLayerId) {
			throw new Meteor.Error(500, `SourceLayer id "${sourceLayerId}" is invalid`)
		}

		const localLayerIndex = _.findIndex(this.showStyleBase.sourceLayers, (part) => part._id === sourceLayerId)
		if (localLayerIndex === -1) {
			throw new Meteor.Error(404, `SourceLayer "${sourceLayerId}" cannot be updated as it does not exist`)
		}

		const fullLayer = {
			...this.showStyleBase.sourceLayers[localLayerIndex],
			...layer,
		}
		ShowStyleBases.update(
			{
				_id: this.showStyleBase._id,
				'sourceLayers._id': sourceLayerId,
			},
			{
				$set: {
					'sourceLayers.$': fullLayer,
				},
			}
		)
		this.showStyleBase.sourceLayers[localLayerIndex] = fullLayer // Update local
	}
	removeSourceLayer(sourceLayerId: string): void {
		check(sourceLayerId, String)
		if (!sourceLayerId) {
			throw new Meteor.Error(500, `SourceLayer id "${sourceLayerId}" is invalid`)
		}

		ShowStyleBases.update(
			{
				_id: this.showStyleBase._id,
			},
			{
				$pull: {
					sourceLayers: {
						_id: sourceLayerId,
					},
				},
			}
		)
		// Update local:
		this.showStyleBase.sourceLayers = _.reject(this.showStyleBase.sourceLayers, (c) => c._id === sourceLayerId)
	}
	getOutputLayer(outputLayerId: string): IOutputLayer | undefined {
		check(outputLayerId, String)
		if (!outputLayerId) {
			throw new Meteor.Error(500, `OutputLayer id "${outputLayerId}" is invalid`)
		}

		return _.find(this.showStyleBase.outputLayers, (part) => part._id === outputLayerId)
	}
	insertOutputLayer(outputLayerId: string, layer: OmitId<IOutputLayer>): string {
		check(outputLayerId, String)
		if (!outputLayerId) {
			throw new Meteor.Error(500, `OutputLayer id "${outputLayerId}" is invalid`)
		}

		const oldLayer = _.find(this.showStyleBase.outputLayers, (part) => part._id === outputLayerId)
		if (oldLayer) {
			throw new Meteor.Error(500, `OutputLayer "${outputLayerId}" already exists`)
		}

		const fullLayer: IOutputLayer = {
			...layer,
			_id: outputLayerId,
		}
		ShowStyleBases.update(
			{
				_id: this.showStyleBase._id,
			},
			{
				$push: {
					outputLayers: fullLayer,
				},
			}
		)
		if (!this.showStyleBase.outputLayers) this.showStyleBase.outputLayers = []
		this.showStyleBase.outputLayers.push(fullLayer) // Update local
		return fullLayer._id
	}
	updateOutputLayer(outputLayerId: string, layer: Partial<IOutputLayer>): void {
		check(outputLayerId, String)
		if (!outputLayerId) {
			throw new Meteor.Error(500, `OutputLayer id "${outputLayerId}" is invalid`)
		}

		const localLayerIndex = _.findIndex(this.showStyleBase.outputLayers, (part) => part._id === outputLayerId)
		if (localLayerIndex === -1) {
			throw new Meteor.Error(404, `OutputLayer "${outputLayerId}" cannot be updated as it does not exist`)
		}

		const fullLayer = {
			...this.showStyleBase.outputLayers[localLayerIndex],
			...layer,
		}
		ShowStyleBases.update(
			{
				_id: this.showStyleBase._id,
				'outputLayers._id': outputLayerId,
			},
			{
				$set: {
					'outputLayers.$': fullLayer,
				},
			}
		)
		this.showStyleBase.outputLayers[localLayerIndex] = fullLayer // Update local
	}
	removeOutputLayer(outputLayerId: string): void {
		check(outputLayerId, String)
		if (!outputLayerId) {
			throw new Meteor.Error(500, `OutputLayer id "${outputLayerId}" is invalid`)
		}

		ShowStyleBases.update(
			{
				_id: this.showStyleBase._id,
			},
			{
				$pull: {
					outputLayers: {
						_id: outputLayerId,
					},
				},
			}
		)
		// Update local:
		this.showStyleBase.outputLayers = _.reject(this.showStyleBase.outputLayers, (c) => c._id === outputLayerId)
	}
	getBaseConfig(configId: string): ConfigItemValue | undefined {
		check(configId, String)
		if (configId === '') return undefined
		const configItem = objectPathGet(this.showStyleBase.blueprintConfig, configId)
		return trimIfString(configItem)
	}
	setBaseConfig(configId: string, value: ConfigItemValue): void {
		check(configId, String)
		if (!configId) {
			throw new Meteor.Error(500, `Config id "${configId}" is invalid`)
		}

		if (_.isUndefined(value)) throw new Meteor.Error(400, `setBaseConfig "${configId}": value is undefined`)

		value = trimIfString(value)

		const modifier: Mongo.Modifier<DBShowStyleBase> = {
			$set: {
				[`blueprintConfig.${configId}`]: value,
			},
		}
		ShowStyleBases.update(
			{
				_id: this.showStyleBase._id,
			},
			modifier
		)
		objectPathSet(this.showStyleBase.blueprintConfig, configId, value) // Update local
	}
	removeBaseConfig(configId: string): void {
		check(configId, String)
		if (configId) {
			ShowStyleBases.update(
				{
					_id: this.showStyleBase._id,
				},
				{
					$unset: {
						[`blueprintConfig.${configId}`]: 1,
					},
				}
			)
			// Update local:
			objectPath.del(this.showStyleBase.blueprintConfig, configId)
		}
	}
	getVariantConfig(variantId: string, configId: string): ConfigItemValue | undefined {
		check(variantId, String)
		check(configId, String)
		if (configId === '') return undefined

		const variant = this.getVariantFromDb(variantId)
		if (!variant) throw new Meteor.Error(404, `ShowStyleVariant "${variantId}" not found`)

		const configItem = objectPathGet(variant.blueprintConfig, configId)
		return trimIfString(configItem)
	}
	setVariantConfig(variantId: string, configId: string, value: ConfigItemValue): void {
		check(variantId, String)
		check(configId, String)
		if (!configId) {
			throw new Meteor.Error(500, `Config id "${configId}" is invalid`)
		}

		value = trimIfString(value)

		if (_.isUndefined(value))
			throw new Meteor.Error(400, `setVariantConfig "${variantId}", "${configId}": value is undefined`)

		const variant = this.getVariantFromDb(variantId)
		if (!variant) throw new Meteor.Error(404, `ShowStyleVariant "${variantId}" not found`)

		const modifier: Mongo.Modifier<DBShowStyleVariant> = {
			$set: {
				[`blueprintConfig.${configId}`]: value,
			},
		}
		ShowStyleVariants.update(
			{
				_id: variant._id,
			},
			modifier
		)
		objectPathSet(variant.blueprintConfig, configId, value) // Update local
	}
	removeVariantConfig(variantId: string, configId: string): void {
		check(variantId, String)
		check(configId, String)

		if (configId) {
			const variant = this.getVariantFromDb(variantId)
			if (!variant) throw new Meteor.Error(404, `ShowStyleVariant "${variantId}" not found`)

			ShowStyleVariants.update(
				{
					_id: variant._id,
				},
				{
					$unset: {
						[`blueprintConfig.${configId}`]: 1,
					},
				}
			)
			// Update local:
			objectPath.del(variant.blueprintConfig, configId)
		}
	}
}
