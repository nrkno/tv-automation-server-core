import { RundownAPI } from '../api/rundown'
import { PartId } from './Parts'
import { registerCollection, ProtectedString } from '../lib'
import { IBlueprintPieceGeneric, IBlueprintPieceDB } from '@sofie-automation/blueprints-integration'
import { createMongoCollection } from './lib'
import { RundownId } from './Rundowns'
import { SegmentId } from './Segments'
import { registerIndex } from '../database'

/** A string, identifying a Piece */
export type PieceId = ProtectedString<'PieceId'>

/** A Single item in a Part: script, VT, cameras */
export interface PieceGeneric extends IBlueprintPieceGeneric {
	_id: PieceId // TODO - this should be moved to the implementation types

	/** Playback availability status */
	status: RundownAPI.PieceStatusCode
	/** A flag to signal that a given Piece has no content, and exists only as a marker on the timeline */
	virtual?: boolean
	/** The id of the piece this piece is a continuation of. If it is a continuation, the inTranstion must not be set, and enable.start must be 0 */
	continuesRefId?: PieceId
}

export interface Piece extends PieceGeneric, Omit<IBlueprintPieceDB, '_id' | 'continuesRefId'> {
	/**
	 * This is the id of the rundown this piece starts playing in.
	 * Currently this is the only rundown the piece could be playing in
	 */
	startRundownId: RundownId
	/**
	 * This is the id of the segment this piece starts playing in.
	 * It is the only segment the piece could be playing in, unless the piece has a lifespan which spans beyond the segment
	 */
	startSegmentId: SegmentId
	/**
	 * This is the id of the part this piece starts playing in.
	 * If the lifespan is WithinPart, it is the only part the piece could be playing in.
	 */
	startPartId: PartId

	/** This is set when the part is invalid and these pieces should be ignored */
	invalid: boolean
}

export const Pieces = createMongoCollection<Piece, Piece>('pieces')
registerCollection('Pieces', Pieces)

registerIndex(Pieces, {
	startRundownId: 1,
	startSegmentId: 1,
	startPartId: 1,
})
