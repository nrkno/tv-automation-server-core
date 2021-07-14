import { Meteor } from 'meteor/meteor'
import * as MOS from 'mos-connection'

import { Rundowns } from '../../../../lib/collections/Rundowns'
import { Parts } from '../../../../lib/collections/Parts'
import { logger } from '../../../logging'
import { getStudioFromDevice, canRundownBeUpdated, checkAccessAndGetPeripheralDevice } from '../lib'
import { handleRemovedRundown, regenerateRundown } from '../rundownInput'
import { getPartIdFromMosStory, getRundownFromMosRO, parseMosString } from './lib'
import {
	handleMosRundownData,
	handleMosFullStory,
	handleMosDeleteStory,
	handleMosInsertParts,
	handleMosSwapStories,
	handleMosMoveStories,
	handleMosRundownMetadata,
} from './ingest'
import { PartInstances } from '../../../../lib/collections/PartInstances'
import { PeripheralDeviceId } from '../../../../lib/collections/PeripheralDevices'
import { MethodContext } from '../../../../lib/api/methods'
import { profiler } from '../../profiler'

const apmNamespace = 'mosIntegration'

export namespace MosIntegration {
	export async function mosRoCreate(
		context: MethodContext,
		id: PeripheralDeviceId,
		token: string,
		rundown: MOS.IMOSRunningOrder
	): Promise<void> {
		const transaction = profiler.startTransaction('mosRoCreate', apmNamespace)

		const peripheralDevice = checkAccessAndGetPeripheralDevice(id, token, context)

		logger.info(`mosRoCreate "${rundown.ID}"`)
		logger.debug(rundown)

		await handleMosRundownData(peripheralDevice, rundown, true)

		transaction?.end()
	}

	export async function mosRoReplace(
		context: MethodContext,
		id: PeripheralDeviceId,
		token: string,
		rundown: MOS.IMOSRunningOrder
	): Promise<void> {
		const transaction = profiler.startTransaction('mosRoReplace', apmNamespace)

		const peripheralDevice = checkAccessAndGetPeripheralDevice(id, token, context)

		logger.info(`mosRoReplace "${rundown.ID}"`)
		// @ts-ignore
		logger.debug(rundown)
		await handleMosRundownData(peripheralDevice, rundown, true)

		transaction?.end()
	}

	export async function mosRoDelete(
		context: MethodContext,
		id: PeripheralDeviceId,
		token: string,
		rundownId: MOS.MosString128
	): Promise<void> {
		const transaction = profiler.startTransaction('mosRoDelete', apmNamespace)

		const peripheralDevice = checkAccessAndGetPeripheralDevice(id, token, context)

		logger.info(`mosRoDelete "${rundownId}"`)
		await handleRemovedRundown(peripheralDevice, parseMosString(rundownId))

		transaction?.end()
	}

	export async function mosRoMetadata(
		context: MethodContext,
		id: PeripheralDeviceId,
		token: string,
		rundownData: MOS.IMOSRunningOrderBase
	): Promise<void> {
		const transaction = profiler.startTransaction('mosRoMetadata', apmNamespace)

		const peripheralDevice = checkAccessAndGetPeripheralDevice(id, token, context)

		logger.info(`mosRoMetadata "${rundownData.ID}"`)
		logger.debug(rundownData)

		await handleMosRundownMetadata(peripheralDevice, rundownData)

		transaction?.end()
	}

	export async function mosRoStatus(
		context: MethodContext,
		id: PeripheralDeviceId,
		token: string,
		status: MOS.IMOSRunningOrderStatus
	): Promise<void> {
		const transaction = profiler.startTransaction('mosRoStatus', apmNamespace)

		const peripheralDevice = checkAccessAndGetPeripheralDevice(id, token, context)

		logger.info(`mosRoStatus "${status.ID}"`)
		logger.debug(status)

		const studio = getStudioFromDevice(peripheralDevice)
		const rundown = getRundownFromMosRO(studio, status.ID)
		if (!canRundownBeUpdated(rundown, false)) return

		await Rundowns.updateAsync(rundown._id, {
			$set: {
				status: status.Status,
			},
		})

		transaction?.end()
	}

	export async function mosRoStoryStatus(
		context: MethodContext,
		id: PeripheralDeviceId,
		token: string,
		status: MOS.IMOSStoryStatus
	): Promise<void> {
		const transaction = profiler.startTransaction('mosRoStoryStatus', apmNamespace)

		const peripheralDevice = checkAccessAndGetPeripheralDevice(id, token, context)

		logger.info(`mosRoStoryStatus "${status.ID}"`)
		logger.debug(status)

		const studio = getStudioFromDevice(peripheralDevice)
		const rundown = getRundownFromMosRO(studio, status.RunningOrderId)
		if (!canRundownBeUpdated(rundown, false)) return
		// TODO ORPHAN include segment in check

		// Save Stories (aka Part ) status into database:
		const part = await Parts.findOneAsync({
			_id: getPartIdFromMosStory(rundown._id, status.ID),
			rundownId: rundown._id,
		})
		if (part) {
			await Promise.all([
				Parts.updateAsync(part._id, {
					$set: {
						status: status.Status,
					},
				}),
				// TODO-PartInstance - pending new data flow
				PartInstances.updateAsync(
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
				),
			])
		} else {
			throw new Meteor.Error(404, `Part ${status.ID} in rundown ${status.RunningOrderId} not found`)
		}

		transaction?.end()
	}

	export async function mosRoStoryInsert(
		context: MethodContext,
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSStoryAction,
		Stories: Array<MOS.IMOSROStory>
	): Promise<void> {
		const transaction = profiler.startTransaction('mosRoStoryInsert', apmNamespace)

		const peripheralDevice = checkAccessAndGetPeripheralDevice(id, token, context)

		logger.info(`mosRoStoryInsert after "${Action.StoryID}" Stories: ${Stories.map((s) => s.ID)}`)
		// @ts-ignore
		logger.debug(Action, Stories)

		await handleMosInsertParts(peripheralDevice, Action.RunningOrderID, Action.StoryID, false, Stories)

		transaction?.end()
	}
	export async function mosRoStoryReplace(
		context: MethodContext,
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSStoryAction,
		Stories: Array<MOS.IMOSROStory>
	): Promise<void> {
		const transaction = profiler.startTransaction('mosRoStoryReplace', apmNamespace)

		const peripheralDevice = checkAccessAndGetPeripheralDevice(id, token, context)

		logger.info(`mosRoStoryReplace "${Action.StoryID}" Stories: ${Stories.map((s) => s.ID)}`)
		// @ts-ignore
		logger.debug(Action, Stories)

		await handleMosInsertParts(peripheralDevice, Action.RunningOrderID, Action.StoryID, true, Stories)

		transaction?.end()
	}
	export async function mosRoStoryMove(
		context: MethodContext,
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSStoryAction,
		Stories: Array<MOS.MosString128>
	): Promise<void> {
		const transaction = profiler.startTransaction('mosRoStoryMove', apmNamespace)

		const peripheralDevice = checkAccessAndGetPeripheralDevice(id, token, context)

		logger.info(`mosRoStoryMove "${Action.StoryID}" Stories: ${Stories}`)

		await handleMosMoveStories(peripheralDevice, Action.RunningOrderID, Action.StoryID, Stories)

		transaction?.end()
	}

	export async function mosRoStoryDelete(
		context: MethodContext,
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSROAction,
		Stories: Array<MOS.MosString128>
	): Promise<void> {
		const transaction = profiler.startTransaction('mosRoStoryDelete', apmNamespace)

		const peripheralDevice = checkAccessAndGetPeripheralDevice(id, token, context)

		logger.info(`mosRoStoryDelete "${Action.RunningOrderID}" Stories: ${Stories}`)

		await handleMosDeleteStory(peripheralDevice, Action.RunningOrderID, Stories)

		transaction?.end()
	}

	export async function mosRoStorySwap(
		context: MethodContext,
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSROAction,
		StoryID0: MOS.MosString128,
		StoryID1: MOS.MosString128
	): Promise<void> {
		const transaction = profiler.startTransaction('mosRoStorySwap', apmNamespace)

		const peripheralDevice = checkAccessAndGetPeripheralDevice(id, token, context)

		logger.info(`mosRoStorySwap "${StoryID0}", "${StoryID1}"`)

		await handleMosSwapStories(peripheralDevice, Action.RunningOrderID, StoryID0, StoryID1)

		transaction?.end()
	}

	export async function mosRoReadyToAir(
		context: MethodContext,
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSROReadyToAir
	): Promise<void> {
		const transaction = profiler.startTransaction('mosRoReadyToAir', apmNamespace)

		const peripheralDevice = checkAccessAndGetPeripheralDevice(id, token, context)

		logger.info(`mosRoReadyToAir "${Action.ID}"`)
		logger.debug(Action)

		const studio = getStudioFromDevice(peripheralDevice)
		const rundown = getRundownFromMosRO(studio, Action.ID)
		if (!canRundownBeUpdated(rundown, false)) return

		// Set the ready to air status of a Rundown
		if (rundown.airStatus !== Action.Status) {
			await Rundowns.updateAsync(rundown._id, {
				$set: {
					airStatus: Action.Status,
				},
			})
			await regenerateRundown(studio, rundown.externalId, peripheralDevice)
		}

		transaction?.end()
	}

	export async function mosRoFullStory(
		context: MethodContext,
		id: PeripheralDeviceId,
		token: string,
		story: MOS.IMOSROFullStory
	): Promise<void> {
		const transaction = profiler.startTransaction('mosRoFullStory', apmNamespace)

		const peripheralDevice = checkAccessAndGetPeripheralDevice(id, token, context)

		logger.info(`mosRoFullStory "${story.ID}"`)

		await handleMosFullStory(peripheralDevice, story)

		transaction?.end()
	}

	/**
	 * Unimplemented item methods.
	 * An item is an object within a Part. These do not directly map to a Piece
	 */
	export async function mosRoItemDelete(
		context: MethodContext,
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSStoryAction,
		Items: Array<MOS.MosString128>
	): Promise<void> {
		const transaction = profiler.startTransaction('mosRoItemDelete', apmNamespace)

		checkAccessAndGetPeripheralDevice(id, token, context)

		logger.warn(`mosRoItemDelete NOT SUPPORTED "${Action.StoryID}"`)
		// @ts-ignore
		logger.debug(Action, Items)

		transaction?.end()
	}

	export async function mosRoItemStatus(
		context: MethodContext,
		id: PeripheralDeviceId,
		token: string,
		status: MOS.IMOSItemStatus
	): Promise<void> {
		const transaction = profiler.startTransaction('mosRoItemStatus', apmNamespace)

		checkAccessAndGetPeripheralDevice(id, token, context)

		logger.warn(`mosRoItemStatus NOT SUPPORTED "${status.ID}"`)
		// @ts-ignore
		logger.debug(status)

		transaction?.end()
	}

	export async function mosRoItemInsert(
		context: MethodContext,
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSItemAction,
		Items: Array<MOS.IMOSItem>
	): Promise<void> {
		const transaction = profiler.startTransaction('mosRoItemInsert', apmNamespace)

		checkAccessAndGetPeripheralDevice(id, token, context)

		logger.warn(`mosRoItemInsert NOT SUPPORTED "${Action.ItemID}"`)
		// @ts-ignore
		logger.debug(Action, Items)

		transaction?.end()
	}

	export async function mosRoItemReplace(
		context: MethodContext,
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSItemAction,
		Items: Array<MOS.IMOSItem>
	): Promise<void> {
		const transaction = profiler.startTransaction('mosRoItemReplace', apmNamespace)

		checkAccessAndGetPeripheralDevice(id, token, context)

		logger.warn(`mosRoItemReplace NOT SUPPORTED "${Action.ItemID}"`)
		// @ts-ignore
		logger.debug(Action, Items)

		transaction?.end()
	}

	export async function mosRoItemMove(
		context: MethodContext,
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSItemAction,
		Items: Array<MOS.MosString128>
	): Promise<void> {
		const transaction = profiler.startTransaction('mosRoItemMove', apmNamespace)

		checkAccessAndGetPeripheralDevice(id, token, context)

		logger.warn(`mosRoItemMove NOT SUPPORTED "${Action.ItemID}"`)
		// @ts-ignore
		logger.debug(Action, Items)

		transaction?.end()
	}

	export async function mosRoItemSwap(
		context: MethodContext,
		id: PeripheralDeviceId,
		token: string,
		Action: MOS.IMOSStoryAction,
		ItemID0: MOS.MosString128,
		ItemID1: MOS.MosString128
	): Promise<void> {
		const transaction = profiler.startTransaction('mosRoItemSwap', apmNamespace)

		checkAccessAndGetPeripheralDevice(id, token, context)

		logger.warn(`mosRoItemSwap NOT SUPPORTED "${ItemID0}", "${ItemID1}"`)
		// @ts-ignore
		logger.debug(Action, ItemID0, ItemID1)

		transaction?.end()
	}
}
