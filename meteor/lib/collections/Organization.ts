import { registerCollection, ProtectedString } from '../lib'
import { createMongoCollection } from './lib'
import { UserId } from './Users'

/** A string, identifying a Organization */
export type OrganizationId = ProtectedString<'OrganizationId'>

/** An organization is the entity that owns data (studios, rundowns, etc..) in Sofie */
export interface DBOrganizationBase {
	/** Name of the organization  */
	name: string
	applications: string[]
	broadcastMediums: string[]
}
export interface DBOrganization extends DBOrganizationBase {
	_id: OrganizationId

	userRoles: { [userId: string]: UserRoles }

	notes?: string

	created: number
	modified: number
}
export interface UserAdmin {
	userId: UserId
	// permissions: // add later
}
export interface UserRoles {
	/** Can play out things in a studio */
	studio?: boolean
	/** Can access and modify the settings */
	configurator?: boolean
	/** Can enable developer features including test tools */
	developer?: boolean
	/** Is Organization admin */
	admin?: boolean
}

export type Organization = DBOrganization // to be replaced by a class some time later?

export const Organizations = createMongoCollection<Organization, DBOrganization>('organizations')
registerCollection('Organizations', Organizations)
