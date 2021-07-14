import { Meteor } from 'meteor/meteor'
import { check } from '../../lib/check'
import { meteorPublish, AutoFillSelector } from './lib'
import { PubSub } from '../../lib/api/pubsub'
import { PeripheralDeviceReadAccess } from '../security/peripheralDevice'
import { PeripheralDevices, PeripheralDeviceId, PeripheralDevice } from '../../lib/collections/PeripheralDevices'
import { PeripheralDeviceCommands } from '../../lib/collections/PeripheralDeviceCommands'
import { MediaWorkFlowSteps } from '../../lib/collections/MediaWorkFlowSteps'
import { MediaWorkFlows } from '../../lib/collections/MediaWorkFlows'
import { OrganizationReadAccess } from '../security/organization'
import { StudioReadAccess } from '../security/studio'
import { FindOptions } from '../../lib/typings/meteor'
import { Credentials, ResolvedCredentials } from '../security/lib/credentials'
import { NoSecurityReadAccess } from '../security/noSecurity'
import { meteorCustomPublishArray } from '../lib/customPublication'
import { MappingsExtWithPackage, routeExpectedPackages, Studio, StudioId, Studios } from '../../lib/collections/Studios'
import { setUpOptimizedObserver } from '../lib/optimizedObserver'
import {
	ExpectedPackageDB,
	ExpectedPackages,
	getPreviewPackageSettings,
	getThumbnailPackageSettings,
} from '../../lib/collections/ExpectedPackages'
import _ from 'underscore'
import {
	ExpectedPackage,
	PackageContainer,
	Accessor,
	PackageContainerOnPackage,
	AccessorOnPackage,
} from '@sofie-automation/blueprints-integration'
import { DBRundownPlaylist, RundownPlaylists } from '../../lib/collections/RundownPlaylists'
import { DBRundown, Rundowns } from '../../lib/collections/Rundowns'
import { clone, DBObj, literal, omit, protectString, unprotectObject, unprotectString } from '../../lib/lib'
import deepExtend from 'deep-extend'
import { logger } from '../logging'
import { generateExpectedPackagesForPartInstance } from '../api/ingest/expectedPackages'
import { PartInstance } from '../../lib/collections/PartInstances'
/*
 * This file contains publications for the peripheralDevices, such as playout-gateway, mos-gateway and package-manager
 */

function checkAccess(cred: Credentials | ResolvedCredentials, selector) {
	if (!selector) throw new Meteor.Error(400, 'selector argument missing')
	return (
		NoSecurityReadAccess.any() ||
		(selector._id && PeripheralDeviceReadAccess.peripheralDevice(selector, cred)) ||
		(selector.organizationId && OrganizationReadAccess.organizationContent(selector, cred)) ||
		(selector.studioId && StudioReadAccess.studioContent(selector, cred))
	)
}
meteorPublish(PubSub.peripheralDevices, function (selector0, token) {
	const { cred, selector } = AutoFillSelector.organizationId(this.userId, selector0, token)
	if (checkAccess(cred, selector)) {
		const modifier: FindOptions<PeripheralDevice> = {
			fields: {
				token: 0,
				secretSettings: 0,
			},
		}
		if (selector._id && token && modifier.fields) {
			// in this case, send the secretSettings:
			delete modifier.fields.secretSettings
		}
		return PeripheralDevices.find(selector, modifier)
	}
	return null
})

meteorPublish(PubSub.peripheralDevicesAndSubDevices, function (selector0, token) {
	const { cred, selector } = AutoFillSelector.organizationId(this.userId, selector0, token)
	if (checkAccess(cred, selector)) {
		const parents = PeripheralDevices.find(selector).fetch()

		const modifier: FindOptions<PeripheralDevice> = {
			fields: {
				token: 0,
				secretSettings: 0,
			},
		}

		const cursor = PeripheralDevices.find(
			{
				$or: [
					{
						parentDeviceId: { $in: parents.map((i) => i._id) },
					},
					selector,
				],
			},
			modifier
		)

		return cursor
	}
	return null
})
meteorPublish(PubSub.peripheralDeviceCommands, function (deviceId: PeripheralDeviceId, token) {
	if (!deviceId) throw new Meteor.Error(400, 'deviceId argument missing')
	check(deviceId, String)
	if (PeripheralDeviceReadAccess.peripheralDeviceContent({ deviceId: deviceId }, { userId: this.userId, token })) {
		return PeripheralDeviceCommands.find({ deviceId: deviceId })
	}
	return null
})
meteorPublish(PubSub.mediaWorkFlows, function (selector0, token) {
	const { cred, selector } = AutoFillSelector.deviceId(this.userId, selector0, token)
	if (PeripheralDeviceReadAccess.peripheralDeviceContent(selector, cred)) {
		return MediaWorkFlows.find(selector)
	}
	return null
})
meteorPublish(PubSub.mediaWorkFlowSteps, function (selector0, token) {
	const { cred, selector } = AutoFillSelector.deviceId(this.userId, selector0, token)
	if (PeripheralDeviceReadAccess.peripheralDeviceContent(selector, cred)) {
		return MediaWorkFlowSteps.find(selector)
	}
	return null
})

meteorCustomPublishArray(
	PubSub.expectedPackagesForDevice,
	'deviceExpectedPackages',
	function (
		pub,
		deviceId: PeripheralDeviceId,
		filterPlayoutDeviceIds: PeripheralDeviceId[] | undefined,
		token: string
	) {
		logger.info(`Pub.expectedPackagesForDevice: publication`)
		if (
			PeripheralDeviceReadAccess.peripheralDeviceContent({ deviceId: deviceId }, { userId: this.userId, token })
		) {
			const peripheralDevice = PeripheralDevices.findOne(deviceId)

			if (!peripheralDevice) throw new Meteor.Error('PeripheralDevice "' + deviceId + '" not found')

			const studioId = peripheralDevice.studioId
			if (!studioId) {
				logger.warn(`Pub.expectedPackagesForDevice: device "${peripheralDevice._id}" has no studioId`)
				return this.ready()
			}

			const observer = setUpOptimizedObserver(
				`pub_${PubSub.expectedPackagesForDevice}_${studioId}`,
				(triggerUpdate) => {
					// Set up observers:
					return [
						Studios.find(studioId, {
							fields: {
								mappingsHash: 1, // is changed when routes are changed
								packageContainers: 1,
							},
						}).observe({
							added: () => triggerUpdate({ studioId: studioId, invalidateStudio: true }),
							changed: () => triggerUpdate({ studioId: studioId, invalidateStudio: true }),
							removed: () => triggerUpdate({ studioId: null, invalidateStudio: true }),
						}),
						PeripheralDevices.find(
							{ studioId: studioId },
							{
								fields: {
									// Only monitor settings
									settings: 1,
								},
							}
						).observe({
							added: () => triggerUpdate({ invalidatePeripheralDevices: true }),
							changed: () => triggerUpdate({ invalidatePeripheralDevices: true }),
							removed: () => triggerUpdate({ invalidatePeripheralDevices: true }),
						}),
						ExpectedPackages.find({
							studioId: studioId,
						}).observe({
							added: () => triggerUpdate({ invalidateExpectedPackages: true }),
							changed: () => triggerUpdate({ invalidateExpectedPackages: true }),
							removed: () => triggerUpdate({ invalidateExpectedPackages: true }),
						}),
						RundownPlaylists.find(
							{
								studioId: studioId,
							},
							{
								fields: {
									// It should be enough to watch these fields for changes
									_id: 1,
									activationId: 1,
									rehearsal: 1,
									currentPartInstanceId: 1, // So that it invalidates when the current changes
									nextPartInstanceId: 1, // So that it invalidates when the next changes
								},
							}
						).observe({
							added: () => triggerUpdate({ invalidateRundownPlaylist: true }),
							changed: () => triggerUpdate({ invalidateRundownPlaylist: true }),
							removed: () => triggerUpdate({ invalidateRundownPlaylist: true }),
						}),
					]
				},
				() => {
					// Initialize data
					return {
						studioId: studioId,
						deviceId: deviceId,

						// All invalidate flags should be true, so that they run on first run:
						invalidateStudio: true,
						invalidatePeripheralDevices: true,
						invalidateExpectedPackages: true,
						invalidateRundownPlaylist: true,

						studio: undefined,
						expectedPackages: [],
						routedExpectedPackages: [],
						routedPlayoutExpectedPackages: [],
						activePlaylist: undefined,
						activeRundowns: [],
						currentPartInstance: undefined,
						nextPartInstance: undefined,
					}
				},
				(context: {
					// Input data:
					studioId: StudioId | undefined
					deviceId: PeripheralDeviceId

					// Data invalidation flags:
					invalidateStudio: boolean
					invalidatePeripheralDevices: boolean
					invalidateExpectedPackages: boolean
					invalidateRundownPlaylist: boolean

					// cache:
					studio: Studio | undefined
					expectedPackages: ExpectedPackageDB[]
					routedExpectedPackages: ResultingExpectedPackage[]
					/** ExpectedPackages relevant for playout */
					routedPlayoutExpectedPackages: ResultingExpectedPackage[]
					activePlaylist: DBRundownPlaylist | undefined
					activeRundowns: DBRundown[]
					currentPartInstance: PartInstance | undefined
					nextPartInstance: PartInstance | undefined
				}) => {
					// Prepare data for publication:

					let invalidateRoutedExpectedPackages = false
					let invalidateRoutedPlayoutExpectedPackages = false

					if (context.invalidateStudio) {
						context.invalidateStudio = false
						invalidateRoutedExpectedPackages = true
						context.studio = Studios.findOne(context.studioId)
						if (!context.studio) {
							logger.warn(`Pub.expectedPackagesForDevice: studio "${context.studioId}" not found!`)
						}
					}
					if (!context.studio) {
						return []
					}

					if (context.invalidatePeripheralDevices) {
						context.invalidatePeripheralDevices = false
						invalidateRoutedExpectedPackages = true
						invalidateRoutedPlayoutExpectedPackages = true
					}
					if (context.invalidateExpectedPackages) {
						context.invalidateExpectedPackages = false
						invalidateRoutedExpectedPackages = true
						invalidateRoutedPlayoutExpectedPackages = true

						context.expectedPackages = ExpectedPackages.find({
							studioId: studioId,
						}).fetch()
						if (!context.expectedPackages.length) {
							logger.info(
								`Pub.expectedPackagesForDevice: no ExpectedPackages for studio "${context.studioId}" found`
							)
						}
					}
					if (context.invalidateRundownPlaylist) {
						context.invalidateRundownPlaylist = false
						const activePlaylist = RundownPlaylists.findOne({
							studioId: studioId,
							activationId: { $exists: true },
						})
						context.activePlaylist = activePlaylist
						context.activeRundowns = context.activePlaylist
							? Rundowns.find({
									playlistId: context.activePlaylist._id,
							  }).fetch()
							: []

						const selectPartInstances = activePlaylist?.getSelectedPartInstances()
						context.nextPartInstance = selectPartInstances?.nextPartInstance
						context.currentPartInstance = selectPartInstances?.currentPartInstance

						invalidateRoutedPlayoutExpectedPackages = true
					}

					const studio: Studio = context.studio

					if (invalidateRoutedExpectedPackages) {
						// Map the expectedPackages onto their specified layer:
						const routedMappingsWithPackages = routeExpectedPackages(studio, context.expectedPackages)

						if (context.expectedPackages.length && !Object.keys(routedMappingsWithPackages).length) {
							logger.info(`Pub.expectedPackagesForDevice: routedMappingsWithPackages is empty`)
						}

						context.routedExpectedPackages = generateExpectedPackages(
							context.studio,
							filterPlayoutDeviceIds,
							routedMappingsWithPackages,
							Priorities.OTHER // low priority
						)
					}
					if (invalidateRoutedPlayoutExpectedPackages) {
						// Use the expectedPackages of the Current and Next Parts:
						const playoutNextExpectedPackages: ExpectedPackageDB[] = context.nextPartInstance
							? generateExpectedPackagesForPartInstance(
									context.studio,
									context.nextPartInstance.rundownId,
									context.nextPartInstance
							  )
							: []

						const playoutCurrentExpectedPackages: ExpectedPackageDB[] = context.currentPartInstance
							? generateExpectedPackagesForPartInstance(
									context.studio,
									context.currentPartInstance.rundownId,
									context.currentPartInstance
							  )
							: []

						// Map the expectedPackages onto their specified layer:
						const currentRoutedMappingsWithPackages = routeExpectedPackages(
							studio,
							playoutCurrentExpectedPackages
						)
						const nextRoutedMappingsWithPackages = routeExpectedPackages(
							studio,
							playoutNextExpectedPackages
						)

						if (
							context.currentPartInstance &&
							!Object.keys(currentRoutedMappingsWithPackages).length &&
							!Object.keys(nextRoutedMappingsWithPackages).length
						) {
							logger.debug(
								`Pub.expectedPackagesForDevice: Both currentRoutedMappingsWithPackages and nextRoutedMappingsWithPackages are empty`
							)
						}

						// Filter, keep only the routed mappings for this device:
						context.routedPlayoutExpectedPackages = [
							...generateExpectedPackages(
								context.studio,
								filterPlayoutDeviceIds,
								currentRoutedMappingsWithPackages,
								Priorities.PLAYOUT_CURRENT
							),
							...generateExpectedPackages(
								context.studio,
								filterPlayoutDeviceIds,
								nextRoutedMappingsWithPackages,
								Priorities.PLAYOUT_NEXT
							),
						]
					}

					const packageContainers: { [containerId: string]: PackageContainer } = {}
					for (const [containerId, studioPackageContainer] of Object.entries(studio.packageContainers)) {
						packageContainers[containerId] = studioPackageContainer.container
					}

					const pubData = literal<DBObj[]>([
						{
							_id: protectString(`${deviceId}_expectedPackages`),
							type: 'expected_packages',
							studioId: studioId,
							expectedPackages: context.routedExpectedPackages,
						},
						{
							_id: protectString(`${deviceId}_playoutExpectedPackages`),
							type: 'expected_packages',
							studioId: studioId,
							expectedPackages: context.routedPlayoutExpectedPackages,
						},
						{
							_id: protectString(`${deviceId}_packageContainers`),
							type: 'package_containers',
							studioId: studioId,
							packageContainers: packageContainers,
						},
						{
							_id: protectString(`${deviceId}_rundownPlaylist`),
							type: 'active_playlist',
							studioId: studioId,
							activeplaylist: context.activePlaylist
								? {
										_id: context.activePlaylist._id,
										active: !!context.activePlaylist.activationId,
										rehearsal: context.activePlaylist.rehearsal,
								  }
								: undefined,
							activeRundowns: context.activeRundowns.map((rundown) => {
								return {
									_id: rundown._id,
									_rank: rundown._rank,
								}
							}),
						},
					])
					return pubData
				},
				(newData) => {
					pub.updatedDocs(newData)
				},
				500 // ms, wait this time before sending an update
			)
			pub.onStop(() => {
				observer.stop()
			})
		} else {
			logger.warn(`Pub.expectedPackagesForDevice: Not allowed: "${deviceId}"`)
		}
	}
)

interface ResultingExpectedPackage {
	expectedPackage: ExpectedPackage.Base & { rundownId?: string }
	/** Lower should be done first */
	priority: number
	sources: PackageContainerOnPackage[]
	targets: PackageContainerOnPackage[]
	playoutDeviceId: PeripheralDeviceId
}

enum Priorities {
	// Lower priorities are done first

	/** Highest priority */
	PLAYOUT_CURRENT = 0,
	/** Second-to-highest priority */
	PLAYOUT_NEXT = 1,
	OTHER = 9,
}

function generateExpectedPackages(
	studio: Studio,
	filterPlayoutDeviceIds: PeripheralDeviceId[] | undefined,
	routedMappingsWithPackages: MappingsExtWithPackage,
	priority: Priorities
) {
	const routedExpectedPackages: ResultingExpectedPackage[] = []

	for (const layerName of Object.keys(routedMappingsWithPackages)) {
		const mapping = routedMappingsWithPackages[layerName]

		// Filter, keep only the routed mappings for this device:
		if (!filterPlayoutDeviceIds || filterPlayoutDeviceIds.includes(mapping.deviceId)) {
			for (const expectedPackage of mapping.expectedPackages) {
				// Lookup Package sources:
				const combinedSources: PackageContainerOnPackage[] = []

				for (const packageSource of expectedPackage.sources) {
					const lookedUpSource = studio.packageContainers[packageSource.containerId]
					if (lookedUpSource) {
						// We're going to combine the accessor attributes set on the Package with the ones defined on the source
						const combinedSource: PackageContainerOnPackage = {
							...omit(clone(lookedUpSource.container), 'accessors'),
							accessors: {},
							containerId: packageSource.containerId,
						}

						/** Array of both the accessors of the expected package and the source */
						const accessorIds = _.uniq(
							Object.keys(lookedUpSource.container.accessors).concat(
								Object.keys(packageSource.accessors || {})
							)
						)

						for (const accessorId of accessorIds) {
							const sourceAccessor: Accessor.Any | undefined =
								lookedUpSource.container.accessors[accessorId]

							const packageAccessor: AccessorOnPackage.Any | undefined =
								packageSource.accessors?.[accessorId]

							if (packageAccessor && sourceAccessor && packageAccessor.type === sourceAccessor.type) {
								combinedSource.accessors[accessorId] = deepExtend({}, sourceAccessor, packageAccessor)
							} else if (packageAccessor) {
								combinedSource.accessors[accessorId] = clone<AccessorOnPackage.Any>(packageAccessor)
							} else if (sourceAccessor) {
								combinedSource.accessors[accessorId] = clone<Accessor.Any>(
									sourceAccessor
								) as AccessorOnPackage.Any
							}
						}
						combinedSources.push(combinedSource)
					} else {
						logger.warn(
							`Pub.expectedPackagesForDevice: Source package container "${packageSource.containerId}" not found`
						)
					}
				}

				// Lookup Package targets:

				const mappingDeviceId = unprotectString(mapping.deviceId)

				let packageContainerId: string | undefined
				for (const [containerId, packageContainer] of Object.entries(studio.packageContainers)) {
					if (packageContainer.deviceIds.includes(mappingDeviceId)) {
						// TODO: how to handle if a device has multiple containers?
						packageContainerId = containerId
						break // just picking the first one found, for now
					}
				}
				if (!packageContainerId) {
					logger.warn(`Pub.expectedPackagesForDevice: No package container found for "${mappingDeviceId}"`)
				}

				const combinedTargets: PackageContainerOnPackage[] = []
				if (packageContainerId) {
					const lookedUpTarget = studio.packageContainers[packageContainerId]
					if (lookedUpTarget) {
						// Todo: should the be any combination of properties here?
						combinedTargets.push({
							...omit(clone(lookedUpTarget.container), 'accessors'),
							accessors:
								(lookedUpTarget.container.accessors as {
									[accessorId: string]: AccessorOnPackage.Any
								}) || {},
							containerId: packageContainerId,
						})
					}
				}

				if (combinedSources.length) {
					if (combinedTargets.length) {
						expectedPackage.sideEffect = deepExtend(
							{},
							literal<ExpectedPackage.Base['sideEffect']>({
								previewContainerId: studio.previewContainerIds[0], // just pick the first. Todo: something else?
								thumbnailContainerId: studio.thumbnailContainerIds[0], // just pick the first. Todo: something else?
								previewPackageSettings: getPreviewPackageSettings(
									expectedPackage as ExpectedPackage.Any
								),
								thumbnailPackageSettings: getThumbnailPackageSettings(
									expectedPackage as ExpectedPackage.Any
								),
							}),
							expectedPackage.sideEffect
						)

						routedExpectedPackages.push({
							expectedPackage: unprotectObject(expectedPackage),
							sources: combinedSources,
							targets: combinedTargets,
							priority: priority,
							playoutDeviceId: mapping.deviceId,
						})
					} else {
						logger.warn(`Pub.expectedPackagesForDevice: No targets found for "${expectedPackage._id}"`)
					}
				} else {
					logger.warn(`Pub.expectedPackagesForDevice: No sources found for "${expectedPackage._id}"`)
				}
			}
		}
	}
	return routedExpectedPackages
}
