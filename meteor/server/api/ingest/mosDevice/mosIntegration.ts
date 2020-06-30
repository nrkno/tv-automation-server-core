import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'
import * as MOS from 'mos-connection'

import { Rundowns } from '../../../../lib/collections/Rundowns'
import { Parts } from '../../../../lib/collections/Parts'
import { PeripheralDeviceSecurity } from '../../../security/peripheralDevices'
import { logger } from '../../../logging'
import { getStudioFromDevice, canBeUpdated } from '../lib'
import { handleRemovedRundown, regenerateRundown } from '../rundownInput'
import { getPartIdFromMosStory, getRundownFromMosRO, parseMosString } from './lib'
import {
	handleMosRundownData,
	handleMosFullStory,
	handleMosDeleteStory,
	handleInsertParts,
	handleSwapStories,
	handleMoveStories,
	handleMosRundownMetadata,
} from './ingest'
import { PartInstances } from '../../../../lib/collections/PartInstances'
import { PeripheralDeviceId } from '../../../../lib/collections/PeripheralDevices'

export namespace MosIntegration {
	export function mosRoCreate(id: PeripheralDeviceId, token: string, rundown: MOS.IMOSRunningOrder) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(id, token, this)
		logger.info(`mosRoCreate "${rundown.ID}"`)
		logger.debug(rundown)

		handleMosRundownData(peripheralDevice, rundown, true)
	}
	export function mosRoReplace(id: PeripheralDeviceId, token: string, rundown: MOS.IMOSRunningOrder) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(id, token, this)
		logger.info(`mosRoReplace "${rundown.ID}"`)
		// @ts-ignore
		logger.debug(rundown)
		handleMosRundownData(peripheralDevice, rundown, true)
	}
	export function mosRoDelete(id: PeripheralDeviceId, token: string, rundownId: MOS.MosString128, force?: boolean) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(id, token, this)
		logger.info(`mosRoDelete "${rundownId}"`)
		handleRemovedRundown(peripheralDevice, parseMosString(rundownId))
	}
	export function mosRoMetadata(id: PeripheralDeviceId, token: string, rundownData: MOS.IMOSRunningOrderBase) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(id, token, this)
		logger.info(`mosRoMetadata "${rundownData.ID}"`)
		logger.debug(rundownData)

		handleMosRundownMetadata(peripheralDevice, rundownData)
	}
	export function mosRoStatus(id: PeripheralDeviceId, token: string, status: MOS.IMOSRunningOrderStatus) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(id, token, this)
		logger.info(`mosRoStatus "${status.ID}"`)
		logger.debug(status)

		const studio = getStudioFromDevice(peripheralDevice)
		const rundown = getRundownFromMosRO(studio, status.ID)
		if (!canBeUpdated(rundown)) return

		Rundowns.update(rundown._id, {
			$set: {
				status: status.Status,
			},
		})
	}
	export function mosRoStoryStatus(id: PeripheralDeviceId, token: string, status: MOS.IMOSStoryStatus) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(id, token, this)
		logger.info(`mosRoStoryStatus "${status.ID}"`)
		logger.debug(status)

		const studio = getStudioFromDevice(peripheralDevice)
		const rundown = getRundownFromMosRO(studio, status.RunningOrderId)
		if (!canBeUpdated(rundown)) return

		// Save Stories (aka Part ) status into database:
		const part = Parts.findOne({
			_id: getPartIdFromMosStory(rundown._id, status.ID),
			rundownId: rundown._id,
		})
		if (part) {
			Parts.update(part._id, {
				$set: {
					status: status.Status,
				},
			})
			// TODO-PartInstance - pending new data flow
			PartInstances.update(
				{
					'part._id': part._id,
					reset: { $ne: true },
				},
				{
					$set: {
						status: status.Status,
					},
				},
				{ multi: true }
			)
		} else throw new Meteor.Error(404, `Part ${status.ID} in rundown ${status.RunningOrderId} not found`)
	}
	export function mosRoStoryInsert(
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSStoryAction,
		Stories: Array<MOS.IMOSROStory>
	) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(id, token, this)
		logger.info(`mosRoStoryInsert after "${Action.StoryID}" Stories: ${Stories}`)
		// @ts-ignore
		logger.debug(Action, Stories)

		handleInsertParts(peripheralDevice, Action.RunningOrderID, Action.StoryID, false, Stories)
	}
	export function mosRoStoryReplace(
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSStoryAction,
		Stories: Array<MOS.IMOSROStory>
	) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(id, token, this)
		logger.info(`mosRoStoryReplace "${Action.StoryID}" Stories: ${Stories}`)
		// @ts-ignore
		logger.debug(Action, Stories)

		handleInsertParts(peripheralDevice, Action.RunningOrderID, Action.StoryID, true, Stories)
	}
	export function mosRoStoryMove(
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSStoryAction,
		Stories: Array<MOS.MosString128>
	) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(id, token, this)
		logger.info(`mosRoStoryMove "${Action.StoryID}" Stories: ${Stories}`)

		handleMoveStories(peripheralDevice, Action.RunningOrderID, Action.StoryID, Stories)
	}
	export function mosRoStoryDelete(
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSROAction,
		Stories: Array<MOS.MosString128>
	) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(id, token, this)
		logger.info(`mosRoStoryDelete "${Action.RunningOrderID}" Stories: ${Stories}`)

		handleMosDeleteStory(peripheralDevice, Action.RunningOrderID, Stories)
	}
	export function mosRoStorySwap(
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSROAction,
		StoryID0: MOS.MosString128,
		StoryID1: MOS.MosString128
	) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(id, token, this)
		logger.info(`mosRoStorySwap "${StoryID0}", "${StoryID1}"`)

		handleSwapStories(peripheralDevice, Action.RunningOrderID, StoryID0, StoryID1)
	}
	export function mosRoReadyToAir(id: PeripheralDeviceId, token: string, Action: MOS.IMOSROReadyToAir) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(id, token, this)
		logger.info(`mosRoReadyToAir "${Action.ID}"`)
		logger.debug(Action)

		const studio = getStudioFromDevice(peripheralDevice)
		const rundown = getRundownFromMosRO(studio, Action.ID)
		if (!canBeUpdated(rundown)) return

		// Set the ready to air status of a Rundown
		if (rundown.airStatus !== Action.Status) {
			Rundowns.update(rundown._id, {
				$set: {
					airStatus: Action.Status,
				},
			})
			regenerateRundown(rundown._id)
		}
	}
	export function mosRoFullStory(id: PeripheralDeviceId, token: string, story: MOS.IMOSROFullStory) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(id, token, this)
		logger.info(`mosRoFullStory "${story.ID}"`)

		handleMosFullStory(peripheralDevice, story)
	}

	/**
	 * Unimplemented item methods.
	 * An item is an object within a Part. These do not directly map to a Piece
	 */
	export function mosRoItemDelete(
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSStoryAction,
		Items: Array<MOS.MosString128>
	) {
		PeripheralDeviceSecurity.getPeripheralDevice(id, token, this)
		logger.warn(`mosRoItemDelete NOT SUPPORTED "${Action.StoryID}"`)
		// @ts-ignore
		logger.debug(Action, Items)
	}
	export function mosRoItemStatus(id: PeripheralDeviceId, token: string, status: MOS.IMOSItemStatus) {
		PeripheralDeviceSecurity.getPeripheralDevice(id, token, this)
		logger.warn(`mosRoItemStatus NOT SUPPORTED "${status.ID}"`)
		// @ts-ignore
		logger.debug(status)
	}
	export function mosRoItemInsert(
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSItemAction,
		Items: Array<MOS.IMOSItem>
	) {
		PeripheralDeviceSecurity.getPeripheralDevice(id, token, this)
		logger.warn(`mosRoItemInsert NOT SUPPORTED "${Action.ItemID}"`)
		// @ts-ignore
		logger.debug(Action, Items)
	}
	export function mosRoItemReplace(
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSItemAction,
		Items: Array<MOS.IMOSItem>
	) {
		PeripheralDeviceSecurity.getPeripheralDevice(id, token, this)
		logger.warn(`mosRoItemReplace NOT SUPPORTED "${Action.ItemID}"`)
		// @ts-ignore
		logger.debug(Action, Items)
	}
	export function mosRoItemMove(
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSItemAction,
		Items: Array<MOS.MosString128>
	) {
		PeripheralDeviceSecurity.getPeripheralDevice(id, token, this)
		logger.warn(`mosRoItemMove NOT SUPPORTED "${Action.ItemID}"`)
		// @ts-ignore
		logger.debug(Action, Items)
	}
	export function mosRoItemSwap(
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSStoryAction,
		ItemID0: MOS.MosString128,
		ItemID1: MOS.MosString128
	) {
		PeripheralDeviceSecurity.getPeripheralDevice(id, token, this)
		logger.warn(`mosRoItemSwap NOT SUPPORTED "${ItemID0}", "${ItemID1}"`)
		// @ts-ignore
		logger.debug(Action, ItemID0, ItemID1)
	}
}
