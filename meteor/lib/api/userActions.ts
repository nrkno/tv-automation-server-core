import { ClientAPI } from '../api/client'
import { MethodContext } from './methods'
import { RundownPlaylistId } from '../collections/RundownPlaylists'
import { PartId } from '../collections/Parts'
import { RundownId } from '../collections/Rundowns'
import { PartInstanceId } from '../collections/PartInstances'
import { PieceInstanceId } from '../collections/PieceInstances'
import { PieceId } from '../collections/Pieces'
import { EvaluationBase } from '../collections/Evaluations'
import { StudioId } from '../collections/Studios'
import { MediaWorkFlowId } from '../collections/MediaWorkFlows'
import { SnapshotId } from '../collections/Snapshots'
import { SegmentId } from '../collections/Segments'
import { ShowStyleVariantId } from '../collections/ShowStyleVariants'
import { BucketId, Bucket } from '../collections/Buckets'
import { IngestAdlib, ActionUserData } from '@sofie-automation/blueprints-integration'
import { BucketAdLib } from '../collections/BucketAdlibs'
import { AdLibActionId, AdLibActionCommon } from '../collections/AdLibActions'
import { BucketAdLibAction } from '../collections/BucketAdlibActions'
import { PeripheralDeviceId } from '../collections/PeripheralDevices'

export interface NewUserActionAPI extends MethodContext {
	take(userEvent: string, rundownPlaylistId: RundownPlaylistId): Promise<ClientAPI.ClientResponse<void>>
	setNext(
		userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		partId: PartId,
		timeOffset?: number
	): Promise<ClientAPI.ClientResponse<void>>
	setNextSegment(
		userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		segmentId: SegmentId | null
	): Promise<ClientAPI.ClientResponse<void>>
	moveNext(
		userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		horisontalDelta: number,
		verticalDelta: number
	): Promise<ClientAPI.ClientResponse<PartId | null>>
	prepareForBroadcast(
		userEvent: string,
		rundownPlaylistId: RundownPlaylistId
	): Promise<ClientAPI.ClientResponse<void>>
	resetRundownPlaylist(
		userEvent: string,
		rundownPlaylistId: RundownPlaylistId
	): Promise<ClientAPI.ClientResponse<void>>
	resetAndActivate(
		userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		rehearsal?: boolean
	): Promise<ClientAPI.ClientResponse<void>>
	activate(
		userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		rehearsal: boolean
	): Promise<ClientAPI.ClientResponse<void>>
	deactivate(userEvent: string, rundownPlaylistId: RundownPlaylistId): Promise<ClientAPI.ClientResponse<void>>
	forceResetAndActivate(
		userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		rehearsal: boolean
	): Promise<ClientAPI.ClientResponse<void>>
	disableNextPiece(
		userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		undo?: boolean
	): Promise<ClientAPI.ClientResponse<void>>
	pieceTakeNow(
		userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		pieceInstanceIdOrPieceIdToCopy: PieceInstanceId | PieceId
	): Promise<ClientAPI.ClientResponse<void>>
	setInOutPoints(
		userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		partId: PartId,
		pieceId: PieceId,
		inPoint: number,
		duration: number
	): Promise<ClientAPI.ClientResponse<void>>
	executeAction(
		userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		actionId: string,
		userData: ActionUserData,
		triggerMode?: string
	): Promise<ClientAPI.ClientResponse<void>>
	segmentAdLibPieceStart(
		userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		adLibPieceId: PieceId,
		queue: boolean
	)
	sourceLayerOnPartStop(
		userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		sourceLayerIds: string[]
	)
	baselineAdLibPieceStart(
		userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		adlibPieceId: PieceId,
		queue: boolean
	)
	sourceLayerStickyPieceStart(
		userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		sourceLayerId: string
	): Promise<ClientAPI.ClientResponse<void>>
	bucketAdlibImport(
		_userEvent: string,
		studioId: StudioId,
		showStyleVariantId: ShowStyleVariantId,
		bucketId: BucketId,
		ingestItem: IngestAdlib
	)
	bucketAdlibStart(
		_userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		bucketAdlibId: PieceId,
		queue?: boolean
	)
	activateHold(
		userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		undo?: boolean
	): Promise<ClientAPI.ClientResponse<void>>
	saveEvaluation(userEvent: string, evaluation: EvaluationBase): Promise<ClientAPI.ClientResponse<void>>
	storeRundownSnapshot(
		userEvent: string,
		playlistId: RundownPlaylistId,
		reason: string
	): Promise<ClientAPI.ClientResponse<SnapshotId>>
	removeRundownPlaylist(userEvent: string, playlistId: RundownPlaylistId): Promise<ClientAPI.ClientResponse<void>>
	resyncRundownPlaylist(
		userEvent: string,
		playlistId: RundownPlaylistId
	): Promise<ClientAPI.ClientResponse<ReloadRundownPlaylistResponse>>
	removeRundown(userEvent: string, rundownId: RundownId): Promise<ClientAPI.ClientResponse<void>>
	resyncRundown(userEvent: string, rundownId: RundownId): Promise<ClientAPI.ClientResponse<TriggerReloadDataResponse>>
	unsyncRundown(userEvent: string, rundownId: RundownId): Promise<ClientAPI.ClientResponse<void>> //
	resyncSegment(
		userEvent: string,
		rundownId: RundownId,
		segmentId: SegmentId
	): Promise<ClientAPI.ClientResponse<TriggerReloadDataResponse>>
	mediaRestartWorkflow(userEvent: string, workflowId: MediaWorkFlowId): Promise<ClientAPI.ClientResponse<void>>
	mediaAbortWorkflow(userEvent: string, workflowId: MediaWorkFlowId): Promise<ClientAPI.ClientResponse<void>>
	mediaPrioritizeWorkflow(userEvent: string, workflowId: MediaWorkFlowId): Promise<ClientAPI.ClientResponse<void>>
	mediaRestartAllWorkflows(userEvent: string): Promise<ClientAPI.ClientResponse<void>>
	mediaAbortAllWorkflows(userEvent: string): Promise<ClientAPI.ClientResponse<void>>
	packageManagerRestartExpectation(
		userEvent: string,
		deviceId: PeripheralDeviceId,
		workId: string
	): Promise<ClientAPI.ClientResponse<void>>
	packageManagerRestartAllExpectations(userEvent: string, studioId: StudioId): Promise<ClientAPI.ClientResponse<void>>
	packageManagerAbortExpectation(
		userEvent: string,
		deviceId: PeripheralDeviceId,
		workId: string
	): Promise<ClientAPI.ClientResponse<void>>
	regenerateRundownPlaylist(userEvent: string, playlistId: RundownPlaylistId): Promise<ClientAPI.ClientResponse<void>>
	generateRestartToken(userEvent: string): Promise<ClientAPI.ClientResponse<string>>
	restartCore(userEvent: string, token: string): Promise<ClientAPI.ClientResponse<string>>
	guiFocused(userEvent: string, viewInfo?: any[]): Promise<ClientAPI.ClientResponse<void>>
	guiBlurred(userEvent: string, viewInfo?: any[]): Promise<ClientAPI.ClientResponse<void>>
	bucketsRemoveBucket(userEvent: string, id: BucketId): Promise<ClientAPI.ClientResponse<void>>
	bucketsModifyBucket(
		userEvent: string,
		id: BucketId,
		bucket: Partial<Omit<Bucket, '_id'>>
	): Promise<ClientAPI.ClientResponse<void>>
	bucketsEmptyBucket(userEvent: string, id: BucketId): Promise<ClientAPI.ClientResponse<void>>
	bucketsCreateNewBucket(
		userEvent: string,
		name: string,
		studioId: StudioId,
		userId: string | null
	): Promise<ClientAPI.ClientResponse<Bucket>>
	bucketsRemoveBucketAdLib(userEvent: string, id: PieceId): Promise<ClientAPI.ClientResponse<void>>
	bucketsRemoveBucketAdLibAction(userEvent: string, id: AdLibActionId): Promise<ClientAPI.ClientResponse<void>>
	bucketsModifyBucketAdLib(
		userEvent: string,
		id: PieceId,
		bucket: Partial<Omit<BucketAdLib, '_id'>>
	): Promise<ClientAPI.ClientResponse<void>>
	bucketsModifyBucketAdLibAction(
		userEvent: string,
		id: AdLibActionId,
		action: Partial<Omit<BucketAdLibAction, '_id'>>
	): Promise<ClientAPI.ClientResponse<void>>
	bucketsSaveActionIntoBucket(
		userEvent: string,
		studioId: StudioId,
		action: AdLibActionCommon | BucketAdLibAction,
		bucketId: BucketId
	): Promise<ClientAPI.ClientResponse<BucketAdLibAction>>
	switchRouteSet(
		userEvent: string,
		studioId: StudioId,
		routeSetId: string,
		state: boolean
	): Promise<ClientAPI.ClientResponse<void>>
	moveRundown(
		userEvent: string,
		rundownId: RundownId,
		intoPlaylistId: RundownPlaylistId | null,
		rundownsIdsInPlaylistInOrder: RundownId[]
	): Promise<ClientAPI.ClientResponse<void>>
	restoreRundownOrder(userEvent: string, playlistId: RundownPlaylistId): Promise<ClientAPI.ClientResponse<void>>
}

export enum UserActionAPIMethods {
	'take' = 'userAction.take',
	'setNext' = 'userAction.setNext',
	'setNextSegment' = 'userAction.setNextSegment',
	'moveNext' = 'userAction.moveNext',

	'prepareForBroadcast' = 'userAction.prepareForBroadcast',
	'resetRundownPlaylist' = 'userAction.resetRundownPlaylist',
	'resetAndActivate' = 'userAction.resetAndActivate',
	'forceResetAndActivate' = 'userAction.forceResetAndActivate',
	'activate' = 'userAction.activate',
	'deactivate' = 'userAction.deactivate',
	'unsyncRundown' = 'userAction.unsyncRundown',

	'disableNextPiece' = 'userAction.disableNextPiece',
	'pieceTakeNow' = 'userAction.pieceTakeNow',
	'setInOutPoints' = 'userAction.pieceSetInOutPoints',
	'executeAction' = 'userAction.executeAction',

	'bucketAdlibImport' = 'userAction.bucketAdlibImport',
	'bucketAdlibStart' = 'userAction.bucketAdlibStart',

	'bucketsCreateNewBucket' = 'userAction.createBucket',
	'bucketsRemoveBucket' = 'userAction.removeBucket',
	'bucketsEmptyBucket' = 'userAction.emptyBucket',
	'bucketsModifyBucket' = 'userAction.modifyBucket',
	'bucketsRemoveBucketAdLib' = 'userAction.removeBucketAdLib',
	'bucketsRemoveBucketAdLibAction' = 'userAction.removeBucketAdLibAction',
	'bucketsModifyBucketAdLib' = 'userAction.bucketsModifyBucketAdLib',
	'bucketsModifyBucketAdLibAction' = 'userAction.bucketsModifyBucketAdLibAction',
	'bucketsSaveActionIntoBucket' = 'userAction.bucketsSaveActionIntoBucket',

	'segmentAdLibPieceStart' = 'userAction.segmentAdLibPieceStart',
	'sourceLayerOnPartStop' = 'userAction.sourceLayerOnPartStop',
	'baselineAdLibPieceStart' = 'userAction.baselineAdLibPieceStart',

	'sourceLayerStickyPieceStart' = 'userAction.sourceLayerStickyPieceStart',

	'activateHold' = 'userAction.activateHold',

	'saveEvaluation' = 'userAction.saveEvaluation',

	'storeRundownSnapshot' = 'userAction.storeRundownSnapshot',

	'removeRundownPlaylist' = 'userAction.removeRundownPlaylist',
	'resyncRundownPlaylist' = 'userAction.resyncRundownPlaylist',

	'removeRundown' = 'userAction.removeRundown',
	'resyncRundown' = 'userAction.resyncRundown',
	'resyncSegment' = 'userAction.resyncSegment',

	'mediaRestartWorkflow' = 'userAction.mediamanager.restartWorkflow',
	'mediaAbortWorkflow' = 'userAction.mediamanager.abortWorkflow',
	'mediaRestartAllWorkflows' = 'userAction.mediamanager.restartAllWorkflows',
	'mediaAbortAllWorkflows' = 'userAction.mediamanager.abortAllWorkflows',
	'mediaPrioritizeWorkflow' = 'userAction.mediamanager.mediaPrioritizeWorkflow',

	'packageManagerRestartExpectation' = 'userAction.packagemanager.restartExpectation',
	'packageManagerRestartAllExpectations' = 'userAction.packagemanager.restartAllExpectations',
	'packageManagerAbortExpectation' = 'userAction.packagemanager.abortExpectation',

	'regenerateRundownPlaylist' = 'userAction.ingest.regenerateRundownPlaylist',

	'generateRestartToken' = 'userAction.system.generateRestartToken',
	'restartCore' = 'userAction.system.restartCore',

	'guiFocused' = 'userAction.focused',
	'guiBlurred' = 'userAction.blurred',

	// 'getTranslationBundle' = 'userAction.getTranslationBundle',

	'switchRouteSet' = 'userAction.switchRouteSet',
	'moveRundown' = 'userAction.moveRundown',
	'restoreRundownOrder' = 'userAction.restoreRundownOrder',
}

export interface ReloadRundownPlaylistResponse {
	rundownsResponses: {
		rundownId: RundownId
		response: TriggerReloadDataResponse
	}[]
}

export enum TriggerReloadDataResponse {
	/** When reloading has been successfully completed */
	COMPLETED = 'ok',
	/** When reloading has successfully started, and will finish asynchronously */
	WORKING = 'working',
	/** When reloading cannot continue, because the rundown is missing */
	MISSING = 'missing',
}

export const RESTART_SALT = 'clientRestart_'
