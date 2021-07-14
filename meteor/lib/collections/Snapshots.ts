import { Time, registerCollection, ProtectedString } from '../lib'
import { createMongoCollection } from './lib'
import { StudioId } from './Studios'
import { RundownId } from './Rundowns'
import { RundownPlaylistId } from './RundownPlaylists'
import { OrganizationId } from './Organization'
import { registerIndex } from '../database'

export enum SnapshotType {
	RUNDOWN = 'rundown', // to be deprecated?
	RUNDOWNPLAYLIST = 'rundownplaylist',
	SYSTEM = 'system',
	DEBUG = 'debug',
}
/** A string, identifying a Snapshot */
export type SnapshotId = ProtectedString<'SnapshotId'>

export interface SnapshotBase {
	_id: SnapshotId
	/** If set, the organization the owns this Snapshot */
	organizationId: OrganizationId | null

	type: SnapshotType
	created: Time
	name: string
	description?: string
	/** Version of the system that took the snapshot */
	version: string
}

export interface SnapshotItem extends SnapshotBase {
	fileName: string
	comment: string

	studioId?: StudioId
	rundownId?: RundownId
	playlistId?: RundownPlaylistId
}

export interface DeprecatedSnapshotRundown extends SnapshotBase {
	// From the times before rundownPlaylists
	type: SnapshotType.RUNDOWN
	studioId: StudioId
	rundownId: RundownId
}
export interface SnapshotRundownPlaylist extends SnapshotBase {
	type: SnapshotType.RUNDOWNPLAYLIST
	studioId: StudioId
	playlistId: RundownPlaylistId
}
export interface SnapshotSystem extends SnapshotBase {
	type: SnapshotType.SYSTEM
}
export interface SnapshotDebug extends SnapshotBase {
	type: SnapshotType.DEBUG
}

export const Snapshots = createMongoCollection<SnapshotItem, SnapshotItem>('snapshots')
registerCollection('Snapshots', Snapshots)

registerIndex(Snapshots, {
	organizationId: 1,
})
registerIndex(Snapshots, {
	created: 1,
})
