import * as _ from 'underscore'
import { TransformedCollection } from '../typings/meteor'
import {
	applyClassToDocument,
	Time,
	registerCollection,
	ProtectedString,
	ProtectedStringProperties,
	protectString,
	unprotectString,
	Omit,
} from '../lib'
import { Meteor } from 'meteor/meteor'
import {
	IBlueprintPartInstance,
	BlueprintRuntimeArguments,
	PartEndState,
} from 'tv-automation-sofie-blueprints-integration'
import { createMongoCollection } from './lib'
import { DBPart, Part } from './Parts'
import { PieceInstance, PieceInstances } from './PieceInstances'
import { Pieces } from './Pieces'
import { RundownId } from './Rundowns'
import { SegmentId } from './Segments'
import { CacheForRundownPlaylist } from '../../server/DatabaseCaches'

/** A string, identifying a PartInstance */
export type PartInstanceId = ProtectedString<'PartInstanceId'>
export interface InternalIBlueprintPartInstance
	extends ProtectedStringProperties<Omit<IBlueprintPartInstance, 'part'>, '_id' | 'segmentId'> {
	part: ProtectedStringProperties<IBlueprintPartInstance['part'], '_id' | 'segmentId'>
}
export function unprotectPartInstance(partInstance: PartInstance): IBlueprintPartInstance {
	return partInstance as any
}

export interface DBPartInstance extends InternalIBlueprintPartInstance {
	_id: PartInstanceId
	rundownId: RundownId

	/**
	 * Whether this PartInstance is a scratch instance - the copy of the Part for the instance
	 * is still being made and the piece instances are being created.
	 */
	readonly isScratch?: true

	/** Whether this instance has been finished with and reset (to restore the original part as the primary version) */
	reset?: boolean

	/** Rank of the take that this PartInstance belongs to */
	takeCount: number

	/** Temporarily track whether this PartInstance has been taken, so we can easily find and prune those which are only nexted */
	isTaken?: boolean

	/** If the playlist was in rehearsal mode when the PartInstance was created */
	rehearsal: boolean

	part: DBPart
}

export class PartInstance implements DBPartInstance {
	// Temporary properties (never stored in DB):
	/** Whether this PartInstance is a temprorary wrapping of a Part */
	public readonly isTemporary: boolean

	// From DBPartInstance:
	public readonly isScratch?: true
	public reset?: boolean
	public takeCount: number
	public isTaken?: boolean
	public rehearsal: boolean

	// From IBlueprintPartInstance:
	public part: Part
	public _id: PartInstanceId
	public segmentId: SegmentId
	public rundownId: RundownId

	constructor(document: DBPartInstance, isTemporary?: boolean) {
		_.each(_.keys(document), (key) => {
			this[key] = document[key]
		})
		this.isTemporary = isTemporary === true
		this.part = new Part(document.part)
	}
}

export function wrapPartToTemporaryInstance(part: DBPart): PartInstance {
	return new PartInstance(
		{
			_id: protectString(`${part._id}_tmp_instance`),
			rundownId: part.rundownId,
			segmentId: part.segmentId,
			takeCount: -1,
			rehearsal: false,
			part: new Part(part),
		},
		true
	)
}

export function findPartInstanceOrWrapToTemporary(
	partInstances: { [partId: string]: PartInstance | undefined },
	part: DBPart
): PartInstance {
	return partInstances[unprotectString(part._id)] || wrapPartToTemporaryInstance(part)
}

export const PartInstances: TransformedCollection<PartInstance, DBPartInstance> = createMongoCollection<PartInstance>(
	'partInstances',
	{ transform: (doc) => applyClassToDocument(PartInstance, doc) }
)
registerCollection('PartInstances', PartInstances)
Meteor.startup(() => {
	if (Meteor.isServer) {
		PartInstances._ensureIndex({
			rundownId: 1,
			segmentId: 1,
			takeCount: 1,
		})
		PartInstances._ensureIndex({
			rundownId: 1,
			takeCount: 1,
		})
		PartInstances._ensureIndex({
			rundownId: 1,
			partId: 1,
			takeCount: 1,
		})
	}
})
