import { Meteor } from 'meteor/meteor'
import { IBlueprintShowStyleVariant } from '@sofie-automation/blueprints-integration'
import { registerCollection, ProtectedString, ProtectedStringProperties } from '../lib'
import { ShowStyleBase, ShowStyleBaseId } from './ShowStyleBases'
import { ObserveChangesForHash, createMongoCollection } from './lib'
import { registerIndex } from '../database'

/** A string, identifying a ShowStyleVariant */
export type ShowStyleVariantId = ProtectedString<'ShowStyleVariantId'>

export interface DBShowStyleVariant extends ProtectedStringProperties<IBlueprintShowStyleVariant, '_id'> {
	_id: ShowStyleVariantId
	/** Id of parent ShowStyleBase */
	showStyleBaseId: ShowStyleBaseId

	_rundownVersionHash: string
}

export interface ShowStyleCompound extends ShowStyleBase {
	showStyleVariantId: ShowStyleVariantId
	_rundownVersionHashVariant: string
}

export type ShowStyleVariant = DBShowStyleVariant
export const ShowStyleVariants = createMongoCollection<ShowStyleVariant, DBShowStyleVariant>('showStyleVariants')
registerCollection('ShowStyleVariants', ShowStyleVariants)

registerIndex(ShowStyleVariants, {
	showStyleBaseId: 1,
})

Meteor.startup(() => {
	if (Meteor.isServer) {
		ObserveChangesForHash(ShowStyleVariants, '_rundownVersionHash', ['blueprintConfig', 'showStyleBaseId'])
	}
})
