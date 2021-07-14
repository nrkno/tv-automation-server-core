import { ContextInfo, RundownContext } from './context'
import {
	IBlueprintPiece,
	IBlueprintPieceInstance,
	OmitId,
	IBlueprintMutatablePart,
	IBlueprintPartInstance,
	ISyncIngestUpdateToPartInstanceContext,
} from '@sofie-automation/blueprints-integration'
import { PartInstance, DBPartInstance, PartInstances } from '../../../../lib/collections/PartInstances'
import _ from 'underscore'
import { IBlueprintPieceSampleKeys, IBlueprintMutatablePartSampleKeys } from './lib'
import { postProcessPieces, postProcessTimelineObjects } from '../postProcess'
import {
	wrapPieceToInstance,
	PieceInstance,
	PieceInstances,
	PieceInstanceId,
} from '../../../../lib/collections/PieceInstances'
import {
	unprotectObject,
	protectString,
	protectStringArray,
	unprotectStringArray,
	normalizeArrayToMap,
	clone,
} from '../../../../lib/lib'
import { Rundown } from '../../../../lib/collections/Rundowns'
import { DbCacheWriteCollection } from '../../../cache/CacheCollection'
import { setupPieceInstanceInfiniteProperties } from '../../playout/pieces'
import { Meteor } from 'meteor/meteor'
import { INoteBase, NoteType } from '../../../../lib/api/notes'
import { RundownPlaylistActivationId } from '../../../../lib/collections/RundownPlaylists'
import { ReadonlyDeep } from 'type-fest'
import { ShowStyleCompound } from '../../../../lib/collections/ShowStyleVariants'
import { Studio } from '../../../../lib/collections/Studios'
import { CacheForPlayout } from '../../playout/cache'

export class SyncIngestUpdateToPartInstanceContext
	extends RundownContext
	implements ISyncIngestUpdateToPartInstanceContext
{
	private readonly _partInstanceCache: DbCacheWriteCollection<PartInstance, DBPartInstance>
	private readonly _pieceInstanceCache: DbCacheWriteCollection<PieceInstance, PieceInstance>
	private readonly _proposedPieceInstances: Map<PieceInstanceId, PieceInstance>
	public readonly notes: INoteBase[] = []
	private readonly tempSendNotesIntoBlackHole: boolean

	constructor(
		contextInfo: ContextInfo,
		private readonly playlistActivationId: RundownPlaylistActivationId,
		studio: ReadonlyDeep<Studio>,
		showStyleCompound: ReadonlyDeep<ShowStyleCompound>,
		rundown: ReadonlyDeep<Rundown>,
		private partInstance: PartInstance,
		pieceInstances: PieceInstance[],
		proposedPieceInstances: PieceInstance[],
		private playStatus: 'current' | 'next'
	) {
		super(contextInfo, studio, showStyleCompound, rundown)

		// Create temporary cache databases
		this._pieceInstanceCache = DbCacheWriteCollection.createFromArray(PieceInstances, pieceInstances)
		this._partInstanceCache = DbCacheWriteCollection.createFromArray(PartInstances, [partInstance])

		this._proposedPieceInstances = normalizeArrayToMap(proposedPieceInstances, '_id')
	}

	notifyUserError(message: string, params?: { [key: string]: any }): void {
		if (this.tempSendNotesIntoBlackHole) {
			this.logError(`UserNotes: "${message}", ${JSON.stringify(params)}`)
		} else {
			this.notes.push({
				type: NoteType.ERROR,
				message: {
					key: message,
					args: params,
				},
			})
		}
	}
	notifyUserWarning(message: string, params?: { [key: string]: any }): void {
		if (this.tempSendNotesIntoBlackHole) {
			this.logWarning(`UserNotes: "${message}", ${JSON.stringify(params)}`)
		} else {
			this.notes.push({
				type: NoteType.WARNING,
				message: {
					key: message,
					args: params,
				},
			})
		}
	}

	applyChangesToCache(cache: CacheForPlayout) {
		if (this._partInstanceCache.isModified() || this._pieceInstanceCache.isModified()) {
			this.logInfo(`Found ingest changes to apply to PartInstance`)
		} else {
			this.logInfo(`No ingest changes to apply to PartInstance`)
		}

		this._pieceInstanceCache.updateOtherCacheWithData(cache.PieceInstances)
		this._partInstanceCache.updateOtherCacheWithData(cache.PartInstances)
	}

	syncPieceInstance(
		pieceInstanceId: string,
		modifiedPiece?: Omit<IBlueprintPiece, 'lifespan'>
	): IBlueprintPieceInstance {
		const proposedPieceInstance = this._proposedPieceInstances.get(protectString(pieceInstanceId))
		if (!proposedPieceInstance) {
			throw new Meteor.Error(404, `PieceInstance "${pieceInstanceId}" could not be found`)
		}

		// filter the submission to the allowed ones
		const piece = modifiedPiece
			? postProcessPieces(
					this,
					[
						{
							...modifiedPiece,
							// Some properties arent allowed to be changed
							lifespan: proposedPieceInstance.piece.lifespan,
						},
					],
					this.showStyleCompound.blueprintId,
					this.partInstance.rundownId,
					this.partInstance.segmentId,
					this.partInstance.part._id,
					this.playStatus === 'current',
					true
			  )[0]
			: proposedPieceInstance.piece

		const existingPieceInstance = this._pieceInstanceCache.findOne(proposedPieceInstance._id)
		const newPieceInstance: PieceInstance = {
			...existingPieceInstance,
			...proposedPieceInstance,
			piece: piece,
		}
		this._pieceInstanceCache.replace(newPieceInstance)
		return clone(unprotectObject(newPieceInstance))
	}

	insertPieceInstance(piece0: IBlueprintPiece): IBlueprintPieceInstance {
		const trimmedPiece: IBlueprintPiece = _.pick(piece0, IBlueprintPieceSampleKeys)

		const piece = postProcessPieces(
			this,
			[trimmedPiece],
			this.showStyleCompound.blueprintId,
			this.partInstance.rundownId,
			this.partInstance.segmentId,
			this.partInstance.part._id,
			this.playStatus === 'current',
			true
		)[0]
		const newPieceInstance = wrapPieceToInstance(piece, this.playlistActivationId, this.partInstance._id)

		// Ensure the infinite-ness is setup correctly. We assume any piece inserted starts in the current part
		setupPieceInstanceInfiniteProperties(newPieceInstance)

		this._pieceInstanceCache.insert(newPieceInstance)

		return clone(unprotectObject(newPieceInstance))
	}
	updatePieceInstance(pieceInstanceId: string, updatedPiece: Partial<IBlueprintPiece>): IBlueprintPieceInstance {
		// filter the submission to the allowed ones
		const trimmedPiece: Partial<OmitId<IBlueprintPiece>> = _.pick(updatedPiece, IBlueprintPieceSampleKeys)
		if (Object.keys(trimmedPiece).length === 0) {
			throw new Meteor.Error(
				404,
				`Cannot update PieceInstance "${pieceInstanceId}". Some valid properties must be defined`
			)
		}

		const pieceInstance = this._pieceInstanceCache.findOne(protectString(pieceInstanceId))
		if (!pieceInstance) {
			throw new Meteor.Error(404, `PieceInstance "${pieceInstanceId}" could not be found`)
		}
		if (pieceInstance.partInstanceId !== this.partInstance._id) {
			throw new Meteor.Error(
				404,
				`PieceInstance "${pieceInstanceId}" does not belong to the current PartInstance`
			)
		}

		if (updatedPiece.content && updatedPiece.content.timelineObjects) {
			updatedPiece.content.timelineObjects = postProcessTimelineObjects(
				this,
				pieceInstance.piece._id,
				this.showStyleCompound.blueprintId,
				updatedPiece.content.timelineObjects,
				false
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

		this._pieceInstanceCache.update(pieceInstance._id, update)

		return clone(unprotectObject(this._pieceInstanceCache.findOne(pieceInstance._id)!))
	}
	updatePartInstance(updatePart: Partial<IBlueprintMutatablePart>): IBlueprintPartInstance {
		// filter the submission to the allowed ones
		const trimmedProps: Partial<IBlueprintMutatablePart> = _.pick(updatePart, IBlueprintMutatablePartSampleKeys)
		if (Object.keys(trimmedProps).length === 0) {
			throw new Meteor.Error(404, `Cannot update PartInstance. Some valid properties must be defined`)
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

		this._partInstanceCache.update(this.partInstance._id, update)
		return clone(unprotectObject(this._partInstanceCache.findOne(this.partInstance._id)!))
	}
	removePieceInstances(...pieceInstanceIds: string[]): string[] {
		const pieceInstances = this._pieceInstanceCache.findFetch({
			partInstanceId: this.partInstance._id,
			_id: { $in: protectStringArray(pieceInstanceIds) },
		})

		this._pieceInstanceCache.remove({
			_id: { $in: pieceInstances.map((p) => p._id) },
		})

		return unprotectStringArray(pieceInstances.map((p) => p._id))
	}
}
