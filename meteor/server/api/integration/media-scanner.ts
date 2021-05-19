import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'
import { MediaObject, MediaObjects, MediaObjId } from '../../../lib/collections/MediaObjects'
import { getStudioIdFromDevice, PeripheralDeviceId } from '../../../lib/collections/PeripheralDevices'
import { protectString } from '../../../lib/lib'
import { checkAccessAndGetPeripheralDevice } from '../ingest/lib'
import { MethodContext } from '../../../lib/api/methods'
import { MediaObjectRevision } from '../../../lib/api/peripheralDevice'

export namespace MediaScannerIntegration {
	export function getMediaObjectRevisions(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		collectionId: string
	): MediaObjectRevision[] {
		// logger.debug('getMediaObjectRevisions')
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)
		const studioId = getStudioIdFromDevice(peripheralDevice)

		if (studioId) {
			return _.map(
				MediaObjects.find({
					studioId: studioId,
					collectionId: collectionId,
				}).fetch(),
				(mo: MediaObject) => {
					return {
						id: mo.objId,
						rev: mo._rev,
					}
				}
			)
		} else {
			throw new Meteor.Error(400, 'getMediaObjectRevisions: Device "' + peripheralDevice._id + '" has no studio')
		}
	}
	export function updateMediaObject(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		collectionId: string,
		objId: string,
		doc: MediaObject | null
	) {
		// logger.debug('updateMediaObject')
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)
		const studioId = getStudioIdFromDevice(peripheralDevice)

		let _id: MediaObjId = protectString(collectionId + '_' + objId)
		if (_.isNull(doc)) {
			MediaObjects.remove(_id)
		} else if (doc) {
			if (doc.mediaId !== doc.mediaId.toUpperCase())
				throw new Meteor.Error(400, 'mediaId must only use uppercase characters')
			let doc2 = _.extend(doc, {
				studioId: studioId,
				collectionId: collectionId,
				objId: objId,
				_id: _id,
			})
			// logger.debug(doc2)
			MediaObjects.upsert(_id, { $set: doc2 })
		} else {
			throw new Meteor.Error(400, 'missing doc argument')
		}
	}
	export function clearMediaObjectCollection(deviceId: PeripheralDeviceId, token: string, collectionId: string) {
		let peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, token, this)

		const studioId = getStudioIdFromDevice(peripheralDevice)

		MediaObjects.remove({ collectionId, studioId })
	}
}
