import { RundownId } from '../collections/Rundowns'
import { RundownPlaylistId } from '../collections/RundownPlaylists'
import { ReloadRundownPlaylistResponse, TriggerReloadDataResponse } from './userActions'
import { SegmentId } from '../collections/Segments'

export interface RundownPlaylistValidateBlueprintConfigResult {
	studio: string[]
	showStyles: Array<{
		id: string
		name: string
		checkFailed: boolean
		fields: string[]
	}>
}

export interface NewRundownAPI {
	removeRundownPlaylist(playlistId: RundownPlaylistId): Promise<void>
	resyncRundownPlaylist(playlistId: RundownPlaylistId): Promise<ReloadRundownPlaylistResponse>
	rundownPlaylistNeedsResync(playlistId: RundownPlaylistId): Promise<string[]>
	rundownPlaylistValidateBlueprintConfig(
		playlistId: RundownPlaylistId
	): Promise<RundownPlaylistValidateBlueprintConfigResult>
	removeRundown(rundownId: RundownId): Promise<void>
	resyncRundown(rundownId: RundownId): Promise<TriggerReloadDataResponse>
	resyncSegment(rundownId: RundownId, segmentId: SegmentId): Promise<TriggerReloadDataResponse>
	unsyncRundown(rundownId: RundownId): Promise<void>
	moveRundown(
		rundownId: RundownId,
		intoPlaylistId: RundownPlaylistId | null,
		rundownsIdsInPlaylistInOrder: RundownId[]
	): Promise<void>
	restoreRundownsInPlaylistToDefaultOrder(playlistId: RundownPlaylistId): Promise<void>
}

export enum RundownAPIMethods {
	'removeRundownPlaylist' = 'rundown.removeRundownPlaylist',
	'resyncRundownPlaylist' = 'rundown.resyncRundownPlaylist',
	'rundownPlaylistNeedsResync' = 'rundown.rundownPlaylistNeedsResync',
	'rundownPlaylistValidateBlueprintConfig' = 'rundown.rundownPlaylistValidateBlueprintConfig',

	'removeRundown' = 'rundown.removeRundown',
	'resyncRundown' = 'rundown.resyncRundown',
	'resyncSegment' = 'rundown.resyncSegment',
	'unsyncRundown' = 'rundown.unsyncRundown',
	'moveRundown' = 'rundown.moveRundown',
	'restoreRundownsInPlaylistToDefaultOrder' = 'rundown.restoreRundownsInPlaylistToDefaultOrder',
}

export namespace RundownAPI {
	/** A generic list of playback availability statuses for a Piece */
	export enum PieceStatusCode {
		/** No status has been determined (yet) */
		UNKNOWN = -1,
		/** No fault with piece, can be played */
		OK = 0,
		/** The source (file, live input) is missing and cannot be played, as it would result in BTA */
		SOURCE_MISSING = 1,
		/** The source is present, but should not be played due to a technical malfunction (file is broken, camera robotics failed, REMOTE input is just bars, etc.) */
		SOURCE_BROKEN = 2,
		/** Source not set - the source object is not set to an actual source */
		SOURCE_NOT_SET = 3,
	}
}
