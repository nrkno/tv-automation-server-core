import * as _ from 'underscore'
import { Time, applyClassToDocument, registerCollection, ProtectedString, ProtectedStringProperties } from '../lib'
import { Segments, DBSegment, Segment } from './Segments'
import { Parts, Part, DBPart } from './Parts'
import { FindOptions, MongoQuery } from '../typings/meteor'
import { StudioId } from './Studios'
import { Meteor } from 'meteor/meteor'
import { IBlueprintRundownDB } from '@sofie-automation/blueprints-integration'
import { ShowStyleVariantId, ShowStyleVariant, ShowStyleVariants } from './ShowStyleVariants'
import { ShowStyleBase, ShowStyleBases, ShowStyleBaseId } from './ShowStyleBases'
import { RundownNote } from '../api/notes'
import { RundownPlaylists, RundownPlaylist, RundownPlaylistId } from './RundownPlaylists'
import { createMongoCollection } from './lib'
import { PartInstances, PartInstance, DBPartInstance } from './PartInstances'
import { PeripheralDeviceId } from './PeripheralDevices'
import { OrganizationId } from './Organization'
import { registerIndex } from '../database'

export enum RundownHoldState {
	NONE = 0,
	PENDING = 1, // During STK
	ACTIVE = 2, // During full, STK is played
	COMPLETE = 3, // During full, full is played
}

export interface RundownImportVersions {
	studio: string
	showStyleBase: string
	showStyleVariant: string
	blueprint: string

	core: string
}
/** A string, identifying a Rundown */
export type RundownId = ProtectedString<'RundownId'>
/** This is a very uncomplete mock-up of the Rundown object */
export interface DBRundown
	extends ProtectedStringProperties<IBlueprintRundownDB, '_id' | 'playlistId' | 'showStyleVariantId'> {
	_id: RundownId
	/** ID of the organization that owns the rundown */
	organizationId: OrganizationId | null
	/** The id of the Studio this rundown is in */
	studioId: StudioId

	/** The ShowStyleBase this Rundown uses (its the parent of the showStyleVariant) */
	showStyleBaseId: ShowStyleBaseId
	/** The peripheral device the rundown originates from */
	peripheralDeviceId?: PeripheralDeviceId
	restoredFromSnapshotId?: RundownId
	created: Time
	modified: Time

	/** Revisions/Versions of various docs that when changed require the user to reimport the rundown */
	importVersions: RundownImportVersions

	status?: string
	// There should be something like a Owner user here somewhere?

	/** Is the rundown in an unsynced (has been unpublished from ENPS) state? */
	orphaned?: 'deleted' | 'from-snapshot'

	/** Last sent storyStatus to ingestDevice (MOS) */
	notifiedCurrentPlayingPartExternalId?: string

	/** Holds notes (warnings / errors) thrown by the blueprints during creation, or appended after */
	notes?: Array<RundownNote>

	/** External id of the Rundown Playlist to put this rundown in */
	playlistExternalId?: string
	/** Name (user-facing) of the external NCS this rundown came from */
	externalNRCSName: string
	/** The id of the Rundown Playlist this rundown is in */
	playlistId: RundownPlaylistId
	/** If the playlistId has ben set manually by a user in Sofie */
	playlistIdIsSetInSofie?: boolean
	/** Rank of the Rundown inside of its Rundown Playlist */
	_rank: number
	/** Whenever the baseline (RundownBaselineObjs, RundownBaselineAdLibItems, RundownBaselineAdLibActions) changes, this is changed too */
	baselineModifyHash?: string
}
export class Rundown implements DBRundown {
	// From IBlueprintRundown:
	public externalId: string
	public organizationId: OrganizationId
	public name: string
	public description?: string
	public expectedStart?: Time
	public expectedDuration?: number
	public metaData?: unknown
	// From IBlueprintRundownDB:
	public _id: RundownId
	public showStyleVariantId: ShowStyleVariantId
	// From DBRundown:
	public studioId: StudioId
	public showStyleBaseId: ShowStyleBaseId
	public peripheralDeviceId?: PeripheralDeviceId
	public restoredFromSnapshotId?: RundownId
	public created: Time
	public modified: Time
	public importVersions: RundownImportVersions
	public status?: string
	public airStatus?: string
	public orphaned?: 'deleted'
	public notifiedCurrentPlayingPartExternalId?: string
	public notes?: Array<RundownNote>
	public playlistExternalId?: string
	public externalNRCSName: string
	public playlistId: RundownPlaylistId
	public playlistIdIsSetInSofie?: boolean
	public _rank: number
	public baselineModifyHash?: string

	constructor(document: DBRundown) {
		for (const [key, value] of Object.entries(document)) {
			this[key] = value
		}
	}
	getRundownPlaylist(): RundownPlaylist {
		if (!this.playlistId) throw new Meteor.Error(500, 'Rundown is not a part of a rundown playlist!')
		const pls = RundownPlaylists.findOne(this.playlistId)
		if (pls) {
			return pls
		} else throw new Meteor.Error(404, `Rundown Playlist "${this.playlistId}" not found!`)
	}
	getShowStyleVariant(): ShowStyleVariant {
		const showStyleVariant = ShowStyleVariants.findOne(this.showStyleVariantId)
		if (!showStyleVariant) throw new Meteor.Error(404, `ShowStyleVariant "${this.showStyleVariantId}" not found!`)
		return showStyleVariant
	}
	getShowStyleBase(): ShowStyleBase {
		const showStyleBase = ShowStyleBases.findOne(this.showStyleBaseId)
		if (!showStyleBase) throw new Meteor.Error(404, `ShowStyleBase "${this.showStyleBaseId}" not found!`)
		return showStyleBase
	}
	getSegments(selector?: MongoQuery<DBSegment>, options?: FindOptions<DBSegment>): Segment[] {
		selector = selector || {}
		options = options || {}
		return Segments.find(
			_.extend(
				{
					rundownId: this._id,
				},
				selector
			),
			_.extend(
				{
					sort: { _rank: 1 },
				},
				options
			)
		).fetch()
	}
	getParts(selector?: MongoQuery<Part>, options?: FindOptions<DBPart>, segmentsInOrder?: Segment[]): Part[] {
		selector = selector || {}
		options = options || {}

		let parts = Parts.find(
			_.extend(
				{
					rundownId: this._id,
				},
				selector
			),
			_.extend(
				{
					sort: { _rank: 1 },
				},
				options
			)
		).fetch()
		if (!options.sort) {
			parts = RundownPlaylist._sortPartsInner(parts, segmentsInOrder || this.getSegments())
		}
		return parts
	}
	/** Synchronous version of getSegmentsAndParts, to be used client-side */
	getSegmentsAndPartsSync(): { segments: Segment[]; parts: Part[] } {
		const segments = Segments.find(
			{
				rundownId: this._id,
			},
			{ sort: { _rank: 1 } }
		).fetch()

		const parts = Parts.find(
			{
				rundownId: this._id,
			},
			{ sort: { _rank: 1 } }
		).fetch()

		return {
			segments: segments,
			parts: RundownPlaylist._sortPartsInner(parts, segments),
		}
	}
	getAllPartInstances(selector?: MongoQuery<PartInstance>, options?: FindOptions<DBPartInstance>) {
		selector = selector || {}
		options = options || {}
		return PartInstances.find(
			_.extend(
				{
					rundownId: this._id,
				},
				selector
			),
			_.extend(
				{
					sort: { takeCount: 1 },
				},
				options
			)
		).fetch()
	}
}

// export const Rundowns = createMongoCollection<Rundown>('rundowns', {transform: (doc) => applyClassToDocument(Rundown, doc) })
export const Rundowns = createMongoCollection<Rundown, DBRundown>('rundowns', {
	transform: (doc) => applyClassToDocument(Rundown, doc),
})
registerCollection('Rundowns', Rundowns)

registerIndex(Rundowns, {
	playlistId: 1,
})
registerIndex(Rundowns, {
	playlistExternalId: 1,
})
