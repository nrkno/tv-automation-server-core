import { registerCollection, ProtectedString, omit, ProtectedStringProperties, unprotectObject } from '../lib'
import * as _ from 'underscore'
import {
	IBlueprintConfig,
	BlueprintMapping,
	TSR,
	LookaheadMode,
	PackageContainer,
	ExpectedPackage,
} from '@sofie-automation/blueprints-integration'
import { Meteor } from 'meteor/meteor'
import { ObserveChangesForHash, createMongoCollection } from './lib'
import { BlueprintId } from './Blueprints'
import { ShowStyleBaseId } from './ShowStyleBases'
import { OrganizationId } from './Organization'
import { registerIndex } from '../database'
import { ExpectedPackageDB } from './ExpectedPackages'

export interface MappingsExt {
	[layerName: string]: MappingExt
}
export type MappingExt = ProtectedStringProperties<BlueprintMapping, 'deviceId'>

export interface IStudioSettings {
	/** URL to endpoint where media preview are exposed */
	mediaPreviewsUrl: string // (former media_previews_url in config)
	/** URL to Sofie Core endpoint */
	sofieUrl: string // (former sofie_url in config)
	/** URLs for slack webhook to send evaluations */
	slackEvaluationUrls?: string // (former slack_evaluation in config)

	/** Media Resolutions supported by the studio for media playback */
	supportedMediaFormats?: string // (former mediaResolutions in config)
	/** Audio Stream Formats supported by the studio for media playback */
	supportedAudioStreams?: string // (former audioStreams in config)

	/** Should the play from anywhere feature be enabled in this studio */
	enablePlayFromAnywhere?: boolean

	/** If set, forces the "now"-time to be set right away (aka the "multi-playout-gateway" feature).
	 * even for single playout-gateways */
	forceSettingNowTime?: boolean

	/** How much extra delay to add to the Now-time (used for the "multi-playout-gateway" feature) .
	 * A higher value adds delays in playout, but reduces the risk of missed frames. */
	nowSafeLatency?: number
}
/** A string, identifying a Studio */
export type StudioId = ProtectedString<'StudioId'>
export type MappingsHash = ProtectedString<'MappingsHash'>

/** A set of available layer groups in a given installation */
export interface DBStudio {
	_id: StudioId
	/** If set, this studio is owned by that organization */
	organizationId: OrganizationId | null

	/** User-presentable name for the studio installation */
	name: string
	/** Id of the blueprint used by this studio-installation */
	blueprintId?: BlueprintId

	/** Mappings between the physical devices / outputs and logical ones */
	mappings: MappingsExt

	/**
	 * A hash that is to be changed whenever there is a change to the mappings or routeSets
	 * The reason for this to exist is to be able to sync the timeline to what set of mappings it was created (routed) from.
	 */
	mappingsHash?: MappingsHash

	/** List of which ShowStyleBases this studio wants to support */
	supportedShowStyleBase: Array<ShowStyleBaseId>

	/** Config values are used by the Blueprints */
	blueprintConfig: IBlueprintConfig

	settings: IStudioSettings

	_rundownVersionHash: string

	routeSets: Record<string, StudioRouteSet>
	routeSetExclusivityGroups: Record<string, StudioRouteSetExclusivityGroup>

	/** Contains settings for which Package Containers are present in the studio.
	 * (These are used by the Package Manager and the Expected Packages)
	 */
	packageContainers: Record<string, StudioPackageContainer>
	/** Which package containers is used for media previews in GUI */
	previewContainerIds: string[]
	thumbnailContainerIds: string[]
}
export interface StudioPackageContainer {
	/** List of which peripheraldevices uses this packageContainer */
	deviceIds: string[]
	container: PackageContainer
}
export interface StudioRouteSetExclusivityGroup {
	name: string
}

export interface StudioRouteSet {
	/** User-presentable name */
	name: string
	/** Whether this group is active or not */
	active: boolean
	/** Default state of this group */
	defaultActive?: boolean
	/** Only one Route can be active at the same time in the exclusivity-group */
	exclusivityGroup?: string
	/** If true, should be displayed and toggleable by user */
	behavior: StudioRouteBehavior

	routes: RouteMapping[]
}
export enum StudioRouteBehavior {
	HIDDEN = 0,
	TOGGLE = 1,
	ACTIVATE_ONLY = 2,
}
export interface RouteMapping extends ResultingMappingRoute {
	/** Which original layer to route. If false, a "new" layer will be inserted during routing */
	mappedLayer: string | undefined
}
export interface ResultingMappingRoutes {
	/** Routes that route existing layers */
	existing: {
		[mappedLayer: string]: ResultingMappingRoute[]
	}
	/** Routes that create new layers, from nothing */
	inserted: ResultingMappingRoute[]
}
export interface ResultingMappingRoute {
	outputMappedLayer: string
	deviceType?: TSR.DeviceType
	remapping?: Partial<MappingExt>
}

export function getActiveRoutes(studio: Studio): ResultingMappingRoutes {
	const routes: ResultingMappingRoutes = {
		existing: {},
		inserted: [],
	}

	const exclusivityGroups: { [groupId: string]: true } = {}
	_.each(studio.routeSets, (routeSet) => {
		if (routeSet.active) {
			let useRoute: boolean = true
			if (routeSet.exclusivityGroup) {
				// Fail-safe: To really make sure we're not using more than one route in the same exclusivity group:
				if (exclusivityGroups[routeSet.exclusivityGroup]) {
					useRoute = false
				}
				exclusivityGroups[routeSet.exclusivityGroup] = true
			}
			if (useRoute) {
				_.each(routeSet.routes, (routeMapping) => {
					if (routeMapping.outputMappedLayer) {
						if (routeMapping.mappedLayer) {
							// Route an existing layer
							if (!routes.existing[routeMapping.mappedLayer]) {
								routes.existing[routeMapping.mappedLayer] = []
							}
							routes.existing[routeMapping.mappedLayer].push(omit(routeMapping, 'mappedLayer'))
						} else {
							// Insert a new routed layer
							routes.inserted.push(omit(routeMapping, 'mappedLayer'))
						}
					}
				})
			}
		}
	})

	return routes
}
export function getRoutedMappings<M extends MappingExt>(
	inputMappings: { [layerName: string]: M },
	mappingRoutes: ResultingMappingRoutes
): { [layerName: string]: M } {
	const outputMappings: { [layerName: string]: M } = {}

	// Re-route existing layers:
	for (const inputLayer of Object.keys(inputMappings)) {
		const inputMapping: M = inputMappings[inputLayer]

		const routes = mappingRoutes.existing[inputLayer]
		if (routes) {
			for (const route of routes) {
				const routedMapping: M = {
					...inputMapping,
					...(route.remapping || {}),
				}
				outputMappings[route.outputMappedLayer] = routedMapping
			}
		} else {
			// If no route is found at all for a mapping, pass the mapping through un-modified for backwards compatibility.
			outputMappings[inputLayer] = inputMapping
		}
	}
	// also insert new routed layers:
	for (const route of mappingRoutes.inserted) {
		if (route.remapping && route.deviceType && route.remapping.deviceId) {
			const routedMapping: MappingExt = {
				lookahead: route.remapping.lookahead || LookaheadMode.NONE,
				device: route.deviceType,
				deviceId: route.remapping.deviceId,
				...route.remapping,
			}
			outputMappings[route.outputMappedLayer] = routedMapping as M
		}
	}
	return outputMappings
}

export type MappingsExtWithPackage = {
	[layerName: string]: MappingExt & { expectedPackages: (ExpectedPackage.Base & { rundownId?: string })[] }
}
export function routeExpectedPackages(
	studio: Studio,
	expectedPackages: (ExpectedPackageDB | ExpectedPackage.Base)[]
): MappingsExtWithPackage {
	// Map the expectedPackages onto their specified layer:
	const mappingsWithPackages: MappingsExtWithPackage = {}
	for (const expectedPackage of expectedPackages) {
		for (const layerName of expectedPackage.layers) {
			const mapping = studio.mappings[layerName]

			if (mapping) {
				if (!mappingsWithPackages[layerName]) {
					mappingsWithPackages[layerName] = {
						...mapping,
						expectedPackages: [],
					}
				}
				mappingsWithPackages[layerName].expectedPackages.push(unprotectObject(expectedPackage))
			}
		}
	}

	// Route the mappings
	const routes = getActiveRoutes(studio)
	return getRoutedMappings(mappingsWithPackages, routes)
}

export type Studio = DBStudio
export const Studios = createMongoCollection<Studio, DBStudio>('studios')
registerCollection('Studios', Studios)

registerIndex(Studios, {
	organizationId: 1,
})

Meteor.startup(() => {
	if (Meteor.isServer) {
		ObserveChangesForHash(Studios, '_rundownVersionHash', ['blueprintConfig'])
	}
})
