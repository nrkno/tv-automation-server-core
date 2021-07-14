import { ControllerAbstract } from './lib'
import { PrompterViewInner, PrompterConfigMode } from '../PrompterView'

// const LOCALSTORAGEMODE = 'prompter-controller-arrowkeys'

/**
 * This class handles control of the prompter using Keyboard keys sent from an xkeys
 * Up: control + alt + [1-7]
 * Down: control + alt + [1-7]
 * Supports Page-up / Page-down keys for previous/next story
 */
export class ShuttleKeyboardController extends ControllerAbstract {
	private prompterView: PrompterViewInner

	private speedMap = [0, 1, 2, 3, 5, 7, 9, 30]
	private speedStepMap = ShuttleKeyboardController.makeSpeedStepMap(this.speedMap)
	private static readonly SPEEDMAPNEUTRALPOSITION = 7

	private updateSpeedHandle: number | null = null
	private lastSpeed = 0
	private lastSpeedMapPosition = ShuttleKeyboardController.SPEEDMAPNEUTRALPOSITION
	private currentPosition = 0

	constructor(view: PrompterViewInner) {
		super(view)

		this.prompterView = view
		this.speedMap = view.configOptions.shuttle_speedMap || this.speedMap
		this.speedStepMap = ShuttleKeyboardController.makeSpeedStepMap(this.speedMap)
	}
	private static makeSpeedStepMap(speedMap): number[] {
		return [
			...speedMap
				.slice(1)
				.reverse()
				.map((i) => i * -1),
			...speedMap.slice(),
		]
	}
	public destroy() {}
	public onKeyDown(e: KeyboardEvent) {
		let speed = -1
		let newSpeedStep = this.lastSpeedMapPosition
		let inverse = false

		// contour mode needs ctrl + alt + number to work
		// filter on ctrl and alt, fail early
		if (e.ctrlKey && e.altKey) {
			// pause if Digit9 (shuttle centred)
			if (e.shiftKey && e.code === 'Digit9') {
				speed = 0
			}
			switch (e.code) {
				case 'F1':
					speed = this.speedMap[1]
					break
				case 'F2':
					speed = this.speedMap[2]
					break
				case 'F3':
					speed = this.speedMap[3]
					break
				case 'F4':
					speed = this.speedMap[4]
					break
				case 'F5':
					speed = this.speedMap[5]
					break
				case 'F6':
					speed = this.speedMap[6]
					break
				case 'F7':
					speed = this.speedMap[7]
					break
			}
			switch (e.key) {
				case '-':
					newSpeedStep--
					newSpeedStep = Math.max(0, Math.min(newSpeedStep, this.speedStepMap.length - 1))
					this.lastSpeedMapPosition = newSpeedStep
					speed = this.speedStepMap[this.lastSpeedMapPosition]
					if (speed < 0) {
						inverse = true
					}
					speed = Math.abs(speed)
					break
				case '+':
					newSpeedStep++
					newSpeedStep = Math.max(0, Math.min(newSpeedStep, this.speedStepMap.length - 1))
					this.lastSpeedMapPosition = newSpeedStep
					speed = this.speedStepMap[this.lastSpeedMapPosition]
					if (speed < 0) {
						inverse = true
					}
					speed = Math.abs(speed)
					break
			}

			// buttons
			if (e.shiftKey) {
				switch (e.code) {
					case 'PageDown':
					case 'F8':
						// jump to next segment
						this.lastSpeed = 0
						this.lastSpeedMapPosition = ShuttleKeyboardController.SPEEDMAPNEUTRALPOSITION
						this.prompterView.scrollToFollowing()
						return
					case 'PageUp':
					case 'F9':
						// jump to previous segment
						this.lastSpeed = 0
						this.lastSpeedMapPosition = ShuttleKeyboardController.SPEEDMAPNEUTRALPOSITION
						this.prompterView.scrollToPrevious()
						return
					case 'F10':
						// jump to top
						this.lastSpeed = 0
						this.lastSpeedMapPosition = ShuttleKeyboardController.SPEEDMAPNEUTRALPOSITION
						window.scrollTo(0, 0)
						return
					case 'F11':
						// jump to live
						this.lastSpeed = 0
						this.lastSpeedMapPosition = ShuttleKeyboardController.SPEEDMAPNEUTRALPOSITION
						this.prompterView.scrollToLive()
						return
					case 'F12':
						// jump to next
						this.lastSpeed = 0
						this.lastSpeedMapPosition = ShuttleKeyboardController.SPEEDMAPNEUTRALPOSITION
						this.prompterView.scrollToNext()
						return
				}
			}
		}

		// return on false key events
		if (speed === -1) {
			return
		} else {
			// handle valid key inputs
			e.preventDefault()

			// reverse direction if shiftkey is pressed
			if (e.shiftKey || inverse) {
				speed *= -1
			}
		}

		// update flag for comparison on next iteration
		this.lastSpeed = speed
		this.updateScrollPosition()

		this.prompterView.DEBUG_controllerState({
			source: PrompterConfigMode.SHUTTLEKEYBOARD,
			lastSpeed: this.lastSpeed,
			lastEvent: 'keyup: ' + e.code,
		})
	}
	public onKeyUp(_e: KeyboardEvent) {
		// Nothing
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

	private updateScrollPosition() {
		if (this.updateSpeedHandle !== null) return

		// update scroll position
		window.scrollBy(0, this.lastSpeed)

		const scrollPosition = window.scrollY
		// check for reached end-of-scroll:
		if (this.currentPosition !== undefined && scrollPosition !== undefined) {
			if (this.currentPosition === scrollPosition) {
				// We tried to move, but haven't
				this.lastSpeed = 0
				this.lastSpeedMapPosition = ShuttleKeyboardController.SPEEDMAPNEUTRALPOSITION
			}
			this.currentPosition = scrollPosition
		}

		// create recursive loop
		if (this.lastSpeed !== 0) {
			this.updateSpeedHandle = window.requestAnimationFrame(() => {
				this.updateSpeedHandle = null
				this.updateScrollPosition()
			})
		}
	}
}
