import { Meteor } from 'meteor/meteor'
import { check } from '../../lib/check'
import { ShowStyleBases, ShowStyleBaseId, ShowStyleBase } from '../../lib/collections/ShowStyleBases'
import { logNotAllowed } from './lib/lib'
import { ShowStyleVariants, ShowStyleVariantId, ShowStyleVariant } from '../../lib/collections/ShowStyleVariants'
import { RundownLayouts, RundownLayoutId, RundownLayoutBase } from '../../lib/collections/RundownLayouts'
import { MongoQuery, UserId } from '../../lib/typings/meteor'
import { Credentials, ResolvedCredentials, resolveCredentials } from './lib/credentials'
import { allowAccessToShowStyleBase, allowAccessToShowStyleVariant } from './lib/security'
import { OrganizationId } from '../../lib/collections/Organization'
import { triggerWriteAccess } from './lib/securityVerify'
import { Settings } from '../../lib/Settings'
import { isProtectedString } from '../../lib/lib'

type ShowStyleContent = { showStyleBaseId: ShowStyleBaseId }
export namespace ShowStyleReadAccess {
	export function showStyleBase(
		selector: MongoQuery<{ _id: ShowStyleBaseId }>,
		cred: Credentials | ResolvedCredentials
	): boolean {
		return showStyleBaseContent({ showStyleBaseId: selector._id }, cred)
	}
	/** Handles read access for all studioId content */
	export function showStyleBaseContent(
		selector: MongoQuery<ShowStyleContent>,
		cred: Credentials | ResolvedCredentials
	): boolean {
		check(selector, Object)
		if (!Settings.enableUserAccounts) return true
		if (!selector.showStyleBaseId) throw new Meteor.Error(400, 'selector must contain showStyleBaseId')

		const access = allowAccessToShowStyleBase(cred, selector.showStyleBaseId)
		if (!access.read) return logNotAllowed('ShowStyleBase content', access.reason)

		return true
	}
	export function showStyleVariant(
		selector: MongoQuery<{ _id: ShowStyleVariantId }>,
		cred: Credentials | ResolvedCredentials
	): boolean {
		check(selector, Object)
		if (!Settings.enableUserAccounts) return true
		if (!selector._id) throw new Meteor.Error(400, 'selector must contain _id')

		const access = allowAccessToShowStyleVariant(cred, selector._id)
		if (!access.read) return logNotAllowed('ShowStyleVariant', access.reason)

		return true
	}
}
export namespace ShowStyleContentWriteAccess {
	// These functions throws if access is not allowed.

	export function showStyleVariant(cred0: Credentials, existingVariant: ShowStyleVariant | ShowStyleVariantId) {
		triggerWriteAccess()
		if (existingVariant && isProtectedString(existingVariant)) {
			const variantId = existingVariant
			const m = ShowStyleVariants.findOne(variantId)
			if (!m) throw new Meteor.Error(404, `ShowStyleVariant "${variantId}" not found!`)
			existingVariant = m
		}
		return { ...anyContent(cred0, existingVariant.showStyleBaseId), showStyleVariant: existingVariant }
	}
	export function rundownLayout(cred0: Credentials, existingLayout: RundownLayoutBase | RundownLayoutId) {
		triggerWriteAccess()
		if (existingLayout && isProtectedString(existingLayout)) {
			const layoutId = existingLayout
			const m = RundownLayouts.findOne(layoutId)
			if (!m) throw new Meteor.Error(404, `RundownLayout "${layoutId}" not found!`)
			existingLayout = m
		}
		return { ...anyContent(cred0, existingLayout.showStyleBaseId), rundownLayout: existingLayout }
	}
	/** Return credentials if writing is allowed, throw otherwise */
	export function anyContent(
		cred0: Credentials,
		showStyleBaseId: ShowStyleBaseId
	): {
		userId: UserId | null
		organizationId: OrganizationId | null
		showStyleBaseId: ShowStyleBaseId | null
		showStyleBase: ShowStyleBase | null
		cred: ResolvedCredentials | Credentials
	} {
		triggerWriteAccess()
		if (!Settings.enableUserAccounts) {
			return {
				userId: null,
				organizationId: null,
				showStyleBaseId: showStyleBaseId,
				showStyleBase: ShowStyleBases.findOne(showStyleBaseId) || null,
				cred: cred0,
			}
		}
		const cred = resolveCredentials(cred0)
		if (!cred.user) throw new Meteor.Error(403, `Not logged in`)
		if (!cred.organization) throw new Meteor.Error(500, `User has no organization`)
		const access = allowAccessToShowStyleBase(cred, showStyleBaseId)
		if (!access.update) throw new Meteor.Error(403, `Not allowed: ${access.reason}`)

		return {
			userId: cred.user._id,
			organizationId: cred.organization._id,
			showStyleBaseId: showStyleBaseId,
			showStyleBase: access.document,
			cred: cred,
		}
	}
}
