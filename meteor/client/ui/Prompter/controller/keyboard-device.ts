import { ControllerAbstract, LONGPRESS_TIME } from './lib'
import { PrompterViewInner, PrompterConfigMode } from '../PrompterView'

const LOCALSTORAGE_MODE = 'prompter-controller-arrowkeys'

/**
 * This class handles control of the prompter using Keyboard keys
 * Supports Up / Down arrow keys
 * Supports Left / Right arrow keys
 * Supports Page-up / Page-down keys
 */
export class KeyboardController extends ControllerAbstract {
	private _mode: Mode = Mode.NORMAL
	private _destroyed: boolean = false

	private _keyDown: { [button: string]: number } = {}

	private _prompterView: PrompterViewInner

	/** Scroll speed, in pixels per frame */
	private _maxSpeed: number = 100
	/** Scroll acceleration in pixels/frame^2 */
	private _acceleration: number = 5

	private _targetPosition: number = 0
	private _currentSpeed: number = 0
	private _currentPosition: number = 0
	private _continousScrolling: number = 0

	private _updateSpeedHandle: number | null = null

	constructor(view: PrompterViewInner) {
		super(view)

		this._prompterView = view

		// Recall mode:
		const recalledMode: string | null = localStorage.getItem(LOCALSTORAGE_MODE)
		this._mode = (recalledMode as Mode) || Mode.NORMAL
	}
	public destroy() {
		this._destroyed = true
	}
	public onKeyDown(e: KeyboardEvent) {
		if (!this._keyDown[e.code]) this._keyDown[e.code] = Date.now()

		if (this._mode === Mode.NORMAL) {
			const scrollBy = Math.round(window.innerHeight * 0.66)
			const scrollPosition = window.scrollY
			if (scrollPosition !== undefined) {
				if (e.code === 'ArrowLeft' || e.code === 'ArrowUp' || e.code === 'PageUp') {
					e.preventDefault()
					const newPosition = scrollPosition - scrollBy
					this._targetPosition =
						this._prompterView.findAnchorPosition(newPosition, scrollPosition - 10, -1) || newPosition
					this._continousScrolling = -1
					this._updateScrollPosition()
				} else if (
					e.code === 'ArrowRight' ||
					e.code === 'ArrowDown' ||
					e.code === 'Space' ||
					e.code === 'PageDown'
				) {
					e.preventDefault()

					const newPosition = scrollPosition + scrollBy
					this._targetPosition =
						this._prompterView.findAnchorPosition(scrollPosition + 10, newPosition, 1) || newPosition
					this._continousScrolling = 1
					this._updateScrollPosition()
				}
			}
		}

		this._prompterView.DEBUG_controllerState({
			source: PrompterConfigMode.KEYBOARD,
			lastSpeed: this._currentSpeed,
			lastEvent: 'keyDown: ' + e.code,
		})
	}
	public onKeyUp(e: KeyboardEvent) {
		const timeSincePress = Date.now() - this._keyDown[e.code]

		if (this._mode === Mode.NORMAL) {
			const scrollPosition = window.scrollY
			if (scrollPosition !== undefined) {
				if (
					e.code === 'ArrowLeft' || // left
					e.code === 'ArrowUp' || // up
					e.code === 'PageUp' || // page up
					e.code === 'ArrowRight' || // right
					e.code === 'ArrowDown' || // down
					e.code === 'Space' || // space
					e.code === 'PageDown' // page down
				) {
					e.preventDefault()
					this._continousScrolling = 0
					let setNewPosition = false
					if (timeSincePress > LONGPRESS_TIME) {
						setNewPosition = true
					} else {
						const dp = this._targetPosition - this._currentPosition
						if (Math.sign(this._currentSpeed) !== Math.sign(dp)) {
							// we've overshot..
							setNewPosition = true
						}
					}
					if (setNewPosition) {
						const stopAcceleration = Math.sign(this._currentSpeed) * this._acceleration
						const d = this._getDistanceToStop(this._currentSpeed, stopAcceleration)
						this._targetPosition = scrollPosition + d / 4
					}
				}
			}
		}

		this._keyDown[e.code] = 0

		this._prompterView.DEBUG_controllerState({
			source: PrompterConfigMode.KEYBOARD,
			lastSpeed: this._currentSpeed,
			lastEvent: 'keyUp: ' + e.code,
		})
	}
	public onMouseKeyDown(_e: MouseEvent) {
		// Nothing
	}
	public onMouseKeyUp(_e: MouseEvent) {
		// Nothing
	}
	public onWheel(_e: WheelEvent) {
		// Nothing
	}

	private _toggleMode() {
		this._setMode(Mode.NORMAL)
	}
	private _setMode(mode: Mode) {
		this._mode = mode
		localStorage.setItem(LOCALSTORAGE_MODE, mode)
	}
	private _getDistanceToStop(currentSpeed, stopAcceleration): number {
		if (!stopAcceleration) return 0
		const timeToStop = currentSpeed / stopAcceleration // (not in seconds, but frames!)
		if (!timeToStop) return 0
		return (stopAcceleration * Math.pow(timeToStop, 2)) / 2 + currentSpeed * timeToStop
	}
	private _getAccelerationToStopInTime(currentSpeed, normalStopAcceleration, distanceLeft): number {
		const timeToStop = currentSpeed / normalStopAcceleration // (not in seconds, but frames!)
		if (!timeToStop) return 0
		return (2 * (distanceLeft - currentSpeed * timeToStop)) / Math.pow(timeToStop, 2)
	}
	private _updateScrollPosition() {
		if (this._destroyed) return
		if (this._updateSpeedHandle !== null) return
		this._updateSpeedHandle = null

		const scrollPosition = window.scrollY
		if (scrollPosition !== undefined) {
			this._currentPosition = scrollPosition
			const dp = this._continousScrolling
				? 99999 * this._continousScrolling
				: this._targetPosition - this._currentPosition
			if (dp !== 0) {
				const acceleration = Math.sign(dp) * this._acceleration
				const stopAcceleration = Math.sign(this._currentSpeed) * this._acceleration
				const distanceToStop = this._getDistanceToStop(this._currentSpeed, stopAcceleration)
				if (Math.abs(dp) <= Math.abs(distanceToStop)) {
					// We should deccelerate

					const actualStopAcceleration = this._getAccelerationToStopInTime(
						this._currentSpeed,
						stopAcceleration,
						dp
					)
					if (Math.abs(this._currentSpeed) < Math.abs(actualStopAcceleration)) {
						this._currentSpeed = 0
					} else {
						this._currentSpeed += actualStopAcceleration
					}
				} else {
					// Can we accelerate?
					let newSpeed = this._currentSpeed + acceleration
					if (Math.abs(newSpeed) > this._maxSpeed) {
						newSpeed = Math.sign(newSpeed) * this._maxSpeed
					}
					if (newSpeed !== this._currentSpeed) {
						// Check so we won't overshoot next iteration of we do:
						const dp2 = dp - this._currentSpeed
						const distanceToStop = this._getDistanceToStop(newSpeed, stopAcceleration)
						if (Math.abs(dp2) > Math.abs(distanceToStop)) {
							// Looks good
							this._currentSpeed = newSpeed
						}
					}
				}
				const speed = Math.round(this._currentSpeed)
				if (speed === 0 && Math.abs(dp) < 100) {
					// go directly to target position:
					window.scrollBy(0, dp)
				} else {
					window.scrollBy(0, speed)
				}

				const scrollPosition = window.scrollY

				if (scrollPosition !== undefined) {
					// Reached end-of-scroll:
					if (
						Math.abs(speed) > 10 && // only check if we have a significant speed
						this._currentPosition === scrollPosition
					) {
						// We tried to move, but haven't
						// Reset target:
						this._targetPosition = scrollPosition
						this._currentSpeed = 0
					}
					this._currentPosition = scrollPosition
				}
				this._prompterView.DEBUG_controllerSpeed(speed)
				if (speed !== 0) {
					this._updateSpeedHandle = window.requestAnimationFrame(() => {
						this._updateSpeedHandle = null
						this._updateScrollPosition()
					})
				}
			}
		}
	}
}
enum Mode {
	NORMAL = 'normal',
}
