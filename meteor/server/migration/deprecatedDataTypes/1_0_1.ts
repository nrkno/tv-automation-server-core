import { Time, literal, protectString, getRandomId } from '../../../lib/lib'
import { RundownImportVersions, RundownHoldState, DBRundown } from '../../../lib/collections/Rundowns'
import { RundownNote } from '../../../lib/api/notes'
import { PlaylistTimingType, TimelinePersistentState } from '@sofie-automation/blueprints-integration'
import { DBRundownPlaylist, RundownPlaylistId } from '../../../lib/collections/RundownPlaylists'
import { ShowStyleVariantId } from '../../../lib/collections/ShowStyleVariants'
import { StudioId } from '../../../lib/collections/Studios'
import { ShowStyleBaseId } from '../../../lib/collections/ShowStyleBases'
import { PeripheralDeviceId } from '../../../lib/collections/PeripheralDevices'
import { PartId } from '../../../lib/collections/Parts'

export interface Rundown {
	externalId: string
	name: string
	expectedStart?: Time
	expectedDuration?: number
	expectedEnd?: Time
	metaData?: {
		[key: string]: any
	}
	// From IBlueprintRundownDB:
	_id: string
	showStyleVariantId: ShowStyleVariantId
	// From DBRundown:
	studioId: StudioId
	showStyleBaseId: ShowStyleBaseId
	peripheralDeviceId: PeripheralDeviceId
	created: Time
	modified: Time
	importVersions: RundownImportVersions
	status?: string
	airStatus?: string
	active?: boolean
	rehearsal?: boolean
	currentPartId: PartId | null
	nextPartId: PartId | null
	nextTimeOffset?: number | null
	nextPartManual?: boolean
	previousPartId: PartId | null
	startedPlayback?: Time
	unsynced?: boolean
	unsyncedTime?: Time
	notifiedCurrentPlayingPartExternalId?: string
	holdState?: RundownHoldState
	dataSource: string
	notes?: Array<RundownNote>
	previousPersistentState?: TimelinePersistentState
}
export function makePlaylistFromRundown_1_0_0(
	rundown0: DBRundown,
	newPlaylistId?: RundownPlaylistId
): DBRundownPlaylist {
	const rundown = rundown0 as any as Rundown
	if (!newPlaylistId) newPlaylistId = protectString('pl_' + rundown._id)
	const playlist = literal<DBRundownPlaylist>({
		_id: newPlaylistId,
		externalId: rundown.externalId,
		activationId: rundown['active'] ? getRandomId() : undefined,
		rehearsal: rundown['rehearsal'],
		created: rundown.created,
		currentPartInstanceId: null,
		nextPartInstanceId: null,
		timing: {
			type: PlaylistTimingType.ForwardTime,
			expectedDuration: rundown.expectedDuration,
			expectedStart: rundown.expectedStart || 0,
			expectedEnd: rundown.expectedEnd,
		},
		holdState: rundown.holdState,
		name: rundown.name,
		nextPartManual: rundown.nextPartManual,
		nextTimeOffset: rundown.nextTimeOffset,
		previousPartInstanceId: null,
		startedPlayback: rundown.startedPlayback,
		studioId: rundown.studioId,
		modified: rundown.modified,
	})
	return playlist
}
