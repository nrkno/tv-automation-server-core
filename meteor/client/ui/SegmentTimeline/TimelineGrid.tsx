import * as React from 'react'
import * as _ from 'underscore'

import { RundownUtils } from '../../lib/rundown'

import { Settings } from '../../../lib/Settings'
import { getElementWidth, getElementHeight } from '../../utils/dimensions'
import { onElementResize, offElementResize } from '../../lib/resizeObserver'

// We're cheating a little: Fontface
declare class FontFace {
	loaded: Promise<FontFace>
	constructor(font: string, url: string, options: object)

	load(): void
}

const LABEL_FONT_URL = 'url("/fonts/roboto-gh-pages/fonts/Light/Roboto-Light.woff")'
const LABEL_COLOR = 'rgb(175,175,175)'
const SHORT_LINE_GRID_COLOR = 'rgb(112,112,112)'
const LONG_LINE_GRID_COLOR = 'rgb(112,112,112)'

const FONT_SIZE = 15
const LABEL_TOP = 18
const LONG_LINE_TOP = 25
const LONG_LINE_HEIGHT = 0
const SHORT_LINE_TOP = 30
const SHORT_LINE_HEIGHT = 6

interface ITimelineGridProps {
	timeScale: number
	scrollLeft: number
	onResize: (size: number[]) => void
}

let gridFont: any | undefined = undefined
let gridFontAvailable: boolean = false

export class TimelineGrid extends React.Component<ITimelineGridProps> {
	canvasElement: HTMLCanvasElement | null
	parentElement: HTMLDivElement | null
	ctx: CanvasRenderingContext2D | null

	width: number
	height: number
	pixelRatio: number
	scheduledRepaint?: number | null

	private _resizeObserver: ResizeObserver

	fontSize: number = FONT_SIZE
	labelTop: number = LABEL_TOP
	longLineTop: number = LONG_LINE_TOP
	longLineHeight: number = LONG_LINE_HEIGHT
	shortLineTop: number = SHORT_LINE_TOP
	shortLineHeight: number = SHORT_LINE_HEIGHT

	labelColor: string = LABEL_COLOR
	shortLineColor: string = SHORT_LINE_GRID_COLOR
	longLineColor: string = LONG_LINE_GRID_COLOR

	contextResize = _.throttle((parentElementWidth: number, parentElementHeight: number) => {
		if (this.ctx && this.canvasElement) {
			let devicePixelRatio = window.devicePixelRatio || 1

			let backingStoreRatio =
				(this.ctx as any).webkitBackingStorePixelRatio ||
				(this.ctx as any).mozBackingStorePixelRatio ||
				(this.ctx as any).msBackingStorePixelRatio ||
				(this.ctx as any).oBackingStorePixelRatio ||
				(this.ctx as any).backingStorePixelRatio ||
				1

			this.pixelRatio = devicePixelRatio / backingStoreRatio

			this.width = (parentElementWidth || 0) * this.pixelRatio
			this.height = (parentElementHeight || 0) * this.pixelRatio
			this.canvasElement.width = this.width
			this.canvasElement.height = this.height

			this.repaint()
		}
		if (this.props.onResize) {
			this.props.onResize([parentElementWidth || 1, parentElementHeight || 1])
		}
	}, Math.ceil(1000 / 15)) // don't repaint faster than 15 fps

	setParentRef = (element: HTMLDivElement) => {
		this.parentElement = element
	}

	setCanvasRef = (element: HTMLCanvasElement) => {
		this.canvasElement = element

		if (this.canvasElement) {
			const style = getComputedStyle(this.canvasElement)

			this.fontSize = parseFloat(style.fontSize || FONT_SIZE.toString())
			this.labelTop = parseFloat(style.getPropertyValue('--timeline-grid-label-top') || LABEL_TOP.toString())

			this.labelColor = style.color || LABEL_COLOR
			this.longLineColor = style.getPropertyValue('--timeline-grid-long-line-color') || LONG_LINE_GRID_COLOR
			this.shortLineColor = style.getPropertyValue('--timeline-grid-short-line-color') || SHORT_LINE_GRID_COLOR

			this.longLineTop = parseFloat(style.getPropertyValue('--timeline-grid-long-line-top') || LONG_LINE_TOP.toString())
			this.longLineHeight = parseFloat(
				style.getPropertyValue('--timeline-grid-long-line-height') || LONG_LINE_HEIGHT.toString()
			)
			this.shortLineTop = parseFloat(
				style.getPropertyValue('--timeline-grid-short-line-top') || SHORT_LINE_TOP.toString()
			)
			this.shortLineHeight = parseFloat(
				style.getPropertyValue('--timeline-grid-short-line-height') || SHORT_LINE_HEIGHT.toString()
			)
		}
	}

	onCanvasResize = (entries: ResizeObserverEntry[]) => {
		let box: DOMRectReadOnly | undefined

		if (
			entries &&
			entries.length &&
			entries[0].contentBoxSize !== undefined &&
			entries[0].contentBoxSize!.width !== undefined
		) {
			box = entries[0].contentBoxSize
		} else if (
			entries &&
			entries.length &&
			entries[0].contentRect !== undefined &&
			entries[0].contentRect!.width !== undefined
		) {
			box = entries[0].contentRect
		}

		if (box && box.width !== undefined) {
			this.contextResize(box.width, box.height)
		} else if (this.parentElement) {
			this.contextResize(getElementWidth(this.parentElement), getElementHeight(this.parentElement))
		}
	}

	ring(value, ringMax) {
		return value < 0 ? ringMax + (value % ringMax) : value % ringMax
	}

	requestRepaint = () => {
		if (this.scheduledRepaint) {
			window.cancelAnimationFrame(this.scheduledRepaint)
		}
		this.scheduledRepaint = window.requestAnimationFrame(() => {
			this.scheduledRepaint = null
			this.repaint()
		})
	}

	clearRound = (a: number) => {
		return Math.floor(a * 1000) / 1000
	}

	repaint = () => {
		if (this.ctx) {
			this.ctx.lineCap = 'butt'
			this.ctx.lineWidth = 1
			this.ctx.font = (15 * this.pixelRatio).toString() + 'px GridTimecodeFont, Roboto, Arial, sans-serif'
			this.ctx.fillStyle = this.labelColor

			const fps = Settings.frameRate

			const secondTimeScale = this.props.timeScale * 1000

			// timeScale is how many pixels does a second take
			// secondsStep - draw the big, labeled line very X seconds
			let secondsStep = 5 * 60
			// interStep - draw X lines between every big line
			let interStep = 5
			if (secondTimeScale > 0 && secondTimeScale < 0.04) {
				secondsStep = 4 * 3600
				interStep = 10
			} else if (secondTimeScale > 0.04 && secondTimeScale < 0.1) {
				secondsStep = 3600
				interStep = 10
			} else if (secondTimeScale >= 0.1 && secondTimeScale < 0.5) {
				secondsStep = 600
				interStep = 10
			} else if (secondTimeScale >= 0.5 && secondTimeScale < 1) {
				secondsStep = 600
				interStep = 60
			} else if (secondTimeScale >= 1 && secondTimeScale < 3) {
				secondsStep = 300
				interStep = 10
			} else if (secondTimeScale >= 3 && secondTimeScale < 10) {
				secondsStep = 30
				interStep = 10
			} else if (secondTimeScale >= 10 && secondTimeScale < 20) {
				secondsStep = 10
				interStep = 10
			} else if (secondTimeScale >= 20 && secondTimeScale < 45) {
				secondsStep = 5
				interStep = 5
			} else if (secondTimeScale >= 45 && secondTimeScale < 90) {
				secondsStep = 2
				interStep = 2
			} else if (secondTimeScale >= 90 && secondTimeScale < 120) {
				secondsStep = 2
				interStep = 1
			} else if (secondTimeScale >= 120 && secondTimeScale < 250) {
				secondsStep = 1
				interStep = 1
			} else if (secondTimeScale >= 250) {
				secondsStep = 1
				interStep = fps || 25
			}

			let step = (secondsStep * secondTimeScale * this.pixelRatio) / interStep
			let pixelOffset = this.props.scrollLeft * this.props.timeScale * this.pixelRatio

			this.ctx.clearRect(0, 0, this.width, this.height)

			// We want to ensure that we draw at least n+1 (where n is the amount of ticks fitting on the display)
			// "large" ticks (one's with label), so we divide the display width by the amount of large steps (step / interStep)
			// and then after getting the ceil of the value, multiply it back for all the inter-steps,
			// beacuse we do the paint iteration for every line
			let maxTicks = Math.ceil(this.width / (step * interStep)) * interStep + interStep

			// We store the x-position of the 0-th line to know if a particular section is N or N+1
			// and switch between base and baseN
			let breakX = 0

			// Go up to (width / step) + 1, to allow for the grid line + text, dissapearing on the left
			// in effect, we are rendering +1 grid lines than there should fit inside the area
			let i = 0
			for (i = 0; i < maxTicks; i++) {
				// we should offset the first step -1, as this is the one that will be dissaperaing as the
				// timeline is moving
				let xPosition = this.ring(i * step - pixelOffset, maxTicks * step) - step * interStep
				if (i === 0) breakX = xPosition

				let isLabel = i % interStep === 0

				if (isLabel === true) {
					let t = xPosition / this.pixelRatio / this.props.timeScale + this.props.scrollLeft

					this.ctx.fillText(
						RundownUtils.formatDiffToTimecode(t, false, false, true, false, true),
						xPosition,
						this.labelTop * this.pixelRatio
					)

					this.ctx.strokeStyle = this.longLineColor
				} else {
					this.ctx.strokeStyle = this.shortLineColor
				}

				this.ctx.beginPath()
				this.ctx.moveTo(xPosition, isLabel ? this.longLineTop * this.pixelRatio : this.shortLineTop * this.pixelRatio)
				this.ctx.lineTo(
					xPosition,
					isLabel
						? this.longLineHeight > 0
							? (this.longLineTop + this.longLineHeight) * this.pixelRatio
							: this.height
						: this.shortLineHeight > 0
						? (this.shortLineTop + this.shortLineHeight) * this.pixelRatio
						: this.height
				)
				this.ctx.stroke()
			}
		}
	}

	render() {
		return (
			<div className="segment-timeline__timeline-grid" ref={this.setParentRef}>
				<canvas className="segment-timeline__timeline-grid__canvas" ref={this.setCanvasRef}></canvas>
			</div>
		)
	}

	initialize() {
		if (this.canvasElement && this.parentElement && !this.ctx) {
			this.ctx = this.canvasElement.getContext('2d', {
				// alpha: false
			})
			if (this.ctx) {
				const parentWidth = getElementWidth(this.parentElement)
				const parentHeight = getElementHeight(this.parentElement)
				this.contextResize(parentWidth, parentHeight)

				// $(window).on('resize', this.onCanvasResize)
				this._resizeObserver = onElementResize(this.parentElement, this.onCanvasResize)

				if (!gridFont && typeof FontFace !== 'undefined') {
					gridFont = new FontFace('GridTimecodeFont', LABEL_FONT_URL, {
						style: 'normal',
						weight: 100,
					})
					gridFont.load()
					gridFont.loaded
						.then((fontFace) => {
							gridFontAvailable = true
							window.requestAnimationFrame(() => {
								this.repaint()
							})
						})
						.catch((err) => console.log(err))
					document['fonts'].add(gridFont)
				} else if (gridFont && !gridFontAvailable) {
					gridFont.loaded.then((fontFace) => {
						window.requestAnimationFrame(() => {
							this.repaint()
						})
					})
				}

				if (this.props.onResize) {
					this.props.onResize([parentWidth || 1, parentHeight || 1])
				}
			}
		}
	}

	componentDidMount() {
		if (this.canvasElement && this.parentElement && !this.ctx) {
			this.initialize()
		}
	}

	shouldComponentUpdate(nextProps, nextState) {
		if (nextProps.timeScale !== this.props.timeScale || nextProps.scrollLeft !== this.props.scrollLeft) {
			return true
		}
		return false
	}

	componentDidUpdate() {
		if (this.canvasElement && this.parentElement && !this.ctx) {
			this.initialize()
		}
		this.requestRepaint()
	}

	componentWillUnmount() {
		this._resizeObserver.disconnect()
	}
}
