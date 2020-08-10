import * as React from 'react'
import { withTranslation } from 'react-i18next'

import ClassNames from 'classnames'
import * as _ from 'underscore'
import * as mousetrap from 'mousetrap'

import { faBars } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

import { AdLibPieceUi } from './AdLibPanel'
import { Translated } from '../../lib/ReactMeteorData/ReactMeteorData'
import { PieceUi } from '../SegmentTimeline/SegmentTimelineContainer'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { RundownViewKbdShortcuts, RundownViewEvents } from '../RundownView'
import { ShowStyleBase } from '../../../lib/collections/ShowStyleBases'
import { getElementDocumentOffset } from '../../utils/positions'
import { RundownLayoutBase, RundownLayoutFilter } from '../../../lib/collections/RundownLayouts'
import { UIStateStorage } from '../../lib/UIStateStorage'
import { RundownLayoutsAPI } from '../../../lib/api/rundownLayouts'
import { contextMenuHoldToDisplayTime } from '../../lib/lib'
import { ErrorBoundary } from '../../lib/ErrorBoundary'
import { ShelfRundownLayout } from './ShelfRundownLayout'
import { ShelfDashboardLayout } from './ShelfDashboardLayout'
import { Bucket } from '../../../lib/collections/Buckets'
import { RundownViewBuckets } from './RundownViewBuckets'
import { ContextMenuTrigger } from 'react-contextmenu'
import { ShelfInspector } from './Inspector/ShelfInspector'

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
	showStyleBase: ShowStyleBase
	studioMode: boolean
	hotkeys: Array<{
		key: string
		label: string
	}>
	rundownLayout?: RundownLayoutBase
	fullViewport?: boolean
	showBuckets: boolean

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
	selectedPiece: AdLibPieceUi | PieceUi | undefined
}

const CLOSE_MARGIN = 45
export const DEFAULT_TAB = ShelfTabs.ADLIB

export class ShelfBase extends React.Component<Translated<IShelfProps>, IState> {
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

		this.state = {
			moving: false,
			shelfHeight: localStorage.getItem('rundownView.shelf.shelfHeight') || '50vh',
			overrideHeight: undefined,
			selectedTab: UIStateStorage.getItem(`rundownView.${props.playlist._id}`, 'shelfTab', undefined) as
				| string
				| undefined,
			shouldQueue: false,
			selectedPiece: undefined,
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
		let preventDefault = (e) => {
			e.preventDefault()
			e.stopImmediatePropagation()
			e.stopPropagation()
		}
		_.each(this.bindKeys, (k) => {
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

		window.addEventListener(RundownViewEvents.switchShelfTab, this.onSwitchShelfTab)
		window.addEventListener(RundownViewEvents.selectPiece, this.onSelectPiece)
	}

	componentWillUnmount() {
		_.each(this.bindKeys, (k) => {
			if (k.up) {
				mousetrap.unbind(k.key, 'keyup')
				mousetrap.unbind(k.key, 'keydown')
			}
			if (k.down) {
				mousetrap.unbind(k.key, 'keydown')
			}
		})

		window.removeEventListener(RundownViewEvents.switchShelfTab, this.onSwitchShelfTab)
		window.removeEventListener(RundownViewEvents.selectPiece, this.onSelectPiece)
	}

	componentDidUpdate(prevProps: IShelfProps, prevState: IState) {
		if (prevProps.isExpanded !== this.props.isExpanded || prevState.shelfHeight !== this.state.shelfHeight) {
			if (this.props.onChangeBottomMargin && typeof this.props.onChangeBottomMargin === 'function') {
				// console.log(this.state.expanded, this.getHeight())
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
			: (newState !== undefined
				? newState
				: this.props.isExpanded)
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
		let stateChange = {
			moving: false,
			overrideHeight: undefined,
		}

		let shouldBeExpanded: boolean = false

		if (Date.now() - this._mouseDown > 350) {
			if (this.state.overrideHeight && window.innerHeight - this.state.overrideHeight > CLOSE_MARGIN) {
				stateChange = _.extend(stateChange, {
					shelfHeight: Math.max(0.1, 0, this.state.overrideHeight / window.innerHeight) * 100 + 'vh',
				})
				shouldBeExpanded = true
			} else {
				shouldBeExpanded = false
			}
		} else {
			shouldBeExpanded = !this.props.isExpanded
		}

		this.setState(stateChange)

		document.body.style.cursor = ''

		this.props.onChangeExpanded(shouldBeExpanded)
		this.blurActiveElement()

		localStorage.setItem('rundownView.shelf.shelfHeight', this.state.shelfHeight)
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

	onSwitchShelfTab = (e: any) => {
		const tab = e.detail && e.detail.tab

		if (tab) {
			this.switchTab(tab)
		}
	}

	switchTab = (tab: string) => {
		this.setState({
			selectedTab: tab,
		})

		UIStateStorage.setItem(`rundownView.${this.props.playlist._id}`, 'shelfTab', tab)
	}

	private onSelectPiece = (e: CustomEvent<{ piece: AdLibPieceUi | PieceUi | undefined }>) => {
		this.selectPiece(e.detail.piece)
	}

	selectPiece = (piece: AdLibPieceUi | PieceUi | undefined) => {
		this.setState({
			selectedPiece: piece,
		})
	}

	changeQueueAdLib = (shouldQueue: boolean, e: any) => {
		this.setState({
			shouldQueue,
		})
	}

	render() {
		const { t, fullViewport } = this.props
		return (
			<div
				className={ClassNames('rundown-view__shelf dark', {
					'full-viewport': fullViewport,
					moving: this.state.moving,
				})}
				style={fullViewport ? undefined : this.getStyle()}>
				{!fullViewport && (
					<div
						className="rundown-view__shelf__handle dark"
						tabIndex={0}
						onMouseDown={this.grabHandle}
						onTouchStart={this.touchOnHandle}>
						<FontAwesomeIcon icon={faBars} />
					</div>
				)}
				<div className="rundown-view__shelf__contents">
					<ContextMenuTrigger
						id="bucket-context-menu"
						attributes={{
							className: 'rundown-view__shelf__contents__pane fill',
						}}
						holdToDisplay={contextMenuHoldToDisplayTime()}>
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
								/>
							) : this.props.rundownLayout && RundownLayoutsAPI.isDashboardLayout(this.props.rundownLayout) ? (
								<ShelfDashboardLayout
									playlist={this.props.playlist}
									showStyleBase={this.props.showStyleBase}
									buckets={this.props.buckets}
									studioMode={this.props.studioMode}
									rundownLayout={this.props.rundownLayout}
									shouldQueue={this.state.shouldQueue}
									onChangeQueueAdLib={this.changeQueueAdLib}
								/>
							) : this.props.rundownLayout && RundownLayoutsAPI.isDashboardLayout(this.props.rundownLayout) ? (
								<ShelfDashboardLayout
									playlist={this.props.playlist}
									showStyleBase={this.props.showStyleBase}
									buckets={this.props.buckets}
									studioMode={this.props.studioMode}
									rundownLayout={this.props.rundownLayout}
									shouldQueue={this.state.shouldQueue}
									onChangeQueueAdLib={this.changeQueueAdLib}
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
								/>
							)}
						</ErrorBoundary>
					</ContextMenuTrigger>
					{this.props.showBuckets && (
						<ErrorBoundary>
							<RundownViewBuckets
								buckets={this.props.buckets}
								playlist={this.props.playlist}
								shouldQueue={this.state.shouldQueue}
								showStyleBase={this.props.showStyleBase}
							/>
						</ErrorBoundary>
					)}
					<ErrorBoundary>
						<ShelfInspector selected={this.state.selectedPiece} showStyleBase={this.props.showStyleBase} />
					</ErrorBoundary>
				</div>
			</div>
		)
	}
}

export const Shelf = withTranslation(undefined, {
	withRef: true,
})(ShelfBase)
