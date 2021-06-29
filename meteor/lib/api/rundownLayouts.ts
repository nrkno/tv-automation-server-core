import {
	RundownLayoutBase,
	RundownLayout,
	DashboardLayout,
	RundownLayoutType,
	RundownLayoutId,
	RundownLayoutElementBase,
	RundownLayoutFilterBase,
	RundownLayoutElementType,
	RundownLayoutExternalFrame,
	RundownLayoutAdLibRegion,
	PieceDisplayStyle,
	RundownLayoutPieceCountdown,
	RundownViewLayout,
	RundownLayoutRundownHeader,
	RundownLayoutShelfBase,
	CustomizableRegions,
} from '../collections/RundownLayouts'
import { ShowStyleBaseId } from '../collections/ShowStyleBases'
import * as _ from 'underscore'
import { literal } from '../lib'
import { TFunction } from 'i18next'

export interface NewRundownLayoutsAPI {
	createRundownLayout(
		name: string,
		type: RundownLayoutType,
		showStyleBaseId: ShowStyleBaseId,
		regionId: string
	): Promise<RundownLayoutId>
	removeRundownLayout(id: RundownLayoutId): Promise<void>
}

export enum RundownLayoutsAPIMethods {
	'removeRundownLayout' = 'rundownLayout.removeRundownLayout',
	'createRundownLayout' = 'rundownLayout.createRundownLayout',
}

export interface LayoutDescriptor<T extends RundownLayoutBase> {
	supportedElements: RundownLayoutElementType[]
	filtersTitle?: string // e.g. tabs/panels
	supportsFilters?: boolean
}

export interface CustomizableRegionSettingsManifest {
	_id: string
	title: string
	layouts: Array<CustomizableRegionLayout>
}

export interface CustomizableRegionLayout {
	_id: string
	type: RundownLayoutType
	filtersTitle?: string
	supportsFilters?: boolean
	supportedElements: RundownLayoutElementType[]
}

class RundownLayoutsRegistry {
	private shelfLayouts: Map<RundownLayoutType, LayoutDescriptor<RundownLayoutShelfBase>> = new Map()
	private rundownViewLayouts: Map<RundownLayoutType, LayoutDescriptor<RundownViewLayout>> = new Map()
	private miniShelfLayouts: Map<RundownLayoutType, LayoutDescriptor<RundownLayoutShelfBase>> = new Map()
	private rundownHeaderLayouts: Map<RundownLayoutType, LayoutDescriptor<RundownLayoutRundownHeader>> = new Map()

	public registerShelfLayout(id: RundownLayoutType, description: LayoutDescriptor<RundownLayoutShelfBase>) {
		this.shelfLayouts.set(id, description)
	}

	public registerRundownViewLayout(id: RundownLayoutType, description: LayoutDescriptor<RundownLayoutBase>) {
		this.rundownViewLayouts.set(id, description)
	}

	public registerMiniShelfLayout(id: RundownLayoutType, description: LayoutDescriptor<RundownLayoutBase>) {
		this.miniShelfLayouts.set(id, description)
	}

	public registerRundownHeaderLayouts(id: RundownLayoutType, description: LayoutDescriptor<RundownLayoutBase>) {
		this.rundownHeaderLayouts.set(id, description)
	}

	public isShelfLayout(regionId: string) {
		return regionId === CustomizableRegions.Shelf
	}

	public isRudownViewLayout(regionId: string) {
		return regionId === CustomizableRegions.RundownView
	}

	public isMiniShelfLayout(regionId: string) {
		return regionId === CustomizableRegions.MiniShelf
	}

	public isRundownHeaderLayout(regionId: string) {
		return regionId === CustomizableRegions.RundownHeader
	}

	private wrapToCustomizableRegionLayout(
		layouts: Map<RundownLayoutType, LayoutDescriptor<RundownLayoutBase>>
	): CustomizableRegionLayout[] {
		return Array.from(layouts.entries()).map(([layoutType, descriptor]) => {
			return literal<CustomizableRegionLayout>({
				_id: layoutType,
				type: layoutType,
				...descriptor,
			})
		})
	}

	public getSettingsManifest(t: TFunction): CustomizableRegionSettingsManifest[] {
		return [
			{
				_id: CustomizableRegions.RundownView,
				title: t('Rundown View Layouts'),
				layouts: this.wrapToCustomizableRegionLayout(this.rundownViewLayouts),
			},
			{
				_id: CustomizableRegions.Shelf,
				title: t('Shelf Layouts'),
				layouts: this.wrapToCustomizableRegionLayout(this.shelfLayouts),
			},
			{
				_id: CustomizableRegions.MiniShelf,
				title: t('Mini Shelf Layouts'),
				layouts: this.wrapToCustomizableRegionLayout(this.miniShelfLayouts),
			},
			{
				_id: CustomizableRegions.RundownHeader,
				title: t('Rundown Header Layouts'),
				layouts: this.wrapToCustomizableRegionLayout(this.rundownHeaderLayouts),
			},
		]
	}
}

export namespace RundownLayoutsAPI {
	const registry = new RundownLayoutsRegistry()
	registry.registerShelfLayout(RundownLayoutType.RUNDOWN_LAYOUT, {
		filtersTitle: 'Panels',
		supportsFilters: true,
		supportedElements: [
			RundownLayoutElementType.ADLIB_REGION,
			RundownLayoutElementType.EXTERNAL_FRAME,
			RundownLayoutElementType.FILTER,
			RundownLayoutElementType.PIECE_COUNTDOWN,
		],
	})
	registry.registerShelfLayout(RundownLayoutType.DASHBOARD_LAYOUT, {
		filtersTitle: 'Tabs',
		supportsFilters: true,
		supportedElements: [
			RundownLayoutElementType.ADLIB_REGION,
			RundownLayoutElementType.EXTERNAL_FRAME,
			RundownLayoutElementType.FILTER,
			RundownLayoutElementType.PIECE_COUNTDOWN,
		],
	})
	registry.registerMiniShelfLayout(RundownLayoutType.DASHBOARD_LAYOUT, {
		supportedElements: [],
	})
	registry.registerMiniShelfLayout(RundownLayoutType.RUNDOWN_LAYOUT, {
		supportedElements: [],
	})
	registry.registerRundownViewLayout(RundownLayoutType.RUNDOWN_VIEW_LAYOUT, {
		supportedElements: [],
	})
	registry.registerRundownHeaderLayouts(RundownLayoutType.RUNDOWN_HEADER_LAYOUT, {
		supportedElements: [],
	})

	export function getSettingsManifest(t: TFunction): CustomizableRegionSettingsManifest[] {
		return registry.getSettingsManifest(t)
	}

	export function isLayoutForShelf(layout: RundownLayoutBase): layout is RundownLayoutShelfBase {
		return registry.isShelfLayout(layout.regionId)
	}

	export function isLayoutForRundownView(layout: RundownLayoutBase): layout is RundownViewLayout {
		return registry.isRudownViewLayout(layout.regionId)
	}

	export function isLayoutForMiniShelf(layout: RundownLayoutBase): layout is RundownLayoutShelfBase {
		return registry.isMiniShelfLayout(layout.regionId)
	}

	export function isLayoutForRundownHeader(layout: RundownLayoutBase): layout is RundownLayoutRundownHeader {
		return registry.isRundownHeaderLayout(layout.regionId)
	}

	export function isRundownViewLayout(layout: RundownLayoutBase): layout is RundownViewLayout {
		return layout.type === RundownLayoutType.RUNDOWN_VIEW_LAYOUT
	}

	export function isRundownLayout(layout: RundownLayoutBase): layout is RundownLayout {
		return layout.type === RundownLayoutType.RUNDOWN_LAYOUT
	}

	export function isDashboardLayout(layout: RundownLayoutBase): layout is DashboardLayout {
		return layout.type === RundownLayoutType.DASHBOARD_LAYOUT
	}

	export function isRundownHeaderLayout(layout: RundownLayoutBase): layout is RundownLayoutRundownHeader {
		return layout.type === RundownLayoutType.RUNDOWN_HEADER_LAYOUT
	}

	export function isFilter(element: RundownLayoutElementBase): element is RundownLayoutFilterBase {
		return element.type === undefined || element.type === RundownLayoutElementType.FILTER
	}

	export function isExternalFrame(element: RundownLayoutElementBase): element is RundownLayoutExternalFrame {
		return element.type === RundownLayoutElementType.EXTERNAL_FRAME
	}

	export function isAdLibRegion(element: RundownLayoutElementBase): element is RundownLayoutAdLibRegion {
		return element.type === RundownLayoutElementType.ADLIB_REGION
	}

	export function isPieceCountdown(element: RundownLayoutElementBase): element is RundownLayoutPieceCountdown {
		return element.type === RundownLayoutElementType.PIECE_COUNTDOWN
	}

	export function adLibRegionToFilter(element: RundownLayoutAdLibRegion): RundownLayoutFilterBase {
		return {
			..._.pick(element, '_id', 'name', 'rank', 'tags'),
			rundownBaseline: true,
			type: RundownLayoutElementType.FILTER,
			sourceLayerIds: [],
			sourceLayerTypes: [],
			outputLayerIds: [],
			label: [],
			displayStyle: PieceDisplayStyle.BUTTONS,
			currentSegment: false,
			showThumbnailsInList: false,
			nextInCurrentPart: false,
			oneNextPerSourceLayer: false,
			hideDuplicates: false,
		}
	}
}
