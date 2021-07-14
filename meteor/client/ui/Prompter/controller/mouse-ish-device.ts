import { ControllerAbstract, LONGPRESS_TIME } from './lib'
import { PrompterViewInner, PrompterConfigMode } from '../PrompterView'
import { NotificationCenter, Notification, NoticeLevel } from '../../../lib/notifications/notifications'

const LOCALSTORAGE_MODE = 'prompter-controller-mouseish'
/**
 * This class handles control of the prompter using a mouse-ish (or similar) device.
 * Definition of a Mouse-ish device:
 * It has a scroll-wheel and mouse-buttons
 * (and perhaps other custom-buttons / keyboard-keys as well)
 *
 * Switch Modes by pressing left & right mouse button simultaneously.
 * Mode 1 (normal scrolling):
 *    Use the scroll-wheel as you normally do to scroll the page
 * Mode 2: (speed control):
 *    Use the scroll-wheel to control the speed of scrolling
 *    Press (or hold) left mouse button to pause / continue scrolling
 *    Press and hold right mouse button to rewind
 * Mode 3 (smooth scrolling):
 *    Use the scroll-wheel as you normally do to scroll the page but the page will scroll more smoothly
 */
export class MouseIshController extends ControllerAbstract {
	private _mode: Mode = Mode.NORMAL
	private _allowModeSwitch: boolean = true
	private _destroyed: boolean = false

	private _mouseKeyDown: { [button: string]: number } = {}

	private _prompterView: PrompterViewInner

	/** scroll speed, in pixels per frame */
	private _scrollSpeedTarget: number = 4
	private _scrollSpeedCurrent: number = 0
	private _scrollingDown: boolean = false
	private _scrollingDownHold: boolean = false
	private _scrollingUp: boolean = false
	private _updateSpeedHandle: number | null = null
	private _scrollPosition: number = 0
	private _scrollRest: number = 0
	private _noMovement: number = 0

	private _scrollDownDelta: number = 0
	private _scrollDownDeltaTracker: number = 0

	private _nextPausePosition: number | null = null
	private _lastWheelTime: number = 0

	constructor(view: PrompterViewInner) {
		super(view)

		this._prompterView = view

		if (view.configOptions.controlMode !== undefined) {
			this._setMode(view.configOptions.controlMode as Mode)
			this._allowModeSwitch = false
		} else {
			// Recall mode:
			const recalledMode: string | null = localStorage.getItem(LOCALSTORAGE_MODE)
			this._setMode((recalledMode as Mode) || Mode.NORMAL)
			this._allowModeSwitch = true
		}
	}
	public destroy() {
		this._destroyed = true
	}
	public onKeyDown(e: KeyboardEvent) {
		// Nothing
		if (e.code === 'KeyP' && e.ctrlKey) {
			e.preventDefault() // Prevent print-dialogue
		} else if (e.code === 'F5') {
			e.preventDefault() // Prevent reload of page
		}
	}
	public onKeyUp(_e: KeyboardEvent) {
		// Nothing
	}
	public onMouseKeyDown(e: MouseEvent) {
		if (this._mode === Mode.SPEED) {
			if (
				e.button === 0 || // left mouse button
				e.button === 1 // middle mouse button
			) {
				e.preventDefault()
				this._scrollingDown = !this._scrollingDown
				this._scrollingDownHold = this._scrollingDown
				this._scrollingUp = false
				this.triggerStartSpeedScrolling()
			} else if (
				e.button === 2 // right mouse button
			) {
				e.preventDefault()
				this._scrollingUp = true
				this.triggerStartSpeedScrolling()
			}
		}

		this._mouseKeyDown[e.button + ''] = Date.now()
	}
	public onMouseKeyUp(e: MouseEvent) {
		const timeSincePress = Date.now() - this._mouseKeyDown[e.button + '']

		if (this._mode === Mode.SPEED) {
			if (
				e.button === 0 || // left mouse button
				e.button === 1 // middle mouse button
			) {
				e.preventDefault()
				if (timeSincePress > LONGPRESS_TIME) {
					// Long-press release => toggle
					this._scrollingDown = !this._scrollingDown
					this._scrollingDownHold = this._scrollingDown
					this.triggerStartSpeedScrolling()
				} else {
					this._scrollingDownHold = false
				}
			} else if (
				e.button === 2 // right mouse button
			) {
				e.preventDefault()
				this._scrollingUp = false
				this.triggerStartSpeedScrolling()
			}
		}
		this._mouseKeyDown[e.button + ''] = 0
	}
	public onWheel(e: WheelEvent) {
		const timeSinceLastWheel = Date.now() - this._lastWheelTime

		this._lastWheelTime = Date.now()
		if (this._mode === Mode.NORMAL) {
			// Do nothing
		} else if (this._mode === Mode.SPEED) {
			e.preventDefault()

			const delta: number = e.deltaY || 0
			let delta2: number = Math.sign(delta) * Math.sqrt(Math.abs(delta) / 150)
			if (Math.sign(this._scrollSpeedTarget) < 0) {
				// Make scrolling up faster than down
				delta2 *= 2
			}
			this._scrollSpeedTarget += delta2

			this._scrollingDown = true

			this.triggerStartSpeedScrolling()
		} else if (this._mode === Mode.SMOOTHSCROLL) {
			e.preventDefault()

			const delta: number = e.deltaY || 0

			if (delta) {
				if (Math.sign(this._scrollDownDeltaTracker) === Math.sign(delta)) {
					this._scrollDownDeltaTracker += delta
				} else {
					this._scrollDownDeltaTracker = delta
				}

				if (Math.sign(this._scrollDownDelta) === Math.sign(delta)) {
					// Continue scrolling
					this._scrollDownDelta += delta
				} else if (Math.sign(this._scrollDownDelta) !== 0) {
					if (this._scrollSpeedCurrent === 0 || Math.abs(this._scrollDownDeltaTracker) > 500) {
						// Stop
						this._scrollDownDelta = 0
					} else {
						// decrease speed
						this._scrollDownDelta += delta
					}
				} else {
					if (timeSinceLastWheel > 200) {
						// change direction
						this._scrollDownDelta = delta
					}
				}
				const scrollSpeed = Math.max(2, Math.round(Math.abs(this._scrollDownDelta) / 100) * 1)

				if (this._scrollDownDelta > 0) {
					this._scrollSpeedTarget = scrollSpeed
					this._scrollingDown = true
					this._scrollingUp = false
				} else if (this._scrollDownDelta < 0) {
					this._scrollSpeedTarget = scrollSpeed
					this._scrollingDown = false
					this._scrollingUp = true
				} else {
					this._scrollingDown = false
					this._scrollingUp = false
				}
			}
			this.triggerStartSpeedScrolling()
		}

		this._prompterView.DEBUG_controllerState({
			source: PrompterConfigMode.MOUSE,
			lastSpeed: this._scrollSpeedTarget,
			lastEvent: 'wheel: ' + e.deltaY,
		})
	}
	private triggerStartSpeedScrolling() {
		if (this._scrollingDown) {
			const scrollPosition = window.scrollY
			if (scrollPosition !== undefined) {
				this._nextPausePosition = this._prompterView.findAnchorPosition(scrollPosition + 50, -1, 1)
			}
		} else {
			this._nextPausePosition = null
		}
		this._noMovement = 0
		this._updateScrollPosition()
	}
	private _setMode(mode: Mode) {
		const { t } = this._prompterView.props

		this._mode = mode
		localStorage.setItem(LOCALSTORAGE_MODE, mode)

		NotificationCenter.push(
			new Notification(
				t('Operating Mode'),
				NoticeLevel.NOTIFICATION,
				t('Switching operating mode to {{mode}}', { mode: mode }),
				'setMode'
			)
		)
	}
	private _updateScrollPosition() {
		if (this._destroyed) return
		if (this._updateSpeedHandle !== null) return
		this._updateSpeedHandle = null
		if (this._mode !== Mode.SPEED && this._mode !== Mode.SMOOTHSCROLL) return

		let scrollPosition = window.scrollY

		if (
			scrollPosition !== undefined &&
			this._nextPausePosition &&
			this._scrollingDown &&
			!this._scrollingDownHold &&
			scrollPosition > this._nextPausePosition - 5 * this._scrollSpeedCurrent
		) {
			// stop
			this._scrollingDown = false
		}

		let targetSpeed = this._scrollSpeedTarget

		if (this._scrollingUp) {
			targetSpeed = -Math.sign(targetSpeed) * Math.max(10, Math.abs(targetSpeed) * 4)
		} else if (this._scrollingDown) {
			targetSpeed = targetSpeed * 1
		} else {
			targetSpeed = 0
		}

		let ds: number = targetSpeed - this._scrollSpeedCurrent
		if (Math.abs(this._scrollSpeedCurrent) < Math.abs(targetSpeed)) {
			// Do it quicker when accelerating, to increate perceived latency:
			ds *= 0.2
		} else {
			ds *= 0.1
		}

		if (Math.abs(ds) > 0.1) {
			this._scrollSpeedCurrent += ds
		} else {
			this._scrollSpeedCurrent = targetSpeed
		}

		let speed = Math.round(this._scrollSpeedCurrent) // round because the scrolling is only done in full pizels anyway
		if (speed < 4) {
			// save the rest, in order to scroll veeery slowly (sub-pixels)
			this._scrollRest += Math.round((this._scrollSpeedCurrent - speed) * 6) / 6 // put the rest to use later
			const speedFromRest = Math.round(this._scrollRest)
			if (speedFromRest !== 0) {
				speed += speedFromRest
				this._scrollRest -= speedFromRest
			}
		} else {
			this._scrollRest = 0
		}

		window.scrollBy(0, speed)

		scrollPosition = window.scrollY

		if (scrollPosition !== undefined) {
			// Reached end-of-scroll:
			if (
				scrollPosition < 10 && // positioned at the top
				speed < -10 && // only check if we have a significant speed
				scrollPosition >= 10 && // positioned not at the top
				speed > 10 && // only check if we have a significant speed
				this._scrollPosition === scrollPosition
			) {
				// We tried to move, but haven't
				// Reset speeds:

				if (!this._scrollingUp) {
					// don't check if we're scrolling up
					this._scrollSpeedCurrent = 0
					this._scrollSpeedTarget = 0
				}
				this._scrollDownDelta = 0
				this._scrollDownDeltaTracker = 0
			}
			this._scrollPosition = scrollPosition
		}
		if (speed === 0) {
			this._noMovement++
		} else {
			this._noMovement = 0
		}
		if (this._noMovement < 5) {
			this._prompterView.DEBUG_controllerSpeed(speed)
			this._updateSpeedHandle = window.requestAnimationFrame(() => {
				this._updateSpeedHandle = null
				this._updateScrollPosition()
			})
		}
	}
}
enum Mode {
	/** Normal scrolling */
	NORMAL = 'normal',
	/** Control the speed with the mouse wheel */
	SPEED = 'speed',
	/** Scroll the page smoothly */
	SMOOTHSCROLL = 'smoothscroll',
}
