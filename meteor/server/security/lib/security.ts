import * as _ from 'underscore'
import { MongoQueryKey } from '../../../lib/typings/meteor'
import { Settings } from '../../../lib/Settings'
import { resolveCredentials, ResolvedCredentials, Credentials, isResolvedCredentials } from './credentials'
import { allAccess, noAccess, combineAccess, Access } from './access'
import { RundownPlaylist, RundownPlaylistId, RundownPlaylists } from '../../../lib/collections/RundownPlaylists'
import { RundownId, Rundowns, Rundown } from '../../../lib/collections/Rundowns'
import { Studio, StudioId, Studios } from '../../../lib/collections/Studios'
import { isProtectedString } from '../../../lib/lib'
import { OrganizationId, Organizations, Organization } from '../../../lib/collections/Organization'
import { PeripheralDevices, PeripheralDevice, PeripheralDeviceId } from '../../../lib/collections/PeripheralDevices'
import { UserId } from '../../../lib/collections/Users'
import { ShowStyleBaseId, ShowStyleBases, ShowStyleBase } from '../../../lib/collections/ShowStyleBases'
import { ShowStyleVariantId, ShowStyleVariants, ShowStyleVariant } from '../../../lib/collections/ShowStyleVariants'
import { profiler } from '../../api/profiler'

export const LIMIT_CACHE_TIME = 1000 * 60 * 15 // 15 minutes

// TODO: add caching
export function allowAccessToAnything(): Access<null> {
	if (!Settings.enableUserAccounts) return allAccess(null, 'No security')
	else return noAccess('Security is enabled')
}

export function allowAccessToCoreSystem(cred0: Credentials | ResolvedCredentials): Access<null> {
	if (!Settings.enableUserAccounts) return allAccess(null, 'No security')

	const cred = resolveCredentials(cred0)

	return {
		...AccessRules.accessCoreSystem(cred),
		insert: false, // only allowed through methods
		remove: false, // only allowed through methods
	}
}
export function allowAccessToCurrentUser(cred0: Credentials | ResolvedCredentials, userId: UserId): Access<null> {
	if (!Settings.enableUserAccounts) return allAccess(null, 'No security')
	if (!userId) return noAccess('userId missing')
	if (!isProtectedString(userId)) return noAccess('userId is not a string')

	return {
		...AccessRules.accessCurrentUser(cred0, userId),
		insert: false, // only allowed through methods
		update: false, // only allowed through methods
		remove: false, // only allowed through methods
	}
}
export function allowAccessToSystemStatus(cred0: Credentials | ResolvedCredentials): Access<null> {
	if (!Settings.enableUserAccounts) return allAccess(null, 'No security')

	return {
		...AccessRules.accessSystemStatus(cred0),
		insert: false, // only allowed through methods
		update: false, // only allowed through methods
		remove: false, // only allowed through methods
	}
}

export function allowAccessToOrganization(
	cred0: Credentials | ResolvedCredentials,
	organizationId: MongoQueryKey<OrganizationId | null>
): Access<Organization | null> {
	if (!Settings.enableUserAccounts) return allAccess(null, 'No security')
	if (!organizationId) return noAccess('organizationId not set')
	if (!isProtectedString(organizationId)) return noAccess('organizationId is not a string')
	const cred = resolveCredentials(cred0)

	const organization = Organizations.findOne(organizationId)
	if (!organization) return noAccess('Organization not found')

	return {
		...AccessRules.accessOrganization(organization, cred),
		insert: false, // only allowed through methods
		remove: false, // only allowed through methods
	}
}
export function allowAccessToShowStyleBase(
	cred0: Credentials | ResolvedCredentials,
	showStyleBaseId: MongoQueryKey<ShowStyleBaseId>
): Access<ShowStyleBase | null> {
	if (!Settings.enableUserAccounts) return allAccess(null, 'No security')
	if (!showStyleBaseId) return noAccess('showStyleBaseId not set')
	const cred = resolveCredentials(cred0)

	const showStyleBases = ShowStyleBases.find({
		_id: showStyleBaseId,
	}).fetch()
	let access: Access<ShowStyleBase | null> = allAccess(null)
	for (const showStyleBase of showStyleBases) {
		access = combineAccess(access, AccessRules.accessShowStyleBase(showStyleBase, cred))
	}
	return {
		...access,
		insert: false, // only allowed through methods
		remove: false, // only allowed through methods
	}
}
export function allowAccessToShowStyleVariant(
	cred0: Credentials | ResolvedCredentials,
	showStyleVariantId: MongoQueryKey<ShowStyleVariantId>
): Access<ShowStyleVariant | null> {
	if (!Settings.enableUserAccounts) return allAccess(null, 'No security')
	if (!showStyleVariantId) return noAccess('showStyleVariantId not set')
	const cred = resolveCredentials(cred0)

	const showStyleVariants = ShowStyleVariants.find({
		_id: showStyleVariantId,
	}).fetch()
	const showStyleBaseIds = _.uniq(_.map(showStyleVariants, (v) => v.showStyleBaseId))
	const showStyleBases = ShowStyleBases.find({
		_id: { $in: showStyleBaseIds },
	}).fetch()
	let access: Access<ShowStyleBase | null> = allAccess(null)
	for (const showStyleBase of showStyleBases) {
		access = combineAccess(access, AccessRules.accessShowStyleBase(showStyleBase, cred))
	}
	return { ...access, document: _.last(showStyleVariants) || null }
}
export function allowAccessToStudio(
	cred0: Credentials | ResolvedCredentials,
	studioId: MongoQueryKey<StudioId>
): Access<Studio | null> {
	if (!Settings.enableUserAccounts) return allAccess(null, 'No security')
	if (!studioId) return noAccess('studioId not set')
	if (!isProtectedString(studioId)) return noAccess('studioId is not a string')
	const cred = resolveCredentials(cred0)

	const studio = Studios.findOne(studioId)
	if (!studio) return noAccess('Studio not found')

	return {
		...AccessRules.accessStudio(studio, cred),
		insert: false, // only allowed through methods
		remove: false, // only allowed through methods
	}
}
export function allowAccessToRundownPlaylist(
	cred0: Credentials | ResolvedCredentials,
	playlistId: MongoQueryKey<RundownPlaylistId>
): Access<RundownPlaylist | null> {
	if (!Settings.enableUserAccounts) return allAccess(null, 'No security')
	if (!playlistId) return noAccess('playlistId not set')
	const cred = resolveCredentials(cred0)

	const playlists = RundownPlaylists.find({
		_id: playlistId,
	}).fetch()
	let access: Access<RundownPlaylist | null> = allAccess(null)
	for (const playlist of playlists) {
		access = combineAccess(access, AccessRules.accessRundownPlaylist(playlist, cred))
	}
	return access
}
export function allowAccessToRundown(
	cred0: Credentials | ResolvedCredentials,
	rundownId: MongoQueryKey<RundownId>
): Access<Rundown | null> {
	const access = allowAccessToRundownContent(cred0, rundownId)
	return {
		...access,
		insert: false, // only allowed through methods
		update: false, // only allowed through methods
		remove: false, // only allowed through methods
	}
}
export function allowAccessToRundownContent(
	cred0: Credentials | ResolvedCredentials,
	rundownId: MongoQueryKey<RundownId>
): Access<Rundown | null> {
	if (!Settings.enableUserAccounts) return allAccess(null, 'No security')
	if (!rundownId) return noAccess('rundownId missing')
	const cred = resolveCredentials(cred0)

	const rundowns = Rundowns.find({
		_id: rundownId,
	}).fetch()
	let access: Access<Rundown | null> = allAccess(null)
	for (const rundown of rundowns) {
		access = combineAccess(access, AccessRules.accessRundown(rundown, cred))
	}
	return access
}
export function allowAccessToPeripheralDevice(
	cred0: Credentials | ResolvedCredentials,
	deviceId: MongoQueryKey<PeripheralDeviceId>
): Access<PeripheralDevice | null> {
	const access = allowAccessToPeripheralDeviceContent(cred0, deviceId)
	return {
		...access,
		insert: false, // only allowed through methods
		remove: false, // only allowed through methods
	}
}

export function allowAccessToPeripheralDeviceContent(
	cred0: Credentials | ResolvedCredentials,
	deviceId: MongoQueryKey<PeripheralDeviceId>
): Access<PeripheralDevice | null> {
	const span = profiler.startSpan('security.lib.security.allowAccessToPeripheralDeviceContent')
	if (!Settings.enableUserAccounts) return allAccess(null, 'No security')
	if (!deviceId) return noAccess('deviceId missing')
	if (!isProtectedString(deviceId)) return noAccess('deviceId is not a string')
	const cred = resolveCredentials(cred0)

	const device = PeripheralDevices.findOne(deviceId)
	if (!device) return noAccess('Device not found')

	const access = AccessRules.accessPeripheralDevice(device, cred)

	span?.end()
	return access
}

namespace AccessRules {
	export function accessCoreSystem(cred: ResolvedCredentials): Access<null> {
		if (cred.user && cred.user.superAdmin) {
			return allAccess(null)
		} else {
			return {
				...noAccess('User is not superAdmin'),
				read: true,
			}
		}
	}
	export function accessCurrentUser(cred0: Credentials | ResolvedCredentials, _userId: UserId): Access<null> {
		let userId2: UserId | undefined = undefined
		if (isResolvedCredentials(cred0) && cred0.user) {
			userId2 = cred0.user._id
		} else if (!isResolvedCredentials(cred0) && cred0.userId) {
			userId2 = cred0.userId
		} else {
			const cred = resolveCredentials(cred0)
			if (!cred.user) return noAccess('User in cred not found')
			userId2 = cred.user._id
		}
		if (userId2) {
			if (userId2 === userId2) {
				// TODO: user role access
				return allAccess(null)
			} else return noAccess('Not accessing current user')
		} else return noAccess('Requested user not found')
	}

	export function accessSystemStatus(_cred0: Credentials | ResolvedCredentials): Access<null> {
		// No restrictions on systemStatus
		return allAccess(null)
	}
	// export function accessUser (cred: ResolvedCredentials, user: User): Access<User> {
	// 	if (!cred.organization) return noAccess('No organization in credentials')
	// 	if (user.organizationId === cred.organization._id) {
	// 		// TODO: user role access
	// 		return allAccess()
	// 	} else return noAccess('User is not in the same organization as requested user')
	// }
	export function accessOrganization(organization: Organization, cred: ResolvedCredentials): Access<Organization> {
		if (!cred.organization) return noAccess('No organization in credentials')
		if (organization._id === cred.organization._id) {
			// TODO: user role access
			return allAccess(organization)
		} else return noAccess(`User is not in the organization "${organization._id}"`)
	}
	export function accessShowStyleBase(
		showStyleBase: ShowStyleBase,
		cred: ResolvedCredentials
	): Access<ShowStyleBase> {
		if (!showStyleBase.organizationId) return noAccess('ShowStyleBase has no organization')
		if (!cred.organization) return noAccess('No organization in credentials')
		if (showStyleBase.organizationId === cred.organization._id) {
			// TODO: user role access
			return allAccess(showStyleBase)
		} else return noAccess(`User is not in the same organization as the showStyleBase "${showStyleBase._id}"`)
	}
	export function accessStudio(studio: Studio, cred: ResolvedCredentials): Access<Studio> {
		if (!studio.organizationId) return noAccess('Studio has no organization')
		if (!cred.organization) return noAccess('No organization in credentials')
		if (studio.organizationId === cred.organization._id) {
			// TODO: user role access
			return allAccess(studio)
		} else return noAccess(`User is not in the same organization as the studio ${studio._id}`)
	}
	export function accessRundownPlaylist(
		playlist: RundownPlaylist,
		cred: ResolvedCredentials
	): Access<RundownPlaylist> {
		const studio = playlist.getStudio()
		if (!studio) return noAccess(`Studio of playlist "${playlist._id}" not found`)
		return { ...accessStudio(studio, cred), document: playlist }
	}
	export function accessRundown(rundown: Rundown, cred: ResolvedCredentials): Access<Rundown> {
		const playlist = rundown.getRundownPlaylist()
		if (!playlist) return noAccess(`Rundown playlist of rundown "${rundown._id}" not found`)
		return { ...accessRundownPlaylist(playlist, cred), document: rundown }
	}
	export function accessPeripheralDevice(
		device: PeripheralDevice,
		cred: ResolvedCredentials
	): Access<PeripheralDevice> {
		if (!cred.organization) return noAccess('No organization in credentials')
		if (!device.organizationId) return noAccess('Device has no organizationId')
		if (device.organizationId === cred.organization._id) {
			return allAccess(device)
		} else return noAccess(`Device "${device._id}" is not in the same organization as user`)
	}
}
