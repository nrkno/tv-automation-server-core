import { DeviceConfigManifest } from './configManifest'
import { TSR } from '@sofie-automation/blueprints-integration'

/**
 * Note: This file contains a copy of the typings from meteor/lib/api/peripheralDevice.ts in Core
 */

export namespace PeripheralDeviceAPI {
	export enum StatusCode {
		/** Unknown status, could be due to parent device connected etc.. */
		UNKNOWN = 0,
		/** All good and green */
		GOOD = 1,
		/** Everything is not OK, but normal operation should not be affected. An optional/backup service might be offline, etc. */
		WARNING_MINOR = 2,
		/** Everything is not OK, operation might be affected. Like when having switched to a backup, or have taken action to fix an error. Sofie will show a restart device button for this and all higher severity warnings. */
		WARNING_MAJOR = 3,
		/** Not good. Operation is affected. Will be able to recover on it's own when the situation changes. */
		BAD = 4,
		/** Not good. Operation is affected. Will NOT be able to to recover from this, manual intervention will be required. */
		FATAL = 5,
	}

	export interface StatusObject {
		statusCode: StatusCode
		messages?: Array<string>
	}
	// Note: The definite type of a device is determined by the Category, Type and SubType
	export enum DeviceCategory {
		INGEST = 'ingest',
		PLAYOUT = 'playout',
		MEDIA_MANAGER = 'media_manager',
		PACKAGE_MANAGER = 'package_manager',
	}
	/**
	 * Deprecated and should not be used in new integrations.
	 */
	export enum DeviceType {
		// Ingest devices:
		MOS = 'mos',
		SPREADSHEET = 'spreadsheet',
		INEWS = 'inews',
		// Playout devices:
		PLAYOUT = 'playout',
		// Media-manager devices:
		MEDIA_MANAGER = 'media_manager',
		// Package_manager devices:
		PACKAGE_MANAGER = 'package_manager',
	}
	export type DeviceSubType = SUBTYPE_PROCESS | TSR.DeviceType | MOS_DeviceType | Spreadsheet_DeviceType

	/** SUBTYPE_PROCESS means that the device is NOT a sub-device, but a (parent) process. */
	export type SUBTYPE_PROCESS = '_process'
	export const SUBTYPE_PROCESS: SUBTYPE_PROCESS = '_process'
	export type MOS_DeviceType = 'mos_connection'
	export type Spreadsheet_DeviceType = 'spreadsheet_connection'

	export interface InitOptions {
		category: DeviceCategory
		type: DeviceType
		subType: DeviceSubType

		name: string
		connectionId: string
		parentDeviceId?: string // PeripheralDeviceId
		versions?: {
			[libraryName: string]: string
		}
		configManifest: DeviceConfigManifest
	}
	export type TimelineTriggerTimeResult = Array<{ id: string; time: number }>

	export interface PartPlaybackStartedResult {
		rundownPlaylistId: string // RundownPlaylistId
		partInstanceId: string // PartInstanceId
		time: number
	}
	export type PartPlaybackStoppedResult = PartPlaybackStartedResult
	export interface PiecePlaybackStartedResult {
		rundownPlaylistId: string // RundownPlaylistId
		pieceInstanceId: string // PieceInstanceId
		dynamicallyInserted?: boolean
		time: number
	}
	export type PiecePlaybackStoppedResult = PiecePlaybackStartedResult

	/** List of methods that are sent from a PeripheralDevice into Sofie-Core */
	export enum methods {
		// Used in integrations tests:
		'killProcess' = 'peripheralDevice.killProcess',
		'testMethod' = 'peripheralDevice.testMethod',

		// Basic functionality:
		'functionReply' = 'peripheralDevice.functionReply',
		'ping' = 'peripheralDevice.ping',

		// Device status and lifetime:
		'setStatus' = 'peripheralDevice.status',
		'initialize' = 'peripheralDevice.initialize',
		'unInitialize' = 'peripheralDevice.unInitialize',
		'getPeripheralDevice' = 'peripheralDevice.getPeripheralDevice',
		'pingWithCommand' = 'peripheralDevice.pingWithCommand',

		// Time-sync:
		'determineDiffTime' = 'systemTime.determineDiffTime',
		'getTimeDiff' = 'systemTime.getTimeDiff',
		'getTime' = 'systemTime.getTime',

		// Playout-gateway:
		'reportResolveDone' = 'peripheralDevice.reportResolveDone',
		'timelineTriggerTime' = 'peripheralDevice.timeline.setTimelineTriggerTime',
		'partPlaybackStarted' = 'peripheralDevice.rundown.partPlaybackStarted',
		'partPlaybackStopped' = 'peripheralDevice.rundown.partPlaybackStopped',
		'piecePlaybackStarted' = 'peripheralDevice.rundown.piecePlaybackStarted',
		'piecePlaybackStopped' = 'peripheralDevice.rundown.piecePlaybackStopped',
		// 'reportCommandError' = 'peripheralDevice.playout.reportCommandError', // not implemented

		// Mos-gateway:
		'mosRoCreate' = 'peripheralDevice.mos.roCreate',
		'mosRoReplace' = 'peripheralDevice.mos.roReplace',
		'mosRoDelete' = 'peripheralDevice.mos.roDelete',
		// 'mosRoDeleteForce' = 'peripheralDevice.mos.roDeleteForce', // not implemented
		'mosRoMetadata' = 'peripheralDevice.mos.roMetadata',
		'mosRoStatus' = 'peripheralDevice.mos.roStatus',
		'mosRoStoryStatus' = 'peripheralDevice.mos.roStoryStatus',
		'mosRoItemStatus' = 'peripheralDevice.mos.roItemStatus',
		'mosRoStoryInsert' = 'peripheralDevice.mos.roStoryInsert',
		'mosRoStoryReplace' = 'peripheralDevice.mos.roStoryReplace',
		'mosRoStoryMove' = 'peripheralDevice.mos.roStoryMove',
		'mosRoStoryDelete' = 'peripheralDevice.mos.roStoryDelete',
		'mosRoStorySwap' = 'peripheralDevice.mos.roStorySwap',
		'mosRoItemInsert' = 'peripheralDevice.mos.roItemInsert',
		'mosRoItemReplace' = 'peripheralDevice.mos.roItemReplace',
		'mosRoItemMove' = 'peripheralDevice.mos.roItemMove',
		'mosRoItemDelete' = 'peripheralDevice.mos.roItemDelete',
		'mosRoItemSwap' = 'peripheralDevice.mos.roItemSwap',
		'mosRoReadyToAir' = 'peripheralDevice.mos.roReadyToAir',
		'mosRoFullStory' = 'peripheralDevice.mos.roFullStory',

		'dataRundownList' = 'peripheralDevice.rundown.rundownList',
		'dataRundownGet' = 'peripheralDevice.rundown.rundownGet',
		'dataRundownDelete' = 'peripheralDevice.rundown.rundownDelete',
		'dataRundownCreate' = 'peripheralDevice.rundown.rundownCreate',
		'dataRundownUpdate' = 'peripheralDevice.rundown.rundownUpdate',
		'dataSegmentGet' = 'peripheralDevice.rundown.segmentGet',
		'dataSegmentDelete' = 'peripheralDevice.rundown.segmentDelete',
		'dataSegmentCreate' = 'peripheralDevice.rundown.segmentCreate',
		'dataSegmentUpdate' = 'peripheralDevice.rundown.segmentUpdate',
		'dataSegmentRanksUpdate' = 'peripheralDevice.rundown.segmentRanksUpdate',
		'dataPartDelete' = 'peripheralDevice.rundown.partDelete',
		'dataPartCreate' = 'peripheralDevice.rundown.partCreate',
		'dataPartUpdate' = 'peripheralDevice.rundown.partUpdate',

		// Media Manager / Media-scanner:
		'getMediaObjectRevisions' = 'peripheralDevice.mediaScanner.getMediaObjectRevisions',
		'updateMediaObject' = 'peripheralDevice.mediaScanner.updateMediaObject',
		'clearMediaObjectCollection' = 'peripheralDevice.mediaScanner.clearMediaObjectCollection',
		'getMediaWorkFlowRevisions' = 'peripheralDevice.mediaManager.getMediaWorkFlowRevisions',
		'updateMediaWorkFlow' = 'peripheralDevice.mediaManager.updateMediaWorkFlow',
		'getMediaWorkFlowStepRevisions' = 'peripheralDevice.mediaManager.getMediaWorkFlowStepRevisions',
		'updateMediaWorkFlowStep' = 'peripheralDevice.mediaManager.updateMediaWorkFlowStep',

		// Package Manager:
		'insertExpectedPackageWorkStatus' = 'peripheralDevice.packageManager.insertExpectedPackageWorkStatus',
		'updateExpectedPackageWorkStatus' = 'peripheralDevice.packageManager.updateExpectedPackageWorkStatus',
		'removeExpectedPackageWorkStatus' = 'peripheralDevice.packageManager.removeExpectedPackageWorkStatus',
		'removeAllExpectedPackageWorkStatusOfDevice' = 'peripheralDevice.packageManager.removeAllExpectedPackageWorkStatusOfDevice',

		'updatePackageContainerPackageStatus' = 'peripheralDevice.packageManager.updatePackageContainerPackageStatus',
		'fetchPackageInfoMetadata' = 'peripheralDevice.packageManager.fetchPackageInfoMetadata',
		'updatePackageInfo' = 'peripheralDevice.packageManager.updatePackageInfo',
		'removePackageInfo' = 'peripheralDevice.packageManager.removePackageInfo',

		// Spreadsheed-gateway
		'requestUserAuthToken' = 'peripheralDevice.spreadsheet.requestUserAuthToken',
		'storeAccessToken' = 'peripheralDevice.spreadsheet.storeAccessToken',
	}

	export type initialize = (id: string, token: string, options: InitOptions) => Promise<string>
	export type unInitialize = (id: string, token: string, status: StatusObject) => Promise<StatusObject>
	export type setStatus = (id: string, token: string, status: StatusObject) => Promise<StatusObject>
	export type executeFunction = (
		deviceId: string,
		cb: (err: any, result: any) => void,
		functionName: string,
		...args: any[]
	) => void
}
