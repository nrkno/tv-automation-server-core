import { Time } from './common'
import { TimelineObjectCoreExt } from './timeline'

/** The type of the source layer, used to enable specific functions for special-type layers */
export enum SourceLayerType {
	UNKNOWN = 0,
	CAMERA = 1,
	VT = 2,
	REMOTE = 3,
	SCRIPT = 4,
	GRAPHICS = 5,
	SPLITS = 6,
	AUDIO = 7,
	// CAMERA_MOVEMENT = 8,
	// METADATA = 9,
	LOWER_THIRD = 10,
	LIVE_SPEAK = 11,
	TRANSITION = 13,
	// LIGHTS = 14,
	LOCAL = 15,
}

export type WithTimeline<T extends BaseContent> = T & {
	timelineObjects: TimelineObjectCoreExt[]
}

export interface BaseContent {
	editable?: BaseEditableParameters

	sourceDuration?: number
	ignoreMediaObjectStatus?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface BaseEditableParameters {}

export interface VTEditableParameters extends BaseEditableParameters {
	editorialStart: number
	editorialDuration: number
}

/** @todo Should all this be deprecated and replaced by expectedPackages altogether? */
export type SomeContent =
	| VTContent
	| CameraContent
	| RemoteContent
	| ScriptContent
	| NoraContent
	| SplitsContent
	| LiveSpeakContent
	| TransitionContent
	| GraphicsContent
	| UnknownContent
export type SomeTimelineContent = WithTimeline<SomeContent>

export type UnknownContent = BaseContent

export interface VTContent extends BaseContent {
	fileName: string
	path: string
	loop?: boolean
	mediaFlowIds?: string[]
	seek?: number
	editable?: VTEditableParameters
}

export interface GraphicsContent extends BaseContent {
	fileName: string
}

export interface CameraContent extends BaseContent {
	studioLabel: string
	switcherInput: number | string
}

export interface RemoteContent extends BaseContent {
	studioLabel: string
	switcherInput: number | string
}

export interface ScriptContent extends BaseContent {
	firstWords: string
	lastWords: string
	fullScript?: string
	lastModified?: Time | null
}

/** Data describing a Nora template's step attributes */
export interface NoraPayloadStepData {
	/** the step to move to - used when sending commands to nora */
	to?: number | 'next'
	/** the current step (which you are moving from) - provided by nora */
	from?: number
	/** Enable/disable step. This is usually provided by the template it self, but can be overwritten by providing the value. */
	enabled?: boolean
	/** -1 means unknown/infinite value of steps available, positive values are literal - provided by nora */
	total?: number
	/** if true only forward linear advances are allowed, if false you can jump around */
	orderLocked?: boolean
	/** if true the graphics will start at the first step again if given a next command when on the last. If false it will stay on the last step */
	repeat?: boolean
}

export interface NoraPayload {
	content: { [key: string]: unknown }
	manifest: string
	template: {
		event: string
		layer: string
		name: string
	}
	metadata?: {
		templateName: string | undefined
		templateVariant: string | undefined
	}
	changed?: Time
	step?: NoraPayloadStepData
}

export interface NoraContent extends BaseContent {
	payload: NoraPayload
	externalPayload: any
	previewRenderer: string
}

export interface SplitsContentBoxProperties {
	type: SourceLayerType
	studioLabel: string
	switcherInput: number | string
	/** Geometry information for a given box item in the Split. X,Y are relative to center of Box, Scale is 0...1, where 1 is Full-Screen */
	geometry?: {
		x: number
		y: number
		scale: number
		crop?: {
			left: number
			top: number
			right: number
			bottom: number
		}
	}
}
export type SplitsContentBoxContent = Omit<VTContent | CameraContent | RemoteContent | NoraContent, 'timelineObjects'>
export interface SplitsContent extends BaseContent {
	/** Array of contents, 0 is towards the rear */
	boxSourceConfiguration: (SplitsContentBoxContent & SplitsContentBoxProperties)[]
}

export interface AudioContent extends BaseContent {
	fileName: string
	path: string
	loop?: boolean
}

// export type LowerThirdContent = GraphicsContent
export type LiveSpeakContent = VTContent

export interface TransitionContent extends BaseContent {
	icon?: string
	preview?: string
}
