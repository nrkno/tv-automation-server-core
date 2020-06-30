import * as _ from 'underscore'
import {
	Time,
	applyClassToDocument,
	getCurrentTime,
	registerCollection,
	asyncCollectionFindFetch,
	ProtectedString,
	ProtectId,
	ProtectedStringProperties,
} from '../lib'
import { Segments, DBSegment, Segment } from './Segments'
import { Parts, Part, DBPart } from './Parts'
import { FindOptions, MongoQuery, TransformedCollection } from '../typings/meteor'
import { Studios, Studio, StudioId } from './Studios'
import { Pieces } from './Pieces'
import { Meteor } from 'meteor/meteor'
import { AdLibPieces, AdLibPiece } from './AdLibPieces'
import { RundownBaselineObjs } from './RundownBaselineObjs'
import { RundownBaselineAdLibPieces, RundownBaselineAdLibItem } from './RundownBaselineAdLibPieces'
import { IBlueprintRundownDB, TimelinePersistentState } from 'tv-automation-sofie-blueprints-integration'
import { ShowStyleCompound, getShowStyleCompound, ShowStyleVariantId } from './ShowStyleVariants'
import { ShowStyleBase, ShowStyleBases, ShowStyleBaseId } from './ShowStyleBases'
import { RundownNote } from '../api/notes'
import { IngestDataCache } from './IngestDataCache'
import { ExpectedMediaItems } from './ExpectedMediaItems'
import { RundownPlaylists, RundownPlaylist, RundownPlaylistId } from './RundownPlaylists'
import { createMongoCollection } from './lib'
import { ExpectedPlayoutItems } from './ExpectedPlayoutItems'
import { PartInstances, PartInstance, DBPartInstance } from './PartInstances'
import { PieceInstances, PieceInstance } from './PieceInstances'
import { PeripheralDeviceId } from './PeripheralDevices'
import { AdLibActions } from './AdLibActions'
import { RundownBaselineAdLibActions } from './RundownBaselineAdLibActions'

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
	/** The id of the Studio this rundown is in */
	studioId: StudioId

	/** The ShowStyleBase this Rundown uses (its the parent of the showStyleVariant) */
	showStyleBaseId: ShowStyleBaseId
	/** The peripheral device the rundown originates from */
	peripheralDeviceId: PeripheralDeviceId
	restoredFromSnapshotId?: RundownId
	created: Time
	modified: Time

	/** Revisions/Versions of various docs that when changed require the user to reimport the rundown */
	importVersions: RundownImportVersions

	status?: string
	// There should be something like a Owner user here somewhere?

	/** Actual time of playback starting */
	startedPlayback?: Time

	/** Is the rundown in an unsynced (has been unpublished from ENPS) state? */
	unsynced?: boolean
	/** Timestamp of when rundown was unsynced */
	unsyncedTime?: Time

	/** Last sent storyStatus to ingestDevice (MOS) */
	notifiedCurrentPlayingPartExternalId?: string

	/** What the source of the data was */
	dataSource: string

	/** Holds notes (warnings / errors) thrown by the blueprints during creation, or appended after */
	notes?: Array<RundownNote>

	/** External id of the Rundown Playlist to put this rundown in */
	playlistExternalId?: string
	/** The id of the Rundown Playlist this rundown is in */
	playlistId: RundownPlaylistId
	/** Rank of the Rundown inside of its Rundown Playlist */
	_rank: number
}
export class Rundown implements DBRundown {
	// From IBlueprintRundown:
	public externalId: string
	public name: string
	public expectedStart?: Time
	public expectedDuration?: number
	public metaData?: {
		[key: string]: any
	}
	// From IBlueprintRundownDB:
	public _id: RundownId
	public showStyleVariantId: ShowStyleVariantId
	// From DBRundown:
	public studioId: StudioId
	public showStyleBaseId: ShowStyleBaseId
	public peripheralDeviceId: PeripheralDeviceId
	public restoredFromSnapshotId?: RundownId
	public created: Time
	public modified: Time
	public importVersions: RundownImportVersions
	public status?: string
	public airStatus?: string
	public unsynced?: boolean
	public unsyncedTime?: Time
	public startedPlayback?: Time
	public notifiedCurrentPlayingPartExternalId?: string
	public dataSource: string
	public notes?: Array<RundownNote>
	public playlistExternalId?: string
	public playlistId: RundownPlaylistId
	public _rank: number
	_: any

	constructor(document: DBRundown) {
		_.each(_.keys(document), (key) => {
			this[key] = document[key]
		})
	}
	getRundownPlaylist(): RundownPlaylist {
		if (!this.playlistId) throw new Meteor.Error(500, 'Rundown is not a part of a rundown playlist!')
		let pls = RundownPlaylists.findOne(this.playlistId)
		if (pls) {
			return pls
		} else throw new Meteor.Error(404, `Rundown Playlist "${this.playlistId}" not found!`)
	}
	getShowStyleCompound(): ShowStyleCompound {
		if (!this.showStyleVariantId) throw new Meteor.Error(500, 'Rundown has no show style attached!')
		let ss = getShowStyleCompound(this.showStyleVariantId)
		if (ss) {
			return ss
		} else throw new Meteor.Error(404, `ShowStyle "${this.showStyleVariantId}" not found!`)
	}
	getShowStyleBase(): ShowStyleBase {
		let showStyleBase = ShowStyleBases.findOne(this.showStyleBaseId)
		if (!showStyleBase) throw new Meteor.Error(404, `ShowStyleBase "${this.showStyleBaseId}" not found!`)
		return showStyleBase
	}
	getStudio(): Studio {
		if (!this.studioId) throw new Meteor.Error(500, 'Rundown is not in a studio!')
		let studio = Studios.findOne(this.studioId)
		if (studio) {
			return studio
		} else throw new Meteor.Error(404, 'Studio "' + this.studioId + '" not found!')
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
	/**
	 * Return ordered lists of all Segments and Parts in the rundown
	 */
	async getSegmentsAndParts(): Promise<{ segments: Segment[]; parts: Part[] }> {
		const pSegments = asyncCollectionFindFetch(
			Segments,
			{
				rundownId: this._id,
			},
			{ sort: { _rank: 1 } }
		)

		const pParts = asyncCollectionFindFetch(
			Parts,
			{
				rundownId: this._id,
			},
			{ sort: { _rank: 1 } }
		)

		const segments = await pSegments
		return {
			segments: segments,
			parts: RundownPlaylist._sortPartsInner(await pParts, segments),
		}
	}
	getGlobalAdLibPieces(selector?: MongoQuery<AdLibPiece>, options?: FindOptions<RundownBaselineAdLibItem>) {
		selector = selector || {}
		options = options || {}
		return RundownBaselineAdLibPieces.find(
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
	getActivePartInstances(selector?: MongoQuery<PartInstance>, options?: FindOptions<DBPartInstance>) {
		const newSelector = {
			...selector,
			reset: { $ne: true },
		}
		return this.getAllPartInstances(newSelector, options)
	}
	removeTOBEREMOVED() {
		if (!Meteor.isServer) throw new Meteor.Error('The "remove" method is available server-side only (sorry)')
		Rundowns.remove(this._id)
		if (this.playlistId) {
			// Check if any other members of the playlist are left
			if (
				Rundowns.find({
					playlistId: this.playlistId,
				}).count() === 0
			) {
				RundownPlaylists.remove(this.playlistId)
			}
		}
		Segments.remove({ rundownId: this._id })
		Parts.remove({ rundownId: this._id })
		PartInstances.remove({ rundownId: this._id })
		Pieces.remove({ rundownId: this._id })
		PieceInstances.remove({ rundownId: this._id })
		AdLibPieces.remove({ rundownId: this._id })
		AdLibActions.remove({ rundownId: this._id })
		RundownBaselineObjs.remove({ rundownId: this._id })
		RundownBaselineAdLibPieces.remove({ rundownId: this._id })
		RundownBaselineAdLibActions.remove({ rundownId: this._id })
		IngestDataCache.remove({ rundownId: this._id })
		ExpectedMediaItems.remove({ rundownId: this._id })
		ExpectedPlayoutItems.remove({ rundownId: this._id })
	}
	touch() {
		if (getCurrentTime() - this.modified > 3600 * 1000) {
			const m = getCurrentTime()
			this.modified = m
			Rundowns.update(this._id, { $set: { modified: m } })
		}
	}
	appendNote(note: RundownNote): void {
		Rundowns.update(this._id, {
			$push: {
				notes: note,
			},
		})
	}
}

// export const Rundowns = createMongoCollection<Rundown>('rundowns', {transform: (doc) => applyClassToDocument(Rundown, doc) })
export const Rundowns: TransformedCollection<Rundown, DBRundown> = createMongoCollection<Rundown>('rundowns', {
	transform: (doc) => applyClassToDocument(Rundown, doc),
})
registerCollection('Rundowns', Rundowns)
Meteor.startup(() => {
	if (Meteor.isServer) {
		Rundowns._ensureIndex({
			playlistId: 1,
		})
		Rundowns._ensureIndex({
			playlistExternalId: 1,
		})
	}
})
