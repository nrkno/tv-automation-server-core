import * as _ from 'underscore'
import { Meteor } from 'meteor/meteor'
import { Random } from 'meteor/random'
import {
	getHash,
	formatDateAsTimecode,
	formatDurationAsTimecode,
	unprotectString,
	unprotectObject,
	unprotectObjectArray,
	protectString,
	assertNever,
	protectStringArray,
	getCurrentTime,
	unprotectStringArray,
	normalizeArray,
	literal,
	getRandomId,
	omit,
} from '../../../../lib/lib'
import { DBPart, PartId, Part } from '../../../../lib/collections/Parts'
import { check, Match } from 'meteor/check'
import { logger } from '../../../../lib/logging'
import {
	ICommonContext,
	NotesContext as INotesContext,
	ShowStyleContext as IShowStyleContext,
	RundownContext as IRundownContext,
	SegmentContext as ISegmentContext,
	EventContext as IEventContext,
	AsRunEventContext as IAsRunEventContext,
	PartEventContext as IPartEventContext,
	ActionExecutionContext as IActionExecutionContext,
	IStudioConfigContext,
	ConfigItemValue,
	IStudioContext,
	BlueprintMappings,
	BlueprintRuntimeArguments,
	IBlueprintSegmentDB,
	IngestRundown,
	IngestPart,
	IBlueprintPartInstance,
	IBlueprintPieceInstance,
	IBlueprintPartDB,
	IBlueprintRundownDB,
	IBlueprintAsRunLogEvent,
	IBlueprintPiece,
	IBlueprintPart,
	IBlueprintResolvedPieceInstance,
	IBlueprintPieceDB,
	PieceLifespan,
	OmitId,
} from 'tv-automation-sofie-blueprints-integration'
import { Studio } from '../../../../lib/collections/Studios'
import { ConfigRef, compileStudioConfig } from '../config'
import { Rundown, RundownId } from '../../../../lib/collections/Rundowns'
import { ShowStyleBase, ShowStyleBases, ShowStyleBaseId } from '../../../../lib/collections/ShowStyleBases'
import { getShowStyleCompound, ShowStyleVariantId } from '../../../../lib/collections/ShowStyleVariants'
import { AsRunLogEvent, AsRunLog } from '../../../../lib/collections/AsRunLog'
import { PartNote, NoteType, INoteBase } from '../../../../lib/api/notes'
import { loadCachedRundownData, loadIngestDataCachePart } from '../../ingest/ingestCache'
import { RundownPlaylist, RundownPlaylistId } from '../../../../lib/collections/RundownPlaylists'
import { Segment, SegmentId } from '../../../../lib/collections/Segments'
import {
	PieceInstances,
	unprotectPieceInstance,
	PieceInstanceId,
	PieceInstance,
	wrapPieceToInstance,
} from '../../../../lib/collections/PieceInstances'
import {
	InternalIBlueprintPartInstance,
	PartInstanceId,
	unprotectPartInstance,
	PartInstance,
	wrapPartToTemporaryInstance,
} from '../../../../lib/collections/PartInstances'
import { CacheForRundownPlaylist } from '../../../DatabaseCaches'
import { getResolvedPieces } from '../../playout/pieces'
import { postProcessPieces, postProcessTimelineObjects } from '../postProcess'
import { StudioContext, NotesContext, ShowStyleContext, EventContext } from './context'
import { setNextPart, getRundownIDsFromCache, isTooCloseToAutonext } from '../../playout/lib'
import { ServerPlayoutAdLibAPI } from '../../playout/adlib'
import { MongoQuery } from '../../../../lib/typings/meteor'
import { clone } from '../../../../lib/lib'
import { Piece } from '../../../../lib/collections/Pieces'

export enum ActionPartChange {
	NONE = 0,
	/** Inserted/updated a piece which can be simply pruned */
	SAFE_CHANGE = 1,
	/** Inserted/updated a piece which requires a blueprint call to reset */
	MARK_DIRTY = 2,
}

const IBlueprintPieceSample: Required<OmitId<IBlueprintPiece>> = {
	externalId: '',
	enable: { start: 0 },
	virtual: false,
	continuesRefId: '',
	isTransition: false,
	extendOnHold: false,
	name: '',
	metaData: {},
	sourceLayerId: '',
	outputLayerId: '',
	content: {},
	transitions: {},
	infiniteMode: PieceLifespan.Normal,
	adlibPreroll: 0,
	toBeQueued: false,
	expectedPlayoutItems: [],
	adlibAutoNext: false,
	adlibAutoNextOverlap: 0,
	adlibDisableOutTransition: false,
}
// Compile a list of the keys which are allowed to be set
const IBlueprintPieceSampleKeys = Object.keys(IBlueprintPieceSample) as Array<keyof OmitId<IBlueprintPiece>>

/** Actions */
export class ActionExecutionContext extends ShowStyleContext implements IActionExecutionContext, IEventContext {
	private readonly cache: CacheForRundownPlaylist
	private readonly rundownPlaylist: RundownPlaylist
	private readonly rundown: Rundown

	private queuedPartInstance: PartInstance | undefined

	/** To be set by any mutation methods on this context. Indicates to core how extensive the changes are to the current partInstance */
	public currentPartState: ActionPartChange = ActionPartChange.NONE
	/** To be set by any mutation methods on this context. Indicates to core how extensive the changes are to the next partInstance */
	public nextPartState: ActionPartChange = ActionPartChange.NONE

	constructor(
		cache: CacheForRundownPlaylist,
		notesContext: NotesContext,
		studio: Studio,
		rundownPlaylist: RundownPlaylist,
		rundown: Rundown
	) {
		super(studio, rundown.showStyleBaseId, rundown.showStyleVariantId, notesContext)
		this.cache = cache
		this.rundownPlaylist = rundownPlaylist
		this.rundown = rundown
	}

	private _getPartInstanceId(part: 'current' | 'next'): PartInstanceId | null {
		switch (part) {
			case 'current':
				return this.rundownPlaylist.currentPartInstanceId
			case 'next':
				return this.rundownPlaylist.nextPartInstanceId
			default:
				assertNever(part)
				logger.warn(`Blueprint action requested unknown PartInstance "${part}"`)
				throw new Error(`Unknown part "${part}"`)
		}
	}

	// getNextShowStyleConfig (): {[key: string]: ConfigItemValue} {
	// 	const partInstanceId = this.rundownPlaylist.nextPartInstanceId
	// 	if (!partInstanceId) {
	// 		throw new Error('Cannot get ShowStyle config when there is no next part')
	// 	}

	// 	const partInstance = this.cache.PartInstances.findOne(partInstanceId)
	// 	const rundown = partInstance ? this.cache.Rundowns.findOne(partInstance.rundownId) : undefined
	// 	if (!rundown) {
	// 		throw new Error(`Failed to fetch rundown for PartInstance "${partInstanceId}"`)
	// 	}

	// 	const showStyleCompound = getShowStyleCompound(rundown.showStyleVariantId)
	// 	if (!showStyleCompound) throw new Error(`Failed to compile showStyleCompound for "${rundown.showStyleVariantId}"`)

	// 	const res: {[key: string]: ConfigItemValue} = {}
	// 	_.each(showStyleCompound.config, (c) => {
	// 		res[c._id] = c.value
	// 	})
	// 	return res
	// }

	getCurrentTime(): number {
		return getCurrentTime()
	}

	getPartInstance(part: 'current' | 'next'): IBlueprintPartInstance | undefined {
		const partInstanceId = this._getPartInstanceId(part)
		if (!partInstanceId) {
			return undefined
		}

		const partInstance = this.cache.PartInstances.findOne(partInstanceId)
		return clone(unprotectObject(partInstance))
	}
	getPieceInstances(part: 'current' | 'next'): IBlueprintPieceInstance[] {
		const partInstanceId = this._getPartInstanceId(part)
		if (!partInstanceId) {
			return []
		}

		const pieceInstances = this.cache.PieceInstances.findFetch({ partInstanceId })
		return pieceInstances.map((piece) => clone(unprotectObject(piece)))
	}
	getResolvedPieceInstances(part: 'current' | 'next'): IBlueprintResolvedPieceInstance[] {
		const partInstanceId = this._getPartInstanceId(part)
		if (!partInstanceId) {
			return []
		}

		const partInstance = this.cache.PartInstances.findOne(partInstanceId)
		if (!partInstance) {
			return []
		}

		const resolvedInstances = getResolvedPieces(this.cache, partInstance)
		return resolvedInstances.map((piece) => clone(unprotectObject(piece)))
	}

	findLastPieceOnLayer(
		sourceLayerId: string,
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

		if (options && options.excludeCurrentPart && this.rundownPlaylist.currentPartInstanceId) {
			query['partInstanceId'] = { $ne: this.rundownPlaylist.currentPartInstanceId }
		}

		const lastPieceInstance = ServerPlayoutAdLibAPI.innerFindLastPieceOnLayer(
			this.cache,
			this.rundownPlaylist,
			sourceLayerId,
			(options && options.originalOnly) || false,
			query
		)

		return clone(unprotectObject(lastPieceInstance))
	}
	insertPiece(part: 'current' | 'next', rawPiece: IBlueprintPiece): IBlueprintPieceInstance {
		const partInstanceId = this._getPartInstanceId(part)
		if (!partInstanceId) {
			throw new Error('Cannot insert piece when no active part')
		}

		const partInstance = this.cache.PartInstances.findOne(partInstanceId)
		if (!partInstance) {
			throw new Error('Cannot queue part when no partInstance')
		}

		const rundown = this.cache.Rundowns.findOne(partInstance.rundownId)
		if (!rundown) {
			throw new Error('Failed to find rundown of partInstance')
		}

		// Fill in missing id, and ensure it does not already exist
		if (!rawPiece._id) rawPiece._id = Random.id()
		if (this.cache.Pieces.findOne(protectString(rawPiece._id))) {
			// TODO-PartInstances - this will need rethinking after new dataflow
			throw new Error(`Piece with id "${rawPiece._id}" already exists`)
		}

		const trimmedPiece: IBlueprintPiece = _.pick(rawPiece, [...IBlueprintPieceSampleKeys, '_id'])

		const piece = postProcessPieces(
			this,
			[trimmedPiece],
			this.getShowStyleBase().blueprintId,
			partInstance.rundownId,
			partInstance.part._id,
			part === 'current',
			true
		)[0]
		const newPieceInstance = wrapPieceToInstance(piece, partInstance._id)

		// Do the work
		ServerPlayoutAdLibAPI.innerStartAdLibPiece(
			this.cache,
			this.rundownPlaylist,
			rundown,
			partInstance,
			newPieceInstance
		)

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

		const pieceInstance = this.cache.PieceInstances.findOne(protectString(pieceInstanceId))
		if (!pieceInstance) {
			throw new Error('PieceInstance could not be found')
		}

		const changeLevel = pieceInstance.piece.dynamicallyInserted
			? ActionPartChange.SAFE_CHANGE
			: ActionPartChange.MARK_DIRTY
		const updatesCurrentPart: ActionPartChange =
			pieceInstance.partInstanceId === this.rundownPlaylist.currentPartInstanceId
				? changeLevel
				: ActionPartChange.NONE
		const updatesNextPart: ActionPartChange =
			pieceInstance.partInstanceId === this.rundownPlaylist.nextPartInstanceId
				? changeLevel
				: ActionPartChange.NONE
		if (!updatesCurrentPart && !updatesNextPart) {
			throw new Error('Can only update piece instances in current or next part instance')
		}

		if (piece.content && piece.content.timelineObjects) {
			piece.content.timelineObjects = postProcessTimelineObjects(
				this,
				pieceInstance.piece._id,
				this.getShowStyleBase().blueprintId,
				piece.content.timelineObjects,
				true,
				{}
			)
		}

		const update = {
			$set: {},
			$unset: {},
		}
		const legacyUpdate = {
			$set: {},
			$unset: {},
		}

		for (const [k, val] of Object.entries(trimmedPiece)) {
			if (val === undefined) {
				update.$unset[`piece.${k}`] = val
				legacyUpdate.$unset[`${k}`] = val
			} else {
				update.$set[`piece.${k}`] = val
				legacyUpdate.$set[`${k}`] = val
			}
		}

		this.cache.PieceInstances.update(pieceInstance._id, update)
		this.cache.Pieces.update(pieceInstance.piece._id, legacyUpdate)

		this.nextPartState = Math.max(this.nextPartState, updatesNextPart)
		this.currentPartState = Math.max(this.currentPartState, updatesCurrentPart)

		return clone(unprotectObject(this.cache.PieceInstances.findOne(pieceInstance._id)!))
	}
	queuePart(rawPart: IBlueprintPart, rawPieces: IBlueprintPiece[]): IBlueprintPartInstance {
		const currentPartInstance = this.rundownPlaylist.currentPartInstanceId
			? this.cache.PartInstances.findOne(this.rundownPlaylist.currentPartInstanceId)
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

		if (isTooCloseToAutonext(currentPartInstance, false)) {
			throw new Error('Too close to an autonext to queue a part')
		}

		if (rawPieces.length === 0) {
			throw new Error('New part must contain at least one piece')
		}

		const newPartInstance = new PartInstance({
			_id: getRandomId(),
			rundownId: currentPartInstance.rundownId,
			segmentId: currentPartInstance.segmentId,
			takeCount: -1, // Filled in later
			rehearsal: currentPartInstance.rehearsal,
			part: new Part({
				...rawPart,
				_id: getRandomId(),
				rundownId: currentPartInstance.rundownId,
				segmentId: currentPartInstance.segmentId,
				_rank: 99999, // something high, so it will be placed after current part. The rank will be updated later to its correct value
				dynamicallyInserted: true,
				notes: [],
			}),
		})

		if (!newPartInstance.part.isPlayable()) {
			throw new Error('Cannot queue a part which is not playable')
		}

		const pieces = postProcessPieces(
			this,
			rawPieces,
			this.getShowStyleBase().blueprintId,
			currentPartInstance.rundownId,
			newPartInstance.part._id
		)
		const newPieceInstances = pieces.map((piece) => wrapPieceToInstance(piece, newPartInstance._id))

		// Do the work
		ServerPlayoutAdLibAPI.innerStartQueuedAdLib(
			this.cache,
			this.rundownPlaylist,
			this.rundown,
			currentPartInstance,
			newPartInstance,
			newPieceInstances
		)

		this.nextPartState = ActionPartChange.SAFE_CHANGE

		return clone(unprotectObject(newPartInstance))
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

	private _stopPiecesByRule(filter: (pieceInstance: PieceInstance) => boolean, timeOffset: number | undefined) {
		if (!this.rundownPlaylist.currentPartInstanceId) {
			return []
		}
		const partInstance = this.cache.PartInstances.findOne(this.rundownPlaylist.currentPartInstanceId)
		if (!partInstance) {
			throw new Error('Cannot stop pieceInstances when no current partInstance')
		}

		const stoppedIds = ServerPlayoutAdLibAPI.innerStopPieces(this.cache, partInstance, filter, timeOffset)

		if (stoppedIds.length > 0) {
			this.currentPartState = Math.max(this.currentPartState, ActionPartChange.SAFE_CHANGE)
		}

		return unprotectStringArray(stoppedIds)
	}
}
