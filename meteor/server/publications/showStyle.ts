import { meteorPublish, AutoFillSelector } from './lib'
import { PubSub } from '../../lib/api/pubsub'
import { ShowStyleBases, ShowStyleBase } from '../../lib/collections/ShowStyleBases'
import { ShowStyleVariants, ShowStyleVariant } from '../../lib/collections/ShowStyleVariants'
import { RundownLayouts, RundownLayoutBase } from '../../lib/collections/RundownLayouts'
import { ShowStyleReadAccess } from '../security/showStyle'
import { OrganizationReadAccess } from '../security/organization'
import { FindOptions } from '../../lib/typings/meteor'
import { NoSecurityReadAccess } from '../security/noSecurity'

meteorPublish(PubSub.showStyleBases, function (selector0, token) {
	const { cred, selector } = AutoFillSelector.organizationId(this.userId, selector0, token)
	const modifier: FindOptions<ShowStyleBase> = {
		fields: {},
	}
	if (
		NoSecurityReadAccess.any() ||
		(selector.organizationId && OrganizationReadAccess.organizationContent(selector, cred)) ||
		(selector._id && ShowStyleReadAccess.showStyleBase(selector, cred))
	) {
		return ShowStyleBases.find(selector, modifier)
	}
	return null
})
meteorPublish(PubSub.showStyleVariants, function (selector0, token) {
	const { cred, selector } = AutoFillSelector.showStyleBaseId(this.userId, selector0, token)
	const modifier: FindOptions<ShowStyleVariant> = {
		fields: {},
	}
	if (
		NoSecurityReadAccess.any() ||
		(selector.showStyleBaseId && ShowStyleReadAccess.showStyleBaseContent(selector, cred)) ||
		(selector._id && ShowStyleReadAccess.showStyleVariant(selector, cred))
	) {
		return ShowStyleVariants.find(selector, modifier)
	}
	return null
})

meteorPublish(PubSub.rundownLayouts, function (selector0, token) {
	const { cred, selector } = AutoFillSelector.showStyleBaseId(this.userId, selector0, token)
	const modifier: FindOptions<RundownLayoutBase> = {
		fields: {},
	}
	if (ShowStyleReadAccess.showStyleBaseContent(selector, cred)) {
		return RundownLayouts.find(selector, modifier)
	}
	return null
})
