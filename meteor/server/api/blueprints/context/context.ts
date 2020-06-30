import * as _ from 'underscore'
import { Meteor } from 'meteor/meteor'
import {
	getHash,
	formatDateAsTimecode,
	formatDurationAsTimecode,
	unprotectString,
	unprotectObject,
	unprotectObjectArray,
	protectString,
	check,
	getCurrentTime,
} from '../../../../lib/lib'
import { DBPart, PartId } from '../../../../lib/collections/Parts'
import { Match } from 'meteor/check'
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
	IBlueprintExternalMessageQueueObj,
	ExtendedIngestRundown,
} from 'tv-automation-sofie-blueprints-integration'
import { Studio, StudioId } from '../../../../lib/collections/Studios'
import { ConfigRef, compileStudioConfig, findMissingConfigs } from '../config'
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
} from '../../../../lib/collections/PieceInstances'
import {
	InternalIBlueprintPartInstance,
	PartInstanceId,
	unprotectPartInstance,
	PartInstance,
} from '../../../../lib/collections/PartInstances'
import { Blueprints } from '../../../../lib/collections/Blueprints'
import { ExternalMessageQueue } from '../../../../lib/collections/ExternalMessageQueue'
import { extendIngestRundownCore } from '../../ingest/lib'

/** Common */

export class CommonContext implements ICommonContext {
	private _idPrefix: string = ''
	private hashI = 0
	private hashed: { [hash: string]: string } = {}

	constructor(idPrefix: string) {
		this._idPrefix = idPrefix
	}
	getHashId(str: string, isNotUnique?: boolean) {
		if (!str) str = 'hash' + this.hashI++

		if (isNotUnique) {
			str = str + '_' + this.hashI++
		}

		const id = getHash(this._idPrefix + '_' + str.toString())
		this.hashed[id] = str
		return id
	}
	unhashId(hash: string): string {
		return this.hashed[hash] || hash
	}
}

export interface RawNote extends INoteBase {
	trackingId: string | undefined
}

export class NotesContext extends CommonContext implements INotesContext {
	private readonly _contextName: string
	private readonly _contextIdentifier: string
	private _handleNotesExternally: boolean

	private readonly savedNotes: Array<RawNote> = []

	constructor(contextName: string, contextIdentifier: string, handleNotesExternally: boolean) {
		super(contextIdentifier)
		this._contextName = contextName
		this._contextIdentifier = contextIdentifier
		/** If the notes will be handled externally (using .getNotes()), set this to true */
		this._handleNotesExternally = handleNotesExternally
	}
	/** Throw Error and display message to the user in the GUI */
	error(message: string, trackingId?: string) {
		check(message, String)
		logger.error('Error from blueprint: ' + message)
		this._pushNote(NoteType.ERROR, message, trackingId)
		throw new Meteor.Error(500, message)
	}
	/** Save note, which will be displayed to the user in the GUI */
	warning(message: string, trackingId?: string) {
		check(message, String)
		this._pushNote(NoteType.WARNING, message, trackingId)
	}
	getNotes(): RawNote[] {
		return this.savedNotes
	}
	get handleNotesExternally(): boolean {
		return this._handleNotesExternally
	}
	set handleNotesExternally(value: boolean) {
		this._handleNotesExternally = value
	}
	protected _pushNote(type: NoteType, message: string, trackingId: string | undefined) {
		if (this._handleNotesExternally) {
			this.savedNotes.push({
				type: type,
				message: message,
				trackingId: trackingId,
			})
		} else {
			if (type === NoteType.WARNING) {
				logger.warn(
					`Warning from "${this._contextName}"${trackingId ? `(${trackingId})` : ''}: "${message}"\n(${
						this._contextIdentifier
					})`
				)
			} else {
				logger.error(
					`Error from "${this._contextName}"${trackingId ? `(${trackingId})` : ''}: "${message}"\n(${
						this._contextIdentifier
					})`
				)
			}
		}
	}
}

/** Studio */

export class StudioConfigContext implements IStudioConfigContext {
	protected readonly studio: Studio
	constructor(studio: Studio) {
		this.studio = studio
	}

	public get studioId(): StudioId {
		return this.studio._id
	}

	getStudio(): Readonly<Studio> {
		return this.studio
	}
	getStudioConfig(): Readonly<{ [key: string]: ConfigItemValue }> {
		const studioBlueprint = Blueprints.findOne(this.studio.blueprintId)
		if (studioBlueprint) {
			const diffs = findMissingConfigs(studioBlueprint.studioConfigManifest, this.studio.config)
			if (diffs && diffs.length) {
				logger.warn(`Studio "${this.studio._id}" missing required config: ${diffs.join(', ')}`)
			}
		} else {
			logger.warn(`Studio blueprint "${this.studio.blueprintId}" not found!`)
		}

		return compileStudioConfig(this.studio)
	}
	getStudioConfigRef(configKey: string): string {
		return ConfigRef.getStudioConfigRef(this.studio._id, configKey)
	}
}

export class StudioContext extends StudioConfigContext implements IStudioContext {
	getStudioMappings(): Readonly<BlueprintMappings> {
		return this.studio.mappings
	}
}

/** Show Style Variant */

export class ShowStyleContext extends StudioContext implements IShowStyleContext {
	public readonly showStyleBaseId: ShowStyleBaseId
	public readonly showStyleVariantId: ShowStyleVariantId

	readonly notesContext: NotesContext

	constructor(
		studio: Studio,
		showStyleBaseId: ShowStyleBaseId,
		showStyleVariantId: ShowStyleVariantId,
		notesContext: NotesContext
	) {
		super(studio)

		this.showStyleBaseId = showStyleBaseId
		this.showStyleVariantId = showStyleVariantId
		this.notesContext = notesContext
	}

	getShowStyleBase(): ShowStyleBase {
		const showStyleBase = ShowStyleBases.findOne(this.showStyleBaseId)
		if (!showStyleBase) throw new Meteor.Error(404, 'ShowStyleBase "' + this.showStyleBaseId + '" not found')

		return showStyleBase
	}
	getShowStyleConfig(): { [key: string]: ConfigItemValue } {
		const showStyleCompound = getShowStyleCompound(this.showStyleVariantId)
		if (!showStyleCompound) throw new Meteor.Error(404, `no showStyleCompound for "${this.showStyleVariantId}"`)

		const showStyleBlueprint = Blueprints.findOne(showStyleCompound.blueprintId)
		if (showStyleBlueprint) {
			const diffs = findMissingConfigs(showStyleBlueprint.showStyleConfigManifest, showStyleCompound.config)
			if (diffs && diffs.length) {
				logger.warn(
					`ShowStyle "${showStyleCompound._id}-${
						showStyleCompound.showStyleVariantId
					}" missing required config: ${diffs.join(', ')}`
				)
			}
		} else {
			logger.warn(`ShowStyle blueprint "${showStyleCompound.blueprintId}" not found!`)
		}

		const res: { [key: string]: ConfigItemValue } = {}
		_.each(showStyleCompound.config, (c) => {
			res[c._id] = c.value
		})
		return res
	}
	getShowStyleConfigRef(configKey: string): string {
		return ConfigRef.getShowStyleConfigRef(this.showStyleVariantId, configKey)
	}

	/** NotesContext */
	error(message: string, trackingId?: string) {
		this.notesContext.error(message, trackingId)
	}
	warning(message: string, trackingId?: string) {
		this.notesContext.warning(message, trackingId)
	}
	getHashId(str: string, isNotUnique?: boolean) {
		return this.notesContext.getHashId(str, isNotUnique)
	}
	unhashId(hash: string) {
		return this.notesContext.unhashId(hash)
	}
	get handleNotesExternally(): boolean {
		return this.notesContext.handleNotesExternally
	}
	set handleNotesExternally(value: boolean) {
		this.notesContext.handleNotesExternally = value
	}
}

/** Rundown */

export class RundownContext extends ShowStyleContext implements IRundownContext, IEventContext {
	readonly rundownId: string
	readonly rundown: Readonly<IBlueprintRundownDB>
	readonly _rundown: Rundown
	readonly playlistId: RundownPlaylistId

	constructor(rundown: Rundown, notesContext: NotesContext | undefined, studio?: Studio) {
		super(
			studio || rundown.getStudio(),
			rundown.showStyleBaseId,
			rundown.showStyleVariantId,
			notesContext || new NotesContext(rundown.name, `rundownId=${rundown._id}`, false)
		)

		this.rundownId = unprotectString(rundown._id)
		this.rundown = unprotectObject(rundown)
		this._rundown = rundown
		this.playlistId = rundown.playlistId
	}

	getCurrentTime(): number {
		return getCurrentTime()
	}
}

export type BlueprintRuntimeArgumentsSet = { [key: string]: BlueprintRuntimeArguments | undefined }
export class SegmentContext extends RundownContext implements ISegmentContext {
	private readonly runtimeArguments: Readonly<BlueprintRuntimeArgumentsSet>
	private readonly segment: Readonly<Segment>

	constructor(
		rundown: Rundown,
		studio: Studio | undefined,
		runtimeArguments: BlueprintRuntimeArgumentsSet | DBPart[],
		notesContext: NotesContext
	) {
		super(rundown, notesContext, studio)

		if (_.isArray(runtimeArguments)) {
			const existingRuntimeArguments: BlueprintRuntimeArgumentsSet = {}
			_.each(runtimeArguments, (p) => {
				if (p.runtimeArguments) {
					existingRuntimeArguments[p.externalId] = p.runtimeArguments
				}
			})
			this.runtimeArguments = existingRuntimeArguments
		} else {
			this.runtimeArguments = runtimeArguments
		}
	}

	getRuntimeArguments(externalId: string): BlueprintRuntimeArguments | undefined {
		return this.runtimeArguments[externalId]
	}
}

/** Events */

export class EventContext extends CommonContext implements IEventContext {
	// TDB: Certain actions that can be triggered in Core by the Blueprint

	getCurrentTime(): number {
		return getCurrentTime()
	}
}

export class PartEventContext extends RundownContext implements IPartEventContext {
	readonly part: Readonly<IBlueprintPartInstance>

	constructor(rundown: Rundown, studio: Studio | undefined, partInstance: PartInstance) {
		super(
			rundown,
			new NotesContext(rundown.name, `rundownId=${rundown._id},partInstanceId=${partInstance._id}`, false),
			studio
		)

		this.part = unprotectPartInstance(partInstance)
	}

	getCurrentTime(): number {
		return getCurrentTime()
	}
}

export class AsRunEventContext extends RundownContext implements IAsRunEventContext {
	public readonly asRunEvent: Readonly<IBlueprintAsRunLogEvent>

	constructor(rundown: Rundown, studio: Studio | undefined, asRunEvent: AsRunLogEvent) {
		super(
			rundown,
			new NotesContext(rundown.name, `rundownId=${rundown._id},asRunEventId=${asRunEvent._id}`, false),
			studio
		)
		this.asRunEvent = unprotectObject(asRunEvent)
	}

	/** Get all asRunEvents in the rundown */
	getAllAsRunEvents(): Array<IBlueprintAsRunLogEvent> {
		return unprotectObjectArray(
			AsRunLog.find(
				{
					rundownId: this._rundown._id,
				},
				{
					sort: {
						timestamp: 1,
					},
				}
			).fetch()
		)
	}
	/** Get all unsent and queued messages in the rundown */
	getAllQueuedMessages(): Readonly<IBlueprintExternalMessageQueueObj[]> {
		return unprotectObjectArray(
			ExternalMessageQueue.find(
				{
					rundownId: this._rundown._id,
					queueForLaterReason: { $exists: true },
				},
				{
					sort: {
						created: 1,
					},
				}
			).fetch()
		)
	}
	/** Get all segments in this rundown */
	getSegments(): Array<IBlueprintSegmentDB> {
		return unprotectObjectArray(this._rundown.getSegments())
	}
	/**
	 * Returns a segment
	 * @param segmentId Id of segment to fetch. If is omitted, return the segment related to this AsRunEvent
	 */
	getSegment(segmentId?: string): IBlueprintSegmentDB | undefined {
		segmentId = segmentId || this.asRunEvent.segmentId
		check(segmentId, String)
		if (segmentId) {
			return unprotectObject(
				this._rundown.getSegments({
					_id: protectString(segmentId),
				})[0]
			)
		}
	}
	/** Get all parts in this rundown */
	getParts(): Array<IBlueprintPartDB> {
		return unprotectObjectArray(this._rundown.getParts())
	}
	/** Get the part related to this AsRunEvent */
	getPartInstance(partInstanceId?: string): IBlueprintPartInstance | undefined {
		partInstanceId = partInstanceId || this.asRunEvent.partInstanceId
		check(partInstanceId, String)
		if (partInstanceId) {
			return unprotectPartInstance(
				this._rundown.getAllPartInstances({
					_id: protectString(partInstanceId),
				})[0]
			)
		}
	}
	/** Get the mos story related to a part */
	getIngestDataForPart(part: IBlueprintPartDB): IngestPart | undefined {
		check(part._id, String)

		try {
			return loadIngestDataCachePart(
				this._rundown._id,
				this.rundown.externalId,
				protectString<PartId>(part._id),
				part.externalId
			).data
		} catch (e) {
			return undefined
		}
	}
	getIngestDataForPartInstance(partInstance: IBlueprintPartInstance): IngestPart | undefined {
		return this.getIngestDataForPart(partInstance.part)
	}
	/** Get the mos story related to the rundown */
	getIngestDataForRundown(): ExtendedIngestRundown | undefined {
		try {
			const ingestRundown = loadCachedRundownData(this._rundown._id, this.rundown.externalId)
			return extendIngestRundownCore(ingestRundown, this._rundown)
		} catch (e) {
			return undefined
		}
	}

	/**
	 * Returns a piece.
	 * @param id Id of piece to fetch. If omitted, return the piece related to this AsRunEvent
	 */
	getPieceInstance(pieceInstanceId?: string): IBlueprintPieceInstance | undefined {
		check(pieceInstanceId, Match.Optional(String))
		pieceInstanceId = pieceInstanceId || this.asRunEvent.pieceInstanceId
		if (pieceInstanceId) {
			return unprotectPieceInstance(
				PieceInstances.findOne({
					rundownId: this._rundown._id,
					_id: protectString(pieceInstanceId),
				})
			)
		}
	}
	/**
	 * Returns pieces in a part
	 * @param id Id of part to fetch pieces in
	 */
	getPieceInstances(partInstanceId: string): Array<IBlueprintPieceInstance> {
		check(partInstanceId, String)
		if (partInstanceId) {
			return unprotectObjectArray(
				PieceInstances.find({
					rundownId: this._rundown._id,
					partInstanceId: protectString(partInstanceId),
				}).fetch()
			) as any // pieceinstande.piece is the issue
		}
		return []
	}

	formatDateAsTimecode(time: number): string {
		check(time, Number)
		return formatDateAsTimecode(new Date(time))
	}
	formatDurationAsTimecode(time: number): string {
		check(time, Number)
		return formatDurationAsTimecode(time)
	}
	protected getLoggerIdentifier(): string {
		// override NotesContext.getLoggerIdentifier
		let ids: string[] = []
		if (this.rundownId) ids.push('rundownId: ' + this.rundownId)
		if (this.asRunEvent.segmentId) ids.push('segmentId: ' + this.asRunEvent.segmentId)
		if (this.asRunEvent.partInstanceId) ids.push('partInstanceId: ' + this.asRunEvent.partInstanceId)
		if (this.asRunEvent.pieceInstanceId) ids.push('pieceInstanceId: ' + this.asRunEvent.pieceInstanceId)
		if (this.asRunEvent.timelineObjectId) ids.push('timelineObjectId: ' + this.asRunEvent.timelineObjectId)
		return ids.join(',')
	}
}
