import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { ExpectedPackageStatusAPI } from '@sofie-automation/blueprints-integration'
import { PeripheralDeviceId, PeripheralDevice } from '../collections/PeripheralDevices'
import { MediaWorkFlowId, MediaWorkFlow } from '../collections/MediaWorkFlows'
import { MediaObject } from '../collections/MediaObjects'
import { MediaWorkFlowStepId, MediaWorkFlowStep } from '../collections/MediaWorkFlowSteps'
import { TimelineHash } from '../collections/Timeline'
import { ExpectedPackageId } from '../collections/ExpectedPackages'
import { ExpectedPackageWorkStatusId } from '../collections/ExpectedPackageWorkStatuses'

// This file contains methods that are called externally from PeripheralDevices

export interface NewPeripheralDeviceAPI {
	initialize(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		options: PeripheralDeviceAPI.InitOptions
	): Promise<PeripheralDeviceId>
	unInitialize(deviceId: PeripheralDeviceId, deviceToken: string): Promise<PeripheralDeviceId>
	setStatus(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		status: PeripheralDeviceAPI.StatusObject
	): Promise<PeripheralDeviceAPI.StatusObject>
	ping(deviceId: PeripheralDeviceId, deviceToken: string): Promise<void>
	getPeripheralDevice(deviceId: PeripheralDeviceId, deviceToken: string): Promise<PeripheralDevice>
	partPlaybackStarted(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		r: PeripheralDeviceAPI.PartPlaybackStartedResult
	): Promise<void>
	partPlaybackStopped(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		r: PeripheralDeviceAPI.PartPlaybackStartedResult
	): Promise<void>
	piecePlaybackStopped(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		r: PeripheralDeviceAPI.PiecePlaybackStartedResult
	): Promise<void>
	piecePlaybackStarted(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		r: PeripheralDeviceAPI.PiecePlaybackStartedResult
	): Promise<void>
	pingWithCommand(deviceId: PeripheralDeviceId, deviceToken: string, message: string, cb?: Function): Promise<void>
	killProcess(deviceId: PeripheralDeviceId, deviceToken: string, really: boolean): Promise<boolean>
	testMethod(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		returnValue: string,
		throwError?: boolean
	): Promise<string>
	timelineTriggerTime(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		r: PeripheralDeviceAPI.TimelineTriggerTimeResult
	): Promise<void>
	requestUserAuthToken(deviceId: PeripheralDeviceId, deviceToken: string, authUrl: string): Promise<void>
	storeAccessToken(deviceId: PeripheralDeviceId, deviceToken: string, authToken: any): Promise<void>
	reportResolveDone(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		timelineHash: TimelineHash,
		resolveDuration: number
	)

	dataRundownList(deviceId: PeripheralDeviceId, deviceToken: string): Promise<string[]>
	dataRundownGet(deviceId: PeripheralDeviceId, deviceToken: string, rundownExternalId: string): Promise<IngestRundown>
	dataRundownDelete(deviceId: PeripheralDeviceId, deviceToken: string, rundownExternalId: string): Promise<void>
	dataRundownCreate(deviceId: PeripheralDeviceId, deviceToken: string, ingestRundown: IngestRundown): Promise<void>
	dataRundownUpdate(deviceId: PeripheralDeviceId, deviceToken: string, ingestRundown: IngestRundown): Promise<void>
	dataSegmentGet(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		segmentExternalId: string
	): Promise<IngestSegment>
	dataSegmentDelete(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		segmentExternalId: string
	): Promise<void>
	dataSegmentCreate(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		ingestSegment: IngestSegment
	): Promise<void>
	dataSegmentUpdate(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		ingestSegment: IngestSegment
	): Promise<void>
	dataSegmentRanksUpdate(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		newRanks: { [segmentExternalId: string]: number }
	): Promise<void>
	dataPartDelete(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		segmentExternalId: string,
		partExternalId: string
	): Promise<void>
	dataPartCreate(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		segmentExternalId: string,
		ingestPart: IngestPart
	): Promise<void>
	dataPartUpdate(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		segmentExternalId: string,
		ingestPart: IngestPart
	): Promise<void>

	mosRoCreate(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		mosRunningOrder: FakeMOS.IMOSRunningOrder
	): Promise<void>
	mosRoReplace(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		mosRunningOrder: FakeMOS.IMOSRunningOrder
	): Promise<void>
	mosRoDelete(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		mosRunningOrderId: FakeMOS.MosString128,
		force?: boolean
	): Promise<void>
	mosRoMetadata(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		metadata: FakeMOS.IMOSRunningOrderBase
	): Promise<void>
	mosRoStatus(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		status: FakeMOS.IMOSRunningOrderStatus
	): Promise<void>
	mosRoStoryStatus(deviceId: PeripheralDeviceId, deviceToken: string, status: FakeMOS.IMOSStoryStatus): Promise<void>
	mosRoItemStatus(deviceId: PeripheralDeviceId, deviceToken: string, status: FakeMOS.IMOSItemStatus): Promise<void>
	mosRoStoryInsert(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: FakeMOS.IMOSStoryAction,
		Stories: Array<FakeMOS.IMOSROStory>
	): Promise<void>
	mosRoItemInsert(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: FakeMOS.IMOSItemAction,
		Items: Array<FakeMOS.IMOSItem>
	): Promise<void>
	mosRoStoryReplace(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: FakeMOS.IMOSStoryAction,
		Stories: Array<FakeMOS.IMOSROStory>
	): Promise<void>
	mosRoItemReplace(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: FakeMOS.IMOSItemAction,
		Items: Array<FakeMOS.IMOSItem>
	): Promise<void>
	mosRoStoryMove(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: FakeMOS.IMOSStoryAction,
		Stories: Array<FakeMOS.MosString128>
	): Promise<void>
	mosRoItemMove(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: FakeMOS.IMOSItemAction,
		Items: Array<FakeMOS.MosString128>
	): Promise<void>
	mosRoStoryDelete(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: FakeMOS.IMOSROAction,
		Stories: Array<FakeMOS.MosString128>
	): Promise<void>
	mosRoItemDelete(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: FakeMOS.IMOSStoryAction,
		Items: Array<FakeMOS.MosString128>
	): Promise<void>
	mosRoStorySwap(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: FakeMOS.IMOSROAction,
		StoryID0: FakeMOS.MosString128,
		StoryID1: FakeMOS.MosString128
	): Promise<void>
	mosRoItemSwap(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: FakeMOS.IMOSStoryAction,
		ItemID0: FakeMOS.MosString128,
		ItemID1: FakeMOS.MosString128
	): Promise<void>
	mosRoReadyToAir(deviceId: PeripheralDeviceId, deviceToken: string, Action: FakeMOS.IMOSROReadyToAir): Promise<void>
	mosRoFullStory(deviceId: PeripheralDeviceId, deviceToken: string, story: FakeMOS.IMOSROFullStory): Promise<void>

	getMediaObjectRevisions(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		collectionId: string
	): Promise<MediaObjectRevision[]>
	updateMediaObject(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		collectionId: string,
		id: string,
		doc: MediaObject | null
	): Promise<void>
	clearMediaObjectCollection(deviceId: PeripheralDeviceId, deviceToken: string, collectionId: string): Promise<void>

	getMediaWorkFlowRevisions(deviceId: PeripheralDeviceId, deviceToken: string): Promise<MediaWorkFlowRevision[]>
	getMediaWorkFlowStepRevisions(
		deviceId: PeripheralDeviceId,
		deviceToken: string
	): Promise<MediaWorkFlowStepRevision[]>
	updateMediaWorkFlow(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		workFlowId: MediaWorkFlowId,
		obj: MediaWorkFlow | null
	): Promise<void>
	updateMediaWorkFlowStep(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		docId: MediaWorkFlowStepId,
		obj: MediaWorkFlowStep | null
	): Promise<void>

	insertExpectedPackageWorkStatus(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		workStatusId: ExpectedPackageWorkStatusId,
		workStatus: ExpectedPackageStatusAPI.WorkStatus
	): Promise<void>
	updateExpectedPackageWorkStatus(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		workStatusId: ExpectedPackageWorkStatusId,
		workStatus: Partial<ExpectedPackageStatusAPI.WorkStatus>
	): Promise<boolean>
	removeExpectedPackageWorkStatus(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		workStatusId: ExpectedPackageWorkStatusId
	): Promise<void>
	removeAllExpectedPackageWorkStatusOfDevice(deviceId: PeripheralDeviceId, deviceToken: string): Promise<void>

	updatePackageContainerPackageStatus(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		containerId: string,
		packageId: string,
		packageStatus: ExpectedPackageStatusAPI.PackageContainerPackageStatus | null
	): Promise<void>

	fetchPackageInfoMetadata(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		type: string,
		packageIds: ExpectedPackageId[]
	): Promise<{ packageId: ExpectedPackageId; expectedContentVersionHash: string; actualContentVersionHash: string }[]>
	updatePackageInfo(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		type: string,
		packageId: ExpectedPackageId,
		expectedContentVersionHash: string,
		actualContentVersionHash: string,
		payload: any
	): Promise<void>
	removePackageInfo(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		type: string,
		packageId: ExpectedPackageId
	): Promise<void>

	determineDiffTime(): Promise<DiffTimeResult>
	getTimeDiff(): Promise<TimeDiff>
	getTime(): Promise<number>
}

export interface TimeDiff {
	currentTime: number
	systemRawTime: number
	diff: number
	stdDev: number
	good: boolean
}
export interface DiffTimeResult {
	mean: number
	stdDev: number
}
export interface MediaObjectRevision {
	id: string
	rev: string
}
export interface MediaWorkFlowRevision {
	_id: MediaWorkFlowId
	_rev: string
}
export interface MediaWorkFlowStepRevision {
	_id: MediaWorkFlowStepId
	_rev: string
}
// Faking the MOS interface for now, so we don't have to expose mos-connection to the client
namespace FakeMOS {
	export type IMOSItem = any
	export type IMOSItemAction = any
	export type IMOSItemStatus = any
	export type IMOSROAction = any
	export type IMOSROFullStory = any
	export type IMOSROReadyToAir = any
	export type IMOSROStory = any
	export type IMOSRunningOrder = any
	export type IMOSRunningOrderBase = any
	export type IMOSRunningOrderStatus = any
	export type IMOSStoryAction = any
	export type IMOSStoryStatus = any
	export type MosString128 = any
}
// Fakin these, so we don't have to expose this to the client
type IngestRundown = any
type IngestSegment = any
type IngestPart = any
