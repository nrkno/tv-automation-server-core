import { RundownPlaylistReadAccess } from '../security/rundownPlaylist'
import { meteorPublish, AutoFillSelector } from './lib'
import { PubSub } from '../../lib/api/pubsub'
import { RundownPlaylists } from '../../lib/collections/RundownPlaylists'
import { StudioReadAccess } from '../security/studio'
import { OrganizationReadAccess } from '../security/organization'
import { NoSecurityReadAccess } from '../security/noSecurity'

meteorPublish(PubSub.rundownPlaylists, function (selector0, token) {
	const { cred, selector } = AutoFillSelector.organizationId(this.userId, selector0, token)
	const modifier = {
		fields: {},
	}
	if (
		NoSecurityReadAccess.any() ||
		(selector.organizationId && OrganizationReadAccess.organizationContent(selector, cred)) ||
		(selector.studioId && StudioReadAccess.studioContent(selector, cred)) ||
		(selector._id && RundownPlaylistReadAccess.rundownPlaylist(selector, cred))
	) {
		return RundownPlaylists.find(selector, modifier)
	}
	return null
})
