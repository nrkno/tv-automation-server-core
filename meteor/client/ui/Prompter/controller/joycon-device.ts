import { ControllerAbstract } from './lib'
import { PrompterConfigMode, PrompterViewInner } from '../PrompterView'
import Spline from 'cubic-spline'

// const LOCALSTORAGEMODE = 'prompter-controller-arrowkeys'

type JoyconMode = 'L' | 'R' | 'LR'

/**
 * This class handles control of the prompter using
 */
export class JoyConController extends ControllerAbstract {
	private prompterView: PrompterViewInner

	private invertJoystick = false // change scrolling direction for joystick
	private rangeRevMin = -1 // pedal "all back" position, the max-reverse-position
	private rangeNeutralMin = -0.25 // pedal "back" position where reverse-range transistions to the neutral range
	private rangeNeutralMax = 0.25 // pedal "front" position where scrolling starts, the 0 speed origin
	private rangeFwdMax = 1 // pedal "all front" position where scrolling is maxed out
	private speedMap = [1, 2, 3, 4, 5, 8, 12, 30]
	private reverseSpeedMap = [1, 2, 3, 4, 5, 8, 12, 30]
	private speedSpline: Spline
	private reverseSpeedSpline: Spline

	private updateSpeedHandle: number | null = null
	private deadBand = 0.25
	private currentPosition = 0
	private lastInputValue = ''
	private lastUsedJoyconIndex: number = -1
	private lastUsedJoyconId: string | null = null
	private lastUsedJoyconMode: JoyconMode | null
	private lastButtonArray: number[] = []

	constructor(view: PrompterViewInner) {
		super(view)
		this.prompterView = view

		// assigns params from URL or falls back to the default
		this.invertJoystick = view.configOptions.joycon_invertJoystick || this.invertJoystick
		this.speedMap = view.configOptions.joycon_speedMap || this.speedMap
		this.reverseSpeedMap = view.configOptions.joycon_reverseSpeedMap || this.reverseSpeedMap
		this.rangeRevMin = view.configOptions.joycon_rangeRevMin || this.rangeRevMin
		this.rangeNeutralMin = view.configOptions.joycon_rangeNeutralMin || this.rangeNeutralMin
		this.rangeNeutralMax = view.configOptions.joycon_rangeNeutralMax || this.rangeNeutralMax
		this.rangeFwdMax = view.configOptions.joycon_rangeFwdMax || this.rangeFwdMax
		this.deadBand = Math.min(Math.abs(this.rangeNeutralMin), Math.abs(this.rangeNeutralMax))

		// validate range settings, they need to be in sequence, or the logic will break
		if (this.rangeNeutralMin <= this.rangeRevMin) {
			console.error('rangeNeutralMin must be larger to rangeRevMin. Pedal control will not initialize.')
			return
		}
		if (this.rangeNeutralMax <= this.rangeNeutralMin) {
			console.error('rangeNeutralMax must be larger to rangeNeutralMin. Pedal control will not initialize')
			return
		}
		if (this.rangeFwdMax <= this.rangeNeutralMax) {
			console.error('rangeFwdMax must be larger to rangeNeutralMax. Pedal control will not initialize')
			return
		}

		// create splines, using the input speedMaps, for both the forward range, and the reverse range
		this.speedSpline = new Spline(
			this.speedMap.map(
				(y, index, array) =>
					((this.rangeFwdMax - this.rangeNeutralMax) / (array.length - 1)) * index + this.rangeNeutralMax
			),
			this.speedMap
		)
		this.reverseSpeedSpline = new Spline(
			this.reverseSpeedMap
				.reverse()
				.map(
					(y, index, array) =>
						((this.rangeNeutralMin - this.rangeRevMin) / (array.length - 1)) * index + this.rangeRevMin
				),
			this.reverseSpeedMap
		)

		window.addEventListener('gamepadconnected', this.updateScrollPosition.bind(this))
		window.addEventListener('gamepaddisconnected', this.updateScrollPosition.bind(this))
	}

	public destroy() {}
	public onKeyDown(_e: KeyboardEvent) {
		// Nothing
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

	private onButtonRelease(_button: string, _mode?: JoyconMode | null) {}
	private onButtonPressed(button: string, mode?: JoyconMode | null) {
		if (mode === 'L') {
			// Button overview JoyCon L single mode
			// Arrows: Left = '0', Down = '1', Up = '2', Right = '3'
			// Others: SL = '4', SR = '5', ZL = '6', L = '8', - = '9', Joystick = '10', Snapshot = '16'
			switch (button) {
				case '6':
					// go to air
					this.prompterView.scrollToLive()
					break
				// go to next
				case '8':
					this.prompterView.scrollToNext()
					break
				case '2':
					// go to top
					window.scrollTo(0, 0)
					break
				case '3':
					// go to following
					this.prompterView.scrollToFollowing()
					break
				case '0':
					// // go to previous
					this.prompterView.scrollToPrevious()
					break
			}
		} else if (mode === 'R') {
			// Button overview JoyCon R single mode
			// "Arrows": A = '0', X = '1', B = '2', Y = '3'
			// Others: SL = '4', SR = '5', ZR = '7', R = '8', + = '9', Joystick = '10', Home = '16'
			switch (button) {
				case '7':
					// go to air
					this.prompterView.scrollToLive()
					break
				// go to next
				case '8':
					this.prompterView.scrollToNext()
					break
				case '1':
					// go to top
					window.scrollTo(0, 0)
					break
				case '0':
					// go to following
					this.prompterView.scrollToFollowing()
					break
				case '3':
					// // go to previous
					this.prompterView.scrollToPrevious()
					break
			}
		} else if (mode === 'LR') {
			// Button overview JoyCon L+R paired mode
			// L JoyCon Arrows: B = '0', A = '1', Y = '2', X = '3'
			// L JoyCon Others: L = '4', ZL = '6', - = '8', Joystick = '10', Snapshot = '17', SL = '18', SR = '19'
			// R JoyCon "Arrows": B = '0', A = '1', Y = '2', X = '3'
			// R JoyCon Others: R = '5', ZR = '7', + = '9', Joystick = '11', Home = '16', SL = '20', SR = '21'
			switch (button) {
				case '6':
				case '7':
					// go to air
					this.prompterView.scrollToLive()
					break
				// go to next
				case '4':
				case '5':
					this.prompterView.scrollToNext()
					break
				case '12':
				case '3':
					// go to top
					window.scrollTo(0, 0)
					break
				case '15':
				case '1':
					// go to following
					this.prompterView.scrollToFollowing()
					break
				case '14':
				case '2':
					// // go to previous
					this.prompterView.scrollToPrevious()
					break
			}
		}
	}

	private getDataFromJoycons() {
		if (navigator.getGamepads) {
			const gamepads = navigator.getGamepads()
			if (!(gamepads && typeof gamepads === 'object' && gamepads.length)) return

			// try to re-use old index, if the id mathces
			const lastpad = gamepads[this.lastUsedJoyconIndex]
			if (lastpad && lastpad.connected && lastpad.id == this.lastUsedJoyconId) {
				return { axes: lastpad.axes, buttons: lastpad.buttons }
			}

			// falls back to searching for compatible gamepad
			for (const o of gamepads) {
				if (
					o &&
					o.connected &&
					o.id &&
					typeof o.id === 'string' &&
					o.id.match('STANDARD GAMEPAD Vendor: 057e')
				) {
					this.lastUsedJoyconIndex = o.index
					this.lastUsedJoyconId = o.id
					this.lastUsedJoyconMode =
						o.axes.length === 4
							? 'LR'
							: o.id.match('Product: 2006')
							? 'L'
							: o.id.match('Product: 2007')
							? 'R'
							: null // we are setting lastUsedJoyconId as a member as opposed to returning it functional-style, to avoid doing this calculation pr. tick
					// for documentation: L+R mode is also identified as Vendor: 057e Product: 200e
					return { axes: o.axes, buttons: o.buttons }
				}
			}
		}
		return false
	}

	private getActiveInputsOfJoycons(input) {
		// handle buttons
		// @todo: should this be throttled??
		const newButtons = input.buttons.map((i) => i.value)

		if (this.lastButtonArray.length) {
			for (const i in newButtons) {
				const oldBtn = this.lastButtonArray[i]
				const newBtn = newButtons[i]
				if (oldBtn === newBtn) continue

				if (!oldBtn && newBtn) {
					// press
					this.onButtonPressed(i, this.lastUsedJoyconMode)
				} else if (oldBtn && !newBtn) {
					// release
					this.onButtonRelease(i, this.lastUsedJoyconMode)
				}
			}
		}
		this.lastButtonArray = newButtons

		// hadle speed input
		if (this.lastUsedJoyconMode === 'L' || this.lastUsedJoyconMode === 'R') {
			// L or R mode
			if (Math.abs(input.axes[0]) > this.deadBand) {
				if (this.lastUsedJoyconMode === 'L') {
					return input.axes[0] * -1 // in this mode, L is "negative"
				} else if (this.lastUsedJoyconMode === 'R') {
					return input.axes[0] * 1.4 // in this mode, R is "positive"
					// factor increased by 1.4 to account for the R joystick being less sensitive than L
				}
			}
		} else if (this.lastUsedJoyconMode === 'LR') {
			// L + R mode
			// get the first one that is moving outside of the deadband, priorotizing the L controller
			if (Math.abs(input.axes[1]) > this.deadBand) {
				return input.axes[1] * -1 // in this mode, we are "negative" on both sticks....
			}
			if (Math.abs(input.axes[3]) > this.deadBand) {
				return input.axes[3] * -1.4 // in this mode, we are "negative" on both sticks....
				// factor increased by 1.4 to account for the R joystick being less sensitive than L
			}
		}

		return 0
	}

	private calculateSpeed(input) {
		const { rangeRevMin, rangeNeutralMin, rangeNeutralMax, rangeFwdMax } = this
		let inputValue = this.getActiveInputsOfJoycons(input)

		// start by clamping value to the leagal range
		inputValue = Math.min(Math.max(inputValue, rangeRevMin), rangeFwdMax) // clamps in between rangeRevMin and rangeFwdMax
		// stores only for debugging
		this.lastInputValue = inputValue.toFixed(2)

		if (inputValue >= rangeRevMin && inputValue <= rangeNeutralMin) {
			// 1) Use the reverse speed spline for the expected speed. The reverse speed is specified using positive values,
			//    so the result needs to be inversed
			if (this.invertJoystick) {
				return Math.round(this.reverseSpeedSpline.at(inputValue))
			} else {
				return Math.round(this.reverseSpeedSpline.at(inputValue)) * -1
			}
		} else if (inputValue >= rangeNeutralMin && inputValue <= rangeNeutralMax) {
			// 2) we're in the neutral zone
			return 0
		} else if (inputValue >= rangeNeutralMax && inputValue <= rangeFwdMax) {
			// 3) Use the speed spline to find the expected speed at this point
			if (this.invertJoystick) {
				return Math.round(this.speedSpline.at(inputValue)) * -1
			} else {
				return Math.round(this.speedSpline.at(inputValue))
			}
		} else {
			// 4) we should never be able to hit this due to validation above
			console.error(`Illegal input value ${inputValue}`)
			return 0
		}
	}

	private updateScrollPosition() {
		if (this.updateSpeedHandle !== null) return
		const input = this.getDataFromJoycons()
		if (!input) return

		const speed = this.calculateSpeed(input)

		// update scroll position
		window.scrollBy(0, speed)

		const scrollPosition = window.scrollY
		// check for reached end-of-scroll:
		if (this.currentPosition !== undefined && scrollPosition !== undefined) {
			if (this.currentPosition === scrollPosition) {
				// We tried to move, but haven't
				// @todo: haptic feedback
			}
		}
		this.currentPosition = scrollPosition

		// debug
		// @todo: can this be throttled?
		this.prompterView.DEBUG_controllerState({
			source: PrompterConfigMode.JOYCON,
			lastSpeed: speed,
			lastEvent: 'ControlChange: ' + this.lastInputValue,
		})

		this.updateSpeedHandle = window.requestAnimationFrame(() => {
			this.updateSpeedHandle = null
			this.updateScrollPosition()
		})
	}
}
