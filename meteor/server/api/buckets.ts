import * as _ from 'underscore'
import { Meteor } from 'meteor/meteor'
import { Buckets, Bucket, BucketId } from '../../lib/collections/Buckets'
import { getRandomId, literal } from '../../lib/lib'
import { BucketSecurity } from '../security/buckets'
import { BucketAdLibs, BucketAdLib } from '../../lib/collections/BucketAdlibs'
import { ExpectedMediaItems } from '../../lib/collections/ExpectedMediaItems'
import { PieceId } from '../../lib/collections/Pieces'
import { StudioId, Studios } from '../../lib/collections/Studios'
import { ShowStyleVariants } from '../../lib/collections/ShowStyleVariants'
import { MethodContext } from '../../lib/api/methods'
import { OrganizationContentWriteAccess } from '../security/organization'
import { AdLibActionId, AdLibAction, AdLibActionCommon } from '../../lib/collections/AdLibActions'
import { BucketAdLibActions, BucketAdLibAction } from '../../lib/collections/BucketAdlibActions'
import { Rundowns } from '../../lib/collections/Rundowns'
import { pushWorkToQueue } from '../codeControl'
import {
	cleanUpExpectedMediaItemForBucketAdLibActions,
	cleanUpExpectedMediaItemForBucketAdLibPiece,
	updateExpectedMediaItemForBucketAdLibAction,
	updateExpectedMediaItemForBucketAdLibPiece,
} from './ingest/expectedMediaItems'
import { getShowStyleCompoundForRundown } from './showStyles'
import {
	cleanUpExpectedPackagesForBucketAdLibs,
	cleanUpExpectedPackagesForBucketAdLibsActions,
	updateExpectedPackagesForBucketAdLib,
	updateExpectedPackagesForBucketAdLibAction,
} from './ingest/expectedPackages'

const DEFAULT_BUCKET_WIDTH = undefined

function isBucketAdLibAction(action: AdLibActionCommon | BucketAdLibAction): action is BucketAdLibAction {
	if (action['showStyleVariantId'] && action['studioId']) {
		return true
	}
	return false
}

export async function bucketSyncFunction<T>(bucketId: BucketId, context: string, fcn: () => Promise<T>): Promise<T> {
	return pushWorkToQueue(`bucket_${bucketId}`, context, async () => fcn())
}

export namespace BucketsAPI {
	export async function removeBucketAdLib(context: MethodContext, id: PieceId): Promise<void> {
		BucketSecurity.allowWriteAccessPiece({ _id: id }, context)

		const adlib = await BucketAdLibs.findOneAsync(id)
		if (!adlib) throw new Meteor.Error(404, `Bucket Ad-Lib not found: ${id}`)

		if (!BucketSecurity.allowWriteAccess({ _id: adlib.bucketId }, context))
			throw new Meteor.Error(403, `Not allowed to edit bucket: ${adlib.bucketId}`)

		await bucketSyncFunction(adlib.bucketId, 'removeBucketAdLib', async () => {
			await Promise.all([
				BucketAdLibs.removeAsync({ _id: id }),
				cleanUpExpectedMediaItemForBucketAdLibPiece([id]),
				cleanUpExpectedPackagesForBucketAdLibs([id]),
			])
		})
	}

	export async function removeBucketAdLibAction(context: MethodContext, id: AdLibActionId): Promise<void> {
		BucketSecurity.allowWriteAccessAction({ _id: id }, context)

		const adlib = await BucketAdLibActions.findOneAsync(id)
		if (!adlib) throw new Meteor.Error(404, `Bucket Ad-Lib not found: ${id}`)

		if (!BucketSecurity.allowWriteAccess({ _id: adlib.bucketId }, context))
			throw new Meteor.Error(403, `Not allowed to edit bucket: ${adlib.bucketId}`)

		await bucketSyncFunction(adlib.bucketId, 'removeBucketAdLibAction', async () => {
			await Promise.all([
				BucketAdLibActions.removeAsync({ _id: id }),
				cleanUpExpectedMediaItemForBucketAdLibActions([id]),
				cleanUpExpectedPackagesForBucketAdLibsActions([id]),
			])
		})
	}

	export async function modifyBucket(
		context: MethodContext,
		id: BucketId,
		bucket: Partial<Omit<Bucket, '_id'>>
	): Promise<void> {
		if (!BucketSecurity.allowWriteAccess({ _id: id }, context))
			throw new Meteor.Error(403, `Not allowed to edit bucket: ${id}`)

		const oldBucket = await Buckets.findOneAsync(id)
		if (!oldBucket) throw new Meteor.Error(404, `Bucket not found: ${id}`)

		await bucketSyncFunction(id, 'modifyBucket', async () => {
			await Buckets.updateAsync(id, {
				$set: _.omit(bucket, ['_id']),
			})
		})
	}

	export async function emptyBucket(context: MethodContext, id: BucketId): Promise<void> {
		if (!BucketSecurity.allowWriteAccess({ _id: id }, context))
			throw new Meteor.Error(403, `Not allowed to edit bucket: ${id}`)

		const bucket = await Buckets.findOneAsync(id)
		if (!bucket) throw new Meteor.Error(404, `Bucket not found: ${id}`)

		await bucketSyncFunction(id, 'emptyBucket', async () => {
			await emptyBucketInner(id)
		})
	}

	async function emptyBucketInner(id: BucketId): Promise<void> {
		await Promise.all([
			BucketAdLibs.removeAsync({ bucketId: id }),
			BucketAdLibActions.removeAsync({ bucketId: id }),
			ExpectedMediaItems.removeAsync({ bucketId: id }),
			// TODO - remove packages?
		])
	}

	export async function createNewBucket(
		context: MethodContext,
		name: string,
		studioId: StudioId,
		userId: string | null
	): Promise<Bucket> {
		const { studio } = OrganizationContentWriteAccess.studio(context, studioId)
		if (!studio) throw new Meteor.Error(404, `Studio not found: ${studioId}`)

		const heaviestBucket = (
			await Buckets.findFetchAsync(
				{
					studioId,
				},
				{
					sort: {
						_rank: 1,
					},
					fields: {
						_rank: 1,
					},
				}
			)
		).reverse()[0]

		let rank = 1
		if (heaviestBucket) {
			rank = heaviestBucket._rank + 1
		}

		const newBucket = literal<Bucket>({
			_id: getRandomId(),
			_rank: rank,
			name: name,
			studioId,
			userId,
			width: DEFAULT_BUCKET_WIDTH,
			buttonWidthScale: 1,
			buttonHeightScale: 1,
		})

		await Buckets.insertAsync(newBucket)

		return newBucket
	}

	export async function modifyBucketAdLibAction(
		context: MethodContext,
		id: AdLibActionId,
		action: Partial<Omit<BucketAdLibAction, '_id'>>
	): Promise<void> {
		if (!BucketSecurity.allowWriteAccessAction({ _id: id }, context))
			throw new Meteor.Error(403, `Not allowed to edit bucket adlib: ${id}`)

		const oldAdLib = await BucketAdLibActions.findOneAsync(id)
		if (!oldAdLib) {
			throw new Meteor.Error(404, `Bucket AdLib not found: ${id}`)
		}

		if (!BucketSecurity.allowWriteAccess({ _id: oldAdLib.bucketId }, context)) {
			throw new Meteor.Error(403, 'Access denied')
		}
		if (action.bucketId && !BucketSecurity.allowWriteAccess({ _id: action.bucketId }, context)) {
			throw new Meteor.Error(403, 'Access denied')
		}

		await bucketSyncFunction(action.bucketId ?? oldAdLib.bucketId, 'modifyBucketAdLib', async () => {
			if (action.bucketId && !(await Buckets.findOneAsync(action.bucketId))) {
				throw new Meteor.Error(`Could not find bucket: "${action.bucketId}"`)
			}

			if (action.showStyleVariantId && !(await ShowStyleVariants.findOneAsync(action.showStyleVariantId))) {
				throw new Meteor.Error(`Could not find show style variant: "${action.showStyleVariantId}"`)
			}

			if (action.studioId && !(await Studios.findOneAsync(action.studioId))) {
				throw new Meteor.Error(`Could not find studio: "${action.studioId}"`)
			}

			await BucketAdLibActions.updateAsync(id, {
				$set: _.omit(action, ['_id']),
			})
			await Promise.all([
				updateExpectedMediaItemForBucketAdLibAction(id),
				updateExpectedPackagesForBucketAdLibAction(id),
			])
		})
	}

	export async function saveAdLibActionIntoBucket(
		context: MethodContext,
		studioId: StudioId,
		action: AdLibActionCommon | BucketAdLibAction,
		bucketId: BucketId
	): Promise<BucketAdLibAction> {
		if (bucketId && !BucketSecurity.allowWriteAccess({ _id: bucketId }, context)) {
			throw new Meteor.Error(403, 'Access denied')
		}

		let adLibAction: BucketAdLibAction
		if (isBucketAdLibAction(action)) {
			if (action.showStyleVariantId && !(await ShowStyleVariants.findOneAsync(action.showStyleVariantId))) {
				throw new Meteor.Error(`Could not find show style variant: "${action.showStyleVariantId}"`)
			}

			const studio = await Studios.findOneAsync(studioId)
			if (!studio) {
				throw new Meteor.Error(`Could not find studio: "${studioId}"`)
			}

			if (studio._id !== action.studioId) {
				throw new Meteor.Error(
					`studioId is different than Action's studioId: "${studioId}" - "${action.studioId}"`
				)
			}

			adLibAction = {
				...action,
				_id: getRandomId(),
				bucketId: bucketId,
			}
		} else {
			const rundown = await Rundowns.findOneAsync(action.rundownId)
			if (!rundown) {
				throw new Meteor.Error(`Could not find rundown: "${action.rundownId}"`)
			}

			if (rundown.showStyleVariantId && !(await ShowStyleVariants.findOneAsync(rundown.showStyleVariantId))) {
				throw new Meteor.Error(`Could not find show style variant: "${rundown.showStyleVariantId}"`)
			}

			const studio = await Studios.findOneAsync(studioId)
			if (!studio) {
				throw new Meteor.Error(`Could not find studio: "${studioId}"`)
			}

			if (studio._id !== rundown.studioId) {
				throw new Meteor.Error(
					`studioId is different than Rundown's studioId: "${studioId}" - "${rundown.studioId}"`
				)
			}

			const showStyleCompound = await getShowStyleCompoundForRundown(rundown)
			if (!showStyleCompound)
				throw new Meteor.Error(404, `ShowStyle Variant "${rundown.showStyleVariantId}" not found`)

			if (studio.supportedShowStyleBase.indexOf(showStyleCompound._id) === -1) {
				throw new Meteor.Error(
					500,
					`ShowStyle Variant "${rundown.showStyleVariantId}" not supported by studio "${studioId}"`
				)
			}

			adLibAction = {
				...(_.omit(action, ['partId', 'rundownId']) as Omit<AdLibAction, 'partId' | 'rundownId'>),
				_id: getRandomId(),
				externalId: '', // TODO - is this ok?
				bucketId: bucketId,
				studioId: studioId,
				showStyleVariantId: rundown.showStyleVariantId,
				importVersions: rundown.importVersions,
			}
		}

		await bucketSyncFunction(adLibAction.bucketId, 'saveAdLibActionIntoBucket', async () => {
			await BucketAdLibActions.insertAsync(adLibAction)
			await Promise.all([
				updateExpectedMediaItemForBucketAdLibAction(adLibAction._id),
				updateExpectedPackagesForBucketAdLibAction(adLibAction._id),
			])
		})

		return adLibAction
	}

	export async function modifyBucketAdLib(
		context: MethodContext,
		id: PieceId,
		adlib: Partial<Omit<BucketAdLib, '_id'>>
	): Promise<void> {
		if (!BucketSecurity.allowWriteAccessPiece({ _id: id }, context))
			throw new Meteor.Error(403, `Not allowed to edit bucket adlib: ${id}`)

		const oldAdLib = await BucketAdLibs.findOneAsync(id)
		if (!oldAdLib) {
			throw new Meteor.Error(404, `Bucket AdLib not found: ${id}`)
		}

		if (!BucketSecurity.allowWriteAccess({ _id: oldAdLib.bucketId }, context)) {
			throw new Meteor.Error(403, 'Access denied')
		}
		if (adlib.bucketId && !BucketSecurity.allowWriteAccess({ _id: adlib.bucketId }, context)) {
			throw new Meteor.Error(403, 'Access denied')
		}

		await bucketSyncFunction(adlib.bucketId ?? oldAdLib.bucketId, 'modifyBucketAdLib', async () => {
			if (adlib.bucketId && !(await Buckets.findOneAsync(adlib.bucketId))) {
				throw new Meteor.Error(`Could not find bucket: "${adlib.bucketId}"`)
			}

			if (adlib.showStyleVariantId && !(await ShowStyleVariants.findOneAsync(adlib.showStyleVariantId))) {
				throw new Meteor.Error(`Could not find show style variant: "${adlib.showStyleVariantId}"`)
			}

			if (adlib.studioId && !(await Studios.findOneAsync(adlib.studioId))) {
				throw new Meteor.Error(`Could not find studio: "${adlib.studioId}"`)
			}

			await BucketAdLibs.updateAsync(id, {
				$set: _.omit(adlib, ['_id']),
			})
			await Promise.all([
				updateExpectedMediaItemForBucketAdLibPiece(id),
				updateExpectedPackagesForBucketAdLib(id),
			])
		})
	}

	export async function removeBucket(context: MethodContext, id: BucketId): Promise<void> {
		if (!BucketSecurity.allowWriteAccess({ _id: id }, context))
			throw new Meteor.Error(403, `Not allowed to edit bucket: ${id}`)

		const bucket = await Buckets.findOneAsync(id)
		if (!bucket) throw new Meteor.Error(404, `Bucket not found: ${id}`)

		await bucketSyncFunction(id, 'removeBucket', async () => {
			await Promise.all([Buckets.removeAsync(id), emptyBucketInner(id)])
		})
	}
}
