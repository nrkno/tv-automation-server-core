import { ArrayElement, registerCollection } from '../lib'
import { IBlueprintActionManifest } from '@sofie-automation/blueprints-integration'
import { createMongoCollection } from './lib'
import { RundownImportVersions } from './Rundowns'
import { StudioId } from './Studios'
import { ShowStyleVariantId } from './ShowStyleVariants'
import { BucketId } from './Buckets'
import { registerIndex } from '../database'
import { AdLibActionId } from './AdLibActions'
import { ITranslatableMessage } from '../api/TranslatableMessage'

export type BucketAdLibActionId = AdLibActionId
export interface BucketAdLibAction extends Omit<IBlueprintActionManifest, 'partId'> {
	_id: BucketAdLibActionId
	bucketId: BucketId

	externalId: string

	/**
	 * If an AdLib within the Bucket doesn't match the studioId/showStyleVariantId combination
	 * the adLib will be shown as disabled
	 */
	studioId: StudioId
	showStyleVariantId: ShowStyleVariantId
	importVersions: RundownImportVersions // TODO - is this good?

	/** The following extended interface allows assigning namespace information to the actions as they are stored in the
	 *  database after being emitted from the blueprints
	 */

	// How this AdLib Action should be displayed to the User
	display: IBlueprintActionManifest['display'] & {
		label: ITranslatableMessage
		triggerLabel?: ITranslatableMessage
		description?: ITranslatableMessage
	}
	triggerModes?: (ArrayElement<IBlueprintActionManifest['triggerModes']> & {
		display: ArrayElement<IBlueprintActionManifest['triggerModes']>['display'] & {
			label: ITranslatableMessage
			description?: ITranslatableMessage
		}
	})[]
}

export const BucketAdLibActions = createMongoCollection<BucketAdLibAction, BucketAdLibAction>('bucketAdlibActions')
registerCollection('BucketAdLibActions', BucketAdLibActions)

registerIndex(BucketAdLibActions, {
	bucketId: 1,
	studioId: 1,
})
