import { Meteor } from 'meteor/meteor'
import '../../../../__mocks__/_extendJest'
import { testInFiber } from '../../../../__mocks__/helpers/jest'
import { setupDefaultStudioEnvironment, DefaultEnvironment } from '../../../../__mocks__/helpers/database'
import { getRandomId } from '../../../../lib/lib'
import { ClientAPI } from '../../../../lib/api/client'
import { Bucket, BucketId, Buckets } from '../../../../lib/collections/Buckets'
import { BucketAdLibs } from '../../../../lib/collections/BucketAdlibs'
import { PieceLifespan } from '@sofie-automation/blueprints-integration'

require('../../client') // include in order to create the Meteor methods needed
require('../../userActions') // include in order to create the Meteor methods needed

namespace UserActionAPI {
	// Using our own method definition, to catch external API changes
	export enum methods {
		'bucketAdlibImport' = 'userAction.bucketAdlibImport',
		'bucketAdlibStart' = 'userAction.bucketAdlibStart',

		'bucketsCreateNewBucket' = 'userAction.createBucket',
		'bucketsRemoveBucket' = 'userAction.removeBucket',
		'bucketsEmptyBucket' = 'userAction.emptyBucket',
		'bucketsModifyBucket' = 'userAction.modifyBucket',
		'bucketsRemoveBucketAdLib' = 'userAction.removeBucketAdLib',
		'bucketsModifyBucketAdLib' = 'userAction.bucketsModifyBucketAdLib',
	}
}

describe('User Actions - Buckets', () => {
	let env: DefaultEnvironment
	function setUpMockBucket() {
		const bucketId: BucketId = getRandomId()
		const bucket: Bucket = {
			_id: bucketId,
			_rank: 0,
			buttonHeightScale: 1,
			buttonWidthScale: 1,
			name: 'Mock Bucket',
			studioId: env.studio._id,
			userId: null,
			width: 0.3,
		}
		Buckets.insert(bucket)

		for (let i = 0; i < 3; i++) {
			BucketAdLibs.insert({
				_id: getRandomId(),
				_rank: 0,
				bucketId: bucketId,
				externalId: `FAKE_EXTERNAL_ID_${i}`,
				importVersions: {
					blueprint: '',
					core: '',
					showStyleBase: '',
					showStyleVariant: '',
					studio: '',
				},
				name: `Mock Bucket AdLib ${i}`,
				outputLayerId: env.showStyleBase.outputLayers[0]._id,
				showStyleVariantId: env.showStyleVariantId,
				sourceLayerId: env.showStyleBase.sourceLayers[0]._id,
				studioId: env.studio._id,
				lifespan: PieceLifespan.WithinPart,
				content: {
					timelineObjects: [],
				},
			})
		}

		return {
			bucketId,
			bucket,
			bucketAdlibs: BucketAdLibs.find({
				bucketId: bucketId,
			}).fetch(),
		}
	}
	beforeEach(async () => {
		env = await setupDefaultStudioEnvironment()
		jest.resetAllMocks()
	})
	testInFiber('createBucket', () => {
		const NAME = 'Test bucket'

		{
			// should fail if the studio doesn't exist
			expect(() => {
				Meteor.call(
					UserActionAPI.methods.bucketsCreateNewBucket,
					'',
					NAME,
					'FAKE_ID',
					null
				) as ClientAPI.ClientResponseSuccess<Bucket>
			}).toThrowError(/studio .* not found/gi)
		}

		{
			// should create a bucket
			const result = Meteor.call(
				UserActionAPI.methods.bucketsCreateNewBucket,
				'',
				NAME,
				env.studio._id,
				null
			) as ClientAPI.ClientResponseSuccess<Bucket>
			expect(result).toMatchObject({ success: 200 })
			expect(result.result?.name).toBe(NAME)

			expect(Buckets.findOne(result.result?._id)).toMatchObject({
				_id: result.result?._id,
				name: NAME,
				studioId: env.studio._id,
				userId: null,
			})
		}
	})
	testInFiber('removeBucket', () => {
		const { bucketId } = setUpMockBucket()

		expect(
			BucketAdLibs.find({
				bucketId,
			}).fetch().length
		).toBeGreaterThan(0)

		{
			// should fail if the ID doesn't exist
			expect(() => {
				Meteor.call(UserActionAPI.methods.bucketsRemoveBucket, '', 'FAKE_ID')
			}).toThrowError(/not found/gi)
		}

		{
			// should delete the bucket
			const result = Meteor.call(UserActionAPI.methods.bucketsRemoveBucket, '', bucketId)
			expect(result).toMatchObject({ success: 200 })

			expect(Buckets.findOne(bucketId)).toBeUndefined()
			expect(
				BucketAdLibs.find({
					bucketId,
				}).fetch()
			).toHaveLength(0)
		}
	})
	testInFiber('modifyBucket', () => {
		const { bucketId } = setUpMockBucket()

		{
			// should throw if the bucket doesn't exist
			expect(() => {
				Meteor.call(UserActionAPI.methods.bucketsModifyBucket, '', 'FAKE_ID', {
					name: 'New Name',
				})
			}).toThrowError(/not found/gi)
		}

		{
			// should rename the bucket
			const newName = 'New Name'
			const result = Meteor.call(UserActionAPI.methods.bucketsModifyBucket, '', bucketId, {
				name: newName,
			})

			expect(result).toMatchObject({ success: 200 })

			expect(Buckets.findOne(bucketId)).toMatchObject({
				_id: bucketId,
				name: newName,
				studioId: env.studio._id,
			})
		}
	})
	testInFiber('emptyBucket', () => {
		const { bucketId } = setUpMockBucket()

		{
			// should throw if the bucket doesn't exist
			expect(() => {
				Meteor.call(UserActionAPI.methods.bucketsEmptyBucket, '', 'FAKE_ID')
			}).toThrowError(/not found/gi)
		}

		{
			// should remove all adlibs
			const result = Meteor.call(UserActionAPI.methods.bucketsEmptyBucket, '', bucketId)

			expect(result).toMatchObject({ success: 200 })

			expect(
				BucketAdLibs.find({
					bucketId,
				}).fetch()
			).toHaveLength(0)
		}
	})
	testInFiber('removeBucketAdLib', () => {
		const { bucketAdlibs } = setUpMockBucket()

		{
			// should throw if the adlib doesn't exits
			expect(() => {
				Meteor.call(UserActionAPI.methods.bucketsRemoveBucketAdLib, '', 'FAKE_ID')
			}).toThrowError(/not found/gi)
		}

		{
			// should delete adlib
			const result = Meteor.call(UserActionAPI.methods.bucketsRemoveBucketAdLib, '', bucketAdlibs[0]._id)

			expect(result).toMatchObject({ success: 200 })

			expect(BucketAdLibs.findOne(bucketAdlibs[0]._id)).toBeUndefined()
		}
	})
	testInFiber('modifyBucketAdLib', () => {
		const { bucketAdlibs } = setUpMockBucket()

		{
			// check that the adlib exists
			expect(() => {
				Meteor.call(UserActionAPI.methods.bucketsModifyBucketAdLib, '', 'FAKE_ID', {
					_rank: 5,
				})
			}).toThrowError(/not found/gi)
		}

		{
			// check that the new show style variant exists
			expect(() => {
				Meteor.call(UserActionAPI.methods.bucketsModifyBucketAdLib, '', bucketAdlibs[0]._id, {
					showStyleVariantId: 'FAKE_ID',
				})
			}).toThrowError(/not find/gi)
		}

		{
			// check tghat the new bucket exists
			expect(() => {
				Meteor.call(UserActionAPI.methods.bucketsModifyBucketAdLib, '', bucketAdlibs[0]._id, {
					bucketId: 'FAKE_ID',
				})
			}).toThrowError(/not find/gi)
		}

		{
			// check that the new studio exists
			expect(() => {
				Meteor.call(UserActionAPI.methods.bucketsModifyBucketAdLib, '', bucketAdlibs[0]._id, {
					studioId: 'FAKE_ID',
				})
			}).toThrowError(/not find/gi)
		}

		{
			// change the rank, should work
			const result = Meteor.call(UserActionAPI.methods.bucketsModifyBucketAdLib, '', bucketAdlibs[0]._id, {
				_rank: 5,
			})

			expect(result).toMatchObject({ success: 200 })

			expect(BucketAdLibs.findOne(bucketAdlibs[0]._id)).toMatchObject({
				_id: bucketAdlibs[0]._id,
				_rank: 5,
			})
		}
	})
})
