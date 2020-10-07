import * as _ from 'underscore'
import * as objectPath from 'object-path'
import { Meteor } from 'meteor/meteor'
import {
	getHash,
	formatDateAsTimecode,
	formatDurationAsTimecode,
	unprotectString,
	unprotectObject,
	unprotectObjectArray,
	protectString,
	getCurrentTime,
	objectPathGet,
	objectPathSet,
	waitForPromise,
	clone,
	omit,
	getRandomId,
	unpartialString,
	unprotectStringArray,
} from '../../../../lib/lib'
import { DBPart, PartId } from '../../../../lib/collections/Parts'
import { check, Match } from '../../../../lib/check'
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
	TimelineEventContext as ITimelineEventContext,
	IStudioConfigContext,
	ConfigItemValue,
	IStudioContext,
	BlueprintMappings,
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
	OnGenerateTimelineObj,
} from 'tv-automation-sofie-blueprints-integration'
import { Studio, StudioId, Studios } from '../../../../lib/collections/Studios'
import { ConfigRef, preprocessStudioConfig, findMissingConfigs, preprocessShowStyleConfig } from '../config'
import { Rundown } from '../../../../lib/collections/Rundowns'
import { ShowStyleBase, ShowStyleBases, ShowStyleBaseId } from '../../../../lib/collections/ShowStyleBases'
import {
	getShowStyleCompound,
	ShowStyleVariantId,
	ShowStyleVariants,
	ShowStyleVariant,
	createShowStyleCompound,
} from '../../../../lib/collections/ShowStyleVariants'
import { AsRunLogEvent, AsRunLog } from '../../../../lib/collections/AsRunLog'
import { NoteType, INoteBase } from '../../../../lib/api/notes'
import { loadCachedRundownData, loadIngestDataCachePart } from '../../ingest/ingestCache'
import { RundownPlaylistId, ABSessionInfo } from '../../../../lib/collections/RundownPlaylists'
import {
	PieceInstances,
	unprotectPieceInstance,
	PieceInstance,
	protectPieceInstance,
	PieceInstanceId,
	PieceInstanceInfiniteId,
} from '../../../../lib/collections/PieceInstances'
import { unprotectPartInstance, PartInstance, PartInstanceId } from '../../../../lib/collections/PartInstances'
import { Blueprints } from '../../../../lib/collections/Blueprints'
import { ExternalMessageQueue } from '../../../../lib/collections/ExternalMessageQueue'
import { extendIngestRundownCore } from '../../ingest/lib'
import { loadStudioBlueprint, loadShowStyleBlueprint } from '../cache'
import { CacheForRundownPlaylist, ReadOnlyCacheForRundownPlaylist } from '../../../DatabaseCaches'
import { getSelectedPartInstancesFromCache } from '../../playout/lib'
import { SegmentId } from '../../../../lib/collections/Segments'
import { DeepReadonly, DeepPartial } from 'utility-types'
import { DeclarationWithTypeParameters } from 'typescript'
import { Random } from 'meteor/random'
import { PieceId } from '../../../../lib/collections/Pieces'
import { TimelineObjRundown, OnGenerateTimelineObjExt } from '../../../../lib/collections/Timeline'

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

const studioBlueprintConfigCache: { [studioId: string]: Cache } = {}
const showStyleBlueprintConfigCache: { [showStyleBaseId: string]: { [showStyleVariantId: string]: Cache } } = {}
interface Cache {
	config: unknown
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
	getStudioConfig(): unknown {
		const studioId = unprotectString(this.studio._id)
		if (studioBlueprintConfigCache[studioId]) {
			return studioBlueprintConfigCache[studioId].config
		}

		logger.debug('Building Studio config')
		const studioBlueprint = loadStudioBlueprint(this.studio)
		if (studioBlueprint) {
			const diffs = findMissingConfigs(
				studioBlueprint.blueprint.studioConfigManifest,
				this.studio.blueprintConfig
			)
			if (diffs && diffs.length) {
				logger.warn(`Studio "${this.studio._id}" missing required config: ${diffs.join(', ')}`)
			}
		} else {
			logger.warn(`Studio blueprint "${this.studio.blueprintId}" not found!`)
		}
		const compiledConfig = preprocessStudioConfig(this.studio, studioBlueprint?.blueprint)
		studioBlueprintConfigCache[studioId] = {
			config: compiledConfig,
		}
		return compiledConfig
	}
	protected wipeCache() {
		const studioId = unprotectString(this.studio._id)
		delete studioBlueprintConfigCache[studioId]
		this.getStudioConfig()
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
	readonly notesContext: NotesContext

	constructor(
		studio: Studio,
		private readonly cache: ReadOnlyCacheForRundownPlaylist | undefined,
		readonly _rundown: Rundown | undefined,
		readonly showStyleBaseId: ShowStyleBaseId,
		readonly showStyleVariantId: ShowStyleVariantId,
		notesContext: NotesContext
	) {
		super(studio)

		this.notesContext = notesContext
	}

	getShowStyleBase(): ShowStyleBase {
		if (this.cache && this._rundown) {
			return waitForPromise(this.cache.activationCache.getShowStyleBase(this._rundown))
		} else {
			const showstyleBase = ShowStyleBases.findOne(this.showStyleBaseId)
			if (!showstyleBase) throw new Meteor.Error(404, `ShowStyleBase "${this.showStyleBaseId}" not found!`)
			return showstyleBase
		}
	}
	getShowStyleVariant(): ShowStyleVariant {
		if (this.cache && this._rundown) {
			return waitForPromise(this.cache.activationCache.getShowStyleVariant(this._rundown))
		} else {
			const showstyleVariant = ShowStyleVariants.findOne(this.showStyleVariantId)
			if (!showstyleVariant)
				throw new Meteor.Error(404, `ShowStyleVariant "${this.showStyleVariantId}" not found!`)
			return showstyleVariant
		}
	}
	getShowStyleConfig(): unknown {
		const cacheId = `${this.showStyleBaseId}.${this.showStyleVariantId}`
		const cachedConfig = objectPathGet(showStyleBlueprintConfigCache, cacheId)
		if (cachedConfig) {
			return cachedConfig.config
		}

		logger.debug('Building ShowStyle config')
		const showStyleBase = this.getShowStyleBase()
		const showStyleVariant = this.getShowStyleVariant()

		const showStyleCompound = createShowStyleCompound(showStyleBase, showStyleVariant)
		if (!showStyleCompound) throw new Meteor.Error(404, `no showStyleCompound for "${showStyleVariant._id}"`)

		const showStyleBlueprint = loadShowStyleBlueprint(showStyleCompound)
		if (showStyleBlueprint) {
			const diffs = findMissingConfigs(
				showStyleBlueprint.blueprint.showStyleConfigManifest,
				showStyleCompound.blueprintConfig
			)
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

		const compiledConfig = preprocessShowStyleConfig(showStyleCompound, showStyleBlueprint?.blueprint)
		objectPathSet(showStyleBlueprintConfigCache, cacheId, {
			config: compiledConfig,
		})
		return compiledConfig
	}
	wipeCache() {
		super.wipeCache()
		const cacheId = `${this.showStyleBaseId}.${this.showStyleVariantId}`
		objectPath.del(showStyleBlueprintConfigCache, cacheId)
		this.getShowStyleConfig()
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

	constructor(rundown: Rundown, cache: ReadOnlyCacheForRundownPlaylist, notesContext: NotesContext | undefined) {
		super(
			cache.activationCache.getStudio(),
			cache,
			rundown,
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

export class SegmentContext extends RundownContext implements ISegmentContext {
	constructor(rundown: Rundown, cache: CacheForRundownPlaylist, notesContext: NotesContext) {
		super(rundown, cache, notesContext)
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

	constructor(rundown: Rundown, cache: CacheForRundownPlaylist, partInstance: PartInstance) {
		super(
			rundown,
			cache,
			new NotesContext(rundown.name, `rundownId=${rundown._id},partInstanceId=${partInstance._id}`, false)
		)

		this.part = unprotectPartInstance(partInstance)
	}

	getCurrentTime(): number {
		return getCurrentTime()
	}
}

interface ABSessionInfoExt extends ABSessionInfo {
	keep?: boolean
}

export class TimelineEventContext extends RundownContext implements ITimelineEventContext {
	private readonly partInstances: DeepReadonly<Array<PartInstance>>
	readonly currentPartInstance: Readonly<IBlueprintPartInstance> | undefined
	readonly nextPartInstance: Readonly<IBlueprintPartInstance> | undefined

	private readonly _knownSessions: ABSessionInfoExt[]

	public get knownSessions() {
		return this._knownSessions.filter((s) => s.keep).map((s) => omit(s, 'keep'))
	}

	constructor(
		rundown: Rundown,
		cache: CacheForRundownPlaylist,
		previousPartInstance: PartInstance | undefined,
		currentPartInstance: PartInstance | undefined,
		nextPartInstance: PartInstance | undefined
	) {
		super(
			rundown,
			cache,
			new NotesContext(
				rundown.name,
				`rundownId=${rundown._id},previousPartInstance=${previousPartInstance?._id},currentPartInstance=${currentPartInstance?._id},nextPartInstance=${nextPartInstance?._id}`,
				false
			)
		)

		this.currentPartInstance = currentPartInstance ? unprotectPartInstance(currentPartInstance) : undefined
		this.nextPartInstance = nextPartInstance ? unprotectPartInstance(nextPartInstance) : undefined

		this.partInstances = _.compact([previousPartInstance, currentPartInstance, nextPartInstance])

		this._knownSessions =
			clone(cache.RundownPlaylists.findOne(cache.containsDataFromPlaylist)?.trackedAbSessions) ?? []
		console.log('')
	}

	getCurrentTime(): number {
		return getCurrentTime()
	}

	getPieceABSessionId(pieceInstance0: IBlueprintPieceInstance, sessionName: string): string {
		const pieceInstance = protectPieceInstance(pieceInstance0)

		const pieceInstanceId = pieceInstance._id
		if (!pieceInstanceId) throw new Error('Missing pieceInstanceId in call to getPieceABSessionId')
		const partInstanceId = pieceInstance.partInstanceId
		if (!partInstanceId) throw new Error('Missing partInstanceId in call to getPieceABSessionId')

		const partInstanceIndex = this.partInstances.findIndex((p) => p._id === partInstanceId)
		const partInstance = partInstanceIndex >= 0 ? this.partInstances[partInstanceIndex] : undefined
		if (!partInstance) throw new Error('Unknown partInstanceId in call to getPieceABSessionId')

		const infiniteId = pieceInstance.infinite?.infiniteInstanceId
		const preserveSession = (session: ABSessionInfoExt): string => {
			session.keep = true
			session.infiniteInstanceId = unpartialString(infiniteId)
			delete session.lookaheadForPartId
			return session.id
		}

		// If this is an infinite continuation, then reuse that
		if (infiniteId) {
			const infiniteSession = this._knownSessions.find(
				(s) => s.infiniteInstanceId === infiniteId && s.name === sessionName
			)
			if (infiniteSession) {
				// console.log(`AB Session keep infinite: ${JSON.stringify(infiniteSession)}`)
				return preserveSession(infiniteSession)
			}
		}

		// We only want to consider sessions already tagged to this partInstance
		const existingSession = this._knownSessions.find(
			(s) => s.partInstanceIds?.includes(unpartialString(partInstanceId)) && s.name === sessionName
			// s.lookaheadForPartId === undefined
		)
		if (existingSession) {
			// console.log(`AB Session keep normal: ${JSON.stringify(existingSession)}`)
			return preserveSession(existingSession)
		}

		// Check if we can continue sessions from the part before, or if we should create new ones
		const canReuseFromPartInstanceBefore =
			partInstanceIndex > 0 && this.partInstances[partInstanceIndex - 1].part._rank < partInstance.part._rank

		if (canReuseFromPartInstanceBefore) {
			// Try and find a session from the part before that we can use
			const previousPartInstanceId = this.partInstances[partInstanceIndex - 1]._id
			const continuedSession = this._knownSessions.find(
				(s) => s.partInstanceIds?.includes(previousPartInstanceId) && s.name === sessionName
				// && s.lookaheadForPartId === undefined
			)
			if (continuedSession) {
				continuedSession.partInstanceIds = [
					...(continuedSession.partInstanceIds || []),
					unpartialString(partInstanceId),
				]
				// console.log(`AB Session keep normal: ${JSON.stringify(existingSession)}`)
				return preserveSession(continuedSession)
			}
		}

		// Find an existing lookahead session to convert
		const partId = partInstance.part._id
		const lookaheadSession = this._knownSessions.find(
			(s) => s.name === sessionName && s.lookaheadForPartId === partId
		)
		if (lookaheadSession) {
			lookaheadSession.partInstanceIds = [unpartialString(partInstanceId)]
			// console.log(`AB Session convert lookahead: ${JSON.stringify(lookaheadSession)}`)
			return preserveSession(lookaheadSession)
		}

		// Otherwise define a new session
		const sessionId = Random.id()
		const newSession: ABSessionInfoExt = {
			id: Random.id(),
			name: sessionName,
			infiniteInstanceId: unpartialString(infiniteId),
			partInstanceIds: [unpartialString(partInstanceId)],
			keep: true,
		}
		this._knownSessions.push(newSession)
		// console.log(`AB Session new session: ${JSON.stringify(newSession)}`)
		return sessionId
	}

	getTimelineObjectAbSessionId(tlObj: OnGenerateTimelineObjExt, sessionName: string): string | undefined {
		// Find an infinite
		const searchId = tlObj.infinitePieceInstanceId
		if (searchId) {
			const infiniteSession = this._knownSessions.find(
				(s) => s.infiniteInstanceId === searchId && s.name === sessionName
			)
			if (infiniteSession) {
				infiniteSession.keep = true
				return infiniteSession.id
			}
		}

		// Find an normal partInstance
		const partInstanceId = tlObj.partInstanceId
		if (partInstanceId) {
			const partInstanceSession = this._knownSessions.find(
				(s) => s.partInstanceIds?.includes(partInstanceId) && s.name === sessionName
			)
			if (partInstanceSession) {
				partInstanceSession.keep = true
				return partInstanceSession.id
			}
		}

		// If it is lookahead, then we run differently
		let partId = protectString<PartId>(unprotectString(partInstanceId))
		if (tlObj.isLookahead && partInstanceId && partId) {
			// If partId is a known partInstanceId, then convert it to a partId
			const partInstance = this.partInstances.find((p) => p._id === partInstanceId)
			if (partInstance) partId = partInstance.part._id

			const lookaheadSession = this._knownSessions.find((s) => s.lookaheadForPartId === partId)
			if (lookaheadSession) {
				lookaheadSession.keep = true
				if (partInstance) {
					lookaheadSession.partInstanceIds = [partInstanceId]
				}
				return lookaheadSession.id
			} else {
				const sessionId = Random.id()
				this._knownSessions.push({
					id: sessionId,
					name: sessionName,
					lookaheadForPartId: partId,
					partInstanceIds: partInstance ? [partInstanceId] : undefined,
					keep: true,
				})
				return sessionId
			}
		}

		// console.log(`failed for object: ${JSON.stringify(tlObj)}`)

		return undefined
	}
}

export class AsRunEventContext extends RundownContext implements IAsRunEventContext {
	public readonly asRunEvent: Readonly<IBlueprintAsRunLogEvent>

	constructor(rundown: Rundown, cache: ReadOnlyCacheForRundownPlaylist, asRunEvent: AsRunLogEvent) {
		super(
			rundown,
			cache,
			new NotesContext(rundown.name, `rundownId=${rundown._id},asRunEventId=${asRunEvent._id}`, false)
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

Meteor.startup(() => {
	if (Meteor.isServer) {
		Studios.find(
			{},
			{
				fields: {
					_rundownVersionHash: 1,
				},
			}
		).observeChanges({
			changed: (id: StudioId) => delete studioBlueprintConfigCache[unprotectString(id)],
		})
		ShowStyleBases.find(
			{},
			{
				fields: {
					_rundownVersionHash: 1,
				},
			}
		).observeChanges({
			changed: (id: ShowStyleBaseId) => delete showStyleBlueprintConfigCache[unprotectString(id)],
		})
		ShowStyleVariants.find(
			{},
			{
				fields: {
					_rundownVersionHash: 1,
					showStyleBaseId: 1,
					_id: 1,
				},
			}
		).observe({
			changed: (doc: ShowStyleVariant) =>
				objectPath.del(showStyleBlueprintConfigCache, `${doc.showStyleBaseId}.${doc._id}`),
		})
	}
})
