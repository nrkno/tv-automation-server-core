import * as _ from 'underscore'
import { TransformedCollection, FindOptions, MongoQuery } from '../typings/meteor'
import { Rundowns, RundownId } from './Rundowns'
import { Piece, Pieces } from './Pieces'
import { AdLibPieces, AdLibPiece } from './AdLibPieces'
import { Segments, SegmentId } from './Segments'
import {
	applyClassToDocument,
	registerCollection,
	normalizeArray,
	ProtectedString,
	ProtectedStringProperties,
} from '../lib'
import { RundownAPI } from '../api/rundown'
import { checkPieceContentStatus, getNoteTypeForPieceStatus } from '../mediaObjects'
import { IBlueprintPartDB, PartHoldMode } from '@sofie-automation/blueprints-integration'
import { PartNote, NoteType } from '../api/notes'
import { createMongoCollection } from './lib'
import { Studio } from './Studios'
import { ShowStyleBase } from './ShowStyleBases'
import { registerIndex } from '../database'

/** A string, identifying a Part */
export type PartId = ProtectedString<'PartId'>

/** A "Line" in NRK Lingo. */
export interface DBPart
	extends ProtectedStringProperties<IBlueprintPartDB, '_id' | 'segmentId' | 'dynamicallyInsertedAfterPartId'> {
	_id: PartId
	/** Position inside the segment */
	_rank: number

	/** The rundown this line belongs to */
	rundownId: RundownId
	segmentId: SegmentId

	status?: string

	/** Holds notes (warnings / errors) thrown by the blueprints during creation */
	notes?: Array<PartNote>
	/** if the part is inserted after another (for adlibbing) */
	dynamicallyInsertedAfterPartId?: PartId

	/** Human readable unqiue identifier of the part */
	identifier?: string
}

export class Part implements DBPart {
	// From IBlueprintPart:
	public externalId: string
	public title: string
	public metaData?: {
		[key: string]: any
	}
	public autoNext?: boolean
	public autoNextOverlap?: number
	public prerollDuration?: number
	public transitionPrerollDuration?: number | null
	public transitionKeepaliveDuration?: number | null
	public transitionDuration?: number | null
	public disableOutTransition?: boolean
	public expectedDuration?: number
	public holdMode?: PartHoldMode
	public shouldNotifyCurrentPlayingPart?: boolean
	public classes?: string[]
	public classesForNext?: string[]
	public displayDurationGroup?: string
	public displayDuration?: number
	public invalid?: boolean
	public invalidReason?: {
		title: string
		description?: string
		color?: string
	}
	public floated?: boolean
	public gap?: boolean
	// From IBlueprintPartDB:
	public _id: PartId
	public segmentId: SegmentId
	// From DBPart:
	public _rank: number
	public rundownId: RundownId
	public status?: string
	public notes?: Array<PartNote>
	public dynamicallyInsertedAfterPartId?: PartId
	public identifier?: string

	constructor(document: DBPart) {
		for (let [key, value] of Object.entries(document)) {
			this[key] = value
		}
	}
	getRundown() {
		return Rundowns.findOne(this.rundownId)
	}
	getSegment() {
		return Segments.findOne(this.segmentId)
	}
	getPieces(selector?: MongoQuery<Piece>, options?: FindOptions<Piece>) {
		selector = selector || {}
		options = options || {}
		return Pieces.find(
			{
				startRundownId: this.rundownId,
				startPartId: this._id,
				...selector,
			},
			{
				...options,
			}
		).fetch()
	}
	getAllPieces() {
		return this.getPieces()
	}

	getAdLibPieces(selector?: MongoQuery<AdLibPiece>, options?: FindOptions<AdLibPiece>) {
		selector = selector || {}
		options = options || {}
		return AdLibPieces.find(
			{
				rundownId: this.rundownId,
				partId: this._id,
				...selector,
			},
			{
				...options,
				sort: { _rank: 1, name: 1, ...options?.sort },
			}
		).fetch()
	}
	getAllAdLibPieces() {
		return this.getAdLibPieces()
	}
	getInvalidReasonNotes(): Array<PartNote> {
		return this.invalidReason
			? [
					{
						type: NoteType.ERROR,
						message:
							this.invalidReason.title +
							(this.invalidReason.description ? ': ' + this.invalidReason.description : ''),
						origin: {
							name: this.title,
						},
					},
			  ]
			: []
	}
	getMinimumReactiveNotes(studio: Studio, showStyleBase: ShowStyleBase): Array<PartNote> {
		let notes: Array<PartNote> = []
		notes = notes.concat(this.notes || [])

		const pieces = this.getPieces()
		const partLookup = showStyleBase && normalizeArray(showStyleBase.sourceLayers, '_id')
		for (let i = 0; i < pieces.length; i++) {
			const piece = pieces[i]
			// TODO: check statuses (like media availability) here

			if (partLookup && piece.sourceLayerId && partLookup[piece.sourceLayerId]) {
				const part = partLookup[piece.sourceLayerId]
				const st = checkPieceContentStatus(piece, part, studio ? studio.settings : undefined)
				if (st.status !== RundownAPI.PieceStatusCode.OK && st.status !== RundownAPI.PieceStatusCode.UNKNOWN) {
					notes.push({
						type: getNoteTypeForPieceStatus(st.status) || NoteType.WARNING,
						origin: {
							name: 'Media Check',
							pieceId: piece._id,
						},
						message: st.message || '',
					})
				}
			}
		}
		return notes
	}
	isPlayable() {
		return isPartPlayable(this)
	}
}

export function isPartPlayable(part: DBPart) {
	return !part.invalid && !part.floated
}

export const Parts: TransformedCollection<Part, DBPart> = createMongoCollection<Part>('parts', {
	transform: (doc) => applyClassToDocument(Part, doc),
})
registerCollection('Parts', Parts)

registerIndex(Parts, {
	rundownId: 1,
	segmentId: 1,
	_rank: 1,
})
registerIndex(Parts, {
	rundownId: 1,
	_rank: 1,
})

export const q1: MongoQuery<Part> = {
	_rank: 9,
}

export const q2: MongoQuery<DBPart> = {
	_rank: 9,
}
