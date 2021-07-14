import { check } from '../../lib/check'
import { registerClassToMeteorMethods } from '../methods'
import { NewShowStylesAPI, ShowStylesAPIMethods } from '../../lib/api/showStyles'
import { Meteor } from 'meteor/meteor'
import { ShowStyleBases, ShowStyleBase, ShowStyleBaseId } from '../../lib/collections/ShowStyleBases'
import {
	ShowStyleVariants,
	ShowStyleVariantId,
	ShowStyleCompound,
	ShowStyleVariant,
} from '../../lib/collections/ShowStyleVariants'
import { protectString, getRandomId } from '../../lib/lib'
import { RundownLayouts } from '../../lib/collections/RundownLayouts'
import { MethodContextAPI, MethodContext } from '../../lib/api/methods'
import { OrganizationContentWriteAccess } from '../security/organization'
import { ShowStyleContentWriteAccess } from '../security/showStyle'
import { Credentials } from '../security/lib/credentials'
import { OrganizationId } from '../../lib/collections/Organization'
import deepmerge from 'deepmerge'
import { ReadonlyDeep } from 'type-fest'
import { DBRundown } from '../../lib/collections/Rundowns'

export async function getShowStyleCompound(
	showStyleVariantId: ShowStyleVariantId
): Promise<ShowStyleCompound | undefined> {
	const showStyleVariant = await ShowStyleVariants.findOneAsync(showStyleVariantId)
	if (!showStyleVariant) return undefined
	const showStyleBase = await ShowStyleBases.findOneAsync(showStyleVariant.showStyleBaseId)
	if (!showStyleBase) return undefined

	return createShowStyleCompound(showStyleBase, showStyleVariant)
}
export async function getShowStyleCompoundForRundown(
	rundown: Pick<ReadonlyDeep<DBRundown>, '_id' | 'showStyleBaseId' | 'showStyleVariantId'>
): Promise<ShowStyleCompound> {
	const [showStyleBase, showStyleVariant] = await Promise.all([
		ShowStyleBases.findOneAsync({ _id: rundown.showStyleBaseId }),
		ShowStyleVariants.findOneAsync({ _id: rundown.showStyleVariantId }),
	])
	if (!showStyleBase)
		throw new Meteor.Error(404, `ShowStyleBase "${rundown.showStyleBaseId}" for Rundown "${rundown._id}" not found`)
	if (!showStyleVariant)
		throw new Meteor.Error(
			404,
			`ShowStyleVariant "${rundown.showStyleVariantId}" for Rundown "${rundown._id}" not found`
		)

	const compound = createShowStyleCompound(showStyleBase, showStyleVariant)
	if (!compound)
		throw new Meteor.Error(
			404,
			`Failed to compile ShowStyleCompound for base "${rundown.showStyleBaseId}" and variant  "${rundown.showStyleVariantId}"`
		)

	return compound
}

export function createShowStyleCompound(
	showStyleBase: ShowStyleBase,
	showStyleVariant: ShowStyleVariant
): ShowStyleCompound | undefined {
	if (showStyleBase._id !== showStyleVariant.showStyleBaseId) return undefined

	const configs = deepmerge(showStyleBase.blueprintConfig, showStyleVariant.blueprintConfig, {
		arrayMerge: (_destinationArray, sourceArray, _options) => sourceArray,
	})

	return {
		...showStyleBase,
		showStyleVariantId: showStyleVariant._id,
		name: `${showStyleBase.name}-${showStyleVariant.name}`,
		blueprintConfig: configs,
		_rundownVersionHash: showStyleBase._rundownVersionHash,
		_rundownVersionHashVariant: showStyleVariant._rundownVersionHash,
	}
}

export async function insertShowStyleBase(context: MethodContext | Credentials): Promise<ShowStyleBaseId> {
	const access = OrganizationContentWriteAccess.studio(context)
	return insertShowStyleBaseInner(access.organizationId)
}
export async function insertShowStyleBaseInner(organizationId: OrganizationId | null): Promise<ShowStyleBaseId> {
	const showStyleBase: ShowStyleBase = {
		_id: getRandomId(),
		name: 'New show style',
		organizationId: organizationId,
		blueprintId: protectString(''),
		outputLayers: [],
		sourceLayers: [],
		blueprintConfig: {},
		_rundownVersionHash: '',
	}
	ShowStyleBases.insert(showStyleBase)
	await insertShowStyleVariantInner(showStyleBase, 'Default')
	return showStyleBase._id
}
export async function insertShowStyleVariant(
	context: MethodContext | Credentials,
	showStyleBaseId: ShowStyleBaseId,
	name?: string
): Promise<ShowStyleVariantId> {
	check(showStyleBaseId, String)

	const access = ShowStyleContentWriteAccess.anyContent(context, showStyleBaseId)
	const showStyleBase = access.showStyleBase
	if (!showStyleBase) throw new Meteor.Error(404, `showStyleBase "${showStyleBaseId}" not found`)

	return insertShowStyleVariantInner(showStyleBase, name)
}
export async function insertShowStyleVariantInner(
	showStyleBase: ShowStyleBase,
	name?: string
): Promise<ShowStyleVariantId> {
	return ShowStyleVariants.insertAsync({
		_id: getRandomId(),
		showStyleBaseId: showStyleBase._id,
		name: name || 'Variant',
		blueprintConfig: {},
		_rundownVersionHash: '',
	})
}
export async function removeShowStyleBase(context: MethodContext, showStyleBaseId: ShowStyleBaseId): Promise<void> {
	check(showStyleBaseId, String)
	const access = ShowStyleContentWriteAccess.anyContent(context, showStyleBaseId)
	const showStyleBase = access.showStyleBase
	if (!showStyleBase) throw new Meteor.Error(404, `showStyleBase "${showStyleBaseId}" not found`)

	await Promise.allSettled([
		ShowStyleBases.removeAsync(showStyleBase._id),
		ShowStyleVariants.removeAsync({
			showStyleBaseId: showStyleBase._id,
		}),
		RundownLayouts.removeAsync({
			showStyleBaseId: showStyleBase._id,
		}),
	])
}
export async function removeShowStyleVariant(
	context: MethodContext,
	showStyleVariantId: ShowStyleVariantId
): Promise<void> {
	check(showStyleVariantId, String)

	const access = ShowStyleContentWriteAccess.showStyleVariant(context, showStyleVariantId)
	const showStyleVariant = access.showStyleVariant
	if (!showStyleVariant) throw new Meteor.Error(404, `showStyleVariant "${showStyleVariantId}" not found`)

	await ShowStyleVariants.removeAsync(showStyleVariant._id)
}

class ServerShowStylesAPI extends MethodContextAPI implements NewShowStylesAPI {
	insertShowStyleBase() {
		return insertShowStyleBase(this)
	}
	insertShowStyleVariant(showStyleBaseId: ShowStyleBaseId) {
		return insertShowStyleVariant(this, showStyleBaseId)
	}
	removeShowStyleBase(showStyleBaseId: ShowStyleBaseId) {
		return removeShowStyleBase(this, showStyleBaseId)
	}
	removeShowStyleVariant(showStyleVariantId: ShowStyleVariantId) {
		return removeShowStyleVariant(this, showStyleVariantId)
	}
}
registerClassToMeteorMethods(ShowStylesAPIMethods, ServerShowStylesAPI, false)
