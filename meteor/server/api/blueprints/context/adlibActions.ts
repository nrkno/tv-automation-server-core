import * as _ from 'underscore'
import {
	unprotectString,
	unprotectObject,
	protectString,
	assertNever,
	getCurrentTime,
	unprotectStringArray,
	getRandomId,
	protectStringArray,
	waitForPromise,
	UnprotectedStringProperties,
	clone,
} from '../../../../lib/lib'
import { Part } from '../../../../lib/collections/Parts'
import { logger } from '../../../../lib/logging'
import {
	IEventContext,
	IActionExecutionContext,
	IBlueprintPartInstance,
	IBlueprintPieceInstance,
	IBlueprintPiece,
	IBlueprintPart,
	IBlueprintResolvedPieceInstance,
	OmitId,
	IBlueprintMutatablePart,
	IBlueprintPieceDB,
} from '@sofie-automation/blueprints-integration'
import { Rundown } from '../../../../lib/collections/Rundowns'
import { RundownPlaylistActivationId } from '../../../../lib/collections/RundownPlaylists'
import { PieceInstance, wrapPieceToInstance } from '../../../../lib/collections/PieceInstances'
import { PartInstanceId, PartInstance, PartInstances } from '../../../../lib/collections/PartInstances'
import { getResolvedPieces, setupPieceInstanceInfiniteProperties } from '../../playout/pieces'
import { postProcessPieces, postProcessTimelineObjects } from '../postProcess'
import { ShowStyleUserContext, UserContextInfo } from './context'
import { isTooCloseToAutonext } from '../../playout/lib'
import { ServerPlayoutAdLibAPI } from '../../playout/adlib'
import { MongoQuery } from '../../../../lib/typings/meteor'
import { IBlueprintPieceSampleKeys, IBlueprintMutatablePartSampleKeys } from './lib'
import { Meteor } from 'meteor/meteor'
import { CacheForPlayout, getRundownIDsFromCache } from '../../playout/cache'
import { ShowStyleCompound } from '../../../../lib/collections/ShowStyleVariants'
import { ServerPlayoutAPI } from '../../playout/playout'
import { Piece, Pieces } from '../../../../lib/collections/Pieces'
import { WatchedPackagesHelper } from './watchedPackages'

export enum ActionPartChange {
	NONE = 0,
	SAFE_CHANGE = 1,
}

/** Actions */
export class ActionExecutionContext extends ShowStyleUserContext implements IActionExecutionContext, IEventContext {
	private readonly _cache: CacheForPlayout
	private readonly rundown: Rundown
	private readonly playlistActivationId: RundownPlaylistActivationId

	/** To be set by any mutation methods on this context. Indicates to core how extensive the changes are to the current partInstance */
	public currentPartState: ActionPartChange = ActionPartChange.NONE
	/** To be set by any mutation methods on this context. Indicates to core how extensive the changes are to the next partInstance */
	public nextPartState: ActionPartChange = ActionPartChange.NONE
	public takeAfterExecute: boolean

	constructor(
		contextInfo: UserContextInfo,
		cache: CacheForPlayout,
		showStyle: ShowStyleCompound,
		rundown: Rundown,
		watchedPackages: WatchedPackagesHelper
	) {
		super(contextInfo, cache.Studio.doc, showStyle, watchedPackages)
		this._cache = cache
		this.rundown = rundown
		this.takeAfterExecute = false

		if (!this._cache.Playlist.doc.activationId)
			throw new Meteor.Error(500, `RundownPlaylist "${this._cache.Playlist.doc._id}" is not active`)
		this.playlistActivationId = this._cache.Playlist.doc.activationId
	}

	private _getPartInstanceId(part: 'current' | 'next'): PartInstanceId | null {
		switch (part) {
			case 'current':
				return this._cache.Playlist.doc.currentPartInstanceId
			case 'next':
				return this._cache.Playlist.doc.nextPartInstanceId
			default:
				assertNever(part)
				logger.warn(`Blueprint action requested unknown PartInstance "${part}"`)
				throw new Error(`Unknown part "${part}"`)
		}
	}

	getCurrentTime(): number {
		return getCurrentTime()
	}

	getPartInstance(part: 'current' | 'next'): IBlueprintPartInstance | undefined {
		const partInstanceId = this._getPartInstanceId(part)
		if (!partInstanceId) {
			return undefined
		}

		const partInstance = this._cache.PartInstances.findOne(partInstanceId)
		return clone(unprotectObject(partInstance))
	}
	getPieceInstances(part: 'current' | 'next'): IBlueprintPieceInstance[] {
		const partInstanceId = this._getPartInstanceId(part)
		if (!partInstanceId) {
			return []
		}

		const pieceInstances = this._cache.PieceInstances.findFetch({ partInstanceId })
		return pieceInstances.map((piece) => clone(unprotectObject(piece)))
	}
	getResolvedPieceInstances(part: 'current' | 'next'): IBlueprintResolvedPieceInstance[] {
		const partInstanceId = this._getPartInstanceId(part)
		if (!partInstanceId) {
			return []
		}

		const partInstance = this._cache.PartInstances.findOne(partInstanceId)
		if (!partInstance) {
			return []
		}

		const resolvedInstances = getResolvedPieces(this._cache, this.showStyleCompound, partInstance)
		return resolvedInstances.map((piece) => clone(unprotectObject(piece)))
	}

	findLastPieceOnLayer(
		sourceLayerId0: string | string[],
		options?: {
			excludeCurrentPart?: boolean
			originalOnly?: boolean
			pieceMetaDataFilter?: any
		}
	): IBlueprintPieceInstance | undefined {
		const query: MongoQuery<PieceInstance> = {}
		if (options && options.pieceMetaDataFilter) {
			for (const [key, value] of Object.entries(options.pieceMetaDataFilter)) {
				// TODO do we need better validation here?
				// It should be pretty safe as we are working with the cache version (for now)
				query[`piece.metaData.${key}`] = value
			}
		}

		if (options && options.excludeCurrentPart && this._cache.Playlist.doc.currentPartInstanceId) {
			query['partInstanceId'] = { $ne: this._cache.Playlist.doc.currentPartInstanceId }
		}

		const sourceLayerId = Array.isArray(sourceLayerId0) ? sourceLayerId0 : [sourceLayerId0]

		const lastPieceInstance = ServerPlayoutAdLibAPI.innerFindLastPieceOnLayer(
			this._cache,
			sourceLayerId,
			(options && options.originalOnly) || false,
			query
		)

		return clone(unprotectObject(lastPieceInstance))
	}

	findLastScriptedPieceOnLayer(
		sourceLayerId0: string | string[],
		options?: {
			excludeCurrentPart?: boolean
			pieceMetaDataFilter?: any
		}
	): IBlueprintPieceDB | undefined {
		const query: MongoQuery<Piece> = {}
		if (options && options.pieceMetaDataFilter) {
			for (const [key, value] of Object.entries(options.pieceMetaDataFilter)) {
				// TODO do we need better validation here?
				// It should be pretty safe as we are working with the cache version (for now)
				query[`metaData.${key}`] = value
			}
		}

		if (options && options.excludeCurrentPart && this._cache.Playlist.doc.currentPartInstanceId) {
			const currentPartInstance = this._cache.PartInstances.findOne(
				this._cache.Playlist.doc.currentPartInstanceId
			)

			if (currentPartInstance) {
				query['startPartId'] = { $ne: currentPartInstance.part._id }
			}
		}

		const sourceLayerId = Array.isArray(sourceLayerId0) ? sourceLayerId0 : [sourceLayerId0]

		const lastPiece = ServerPlayoutAdLibAPI.innerFindLastScriptedPieceOnLayer(this._cache, sourceLayerId, query)

		return clone(unprotectObject(lastPiece))
	}

	getPartInstanceForPreviousPiece(piece: IBlueprintPieceInstance): IBlueprintPartInstance {
		const pieceExt = piece as unknown as Partial<PieceInstance> | undefined
		const partInstanceId = pieceExt?.partInstanceId
		if (!partInstanceId) {
			throw new Error('Cannot find PartInstance from invalid PieceInstance')
		}

		const cached = this._cache.PartInstances.findOne(partInstanceId)
		if (cached) {
			return clone(unprotectObject(cached))
		}

		// It might be reset and so not in the cache
		const rundownIds = getRundownIDsFromCache(this._cache)
		const oldInstance = PartInstances.findOne({
			_id: partInstanceId,
			rundownId: { $in: rundownIds },
		})
		if (oldInstance) {
			return unprotectObject(oldInstance)
		} else {
			throw new Error('Cannot find PartInstance for PieceInstance')
		}
	}

	getPartForPreviousPiece(piece: UnprotectedStringProperties<Pick<Piece, '_id'>>): IBlueprintPart | undefined {
		if (!piece?._id) {
			throw new Error('Cannot find Part from invalid Piece')
		}

		const pieceDB = Pieces.findOne({
			_id: protectString(piece._id),
			startRundownId: { $in: getRundownIDsFromCache(this._cache) },
		})
		if (!pieceDB) throw new Error(`Cannot find Piece ${piece._id}`)

		return this._cache.Parts.findOne({ _id: pieceDB.startPartId })
	}

	insertPiece(part: 'current' | 'next', rawPiece: IBlueprintPiece): IBlueprintPieceInstance {
		const partInstanceId = this._getPartInstanceId(part)
		if (!partInstanceId) {
			throw new Error('Cannot insert piece when no active part')
		}

		const partInstance = this._cache.PartInstances.findOne(partInstanceId)
		if (!partInstance) {
			throw new Error('Cannot queue part when no partInstance')
		}

		const rundown = this._cache.Rundowns.findOne(partInstance.rundownId)
		if (!rundown) {
			throw new Error('Failed to find rundown of partInstance')
		}

		const trimmedPiece: IBlueprintPiece = _.pick(rawPiece, IBlueprintPieceSampleKeys)

		const piece = postProcessPieces(
			this,
			[trimmedPiece],
			this.showStyleCompound.blueprintId,
			partInstance.rundownId,
			partInstance.segmentId,
			partInstance.part._id,
			part === 'current',
			true
		)[0]
		piece._id = getRandomId() // Make id random, as postProcessPieces is too predictable (for ingest)
		const newPieceInstance = wrapPieceToInstance(piece, this.playlistActivationId, partInstance._id)

		// Do the work
		ServerPlayoutAdLibAPI.innerStartAdLibPiece(this._cache, rundown, partInstance, newPieceInstance)

		if (part === 'current') {
			this.currentPartState = Math.max(this.currentPartState, ActionPartChange.SAFE_CHANGE)
		} else {
			this.nextPartState = Math.max(this.nextPartState, ActionPartChange.SAFE_CHANGE)
		}

		return clone(unprotectObject(newPieceInstance))
	}
	updatePieceInstance(pieceInstanceId: string, piece: Partial<OmitId<IBlueprintPiece>>): IBlueprintPieceInstance {
		// filter the submission to the allowed ones
		const trimmedPiece: Partial<OmitId<IBlueprintPiece>> = _.pick(piece, IBlueprintPieceSampleKeys)
		if (Object.keys(trimmedPiece).length === 0) {
			throw new Error('Some valid properties must be defined')
		}

		const pieceInstance = this._cache.PieceInstances.findOne(protectString(pieceInstanceId))
		if (!pieceInstance) {
			throw new Error('PieceInstance could not be found')
		}

		if (pieceInstance.infinite?.fromPreviousPart) {
			throw new Error('Cannot update an infinite piece that is continued from a previous part')
		}

		const updatesCurrentPart: ActionPartChange =
			pieceInstance.partInstanceId === this._cache.Playlist.doc.currentPartInstanceId
				? ActionPartChange.SAFE_CHANGE
				: ActionPartChange.NONE
		const updatesNextPart: ActionPartChange =
			pieceInstance.partInstanceId === this._cache.Playlist.doc.nextPartInstanceId
				? ActionPartChange.SAFE_CHANGE
				: ActionPartChange.NONE
		if (!updatesCurrentPart && !updatesNextPart) {
			throw new Error('Can only update piece instances in current or next part instance')
		}

		if (piece.content && piece.content.timelineObjects) {
			piece.content.timelineObjects = postProcessTimelineObjects(
				this,
				pieceInstance.piece._id,
				this.showStyleCompound.blueprintId,
				piece.content.timelineObjects,
				true
			)
		}

		const update = {
			$set: {},
			$unset: {},
		}

		for (const [k, val] of Object.entries(trimmedPiece)) {
			if (val === undefined) {
				update.$unset[`piece.${k}`] = val
			} else {
				update.$set[`piece.${k}`] = val
			}
		}

		setupPieceInstanceInfiniteProperties(pieceInstance)

		this._cache.PieceInstances.update(pieceInstance._id, update)

		this.nextPartState = Math.max(this.nextPartState, updatesNextPart)
		this.currentPartState = Math.max(this.currentPartState, updatesCurrentPart)

		return clone(unprotectObject(this._cache.PieceInstances.findOne(pieceInstance._id)!))
	}
	queuePart(rawPart: IBlueprintPart, rawPieces: IBlueprintPiece[]): IBlueprintPartInstance {
		const currentPartInstance = this._cache.Playlist.doc.currentPartInstanceId
			? this._cache.PartInstances.findOne(this._cache.Playlist.doc.currentPartInstanceId)
			: undefined
		if (!currentPartInstance) {
			throw new Error('Cannot queue part when no current partInstance')
		}

		if (this.nextPartState !== ActionPartChange.NONE) {
			// Ensure we dont insert a piece into a part before replacing it with a queued part, as this will cause some data integrity issues
			// This could be changed if we have a way to abort the pending changes in the nextPart.
			// TODO-PartInstances - perhaps this could be dropped as only the instance will have changed, and that will be trashed by the setAsNext?
			throw new Error('Cannot queue part when next part has already been modified')
		}

		if (isTooCloseToAutonext(currentPartInstance, true)) {
			throw new Error('Too close to an autonext to queue a part')
		}

		if (rawPieces.length === 0) {
			throw new Error('New part must contain at least one piece')
		}

		const newPartInstance = new PartInstance({
			_id: getRandomId(),
			rundownId: currentPartInstance.rundownId,
			segmentId: currentPartInstance.segmentId,
			playlistActivationId: this.playlistActivationId,
			segmentPlayoutId: currentPartInstance.segmentPlayoutId,
			takeCount: currentPartInstance.takeCount + 1,
			rehearsal: currentPartInstance.rehearsal,
			part: new Part({
				...rawPart,
				_id: getRandomId(),
				rundownId: currentPartInstance.rundownId,
				segmentId: currentPartInstance.segmentId,
				_rank: 99999, // Corrected in innerStartQueuedAdLib
				notes: [],
				invalid: false,
				invalidReason: undefined,
				floated: false,
			}),
		})

		if (!newPartInstance.part.isPlayable()) {
			throw new Error('Cannot queue a part which is not playable')
		}

		const pieces = postProcessPieces(
			this,
			rawPieces,
			this.showStyleCompound.blueprintId,
			currentPartInstance.rundownId,
			newPartInstance.segmentId,
			newPartInstance.part._id
		)
		const newPieceInstances = pieces.map((piece) =>
			wrapPieceToInstance(piece, this.playlistActivationId, newPartInstance._id)
		)

		// Do the work
		waitForPromise(
			ServerPlayoutAdLibAPI.innerStartQueuedAdLib(
				this._cache,
				this.rundown,
				currentPartInstance,
				newPartInstance,
				newPieceInstances
			)
		)

		this.nextPartState = ActionPartChange.SAFE_CHANGE

		return clone(unprotectObject(newPartInstance))
	}
	moveNextPart(partDelta: number, segmentDelta: number): void {
		waitForPromise(ServerPlayoutAPI.moveNextPartInner(this._cache, partDelta, segmentDelta))
	}
	updatePartInstance(part: 'current' | 'next', props: Partial<IBlueprintMutatablePart>): IBlueprintPartInstance {
		// filter the submission to the allowed ones
		const trimmedProps: Partial<IBlueprintMutatablePart> = _.pick(props, IBlueprintMutatablePartSampleKeys)
		if (Object.keys(trimmedProps).length === 0) {
			throw new Error('Some valid properties must be defined')
		}

		const partInstanceId = this._getPartInstanceId(part)
		if (!partInstanceId) {
			throw new Error('PartInstance could not be found')
		}

		const partInstance = this._cache.PartInstances.findOne(partInstanceId)
		if (!partInstance) {
			throw new Error('PartInstance could not be found')
		}

		const update = {
			$set: {},
			$unset: {},
		}

		for (const [k, val] of Object.entries(trimmedProps)) {
			if (val === undefined) {
				update.$unset[`part.${k}`] = val
			} else {
				update.$set[`part.${k}`] = val
			}
		}

		this._cache.PartInstances.update(partInstance._id, update)

		this.nextPartState = Math.max(
			this.nextPartState,
			part === 'next' ? ActionPartChange.SAFE_CHANGE : ActionPartChange.NONE
		)
		this.currentPartState = Math.max(
			this.currentPartState,
			part === 'current' ? ActionPartChange.SAFE_CHANGE : ActionPartChange.NONE
		)

		return clone(unprotectObject(this._cache.PartInstances.findOne(partInstance._id)!))
	}

	stopPiecesOnLayers(sourceLayerIds: string[], timeOffset?: number | undefined): string[] {
		if (sourceLayerIds.length == 0) {
			return []
		}

		return this._stopPiecesByRule(
			(pieceInstance) => sourceLayerIds.indexOf(pieceInstance.piece.sourceLayerId) !== -1,
			timeOffset
		)
	}
	stopPieceInstances(pieceInstanceIds: string[], timeOffset?: number | undefined): string[] {
		if (pieceInstanceIds.length == 0) {
			return []
		}

		return this._stopPiecesByRule(
			(pieceInstance) => pieceInstanceIds.indexOf(unprotectString(pieceInstance._id)) !== -1,
			timeOffset
		)
	}
	removePieceInstances(_part: 'next', pieceInstanceIds: string[]): string[] {
		const partInstanceId = this._cache.Playlist.doc.nextPartInstanceId // this._getPartInstanceId(part)
		if (!partInstanceId) {
			throw new Error('Cannot remove pieceInstances when no selected partInstance')
		}

		const pieceInstances = this._cache.PieceInstances.findFetch({
			partInstanceId: partInstanceId,
			_id: { $in: protectStringArray(pieceInstanceIds) },
		})

		this._cache.PieceInstances.remove({
			partInstanceId: partInstanceId,
			_id: { $in: pieceInstances.map((p) => p._id) },
		})

		this.nextPartState = Math.max(this.nextPartState, ActionPartChange.SAFE_CHANGE)

		return unprotectStringArray(pieceInstances.map((p) => p._id))
	}

	takeAfterExecuteAction(take: boolean): boolean {
		this.takeAfterExecute = take

		return this.takeAfterExecute
	}

	private _stopPiecesByRule(filter: (pieceInstance: PieceInstance) => boolean, timeOffset: number | undefined) {
		if (!this._cache.Playlist.doc.currentPartInstanceId) {
			return []
		}
		const partInstance = this._cache.PartInstances.findOne(this._cache.Playlist.doc.currentPartInstanceId)
		if (!partInstance) {
			throw new Error('Cannot stop pieceInstances when no current partInstance')
		}

		const stoppedIds = ServerPlayoutAdLibAPI.innerStopPieces(
			this._cache,
			this.showStyleCompound,
			partInstance,
			filter,
			timeOffset
		)

		if (stoppedIds.length > 0) {
			this.currentPartState = Math.max(this.currentPartState, ActionPartChange.SAFE_CHANGE)
		}

		return unprotectStringArray(stoppedIds)
	}
}
