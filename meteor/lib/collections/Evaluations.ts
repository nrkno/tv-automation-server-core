import { UserId } from '../typings/meteor'
import { Time, registerCollection, ProtectedString } from '../lib'
import { createMongoCollection } from './lib'
import { StudioId } from './Studios'
import { RundownPlaylistId } from './RundownPlaylists'
import { SnapshotId } from './Snapshots'
import { OrganizationId } from './Organization'
import { registerIndex } from '../database'

/** A string, identifying a Evaluation */
export type EvaluationId = ProtectedString<'EvaluationId'>

export interface Evaluation extends EvaluationBase {
	_id: EvaluationId
	organizationId: OrganizationId | null
	userId: UserId | null
	timestamp: Time
}
export interface EvaluationBase {
	studioId: StudioId
	playlistId: RundownPlaylistId
	answers: {
		[key: string]: string
	}
	snapshots?: Array<SnapshotId>
}

export const Evaluations = createMongoCollection<Evaluation, Evaluation>('evaluations')
registerCollection('Evaluations', Evaluations)

registerIndex(Evaluations, {
	organizationId: 1,
	timestamp: 1,
})
