import { AdLibActionCommon } from './AdLibActions'
import { registerCollection, ProtectedString } from '../lib'
import { createMongoCollection } from './lib'
import { registerIndex } from '../database'

/** A string, identifying an RundownBaselineAdLibActionId */
export type RundownBaselineAdLibActionId = ProtectedString<'RundownBaselineAdLibActionId'>

export interface RundownBaselineAdLibAction extends AdLibActionCommon {
	_id: RundownBaselineAdLibActionId
}

export const RundownBaselineAdLibActions = createMongoCollection<
	RundownBaselineAdLibAction,
	RundownBaselineAdLibAction
>('rundownBaselineAdLibActions')
registerCollection('RundownBaselineAdLibActions', RundownBaselineAdLibActions)
registerIndex(RundownBaselineAdLibActions, {
	rundownId: 1,
})
