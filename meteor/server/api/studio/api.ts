import { Meteor } from 'meteor/meteor'
import { check } from '../../../lib/check'
import { registerClassToMeteorMethods } from '../../methods'
import { NewStudiosAPI, StudiosAPIMethods } from '../../../lib/api/studios'
import { Studios, DBStudio, StudioId } from '../../../lib/collections/Studios'
import { literal, getRandomId, makePromise, lazyIgnore } from '../../../lib/lib'
import { Rundowns } from '../../../lib/collections/Rundowns'
import { PeripheralDevices } from '../../../lib/collections/PeripheralDevices'
import { MethodContextAPI, MethodContext } from '../../../lib/api/methods'
import { OrganizationContentWriteAccess } from '../../security/organization'
import { RundownPlaylists } from '../../../lib/collections/RundownPlaylists'
import { Timeline } from '../../../lib/collections/Timeline'
import { ExternalMessageQueue } from '../../../lib/collections/ExternalMessageQueue'
import { MediaObjects } from '../../../lib/collections/MediaObjects'
import { Credentials } from '../../security/lib/credentials'
import { OrganizationId } from '../../../lib/collections/Organization'
import { ExpectedPackages } from '../../../lib/collections/ExpectedPackages'
import { ExpectedPackageWorkStatuses } from '../../../lib/collections/ExpectedPackageWorkStatuses'
import { PackageInfos } from '../../../lib/collections/PackageInfos'
import { PackageContainerPackageStatuses } from '../../../lib/collections/PackageContainerPackageStatus'

export function insertStudio(context: MethodContext | Credentials, newId?: StudioId): StudioId {
	if (newId) check(newId, String)

	const access = OrganizationContentWriteAccess.studio(context)
	return insertStudioInner(access.organizationId, newId)
}
export function insertStudioInner(organizationId: OrganizationId | null, newId?: StudioId): StudioId {
	return Studios.insert(
		literal<DBStudio>({
			_id: newId || getRandomId(),
			name: 'New Studio',
			organizationId: organizationId,
			// blueprintId?: BlueprintId
			mappings: {},
			supportedShowStyleBase: [],
			blueprintConfig: {},
			// testToolsConfig?: ITestToolsConfig
			settings: {
				mediaPreviewsUrl: '',
				sofieUrl: '',
			},
			_rundownVersionHash: '',
			routeSets: {},
			routeSetExclusivityGroups: {},
			packageContainers: {},
			thumbnailContainerIds: [],
			previewContainerIds: [],
		})
	)
}
export function removeStudio(context: MethodContext, studioId: StudioId): void {
	check(studioId, String)
	const access = OrganizationContentWriteAccess.studio(context, studioId)
	const studio = access.studio
	if (!studio) throw new Meteor.Error(404, `Studio "${studioId}" not found`)

	// allowed to remove?
	const rundown = Rundowns.findOne({ studioId: studio._id })
	if (rundown)
		throw new Meteor.Error(404, `Can't remove studio "${studioId}", because the rundown "${rundown._id}" is in it.`)

	const playlist = RundownPlaylists.findOne({ studioId: studio._id })
	if (playlist)
		throw new Meteor.Error(
			404,
			`Can't remove studio "${studioId}", because the rundownPlaylist "${playlist._id}" is in it.`
		)

	const peripheralDevice = PeripheralDevices.findOne({ studioId: studio._id })
	if (peripheralDevice)
		throw new Meteor.Error(
			404,
			`Can't remoce studio "${studioId}", because the peripheralDevice "${peripheralDevice._id}" is in it.`
		)

	Studios.remove(studio._id)
	Studios.remove({ studioId: studio._id })
	ExternalMessageQueue.remove({ studioId: studio._id })
	MediaObjects.remove({ studioId: studio._id })
	Timeline.remove({ studioId: studio._id })
	ExpectedPackages.remove({ studioId: studio._id })
	ExpectedPackageWorkStatuses.remove({ studioId: studio._id })
	PackageInfos.remove({ studioId: studio._id })
	PackageContainerPackageStatuses.remove({ studioId: studio._id })
}

class ServerStudiosAPI extends MethodContextAPI implements NewStudiosAPI {
	async insertStudio() {
		return makePromise(() => insertStudio(this))
	}
	async removeStudio(studioId: StudioId) {
		return makePromise(() => removeStudio(this, studioId))
	}
}
registerClassToMeteorMethods(StudiosAPIMethods, ServerStudiosAPI, false)

// Set up a watcher for updating the mappingsHash whenever a mapping or route is changed:
function triggerUpdateStudioMappingsHash(studioId: StudioId) {
	lazyIgnore(
		`triggerUpdateStudio_${studioId}`,
		() => {
			Studios.update(studioId, {
				$set: {
					mappingsHash: getRandomId(),
				},
			})
		},
		10
	)
}
Studios.find(
	{},
	{
		fields: {
			mappings: 1,
			routeSets: 1,
		},
	}
).observeChanges({
	added: triggerUpdateStudioMappingsHash,
	changed: triggerUpdateStudioMappingsHash,
	removed: triggerUpdateStudioMappingsHash,
})
