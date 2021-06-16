import * as React from 'react'
import { withTranslation } from 'react-i18next'

import ClassNames from 'classnames'
import * as mousetrap from 'mousetrap'
import 'mousetrap/plugins/global-bind/mousetrap-global-bind'

import { faBars } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

import { Translated } from '../../lib/ReactMeteorData/ReactMeteorData'
import { PieceUi } from '../SegmentTimeline/SegmentTimelineContainer'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { RundownViewKbdShortcuts } from '../RundownView'
import { ShowStyleBase } from '../../../lib/collections/ShowStyleBases'
import { getElementDocumentOffset } from '../../utils/positions'
import { RundownLayoutFilter, RundownLayoutShelfBase } from '../../../lib/collections/RundownLayouts'
import { UIStateStorage } from '../../lib/UIStateStorage'
import { RundownLayoutsAPI } from '../../../lib/api/rundownLayouts'
import { contextMenuHoldToDisplayTime } from '../../lib/lib'
import { ErrorBoundary } from '../../lib/ErrorBoundary'
import { ShelfRundownLayout } from './ShelfRundownLayout'
import { ShelfDashboardLayout } from './ShelfDashboardLayout'
import { Bucket } from '../../../lib/collections/Buckets'
import { RundownViewBuckets, BucketAdLibItem } from './RundownViewBuckets'
import { ContextMenuTrigger } from '@jstarpl/react-contextmenu'
import { ShelfInspector } from './Inspector/ShelfInspector'
import { Studio } from '../../../lib/collections/Studios'
import RundownViewEventBus, {
	RundownViewEvents,
	SelectPieceEvent,
	SwitchToShelfTabEvent,
} from '../RundownView/RundownViewEventBus'
import { IAdLibListItem } from './AdLibListItem'
import ShelfContextMenu from './ShelfContextMenu'

export enum ShelfTabs {
	ADLIB = 'adlib',
	ADLIB_LAYOUT_FILTER = 'adlib_layout_filter',
	GLOBAL_ADLIB = 'global_adlib',
	SYSTEM_HOTKEYS = 'system_hotkeys',
}
export interface IShelfProps extends React.ComponentPropsWithRef<any> {
	isExpanded: boolean
	buckets: Array<Bucket>
	playlist: RundownPlaylist
	studio: Studio
	showStyleBase: ShowStyleBase
	studioMode: boolean
	hotkeys: Array<{
		key: string
		label: string
	}>
	rundownLayout?: RundownLayoutShelfBase
	fullViewport?: boolean
	shelfDisplayOptions: {
		buckets: boolean
		layout: boolean
		inspector: boolean
	}
	bucketDisplayFilter: number[] | undefined

	onChangeExpanded: (value: boolean) => void
	onRegisterHotkeys: (
		hotkeys: Array<{
			key: string
			label: string
		}>
	) => void
	onChangeBottomMargin?: (newBottomMargin: string) => void
}

interface IState {
	shelfHeight: string
	overrideHeight: number | undefined
	moving: boolean
	selectedTab: string | undefined
	shouldQueue: boolean
	selectedPiece: BucketAdLibItem | IAdLibListItem | PieceUi | undefined
	localStorageName: string
}

const CLOSE_MARGIN = 45
const MAX_HEIGHT = 95
export const DEFAULT_TAB = ShelfTabs.ADLIB

export class ShelfBase extends React.Component<Translated<IShelfProps>, IState> {
	private element: HTMLDivElement | null = null
	private _mouseStart: {
		x: number
		y: number
	} = {
		x: 0,
		y: 0,
	}
	private _mouseOffset: {
		x: number
		y: number
	} = {
		x: 0,
		y: 0,
	}
	private _mouseDown: number

	private bindKeys: Array<{
		key: string
		up?: (e: KeyboardEvent) => any
		down?: (e: KeyboardEvent) => any
		label: string
		global?: boolean
	}> = []

	constructor(props: Translated<IShelfProps>) {
		super(props)

		const defaultHeight = props.rundownLayout?.startingHeight
			? `${100 - Math.min(props.rundownLayout.startingHeight, MAX_HEIGHT)}vh`
			: '50vh'

		const localStorageName = props.rundownLayout ? `rundownView.shelf_${props.rundownLayout._id}` : `rundownView.shelf`

		this.state = {
			moving: false,
			shelfHeight: localStorage.getItem(`${localStorageName}.shelfHeight`) ?? defaultHeight,
			overrideHeight: undefined,
			selectedTab: UIStateStorage.getItem(`rundownView.${props.playlist._id}`, 'shelfTab', undefined) as
				| string
				| undefined,
			shouldQueue: false,
			selectedPiece: undefined,
			localStorageName,
		}

		const { t } = props

		this.bindKeys = [
			{
				key: RundownViewKbdShortcuts.RUNDOWN_TOGGLE_SHELF,
				up: this.keyToggleShelf,
				label: t('Toggle Shelf'),
			},
			// {
			// 	key: RundownViewKbdShortcuts.RUNDOWN_RESET_FOCUS,
			// 	up: this.keyBlurActiveElement,
			// 	label: t('Escape from filter search'),
			// 	global: true
			// }
		]
	}

	componentDidMount() {
		const preventDefault = (e) => {
			e.preventDefault()
			e.stopImmediatePropagation()
			e.stopPropagation()
		}
		this.bindKeys.forEach((k) => {
			const method = k.global ? mousetrap.bindGlobal : mousetrap.bind
			if (k.up) {
				method(
					k.key,
					(e: KeyboardEvent) => {
						preventDefault(e)
						if (k.up) k.up(e)
					},
					'keyup'
				)
				method(
					k.key,
					(e: KeyboardEvent) => {
						preventDefault(e)
					},
					'keydown'
				)
			}
			if (k.down) {
				method(
					k.key,
					(e: KeyboardEvent) => {
						preventDefault(e)
						if (k.down) k.down(e)
					},
					'keydown'
				)
			}
		})

		this.props.onRegisterHotkeys(this.bindKeys)
		this.restoreDefaultTab()

		RundownViewEventBus.on(RundownViewEvents.SWITCH_SHELF_TAB, this.onSwitchShelfTab)
		RundownViewEventBus.on(RundownViewEvents.SELECT_PIECE, this.onSelectPiece)

		document.body.addEventListener('wheel', this.preventWheelPropagation, {
			passive: false,
		})
	}

	componentWillUnmount() {
		this.bindKeys.forEach((k) => {
			if (k.up) {
				mousetrap.unbind(k.key, 'keyup')
				mousetrap.unbind(k.key, 'keydown')
			}
			if (k.down) {
				mousetrap.unbind(k.key, 'keydown')
			}
		})

		RundownViewEventBus.off(RundownViewEvents.SWITCH_SHELF_TAB, this.onSwitchShelfTab)
		RundownViewEventBus.off(RundownViewEvents.SELECT_PIECE, this.onSelectPiece)

		document.body.removeEventListener('wheel', this.preventWheelPropagation)
	}

	componentDidUpdate(prevProps: IShelfProps, prevState: IState) {
		if (prevProps.isExpanded !== this.props.isExpanded || prevState.shelfHeight !== this.state.shelfHeight) {
			if (this.props.onChangeBottomMargin && typeof this.props.onChangeBottomMargin === 'function') {
				this.props.onChangeBottomMargin(this.getHeight() || '0px')
			}
		}

		this.restoreDefaultTab()
	}

	restoreDefaultTab() {
		if (
			this.state.selectedTab === undefined &&
			this.props.rundownLayout &&
			RundownLayoutsAPI.isRundownLayout(this.props.rundownLayout)
		) {
			const defaultTab = this.props.rundownLayout.filters.find((i) => (i as RundownLayoutFilter).default)
			if (defaultTab) {
				this.setState({
					selectedTab: `${ShelfTabs.ADLIB_LAYOUT_FILTER}_${defaultTab._id}`,
				})
			}
		}
	}

	getHeight(): string {
		const top = parseFloat(this.state.shelfHeight.substr(0, this.state.shelfHeight.length - 2))
		return this.props.isExpanded ? (100 - top).toString() + 'vh' : '0px'
	}

	getTop(newState?: boolean): string | undefined {
		return this.state.overrideHeight
			? (this.state.overrideHeight / window.innerHeight) * 100 + 'vh'
			: (newState !== undefined ? newState : this.props.isExpanded)
			? this.state.shelfHeight
			: undefined
	}

	getStyle() {
		return {
			top: this.getTop(),
			transition: this.state.moving ? '' : '0.5s top ease-out',
		}
	}

	keyBlurActiveElement = () => {
		this.blurActiveElement()
	}

	keyToggleShelf = () => {
		this.toggleShelf()
	}

	blurActiveElement = () => {
		try {
			// @ts-ignore
			document.activeElement.blur()
		} catch (e) {
			// do nothing
		}
	}

	toggleShelf = () => {
		this.blurActiveElement()
		this.props.onChangeExpanded(!this.props.isExpanded)
	}

	dropHandle = (e: MouseEvent) => {
		document.removeEventListener('mouseup', this.dropHandle)
		document.removeEventListener('mouseleave', this.dropHandle)
		document.removeEventListener('mousemove', this.dragHandle)

		this.endResize()

		e.preventDefault()
	}

	dragHandle = (e: MouseEvent) => {
		if (e.buttons !== 1) {
			this.dropHandle(e)
			return
		}

		this.setState({
			overrideHeight: e.clientY + this._mouseOffset.y,
		})

		e.preventDefault()
	}

	grabHandle = (e: React.MouseEvent<HTMLDivElement>) => {
		if (e.button !== 0) {
			return
		}

		document.addEventListener('mouseup', this.dropHandle)
		document.addEventListener('mouseleave', this.dropHandle)
		document.addEventListener('mousemove', this.dragHandle)

		this.beginResize(e.clientX, e.clientY, e.currentTarget)

		e.preventDefault()
	}

	touchMoveHandle = (e: TouchEvent) => {
		this.setState({
			overrideHeight: e.touches[0].clientY + this._mouseOffset.y,
		})

		e.preventDefault()
	}

	touchOffHandle = (e: TouchEvent) => {
		document.removeEventListener('touchmove', this.touchMoveHandle)
		document.removeEventListener('touchcancel', this.touchOffHandle)
		document.removeEventListener('touchend', this.touchOffHandle)

		this.endResize()

		e.preventDefault()
	}

	touchOnHandle = (e: React.TouchEvent<HTMLDivElement>) => {
		document.addEventListener('touchmove', this.touchMoveHandle, {
			passive: false,
		})
		document.addEventListener('touchcancel', this.touchOffHandle)
		document.addEventListener('touchend', this.touchOffHandle, {
			passive: false,
		})

		if (e.touches.length > 1) {
			this.touchOffHandle(e.nativeEvent)
			return
		}

		this.beginResize(e.touches[0].clientX, e.touches[0].clientY, e.currentTarget)

		e.preventDefault()
	}

	endResize = () => {
		const stateChange: Partial<IState> = {
			moving: false,
			overrideHeight: undefined,
		}

		let shouldBeExpanded: boolean = false

		if (Date.now() - this._mouseDown > 350) {
			if (this.state.overrideHeight && window.innerHeight - this.state.overrideHeight > CLOSE_MARGIN) {
				stateChange.shelfHeight = Math.max(0.1, 0, this.state.overrideHeight / window.innerHeight) * 100 + 'vh'
				shouldBeExpanded = true
			} else {
				shouldBeExpanded = false
			}
		} else {
			shouldBeExpanded = !this.props.isExpanded
		}

		this.setState(stateChange as any)

		document.body.style.cursor = ''

		this.props.onChangeExpanded(shouldBeExpanded)
		this.blurActiveElement()

		localStorage.setItem(`${this.state.localStorageName}.shelfHeight`, this.state.shelfHeight)
	}

	beginResize = (x: number, y: number, targetElement: HTMLElement) => {
		this._mouseStart.x = x
		this._mouseStart.y = y

		const handlePosition = getElementDocumentOffset(targetElement.parentElement)
		if (handlePosition) {
			this._mouseOffset.x = handlePosition.left - window.scrollX - this._mouseStart.x
			this._mouseOffset.y = handlePosition.top - window.scrollY - this._mouseStart.y
		}

		this._mouseDown = Date.now()

		document.body.style.cursor = 'grabbing'

		this.setState({
			moving: true,
		})
	}

	onSwitchShelfTab = (e: SwitchToShelfTabEvent) => {
		if (e.tab) {
			this.switchTab(e.tab)
		}
	}

	switchTab = (tab: string) => {
		this.setState({
			selectedTab: tab,
		})

		UIStateStorage.setItem(`rundownView.${this.props.playlist._id}`, 'shelfTab', tab)
	}

	private onSelectPiece = (e: SelectPieceEvent) => {
		this.selectPiece(e.piece)
	}

	private setRef = (element: HTMLDivElement | null) => {
		this.element = element
	}

	selectPiece = (piece: BucketAdLibItem | IAdLibListItem | PieceUi | undefined) => {
		this.setState({
			selectedPiece: piece,
		})
	}

	changeQueueAdLib = (shouldQueue: boolean) => {
		this.setState({
			shouldQueue,
		})
	}

	private preventWheelPropagation = (e: WheelEvent) => {
		const composedPath = e.composedPath()
		if (this.element && composedPath.includes(this.element)) {
			const scrollSink = composedPath.find(
				(element) => element instanceof HTMLElement && element.classList.contains('scroll-sink')
			)
			if (scrollSink instanceof HTMLElement) {
				if (e.deltaY < 0 && scrollSink.scrollTop <= 0) {
					e.preventDefault()
				} else if (
					e.deltaY > 0 &&
					Math.round(scrollSink.scrollTop) >= scrollSink.scrollHeight - scrollSink.clientHeight
				) {
					e.preventDefault()
				}
			}
		}
	}

	render() {
		const { fullViewport } = this.props
		return (
			<div
				className={ClassNames('rundown-view__shelf dark scroll-sink', {
					'full-viewport': fullViewport,
					moving: this.state.moving,
				})}
				style={fullViewport ? undefined : this.getStyle()}
				ref={this.setRef}
			>
				<ShelfContextMenu />
				{!fullViewport && (
					<div
						className="rundown-view__shelf__handle dark"
						tabIndex={0}
						onMouseDown={this.grabHandle}
						onTouchStart={this.touchOnHandle}
					>
						<FontAwesomeIcon icon={faBars} />
					</div>
				)}
				<div className="rundown-view__shelf__contents">
					{!this.props.fullViewport || this.props.shelfDisplayOptions.layout ? (
						<ContextMenuTrigger
							id="shelf-context-menu"
							attributes={{
								className: 'rundown-view__shelf__contents__pane fill',
							}}
							holdToDisplay={contextMenuHoldToDisplayTime()}
						>
							<ErrorBoundary>
								{this.props.rundownLayout && RundownLayoutsAPI.isRundownLayout(this.props.rundownLayout) ? (
									<ShelfRundownLayout
										playlist={this.props.playlist}
										showStyleBase={this.props.showStyleBase}
										studioMode={this.props.studioMode}
										hotkeys={this.props.hotkeys}
										rundownLayout={this.props.rundownLayout}
										selectedTab={this.state.selectedTab}
										selectedPiece={this.state.selectedPiece}
										onSelectPiece={this.selectPiece}
										onSwitchTab={this.switchTab}
										studio={this.props.studio}
									/>
								) : this.props.rundownLayout && RundownLayoutsAPI.isDashboardLayout(this.props.rundownLayout) ? (
									<ShelfDashboardLayout
										playlist={this.props.playlist}
										showStyleBase={this.props.showStyleBase}
										// buckets={this.props.buckets}
										studioMode={this.props.studioMode}
										rundownLayout={this.props.rundownLayout}
										shouldQueue={this.state.shouldQueue}
										selectedPiece={this.state.selectedPiece}
										onSelectPiece={this.selectPiece}
										onChangeQueueAdLib={this.changeQueueAdLib}
										studio={this.props.studio}
									/>
								) : (
									// ultimate fallback if not found
									<ShelfRundownLayout
										playlist={this.props.playlist}
										showStyleBase={this.props.showStyleBase}
										studioMode={this.props.studioMode}
										hotkeys={this.props.hotkeys}
										rundownLayout={undefined}
										selectedTab={this.state.selectedTab}
										selectedPiece={this.state.selectedPiece}
										onSelectPiece={this.selectPiece}
										onSwitchTab={this.switchTab}
										studio={this.props.studio}
									/>
								)}
							</ErrorBoundary>
						</ContextMenuTrigger>
					) : null}
					{!this.props.fullViewport || this.props.shelfDisplayOptions.buckets ? (
						<ErrorBoundary>
							<RundownViewBuckets
								buckets={this.props.buckets}
								playlist={this.props.playlist}
								shouldQueue={this.state.shouldQueue}
								showStyleBase={this.props.showStyleBase}
								fullViewport={
									!!this.props.fullViewport &&
									this.props.shelfDisplayOptions.buckets === true &&
									this.props.shelfDisplayOptions.inspector === false &&
									this.props.shelfDisplayOptions.layout === false
								}
								displayBuckets={this.props.bucketDisplayFilter}
								selectedPiece={this.state.selectedPiece}
								onSelectPiece={this.selectPiece}
							/>
						</ErrorBoundary>
					) : null}
					{!this.props.fullViewport || this.props.shelfDisplayOptions.inspector ? (
						<ErrorBoundary>
							<ShelfInspector
								selected={this.state.selectedPiece}
								showStyleBase={this.props.showStyleBase}
								studio={this.props.studio}
								rundownPlaylist={this.props.playlist}
								onSelectPiece={this.selectPiece}
							/>
						</ErrorBoundary>
					) : null}
				</div>
			</div>
		)
	}
}

export const Shelf = withTranslation(undefined, {
	withRef: true,
})(ShelfBase)
