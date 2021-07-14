import * as _ from 'underscore'
import { check, Match } from '../../lib/check'
import { Meteor } from 'meteor/meteor'
import { ClientAPI } from '../../lib/api/client'
import { Awaited, getCurrentTime, getHash, makePromise, waitForPromise } from '../../lib/lib'
import { Rundowns, RundownHoldState, RundownId } from '../../lib/collections/Rundowns'
import { Parts, Part, PartId } from '../../lib/collections/Parts'
import { logger } from '../logging'
import { ServerPlayoutAPI } from './playout/playout'
import { NewUserActionAPI, RESTART_SALT, UserActionAPIMethods } from '../../lib/api/userActions'
import { EvaluationBase } from '../../lib/collections/Evaluations'
import { StudioId } from '../../lib/collections/Studios'
import { Pieces, PieceId } from '../../lib/collections/Pieces'
import { SourceLayerType, IngestPart, IngestAdlib, ActionUserData } from '@sofie-automation/blueprints-integration'
import { storeRundownPlaylistSnapshot } from './snapshot'
import { registerClassToMeteorMethods } from '../methods'
import { ServerRundownAPI } from './rundown'
import { saveEvaluation } from './evaluations'
import { MediaManagerAPI } from './mediaManager'
import { IngestDataCache, IngestCacheType } from '../../lib/collections/IngestDataCache'
import { MOSDeviceActions } from './ingest/mosDevice/actions'
import { getActiveRundownPlaylistsInStudioFromDb } from './studio/lib'
import { IngestActions } from './ingest/actions'
import { RundownPlaylistId } from '../../lib/collections/RundownPlaylists'
import { PartInstances, PartInstanceId } from '../../lib/collections/PartInstances'
import {
	PieceInstances,
	PieceInstanceId,
	PieceInstancePiece,
	omitPiecePropertiesForInstance,
} from '../../lib/collections/PieceInstances'
import { MediaWorkFlowId } from '../../lib/collections/MediaWorkFlows'
import { MethodContext, MethodContextAPI } from '../../lib/api/methods'
import { ServerClientAPI } from './client'
import { SegmentId, Segment, Segments } from '../../lib/collections/Segments'
import { Settings } from '../../lib/Settings'
import { OrganizationContentWriteAccess } from '../security/organization'
import { SystemWriteAccess } from '../security/system'
import { triggerWriteAccessBecauseNoCheckNecessary } from '../security/lib/securityVerify'
import { pushWorkToQueue } from '../codeControl'
import { ShowStyleVariantId } from '../../lib/collections/ShowStyleVariants'
import { BucketId, Buckets, Bucket } from '../../lib/collections/Buckets'
import { updateBucketAdlibFromIngestData } from './ingest/bucketAdlibs'
import { ServerPlayoutAdLibAPI } from './playout/adlib'
import { BucketsAPI } from './buckets'
import { BucketAdLib } from '../../lib/collections/BucketAdlibs'
import { rundownContentAllowWrite } from '../security/rundown'
import { profiler } from './profiler'
import { AdLibActionId, AdLibActionCommon } from '../../lib/collections/AdLibActions'
import { BucketAdLibAction } from '../../lib/collections/BucketAdlibActions'
import { checkAccessAndGetPlaylist, checkAccessAndGetRundown, checkAccessToPlaylist } from './lib'
import { PackageManagerAPI } from './packageManager'
import { PeripheralDeviceId } from '../../lib/collections/PeripheralDevices'
import { moveRundownIntoPlaylist, restoreRundownsInPlaylistToDefaultOrder } from './rundownPlaylist'
import { getShowStyleCompound } from './showStyles'
import { RundownBaselineAdLibActionId } from '../../lib/collections/RundownBaselineAdLibActions'
import { SnapshotId } from '../../lib/collections/Snapshots'

let MINIMUM_TAKE_SPAN = 1000
export function setMinimumTakeSpan(span: number) {
	// Used in tests
	MINIMUM_TAKE_SPAN = span
}
/*
	The functions in this file are used to provide a pre-check, before calling the real functions.
	The pre-checks should contain relevant checks, to return user-friendly messages instead of throwing a nasty error.

	If it's not possible to perform an action due to an internal error (such as data not found, etc)
		-> throw an error
	If it's not possible to perform an action due to something the user can easily fix
		-> ClientAPI.responseError('Friendly message')
*/

// TODO - these use the rundownSyncFunction earlier, to ensure there arent differences when we get to the syncFunction?
export async function take(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId
): Promise<ClientAPI.ClientResponse<void>> {
	// Called by the user. Wont throw as nasty errors
	const now = getCurrentTime()

	return pushWorkToQueue(`userActionsTake_${rundownPlaylistId}`, 'take', async () => {
		const access = checkAccessToPlaylist(context, rundownPlaylistId)
		const playlist = access.playlist

		if (!playlist.activationId) {
			return ClientAPI.responseError(`Rundown is not active, please activate the rundown before doing a TAKE.`)
		}
		if (!playlist.nextPartInstanceId) {
			return ClientAPI.responseError('No Next point found, please set a part as Next before doing a TAKE.')
		}
		if (playlist.currentPartInstanceId) {
			const currentPartInstance = await PartInstances.findOneAsync(playlist.currentPartInstanceId)
			if (currentPartInstance && currentPartInstance.timings) {
				const lastStartedPlayback = currentPartInstance.timings.startedPlayback || 0
				const lastTake = currentPartInstance.timings.take || 0
				const lastChange = Math.max(lastTake, lastStartedPlayback)
				if (now - lastChange < MINIMUM_TAKE_SPAN) {
					logger.debug(
						`Time since last take is shorter than ${MINIMUM_TAKE_SPAN} for ${currentPartInstance._id}: ${
							getCurrentTime() - lastStartedPlayback
						}`
					)
					logger.debug(`lastStartedPlayback: ${lastStartedPlayback}, getCurrentTime(): ${getCurrentTime()}`)
					return ClientAPI.responseError(
						`Ignoring TAKES that are too quick after eachother (${MINIMUM_TAKE_SPAN} ms)`
					)
				}
			} else {
				// Don't throw an error here. It's bad, but it's more important to be able to continue with the take.
				logger.error(
					`PartInstance "${playlist.currentPartInstanceId}", set as currentPart in "${rundownPlaylistId}", not found!`
				)
			}
		}
		return ServerPlayoutAPI.takeNextPart(access, playlist._id)
	})
}

export async function setNext(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId,
	nextPartId: PartId | null,
	setManually?: boolean,
	timeOffset?: number | undefined
): Promise<ClientAPI.ClientResponse<void>> {
	check(rundownPlaylistId, String)
	if (nextPartId) check(nextPartId, String)

	const access = checkAccessToPlaylist(context, rundownPlaylistId)
	const playlist = access.playlist
	if (!playlist.activationId)
		return ClientAPI.responseError(
			'RundownPlaylist is not active, please activate it before setting a part as Next'
		)

	let nextPart: Part | undefined
	if (nextPartId) {
		nextPart = await Parts.findOneAsync(nextPartId)
		if (!nextPart) throw new Meteor.Error(404, `Part "${nextPartId}" not found!`)

		if (!nextPart.isPlayable()) return ClientAPI.responseError('Part is unplayable, cannot set as next.')
	}

	if (playlist.holdState && playlist.holdState !== RundownHoldState.COMPLETE) {
		return ClientAPI.responseError('The Next cannot be changed next during a Hold!')
	}
	return ServerPlayoutAPI.setNextPart(access, rundownPlaylistId, nextPartId, setManually, timeOffset)
}
export async function setNextSegment(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId,
	nextSegmentId: SegmentId | null
): Promise<ClientAPI.ClientResponse<void>> {
	check(rundownPlaylistId, String)
	if (nextSegmentId) check(nextSegmentId, String)
	else check(nextSegmentId, null)

	const access = checkAccessToPlaylist(context, rundownPlaylistId)
	const playlist = access.playlist
	if (!playlist.activationId)
		return ClientAPI.responseError('Rundown is not active, please activate it before setting a part as Next')

	let nextSegment: Segment | null = null

	if (nextSegmentId) {
		nextSegment = (await Segments.findOneAsync(nextSegmentId)) || null
		if (!nextSegment) throw new Meteor.Error(404, `Segment "${nextSegmentId}" not found!`)

		const rundownIds = playlist.getRundownIDs()
		if (rundownIds.indexOf(nextSegment.rundownId) === -1) {
			throw new Meteor.Error(
				404,
				`Segment "${nextSegmentId}" does not belong to Rundown Playlist "${rundownPlaylistId}"!`
			)
		}

		const partsInSegment = await Parts.findFetchAsync({
			rundownId: nextSegment.rundownId,
			segmentId: nextSegment._id,
		})
		const firstValidPartInSegment = partsInSegment.find((p) => p.isPlayable())

		if (!firstValidPartInSegment) return ClientAPI.responseError('Segment contains no valid parts')

		const { currentPartInstance, nextPartInstance } = playlist.getSelectedPartInstances()
		if (!currentPartInstance || !nextPartInstance || nextPartInstance.segmentId !== currentPartInstance.segmentId) {
			// Special: in this case, the user probably dosen't want to setNextSegment, but rather just setNextPart
			return ServerPlayoutAPI.setNextPart(access, rundownPlaylistId, firstValidPartInSegment._id, true, 0)
		}
	}

	return ServerPlayoutAPI.setNextSegment(access, rundownPlaylistId, nextSegmentId)
}
export async function moveNext(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId,
	horisontalDelta: number,
	verticalDelta: number
): Promise<ClientAPI.ClientResponse<PartId | null>> {
	const access = checkAccessToPlaylist(context, rundownPlaylistId)
	const playlist = access.playlist
	if (!playlist.activationId)
		return ClientAPI.responseError('Rundown Playlist is not active, please activate it first')

	if (playlist.holdState && playlist.holdState !== RundownHoldState.COMPLETE) {
		return ClientAPI.responseError('The Next cannot be changed during a Hold!')
	}
	if (!playlist.nextPartInstanceId && !playlist.currentPartInstanceId) {
		return ClientAPI.responseError('RundownPlaylist has no next and no current part!')
	}

	return ClientAPI.responseSuccess(
		await ServerPlayoutAPI.moveNextPart(access, rundownPlaylistId, horisontalDelta, verticalDelta)
	)
}
export async function prepareForBroadcast(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId
): Promise<ClientAPI.ClientResponse<void>> {
	check(rundownPlaylistId, String)

	const access = checkAccessToPlaylist(context, rundownPlaylistId)
	const playlist = access.playlist

	if (playlist.activationId)
		return ClientAPI.responseError(
			'Rundown Playlist is active, please deactivate before preparing it for broadcast'
		)
	const anyOtherActiveRundowns = await getActiveRundownPlaylistsInStudioFromDb(playlist.studioId, playlist._id)
	if (anyOtherActiveRundowns.length) {
		return ClientAPI.responseError(
			409,
			'Only one rundown can be active at the same time. Currently active rundowns: ' +
				_.map(anyOtherActiveRundowns, (p) => p.name).join(', '),
			anyOtherActiveRundowns
		)
	}
	return ClientAPI.responseSuccess(
		await ServerPlayoutAPI.prepareRundownPlaylistForBroadcast(access, rundownPlaylistId)
	)
}
export async function resetRundownPlaylist(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId
): Promise<ClientAPI.ClientResponse<void>> {
	check(rundownPlaylistId, String)

	const access = checkAccessToPlaylist(context, rundownPlaylistId)
	const playlist = access.playlist

	if (playlist.activationId && !playlist.rehearsal && !Settings.allowRundownResetOnAir) {
		return ClientAPI.responseError(
			'RundownPlaylist is active but not in rehearsal, please deactivate it or set in in rehearsal to be able to reset it.'
		)
	}

	return ClientAPI.responseSuccess(await ServerPlayoutAPI.resetRundownPlaylist(access, rundownPlaylistId))
}
export async function resetAndActivate(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId,
	rehearsal?: boolean
): Promise<ClientAPI.ClientResponse<void>> {
	check(rundownPlaylistId, String)

	const access = checkAccessToPlaylist(context, rundownPlaylistId)
	const playlist = access.playlist

	if (playlist.activationId && !playlist.rehearsal && !Settings.allowRundownResetOnAir) {
		return ClientAPI.responseError(
			'RundownPlaylist is active but not in rehearsal, please deactivate it or set in in rehearsal to be able to reset it.'
		)
	}
	const anyOtherActiveRundownPlaylists = await getActiveRundownPlaylistsInStudioFromDb(
		playlist.studioId,
		playlist._id
	)
	if (anyOtherActiveRundownPlaylists.length) {
		return ClientAPI.responseError(
			409,
			'Only one rundownPlaylist can be active at the same time. Currently active rundownPlaylists: ' +
				_.map(anyOtherActiveRundownPlaylists, (p) => p.name).join(', '),
			anyOtherActiveRundownPlaylists
		)
	}

	return ClientAPI.responseSuccess(
		await ServerPlayoutAPI.resetAndActivateRundownPlaylist(access, rundownPlaylistId, rehearsal)
	)
}
export async function forceResetAndActivate(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId,
	rehearsal: boolean
): Promise<ClientAPI.ClientResponse<void>> {
	// Reset and activates a rundown, automatically deactivates any other running rundowns

	check(rehearsal, Boolean)
	const access = checkAccessToPlaylist(context, rundownPlaylistId)

	return ClientAPI.responseSuccess(
		await ServerPlayoutAPI.forceResetAndActivateRundownPlaylist(access, rundownPlaylistId, rehearsal)
	)
}
export async function activate(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId,
	rehearsal: boolean
): Promise<ClientAPI.ClientResponse<void>> {
	check(rundownPlaylistId, String)
	check(rehearsal, Boolean)

	const access = checkAccessToPlaylist(context, rundownPlaylistId)
	const playlist = access.playlist

	const anyOtherActiveRundowns = await getActiveRundownPlaylistsInStudioFromDb(playlist.studioId, playlist._id)

	if (anyOtherActiveRundowns.length) {
		return ClientAPI.responseError(
			409,
			'Only one rundown can be active at the same time. Currently active rundowns: ' +
				_.map(anyOtherActiveRundowns, (p) => p.name).join(', '),
			anyOtherActiveRundowns
		)
	}
	return ClientAPI.responseSuccess(await ServerPlayoutAPI.activateRundownPlaylist(access, playlist._id, rehearsal))
}
export async function deactivate(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId
): Promise<ClientAPI.ClientResponse<void>> {
	const access = checkAccessToPlaylist(context, rundownPlaylistId)

	return ClientAPI.responseSuccess(await ServerPlayoutAPI.deactivateRundownPlaylist(access, rundownPlaylistId))
}
export async function unsyncRundown(
	context: MethodContext,
	rundownId: RundownId
): Promise<ClientAPI.ClientResponse<void>> {
	return ClientAPI.responseSuccess(await ServerRundownAPI.unsyncRundown(context, rundownId))
}
export async function disableNextPiece(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId,
	undo?: boolean
): Promise<ClientAPI.ClientResponse<void>> {
	const access = checkAccessToPlaylist(context, rundownPlaylistId)

	return ServerPlayoutAPI.disableNextPiece(access, rundownPlaylistId, undo)
}
export async function pieceTakeNow(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId,
	partInstanceId: PartInstanceId,
	pieceInstanceIdOrPieceIdToCopy: PieceInstanceId | PieceId
): Promise<ClientAPI.ClientResponse<void>> {
	check(rundownPlaylistId, String)
	check(partInstanceId, String)
	check(pieceInstanceIdOrPieceIdToCopy, String)

	const access = checkAccessToPlaylist(context, rundownPlaylistId)
	const playlist = access.playlist

	if (!playlist.activationId)
		return ClientAPI.responseError(`The Rundown isn't active, please activate it before starting an AdLib!`)
	if (playlist.currentPartInstanceId !== partInstanceId)
		return ClientAPI.responseError(`Part AdLib-pieces can be only placed in a current part!`)

	let pieceToCopy: PieceInstancePiece | undefined
	let rundownId: RundownId | undefined
	const pieceInstanceToCopy = await PieceInstances.findOneAsync(pieceInstanceIdOrPieceIdToCopy)
	if (pieceInstanceToCopy) {
		pieceToCopy = pieceInstanceToCopy.piece
		rundownId = pieceInstanceToCopy.rundownId
	} else {
		const piece = await Pieces.findOneAsync(pieceInstanceIdOrPieceIdToCopy)
		if (piece) {
			pieceToCopy = omitPiecePropertiesForInstance(piece)
			rundownId = piece.startRundownId
		}
	}
	if (!pieceToCopy || !rundownId) {
		throw new Meteor.Error(404, `PieceInstance or Piece "${pieceInstanceIdOrPieceIdToCopy}" not found!`)
	}

	const rundown = await Rundowns.findOneAsync(rundownId)
	if (!rundown) throw new Meteor.Error(404, `Rundown "${rundownId}" not found!`)

	const partInstance = await PartInstances.findOneAsync({
		_id: partInstanceId,
		rundownId: rundown._id,
	})
	if (!partInstance) throw new Meteor.Error(404, `PartInstance "${partInstanceId}" not found!`)

	const showStyleBase = rundown.getShowStyleBase()
	const sourceLayerId = pieceToCopy.sourceLayerId
	const sourceL = showStyleBase.sourceLayers.find((i) => i._id === sourceLayerId)
	if (sourceL && (sourceL.type !== SourceLayerType.LOWER_THIRD || sourceL.exclusiveGroup))
		return ClientAPI.responseError(
			`PieceInstance or Piece "${pieceInstanceIdOrPieceIdToCopy}" is not a LOWER_THIRD piece!`
		)

	return ClientAPI.responseSuccess(
		await ServerPlayoutAPI.pieceTakeNow(access, rundownPlaylistId, partInstanceId, pieceInstanceIdOrPieceIdToCopy)
	)
}
export async function pieceSetInOutPoints(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId,
	partId: PartId,
	pieceId: PieceId,
	inPoint: number,
	duration: number
): Promise<ClientAPI.ClientResponse<void>> {
	check(rundownPlaylistId, String)
	check(partId, String)
	check(pieceId, String)
	check(inPoint, Number)
	check(duration, Number)

	const access = checkAccessToPlaylist(context, rundownPlaylistId)
	const playlist = access.playlist

	const part = await Parts.findOneAsync(partId)
	if (!part) throw new Meteor.Error(404, `Part "${partId}" not found!`)
	if (playlist.activationId && part.status === 'PLAY') {
		throw new Meteor.Error(`Part cannot be active while setting in/out!`) // @todo: un-hardcode
	}
	const rundown = await Rundowns.findOneAsync(part.rundownId)
	if (!rundown) throw new Meteor.Error(501, `Rundown "${part.rundownId}" not found!`)

	const partCache = await IngestDataCache.findOneAsync({
		rundownId: rundown._id,
		partId: part._id,
		type: IngestCacheType.PART,
	})
	if (!partCache) throw new Meteor.Error(404, `Part Cache for "${partId}" not found!`)
	const piece = await Pieces.findOneAsync(pieceId)
	if (!piece) throw new Meteor.Error(404, `Piece "${pieceId}" not found!`)

	// TODO: replace this with a general, non-MOS specific method
	try {
		await MOSDeviceActions.setPieceInOutPoint(
			rundown,
			piece,
			partCache.data as IngestPart,
			inPoint / 1000,
			duration / 1000
		) // MOS data is in seconds
		return ClientAPI.responseSuccess(undefined)
	} catch (error) {
		return ClientAPI.responseError(error)
	}
}
export async function executeAction(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId,
	actionDocId: AdLibActionId | RundownBaselineAdLibActionId,
	actionId: string,
	userData: any,
	triggerMode?: string
): Promise<ClientAPI.ClientResponse<void>> {
	check(rundownPlaylistId, String)
	check(actionDocId, String)
	check(actionId, String)
	check(userData, Match.Any)
	check(triggerMode, Match.Maybe(String))

	const access = checkAccessToPlaylist(context, rundownPlaylistId)
	const playlist = access.playlist

	if (!playlist.activationId)
		return ClientAPI.responseError(`The Rundown isn't active, please activate it before executing an action!`)
	if (!playlist.currentPartInstanceId)
		return ClientAPI.responseError(`No part is playing, please Take a part before executing an action.`)

	return ClientAPI.responseSuccess(
		await ServerPlayoutAPI.executeAction(access, rundownPlaylistId, actionDocId, actionId, userData, triggerMode)
	)
}
export async function segmentAdLibPieceStart(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId,
	partInstanceId: PartInstanceId,
	adlibPieceId: PieceId,
	queue: boolean
): Promise<ClientAPI.ClientResponse<void>> {
	check(rundownPlaylistId, String)
	check(partInstanceId, String)
	check(adlibPieceId, String)

	const access = checkAccessToPlaylist(context, rundownPlaylistId)
	const playlist = access.playlist

	if (!playlist.activationId)
		return ClientAPI.responseError(`The Rundown isn't active, please activate it before starting an AdLib!`)
	if (playlist.holdState === RundownHoldState.ACTIVE || playlist.holdState === RundownHoldState.PENDING) {
		return ClientAPI.responseError(`Can't start AdLibPiece when the Rundown is in Hold mode!`)
	}

	return ClientAPI.responseSuccess(
		await ServerPlayoutAPI.segmentAdLibPieceStart(access, rundownPlaylistId, partInstanceId, adlibPieceId, queue)
	)
}
export async function sourceLayerOnPartStop(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId,
	partInstanceId: PartInstanceId,
	sourceLayerIds: string[]
): Promise<ClientAPI.ClientResponse<void>> {
	check(rundownPlaylistId, String)
	check(partInstanceId, String)
	check(sourceLayerIds, Match.OneOf(String, Array))

	const access = checkAccessToPlaylist(context, rundownPlaylistId)
	const playlist = access.playlist

	if (!playlist.activationId)
		return ClientAPI.responseError(`The Rundown isn't active, can't stop an AdLib on a deactivated Rundown!`)

	return ClientAPI.responseSuccess(
		await ServerPlayoutAPI.sourceLayerOnPartStop(access, rundownPlaylistId, partInstanceId, sourceLayerIds)
	)
}
export async function rundownBaselineAdLibPieceStart(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId,
	partInstanceId: PartInstanceId,
	adlibPieceId: PieceId,
	queue: boolean
): Promise<ClientAPI.ClientResponse<void>> {
	check(rundownPlaylistId, String)
	check(partInstanceId, String)
	check(adlibPieceId, String)

	const access = checkAccessToPlaylist(context, rundownPlaylistId)
	const playlist = access.playlist

	if (!playlist.activationId)
		return ClientAPI.responseError(`The Rundown isn't active, please activate it before starting an AdLib!`)
	if (playlist.holdState === RundownHoldState.ACTIVE || playlist.holdState === RundownHoldState.PENDING) {
		return ClientAPI.responseError(`Can't start AdLib piece when the Rundown is in Hold mode!`)
	}
	return ClientAPI.responseSuccess(
		await ServerPlayoutAPI.rundownBaselineAdLibPieceStart(
			access,
			rundownPlaylistId,
			partInstanceId,
			adlibPieceId,
			queue
		)
	)
}
export async function sourceLayerStickyPieceStart(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId,
	sourceLayerId: string
): Promise<ClientAPI.ClientResponse<void>> {
	check(rundownPlaylistId, String)
	check(sourceLayerId, String)

	const access = checkAccessToPlaylist(context, rundownPlaylistId)
	const playlist = access.playlist

	if (!playlist.activationId)
		return ClientAPI.responseError(`The Rundown isn't active, please activate it before starting a sticky-item!`)
	if (!playlist.currentPartInstanceId)
		return ClientAPI.responseError(`No part is playing, please Take a part before starting a sticky-item.`)

	return ClientAPI.responseSuccess(
		await ServerPlayoutAPI.sourceLayerStickyPieceStart(access, rundownPlaylistId, sourceLayerId)
	)
}
export async function activateHold(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId,
	undo?: boolean
): Promise<ClientAPI.ClientResponse<void>> {
	check(rundownPlaylistId, String)

	const access = checkAccessToPlaylist(context, rundownPlaylistId)
	const playlist = access.playlist

	if (!playlist.currentPartInstanceId)
		return ClientAPI.responseError(`No part is currently playing, please Take a part before activating Hold mode!`)
	if (!playlist.nextPartInstanceId)
		return ClientAPI.responseError(`No part is set as Next, please set a Next before activating Hold mode!`)

	const { currentPartInstance, nextPartInstance } = playlist.getSelectedPartInstances()
	if (!currentPartInstance) throw new Meteor.Error(404, `PartInstance "${playlist.currentPartInstanceId}" not found!`)
	if (!nextPartInstance) throw new Meteor.Error(404, `PartInstance "${playlist.nextPartInstanceId}" not found!`)
	if (!undo && playlist.holdState) {
		return ClientAPI.responseError(`Rundown is already doing a hold!`)
	}
	if (undo && playlist.holdState !== RundownHoldState.PENDING) {
		return ClientAPI.responseError(`Can't undo hold from state: ${RundownHoldState[playlist.holdState || 0]}`)
	}

	if (!undo && currentPartInstance.part.segmentId !== nextPartInstance.part.segmentId) {
		return ClientAPI.responseError(400, `Can't do hold between segments!`)
	}

	if (undo) {
		return ClientAPI.responseSuccess(await ServerPlayoutAPI.deactivateHold(access, rundownPlaylistId))
	} else {
		return ClientAPI.responseSuccess(await ServerPlayoutAPI.activateHold(access, rundownPlaylistId))
	}
}
export function userSaveEvaluation(context: MethodContext, evaluation: EvaluationBase): ClientAPI.ClientResponse<void> {
	return ClientAPI.responseSuccess(saveEvaluation(context, evaluation))
}
export async function userStoreRundownSnapshot(
	context: MethodContext,
	playlistId: RundownPlaylistId,
	reason: string
): Promise<ClientAPI.ClientResponse<SnapshotId>> {
	return ClientAPI.responseSuccess(await storeRundownPlaylistSnapshot(context, playlistId, reason))
}
export async function removeRundownPlaylist(context: MethodContext, playlistId: RundownPlaylistId) {
	const playlist = checkAccessAndGetPlaylist(context, playlistId)

	return ClientAPI.responseSuccess(await ServerRundownAPI.removeRundownPlaylist(context, playlist._id))
}
export function resyncRundownPlaylist(context: MethodContext, playlistId: RundownPlaylistId) {
	const playlist = checkAccessAndGetPlaylist(context, playlistId)

	return ClientAPI.responseSuccess(ServerRundownAPI.resyncRundownPlaylist(context, playlist._id))
}
export async function removeRundown(context: MethodContext, rundownId: RundownId) {
	const rundown = checkAccessAndGetRundown(context, rundownId)

	return ClientAPI.responseSuccess(await ServerRundownAPI.removeRundown(context, rundown._id))
}
export function resyncRundown(context: MethodContext, rundownId: RundownId) {
	const rundown = checkAccessAndGetRundown(context, rundownId)

	return ClientAPI.responseSuccess(ServerRundownAPI.resyncRundown(context, rundown._id))
}
export function resyncSegment(context: MethodContext, rundownId: RundownId, segmentId: SegmentId) {
	rundownContentAllowWrite(context.userId, { rundownId })
	const segment = Segments.findOne(segmentId)
	if (!segment) throw new Meteor.Error(404, `Rundown "${segmentId}" not found!`)

	return ClientAPI.responseSuccess(ServerRundownAPI.resyncSegment(context, segment.rundownId, segmentId))
}
export function mediaRestartWorkflow(context: MethodContext, workflowId: MediaWorkFlowId) {
	return ClientAPI.responseSuccess(MediaManagerAPI.restartWorkflow(context, workflowId))
}
export function mediaAbortWorkflow(context: MethodContext, workflowId: MediaWorkFlowId) {
	return ClientAPI.responseSuccess(MediaManagerAPI.abortWorkflow(context, workflowId))
}
export function mediaPrioritizeWorkflow(context: MethodContext, workflowId: MediaWorkFlowId) {
	return ClientAPI.responseSuccess(MediaManagerAPI.prioritizeWorkflow(context, workflowId))
}
export function mediaRestartAllWorkflows(context: MethodContext) {
	const access = OrganizationContentWriteAccess.anyContent(context)
	return ClientAPI.responseSuccess(MediaManagerAPI.restartAllWorkflows(context, access.organizationId))
}
export function mediaAbortAllWorkflows(context: MethodContext) {
	const access = OrganizationContentWriteAccess.anyContent(context)
	return ClientAPI.responseSuccess(MediaManagerAPI.abortAllWorkflows(context, access.organizationId))
}
export function packageManagerRestartExpectation(context: MethodContext, deviceId: PeripheralDeviceId, workId: string) {
	return ClientAPI.responseSuccess(PackageManagerAPI.restartExpectation(context, deviceId, workId))
}
export function packageManagerRestartAllExpectations(context: MethodContext, studioId: StudioId) {
	return ClientAPI.responseSuccess(PackageManagerAPI.restartAllExpectationsInStudio(context, studioId))
}
export function packageManagerAbortExpectation(context: MethodContext, deviceId: PeripheralDeviceId, workId: string) {
	return ClientAPI.responseSuccess(PackageManagerAPI.abortExpectation(context, deviceId, workId))
}
export async function bucketsRemoveBucket(context: MethodContext, id: BucketId) {
	check(id, String)

	await BucketsAPI.removeBucket(context, id)

	return ClientAPI.responseSuccess(undefined)
}
export async function bucketsModifyBucket(context: MethodContext, id: BucketId, bucket: Partial<Omit<Bucket, '_id'>>) {
	check(id, String)
	check(bucket, Object)

	await BucketsAPI.modifyBucket(context, id, bucket)

	return ClientAPI.responseSuccess(undefined)
}
export async function bucketsEmptyBucket(context: MethodContext, id: BucketId) {
	check(id, String)

	await BucketsAPI.emptyBucket(context, id)

	return ClientAPI.responseSuccess(undefined)
}
export async function bucketsCreateNewBucket(
	context: MethodContext,
	name: string,
	studioId: StudioId,
	userId: string | null
) {
	check(name, String)
	check(studioId, String)

	const bucket = await BucketsAPI.createNewBucket(context, name, studioId, userId)

	return ClientAPI.responseSuccess(bucket)
}
export async function bucketsRemoveBucketAdLib(context: MethodContext, id: PieceId) {
	check(id, String)

	await BucketsAPI.removeBucketAdLib(context, id)

	return ClientAPI.responseSuccess(undefined)
}
export async function bucketsRemoveBucketAdLibAction(context: MethodContext, id: AdLibActionId) {
	check(id, String)

	await BucketsAPI.removeBucketAdLibAction(context, id)

	return ClientAPI.responseSuccess(undefined)
}
export async function bucketsModifyBucketAdLib(
	context: MethodContext,
	id: PieceId,
	adlib: Partial<Omit<BucketAdLib, '_id'>>
) {
	check(id, String)
	check(adlib, Object)

	await BucketsAPI.modifyBucketAdLib(context, id, adlib)

	return ClientAPI.responseSuccess(undefined)
}
export async function bucketsModifyBucketAdLibAction(
	context: MethodContext,
	id: AdLibActionId,
	action: Partial<Omit<BucketAdLibAction, '_id'>>
) {
	check(id, String)
	check(action, Object)

	await BucketsAPI.modifyBucketAdLibAction(context, id, action)

	return ClientAPI.responseSuccess(undefined)
}
export function regenerateRundownPlaylist(context: MethodContext, rundownPlaylistId: RundownPlaylistId) {
	check(rundownPlaylistId, String)

	const access = checkAccessToPlaylist(context, rundownPlaylistId)
	const playlist = access.playlist

	if (playlist.activationId) {
		return ClientAPI.responseError(`Rundown Playlist is active, please deactivate it before regenerating it.`)
	}

	return ClientAPI.responseSuccess(IngestActions.regenerateRundownPlaylist(access, rundownPlaylistId))
}

export async function bucketAdlibImport(
	context: MethodContext,
	studioId: StudioId,
	showStyleVariantId: ShowStyleVariantId,
	bucketId: BucketId,
	ingestItem: IngestAdlib
): Promise<ClientAPI.ClientResponse<undefined>> {
	const { studio } = OrganizationContentWriteAccess.studio(context, studioId)

	check(studioId, String)
	check(showStyleVariantId, String)
	check(bucketId, String)
	// TODO - validate IngestAdlib

	if (!studio) throw new Meteor.Error(404, `Studio "${studioId}" not found`)
	const showStyleCompound = await getShowStyleCompound(showStyleVariantId)
	if (!showStyleCompound) throw new Meteor.Error(404, `ShowStyle Variant "${showStyleVariantId}" not found`)

	if (studio.supportedShowStyleBase.indexOf(showStyleCompound._id) === -1) {
		throw new Meteor.Error(500, `ShowStyle Variant "${showStyleVariantId}" not supported by studio "${studioId}"`)
	}

	const bucket = await Buckets.findOneAsync(bucketId)
	if (!bucket) throw new Meteor.Error(404, `Bucket "${bucketId}" not found`)

	await updateBucketAdlibFromIngestData(showStyleCompound, studio, bucketId, ingestItem)

	return ClientAPI.responseSuccess(undefined)
}

export async function bucketsSaveActionIntoBucket(
	context: MethodContext,
	studioId: StudioId,
	action: AdLibActionCommon | BucketAdLibAction,
	bucketId: BucketId
) {
	check(studioId, String)
	check(bucketId, String)
	check(action, Object)

	const { studio } = OrganizationContentWriteAccess.studio(context, studioId)

	if (!studio) throw new Meteor.Error(404, `Studio "${studioId}" not found`)

	const result = await BucketsAPI.saveAdLibActionIntoBucket(context, studioId, action, bucketId)
	return ClientAPI.responseSuccess(result)
}

export function bucketAdlibStart(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId,
	partInstanceId: PartInstanceId,
	bucketAdlibId: PieceId,
	queue?: boolean
) {
	check(rundownPlaylistId, String)
	check(partInstanceId, String)
	check(bucketAdlibId, String)

	const access = checkAccessToPlaylist(context, rundownPlaylistId)

	const playlist = access.playlist
	if (!playlist.activationId)
		return ClientAPI.responseError(`The Rundown isn't active, please activate it before starting an AdLib!`)
	if (playlist.holdState === RundownHoldState.ACTIVE || playlist.holdState === RundownHoldState.PENDING) {
		return ClientAPI.responseError(`Can't start AdLibPiece when the Rundown is in Hold mode!`)
	}

	return ClientAPI.responseSuccess(
		ServerPlayoutAdLibAPI.startBucketAdlibPiece(access, rundownPlaylistId, partInstanceId, bucketAdlibId, !!queue)
	)
}

let restartToken: string | undefined = undefined

export function generateRestartToken(context: MethodContext) {
	SystemWriteAccess.system(context)
	restartToken = getHash('restart_' + getCurrentTime())
	return ClientAPI.responseSuccess(restartToken)
}

export function restartCore(
	context: MethodContext,
	hashedRestartToken: string
): ClientAPI.ClientResponseSuccess<string> {
	check(hashedRestartToken, String)

	SystemWriteAccess.system(context)

	if (hashedRestartToken !== getHash(RESTART_SALT + restartToken)) {
		throw new Meteor.Error(401, `Restart token is invalid`)
	}

	setTimeout(() => {
		// eslint-disable-next-line no-process-exit
		process.exit(0)
	}, 3000)
	return ClientAPI.responseSuccess(`Restarting Core in 3s.`)
}

export function noop(_context: MethodContext) {
	triggerWriteAccessBecauseNoCheckNecessary()
	return ClientAPI.responseSuccess(undefined)
}

export function switchRouteSet(
	context: MethodContext,
	studioId: StudioId,
	routeSetId: string,
	state: boolean
): ClientAPI.ClientResponse<void> {
	check(studioId, String)
	check(routeSetId, String)
	check(state, Boolean)

	return ServerPlayoutAPI.switchRouteSet(context, studioId, routeSetId, state)
}

export async function moveRundown(
	context: MethodContext,
	rundownId: RundownId,
	intoPlaylistId: RundownPlaylistId | null,
	rundownsIdsInPlaylistInOrder: RundownId[]
): Promise<ClientAPI.ClientResponse<void>> {
	check(rundownId, String)
	if (intoPlaylistId) check(intoPlaylistId, String)

	return ClientAPI.responseSuccess(
		await moveRundownIntoPlaylist(context, rundownId, intoPlaylistId, rundownsIdsInPlaylistInOrder)
	)
}
export async function restoreRundownOrder(
	context: MethodContext,
	playlistId: RundownPlaylistId
): Promise<ClientAPI.ClientResponse<void>> {
	check(playlistId, String)

	return ClientAPI.responseSuccess(await restoreRundownsInPlaylistToDefaultOrder(context, playlistId))
}

export async function traceAction<T extends (...args: any[]) => any>(
	description: string,
	fn: T,
	...args: Parameters<T>
): Promise<Awaited<ReturnType<T>>> {
	const transaction = profiler.startTransaction(description, 'userAction')
	return makePromise(() => {
		const res = waitForPromise(fn(...args))
		if (transaction) transaction.end()
		return res
	})
}

class ServerUserActionAPI extends MethodContextAPI implements NewUserActionAPI {
	async take(_userEvent: string, rundownPlaylistId: RundownPlaylistId) {
		return traceAction(UserActionAPIMethods.take, take, this, rundownPlaylistId)
	}
	async setNext(_userEvent: string, rundownPlaylistId: RundownPlaylistId, partId: PartId, timeOffset?: number) {
		return traceAction(UserActionAPIMethods.setNext, setNext, this, rundownPlaylistId, partId, true, timeOffset)
	}
	async setNextSegment(_userEvent: string, rundownPlaylistId: RundownPlaylistId, segmentId: SegmentId) {
		return traceAction(UserActionAPIMethods.setNextSegment, setNextSegment, this, rundownPlaylistId, segmentId)
	}
	async moveNext(
		_userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		horisontalDelta: number,
		verticalDelta: number
	) {
		return traceAction(
			UserActionAPIMethods.moveNext,
			moveNext,
			this,
			rundownPlaylistId,
			horisontalDelta,
			verticalDelta
		)
	}
	async prepareForBroadcast(_userEvent: string, rundownPlaylistId: RundownPlaylistId) {
		return traceAction(UserActionAPIMethods.prepareForBroadcast, prepareForBroadcast, this, rundownPlaylistId)
	}
	async resetRundownPlaylist(_userEvent: string, rundownPlaylistId: RundownPlaylistId) {
		return traceAction(UserActionAPIMethods.resetRundownPlaylist, resetRundownPlaylist, this, rundownPlaylistId)
	}
	async resetAndActivate(_userEvent: string, rundownPlaylistId: RundownPlaylistId, rehearsal?: boolean) {
		return traceAction(UserActionAPIMethods.resetAndActivate, resetAndActivate, this, rundownPlaylistId, rehearsal)
	}
	async activate(_userEvent: string, rundownPlaylistId: RundownPlaylistId, rehearsal: boolean) {
		return traceAction(UserActionAPIMethods.activate, activate, this, rundownPlaylistId, rehearsal)
	}
	async deactivate(_userEvent: string, rundownPlaylistId: RundownPlaylistId) {
		return traceAction(UserActionAPIMethods.deactivate, deactivate, this, rundownPlaylistId)
	}
	async forceResetAndActivate(_userEvent: string, rundownPlaylistId: RundownPlaylistId, rehearsal: boolean) {
		return traceAction(
			UserActionAPIMethods.forceResetAndActivate,
			forceResetAndActivate,
			this,
			rundownPlaylistId,
			rehearsal
		)
	}
	async unsyncRundown(_userEvent: string, rundownId: RundownId) {
		return traceAction(UserActionAPIMethods.unsyncRundown, unsyncRundown, this, rundownId)
	}
	async disableNextPiece(_userEvent: string, rundownPlaylistId: RundownPlaylistId, undo?: boolean) {
		return traceAction(UserActionAPIMethods.disableNextPiece, disableNextPiece, this, rundownPlaylistId, undo)
	}
	async pieceTakeNow(
		_userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		pieceInstanceIdOrPieceIdToCopy: PieceInstanceId | PieceId
	) {
		return traceAction(
			UserActionAPIMethods.pieceTakeNow,
			pieceTakeNow,
			this,
			rundownPlaylistId,
			partInstanceId,
			pieceInstanceIdOrPieceIdToCopy
		)
	}
	async setInOutPoints(
		_userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		partId: PartId,
		pieceId: PieceId,
		inPoint: number,
		duration: number
	) {
		return pieceSetInOutPoints(this, rundownPlaylistId, partId, pieceId, inPoint, duration)
	}
	async executeAction(
		_userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		actionDocId: AdLibActionId | RundownBaselineAdLibActionId,
		actionId: string,
		userData: ActionUserData,
		triggerMode?: string
	) {
		return traceAction(
			UserActionAPIMethods.executeAction,
			executeAction,
			this,
			rundownPlaylistId,
			actionDocId,
			actionId,
			userData,
			triggerMode
		)
	}
	async segmentAdLibPieceStart(
		_userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		adlibPieceId: PieceId,
		queue: boolean
	) {
		return traceAction(
			UserActionAPIMethods.segmentAdLibPieceStart,
			segmentAdLibPieceStart,
			this,
			rundownPlaylistId,
			partInstanceId,
			adlibPieceId,
			queue
		)
	}
	async sourceLayerOnPartStop(
		_userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		sourceLayerIds: string[]
	) {
		return traceAction(
			UserActionAPIMethods.sourceLayerOnPartStop,
			sourceLayerOnPartStop,
			this,
			rundownPlaylistId,
			partInstanceId,
			sourceLayerIds
		)
	}
	async baselineAdLibPieceStart(
		_userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		adlibPieceId: PieceId,
		queue: boolean
	) {
		return traceAction(
			UserActionAPIMethods.baselineAdLibPieceStart,
			rundownBaselineAdLibPieceStart,
			this,
			rundownPlaylistId,
			partInstanceId,
			adlibPieceId,
			queue
		)
	}
	async sourceLayerStickyPieceStart(_userEvent: string, rundownPlaylistId: RundownPlaylistId, sourceLayerId: string) {
		return traceAction(
			UserActionAPIMethods.sourceLayerStickyPieceStart,
			sourceLayerStickyPieceStart,
			this,
			rundownPlaylistId,
			sourceLayerId
		)
	}
	async bucketAdlibImport(
		_userEvent: string,
		studioId: StudioId,
		showStyleVariantId: ShowStyleVariantId,
		bucketId: BucketId,
		ingestItem: IngestAdlib
	) {
		return traceAction(
			UserActionAPIMethods.bucketAdlibImport,
			bucketAdlibImport,
			this,
			studioId,
			showStyleVariantId,
			bucketId,
			ingestItem
		)
	}
	async bucketAdlibStart(
		_userEvent: string,
		rundownPlaylistId: RundownPlaylistId,
		partInstanceId: PartInstanceId,
		bucketAdlibId: PieceId,
		queue?: boolean
	) {
		return traceAction(
			UserActionAPIMethods.bucketAdlibStart,
			bucketAdlibStart,
			this,
			rundownPlaylistId,
			partInstanceId,
			bucketAdlibId,
			queue
		)
	}
	async activateHold(_userEvent: string, rundownPlaylistId: RundownPlaylistId, undo?: boolean) {
		return traceAction(UserActionAPIMethods.activateHold, activateHold, this, rundownPlaylistId, undo)
	}
	async saveEvaluation(_userEvent: string, evaluation: EvaluationBase) {
		return makePromise(() => userSaveEvaluation(this, evaluation))
	}
	async storeRundownSnapshot(_userEvent: string, playlistId: RundownPlaylistId, reason: string) {
		return traceAction(
			UserActionAPIMethods.storeRundownSnapshot,
			userStoreRundownSnapshot,
			this,
			playlistId,
			reason
		)
	}
	async removeRundownPlaylist(_userEvent: string, playlistId: RundownPlaylistId) {
		return traceAction(UserActionAPIMethods.removeRundownPlaylist, removeRundownPlaylist, this, playlistId)
	}
	async resyncRundownPlaylist(_userEvent: string, playlistId: RundownPlaylistId) {
		return traceAction(UserActionAPIMethods.resyncRundownPlaylist, resyncRundownPlaylist, this, playlistId)
	}
	async removeRundown(_userEvent: string, rundownId: RundownId) {
		return traceAction(UserActionAPIMethods.removeRundown, removeRundown, this, rundownId)
	}
	async resyncRundown(_userEvent: string, rundownId: RundownId) {
		return traceAction(UserActionAPIMethods.resyncRundown, resyncRundown, this, rundownId)
	}
	async resyncSegment(_userEvent: string, rundownId: RundownId, segmentId: SegmentId) {
		return traceAction(UserActionAPIMethods.resyncSegment, resyncSegment, this, rundownId, segmentId)
	}
	async mediaRestartWorkflow(_userEvent: string, workflowId: MediaWorkFlowId) {
		return makePromise(() => mediaRestartWorkflow(this, workflowId))
	}
	async mediaAbortWorkflow(_userEvent: string, workflowId: MediaWorkFlowId) {
		return makePromise(() => mediaAbortWorkflow(this, workflowId))
	}
	async mediaPrioritizeWorkflow(_userEvent: string, workflowId: MediaWorkFlowId) {
		return makePromise(() => mediaPrioritizeWorkflow(this, workflowId))
	}
	async mediaRestartAllWorkflows(_userEvent: string) {
		return makePromise(() => mediaRestartAllWorkflows(this))
	}
	async mediaAbortAllWorkflows(_userEvent: string) {
		return makePromise(() => mediaAbortAllWorkflows(this))
	}
	async packageManagerRestartExpectation(_userEvent: string, deviceId: PeripheralDeviceId, workId: string) {
		return makePromise(() => packageManagerRestartExpectation(this, deviceId, workId))
	}
	async packageManagerRestartAllExpectations(_userEvent: string, studioId: StudioId) {
		return makePromise(() => packageManagerRestartAllExpectations(this, studioId))
	}
	async packageManagerAbortExpectation(_userEvent: string, deviceId: PeripheralDeviceId, workId: string) {
		return makePromise(() => packageManagerAbortExpectation(this, deviceId, workId))
	}
	async regenerateRundownPlaylist(_userEvent: string, playlistId: RundownPlaylistId) {
		return traceAction(UserActionAPIMethods.regenerateRundownPlaylist, regenerateRundownPlaylist, this, playlistId)
	}
	async generateRestartToken(_userEvent: string) {
		return makePromise(() => generateRestartToken(this))
	}
	async restartCore(_userEvent: string, token: string) {
		return makePromise(() => restartCore(this, token))
	}
	async guiFocused(_userEvent: string, _viewInfo: any[]) {
		return traceAction('userAction.noop', noop, this)
	}
	async guiBlurred(_userEvent: string, _viewInfo: any[]) {
		return traceAction('userAction.noop', noop, this)
	}
	async bucketsRemoveBucket(_userEvent: string, id: BucketId) {
		return traceAction(UserActionAPIMethods.bucketsRemoveBucket, bucketsRemoveBucket, this, id)
	}
	async bucketsModifyBucket(_userEvent: string, id: BucketId, bucket: Partial<Omit<Bucket, '_id'>>) {
		return traceAction(UserActionAPIMethods.bucketsModifyBucket, bucketsModifyBucket, this, id, bucket)
	}
	async bucketsEmptyBucket(_userEvent: string, id: BucketId) {
		return traceAction(UserActionAPIMethods.bucketsEmptyBucket, bucketsEmptyBucket, this, id)
	}
	async bucketsCreateNewBucket(_userEvent: string, name: string, studioId: StudioId, userId: string | null) {
		return traceAction(
			UserActionAPIMethods.bucketsCreateNewBucket,
			bucketsCreateNewBucket,
			this,
			name,
			studioId,
			userId
		)
	}
	async bucketsRemoveBucketAdLib(_userEvent: string, id: PieceId) {
		return traceAction(UserActionAPIMethods.bucketsRemoveBucketAdLib, bucketsRemoveBucketAdLib, this, id)
	}
	async bucketsRemoveBucketAdLibAction(_userEvent: string, id: AdLibActionId) {
		return traceAction(
			UserActionAPIMethods.bucketsRemoveBucketAdLibAction,
			bucketsRemoveBucketAdLibAction,
			this,
			id
		)
	}
	async bucketsModifyBucketAdLib(_userEvent: string, id: PieceId, bucketAdlib: Partial<Omit<BucketAdLib, '_id'>>) {
		return traceAction(
			UserActionAPIMethods.bucketsModifyBucketAdLib,
			bucketsModifyBucketAdLib,
			this,
			id,
			bucketAdlib
		)
	}
	async bucketsModifyBucketAdLibAction(
		_userEvent: string,
		id: AdLibActionId,
		bucketAdlibAction: Partial<Omit<BucketAdLibAction, '_id'>>
	) {
		return traceAction(
			UserActionAPIMethods.bucketsModifyBucketAdLibAction,
			bucketsModifyBucketAdLibAction,
			this,
			id,
			bucketAdlibAction
		)
	}
	async bucketsSaveActionIntoBucket(
		_userEvent: string,
		studioId: StudioId,
		action: AdLibActionCommon | BucketAdLibAction,
		bucketId: BucketId
	): Promise<ClientAPI.ClientResponse<BucketAdLibAction>> {
		return traceAction(
			UserActionAPIMethods.bucketsSaveActionIntoBucket,
			bucketsSaveActionIntoBucket,
			this,
			studioId,
			action,
			bucketId
		)
	}
	async switchRouteSet(
		_userEvent: string,
		studioId: StudioId,
		routeSetId: string,
		state: boolean
	): Promise<ClientAPI.ClientResponse<void>> {
		return traceAction(UserActionAPIMethods.switchRouteSet, switchRouteSet, this, studioId, routeSetId, state)
	}
	async moveRundown(
		_userEvent: string,
		rundownId: RundownId,
		intoPlaylistId: RundownPlaylistId | null,
		rundownsIdsInPlaylistInOrder: RundownId[]
	): Promise<ClientAPI.ClientResponse<void>> {
		return moveRundown(this, rundownId, intoPlaylistId, rundownsIdsInPlaylistInOrder)
	}
	async restoreRundownOrder(
		_userEvent: string,
		playlistId: RundownPlaylistId
	): Promise<ClientAPI.ClientResponse<void>> {
		return restoreRundownOrder(this, playlistId)
	}
}
registerClassToMeteorMethods(
	UserActionAPIMethods,
	ServerUserActionAPI,
	false,
	(methodContext: MethodContext, methodName: string, args: any[], fcn: Function) => {
		const eventContext = args[0]
		return ServerClientAPI.runInUserLog(methodContext, eventContext, methodName, args.slice(1), () => {
			return fcn.apply(methodContext, args)
		})
	}
)
