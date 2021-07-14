import * as _ from 'underscore'
import {
	ConfigItemValue,
	ConfigManifestEntry,
	IBlueprintConfig,
	StudioBlueprintManifest,
	ShowStyleBlueprintManifest,
	BasicConfigItemValue,
	TableConfigItemValue,
} from '@sofie-automation/blueprints-integration'
import { Studios, Studio, StudioId } from '../../../lib/collections/Studios'
import { Meteor } from 'meteor/meteor'
import {
	ShowStyleVariantId,
	ShowStyleCompound,
	ShowStyleVariant,
	ShowStyleVariants,
} from '../../../lib/collections/ShowStyleVariants'
import { protectString, objectPathGet, objectPathSet } from '../../../lib/lib'
import { logger } from '../../../lib/logging'
import { loadStudioBlueprint, loadShowStyleBlueprint } from './cache'
import { ShowStyleBases, ShowStyleBaseId } from '../../../lib/collections/ShowStyleBases'
import { BlueprintId, Blueprints } from '../../../lib/collections/Blueprints'
import { CommonContext } from './context'
import { ReadonlyDeep } from 'type-fest'
import { getShowStyleCompound } from '../showStyles'

/**
 * This whole ConfigRef logic will need revisiting for a multi-studio context, to ensure that there are strict boundaries across who can give to access to what.
 * Especially relevant for multi-user.
 */
export namespace ConfigRef {
	export function getStudioConfigRef(studioId: StudioId, configKey: string): string {
		return '${studio.' + studioId + '.' + configKey + '}'
	}
	export function getShowStyleConfigRef(showStyleVariantId: ShowStyleVariantId, configKey: string): string {
		return '${showStyle.' + showStyleVariantId + '.' + configKey + '}'
	}
	export async function retrieveRefs(
		stringWithReferences: string,
		modifier?: (str: string) => string,
		bailOnError?: boolean
	): Promise<string> {
		if (!stringWithReferences) return stringWithReferences

		const refs = stringWithReferences.match(/\$\{[^}]+\}/g) || []
		for (const ref of refs) {
			if (ref) {
				let value = (await retrieveRef(ref, bailOnError)) + ''
				if (value) {
					if (modifier) value = modifier(value)
					stringWithReferences = stringWithReferences.replace(ref, value)
				}
			}
		}
		return stringWithReferences
	}
	async function retrieveRef(
		reference: string,
		bailOnError?: boolean
	): Promise<ConfigItemValue | string | undefined> {
		if (!reference) return undefined
		const m = reference.match(/\$\{([^.}]+)\.([^.}]+)\.([^.}]+)\}/)
		if (m) {
			if (m[1] === 'studio' && _.isString(m[2]) && _.isString(m[3])) {
				const studioId: StudioId = protectString(m[2])
				const configId = m[3]
				const studio = await Studios.findOneAsync(studioId)
				if (studio) {
					return objectPathGet(studio.blueprintConfig, configId)
				} else if (bailOnError)
					throw new Meteor.Error(404, `Ref "${reference}": Studio "${studioId}" not found`)
			} else if (m[1] === 'showStyle' && _.isString(m[2]) && _.isString(m[3])) {
				const showStyleVariantId = protectString<ShowStyleVariantId>(m[2])
				const configId = m[3]
				const showStyleCompound = await getShowStyleCompound(showStyleVariantId)
				if (showStyleCompound) {
					return objectPathGet(showStyleCompound.blueprintConfig, configId)
				} else if (bailOnError)
					throw new Meteor.Error(
						404,
						`Ref "${reference}": Showstyle variant "${showStyleVariantId}" not found`
					)
			}
		}
		return undefined
	}
}

export function preprocessStudioConfig(studio: ReadonlyDeep<Studio>, blueprint?: StudioBlueprintManifest) {
	let res: any = {}
	if (blueprint && blueprint.studioConfigManifest !== undefined) {
		applyToConfig(res, blueprint.studioConfigManifest, studio.blueprintConfig, `Studio ${studio._id}`)
	} else {
		res = studio.blueprintConfig
	}

	// Expose special values as defined in the studio
	res['SofieHostURL'] = studio.settings.sofieUrl

	if (blueprint && blueprint.preprocessConfig) {
		const context = new CommonContext({
			name: `preprocessStudioConfig`,
			identifier: `studioId=${studio._id}`,
		})
		res = blueprint.preprocessConfig(context, res)
	}
	return res
}

export function preprocessShowStyleConfig(
	showStyle: ReadonlyDeep<ShowStyleCompound>,
	blueprint?: ShowStyleBlueprintManifest
) {
	let res: any = {}
	if (blueprint && blueprint.showStyleConfigManifest !== undefined) {
		applyToConfig(res, blueprint.showStyleConfigManifest, showStyle.blueprintConfig, `ShowStyle ${showStyle._id}`)
	} else {
		res = showStyle.blueprintConfig
	}
	if (blueprint && blueprint.preprocessConfig) {
		const context = new CommonContext({
			name: `preprocessShowStyleConfig`,
			identifier: `showStyleBaseId=${showStyle._id},showStyleVariantId=${showStyle.showStyleVariantId}`,
		})
		res = blueprint.preprocessConfig(context, res)
	}
	return res
}

export function findMissingConfigs(
	manifest: ConfigManifestEntry[] | undefined,
	config: ReadonlyDeep<IBlueprintConfig>
) {
	const missingKeys: string[] = []
	if (manifest === undefined) {
		return missingKeys
	}
	_.each(manifest, (m) => {
		if (m.required && config && objectPathGet(config, m.id) === undefined) {
			missingKeys.push(m.name)
		}
	})

	return missingKeys
}

export function applyToConfig(
	res: any,
	configManifest: ConfigManifestEntry[],
	blueprintConfig: ReadonlyDeep<IBlueprintConfig>,
	source: string
) {
	for (const val of configManifest) {
		let newVal = val.defaultVal

		const overrideVal = objectPathGet(blueprintConfig, val.id) as
			| BasicConfigItemValue
			| TableConfigItemValue
			| undefined
		if (overrideVal !== undefined) {
			newVal = overrideVal
		} else if (val.required) {
			logger.warning(`Required config not defined in ${source}: "${val.name}"`)
		}

		objectPathSet(res, val.id, newVal)
	}
}

const studioBlueprintConfigCache = new Map<BlueprintId, Map<StudioId, Cache>>()
const showStyleBlueprintConfigCache = new Map<BlueprintId, Map<ShowStyleBaseId, Map<ShowStyleVariantId, Cache>>>()
interface Cache {
	config: unknown
}

export function forceClearAllBlueprintConfigCaches() {
	studioBlueprintConfigCache.clear()
	showStyleBlueprintConfigCache.clear()
}

export async function resetStudioBlueprintConfig(studio: ReadonlyDeep<Studio>): Promise<void> {
	for (const map of studioBlueprintConfigCache.values()) {
		map.delete(studio._id)
	}
	await getStudioBlueprintConfig(studio)
}

export async function getStudioBlueprintConfig(studio: ReadonlyDeep<Studio>): Promise<unknown> {
	let blueprintConfigMap = studio.blueprintId ? studioBlueprintConfigCache.get(studio.blueprintId) : undefined
	if (!blueprintConfigMap && studio.blueprintId) {
		blueprintConfigMap = new Map()
		studioBlueprintConfigCache.set(studio.blueprintId, blueprintConfigMap)
	}

	const cachedConfig = blueprintConfigMap?.get(studio._id)
	if (cachedConfig) {
		return cachedConfig.config
	}

	logger.debug('Building Studio config')
	const studioBlueprint = await loadStudioBlueprint(studio)
	if (studioBlueprint) {
		const diffs = findMissingConfigs(studioBlueprint.blueprint.studioConfigManifest, studio.blueprintConfig)
		if (diffs && diffs.length) {
			logger.warn(`Studio "${studio._id}" missing required config: ${diffs.join(', ')}`)
		}
	} else {
		logger.warn(`Studio blueprint "${studio.blueprintId}" not found!`)
	}
	const compiledConfig = preprocessStudioConfig(studio, studioBlueprint?.blueprint)
	blueprintConfigMap?.set(studio._id, {
		config: compiledConfig,
	})
	return compiledConfig
}

export async function resetShowStyleBlueprintConfig(showStyleCompound: ReadonlyDeep<ShowStyleCompound>): Promise<void> {
	for (const map of showStyleBlueprintConfigCache.values()) {
		map.get(showStyleCompound._id)?.delete(showStyleCompound.showStyleVariantId)
	}
	await getShowStyleBlueprintConfig(showStyleCompound)
}
export async function getShowStyleBlueprintConfig(
	showStyleCompound: ReadonlyDeep<ShowStyleCompound>
): Promise<unknown> {
	let blueprintConfigMap: Map<ShowStyleBaseId, Map<ShowStyleVariantId, Cache>> | undefined =
		showStyleCompound.blueprintId ? showStyleBlueprintConfigCache.get(showStyleCompound.blueprintId) : new Map()
	if (!blueprintConfigMap) {
		blueprintConfigMap = new Map()
		showStyleBlueprintConfigCache.set(showStyleCompound.blueprintId, blueprintConfigMap)
	}

	let showStyleBaseMap = blueprintConfigMap.get(showStyleCompound._id)
	if (!showStyleBaseMap) {
		showStyleBaseMap = new Map()
		blueprintConfigMap.set(showStyleCompound._id, showStyleBaseMap)
	}

	const cachedConfig = showStyleBaseMap.get(showStyleCompound.showStyleVariantId)
	if (cachedConfig) {
		return cachedConfig.config
	}

	const showStyleBlueprint = await loadShowStyleBlueprint(showStyleCompound)
	if (showStyleBlueprint) {
		const diffs = findMissingConfigs(
			showStyleBlueprint.blueprint.showStyleConfigManifest,
			showStyleCompound.blueprintConfig
		)
		if (diffs && diffs.length) {
			logger.warn(
				`ShowStyle "${showStyleCompound._id}-${
					showStyleCompound.showStyleVariantId
				}" missing required config: ${diffs.join(', ')}`
			)
		}
	} else {
		logger.warn(`ShowStyle blueprint "${showStyleCompound.blueprintId}" not found!`)
	}

	const compiledConfig = preprocessShowStyleConfig(showStyleCompound, showStyleBlueprint?.blueprint)
	showStyleBaseMap.set(showStyleCompound.showStyleVariantId, { config: compiledConfig })
	return compiledConfig
}

Meteor.startup(() => {
	if (Meteor.isServer) {
		Studios.find(
			{},
			{
				fields: {
					_rundownVersionHash: 1,
					blueprintId: 1,
				},
			}
		).observeChanges({
			changed: (id: StudioId) => {
				for (const map of studioBlueprintConfigCache.values()) {
					map.delete(id)
				}
			},
			removed: (id: StudioId) => {
				for (const map of studioBlueprintConfigCache.values()) {
					map.delete(id)
				}
			},
		})
		ShowStyleBases.find(
			{},
			{
				fields: {
					_rundownVersionHash: 1,
					blueprintId: 1,
				},
			}
		).observeChanges({
			changed: (id: ShowStyleBaseId) => {
				for (const map of showStyleBlueprintConfigCache.values()) {
					map.delete(id)
				}
			},
			removed: (id: ShowStyleBaseId) => {
				for (const map of showStyleBlueprintConfigCache.values()) {
					map.delete(id)
				}
			},
		})
		ShowStyleVariants.find(
			{},
			{
				fields: {
					_rundownVersionHash: 1,
					showStyleBaseId: 1,
					_id: 1,
				},
			}
		).observe({
			changed: (doc: ShowStyleVariant) => {
				for (const map of showStyleBlueprintConfigCache.values()) {
					map.get(doc.showStyleBaseId)?.delete(doc._id)
				}
			},
			removed: (doc: ShowStyleVariant) => {
				for (const map of showStyleBlueprintConfigCache.values()) {
					map.get(doc.showStyleBaseId)?.delete(doc._id)
				}
			},
		})
		Blueprints.find(
			{},
			{
				fields: {
					modified: 1,
				},
			}
		).observeChanges({
			changed: (id: BlueprintId) => {
				studioBlueprintConfigCache.delete(id)
				showStyleBlueprintConfigCache.delete(id)
			},
			removed: (id: BlueprintId) => {
				studioBlueprintConfigCache.delete(id)
				showStyleBlueprintConfigCache.delete(id)
			},
		})
	}
})
