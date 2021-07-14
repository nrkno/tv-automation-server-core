import { IBlueprintExternalMessageQueueObj } from './message'
import { PackageInfo } from './packageInfo'
import {
	IBlueprintPart,
	IBlueprintPartInstance,
	IBlueprintPiece,
	IBlueprintPieceInstance,
	IBlueprintResolvedPieceInstance,
	IBlueprintRundownDB,
	IBlueprintMutatablePart,
	IBlueprintSegmentDB,
	IBlueprintPieceDB,
} from './rundown'
import { BlueprintMappings } from './studio'
import { OnGenerateTimelineObj } from './timeline'

/** Common */

export interface ICommonContext {
	/**
	 * Hash a string. Will return a unique string, to be used for all _id:s that are to be inserted in database
	 * @param originString A representation of the origin of the hash (for logging)
	 * @param originIsNotUnique If the originString is not guaranteed to be unique, set this to true
	 */
	getHashId: (originString: string, originIsNotUnique?: boolean) => string
	/** Un-hash, is return the string that created the hash */
	unhashId: (hash: string) => string

	/** Log a message to the sofie log with level 'debug' */
	logDebug: (message: string) => void
	/** Log a message to the sofie log with level 'info' */
	logInfo: (message: string) => void
	/** Log a message to the sofie log with level 'warn' */
	logWarning: (message: string) => void
	/** Log a message to the sofie log with level 'error' */
	logError: (message: string) => void
}

export function isCommonContext(obj: unknown): obj is ICommonContext {
	if (!obj || typeof obj !== 'object') {
		return false
	}

	const { getHashId, unhashId, logDebug, logInfo, logWarning, logError } = obj as any

	return (
		typeof getHashId === 'function' &&
		typeof unhashId === 'function' &&
		typeof logDebug === 'function' &&
		typeof logInfo === 'function' &&
		typeof logWarning === 'function' &&
		typeof logError === 'function'
	)
}

export interface IUserNotesContext extends ICommonContext {
	/** Display a notification to the user of an error */
	notifyUserError(message: string, params?: { [key: string]: any }): void
	/** Display a notification to the user of an warning */
	notifyUserWarning(message: string, params?: { [key: string]: any }): void
}

export function isUserNotesContext(obj: unknown): obj is IUserNotesContext {
	if (!isCommonContext(obj)) {
		return false
	}

	const { notifyUserError, notifyUserWarning } = obj as any

	return typeof notifyUserError === 'function' && typeof notifyUserWarning === 'function'
}

/** Studio */

export interface IStudioContext extends ICommonContext {
	/** The id of the studio */
	readonly studioId: string

	/** Returns the Studio blueprint config. If StudioBlueprintManifest.preprocessConfig is provided, a config preprocessed by that function is returned, otherwise it is returned unprocessed */
	getStudioConfig: () => unknown
	/** Returns a reference to a studio config value, that can later be resolved in Core */
	getStudioConfigRef(configKey: string): string

	/** Get the mappings for the studio */
	getStudioMappings: () => Readonly<BlueprintMappings>
}

export interface IPackageInfoContext {
	/**
	 * Get the PackageInfo items for an ExpectedPackage, if any have been reported by the package manager.
	 * Only info for packages with the `listenToPackageInfoUpdates` property set to true can be returned.
	 * The possible packageIds are scoped based on the ownership of the package.
	 * eg, baseline packages can be accessed when generating the baseline objects, piece/adlib packages can be access when regenerating the segment they are from
	 */
	getPackageInfo: (packageId: string) => Readonly<PackageInfo.Any[]>
}

export interface IStudioBaselineContext extends IStudioContext, IPackageInfoContext {}

export interface IStudioUserContext extends IUserNotesContext, IStudioContext {}

/** Show Style Variant */

export interface IShowStyleContext extends ICommonContext, IStudioContext {
	/** Returns a ShowStyle blueprint config. If ShowStyleBlueprintManifest.preprocessConfig is provided, a config preprocessed by that function is returned, otherwise it is returned unprocessed */
	getShowStyleConfig: () => unknown
	/** Returns a reference to a showStyle config value, that can later be resolved in Core */
	getShowStyleConfigRef(configKey: string): string
}

export interface IShowStyleUserContext extends IUserNotesContext, IShowStyleContext, IPackageInfoContext {}

/** Rundown */

export interface IRundownContext extends IShowStyleContext {
	readonly rundownId: string
	readonly rundown: Readonly<IBlueprintRundownDB>
}

export interface IRundownUserContext extends IUserNotesContext, IRundownContext {}

export interface ISegmentUserContext extends IUserNotesContext, IRundownContext, IPackageInfoContext {
	/** Display a notification to the user of an error */
	notifyUserError: (message: string, params?: { [key: string]: any }, partExternalId?: string) => void
	/** Display a notification to the user of an warning */
	notifyUserWarning: (message: string, params?: { [key: string]: any }, partExternalId?: string) => void
}

/** Actions */
export interface IActionExecutionContext extends IShowStyleUserContext, IEventContext {
	/** Data fetching */
	// getIngestRundown(): IngestRundown // TODO - for which part?
	/** Get a PartInstance which can be modified */
	getPartInstance(part: 'current' | 'next'): IBlueprintPartInstance | undefined
	/** Get the PieceInstances for a modifiable PartInstance */
	getPieceInstances(part: 'current' | 'next'): IBlueprintPieceInstance[]
	/** Get the resolved PieceInstances for a modifiable PartInstance */
	getResolvedPieceInstances(part: 'current' | 'next'): IBlueprintResolvedPieceInstance[]
	/** Get the last active piece on given layer */
	findLastPieceOnLayer(
		sourceLayerId: string | string[],
		options?: {
			excludeCurrentPart?: boolean
			originalOnly?: boolean
			pieceMetaDataFilter?: any // Mongo query against properties inside of piece.metaData
		}
	): IBlueprintPieceInstance | undefined
	/** Get the previous scripted piece on a given layer, looking backwards from the current part. */
	findLastScriptedPieceOnLayer(
		sourceLayerId: string | string[],
		options?: {
			excludeCurrentPart?: boolean
			pieceMetaDataFilter?: any
		}
	): IBlueprintPiece | undefined
	/** Gets the PartInstance for a PieceInstance retrieved from findLastPieceOnLayer. This primarily allows for accessing metadata of the PartInstance */
	getPartInstanceForPreviousPiece(piece: IBlueprintPieceInstance): IBlueprintPartInstance
	/** Gets the Part for a Piece retrieved from findLastScriptedPieceOnLayer. This primarily allows for accessing metadata of the Part */
	getPartForPreviousPiece(piece: IBlueprintPieceDB): IBlueprintPart | undefined
	/** Fetch the showstyle config for the specified part */
	// getNextShowStyleConfig(): Readonly<{ [key: string]: ConfigItemValue }>

	/** Creative actions */
	/** Insert a pieceInstance. Returns id of new PieceInstance. Any timelineObjects will have their ids changed, so are not safe to reference from another piece */
	insertPiece(part: 'current' | 'next', piece: IBlueprintPiece): IBlueprintPieceInstance
	/** Update a piecesInstance */
	updatePieceInstance(pieceInstanceId: string, piece: Partial<IBlueprintPiece>): IBlueprintPieceInstance
	/** Insert a queued part to follow the current part */
	queuePart(part: IBlueprintPart, pieces: IBlueprintPiece[]): IBlueprintPartInstance
	/** Update a partInstance */
	updatePartInstance(part: 'current' | 'next', props: Partial<IBlueprintMutatablePart>): IBlueprintPartInstance

	/** Destructive actions */
	/** Stop any piecesInstances on the specified sourceLayers. Returns ids of piecesInstances that were affected */
	stopPiecesOnLayers(sourceLayerIds: string[], timeOffset?: number): string[]
	/** Stop piecesInstances by id. Returns ids of piecesInstances that were removed */
	stopPieceInstances(pieceInstanceIds: string[], timeOffset?: number): string[]
	/** Remove piecesInstances by id. Returns ids of piecesInstances that were removed. Note: For now we only allow removing from the next, but this might change to include current if there is justification */
	removePieceInstances(part: 'next', pieceInstanceIds: string[]): string[]

	/** Move the next part through the rundown. Can move by either a number of parts, or segments in either direction. */
	moveNextPart(partDelta: number, segmentDelta: number): void
	/** Set flag to perform take after executing the current action. Returns state of the flag after each call. */
	takeAfterExecuteAction(take: boolean): boolean

	/** Misc actions */
	// updateAction(newManifest: Pick<IBlueprintAdLibActionManifest, 'description' | 'payload'>): void // only updates itself. to allow for the next one to do something different
	// executePeripheralDeviceAction(deviceId: string, functionName: string, args: any[]): Promise<any>
	// openUIDialogue(message: string) // ?????
}

/** Actions */
export interface ISyncIngestUpdateToPartInstanceContext extends IRundownUserContext {
	/** Sync a pieceInstance. Inserts the pieceInstance if new, updates if existing. Optionally pass in a mutated Piece, to change the content of the instance */
	syncPieceInstance(
		pieceInstanceId: string,
		mutatedPiece?: Omit<IBlueprintPiece, 'lifespan'>
	): IBlueprintPieceInstance

	/** Insert a pieceInstance. Returns id of new PieceInstance. Any timelineObjects will have their ids changed, so are not safe to reference from another piece */
	insertPieceInstance(piece: IBlueprintPiece): IBlueprintPieceInstance
	/** Update a piecesInstance */
	updatePieceInstance(pieceInstanceId: string, piece: Partial<IBlueprintPiece>): IBlueprintPieceInstance
	/** Remove a pieceInstance */
	removePieceInstances(...pieceInstanceIds: string[]): string[]

	// Upcoming interface:
	// /** Insert a AdlibInstance. Returns id of new AdlibInstance. Any timelineObjects will have their ids changed, so are not safe to reference from another piece */
	// insertAdlibInstance(adlibPiece: IBlueprintAdLibPiece): IBlueprintAdlibPieceInstance
	// /** Update a AdlibInstance */
	// updateAdlibInstance(adlibInstanceId: string, adlibPiece: Partial<OmitId<IBlueprintAdLibPiece>>): IBlueprintAdlibPieceInstance
	// /** Remove a AdlibInstance */
	// removeAdlibInstances(...adlibInstanceId: string[]): string[]

	// Upcoming interface:
	// /** Insert a ActionInstance. Returns id of new ActionInstance. Any timelineObjects will have their ids changed, so are not safe to reference from another piece */
	// insertActionInstance(action: IBlueprintAdlibAction): IBlueprintAdlibActionInstance
	// /** Update a ActionInstance */
	// updateActionInstance(actionInstanceId: string, action: Partial<OmitId<IBlueprintAdlibAction>>): IBlueprintAdlibActionInstance
	// /** Remove a ActionInstance */
	// removeActionInstances(...actionInstanceIds: string[]): string[]

	/** Update a partInstance */
	updatePartInstance(props: Partial<IBlueprintMutatablePart>): IBlueprintPartInstance
}

/** Events */

export interface IEventContext {
	getCurrentTime(): number
}

export interface ITimelineEventContext extends IEventContext, IRundownContext {
	readonly currentPartInstance: Readonly<IBlueprintPartInstance> | undefined
	readonly nextPartInstance: Readonly<IBlueprintPartInstance> | undefined

	/**
	 * Get the full session id for an ab playback session.
	 * Note: sessionName should be unique within the segment unless pieces want to share a session
	 */
	getPieceABSessionId(piece: IBlueprintPieceInstance, sessionName: string): string
	/**
	 * Get the full session id for a timelineobject that belongs to an ab playback session
	 * sessionName should also be used in calls to getPieceABSessionId for the owning piece
	 */
	getTimelineObjectAbSessionId(obj: OnGenerateTimelineObj, sessionName: string): string | undefined
}

export interface IPartEventContext extends IEventContext, IRundownContext {
	readonly part: Readonly<IBlueprintPartInstance>
}

export interface IRundownDataChangedEventContext extends IEventContext, IRundownContext {
	formatDateAsTimecode(time: number): string
	formatDurationAsTimecode(time: number): string

	/** Get all unsent and queued messages in the rundown */
	getAllUnsentQueuedMessages(): Readonly<IBlueprintExternalMessageQueueObj[]>
}

export interface IRundownTimingEventContext extends IRundownDataChangedEventContext {
	readonly previousPart: Readonly<IBlueprintPartInstance> | undefined
	readonly currentPart: Readonly<IBlueprintPartInstance>
	readonly nextPart: Readonly<IBlueprintPartInstance> | undefined

	/**
	 * Returns the first PartInstance in the Rundown within the current playlist activation.
	 * This allows for a start time for the Rundown to be determined
	 */
	getFirstPartInstanceInRundown(): Readonly<IBlueprintPartInstance>

	/**
	 * Returns the partInstances in the Segment, limited to the playthrough of the segment that refPartInstance is part of
	 * @param refPartInstance PartInstance to use as the basis of the search
	 */
	getPartInstancesInSegmentPlayoutId(
		refPartInstance: Readonly<IBlueprintPartInstance>
	): Readonly<IBlueprintPartInstance[]>

	/**
	 * Returns pieces in a partInstance
	 * @param id Id of partInstance to fetch items in
	 */
	getPieceInstances(...partInstanceIds: string[]): Readonly<IBlueprintPieceInstance[]>

	/**
	 * Returns a segment
	 * @param id Id of segment to fetch
	 */
	getSegment(id: string): Readonly<IBlueprintSegmentDB> | undefined
}
