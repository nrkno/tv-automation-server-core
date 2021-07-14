import { MethodContext } from '../../../lib/api/methods'
import { setCoreSystemStorePath } from '../../../lib/collections/CoreSystem'
import { DBOrganization, Organization, OrganizationId, Organizations } from '../../../lib/collections/Organization'
import { User, Users } from '../../../lib/collections/Users'
import { protectString, unprotectString } from '../../../lib/lib'
import { Settings } from '../../../lib/Settings'
import { UserId } from '../../../lib/typings/meteor'
import { DefaultEnvironment, setupDefaultStudioEnvironment } from '../../../__mocks__/helpers/database'
import { beforeAllInFiber, testInFiber } from '../../../__mocks__/helpers/jest'
import { BucketsAPI } from '../../api/buckets'
import { storeSystemSnapshot } from '../../api/snapshot'
import { BucketSecurity } from '../buckets'
import { Credentials } from '../lib/credentials'
import { NoSecurityReadAccess } from '../noSecurity'
import { OrganizationContentWriteAccess, OrganizationReadAccess } from '../organization'

describe('Security', () => {
	function getContext(cred: Credentials): MethodContext {
		return {
			...cred,

			isSimulation: false,
			connection: null,
			setUserId: (_userId: string) => {},
			unblock: () => {},
		}
	}
	function getUser(userId: UserId, orgId: OrganizationId): User {
		return {
			_id: userId,
			organizationId: orgId,

			createdAt: '',
			services: {
				password: {
					bcrypt: 'abc',
				},
			},
			username: 'username',
			emails: [{ address: 'email.com', verified: false }],
			profile: {
				name: 'John Doe',
			},
		}
	}
	function getOrg(id: string): DBOrganization {
		return {
			_id: protectString(id),
			name: 'The Company',

			userRoles: {
				userA: {
					admin: true,
				},
			},

			created: 0,
			modified: 0,

			applications: [],
			broadcastMediums: [],
		}
	}
	function changeEnableUserAccounts(fcn: () => void) {
		try {
			Settings.enableUserAccounts = false
			fcn()
			Settings.enableUserAccounts = true
			fcn()
		} catch (e) {
			console.log(`Error happened when Settings.enableUserAccounts = ${Settings.enableUserAccounts}`)
			throw e
		}
	}

	const idCreator: UserId = protectString('userCreator')
	const idUserB: UserId = protectString('userB')
	const idNonExisting: UserId = protectString('userNonExistant')
	const idInWrongOrg: UserId = protectString('userInWrongOrg')
	const idSuperAdmin: UserId = protectString('userSuperAdmin')
	const idSuperAdminInOtherOrg: UserId = protectString('userSuperAdminOther')

	// Credentials for various users:
	const nothing: MethodContext = getContext({ userId: null })
	const creator: MethodContext = getContext({ userId: idCreator })
	const userB: MethodContext = getContext({ userId: idUserB })
	const nonExisting: MethodContext = getContext({ userId: idNonExisting })
	const wrongOrg: MethodContext = getContext({ userId: idInWrongOrg })
	const superAdmin: MethodContext = getContext({ userId: idSuperAdmin })
	const otherSuperAdmin: MethodContext = getContext({ userId: idSuperAdminInOtherOrg })

	const unknownId = protectString('unknown')

	const org0: Organization = getOrg('org0')
	const org1: Organization = getOrg('org1')
	const org2: Organization = getOrg('org2')

	function expectReadNotAllowed(fcn: () => boolean) {
		if (Settings.enableUserAccounts === false) return expectReadAllowed(fcn)
		expect(fcn()).toEqual(false)
	}
	function expectReadAllowed(fcn: () => boolean) {
		expect(fcn()).toEqual(true)
	}
	function expectNotAllowed(fcn: () => any) {
		if (Settings.enableUserAccounts === false) return expectAllowed(fcn)
		expect(fcn).toThrowError()
	}
	function expectNotLoggedIn(fcn: () => any) {
		if (Settings.enableUserAccounts === false) return expectAllowed(fcn)
		expect(fcn).toThrowError(/not logged in/i)
	}
	function expectNotFound(fcn: () => any) {
		if (Settings.enableUserAccounts === false) return expectAllowed(fcn)
		expect(fcn).toThrowError(/not found/i)
	}
	function expectAllowed(fcn: () => any) {
		expect(fcn).not.toThrowError()
	}
	let env: DefaultEnvironment
	beforeAllInFiber(async () => {
		env = await setupDefaultStudioEnvironment(org0._id)

		Organizations.insert(org0)
		Organizations.insert(org1)
		Organizations.insert(org2)

		Users.insert(getUser(idCreator, org0._id))
		Users.insert(getUser(idUserB, org0._id))
		Users.insert(getUser(idInWrongOrg, org1._id))
		Users.insert({ ...getUser(idSuperAdmin, org0._id), superAdmin: true })
		Users.insert({ ...getUser(idSuperAdminInOtherOrg, org2._id), superAdmin: true })
	})

	testInFiber('Buckets', () => {
		const bucket = BucketsAPI.createNewBucket(creator, 'myBucket', env.studio._id, unprotectString(creator.userId))

		changeEnableUserAccounts(() => {
			expectReadAllowed(() => BucketSecurity.allowReadAccess({ _id: bucket._id }, '', creator))
			expectAllowed(() => BucketSecurity.allowWriteAccess({ _id: bucket._id }, creator))
			// expectAccessAllowed(() => BucketSecurity.allowWriteAccessPiece({ _id: bucket._id }, credUserA))

			// Unknown bucket:
			expectNotFound(() => BucketSecurity.allowReadAccess({ _id: unknownId }, '', creator))
			expectNotFound(() => BucketSecurity.allowWriteAccess({ _id: unknownId }, creator))
			expectNotFound(() => BucketSecurity.allowWriteAccessPiece({ _id: unknownId }, creator))

			// Not logged in:
			expectReadNotAllowed(() => BucketSecurity.allowReadAccess({ _id: bucket._id }, '', nothing))
			expectNotLoggedIn(() => BucketSecurity.allowWriteAccess({ _id: bucket._id }, nothing))
			// expectAccessNotLoggedIn(() => BucketSecurity.allowWriteAccessPiece({ _id: bucket._id }, credNothing))

			// Non existing user:
			expectReadNotAllowed(() => BucketSecurity.allowReadAccess({ _id: bucket._id }, '', nonExisting))
			expectNotLoggedIn(() => BucketSecurity.allowWriteAccess({ _id: bucket._id }, nonExisting))
			// expectAccess(() => BucketSecurity.allowWriteAccessPiece({ _id: bucket._id }, credNonExistingUser))

			// Other user in same org:
			expectReadAllowed(() => BucketSecurity.allowReadAccess({ _id: bucket._id }, '', userB))
			expectAllowed(() => BucketSecurity.allowWriteAccess({ _id: bucket._id }, userB))
			// expectAccess(() => BucketSecurity.allowWriteAccessPiece({ _id: bucket._id }, credUserB))

			// Other user in other org:
			expectReadNotAllowed(() => BucketSecurity.allowReadAccess({ _id: bucket._id }, '', wrongOrg))
			expectNotAllowed(() => BucketSecurity.allowWriteAccess({ _id: bucket._id }, wrongOrg))
			// expectAccess(() => BucketSecurity.allowWriteAccessPiece({ _id: bucket._id }, credUserInWrongOrganization))
		})
	})

	testInFiber('NoSecurity', () => {
		changeEnableUserAccounts(() => {
			expectAllowed(() => NoSecurityReadAccess.any())
		})
	})
	testInFiber('Organization', async () => {
		setCoreSystemStorePath('/non-existent-path/')
		const snapshotId = await storeSystemSnapshot(superAdmin, env.studio._id, 'for test')

		changeEnableUserAccounts(() => {
			const selectorId = { _id: org0._id }
			const selectorOrg = { organizationId: org0._id }

			// === Read access: ===

			// No user credentials:
			expectReadNotAllowed(() => OrganizationReadAccess.adminUsers(selectorOrg, nothing))
			expectReadNotAllowed(() => OrganizationReadAccess.organization(selectorId, nothing))
			expectReadNotAllowed(() => OrganizationReadAccess.organizationContent(selectorOrg, nothing))
			// Normal user:
			expectReadAllowed(() => OrganizationReadAccess.adminUsers(selectorOrg, creator))
			expectReadAllowed(() => OrganizationReadAccess.organization(selectorId, creator))
			expectReadAllowed(() => OrganizationReadAccess.organizationContent(selectorOrg, creator))
			// Other normal user:
			expectReadAllowed(() => OrganizationReadAccess.adminUsers(selectorOrg, userB))
			expectReadAllowed(() => OrganizationReadAccess.organization(selectorId, userB))
			expectReadAllowed(() => OrganizationReadAccess.organizationContent(selectorOrg, userB))
			// Non-existing user:
			expectReadNotAllowed(() => OrganizationReadAccess.adminUsers(selectorOrg, nonExisting))
			expectReadNotAllowed(() => OrganizationReadAccess.organization(selectorId, nonExisting))
			expectReadNotAllowed(() => OrganizationReadAccess.organizationContent(selectorOrg, nonExisting))
			// User in wrong organization:
			expectReadNotAllowed(() => OrganizationReadAccess.adminUsers(selectorOrg, wrongOrg))
			expectReadNotAllowed(() => OrganizationReadAccess.organization(selectorId, wrongOrg))
			expectReadNotAllowed(() => OrganizationReadAccess.organizationContent(selectorOrg, wrongOrg))
			// SuperAdmin:
			expectReadNotAllowed(() => OrganizationReadAccess.adminUsers(selectorOrg, otherSuperAdmin))
			expectReadNotAllowed(() => OrganizationReadAccess.organization(selectorId, otherSuperAdmin))
			expectReadNotAllowed(() => OrganizationReadAccess.organizationContent(selectorOrg, otherSuperAdmin))

			// === Write access: ===

			// No user credentials:
			expectNotLoggedIn(() => OrganizationContentWriteAccess.organization(nothing, org0._id))
			expectNotLoggedIn(() => OrganizationContentWriteAccess.studio(nothing, env.studio))
			expectNotLoggedIn(() => OrganizationContentWriteAccess.evaluation(nothing))
			expectNotLoggedIn(() => OrganizationContentWriteAccess.mediaWorkFlows(nothing, org0._id))
			expectNotLoggedIn(() => OrganizationContentWriteAccess.blueprint(nothing, env.studioBlueprint._id))
			expectNotLoggedIn(() => OrganizationContentWriteAccess.snapshot(nothing, snapshotId))
			expectNotLoggedIn(() => OrganizationContentWriteAccess.dataFromSnapshot(nothing, org0._id))
			expectNotLoggedIn(() => OrganizationContentWriteAccess.showStyleBase(nothing, env.showStyleBaseId))
			expectNotLoggedIn(() => OrganizationContentWriteAccess.anyContent(nothing, selectorOrg))

			// Normal user:
			expectAllowed(() => OrganizationContentWriteAccess.organization(creator, org0._id))
			expectAllowed(() => OrganizationContentWriteAccess.studio(creator, env.studio))
			expectAllowed(() => OrganizationContentWriteAccess.evaluation(creator))
			expectAllowed(() => OrganizationContentWriteAccess.mediaWorkFlows(creator, org0._id))
			expectAllowed(() => OrganizationContentWriteAccess.blueprint(creator, env.studioBlueprint._id))
			expectAllowed(() => OrganizationContentWriteAccess.snapshot(creator, snapshotId))
			expectAllowed(() => OrganizationContentWriteAccess.dataFromSnapshot(creator, org0._id))
			expectAllowed(() => OrganizationContentWriteAccess.showStyleBase(creator, env.showStyleBaseId))
			expectAllowed(() => OrganizationContentWriteAccess.anyContent(creator, selectorOrg))
			// Other normal user:
			expectAllowed(() => OrganizationContentWriteAccess.organization(userB, org0._id))
			expectAllowed(() => OrganizationContentWriteAccess.studio(userB, env.studio))
			expectAllowed(() => OrganizationContentWriteAccess.evaluation(userB))
			expectAllowed(() => OrganizationContentWriteAccess.mediaWorkFlows(userB, org0._id))
			expectAllowed(() => OrganizationContentWriteAccess.blueprint(userB, env.studioBlueprint._id))
			expectAllowed(() => OrganizationContentWriteAccess.snapshot(userB, snapshotId))
			expectAllowed(() => OrganizationContentWriteAccess.dataFromSnapshot(userB, org0._id))
			expectAllowed(() => OrganizationContentWriteAccess.showStyleBase(userB, env.showStyleBaseId))
			expectAllowed(() => OrganizationContentWriteAccess.anyContent(userB, selectorOrg))
			// Non-existing user:
			expectNotLoggedIn(() => OrganizationContentWriteAccess.organization(nonExisting, org0._id))
			expectNotLoggedIn(() => OrganizationContentWriteAccess.studio(nonExisting, env.studio))
			expectNotLoggedIn(() => OrganizationContentWriteAccess.evaluation(nonExisting))
			expectNotLoggedIn(() => OrganizationContentWriteAccess.mediaWorkFlows(nonExisting, org0._id))
			expectNotLoggedIn(() => OrganizationContentWriteAccess.blueprint(nonExisting, env.studioBlueprint._id))
			expectNotLoggedIn(() => OrganizationContentWriteAccess.snapshot(nonExisting, snapshotId))
			expectNotLoggedIn(() => OrganizationContentWriteAccess.dataFromSnapshot(nonExisting, org0._id))
			expectNotLoggedIn(() => OrganizationContentWriteAccess.showStyleBase(nonExisting, env.showStyleBaseId))
			expectNotLoggedIn(() => OrganizationContentWriteAccess.anyContent(nonExisting, selectorOrg))
			// User in wrong organization:
			expectNotAllowed(() => OrganizationContentWriteAccess.organization(wrongOrg, org0._id))
			expectNotAllowed(() => OrganizationContentWriteAccess.studio(wrongOrg, env.studio))
			// expectNotAllowed(() => OrganizationContentWriteAccess.evaluation(wrongOrg))
			expectNotAllowed(() => OrganizationContentWriteAccess.mediaWorkFlows(wrongOrg, org0._id))
			expectNotAllowed(() => OrganizationContentWriteAccess.blueprint(wrongOrg, env.studioBlueprint._id))
			expectNotAllowed(() => OrganizationContentWriteAccess.snapshot(wrongOrg, snapshotId))
			expectNotAllowed(() => OrganizationContentWriteAccess.dataFromSnapshot(wrongOrg, org0._id))
			expectNotAllowed(() => OrganizationContentWriteAccess.showStyleBase(wrongOrg, env.showStyleBaseId))
			expectNotAllowed(() => OrganizationContentWriteAccess.anyContent(wrongOrg, selectorOrg))

			// Other SuperAdmin
			expectNotAllowed(() => OrganizationContentWriteAccess.organization(otherSuperAdmin, org0._id))
			expectNotAllowed(() => OrganizationContentWriteAccess.studio(otherSuperAdmin, env.studio))
			// expectNotAllowed(() => OrganizationContentWriteAccess.evaluation(otherSuperAdmin))
			expectNotAllowed(() => OrganizationContentWriteAccess.mediaWorkFlows(otherSuperAdmin, org0._id))
			expectNotAllowed(() => OrganizationContentWriteAccess.blueprint(otherSuperAdmin, env.studioBlueprint._id))
			expectNotAllowed(() => OrganizationContentWriteAccess.snapshot(otherSuperAdmin, snapshotId))
			expectNotAllowed(() => OrganizationContentWriteAccess.dataFromSnapshot(otherSuperAdmin, org0._id))
			expectNotAllowed(() => OrganizationContentWriteAccess.showStyleBase(otherSuperAdmin, env.showStyleBaseId))
			expectNotAllowed(() => OrganizationContentWriteAccess.anyContent(otherSuperAdmin, selectorOrg))
		})
	})
})
