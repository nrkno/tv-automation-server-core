import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'
import { Accounts } from 'meteor/accounts-base'
import { makePromise, unprotectString, waitForPromise, protectString, waitTime } from '../../lib/lib'
import { MethodContextAPI, MethodContext } from '../../lib/api/methods'
import { NewUserAPI, UserAPIMethods, createUser } from '../../lib/api/user'
import { registerClassToMeteorMethods } from '../methods'
import { SystemWriteAccess } from '../security/system'
import { triggerWriteAccess, triggerWriteAccessBecauseNoCheckNecessary } from '../security/lib/securityVerify'
import { logNotAllowed } from '../../server/security/lib/lib'
import { User, UserId, Users } from '../../lib/collections/Users'
import { createOrganization } from './organizations'
import { DBOrganizationBase, Organizations, OrganizationId } from '../../lib/collections/Organization'
import { resetCredentials } from '../security/lib/credentials'

export function enrollUser(email: string, name: string): UserId {
	triggerWriteAccessBecauseNoCheckNecessary()

	const id = waitForPromise(
		createUser({
			email: email,
			profile: { name: name },
		})
	)
	try {
		Accounts.sendEnrollmentEmail(unprotectString(id), email)
	} catch (error) {
		console.error('ERROR sending email enrollment', error)
	}

	return id
}

function afterCreateNewUser(userId: UserId, organization: DBOrganizationBase): OrganizationId {
	triggerWriteAccessBecauseNoCheckNecessary()

	sendVerificationEmail(userId)

	// Create an organization for the user:
	const orgId = createOrganization(organization)
	// Add user to organization:
	Users.update(userId, { $set: { organizationId: orgId } })
	Organizations.update(orgId, {
		$set: {
			userRoles: {
				[unprotectString(userId)]: {
					admin: true,
					studio: true,
					configurator: true,
				},
			},
		},
	})

	resetCredentials({ userId })

	return orgId
}
function sendVerificationEmail(userId: UserId) {
	const user = Users.findOne(userId)
	if (!user) throw new Meteor.Error(404, `User "${userId}" not found!`)
	try {
		_.each(user.emails, (email) => {
			if (!email.verified) {
				Accounts.sendVerificationEmail(unprotectString(user._id), email.address)
			}
		})
	} catch (error) {
		console.error('ERROR sending email verification', error)
	}
}

export function requestResetPassword(email: string): boolean {
	triggerWriteAccessBecauseNoCheckNecessary()
	const meteorUser = Accounts.findUserByEmail(email) as unknown
	const user = meteorUser as User
	if (!user) return false
	Accounts.sendResetPasswordEmail(unprotectString(user._id))
	return true
}

export function removeUser(context: MethodContext) {
	triggerWriteAccess()
	if (!context.userId) throw new Meteor.Error(403, `Not logged in`)
	const access = SystemWriteAccess.currentUser(context.userId, context)
	if (!access) return logNotAllowed('Current user', 'Invalid user id or permissions')
	Users.remove(context.userId)
	return true
}

class ServerUserAPI extends MethodContextAPI implements NewUserAPI {
	async enrollUser(email: string, name: string) {
		return makePromise(() => enrollUser(email, name))
	}
	async requestPasswordReset(email: string) {
		return makePromise(() => requestResetPassword(email))
	}
	async removeUser() {
		return makePromise(() => removeUser(this))
	}
}

registerClassToMeteorMethods(UserAPIMethods, ServerUserAPI, false)

Accounts.onCreateUser((options, user) => {
	user.profile = options.profile

	// @ts-ignore hack, add the property "createOrganization" to trigger creation of an org
	const createOrganization = options.createOrganization
	if (createOrganization) {
		Meteor.defer(() => {
			// To be run after the user has been inserted:
			for (let t = 10; t < 200; t *= 1.5) {
				const dbUser = Users.findOne(protectString(user._id))
				if (dbUser) {
					afterCreateNewUser(dbUser._id, createOrganization)
					return
				} else {
					// User has not been inserted into db (yet), wait
					waitTime(t)
				}
			}
		})
	}
	// The user to-be-inserted:
	return user
})
