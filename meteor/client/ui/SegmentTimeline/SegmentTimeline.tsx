import * as React from 'react'
import * as PropTypes from 'prop-types'
import { withTranslation } from 'react-i18next'

import ClassNames from 'classnames'
import { ContextMenuTrigger } from '@jstarpl/react-contextmenu'

import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { RundownHoldState } from '../../../lib/collections/Rundowns'
import { Studio } from '../../../lib/collections/Studios'
import { SegmentUi, PartUi, IOutputLayerUi, PieceUi } from './SegmentTimelineContainer'
import { TimelineGrid } from './TimelineGrid'
import { SegmentTimelinePart } from './SegmentTimelinePart'
import { SegmentTimelineZoomControls } from './SegmentTimelineZoomControls'
import { SegmentDuration } from '../RundownView/RundownTiming/SegmentDuration'
import { PartCountdown } from '../RundownView/RundownTiming/PartCountdown'
import { RundownTiming } from '../RundownView/RundownTiming/RundownTiming'
import { CurrentPartRemaining } from '../RundownView/RundownTiming/CurrentPartRemaining'

import { RundownUtils } from '../../lib/rundown'
import { Translated } from '../../lib/ReactMeteorData/ReactMeteorData'
import { ErrorBoundary } from '../../lib/ErrorBoundary'
import { scrollToPart, lockPointer, unlockPointer } from '../../lib/viewPort'

import { NoteType, SegmentNote } from '../../../lib/api/notes'
import { getAllowSpeaking, getShowHiddenSourceLayers } from '../../lib/localStorage'
import { showPointerLockCursor, hidePointerLockCursor } from '../../lib/PointerLockCursor'
import { Settings } from '../../../lib/Settings'
import { IContextMenuContext } from '../RundownView'
import { literal, unprotectString } from '../../../lib/lib'
import { SegmentId } from '../../../lib/collections/Segments'
import { PartId } from '../../../lib/collections/Parts'
import { contextMenuHoldToDisplayTime } from '../../lib/lib'
import { WarningIconSmall, CriticalIconSmall } from '../../lib/ui/icons/notifications'
import RundownViewEventBus, { RundownViewEvents, HighlightEvent } from '../RundownView/RundownViewEventBus'

import { ZoomInIcon, ZoomOutIcon, ZoomShowAll } from '../../lib/segmentZoomIcon'
import { PartInstanceId } from '../../../lib/collections/PartInstances'
import { SegmentTimelineSmallPartFlag } from './SmallParts/SegmentTimelineSmallPartFlag'

interface IProps {
	id: string
	key: string
	segment: SegmentUi
	playlist: RundownPlaylist
	followLiveSegments: boolean
	studio: Studio
	parts: Array<PartUi>
	segmentNotes: Array<SegmentNote>
	timeScale: number
	maxTimeScale: number
	onRecalculateMaxTimeScale: () => Promise<number>
	showingAllSegment: boolean
	onCollapseOutputToggle?: (layer: IOutputLayerUi, event: any) => void
	collapsedOutputs: {
		[key: string]: boolean
	}
	scrollLeft: number
	hasAlreadyPlayed: boolean
	hasGuestItems: boolean
	hasRemoteItems: boolean
	isLiveSegment: boolean
	isNextSegment: boolean
	isQueuedSegment: boolean
	followLiveLine: boolean
	liveLineHistorySize: number
	livePosition: number
	autoNextPart: boolean
	onScroll: (scrollLeft: number, event: any) => void
	onZoomChange: (newScale: number, event: any) => void
	onFollowLiveLine?: (state: boolean, event: any) => void
	onShowEntireSegment?: (event: any) => void
	onContextMenu?: (contextMenuContext: IContextMenuContext) => void
	onItemClick?: (piece: PieceUi, e: React.MouseEvent<HTMLDivElement>) => void
	onItemDoubleClick?: (item: PieceUi, e: React.MouseEvent<HTMLDivElement>) => void
	onHeaderNoteClick?: (segmentId: SegmentId, level: NoteType) => void
	segmentRef?: (el: SegmentTimelineClass, segmentId: SegmentId) => void
	isLastSegment: boolean
	lastValidPartIndex: number | undefined
}
interface IStateHeader {
	timelineWidth: number
	mouseGrabbed: boolean
	highlight: boolean
	/** This map contains a list of parts that are too small to be displayed properly, paired with their durations */
	smallParts: Map<PartInstanceId, number>
}

interface IZoomPropsHeader {
	onZoomDblClick: (e) => void
	timelineWidth: number
}
interface IZoomStateHeader {
	totalSegmentDuration: number
}

const SegmentTimelineZoom = class SegmentTimelineZoom extends React.Component<
	IProps & IZoomPropsHeader,
	IZoomStateHeader
> {
	static contextTypes = {
		durations: PropTypes.object.isRequired,
	}

	constructor(props, context) {
		super(props, context)
		this.state = {
			totalSegmentDuration: 10,
		}
	}

	componentDidMount() {
		this.checkTimingChange()
		window.addEventListener(RundownTiming.Events.timeupdateHR, this.onTimeupdate)
	}

	componentWillUnmount() {
		window.removeEventListener(RundownTiming.Events.timeupdateHR, this.onTimeupdate)
	}

	onTimeupdate = () => {
		if (!this.props.isLiveSegment) {
			this.checkTimingChange()
		}
	}

	checkTimingChange = () => {
		const total = this.calculateSegmentDuration()
		if (total !== this.state.totalSegmentDuration) {
			this.setState({
				totalSegmentDuration: total,
			})
		}
	}

	calculateSegmentDuration(): number {
		let total = 0
		if (this.context && this.context.durations) {
			const durations = this.context.durations as RundownTiming.RundownTimingContext
			this.props.parts.forEach((item) => {
				// total += durations.partDurations ? durations.partDurations[item._id] : (item.duration || item.renderedDuration || 1)
				const duration = Math.max(
					item.instance.timings?.duration || item.renderedDuration || 0,
					(durations.partDisplayDurations && durations.partDisplayDurations[unprotectString(item.instance.part._id)]) ||
						Settings.defaultDisplayDuration
				)
				total += duration
			})
		} else {
			total = RundownUtils.getSegmentDuration(this.props.parts, true)
		}
		return total
	}

	getSegmentDuration(): number {
		return this.props.isLiveSegment ? this.calculateSegmentDuration() : this.state.totalSegmentDuration
	}

	renderZoomTimeline() {
		return this.props.parts.map((part, index, array) => {
			return (
				<SegmentTimelinePart
					key={unprotectString(part.partId)}
					segment={this.props.segment}
					playlist={this.props.playlist}
					studio={this.props.studio}
					collapsedOutputs={this.props.collapsedOutputs}
					scrollLeft={0}
					scrollWidth={1}
					timeScale={1}
					relative={true}
					totalSegmentDuration={this.getSegmentDuration()}
					part={part}
					followLiveLine={this.props.followLiveLine}
					autoNextPart={this.props.autoNextPart}
					liveLineHistorySize={this.props.liveLineHistorySize}
					livePosition={
						part.instance._id === this.props.playlist.currentPartInstanceId && part.instance.timings?.startedPlayback
							? this.props.livePosition - part.instance.timings.startedPlayback
							: null
					}
					isLastInSegment={false}
					isAfterLastValidInSegmentAndItsLive={false}
					isLastSegment={false}
				/>
			)
		})
	}

	render() {
		return (
			<div
				className={ClassNames('segment-timeline__zoom-area-container', {
					hidden:
						this.props.scrollLeft === 0 &&
						(this.props.showingAllSegment || this.props.timeScale === this.props.maxTimeScale) &&
						!this.props.isLiveSegment,
				})}
			>
				<div className="segment-timeline__zoom-area" onDoubleClick={(e) => this.props.onZoomDblClick(e)}>
					{/* <div className="segment-timeline__timeline">{this.renderZoomTimeline()}</div> */}
					<SegmentTimelineZoomControls
						scrollLeft={this.props.scrollLeft}
						scrollWidth={this.props.timelineWidth / this.props.timeScale}
						onScroll={this.props.onScroll}
						segmentDuration={this.getSegmentDuration()}
						liveLineHistorySize={this.props.liveLineHistorySize}
						timeScale={this.props.timeScale}
						maxTimeScale={this.props.maxTimeScale}
						onZoomChange={this.props.onZoomChange}
					/>
				</div>
			</div>
		)
	}
}

function SegmentTimelineZoomButtons(props: IProps) {
	const zoomIn = (e: React.MouseEvent<HTMLElement>) => {
		props.onZoomChange(props.timeScale * 2, e)
	}

	const zoomOut = (e: React.MouseEvent<HTMLElement>) => {
		// if the segment is live, the maxTimeScale will not be recalculated while it's being played back, because
		// that would require layout trashing the page on every timing tick. Instead, we cause the maxTimeScale to
		// be recalculated manually, when the user actually interacts with the zoom
		if (props.isLiveSegment) {
			e.persist()
			props
				.onRecalculateMaxTimeScale()
				.then((maxTimeScale) => zoomOutInner(maxTimeScale, e))
				.catch(console.error)
		} else {
			zoomOutInner(props.maxTimeScale, e)
		}
	}

	const zoomOutInner = (maxTimeScale: number, e: React.MouseEvent<HTMLElement>) => {
		const targetTimeScale = Math.max(props.timeScale * 0.5, maxTimeScale)
		props.onZoomChange(targetTimeScale, e)
		if (targetTimeScale === maxTimeScale && !props.isLiveSegment) {
			props.onScroll(0, e)
		}
	}

	const zoomNormalize = (e: React.MouseEvent<HTMLElement>) => {
		props.onShowEntireSegment && props.onShowEntireSegment(e)
		if (!props.isLiveSegment && props.scrollLeft > 0) {
			props.onScroll(0, e)
		}
	}

	return (
		<div className="segment-timeline__timeline-zoom-buttons">
			<button
				className="segment-timeline__timeline-zoom-buttons__button segment-timeline__timeline-zoom-buttons__button--out"
				onClick={zoomOut}
				disabled={props.timeScale <= props.maxTimeScale && !props.isLiveSegment}
			>
				<ZoomOutIcon />
			</button>
			<button
				className="segment-timeline__timeline-zoom-buttons__button segment-timeline__timeline-zoom-buttons__button--all"
				onClick={zoomNormalize}
			>
				<ZoomShowAll />
			</button>
			<button
				className="segment-timeline__timeline-zoom-buttons__button segment-timeline__timeline-zoom-buttons__button--in"
				onClick={zoomIn}
			>
				<ZoomInIcon />
			</button>
		</div>
	)
}

export const SEGMENT_TIMELINE_ELEMENT_ID = 'rundown__segment__'

export class SegmentTimelineClass extends React.Component<Translated<IProps>, IStateHeader> {
	static whyDidYouRender = true

	timeline: HTMLDivElement
	segmentBlock: HTMLDivElement

	private _touchSize: number = 0
	private _touchAttached: boolean = false
	private _mouseAttached: boolean = false
	private _lastClick: number = 0
	private _mouseMoved: boolean = false
	private _lastPointer:
		| {
				clientX: number
				clientY: number
		  }
		| undefined = undefined
	private static _zoomOutLatch: number | undefined = undefined
	private static _zoomOutLatchId: string | undefined = undefined

	constructor(props: Translated<IProps>) {
		super(props)
		this.state = {
			timelineWidth: 1,
			mouseGrabbed: false,
			highlight: false,
			smallParts: new Map<PartInstanceId, number>(),
		}
	}

	componentDidMount() {
		super.componentDidMount && super.componentDidMount()

		RundownViewEventBus.on(RundownViewEvents.HIGHLIGHT, this.onHighlight)
		RundownViewEventBus.on(RundownViewEvents.SEGMENT_ZOOM_ON, this.onRundownEventSegmentZoomOn)
		RundownViewEventBus.on(RundownViewEvents.SEGMENT_ZOOM_OFF, this.onRundownEventSegmentZoomOff)

		setTimeout(() => {
			// TODO: This doesn't actually handle having new parts added/removed, which should cause the segment to re-scale!
			if (this.props.onShowEntireSegment) {
				this.props.onShowEntireSegment({})
			}
		}, 10)
	}

	componentWillUnmount() {
		super.componentWillUnmount && super.componentWillUnmount()
		clearTimeout(this.highlightTimeout)

		RundownViewEventBus.off(RundownViewEvents.HIGHLIGHT, this.onHighlight)
		RundownViewEventBus.off(RundownViewEvents.SEGMENT_ZOOM_ON, this.onRundownEventSegmentZoomOn)
		RundownViewEventBus.off(RundownViewEvents.SEGMENT_ZOOM_OFF, this.onRundownEventSegmentZoomOff)
	}

	private highlightTimeout: NodeJS.Timer

	private onHighlight = (e: HighlightEvent) => {
		if (e.segmentId === this.props.segment._id && !e.partId && !e.pieceId) {
			this.setState({
				highlight: true,
			})
			clearTimeout(this.highlightTimeout)
			this.highlightTimeout = setTimeout(() => {
				this.setState({
					highlight: false,
				})
			}, 5000)
		}
	}

	setSegmentRef = (el: HTMLDivElement) => {
		this.segmentBlock = el
		if (typeof this.props.segmentRef === 'function') this.props.segmentRef(this as any, this.props.segment._id)

		if (this.segmentBlock) {
			this.segmentBlock.addEventListener('wheel', this.onTimelineWheel, { passive: false, capture: true })
		}
	}

	setTimelineRef = (el: HTMLDivElement) => {
		this.timeline = el
	}

	onTimelineResize = (size: number[]) => {
		this.setState({
			timelineWidth: size[0],
		})
	}

	onZoomNormalize = (e) => {
		if (this.props.onShowEntireSegment) {
			this.props.onShowEntireSegment(e)
		}
	}

	onTimelineTouchEnd = (e: TouchEvent) => {
		if (e.touches.length === 0) {
			document.removeEventListener('touchmove', this.onTimelineTouchMove)
			document.removeEventListener('touchend', this.onTimelineTouchEnd)
			this._touchAttached = false
		}
	}

	onTimelineTouchMove = (e: TouchEvent) => {
		if (e.touches.length === 2) {
			let newSize = e.touches[1].clientX - e.touches[0].clientX
			let prop = newSize / this._touchSize
			this.props.onZoomChange(Math.min(500, this.props.timeScale * prop), e)
			this._touchSize = newSize
		} else if (e.touches.length === 1 && this._lastPointer) {
			let scrollAmount = this._lastPointer.clientX - e.touches[0].clientX
			this.props.onScroll(Math.max(0, this.props.scrollLeft + scrollAmount / this.props.timeScale), e)
			this._lastPointer = {
				clientX: e.touches[0].clientX,
				clientY: e.touches[0].clientY,
			}
		}
	}

	onTimelineTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
		if (e.touches.length === 2) {
			// expect two touch points
			if (!this._touchAttached) {
				document.addEventListener('touchmove', this.onTimelineTouchMove)
				document.addEventListener('touchend', this.onTimelineTouchEnd)
				this._touchAttached = true
			}
			this._touchSize = e.touches[1].clientX - e.touches[0].clientX
			e.preventDefault()
			e.stopPropagation()
		} else if (e.touches.length === 1) {
			if (!this._touchAttached) {
				document.addEventListener('touchmove', this.onTimelineTouchMove)
				document.addEventListener('touchend', this.onTimelineTouchEnd)
				this._touchAttached = true
			}
			this._lastPointer = {
				clientX: e.touches[0].clientX,
				clientY: e.touches[0].clientY,
			}
			e.preventDefault()
			e.stopPropagation()
		}
	}

	onTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!this._touchAttached && !this._mouseAttached) {
			// if mouse down is on a piece - abort
			if ((e.target as HTMLDivElement).classList.contains('segment-timeline__piece')) return
			// check that only primary button is pressed down (mask 00001b)
			if ((e.buttons & 1) !== 1) return
			e.preventDefault()

			document.addEventListener('mousemove', this.onTimelineMouseMove)
			document.addEventListener('mouseup', this.onTimelineMouseUp)
			this._mouseAttached = true
			this.setState({
				mouseGrabbed: true,
			})
			this._lastPointer = {
				clientX: e.clientX,
				clientY: e.clientY,
			}
			document.addEventListener('pointerlockchange', this.onTimelinePointerLockChange)
			document.addEventListener('pointerlockerror', this.onTimelinePointerError)
			lockPointer()
			showPointerLockCursor(this._lastPointer.clientX, this._lastPointer.clientY)
			this._mouseMoved = false
		}
	}

	onTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement> & any) => {
		let scrollAmount = e.movementX * -1 || (this._lastPointer ? this._lastPointer.clientX - e.clientX : 0)
		this.props.onScroll(Math.max(0, this.props.scrollLeft + scrollAmount / this.props.timeScale), e)
		if (e.movementX === 0) {
			this._lastPointer = {
				clientX: e.clientX,
				clientY: e.clientY,
			}
		}
		if (e.movementX !== 0 || e.movementY !== 0) {
			this._mouseMoved = true
		}
	}

	onTimelineMouseUp = (e: React.MouseEvent<HTMLDivElement> & any) => {
		document.removeEventListener('mousemove', this.onTimelineMouseMove)
		document.removeEventListener('mouseup', this.onTimelineMouseUp)
		this._mouseAttached = false
		this._lastPointer = undefined
		this.setState({
			mouseGrabbed: false,
		})
		unlockPointer()
		hidePointerLockCursor()

		const now = Date.now()
		if (!this._mouseMoved && now - this._lastClick < 500) {
			this.onTimelineDoubleClick(e)
		}
		this._lastClick = this._mouseMoved ? 0 : now
	}

	onTimelinePointerLockChange = (e: Event) => {
		if (!document.pointerLockElement) {
			hidePointerLockCursor()
			document.removeEventListener('pointerlockchange', this.onTimelinePointerLockChange)
			document.removeEventListener('pointerlockerror', this.onTimelinePointerError)
		}
	}

	onTimelinePointerError = (e: Event) => {
		hidePointerLockCursor()
		document.removeEventListener('pointerlockchange', this.onTimelinePointerLockChange)
		document.removeEventListener('pointerlockerror', this.onTimelinePointerError)
	}

	onRundownEventSegmentZoomOn = () => {
		if (this.props.isLiveSegment || (this.props.isNextSegment && this.props.playlist.currentPartInstanceId === null)) {
			this.onTimelineZoomOn()
		}
	}

	onRundownEventSegmentZoomOff = () => {
		if (this.props.isLiveSegment || (this.props.isNextSegment && this.props.playlist.currentPartInstanceId === null)) {
			this.onTimelineZoomOff()
		}
	}

	onTimelineZoomOn = () => {
		if (SegmentTimelineClass._zoomOutLatch === undefined) {
			SegmentTimelineClass._zoomOutLatch = this.props.timeScale
		}
		SegmentTimelineClass._zoomOutLatchId = this.props.id
		if (this.props.onShowEntireSegment) this.props.onShowEntireSegment(undefined)
	}

	onTimelineZoomOff = () => {
		if (SegmentTimelineClass._zoomOutLatch !== undefined) {
			this.props.onZoomChange(SegmentTimelineClass._zoomOutLatch, undefined)
		}
		SegmentTimelineClass._zoomOutLatch = undefined
		SegmentTimelineClass._zoomOutLatchId = undefined
	}

	// doubleclick is simulated by onTimelineMouseUp, because we use pointer lock and that prevents dblclick events
	onTimelineDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (SegmentTimelineClass._zoomOutLatch === undefined || SegmentTimelineClass._zoomOutLatchId !== this.props.id) {
			this.onTimelineZoomOn()
		} else {
			this.onTimelineZoomOff()
		}
	}

	onTimelineWheel = (e: WheelEvent) => {
		if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
			// ctrl + Scroll
			const nextTimeScale = Math.max(
				this.props.maxTimeScale,
				Math.min(500, this.props.timeScale * (1 + 0.001 * (e.deltaY * -1)))
			)
			if (this.timeline?.parentElement) {
				const clientPositon = this.timeline.parentElement.getBoundingClientRect()
				let zoomOffset = Math.max(0, e.clientX - clientPositon.x) / this.state.timelineWidth

				const currentlyVisibleArea = this.state.timelineWidth / this.props.timeScale
				const nextVisibleArea = this.state.timelineWidth / nextTimeScale
				const differenceOfVisibleArea = currentlyVisibleArea - nextVisibleArea

				if ((zoomOffset * this.state.timelineWidth) / this.props.timeScale > this.getSegmentDuration()) {
					zoomOffset = 0
				}

				if (differenceOfVisibleArea === 0) {
					this.props.onScroll(Math.max(0, this.props.scrollLeft + (e.deltaY * -1) / this.props.timeScale), e)
				} else {
					this.props.onScroll(Math.max(0, this.props.scrollLeft + differenceOfVisibleArea * zoomOffset), e)
				}
			}
			this.props.onZoomChange(nextTimeScale, e)
			e.preventDefault()
			e.stopPropagation()
		} else if (
			(!e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey) ||
			// @ts-ignore
			(e.ctrlKey && !e.metaKey && !e.shiftKey && e.altKey)
		) {
			// Alt + Scroll
			this.props.onScroll(Math.max(0, this.props.scrollLeft + e.deltaY / this.props.timeScale), e)
			e.preventDefault()
			e.stopPropagation()
		} else if (!e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
			// no modifier
			if (e.deltaX !== 0) {
				this.props.onScroll(Math.max(0, this.props.scrollLeft + e.deltaX / this.props.timeScale), e)
				e.preventDefault()
			}
		}
	}

	onClickPartIdent = (partId: PartId) => {
		scrollToPart(partId, false, true, true).catch((error) => {
			if (!error.toString().match(/another scroll/)) console.error(error)
		})
	}

	onPartTooSmallChanged = (part: PartUi, isTooSmall: number | false) => {
		if (isTooSmall === false) {
			if (this.state.smallParts.has(part.instance._id)) {
				this.setState((state) => {
					const smallParts = new Map(state.smallParts)
					smallParts.delete(part.instance._id)
					return {
						smallParts,
					}
				})
			}
		} else {
			if (!this.state.smallParts.has(part.instance._id)) {
				this.setState((state) => {
					const smallParts = new Map(state.smallParts)
					smallParts.set(part.instance._id, isTooSmall)
					return {
						smallParts,
					}
				})
			}
		}
	}

	getSegmentContext = (props) => {
		const ctx = literal<IContextMenuContext>({
			segment: this.props.segment,
			part: this.props.parts.find((p) => p.instance.part.isPlayable()) || null,
		})

		if (this.props.onContextMenu && typeof this.props.onContextMenu === 'function') {
			this.props.onContextMenu(ctx)
		}

		return ctx
	}

	getSegmentDuration() {
		return (this.props.parts && RundownUtils.getSegmentDuration(this.props.parts)) || 0
	}

	timelineStyle() {
		return {
			transform:
				'translate3d(-' + Math.floor(this.props.scrollLeft * this.props.timeScale).toString() + 'px, 0, 0.1px)',
			willChange: 'transform',
		}
	}

	renderLiveLine() {
		const { t } = this.props

		if (this.props.isLiveSegment) {
			const historyTimeDuration = this.props.liveLineHistorySize / this.props.timeScale

			let pixelPostion = Math.floor(
				this.props.livePosition * this.props.timeScale -
					(!this.props.followLiveLine ? this.props.scrollLeft * this.props.timeScale : 0)
			)
			let lineStyle = {
				left:
					(this.props.followLiveLine
						? // if the livePostion is greater than historyTimeDuration and followLiveLine is on
						  // we always lock the onAirLine in place at liveLineHistorySize, so we can just return
						  // a fixed value here
						  this.props.livePosition > historyTimeDuration
							? this.props.liveLineHistorySize
							: Math.min(pixelPostion, this.props.liveLineHistorySize).toString()
						: pixelPostion.toString()) + 'px',
			}

			return [
				<div
					className="segment-timeline__liveline-shade"
					key={this.props.segment._id + '-liveline-shade'}
					style={{
						width: lineStyle.left,
					}}
				/>,
				<div className="segment-timeline__liveline" key={this.props.segment._id + '-liveline'} style={lineStyle}>
					<div
						className="segment-timeline__liveline__label"
						onClick={(e) => this.props.onFollowLiveLine && this.props.onFollowLiveLine(true, e)}
					>
						{t('On Air')}
					</div>
					<div className="segment-timeline__liveline__timecode">
						<CurrentPartRemaining
							currentPartInstanceId={this.props.playlist.currentPartInstanceId}
							speaking={getAllowSpeaking()}
							heavyClassName="overtime"
						/>
						{this.props.autoNextPart ? (
							<div className="rundown-view__part__icon rundown-view__part__icon--auto-next"></div>
						) : (
							<div className="rundown-view__part__icon rundown-view__part__icon--next"></div>
						)}
						{this.props.playlist.holdState && this.props.playlist.holdState !== RundownHoldState.COMPLETE ? (
							<div className="segment-timeline__liveline__status segment-timeline__liveline__status--hold">
								{t('Hold')}
							</div>
						) : null}
					</div>
				</div>,
			]
		}
	}

	renderTimeline() {
		const { smallParts } = this.state
		const { t } = this.props
		let partIsLive = false
		let smallPartsAccumulator: [PartUi, number][] = []
		return this.props.parts.map((part, index) => {
			let previousPartIsLive = partIsLive
			partIsLive = part.instance._id === this.props.playlist.currentPartInstanceId
			let emitSmallPartsInFlag: [PartUi, number][] | undefined = undefined
			let emitSmallPartsInFlagAtEnd: boolean = false
			// if this is not undefined, it means that the part is on the list of small keys
			const partDuration = smallParts.get(part.instance._id)
			if (partDuration !== undefined) {
				smallPartsAccumulator.push([part, partDuration])
			}

			if (partDuration === undefined && smallPartsAccumulator.length > 0) {
				emitSmallPartsInFlag = smallPartsAccumulator
				smallPartsAccumulator = []
			} else if (
				partDuration !== undefined &&
				smallPartsAccumulator.length > 0 &&
				this.props.parts.length === index + 1
			) {
				emitSmallPartsInFlag = smallPartsAccumulator
				emitSmallPartsInFlagAtEnd = true
				smallPartsAccumulator = []
			}

			return (
				<React.Fragment key={unprotectString(part.instance._id)}>
					{emitSmallPartsInFlag && !emitSmallPartsInFlagAtEnd && (
						<SegmentTimelineSmallPartFlag
							t={t}
							parts={emitSmallPartsInFlag}
							followingPart={part}
							sourceLayers={this.props.segment.sourceLayers}
							timeScale={this.props.timeScale}
							autoNextPart={this.props.autoNextPart}
							collapsedOutputs={this.props.collapsedOutputs}
							playlist={this.props.playlist}
							studio={this.props.studio}
							segment={this.props.segment}
							liveLineHistorySize={this.props.liveLineHistorySize}
							isLastSegment={this.props.isLastSegment}
							isLastInSegment={false}
							timelineWidth={this.state.timelineWidth}
						/>
					)}
					<SegmentTimelinePart
						segment={this.props.segment}
						playlist={this.props.playlist}
						studio={this.props.studio}
						collapsedOutputs={this.props.collapsedOutputs}
						scrollLeft={this.props.scrollLeft}
						timeScale={this.props.timeScale}
						autoNextPart={this.props.autoNextPart}
						followLiveLine={this.props.followLiveLine}
						liveLineHistorySize={this.props.liveLineHistorySize}
						livePosition={this.props.livePosition}
						onScroll={this.props.onScroll}
						onCollapseOutputToggle={this.props.onCollapseOutputToggle}
						onFollowLiveLine={this.props.onFollowLiveLine}
						onContextMenu={this.props.onContextMenu}
						relative={false}
						onPieceClick={this.props.onItemClick}
						onPieceDoubleClick={this.props.onItemDoubleClick}
						onPartTooSmallChanged={this.onPartTooSmallChanged}
						scrollWidth={this.state.timelineWidth / this.props.timeScale}
						firstPartInSegment={this.props.parts[0]}
						isLastSegment={this.props.isLastSegment}
						isLastInSegment={index === this.props.parts.length - 1}
						isAfterLastValidInSegmentAndItsLive={
							index === (this.props.lastValidPartIndex || 0) + 1 &&
							previousPartIsLive &&
							!!this.props.playlist.nextPartInstanceId
						}
						part={part}
					/>
					{emitSmallPartsInFlag && emitSmallPartsInFlagAtEnd && (
						<SegmentTimelineSmallPartFlag
							t={t}
							parts={emitSmallPartsInFlag}
							followingPart={undefined}
							sourceLayers={this.props.segment.sourceLayers}
							timeScale={this.props.timeScale}
							autoNextPart={this.props.autoNextPart}
							collapsedOutputs={this.props.collapsedOutputs}
							playlist={this.props.playlist}
							studio={this.props.studio}
							segment={this.props.segment}
							liveLineHistorySize={this.props.liveLineHistorySize}
							isLastSegment={this.props.isLastSegment}
							isLastInSegment={true}
							timelineWidth={this.state.timelineWidth}
						/>
					)}
				</React.Fragment>
			)
		})
	}

	renderEndOfSegment() {
		return <div className="segment-timeline__part segment-timeline__part--end-of-segment"></div>
	}

	renderOutputLayerControls() {
		if (this.props.segment.outputLayers !== undefined) {
			const showHiddenSourceLayers = getShowHiddenSourceLayers()

			return Object.values(this.props.segment.outputLayers)
				.sort((a, b) => {
					return a._rank - b._rank
				})
				.map((outputLayer) => {
					if (outputLayer.used) {
						const isCollapsable =
							outputLayer.sourceLayers !== undefined && outputLayer.sourceLayers.length > 1 && !outputLayer.isFlattened
						return (
							<div
								key={outputLayer._id}
								className={ClassNames('segment-timeline__output-layer-control', {
									collapsable: isCollapsable,
									collapsed:
										this.props.collapsedOutputs[outputLayer._id] !== undefined
											? this.props.collapsedOutputs[outputLayer._id] === true
											: outputLayer.isDefaultCollapsed,
								})}
							>
								<div
									className="segment-timeline__output-layer-control__label"
									data-output-id={outputLayer._id}
									tabIndex={0}
									onClick={(e) =>
										isCollapsable &&
										this.props.onCollapseOutputToggle &&
										this.props.onCollapseOutputToggle(outputLayer, e)
									}
								>
									{outputLayer.name}
								</div>
								{outputLayer.sourceLayers !== undefined &&
									(!outputLayer.isFlattened ? (
										outputLayer.sourceLayers
											.filter((i) => showHiddenSourceLayers || !i.isHidden)
											.sort((a, b) => a._rank - b._rank)
											.map((sourceLayer, index, array) => {
												return (
													<div
														key={sourceLayer._id}
														className="segment-timeline__output-layer-control__layer"
														data-source-id={sourceLayer._id}
													>
														{array.length === 1 || sourceLayer.name === outputLayer.name ? '\xa0' : sourceLayer.name}
													</div>
												)
											})
									) : (
										<div
											key={outputLayer._id + '_flattened'}
											className="segment-timeline__output-layer-control__layer"
											data-source-id={outputLayer.sourceLayers.map((i) => i._id).join(',')}
										>
											&nbsp;
										</div>
									))}
							</div>
						)
					}
				})
		}
	}

	render() {
		let notes: Array<SegmentNote> = this.props.segmentNotes

		const { t } = this.props

		const criticalNotes = notes.reduce((prev, item) => {
			if (item.type === NoteType.ERROR) return ++prev
			return prev
		}, 0)
		const warningNotes = notes.reduce((prev, item) => {
			if (item.type === NoteType.WARNING) return ++prev
			return prev
		}, 0)

		const identifiers: Array<{ partId: PartId; ident?: string }> = this.props.parts
			.map((p) =>
				p.instance.part.identifier
					? {
							partId: p.partId,
							ident: p.instance.part.identifier,
					  }
					: null
			)
			.filter((entry) => entry !== null) as Array<{ partId: PartId; ident?: string }>

		let countdownToPartId: PartId | undefined = undefined
		if (!this.props.isLiveSegment) {
			const nextPart = this.props.isNextSegment
				? this.props.parts.find((p) => p.instance._id === this.props.playlist.nextPartInstanceId)
				: this.props.parts[0]

			if (nextPart) {
				countdownToPartId = nextPart.instance.part._id
			}
		}

		return (
			<div
				id={this.props.id}
				className={ClassNames('segment-timeline', {
					live: this.props.isLiveSegment,
					next: !this.props.isLiveSegment && this.props.isNextSegment,
					queued: this.props.isQueuedSegment,

					'has-played':
						this.props.hasAlreadyPlayed &&
						!this.props.isLiveSegment &&
						!this.props.isNextSegment &&
						!this.props.hasGuestItems &&
						!this.props.hasRemoteItems,

					'has-guest-items': this.props.hasGuestItems,
					'has-remote-items': this.props.hasRemoteItems,
					'has-identifiers': identifiers.length > 0,
					'invert-flash': this.state.highlight,
				})}
				data-obj-id={this.props.segment._id}
				ref={this.setSegmentRef}
			>
				<ContextMenuTrigger
					id="segment-timeline-context-menu"
					collect={this.getSegmentContext}
					attributes={{
						className: 'segment-timeline__title',
					}}
					holdToDisplay={contextMenuHoldToDisplayTime()}
					renderTag="div"
				>
					<h2
						className={'segment-timeline__title__label' + (this.props.segment.identifier ? ' identifier' : '')}
						data-identifier={this.props.segment.identifier}
					>
						{this.props.segment.name}
					</h2>
					{(criticalNotes > 0 || warningNotes > 0) && (
						<div className="segment-timeline__title__notes">
							{criticalNotes > 0 && (
								<div
									className="segment-timeline__title__notes__note segment-timeline__title__notes__note--critical"
									onClick={(e) =>
										this.props.onHeaderNoteClick && this.props.onHeaderNoteClick(this.props.segment._id, NoteType.ERROR)
									}
								>
									<CriticalIconSmall />
									<div className="segment-timeline__title__notes__count">{criticalNotes}</div>
								</div>
							)}
							{warningNotes > 0 && (
								<div
									className="segment-timeline__title__notes__note segment-timeline__title__notes__note--warning"
									onClick={(e) =>
										this.props.onHeaderNoteClick &&
										this.props.onHeaderNoteClick(this.props.segment._id, NoteType.WARNING)
									}
								>
									<WarningIconSmall />
									<div className="segment-timeline__title__notes__count">{warningNotes}</div>
								</div>
							)}
						</div>
					)}
					{identifiers.length > 0 && (
						<div className="segment-timeline__part-identifiers">
							{identifiers.map((ident) => (
								<div
									className="segment-timeline__part-identifiers__identifier"
									key={ident.partId + ''}
									onClick={() => this.onClickPartIdent(ident.partId)}
								>
									{ident.ident}
								</div>
							))}
						</div>
					)}
				</ContextMenuTrigger>
				<div className="segment-timeline__duration" tabIndex={0}>
					{this.props.playlist &&
						this.props.parts &&
						this.props.parts.length > 0 &&
						(!this.props.hasAlreadyPlayed || this.props.isNextSegment || this.props.isLiveSegment) && (
							<SegmentDuration
								parts={this.props.parts}
								label={<span className="segment-timeline__duration__label">{t('Duration')}</span>}
							/>
						)}
				</div>
				<div className="segment-timeline__timeUntil">
					{this.props.playlist && this.props.parts && this.props.parts.length > 0 && (
						<PartCountdown
							partId={countdownToPartId}
							hideOnZero={true}
							label={<span className="segment-timeline__timeUntil__label">{t('On Air In')}</span>}
						/>
					)}
					{Settings.preserveUnsyncedPlayingSegmentContents && this.props.segment.orphaned && (
						<span className="segment-timeline__unsynced">{t('Unsynced')}</span>
					)}
				</div>
				<div className="segment-timeline__mos-id">{this.props.segment.externalId}</div>
				<div className="segment-timeline__output-layers">{this.renderOutputLayerControls()}</div>
				<div className="segment-timeline__timeline-background" />
				<TimelineGrid {...this.props} onResize={this.onTimelineResize} />
				<div
					className={ClassNames('segment-timeline__timeline-container', {
						'segment-timeline__timeline-container--grabbable': Settings.allowGrabbingTimeline,
						'segment-timeline__timeline-container--grabbed': this.state.mouseGrabbed,
					})}
					onMouseDown={this.onTimelineMouseDown}
					onTouchStartCapture={this.onTimelineTouchStart}
				>
					<div
						className="segment-timeline__timeline"
						key={this.props.segment._id + '-timeline'}
						ref={this.setTimelineRef}
						style={this.timelineStyle()}
					>
						<ErrorBoundary>
							{this.renderTimeline()}
							{this.renderEndOfSegment()}
						</ErrorBoundary>
					</div>
					{this.renderLiveLine()}
				</div>
				<ErrorBoundary>
					<SegmentTimelineZoomButtons {...this.props} />
				</ErrorBoundary>
				<ErrorBoundary>
					<SegmentTimelineZoom
						onZoomDblClick={this.onZoomNormalize}
						timelineWidth={this.state.timelineWidth}
						{...this.props}
					/>
				</ErrorBoundary>
			</div>
		)
	}
}

export const SegmentTimeline = withTranslation()(SegmentTimelineClass)
