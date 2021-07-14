import { Buckets, BucketId } from '../../lib/collections/Buckets'
import { MongoQuery } from '../../lib/typings/meteor'
import { Credentials, ResolvedCredentials } from './lib/credentials'
import { triggerWriteAccess } from './lib/securityVerify'
import { PieceId } from '../../lib/collections/Pieces'
import { Settings } from '../../lib/Settings'
import { check } from '../../lib/check'
import { Meteor } from 'meteor/meteor'
import { StudioReadAccess, StudioContentWriteAccess } from './studio'
import { BucketAdLibs } from '../../lib/collections/BucketAdlibs'
import { BucketAdLibActions } from '../../lib/collections/BucketAdlibActions'
import { AdLibActionId } from '../../lib/collections/AdLibActions'

export namespace BucketSecurity {
	// Sometimes a studio ID is passed, others the peice / bucket id
	export function allowReadAccess(
		selector: MongoQuery<{ _id: BucketId }>,
		token: string,
		cred: Credentials | ResolvedCredentials
	) {
		check(selector, Object)
		if (!Settings.enableUserAccounts) return true
		if (!selector._id) throw new Meteor.Error(400, 'selector must contain bucket or piece id')
		const bucket = Buckets.findOne(selector)
		if (!bucket) throw new Meteor.Error(404, `Bucket "${selector._id}" not found!`)

		return StudioReadAccess.studioContent(bucket, { ...cred, token })
	}
	export function allowWriteAccess(selector: MongoQuery<{ _id: BucketId }>, cred: Credentials) {
		triggerWriteAccess()

		check(selector, Object)
		if (!Settings.enableUserAccounts) return true

		const bucket = Buckets.findOne(selector)
		if (!bucket) throw new Meteor.Error(404, `Bucket "${selector._id}" not found!`)

		return StudioContentWriteAccess.bucket(cred, bucket.studioId)
	}
	export function allowWriteAccessPiece(selector: MongoQuery<{ _id: PieceId }>, cred: Credentials) {
		triggerWriteAccess()

		check(selector, Object)
		if (!Settings.enableUserAccounts) return true

		const bucketAdLib = BucketAdLibs.findOne(selector)
		if (!bucketAdLib) throw new Meteor.Error(404, `Bucket AdLib "${selector._id}" not found!`)

		return StudioContentWriteAccess.bucket(cred, bucketAdLib.studioId)
	}
	export function allowWriteAccessAction(selector: MongoQuery<{ _id: AdLibActionId }>, cred: Credentials) {
		triggerWriteAccess()

		check(selector, Object)
		if (!Settings.enableUserAccounts) return true

		const bucketAdLibAction = BucketAdLibActions.findOne(selector)
		if (!bucketAdLibAction) throw new Meteor.Error(404, `Bucket AdLib Actions "${selector._id}" not found!`)

		return StudioContentWriteAccess.bucket(cred, bucketAdLibAction.studioId)
	}
}
