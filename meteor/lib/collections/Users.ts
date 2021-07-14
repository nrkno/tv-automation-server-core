import { Meteor } from 'meteor/meteor'
import { registerCollection, ProtectedString, unprotectString } from '../lib'
import { OrganizationId, UserRoles, Organizations, Organization } from './Organization'
import { registerIndex } from '../database'
import { wrapMongoCollection } from './lib'

/** A string, identifying a User */
export type UserId = ProtectedString<'UserId'>

export interface UserProfile {
	name: string
}

export interface DBUser {
	// Note: This interface is partly defined by the dataset from the Meteor.users collection

	_id: UserId
	createdAt: string
	services: {
		password: {
			bcrypt: string
		}
	}
	username: string
	emails: [
		{
			address: string
			verified: boolean
		}
	]
	profile: UserProfile
	organizationId: OrganizationId
	superAdmin?: boolean
}

export type User = DBUser // to be replaced by a class somet ime later?

// This is a somewhat special collection, as it draws from the Meteor.users collection from the Accounts package
export const Users = wrapMongoCollection<DBUser>(Meteor.users as any, 'users')
registerCollection('Users', Users)

registerIndex(Users, {
	organizationId: 1,
})

/** Returns the currently logged in user, or null if not logged in */
export function getUser(): User | null {
	const user = Meteor.user() as any
	return user
}
export function getUserId(): UserId | null {
	return (Meteor.userId() as any) || null
}
export function getUserRoles(user?: User | null, organization?: Organization | null): UserRoles {
	if (user === undefined) user = getUser()
	if (!user) {
		return {}
	}
	if (organization === undefined) organization = Organizations.findOne({ _id: user.organizationId }) || null
	return (organization?.userRoles && organization.userRoles[unprotectString(user._id)]) || {}
}
