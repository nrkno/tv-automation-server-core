import { RundownLayoutId } from '../../../lib/collections/RundownLayouts'
import { RundownPlaylistId } from '../../../lib/collections/RundownPlaylists'
import { Rundown, RundownId } from '../../../lib/collections/Rundowns'
import { ShowStyleBaseId } from '../../../lib/collections/ShowStyleBases'
import { StudioId } from '../../../lib/collections/Studios'
import { unprotectString } from '../../../lib/lib'
import { doModalDialog } from '../../lib/ModalDialog'
import { doUserAction, UserAction } from '../../lib/userAction'
import { MeteorCall } from '../../../lib/api/methods'
import { TFunction } from 'i18next'
import { handleRundownReloadResponse } from '../RundownView'

export function getRundownPlaylistLink(rundownPlaylistId: RundownPlaylistId): string {
	// double encoding so that "/" are handled correctly
	const encodedId = encodeURIComponent(encodeURIComponent(unprotectString(rundownPlaylistId)))

	return `/rundown/${encodedId}`
}

export function getStudioLink(studioId: StudioId): string {
	// double encoding so that "/" are handled correctly
	const encodedId = encodeURIComponent(encodeURIComponent(unprotectString(studioId)))

	return `/settings/studio/${encodedId}`
}

export function getShowStyleBaseLink(showStyleBaseId: ShowStyleBaseId): string {
	// double encoding so that "/" are handled correctly
	const encodedId = encodeURIComponent(encodeURIComponent(unprotectString(showStyleBaseId)))

	return `/settings/showStyleBase/${encodedId}`
}

export function getShelfLink(rundownId: RundownId | RundownPlaylistId, layoutId: RundownLayoutId): string {
	// double encoding so that "/" are handled correctly
	const encodedRundownId = encodeURIComponent(encodeURIComponent(unprotectString(rundownId)))
	const encodedLayoutId = encodeURIComponent(encodeURIComponent(unprotectString(layoutId)))

	return `/rundown/${encodedRundownId}/shelf/?layout=${encodedLayoutId}`
}

export function getRundownWithLayoutLink(rundownId: RundownId | RundownPlaylistId, layoutId: RundownLayoutId): string {
	// double encoding so that "/" are handled correctly
	const encodedRundownId = encodeURIComponent(encodeURIComponent(unprotectString(rundownId)))
	const encodedLayoutId = encodeURIComponent(encodeURIComponent(unprotectString(layoutId)))

	return `/rundown/${encodedRundownId}?layout=${encodedLayoutId}`
}

export function confirmDeleteRundown(rundown: Rundown, t: TFunction) {
	doModalDialog({
		title: t('Delete rundown?'),
		yes: t('Delete'),
		no: t('Cancel'),
		onAccept: (e) => {
			doUserAction(t, e, UserAction.REMOVE_RUNDOWN, async (e) =>
				MeteorCall.userAction.removeRundown(e, rundown._id)
			)
		},
		message:
			t('Are you sure you want to delete the "{{name}}" rundown?', { name: rundown.name }) +
			'\n' +
			t('Please note: This action is irreversible!'),
	})
}

export function confirmReSyncRundown(rundown: Rundown, t: TFunction): void {
	doModalDialog({
		title: t('Re-Sync rundown?'),
		yes: t('Re-Sync'),
		no: t('Cancel'),
		onAccept: (e) => {
			doUserAction(
				t,
				e,
				UserAction.RESYNC_RUNDOWN,
				async (e) => MeteorCall.userAction.resyncRundown(e, rundown._id),
				(err, res) => {
					if (!err && res) {
						return handleRundownReloadResponse(t, rundown._id, res)
					}
				}
			)
		},
		message: t('Are you sure you want to re-sync the "{{name}}" rundown?', {
			name: rundown.name,
		}),
	})
}
