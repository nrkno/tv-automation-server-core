import { Accounts } from 'meteor/accounts-base'
import { UserProfile, UserId } from '../../lib/collections/Users'
import { protectString } from '../lib'
import { DBOrganizationBase } from '../collections/Organization'

export interface NewUserAPI {
	enrollUser(email: string, name: string): Promise<UserId>
	requestPasswordReset(email: string): Promise<boolean>
	removeUser(): Promise<boolean>
}
export enum UserAPIMethods {
	'enrollUser' = 'user.enrollUser',
	'requestPasswordReset' = 'user.requestPasswordReset',
	'removeUser' = 'user.removeUser',
}

interface NewUser {
	email: string
	profile: UserProfile
	password?: string
	createOrganization?: DBOrganizationBase
}
export async function createUser(newUser: NewUser): Promise<UserId> {
	// This is available both client-side and server side.
	// The reason for that is that the client-side should use Accounts.createUser right away
	// so that the password aren't sent in "plaintext" to the server.

	return new Promise((resolve, reject) => {
		const userId = Accounts.createUser(newUser, (error) => {
			if (error) reject(error)
			else resolve(protectString(userId))
		})
	})
}
