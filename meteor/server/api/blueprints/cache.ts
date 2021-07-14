import * as _ from 'underscore'
import moment from 'moment'
import { VM } from 'vm2'
import { logger } from '../../logging'
import { Studio } from '../../../lib/collections/Studios'
import { ShowStyleBase } from '../../../lib/collections/ShowStyleBases'
import { Meteor } from 'meteor/meteor'
import { Blueprints, Blueprint, BlueprintId } from '../../../lib/collections/Blueprints'
import {
	BlueprintManifestType,
	SomeBlueprintManifest,
	ShowStyleBlueprintManifest,
	StudioBlueprintManifest,
	SystemBlueprintManifest,
} from '@sofie-automation/blueprints-integration'
import { ICoreSystem } from '../../../lib/collections/CoreSystem'
import { unprotectString } from '../../../lib/lib'
import { ReadonlyDeep } from 'type-fest'

export const BLUEPRINT_CACHE_CONTROL = { disable: false }

export interface WrappedSystemBlueprint {
	blueprintId: BlueprintId
	blueprint: SystemBlueprintManifest
}
export interface WrappedStudioBlueprint {
	blueprintId: BlueprintId
	blueprint: StudioBlueprintManifest
}
export interface WrappedShowStyleBlueprint {
	blueprintId: BlueprintId
	blueprint: ShowStyleBlueprintManifest
}

export async function loadSystemBlueprints(system: ICoreSystem): Promise<WrappedSystemBlueprint | undefined> {
	if (!system.blueprintId) return undefined

	const blueprintManifest = await loadBlueprintById(system.blueprintId)
	if (!blueprintManifest)
		throw new Meteor.Error(404, `Blueprint "${system.blueprintId}" not found! (referenced by CoreSystem)`)

	if (blueprintManifest.blueprintType !== BlueprintManifestType.SYSTEM) {
		throw new Meteor.Error(
			500,
			`Blueprint "${system.blueprintId}" is not valid for a CoreSystem (${blueprintManifest.blueprintType})!`
		)
	}

	return {
		blueprintId: system.blueprintId,
		blueprint: blueprintManifest,
	}
}

export async function loadStudioBlueprint(studio: ReadonlyDeep<Studio>): Promise<WrappedStudioBlueprint | undefined> {
	if (!studio.blueprintId) return undefined

	const blueprintManifest = await loadBlueprintById(studio.blueprintId)
	if (!blueprintManifest) {
		throw new Meteor.Error(
			404,
			`Blueprint "${studio.blueprintId}" not found! (referenced by Studio "${studio._id}")`
		)
	}

	if (blueprintManifest.blueprintType !== BlueprintManifestType.STUDIO) {
		throw new Meteor.Error(
			500,
			`Blueprint "${studio.blueprintId}" is not valid for a Studio "${studio._id}" (${blueprintManifest.blueprintType})!`
		)
	}

	return {
		blueprintId: studio.blueprintId,
		blueprint: blueprintManifest,
	}
}

export async function loadShowStyleBlueprint(
	showStyleBase: ReadonlyDeep<ShowStyleBase>
): Promise<WrappedShowStyleBlueprint> {
	if (!showStyleBase.blueprintId) {
		throw new Meteor.Error(500, `ShowStyleBase "${showStyleBase._id}" has no defined blueprint!`)
	}

	const blueprintManifest = await loadBlueprintById(showStyleBase.blueprintId)
	if (!blueprintManifest) {
		throw new Meteor.Error(
			404,
			`Blueprint "${showStyleBase.blueprintId}" not found! (referenced by ShowStyleBase "${showStyleBase._id}")`
		)
	}

	if (blueprintManifest.blueprintType !== BlueprintManifestType.SHOWSTYLE) {
		throw new Meteor.Error(
			500,
			`Blueprint "${showStyleBase.blueprintId}" is not valid for a ShowStyle "${showStyleBase._id}" (${blueprintManifest.blueprintType})!`
		)
	}

	return {
		blueprintId: showStyleBase.blueprintId,
		blueprint: blueprintManifest,
	}
}

const blueprintDocCache: { [blueprintId: string]: Blueprint } = {}
export async function loadBlueprintById(blueprintId: BlueprintId): Promise<SomeBlueprintManifest | undefined> {
	let blueprint: Blueprint | undefined = blueprintDocCache[unprotectString(blueprintId)]
	if (!blueprint || BLUEPRINT_CACHE_CONTROL.disable) {
		blueprint = await Blueprints.findOneAsync(blueprintId)

		if (blueprint && !BLUEPRINT_CACHE_CONTROL.disable) blueprintDocCache[unprotectString(blueprintId)] = blueprint
	}

	if (!blueprint) return undefined
	if (blueprint.code) {
		let manifest: SomeBlueprintManifest
		try {
			manifest = evalBlueprint(blueprint)
		} catch (e) {
			throw new Meteor.Error(402, 'Syntax error in blueprint "' + blueprint._id + '": ' + e.toString())
		}
		if (manifest.blueprintType !== blueprint.blueprintType) {
			throw new Meteor.Error(
				500,
				`Evaluated Blueprint-manifest and document does not have the same blueprintType ("${manifest.blueprintType}", "${blueprint.blueprintType}")!`
			)
		}
		return manifest
	} else {
		throw new Meteor.Error(500, `Blueprint "${blueprint._id}".code not set!`)
	}
}

const blueprintManifestCache: { [blueprintId: string]: BlueprintManifestCache } = {}
interface BlueprintManifestCache {
	modified: number
	manifest: SomeBlueprintManifest
}
export function evalBlueprint(blueprint: Blueprint): SomeBlueprintManifest {
	let cached: BlueprintManifestCache | null = null
	if (!BLUEPRINT_CACHE_CONTROL.disable) {
		// First, check if we've got the manifest cached:
		cached = blueprintManifestCache[unprotectString(blueprint._id)]
			? blueprintManifestCache[unprotectString(blueprint._id)]
			: null
		if (cached && (!cached.modified || cached.modified !== blueprint.modified)) {
			// the function has been updated, invalidate it then:
			cached = null
		}
	}

	if (cached) {
		return cached.manifest
	} else {
		const vm = new VM({
			sandbox: {
				_,
				moment,
			},
		})

		const entry = vm.run(blueprint.code, `db/blueprint/${blueprint.name || blueprint._id}.js`)
		const manifest: SomeBlueprintManifest = entry.default

		// Wrap the functions, to emit better errors
		_.each(_.keys(manifest), (key) => {
			const value = manifest[key]
			if (_.isFunction(value)) {
				manifest[key] = (...args: any[]) => {
					try {
						return value(...args)
					} catch (e) {
						let msg = `Error in Blueprint "${blueprint._id}".${key}: "${e.toString()}"`
						if (e.stack) msg += '\n' + e.stack
						logger.error(msg)
						throw e
					}
				}
			}
		})

		blueprintManifestCache[unprotectString(blueprint._id)] = {
			manifest,
			modified: blueprint.modified,
		}
		return manifest
	}
}

Meteor.startup(() => {
	if (Meteor.isServer) {
		const triggerBlueprintChanged = (id) => {
			delete blueprintManifestCache[unprotectString(id)]
			delete blueprintDocCache[unprotectString(id)]
		}
		Blueprints.find({}).observeChanges({
			added: (id: BlueprintId) => {
				triggerBlueprintChanged(id)
			},
			changed: (id: BlueprintId) => {
				triggerBlueprintChanged(id)
			},
			removed: (id: BlueprintId) => {
				triggerBlueprintChanged(id)
			},
		})
	}
})
