import { literal, getRandomId, makePromise, getCurrentTime, waitForPromise } from '../../lib/lib'
import { MethodContextAPI, MethodContext } from '../../lib/api/methods'
import { NewOrganizationAPI, OrganizationAPIMethods } from '../../lib/api/organization'
import { registerClassToMeteorMethods } from '../methods'
import { Organizations, OrganizationId, DBOrganization, DBOrganizationBase } from '../../lib/collections/Organization'
import { OrganizationContentWriteAccess } from '../security/organization'
import { triggerWriteAccessBecauseNoCheckNecessary } from '../security/lib/securityVerify'
import { insertStudioInner } from './studio/api'
import { insertShowStyleBaseInner } from './showStyles'
import { Studios } from '../../lib/collections/Studios'
import { ShowStyleBases } from '../../lib/collections/ShowStyleBases'
import { Blueprints, BlueprintId } from '../../lib/collections/Blueprints'
import { CoreSystem } from '../../lib/collections/CoreSystem'
import { Users } from '../../lib/collections/Users'
import { resetCredentials } from '../security/lib/credentials'

function createDefaultEnvironmentForOrg(orgId: OrganizationId) {
	let systemBlueprintId: BlueprintId | undefined
	let studioBlueprintId: BlueprintId | undefined
	let showStyleBlueprintId: BlueprintId | undefined
	const studioId = insertStudioInner(orgId)
	const showStyleId = waitForPromise(insertShowStyleBaseInner(orgId))

	const core = CoreSystem.findOne()
	Blueprints.find()
		.fetch()
		.forEach((blueprint) => {
			if (blueprint.blueprintType === 'system') systemBlueprintId = blueprint._id
			if (blueprint.blueprintType === 'studio') studioBlueprintId = blueprint._id
			if (blueprint.blueprintType === 'showstyle') showStyleBlueprintId = blueprint._id
		})
	if (systemBlueprintId && core) CoreSystem.update({ _id: core._id }, { $set: { blueprintId: systemBlueprintId } })
	if (studioBlueprintId)
		Studios.update(
			{ _id: studioId },
			{
				$set: {
					blueprintId: studioBlueprintId,
				},
				$push: {
					supportedShowStyleBase: showStyleId,
				},
			}
		)
	if (showStyleId && showStyleBlueprintId)
		ShowStyleBases.update({ _id: showStyleId }, { $set: { blueprintId: showStyleBlueprintId } })
	// const migration = prepareMigration(true)
	// if (migration.migrationNeeded && migration.manualStepCount === 0) {
	// 	runMigration(migration.chunks, migration.hash, [])
	// }
}

export function createOrganization(organization: DBOrganizationBase): OrganizationId {
	triggerWriteAccessBecauseNoCheckNecessary()

	const orgId = Organizations.insert(
		literal<DBOrganization>({
			...organization,
			_id: getRandomId(),
			userRoles: {},
			created: getCurrentTime(),
			modified: getCurrentTime(),
		})
	)
	// Setup default environment for the organization:
	createDefaultEnvironmentForOrg(orgId)
	return orgId
}

export function removeOrganization(context: MethodContext, organizationId: OrganizationId) {
	OrganizationContentWriteAccess.organization(context, organizationId)
	const users = Users.find({ organizationId }).fetch()
	users.forEach((user) => {
		resetCredentials({ userId: user._id })
	})
	Organizations.remove(organizationId)
}

class ServerOrganizationAPI extends MethodContextAPI implements NewOrganizationAPI {
	removeOrganization(organizationId: OrganizationId) {
		return makePromise(() => removeOrganization(this, organizationId))
	}
}

registerClassToMeteorMethods(OrganizationAPIMethods, ServerOrganizationAPI, false)
