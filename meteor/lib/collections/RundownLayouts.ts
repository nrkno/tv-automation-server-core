import { Meteor } from 'meteor/meteor'
import { TransformedCollection } from '../typings/meteor'
import { registerCollection, ProtectedString } from '../lib'
import { SourceLayerType } from 'tv-automation-sofie-blueprints-integration'
import { createMongoCollection } from './lib'
import { BlueprintId } from './Blueprints'
import { ShowStyleBaseId } from './ShowStyleBases'

/**
 * The view targeted by this layout:
 * RUNDOWN_LAYOUT: a Rundown view for highly scripted shows: a show split into Segments and Parts,
 * 				   accurate timing on each of those with over/under etc.
 * DASHBOARD_LAYOUT: a Dashboard view for AdLib shows (low-scripted): a list of buttons and some generic show layout
 *
 * @export
 * @enum {string}
 */
export enum RundownLayoutType {
	RUNDOWN_LAYOUT = 'rundown_layout',
	DASHBOARD_LAYOUT = 'dashboard_layout',
}

/**
 * Display style to be used by this filter
 *
 * @export
 * @enum {string}
 */
export enum PieceDisplayStyle {
	LIST = 'list',
	BUTTONS = 'buttons',
}

export enum RundownLayoutElementType {
	FILTER = 'filter',
	EXTERNAL_FRAME = 'external_frame',
	ADLIB_REGION = 'adlib_region',
}

export interface RundownLayoutElementBase {
	_id: string
	name: string
	rank: number
	type?: RundownLayoutElementType // if not set, the value is RundownLayoutElementType.FILTER
}

export interface RundownLayoutExternalFrame extends RundownLayoutElementBase {
	type: RundownLayoutElementType.EXTERNAL_FRAME
	url: string
	scale: number
}

export enum RundownLayoutAdLibRegionRole {
	QUEUE = 'queue',
	TAKE = 'take',
	PROGRAM = 'program',
}

export interface RundownLayoutAdLibRegion extends RundownLayoutElementBase {
	type: RundownLayoutElementType.ADLIB_REGION
	tags: string[] | undefined
	role: RundownLayoutAdLibRegionRole
	adlibRank: number
	labelBelowPanel: boolean
}

/**
 * A filter to be applied against the AdLib Pieces. If a member is undefined, the pool is not tested
 * against that filter. A member must match all of the sub-filters to be included in a filter view
 *
 * @export
 * @interface RundownLayoutFilter
 */
export interface RundownLayoutFilterBase extends RundownLayoutElementBase {
	type: RundownLayoutElementType.FILTER
	sourceLayerIds: string[] | undefined
	sourceLayerTypes: SourceLayerType[] | undefined
	outputLayerIds: string[] | undefined
	label: string[] | undefined
	tags: string[] | undefined
	displayStyle: PieceDisplayStyle
	showThumbnailsInList: boolean
	currentSegment: boolean
	/**
	 * true: include Rundown Baseline AdLib Pieces
	 * false: do not include Rundown Baseline AdLib Pieces
	 * 'only': show only Rundown Baseline AdLib Pieces matching this filter
	 */
	rundownBaseline: boolean | 'only'
}

export interface RundownLayoutFilter extends RundownLayoutFilterBase {
	default: boolean
}

export interface DashboardLayoutExternalFrame extends RundownLayoutExternalFrame {
	x: number
	y: number
	width: number
	height: number
}

export interface DashboardLayoutAdLibRegion extends RundownLayoutAdLibRegion {
	x: number
	y: number
	width: number
	height: number
}

export interface DashboardLayoutFilter extends RundownLayoutFilterBase {
	x: number
	y: number
	width: number
	height: number
	enableSearch: boolean

	buttonWidthScale: number
	buttonHeightScale: number

	includeClearInRundownBaseline: boolean
	assignHotKeys: boolean
	overflowHorizontally?: boolean
	showAsTimeline?: boolean
	hide?: boolean
	displayTakeButtons?: boolean
	queueAllAdlibs?: boolean
}

/** A string, identifying a RundownLayout */
export type RundownLayoutId = ProtectedString<'RundownLayoutId'>

export interface RundownLayoutBase {
	_id: RundownLayoutId
	showStyleBaseId: ShowStyleBaseId
	blueprintId?: BlueprintId
	userId?: string
	name: string
	type: RundownLayoutType.RUNDOWN_LAYOUT | RundownLayoutType.DASHBOARD_LAYOUT
	filters: RundownLayoutElementBase[]
	showBuckets: boolean
}

export interface RundownLayout extends RundownLayoutBase {
	type: RundownLayoutType.RUNDOWN_LAYOUT
	filters: RundownLayoutElementBase[]
}

export enum ActionButtonType {
	TAKE = 'take',
	HOLD = 'hold',
	MOVE_NEXT_PART = 'move_next_part',
	MOVE_NEXT_SEGMENT = 'move_next_segment',
	MOVE_PREVIOUS_PART = 'move_previous_part',
	MOVE_PREVIOUS_SEGMENT = 'move_previous_segment',
	ACTIVATE = 'activate',
	ACTIVATE_REHEARSAL = 'activate_rehearsal',
	DEACTIVATE = 'deactivate',
	RESET_RUNDOWN = 'reset_rundown',
	QUEUE_ADLIB = 'queue_adlib', // The idea for it is that you would be able to press and hold this button
	// and then click on whatever adlib you would like
}

export interface DashboardLayoutActionButton {
	_id: string
	type: ActionButtonType
	x: number
	y: number
	width: number
	height: number
	label: string
}

export interface DashboardLayout extends RundownLayoutBase {
	type: RundownLayoutType.DASHBOARD_LAYOUT
	filters: RundownLayoutElementBase[]
	actionButtons?: DashboardLayoutActionButton[]
}

export const RundownLayouts: TransformedCollection<RundownLayoutBase, RundownLayoutBase> = createMongoCollection<
	RundownLayoutBase
>('rundownLayouts')
registerCollection('RundownLayouts', RundownLayouts)
Meteor.startup(() => {
	if (Meteor.isServer) {
		// RundownLayouts._ensureIndex({
		// 	studioId: 1,
		// 	collectionId: 1,
		// 	objId: 1,
		// 	mediaId: 1
		// })
		RundownLayouts._ensureIndex({
			showStyleBaseId: 1,
		})
	}
})
