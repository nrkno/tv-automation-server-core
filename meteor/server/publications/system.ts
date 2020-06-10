import { Meteor } from 'meteor/meteor'
import { meteorPublish } from './lib'
import { PubSub } from '../../lib/api/pubsub'
import { getCoreSystemCursor } from '../../lib/collections/CoreSystem'
import { Users } from '../../lib/collections/Users'
import { SystemReadAccess } from '../security/system'
import { OrganizationReadAccess } from '../security/organization'

meteorPublish(PubSub.coreSystem, function(token) {
	if (SystemReadAccess.coreSystem({ userId: this.userId, token })) {
		return getCoreSystemCursor({
			fields: {
				// Include only specific fields in the result documents:
				_id: 1,
				support: 1,
				systemInfo: 1,
				name: 1,
				serviceMessages: 1,
				blueprintId: 1,
			},
		})
	}
	return null
})

meteorPublish(PubSub.loggedInUser, function(token) {
	const currentUserId = this.userId
	if (SystemReadAccess.currentUser(currentUserId, { userId: this.userId, token })) {
		return Users.find(
			{
				_id: currentUserId,
			},
			{
				fields: {
					_id: 1,
					username: 1,
					emails: 1,
					profile: 1,
					organizationId: 1,
					roles: 1,
					superAdmin: 1,
				},
			}
		)
	}
	return null
})
meteorPublish(PubSub.usersInOrganization, function(selector, token) {
	if (!selector) throw new Meteor.Error(400, 'selector argument missing')
	if (OrganizationReadAccess.adminUsers(selector, { userId: this.userId, token })) {
		return Users.find(selector, {
			fields: {
				_id: 1,
				username: 1,
				emails: 1,
				profile: 1,
				organizationId: 1,
				roles: 1,
				superAdmin: 1,
			},
		})
	}
	return null
})
