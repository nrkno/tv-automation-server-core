import { registerCollection, ProtectedString } from '../lib'
import { SourceLayerType } from '@sofie-automation/blueprints-integration'
import { createMongoCollection } from './lib'
import { BlueprintId } from './Blueprints'
import { ShowStyleBaseId } from './ShowStyleBases'
import { UserId } from './Users'
import { registerIndex } from '../database'

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
	RUNDOWN_VIEW_LAYOUT = 'rundown_view_layout',
	RUNDOWN_LAYOUT = 'rundown_layout',
	DASHBOARD_LAYOUT = 'dashboard_layout',
	RUNDOWN_HEADER_LAYOUT = 'rundown_header_layout',
}

export enum CustomizableRegions {
	RundownView = 'rundown_view_layouts',
	Shelf = 'shelf_layouts',
	MiniShelf = 'mini_shelf_layouts',
	RundownHeader = 'rundown_header_layouts',
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
	PIECE_COUNTDOWN = 'piece_countdown',
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

export interface RundownLayoutPieceCountdown extends RundownLayoutElementBase {
	type: RundownLayoutElementType.PIECE_COUNTDOWN
	sourceLayerIds: string[] | undefined
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
	hideDuplicates: boolean
	currentSegment: boolean
	nextInCurrentPart: boolean
	oneNextPerSourceLayer: boolean
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

export interface DashboardLayoutPieceCountdown extends RundownLayoutPieceCountdown {
	x: number
	y: number
	width: number
	scale: number
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
	toggleOnSingleClick?: boolean
}

/** A string, identifying a RundownLayout */
export type RundownLayoutId = ProtectedString<'RundownLayoutId'>

export interface RundownLayoutBase {
	_id: RundownLayoutId
	showStyleBaseId: ShowStyleBaseId
	blueprintId?: BlueprintId
	userId?: UserId
	name: string
	type: RundownLayoutType
	icon: string
	iconColor: string
	/* Customizable region that the layout modifies. */
	regionId: string
}

export interface RundownLayoutWithFilters extends RundownLayoutBase {
	filters: RundownLayoutElementBase[]
}

export interface RundownViewLayout extends RundownLayoutBase {
	type: RundownLayoutType.RUNDOWN_VIEW_LAYOUT
	expectedEndText: string
	/** Expose as a layout that can be selected by the user in the lobby view */
	exposeAsSelectableLayout: boolean
	shelfLayout: RundownLayoutId
	rundownHeaderLayout: RundownLayoutId
}

export interface RundownLayoutShelfBase extends RundownLayoutWithFilters {
	exposeAsStandalone: boolean
	openByDefault: boolean
	startingHeight?: number
}

export interface RundownLayout extends RundownLayoutShelfBase {
	type: RundownLayoutType.RUNDOWN_LAYOUT
}

export interface RundownLayoutRundownHeader extends RundownLayoutBase {
	type: RundownLayoutType.RUNDOWN_HEADER_LAYOUT
	expectedEndText: string
	nextBreakText: string
	/** When true, hide the Planned End timer when there is a rundown marked as a break in the future */
	hideExpectedEndBeforeBreak: boolean
	/** When a rundown is marked as a break, show the Next Break timing */
	showNextBreakTiming: boolean
	/** If true, don't treat the last rundown as a break even if it's marked as one */
	lastRundownIsNotBreak: boolean
}

export enum ActionButtonType {
	TAKE = 'take',
	HOLD = 'hold',
	MOVE_NEXT_PART = 'move_next_part',
	MOVE_NEXT_SEGMENT = 'move_next_segment',
	MOVE_PREVIOUS_PART = 'move_previous_part',
	MOVE_PREVIOUS_SEGMENT = 'move_previous_segment',
	// ACTIVATE = 'activate',
	// ACTIVATE_REHEARSAL = 'activate_rehearsal',
	// DEACTIVATE = 'deactivate',
	// RESET_RUNDOWN = 'reset_rundown',
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

export interface DashboardLayout extends RundownLayoutShelfBase {
	type: RundownLayoutType.DASHBOARD_LAYOUT
	filters: RundownLayoutElementBase[]
	actionButtons?: DashboardLayoutActionButton[]
}

export const RundownLayouts = createMongoCollection<RundownLayoutBase, RundownLayoutBase>('rundownLayouts')
registerCollection('RundownLayouts', RundownLayouts)

// addIndex(RundownLayouts, {
// 	studioId: 1,
// 	collectionId: 1,
// 	objId: 1,
// 	mediaId: 1
// })
registerIndex(RundownLayouts, {
	showStyleBaseId: 1,
})
