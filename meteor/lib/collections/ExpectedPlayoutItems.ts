import { registerCollection, ProtectedString } from '../lib'
import { createMongoCollection } from './lib'
import { ExpectedPlayoutItemGeneric } from '@sofie-automation/blueprints-integration'
import { StudioId } from './Studios'
import { RundownId } from './Rundowns'
import { PartId } from './Parts'
import { registerIndex } from '../database'

/** A string, identifying a Rundown
 * @deprecated
 */
export type ExpectedPlayoutItemId = ProtectedString<'ExpectedPlayoutItemId'>
/** @deprecated */
export interface ExpectedPlayoutItemBase extends ExpectedPlayoutItemGeneric {
	/** Globally unique id of the item */
	_id: ExpectedPlayoutItemId

	/** The studio installation this ExpectedPlayoutItem was generated in */
	studioId: StudioId
}
/** @deprecated */
export interface ExpectedPlayoutItemRundown extends ExpectedPlayoutItemBase {
	/** The rundown id that is the source of this PlayoutItem */
	rundownId: RundownId
	/** The part id that is the source of this Playout Item */
	partId?: PartId
	// /** The piece id that is the source of this Playout Item */
	// pieceId: PieceId
	/** Is created for studio/rundown baseline */
	baseline?: 'rundown'
}
/** @deprecated */
export interface ExpectedPlayoutItemStudio extends ExpectedPlayoutItemBase {
	baseline: 'studio'
}
/** @deprecated */
export type ExpectedPlayoutItem = ExpectedPlayoutItemStudio | ExpectedPlayoutItemRundown

/** @deprecated */
export const ExpectedPlayoutItems = createMongoCollection<ExpectedPlayoutItem, ExpectedPlayoutItem>(
	'expectedPlayoutItems'
)
registerCollection('ExpectedPlayoutItems', ExpectedPlayoutItems)

registerIndex(ExpectedPlayoutItems, {
	studioId: 1,
})
registerIndex(ExpectedPlayoutItems, {
	rundownId: 1,
})
registerIndex(ExpectedPlayoutItems, {
	studioId: 1,
	baseline: 1,
})
