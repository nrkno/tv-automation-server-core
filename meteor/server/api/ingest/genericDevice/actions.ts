import { Meteor } from 'meteor/meteor'
import { PeripheralDevice } from '../../../../lib/collections/PeripheralDevices'
import { Rundown } from '../../../../lib/collections/Rundowns'
import { TriggerReloadDataResponse } from '../../../../lib/api/userActions'
import { waitForPromise, WrapAsyncCallback } from '../../../../lib/lib'
import { logger } from '../../../logging'
import { PeripheralDeviceAPI } from '../../../../lib/api/peripheralDevice'
import * as _ from 'underscore'
import { IngestRundown, IngestSegment } from '@sofie-automation/blueprints-integration'
import { handleRemovedSegment, handleUpdatedSegment, handleUpdatedRundown } from '../rundownInput'
import { Segment } from '../../../../lib/collections/Segments'

export namespace GenericDeviceActions {
	export const reloadRundown: (peripheralDevice: PeripheralDevice, rundown: Rundown) => TriggerReloadDataResponse =
		Meteor.wrapAsync(function reloadRundown(
			peripheralDevice: PeripheralDevice,
			rundown: Rundown,
			cb: WrapAsyncCallback<TriggerReloadDataResponse>
		): void {
			logger.info('reloadRundown ' + rundown._id)

			PeripheralDeviceAPI.executeFunctionWithCustomTimeout(
				peripheralDevice._id,
				(err: Error, ingestRundown: IngestRundown | null) => {
					if (err) {
						if (_.isString(err) && err.match(/rundown does not exist/i)) {
							// Don't throw an error, instead return MISSING value
							cb(null, TriggerReloadDataResponse.MISSING)
						} else {
							logger.error('Error in GenericDeviceActions.reloadRundown', err)
							cb(err)
						}
					} else {
						try {
							if (ingestRundown === null) {
								logger.info('triggerReloadRundown reply with null')
								// a null-reply means that the device will asynchronously send data updates later:
								cb(null, TriggerReloadDataResponse.WORKING)
							} else {
								logger.info('triggerReloadRundown reply ' + ingestRundown.externalId)
								logger.debug(ingestRundown)

								if (ingestRundown.externalId !== rundown.externalId) {
									throw new Meteor.Error(
										500,
										`Bad response from device "${peripheralDevice._id}": Expected ingestRundown "${rundown.externalId}", got "${ingestRundown.externalId}"`
									)
								}

								// if (!iNewsRunningOrder.length) {
								// 	throw new Meteor.Error(401, iNewsRunningOrder)
								// }

								waitForPromise(handleUpdatedRundown(undefined, peripheralDevice, ingestRundown, true))

								cb(null, TriggerReloadDataResponse.COMPLETED)
							}
						} catch (e) {
							cb(e)
						}
					}
				},
				10 * 1000, // 10 seconds, sometimes the NRCS is pretty slow in returning a response
				'triggerReloadRundown',
				rundown.externalId
			)
		})
	export const reloadSegment: (
		peripheralDevice: PeripheralDevice,
		rundown: Rundown,
		segment: Segment
	) => TriggerReloadDataResponse = Meteor.wrapAsync(function reloadSegment(
		peripheralDevice: PeripheralDevice,
		rundown: Rundown,
		segment: Segment,
		cb: WrapAsyncCallback<TriggerReloadDataResponse>
	): void {
		logger.info('reloadSegment ' + segment._id)

		PeripheralDeviceAPI.executeFunction(
			peripheralDevice._id,
			(err: Error, ingestSegment: IngestSegment | null) => {
				if (err) {
					if (_.isString(err) && err.match(/segment does not exist/i)) {
						waitForPromise(handleRemovedSegment(peripheralDevice, rundown.externalId, segment.externalId))
						// Don't throw an error, instead return MISSING value
						cb(null, TriggerReloadDataResponse.MISSING)
					} else {
						logger.error('Error in GenericDeviceActions.triggerGetSegment', err)
						cb(err)
					}
				} else {
					try {
						if (ingestSegment === null) {
							logger.info('triggerReloadSegment reply with null')

							// a null-reply means that the device will asynchronously send data updates later:
							cb(null, TriggerReloadDataResponse.WORKING)
						} else {
							logger.info('triggerReloadSegment reply ' + ingestSegment.externalId)
							logger.debug(ingestSegment)

							if (ingestSegment.externalId !== segment.externalId) {
								throw new Meteor.Error(
									500,
									`Bad response from device "${peripheralDevice._id}": Expected ingestRundown "${segment.externalId}", got "${ingestSegment.externalId}"`
								)
							}

							waitForPromise(
								handleUpdatedSegment(peripheralDevice, rundown.externalId, ingestSegment, true)
							)

							cb(null, TriggerReloadDataResponse.COMPLETED)
						}
					} catch (e) {
						cb(e)
					}
				}
			},
			'triggerReloadSegment',
			rundown.externalId,
			segment.externalId
		)
	})
}
