import { TSRTimelineObjBase } from 'timeline-state-resolver-types'

import { ActionUserData, IBlueprintActionManifest } from './action'
import { ConfigManifestEntry } from './config'
import {
	IActionExecutionContext,
	ISyncIngestUpdateToPartInstanceContext,
	IPartEventContext,
	IRundownContext,
	IStudioUserContext,
	ISegmentUserContext,
	IShowStyleUserContext,
	ICommonContext,
	ITimelineEventContext,
	IRundownDataChangedEventContext,
	IRundownTimingEventContext,
	IStudioBaselineContext,
} from './context'
import { IngestAdlib, ExtendedIngestRundown, IngestSegment } from './ingest'
import { IBlueprintExternalMessageQueueObj } from './message'
import { MigrationStep } from './migrations'
import {
	IBlueprintAdLibPiece,
	IBlueprintPart,
	IBlueprintPiece,
	IBlueprintResolvedPieceInstance,
	IBlueprintRundown,
	IBlueprintRundownPlaylistInfo,
	IBlueprintSegment,
	IBlueprintRundownDB,
	IBlueprintPieceInstance,
	IBlueprintPartInstance,
	IBlueprintAdLibPieceDB,
	IBlueprintPartDB,
	ExpectedPlayoutItemGeneric,
} from './rundown'
import { IBlueprintShowStyleBase, IBlueprintShowStyleVariant } from './showStyle'
import { OnGenerateTimelineObj } from './timeline'
import { IBlueprintConfig } from './common'
import { ExpectedPackage } from './package'

export enum BlueprintManifestType {
	SYSTEM = 'system',
	STUDIO = 'studio',
	SHOWSTYLE = 'showstyle',
}

export interface BlueprintManifestSet {
	blueprints: {
		[id: string]: string
	}
	assets: {
		[id: string]: string
	}
}
export type SomeBlueprintManifest = SystemBlueprintManifest | StudioBlueprintManifest | ShowStyleBlueprintManifest

export interface BlueprintManifestBase {
	blueprintType: BlueprintManifestType
	// Manifest properties, to be used by Core

	/** Unique id of the blueprint. This is used by core to check if blueprints are the same blueprint, but differing versions */
	blueprintId?: string
	/** Version of the blueprint */
	blueprintVersion: string
	/** Version of the blueprint-integration that the blueprint depend on */
	integrationVersion: string
	/** Version of the TSR-types that the blueprint depend on */
	TSRVersion: string
}

export interface SystemBlueprintManifest extends BlueprintManifestBase {
	blueprintType: BlueprintManifestType.SYSTEM
}

export interface StudioBlueprintManifest extends BlueprintManifestBase {
	blueprintType: BlueprintManifestType.STUDIO

	/** A list of config items this blueprint expects to be available on the Studio */
	studioConfigManifest: ConfigManifestEntry[]
	/** A list of Migration steps related to a Studio */
	studioMigrations: MigrationStep[]

	/** Translations connected to the studio (as stringified JSON) */
	translations?: string

	/** Returns the items used to build the baseline (default state) of a studio, this is the baseline used when there's no active rundown */
	getBaseline: (context: IStudioBaselineContext) => BlueprintResultStudioBaseline

	/** Returns the id of the show style to use for a rundown, return null to ignore that rundown */
	getShowStyleId: (
		context: IStudioUserContext,
		showStyles: IBlueprintShowStyleBase[],
		ingestRundown: ExtendedIngestRundown
	) => string | null

	/** Returns information about the playlist this rundown is a part of, return null to not make it a part of a playlist */
	getRundownPlaylistInfo?: (
		context: IStudioUserContext,
		rundowns: IBlueprintRundownDB[]
	) => BlueprintResultRundownPlaylist | null

	/** Preprocess config before storing it by core to later be returned by context's getStudioConfig. If not provided, getStudioConfig will return unprocessed blueprint config */
	preprocessConfig?: (context: ICommonContext, config: IBlueprintConfig) => unknown
}

export interface ShowStyleBlueprintManifest extends BlueprintManifestBase {
	blueprintType: BlueprintManifestType.SHOWSTYLE

	/** A list of config items this blueprint expects to be available on the ShowStyle */
	showStyleConfigManifest: ConfigManifestEntry[]
	/** A list of Migration steps related to a ShowStyle */
	showStyleMigrations: MigrationStep[]

	/** Translations connected to the studio (as stringified JSON) */
	translations?: string

	// --------------------------------------------------------------
	// Callbacks called by Core:

	/** Returns the id of the show style variant to use for a rundown, return null to ignore that rundown */
	getShowStyleVariantId: (
		context: IStudioUserContext,
		showStyleVariants: IBlueprintShowStyleVariant[],
		ingestRundown: ExtendedIngestRundown
	) => string | null

	/** Generate rundown from ingest data. return null to ignore that rundown */
	getRundown: (context: IShowStyleUserContext, ingestRundown: ExtendedIngestRundown) => BlueprintResultRundown

	/** Generate segment from ingest data */
	getSegment: (context: ISegmentUserContext, ingestSegment: IngestSegment) => BlueprintResultSegment

	/**
	 * Allows the blueprint to custom-modify the PartInstance, on ingest data update (this is run after getSegment() )
	 * Warning: This is currently an experimental api, and is likely to break in the next release
	 */
	syncIngestUpdateToPartInstance?: (
		context: ISyncIngestUpdateToPartInstanceContext,
		existingPartInstance: BlueprintSyncIngestPartInstance,
		newData: BlueprintSyncIngestNewData,
		playoutStatus: 'current' | 'next'
	) => void

	/** Execute an action defined by an IBlueprintActionManifest */
	executeAction?: (
		context: IActionExecutionContext,
		actionId: string,
		userData: ActionUserData,
		triggerMode?: string
	) => void // Promise<void> | void

	/** Generate adlib piece from ingest data */
	getAdlibItem?: (
		context: IShowStyleUserContext,
		ingestItem: IngestAdlib
	) => IBlueprintAdLibPiece | IBlueprintActionManifest | null

	/** Preprocess config before storing it by core to later be returned by context's getShowStyleConfig. If not provided, getShowStyleConfig will return unprocessed blueprint config */
	preprocessConfig?: (context: ICommonContext, config: IBlueprintConfig) => unknown

	// Events

	onRundownActivate?: (context: IRundownContext) => Promise<void>
	onRundownFirstTake?: (context: IPartEventContext) => Promise<void>
	onRundownDeActivate?: (context: IRundownContext) => Promise<void>

	/** Called after a Take action */
	onPreTake?: (context: IPartEventContext) => Promise<void>
	onPostTake?: (context: IPartEventContext) => Promise<void>

	/** Called after the timeline has been generated, used to manipulate the timeline */
	onTimelineGenerate?: (
		context: ITimelineEventContext,
		timeline: OnGenerateTimelineObj[],
		previousPersistentState: TimelinePersistentState | undefined,
		previousPartEndState: PartEndState | undefined,
		resolvedPieces: IBlueprintResolvedPieceInstance[]
	) => Promise<BlueprintResultTimeline>

	/** Called just before taking the next part. This generates some persisted data used by onTimelineGenerate to modify the timeline based on the previous part (eg, persist audio levels) */
	getEndStateForPart?: (
		context: IRundownContext,
		previousPersistentState: TimelinePersistentState | undefined,
		partInstance: IBlueprintPartInstance,
		resolvedPieces: IBlueprintResolvedPieceInstance[],
		time: number
	) => PartEndState

	/** Called when the Rundown data changes, to be able to update any queued external messages */
	onRundownDataChangedEvent?: (
		context: IRundownDataChangedEventContext
	) => Promise<IBlueprintExternalMessageQueueObj[]>

	/**
	 * Called when the timing for a PartInstance or its content changes.
	 * This will often be batched (via a short debounce), but is called for each part when either the part or a piece timing changes.
	 */
	onRundownTimingEvent?: (context: IRundownTimingEventContext) => Promise<IBlueprintExternalMessageQueueObj[]>
}

export type PartEndState = unknown
export type TimelinePersistentState = unknown

export interface BlueprintResultTimeline {
	timeline: OnGenerateTimelineObj[]
	persistentState: TimelinePersistentState
}
export interface BlueprintResultBaseline {
	timelineObjects: TSRTimelineObjBase[]
	/** @deprecated */
	expectedPlayoutItems?: ExpectedPlayoutItemGeneric[]
	expectedPackages?: ExpectedPackage.Any[]
}
export type BlueprintResultStudioBaseline = BlueprintResultBaseline
export interface BlueprintResultRundown {
	rundown: IBlueprintRundown
	globalAdLibPieces: IBlueprintAdLibPiece[]
	globalActions?: IBlueprintActionManifest[]
	baseline: BlueprintResultBaseline
}
export interface BlueprintResultSegment {
	segment: IBlueprintSegment
	parts: BlueprintResultPart[]
}

export interface BlueprintResultPart {
	part: IBlueprintPart
	pieces: IBlueprintPiece[]
	adLibPieces: IBlueprintAdLibPiece[]
	actions?: IBlueprintActionManifest[]
}

export interface BlueprintSyncIngestNewData {
	// source: BlueprintSyncIngestDataSource
	/** The new part */
	part: IBlueprintPartDB
	/** A list of pieces (including infinites) that would be present in a fresh copy of this partInstance */
	pieceInstances: IBlueprintPieceInstance[]
	/** The adlib pieces belonging to this part */
	adLibPieces: IBlueprintAdLibPieceDB[]
	/** The adlib actions belonging to this part */
	actions: IBlueprintActionManifest[]
	/** A list of adlibs that have pieceInstances in the partInstance in question */
	referencedAdlibs: IBlueprintAdLibPieceDB[]
}

// TODO: add something like this later?
// export enum BlueprintSyncIngestDataSource {
// 	/** The data update came from the same segment */
// 	SEGMENT = 'segment',
// 	/** The data update came from another infinite being updated */
// 	INFINITE = 'infinite',
// 	ADLIB = 'adlib',
// 	UNKNOWN = 'unknown'
// }

export interface BlueprintSyncIngestPartInstance {
	partInstance: IBlueprintPartInstance
	pieceInstances: IBlueprintPieceInstance[]
	// Upcoming interface:
	// adLibPieceInstances: IBlueprintAdlibPieceInstance[]
	// adLibActionInstances: IBlueprintAdlibActionInstance[]
}

/** Key is the ID of the external ID of the Rundown, Value is the rank to be assigned */
export interface BlueprintResultOrderedRundowns {
	[rundownExternalId: string]: number
}

export interface BlueprintResultRundownPlaylist {
	playlist: IBlueprintRundownPlaylistInfo
	/** Returns information about the order of rundowns in a playlist, null will use natural sorting on rundown name */
	order: BlueprintResultOrderedRundowns | null
}
