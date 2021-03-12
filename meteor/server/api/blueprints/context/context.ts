import {
	getHash,
	formatDateAsTimecode,
	formatDurationAsTimecode,
	unprotectString,
	unprotectObject,
	unprotectObjectArray,
	protectString,
	getCurrentTime,
	clone,
	omit,
	unpartialString,
	protectStringArray,
} from '../../../../lib/lib'
import { PartId } from '../../../../lib/collections/Parts'
import { check, Match } from '../../../../lib/check'
import { logger } from '../../../../lib/logging'
import {
	ICommonContext,
	IUserNotesContext,
	IStudioContext,
	IStudioUserContext,
	BlueprintMappings,
	IBlueprintSegmentDB,
	IBlueprintPartInstance,
	IBlueprintPieceInstance,
	IBlueprintPartDB,
	IBlueprintRundownDB,
	IBlueprintExternalMessageQueueObj,
	IShowStyleContext,
	IRundownContext,
	IEventContext,
	ISegmentUserContext,
	IPartEventContext,
	ITimelineEventContext,
	IAsRunRundownEventContext,
	IAsRunPartEventContext,
} from '@sofie-automation/blueprints-integration'
import { Studio, StudioId } from '../../../../lib/collections/Studios'
import {
	ConfigRef,
	getStudioBlueprintConfig,
	resetStudioBlueprintConfig,
	getShowStyleBlueprintConfig,
	resetShowStyleBlueprintConfig,
} from '../config'
import { Rundown } from '../../../../lib/collections/Rundowns'
import { ShowStyleCompound } from '../../../../lib/collections/ShowStyleVariants'
import { NoteType, INoteBase } from '../../../../lib/api/notes'
import { RundownPlaylistId, ABSessionInfo, RundownPlaylist } from '../../../../lib/collections/RundownPlaylists'
import {
	PieceInstances,
	unprotectPieceInstance,
	protectPieceInstance,
	unprotectPieceInstanceArray,
} from '../../../../lib/collections/PieceInstances'
import { unprotectPartInstance, PartInstance, PartInstances } from '../../../../lib/collections/PartInstances'
import { ExternalMessageQueue } from '../../../../lib/collections/ExternalMessageQueue'
import { ReadonlyDeep } from 'type-fest'
import { Random } from 'meteor/random'
import { OnGenerateTimelineObjExt } from '../../../../lib/collections/Timeline'
import _ from 'underscore'
import { Segments } from '../../../../lib/collections/Segments'
import { Meteor } from 'meteor/meteor'

export interface ContextInfo {
	/** Short name for the context (eg the blueprint function being called) */
	name: string
	/** Full identifier info for the context. Should be able to identify the rundown/studio/blueprint etc being executed */
	identifier: string
}
export interface UserContextInfo extends ContextInfo {
	tempSendUserNotesIntoBlackHole?: boolean // TODO-CONTEXT remove this
}

/** Common */

export class CommonContext implements ICommonContext {
	private readonly _contextIdentifier: string
	private readonly _contextName: string

	private hashI = 0
	private hashed: { [hash: string]: string } = {}

	constructor(info: ContextInfo) {
		this._contextIdentifier = info.identifier
		this._contextName = info.name
	}
	getHashId(str: string, isNotUnique?: boolean) {
		if (!str) str = 'hash' + this.hashI++

		if (isNotUnique) {
			str = str + '_' + this.hashI++
		}

		const id = getHash(this._contextIdentifier + '_' + str.toString())
		this.hashed[id] = str
		return id
	}
	unhashId(hash: string): string {
		return this.hashed[hash] || hash
	}

	logDebug(message: string): void {
		logger.debug(`"${this._contextName}": "${message}"\n(${this._contextIdentifier})`)
	}
	logInfo(message: string): void {
		logger.info(`"${this._contextName}": "${message}"\n(${this._contextIdentifier})`)
	}
	logWarning(message: string): void {
		logger.warn(`"${this._contextName}": "${message}"\n(${this._contextIdentifier})`)
	}
	logError(message: string): void {
		logger.error(`"${this._contextName}": "${message}"\n(${this._contextIdentifier})`)
	}
}

/** Studio */

export class StudioContext extends CommonContext implements IStudioContext {
	public readonly studio: ReadonlyDeep<Studio>
	constructor(contextInfo: ContextInfo, studio: ReadonlyDeep<Studio>) {
		super(contextInfo)
		this.studio = studio
	}

	public get studioId(): StudioId {
		return this.studio._id
	}

	getStudioConfig(): unknown {
		return getStudioBlueprintConfig(this.studio)
	}
	protected wipeCache() {
		resetStudioBlueprintConfig(this.studio)
	}
	getStudioConfigRef(configKey: string): string {
		return ConfigRef.getStudioConfigRef(this.studio._id, configKey)
	}

	getStudioMappings(): Readonly<BlueprintMappings> {
		return this.studio.mappings
	}
}

export class StudioUserContext extends StudioContext implements IStudioUserContext {
	public readonly notes: INoteBase[] = []
	private readonly tempSendNotesIntoBlackHole: boolean

	constructor(contextInfo: UserContextInfo, studio: ReadonlyDeep<Studio>) {
		super(contextInfo, studio)
		this.tempSendNotesIntoBlackHole = contextInfo.tempSendUserNotesIntoBlackHole ?? false
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
}

/** Show Style Variant */
export class ShowStyleContext extends StudioContext implements IShowStyleContext {
	constructor(
		contextInfo: ContextInfo,
		studio: ReadonlyDeep<Studio>,
		public readonly showStyleCompound: ReadonlyDeep<ShowStyleCompound>
	) {
		super(contextInfo, studio)
	}

	getShowStyleConfig(): unknown {
		return getShowStyleBlueprintConfig(this.showStyleCompound)
	}
	wipeCache() {
		super.wipeCache()
		resetShowStyleBlueprintConfig(this.showStyleCompound)
	}
	getShowStyleConfigRef(configKey: string): string {
		return ConfigRef.getShowStyleConfigRef(this.showStyleCompound.showStyleVariantId, configKey)
	}
}

export class ShowStyleUserContext extends ShowStyleContext implements IUserNotesContext {
	public readonly notes: INoteBase[] = []
	private readonly tempSendNotesIntoBlackHole: boolean

	constructor(
		contextInfo: UserContextInfo,
		studio: ReadonlyDeep<Studio>,
		showStyleCompound: ReadonlyDeep<ShowStyleCompound>
	) {
		super(contextInfo, studio, showStyleCompound)
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
}

/** Rundown */

export class RundownContext extends ShowStyleContext implements IRundownContext {
	readonly rundownId: string
	readonly rundown: Readonly<IBlueprintRundownDB>
	readonly _rundown: ReadonlyDeep<Rundown>
	readonly playlistId: RundownPlaylistId

	constructor(
		contextInfo: ContextInfo,
		studio: ReadonlyDeep<Studio>,
		showStyleCompound: ReadonlyDeep<ShowStyleCompound>,
		rundown: ReadonlyDeep<Rundown>
	) {
		super(contextInfo, studio, showStyleCompound)

		this.rundownId = unprotectString(rundown._id)
		this.rundown = unprotectObject(rundown)
		this._rundown = rundown
		this.playlistId = rundown.playlistId
	}
}

export class RundownEventContext extends RundownContext implements IEventContext {
	constructor(
		studio: ReadonlyDeep<Studio>,
		showStyleCompound: ReadonlyDeep<ShowStyleCompound>,
		rundown: ReadonlyDeep<Rundown>
	) {
		super(
			{
				name: rundown.name,
				identifier: `rundownId=${rundown._id},blueprintId=${showStyleCompound.blueprintId}`,
			},
			studio,
			showStyleCompound,
			rundown
		)
	}

	getCurrentTime(): number {
		return getCurrentTime()
	}
}

export interface RawPartNote extends INoteBase {
	partExternalId: string | undefined
}

export class SegmentUserContext extends RundownContext implements ISegmentUserContext {
	public readonly notes: RawPartNote[] = []

	constructor(
		contextInfo: ContextInfo,
		studio: ReadonlyDeep<Studio>,
		showStyleCompound: ReadonlyDeep<ShowStyleCompound>,
		rundown: ReadonlyDeep<Rundown>
	) {
		super(contextInfo, studio, showStyleCompound, rundown)
	}

	notifyUserError(message: string, params?: { [key: string]: any }, partExternalId?: string): void {
		this.notes.push({
			type: NoteType.ERROR,
			message: {
				key: message,
				args: params,
			},
			partExternalId: partExternalId,
		})
	}
	notifyUserWarning(message: string, params?: { [key: string]: any }, partExternalId?: string): void {
		this.notes.push({
			type: NoteType.WARNING,
			message: {
				key: message,
				args: params,
			},
			partExternalId: partExternalId,
		})
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

	constructor(
		eventName: string,
		studio: ReadonlyDeep<Studio>,
		showStyleCompound: ReadonlyDeep<ShowStyleCompound>,
		rundown: ReadonlyDeep<Rundown>,
		partInstance: PartInstance
	) {
		super(
			{
				name: `Event: ${eventName}`,
				identifier: `rundownId=${rundown._id},blueprintId=${showStyleCompound.blueprintId}`,
			},
			studio,
			showStyleCompound,
			rundown
		)

		this.part = unprotectPartInstance(partInstance)
	}

	getCurrentTime(): number {
		return getCurrentTime()
	}
}

interface ABSessionInfoExt extends ABSessionInfo {
	/** Whether to store this session on the playlist (ie, whether it is still valid) */
	keep?: boolean
}

export class TimelineEventContext extends RundownContext implements ITimelineEventContext {
	private readonly partInstances: ReadonlyDeep<Array<PartInstance>>
	readonly currentPartInstance: Readonly<IBlueprintPartInstance> | undefined
	readonly nextPartInstance: Readonly<IBlueprintPartInstance> | undefined

	private readonly _knownSessions: ABSessionInfoExt[]

	public get knownSessions() {
		return this._knownSessions.filter((s) => s.keep).map((s) => omit(s, 'keep'))
	}

	constructor(
		studio: ReadonlyDeep<Studio>,
		showStyleCompound: ReadonlyDeep<ShowStyleCompound>,
		playlist: ReadonlyDeep<RundownPlaylist>,
		rundown: ReadonlyDeep<Rundown>,
		previousPartInstance: PartInstance | undefined,
		currentPartInstance: PartInstance | undefined,
		nextPartInstance: PartInstance | undefined
	) {
		super(
			{
				name: rundown.name,
				identifier: `rundownId=${rundown._id},previousPartInstance=${previousPartInstance?._id},currentPartInstance=${currentPartInstance?._id},nextPartInstance=${nextPartInstance?._id}`,
			},
			studio,
			showStyleCompound,
			rundown
		)

		this.currentPartInstance = currentPartInstance ? unprotectPartInstance(currentPartInstance) : undefined
		this.nextPartInstance = nextPartInstance ? unprotectPartInstance(nextPartInstance) : undefined

		this.partInstances = _.compact([previousPartInstance, currentPartInstance, nextPartInstance])

		this._knownSessions = clone<ABSessionInfo[]>(playlist.trackedAbSessions ?? [])
	}

	getCurrentTime(): number {
		return getCurrentTime()
	}

	/** Internal, for overriding in tests */
	getNewSessionId(): string {
		return Random.id()
	}

	getPieceABSessionId(pieceInstance0: IBlueprintPieceInstance, sessionName: string): string {
		const pieceInstance = protectPieceInstance(pieceInstance0)
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
				return preserveSession(infiniteSession)
			}
		}

		// We only want to consider sessions already tagged to this partInstance
		const existingSession = this._knownSessions.find(
			(s) => s.partInstanceIds?.includes(unpartialString(partInstanceId)) && s.name === sessionName
		)
		if (existingSession) {
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
			)
			if (continuedSession) {
				continuedSession.partInstanceIds = [
					...(continuedSession.partInstanceIds || []),
					unpartialString(partInstanceId),
				]
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
			return preserveSession(lookaheadSession)
		}

		// Otherwise define a new session
		const sessionId = this.getNewSessionId()
		const newSession: ABSessionInfoExt = {
			id: sessionId,
			name: sessionName,
			infiniteInstanceId: unpartialString(infiniteId),
			partInstanceIds: _.compact([!infiniteId ? unpartialString(partInstanceId) : undefined]),
			keep: true,
		}
		this._knownSessions.push(newSession)
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
				const sessionId = this.getNewSessionId()
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

		return undefined
	}
}

export class AsRunRundownEventContext extends RundownContext implements IAsRunRundownEventContext {
	constructor(
		contextInfo: ContextInfo,
		studio: ReadonlyDeep<Studio>,
		showStyleCompound: ReadonlyDeep<ShowStyleCompound>,
		rundown: ReadonlyDeep<Rundown>
	) {
		super(contextInfo, studio, showStyleCompound, rundown)
	}

	getCurrentTime(): number {
		return getCurrentTime()
	}

	/** Get all unsent and queued messages in the rundown */
	getAllUnsentQueuedMessages(): Readonly<IBlueprintExternalMessageQueueObj[]> {
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
	// /** Get all segments in this rundown */
	// getSegments(): Array<IBlueprintSegmentDB> {
	// 	return unprotectObjectArray(this._rundown.getSegments())
	// }
	// /**
	//  * Returns a segment
	//  * @param segmentId Id of segment to fetch. If is omitted, return the segment related to this AsRunEvent
	//  */
	// getSegment(segmentId?: string): IBlueprintSegmentDB | undefined {
	// 	segmentId = segmentId || this.asRunEvent.segmentId
	// 	check(segmentId, String)
	// 	if (segmentId) {
	// 		return unprotectObject(
	// 			this._rundown.getSegments({
	// 				_id: protectString(segmentId),
	// 			})[0]
	// 		)
	// 	}
	// }
	// /** Get all parts in this rundown */
	// getParts(): Array<IBlueprintPartDB> {
	// 	return unprotectObjectArray(this._rundown.getParts())
	// }
	// /** Get the part related to this AsRunEvent */
	// getPartInstance(partInstanceId?: string): IBlueprintPartInstance | undefined {
	// 	partInstanceId = partInstanceId || this.asRunEvent.partInstanceId
	// 	check(partInstanceId, String)
	// 	if (partInstanceId) {
	// 		return unprotectPartInstance(
	// 			PartInstances.findOne({
	// 				playlistActivationId: this._asRunEvent.playlistActivationId,
	// 				rundownId: this._rundown._id,
	// 				_id: protectString(partInstanceId),
	// 			})
	// 		)
	// 	}
	// }

	// /**
	//  * Returns a piece.
	//  * @param id Id of piece to fetch. If omitted, return the piece related to this AsRunEvent
	//  */
	// getPieceInstance(pieceInstanceId?: string): IBlueprintPieceInstance | undefined {
	// 	check(pieceInstanceId, Match.Optional(String))
	// 	pieceInstanceId = pieceInstanceId || this.asRunEvent.pieceInstanceId
	// 	if (pieceInstanceId) {
	// 		return unprotectPieceInstance(
	// 			PieceInstances.findOne({
	// 				playlistActivationId: this._asRunEvent.playlistActivationId,
	// 				rundownId: this._rundown._id,
	// 				_id: protectString(pieceInstanceId),
	// 			})
	// 		)
	// 	}
	// }
	// /**
	//  * Returns pieces in a part
	//  * @param id Id of part to fetch pieces in
	//  */
	// getPieceInstances(partInstanceId: string): Array<IBlueprintPieceInstance> {
	// 	check(partInstanceId, String)
	// 	if (partInstanceId) {
	// 		return unprotectObjectArray(
	// 			PieceInstances.find({
	// 				playlistActivationId: this._asRunEvent.playlistActivationId,
	// 				rundownId: this._rundown._id,
	// 				partInstanceId: protectString(partInstanceId),
	// 			}).fetch()
	// 		) as any // pieceinstande.piece is the issue
	// 	}
	// 	return []
	// }

	formatDateAsTimecode(time: number): string {
		check(time, Number)
		return formatDateAsTimecode(new Date(time))
	}
	formatDurationAsTimecode(time: number): string {
		check(time, Number)
		return formatDurationAsTimecode(time)
	}
}

export class AsRunPartEventContext extends AsRunRundownEventContext implements IAsRunPartEventContext {
	readonly previousPart: Readonly<IBlueprintPartInstance<unknown>> | undefined
	private readonly _part: PartInstance
	readonly nextPart: Readonly<IBlueprintPartInstance<unknown>> | undefined

	public get part(): Readonly<IBlueprintPartInstance<unknown>> {
		return unprotectPartInstance(this._part)
	}

	constructor(
		contextInfo: ContextInfo,
		studio: ReadonlyDeep<Studio>,
		showStyleCompound: ReadonlyDeep<ShowStyleCompound>,
		rundown: ReadonlyDeep<Rundown>,
		previousPartInstance: PartInstance | undefined,
		partInstance: PartInstance,
		nextPartInstance: PartInstance | undefined
	) {
		super(contextInfo, studio, showStyleCompound, rundown)

		this.previousPart = unprotectPartInstance(previousPartInstance)
		this._part = partInstance
		this.nextPart = unprotectPartInstance(nextPartInstance)
	}

	getFirstPartInstanceInRundown(): Readonly<IBlueprintPartInstance<unknown>> {
		const partInstance = PartInstances.findOne(
			{
				rundownId: this._rundown._id,
				playlistActivationId: this._part.playlistActivationId,
			},
			{
				sort: {
					// TODO - verify sort
					takeCount: 1,
				},
			}
		)

		// If this doesn't find anything, then where did our reference PartInstance come from?
		if (!partInstance)
			throw new Meteor.Error(
				500,
				`No PartInstances found for Rundown "${this._rundown._id}" (PlaylistActivationId "${this._part.playlistActivationId}")`
			)

		return unprotectPartInstance(partInstance)
	}

	getPartInstancesInSegmentPlayoutId(
		refPartInstance: Readonly<IBlueprintPartInstance<unknown>>
	): readonly IBlueprintPartInstance<unknown>[] {
		throw new Error('Method not implemented.')
	}

	getPieceInstances(...partInstanceIds: string[]): readonly IBlueprintPieceInstance<unknown>[] {
		if (partInstanceIds.length === 0) return []

		const pieceInstances = PieceInstances.find({
			rundownId: this._rundown._id,
			playlistActivationId: this._part.playlistActivationId,
			partInstanceId: { $in: protectStringArray(partInstanceIds) },
		}).fetch()

		return unprotectPieceInstanceArray(pieceInstances)
	}

	getSegment(segmentId: string): Readonly<IBlueprintSegmentDB<unknown>> | undefined {
		check(segmentId, String)
		return unprotectObject(
			Segments.findOne({
				_id: protectString(segmentId),
				rundownId: this._rundown._id,
			})
		)
	}
}
