import { registerCollection, ProtectedString } from '../lib'
import { TimelineObjGeneric } from './Timeline'
import { createMongoCollection } from './lib'
import { RundownId } from './Rundowns'
import { registerIndex } from '../database'

/** A string, identifying a RundownBaselineObj */
export type RundownBaselineObjId = ProtectedString<'RundownBaselineObjId'>

export interface RundownBaselineObj {
	_id: RundownBaselineObjId
	/** The rundown this timeline-object belongs to */
	rundownId: RundownId

	objects: TimelineObjGeneric[]
}

export const RundownBaselineObjs = createMongoCollection<RundownBaselineObj, RundownBaselineObj>('rundownBaselineObjs')
registerCollection('RundownBaselineObjs', RundownBaselineObjs)
registerIndex(RundownBaselineObjs, {
	rundownId: 1,
})
