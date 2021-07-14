import * as React from 'react'
import { getElementWidth } from '../../utils/dimensions'
import { getElementDocumentOffset } from '../../utils/positions'
import { onElementResize, offElementResize } from '../../lib/resizeObserver'
import { LeftArrow, RightArrow } from '../../lib/ui/icons/segment'
import { LIVELINE_HISTORY_SIZE } from './SegmentTimelineContainer'

interface IPropsHeader {
	scrollLeft: number
	scrollWidth: number
	segmentDuration: number
	liveLineHistorySize: number
	timeScale: number
	maxTimeScale: number
	onScroll: (scrollLeft: number, event: MouseEvent) => void
	onZoomChange: (newScale: number, event: MouseEvent) => void
}

interface IStateHeader {
	zoomAreaMoving: boolean
	zoomAreaResizeEnd: boolean
	zoomAreaResizeBegin: boolean
	smallMode: boolean
	width: number
}

export const SegmentTimelineZoomControls = class SegmentTimelineZoomControls extends React.Component<
	IPropsHeader,
	IStateHeader
> {
	parentElement: HTMLDivElement
	selAreaElement: HTMLDivElement
	parentOffsetX: number
	parentOffsetY: number
	clickOffsetX: number
	clickOffsetY: number

	private _isTouch: boolean = false
	private resizeObserver: ResizeObserver

	SMALL_WIDTH_BREAKPOINT = 25

	constructor(props) {
		super(props)

		this.state = {
			zoomAreaMoving: false,
			zoomAreaResizeEnd: false,
			zoomAreaResizeBegin: false,
			smallMode: false,
			width: 1,
		}
	}

	checkSmallMode = () => {
		const selAreaElementWidth = getElementWidth(this.selAreaElement)

		if (selAreaElementWidth && selAreaElementWidth < this.SMALL_WIDTH_BREAKPOINT) {
			this.setState({
				smallMode: true,
			})
		} else {
			this.setState({
				smallMode: false,
			})
		}
	}

	outsideZoomAreaClick = (e: Event & any) => {
		const offset = getElementDocumentOffset(this.parentElement)
		const maxScrollLeft = this.props.segmentDuration - LIVELINE_HISTORY_SIZE / this.props.timeScale
		if (offset) {
			this.parentOffsetX = offset.left
			this.parentOffsetY = offset.top
			// - (this.props.liveLineHistorySize * (this.props.segmentDuration / this.state.width))
			let seconds = ((e.clientX - this.parentOffsetX) / this.state.width) * maxScrollLeft
			seconds -= this.props.liveLineHistorySize / this.props.timeScale
			if (this.props.onScroll) {
				this.props.onScroll(Math.min(Math.max(0, seconds), maxScrollLeft), e)
			}

			e.preventDefault()
			e.stopPropagation()
		}
	}

	onElementResize = (entries: ResizeObserverEntry[]) => {
		let width: number
		if (entries && entries[0] && entries[0].contentRect) {
			width = entries[0].contentRect!.width
		} else {
			width = getElementWidth(this.parentElement)
		}

		this.setState({
			width: width || 1,
		})
		this.checkSmallMode()
	}

	zoomAreaMove = (e: Event | (TouchEvent & any)) => {
		let delta = 0

		const maxScrollLeft = this.props.segmentDuration - LIVELINE_HISTORY_SIZE / this.props.timeScale

		if (this._isTouch) {
			const et = e as TouchEvent
			if (et.touches.length === 1) {
				delta = (et.touches[0].clientX - this.clickOffsetX) / this.state.width
				this.clickOffsetX = et.touches[0].clientX
			} else {
				this.zoomAreaEndMove(e) // cancel move if more touches than one
				return
			}
		} else {
			delta = (e.clientX - this.clickOffsetX) / this.state.width
			this.clickOffsetX = e.clientX
		}
		if (this.props.onScroll) {
			this.props.onScroll(Math.max(0, this.props.scrollLeft + delta * maxScrollLeft), e)
		}
	}

	zoomAreaEndMove(_e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) {
		if (!this._isTouch) {
			document.removeEventListener('mousemove', this.zoomAreaMove)
		} else {
			document.removeEventListener('touchmove', this.zoomAreaMove)
		}

		this.setState({
			zoomAreaMoving: false,
		})
		this.checkSmallMode()
	}

	zoomAreaBeginMove(e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>, isTouch?: boolean) {
		this._isTouch = !!isTouch
		let clientX = 0
		let clientY = 0

		if (!this._isTouch) {
			document.addEventListener('mousemove', this.zoomAreaMove)
			document.addEventListener(
				'mouseup',
				() => {
					this.zoomAreaEndMove(e)
				},
				{ once: true }
			)

			clientX = (e as React.MouseEvent<HTMLDivElement>).clientX
			clientY = (e as React.MouseEvent<HTMLDivElement>).clientY
		} else {
			const et = e as React.TouchEvent<HTMLDivElement>
			if (et.touches.length === 1) {
				document.addEventListener('touchmove', this.zoomAreaMove)
				document.addEventListener('touchend', () => {
					this.zoomAreaEndMove(e)
				})

				clientX = et.touches[0].clientX
				clientY = et.touches[0].clientY
			} else {
				return
			}
		}

		const offset = getElementDocumentOffset(this.parentElement)
		const selAreaOffset = getElementDocumentOffset(this.selAreaElement)

		if (offset && selAreaOffset) {
			this.parentOffsetX = offset.left
			this.parentOffsetY = offset.top
			this.clickOffsetX = clientX
			this.clickOffsetY = clientY
		}
		this.setState({
			zoomAreaMoving: true,
		})
	}

	zoomAreaLeftMove = (e: Event & any) => {
		const begin = Math.max(0, Math.min(1, (e.clientX - this.parentOffsetX) / this.state.width))
		const end = (this.props.scrollLeft + this.props.scrollWidth) / this.props.segmentDuration
		const newScale = (this.props.scrollWidth / ((end - begin) * this.props.segmentDuration)) * this.props.timeScale
		if (this.props.onZoomChange) {
			this.props.onScroll(begin * this.props.segmentDuration, e)
			this.props.onZoomChange(newScale, e)
		}
	}

	zoomAreaEndLeftMove(_e: React.SyntheticEvent<HTMLDivElement>) {
		document.removeEventListener('mousemove', this.zoomAreaLeftMove)
		this.setState({
			zoomAreaResizeBegin: false,
		})
		this.checkSmallMode()
	}

	zoomAreaLeftBeginMove(e: Event & any) {
		e.preventDefault()
		e.stopPropagation()

		document.addEventListener('mousemove', this.zoomAreaLeftMove)
		document.addEventListener(
			'mouseup',
			() => {
				this.zoomAreaEndLeftMove(e)
			},
			{ once: true }
		)

		const offset = getElementDocumentOffset(this.parentElement)
		if (offset) {
			this.parentOffsetX = offset.left
			this.parentOffsetY = offset.top
		}
		this.setState({
			zoomAreaResizeBegin: true,
		})
	}

	zoomAreaEndRightMove(_e: React.SyntheticEvent<HTMLDivElement>) {
		document.removeEventListener('mousemove', this.zoomAreaRightMove)
		this.setState({
			zoomAreaResizeEnd: false,
		})
		this.checkSmallMode()
	}

	zoomAreaRightMove = (e: Event & any) => {
		const end = Math.max(0, Math.min(1, (e.clientX - this.parentOffsetX) / this.state.width))
		const begin = this.props.scrollLeft / this.props.segmentDuration
		const newScale = (this.props.scrollWidth / ((end - begin) * this.props.segmentDuration)) * this.props.timeScale
		if (this.props.onZoomChange) {
			this.props.onZoomChange(newScale, e)
		}
	}

	zoomAreaRightBeginMove(e: Event & any) {
		e.preventDefault()
		e.stopPropagation()

		document.addEventListener('mousemove', this.zoomAreaRightMove)
		document.addEventListener(
			'mouseup',
			() => {
				this.zoomAreaEndRightMove(e)
			},
			{ once: true }
		)

		const offset = getElementDocumentOffset(this.parentElement)
		if (offset) {
			this.parentOffsetX = offset.left
			this.parentOffsetY = offset.top
		}
		this.setState({
			zoomAreaResizeEnd: true,
		})
	}

	setParentRef = (element: HTMLDivElement) => {
		this.parentElement = element
	}

	setSelAreaRef = (element: HTMLDivElement) => {
		this.selAreaElement = element
	}

	componentDidMount() {
		this.resizeObserver = onElementResize(this.parentElement, this.onElementResize)
		this.setState({
			width: getElementWidth(this.parentElement) || 1,
		})
	}

	componentWillUnmount() {
		offElementResize(this.resizeObserver, this.parentElement)
	}

	render() {
		const maxScrollLeft = this.props.segmentDuration - LIVELINE_HISTORY_SIZE / this.props.timeScale
		return (
			<div className="segment-timeline__zoom-area__controls" ref={this.setParentRef}>
				<div
					className="segment-timeline__zoom-area__controls__left-mask"
					style={{
						width: Math.min(100, Math.max(0, (this.props.scrollLeft / maxScrollLeft) * 100)).toString() + '%',
					}}
					onClick={(e) => this.outsideZoomAreaClick(e)}
				></div>
				<div
					className="segment-timeline__zoom-area__controls__right-mask"
					style={{
						width: Math.min(100, Math.max(0, (1 - this.props.scrollLeft / maxScrollLeft) * 100)).toString() + '%',
					}}
					onClick={(e) => this.outsideZoomAreaClick(e)}
				></div>
				<div
					className="segment-timeline__zoom-area__controls__selected-area"
					style={{
						left: Math.max((this.props.scrollLeft / maxScrollLeft) * 100, 0).toString() + '%',
					}}
					ref={this.setSelAreaRef}
					onMouseDown={(e) => this.zoomAreaBeginMove(e)}
					onTouchStart={(e) => this.zoomAreaBeginMove(e, true)}
				>
					<LeftArrow className="segment-timeline__zoom-area__controls__selected-area__left-arrow" />
					<div className="segment-timeline__zoom-area__controls__selected-area__center-handle"></div>
					<RightArrow className="segment-timeline__zoom-area__controls__selected-area__right-arrow" />
				</div>
			</div>
		)
	}
}
