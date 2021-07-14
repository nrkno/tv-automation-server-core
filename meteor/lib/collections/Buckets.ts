import { registerCollection, ProtectedString } from '../lib'
import { createMongoCollection } from './lib'
import { StudioId } from './Studios'
import { registerIndex } from '../database'

export type BucketId = ProtectedString<'BucketId'>

/**
 * A Bucket is an container for AdLib pieces that do not come from a MOS gateway and are
 * free-floating between mutliple rundowns/rundown playlists
 */
export interface Bucket {
	_id: BucketId
	/** A user-presentable name for a bucket */
	name: string
	/** Rank used for sorting buckets */
	_rank: number

	/** The studio this bucket belongs to, */
	studioId: StudioId
	/** Only the owner can delete a bucket from the RundownView UI. Anyone who can see the bucket can add and remove stuff from it. */
	userId: string | null

	/** The default width of the bucket. Can possibly be runtime-modified by the user (stored in localStorage?) */
	width?: number

	/** Scaling factors for the buttons. Quite possibly not settable in the UI at all? */
	buttonWidthScale: number
	buttonHeightScale: number
}
export const Buckets = createMongoCollection<Bucket, Bucket>('buckets')
registerCollection('Buckets', Buckets)

registerIndex(Buckets, {
	studioId: 1,
})
