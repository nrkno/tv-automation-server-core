import { Meteor } from 'meteor/meteor'
import { check } from '../../lib/check'
import { Mongo } from 'meteor/mongo'
import * as _ from 'underscore'
import { MongoQuery } from '../../lib/typings/meteor'
import { Credentials, ResolvedCredentials } from './lib/credentials'
import { logNotAllowed } from './lib/lib'
import { allowAccessToRundown } from './lib/security'
import { RundownId } from '../../lib/collections/Rundowns'
import { protectString } from '../../lib/lib'
import { Segments, SegmentId } from '../../lib/collections/Segments'
import { ExpectedMediaItem } from '../../lib/collections/ExpectedMediaItems'
import { PeripheralDevices, getStudioIdFromDevice } from '../../lib/collections/PeripheralDevices'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { ExpectedPlayoutItem } from '../../lib/collections/ExpectedPlayoutItems'
import { Settings } from '../../lib/Settings'
import { triggerWriteAccess } from './lib/securityVerify'

type RundownContent = { rundownId: RundownId }
export namespace RundownReadAccess {
	export function rundown(
		selector: MongoQuery<{ _id: RundownId }>,
		cred: Credentials | ResolvedCredentials
	): boolean {
		return rundownContent({ rundownId: selector._id }, cred)
	}
	/** Handles read access for all rundown content (segments, parts, pieces etc..) */
	export function rundownContent(
		selector: MongoQuery<RundownContent>,
		cred: Credentials | ResolvedCredentials
	): boolean {
		check(selector, Object)
		if (!Settings.enableUserAccounts) return true
		if (!selector.rundownId) throw new Meteor.Error(400, 'selector must contain rundownId')

		const access = allowAccessToRundown(cred, selector.rundownId)
		if (!access.read) return logNotAllowed('Rundown content', access.reason)

		return true
	}
	export function segments(selector: MongoQuery<{ _id: SegmentId }>, cred: Credentials): boolean {
		check(selector, Object)
		if (!Settings.enableUserAccounts) return true
		if (!selector._id) throw new Meteor.Error(400, 'selector must contain _id')

		const segments = Segments.find(selector).fetch()
		const rundownIds = _.uniq(_.map(segments, (s) => s.rundownId))

		const access = allowAccessToRundown(cred, { $in: rundownIds })
		if (!access.read) return logNotAllowed('Segments', access.reason)

		return true
	}
	export function pieces(selector: MongoQuery<{ rundownId: RundownId }>, cred: Credentials): boolean {
		check(selector, Object)
		if (!Settings.enableUserAccounts) return true
		if (!selector.rundownId) throw new Meteor.Error(400, 'selector must contain rundownId')

		const access = allowAccessToRundown(cred, selector.rundownId)
		if (!access.read) return logNotAllowed('Piece', access.reason)

		return true
	}
	export function expectedMediaItems(selector: Mongo.Query<ExpectedMediaItem> | any, cred: Credentials) {
		check(selector, Object)
		if (selector.mediaFlowId) {
			check(selector.mediaFlowId, Object)
			check(selector.mediaFlowId.$in, Array)
		}
		if (!rundownContent(selector, cred)) return null

		let mediaManagerDevice = PeripheralDevices.findOne({
			type: PeripheralDeviceAPI.DeviceType.MEDIA_MANAGER,
			token: cred.token,
		})

		if (!mediaManagerDevice) return false

		mediaManagerDevice.studioId = getStudioIdFromDevice(mediaManagerDevice)

		if (mediaManagerDevice && cred.token) {
			// mediaManagerDevice.settings

			return mediaManagerDevice
		} else {
			// TODO: implement access logic here
			// use context.userId

			// just returning true for now
			return true
		}
	}
	export function expectedPlayoutItems(selector: Mongo.Query<ExpectedPlayoutItem> | any, cred: Credentials) {
		check(selector, Object)
		check(selector.studioId, String)

		if (!rundownContent(selector, cred)) return null

		let playoutDevice = PeripheralDevices.findOne({
			type: PeripheralDeviceAPI.DeviceType.PLAYOUT,
			token: cred.token,
		})
		if (!playoutDevice) return false

		playoutDevice.studioId = getStudioIdFromDevice(playoutDevice)

		if (playoutDevice && cred.token) {
			return playoutDevice
		} else {
			// TODO: implement access logic here
			// just returning true for now
			return true
		}
	}
}
export function rundownContentAllowWrite(userId, doc: RundownContent): boolean {
	triggerWriteAccess()
	const access = allowAccessToRundown({ userId: protectString(userId) }, doc.rundownId)
	if (!access.update) return logNotAllowed('Rundown content', access.reason)
	return true
}
export function pieceContentAllowWrite(userId, doc: { startRundownId: RundownId }): boolean {
	triggerWriteAccess()
	const access = allowAccessToRundown({ userId: protectString(userId) }, doc.startRundownId)
	if (!access.update) return logNotAllowed('Rundown content', access.reason)
	return true
}
