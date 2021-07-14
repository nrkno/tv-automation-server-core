import { Meteor } from 'meteor/meteor'
import { registerCollection, ProtectedString, ProtectedStringProperties } from '../lib'
import { IBlueprintShowStyleBase } from '@sofie-automation/blueprints-integration'
import { ObserveChangesForHash, createMongoCollection } from './lib'
import { BlueprintId } from './Blueprints'
import { OrganizationId } from './Organization'
import { registerIndex } from '../database'

export interface HotkeyDefinition {
	_id: string
	key: string
	label: string
}
/** A string, identifying a ShowStyleBase */
export type ShowStyleBaseId = ProtectedString<'ShowStyleBaseId'>
export interface DBShowStyleBase extends ProtectedStringProperties<IBlueprintShowStyleBase, '_id' | 'blueprintId'> {
	_id: ShowStyleBaseId

	/** Name of this show style */
	name: string
	/** Id of the blueprint used by this show-style */
	blueprintId: BlueprintId
	/** If set, the Organization that owns this ShowStyleBase */
	organizationId: OrganizationId | null

	hotkeyLegend?: Array<HotkeyDefinition>

	_rundownVersionHash: string
}

export type ShowStyleBase = DBShowStyleBase

export const ShowStyleBases = createMongoCollection<ShowStyleBase, DBShowStyleBase>('showStyleBases')
registerCollection('ShowStyleBases', ShowStyleBases)

registerIndex(ShowStyleBases, {
	organizationId: 1,
})

Meteor.startup(() => {
	if (Meteor.isServer) {
		ObserveChangesForHash(ShowStyleBases, '_rundownVersionHash', ['blueprintConfig', 'blueprintId'])
	}
})
