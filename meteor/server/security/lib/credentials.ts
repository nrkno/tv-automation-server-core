import { UserId, User, Users, DBUser } from '../../../lib/collections/Users'
import { Organization, Organizations } from '../../../lib/collections/Organization'
import { PeripheralDevice, PeripheralDevices } from '../../../lib/collections/PeripheralDevices'
import { cacheResult, isProtectedString, clearCacheResult } from '../../../lib/lib'
import { LIMIT_CACHE_TIME } from './security'

export interface Credentials {
	userId?: UserId
	token?: string
}
export interface ResolvedCredentials {
	user?: User
	organization?: Organization
	device?: PeripheralDevice
}
export interface ResolvedCredentialsWithUserAndOrganization {
	user: User
	organization: Organization
	device?: PeripheralDevice
}
export function resolveCredentials(cred: Credentials | ResolvedCredentials): ResolvedCredentials {
	if (isResolvedCredentials(cred)) return cred

	return cacheResult(
		credCacheName(cred),
		() => {
			const resolved: ResolvedCredentials = {}

			if (cred.token && typeof cred.token !== 'string') cred.token = undefined
			if (cred.userId && typeof cred.userId !== 'string') cred.userId = undefined

			let user: DBUser | undefined = undefined
			// Lookup user, using userId:
			if (cred.userId && isProtectedString(cred.userId)) {
				user = Users.findOne(cred.userId)
				if (user) resolved.user = user
			}
			// Lookup device, using token
			if (cred.token) {
				const device = PeripheralDevices.findOne({ token: cred.token })
				if (device) {
					resolved.device = device
				}
			}

			// TODO: Implement user-token / API-key
			// Lookup user, using token
			// if (!resolved.user && !resolved.device && cred.token) {
			// 	user = Users.findOne({ token: cred.token})
			// 	if (user) resolved.user = user
			// }

			// Lookup organization, using user
			if (resolved.user && resolved.user.organizationId) {
				const org = Organizations.findOne(resolved.user.organizationId)
				if (org) {
					resolved.organization = org
				}
			}

			return resolved
		},
		LIMIT_CACHE_TIME
	)
}
/** To be called whenever a user is changed */
export function resetCredentials(cred: Credentials): void {
	clearCacheResult(credCacheName(cred))
}
function credCacheName(cred: Credentials) {
	return `resolveCredentials_${cred.userId}_${cred.token}`
}
export function isResolvedCredentials(cred: Credentials | ResolvedCredentials): cred is ResolvedCredentials {
	const c: any = cred
	return !!(c.user || c.organization || c.device)
}
