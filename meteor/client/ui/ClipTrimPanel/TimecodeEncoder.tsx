import * as React from 'react'
import { Timecode } from 'timecode'
import * as _ from 'underscore'
import ClassNames from 'classnames'
import { faCaretUp, faCaretDown } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

export interface IProps {
	value?: number
	fps: number
	onChange?: (value: number) => void
	invalid?: boolean
}

interface IState {
	currentValue: string
	validValue: string
	hasError: boolean
	isEdited: boolean
}

export class TimecodeEncoder extends React.Component<IProps, IState> {
	constructor(props: IProps) {
		super(props)

		this.state = {
			currentValue: TimecodeEncoder.secondsToTimecode(props.value || 0, props.fps),
			validValue: TimecodeEncoder.secondsToTimecode(props.value || 0, props.fps),
			hasError: false,
			isEdited: false,
		}
	}

	static getDerivedStateFromProps(props: IProps, state: IState): Partial<IState> {
		const newValid = TimecodeEncoder.secondsToTimecode(props.value || 0, props.fps)
		return _.extend(
			{
				validValue: newValid,
			},
			state.isEdited
				? {}
				: {
						currentValue: TimecodeEncoder.secondsToTimecode(props.value || 0, props.fps),
				  },
			state.validValue !== newValid
				? {
						hasError: false,
				  }
				: {}
		)
	}

	private static secondsToTimecode(time: number, fps: number): string {
		return Timecode.init({ framerate: fps.toString(), timecode: time, drop_frame: !Number.isInteger(fps) }).toString()
	}

	validate(): null | number {
		const p = /^[0-9]{2}\:[0-9]{2}\:[0-9]{2}[\:\;][0-9]{2}$/
		const match = p.exec(this.state.currentValue)
		if (!match) return null
		const t = Timecode.init({
			framerate: this.props.fps.toString(),
			timecode: this.state.currentValue,
			drop_frame: !Number.isInteger(this.props.fps),
		})
		return t.frame_count
	}

	triggerChange = (input: string | number) => {
		const valid = Timecode.init({
			framerate: this.props.fps.toString(),
			timecode: input,
			drop_frame: !Number.isInteger(this.props.fps),
		})
		if (this.props.onChange) this.props.onChange(valid.frame_count)
	}

	handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		this.setState({
			currentValue: e.target.value,
		})
	}

	handleFocus = (_e: React.FocusEvent<HTMLInputElement>) => {
		this.setState({
			isEdited: true,
		})
	}

	handleBlur = (_e: React.FocusEvent<HTMLInputElement>) => {
		const input = this.validate()
		if (input !== null) {
			const valid = Timecode.init({
				framerate: this.props.fps.toString(),
				timecode: input,
				drop_frame: !Number.isInteger(this.props.fps),
			})
			const validStr = valid.toString()
			this.setState({
				hasError: false,
				currentValue: validStr,
				validValue: validStr,
				isEdited: false,
			})
			this.triggerChange(valid.frame_count)
		} else {
			this.setState({
				hasError: true,
				currentValue: this.state.validValue,
				isEdited: false,
			})
		}
	}

	add = (timecode: string) => {
		const t = Timecode.init({
			framerate: this.props.fps.toString(),
			timecode: this.state.validValue,
			drop_frame: !Number.isInteger(this.props.fps),
		})
		t.add(timecode)
		const ts = t.toString()
		this.setState({
			currentValue: ts,
			validValue: ts,
			hasError: false,
		})
		this.triggerChange(t.frame_count)
	}

	substract = (timecode: string) => {
		const t = Timecode.init({
			framerate: this.props.fps.toString(),
			timecode: this.state.validValue,
			drop_frame: !Number.isInteger(this.props.fps),
		})
		t.subtract(timecode)
		if (t.frame_count < 0) {
			t.set(0)
		}
		const ts = t.toString()
		this.setState({
			currentValue: ts,
			validValue: ts,
			hasError: false,
		})
		this.triggerChange(t.frame_count)
	}

	render() {
		return (
			<div
				className={ClassNames('timecode-encoder', {
					error: this.state.hasError || this.props.invalid,
				})}
			>
				<div className="timecode-encoder__top-buttons">
					<button onClick={() => this.add('01:00:00:00')}>
						<FontAwesomeIcon icon={faCaretUp} />
					</button>
					<button onClick={() => this.add('00:01:00:00')}>
						<FontAwesomeIcon icon={faCaretUp} />
					</button>
					<button onClick={() => this.add('00:00:01:00')}>
						<FontAwesomeIcon icon={faCaretUp} />
					</button>
					<button onClick={() => this.add('00:00:00:01')}>
						<FontAwesomeIcon icon={faCaretUp} />
					</button>
				</div>
				<input
					type="text"
					value={this.state.currentValue}
					pattern="[0-9]{2}:[0-9]{2}:[0-9]{2}[:;][0-9]{2}"
					onChange={this.handleChange}
					onBlur={this.handleBlur}
					onFocus={this.handleFocus}
				/>
				<div className="timecode-encoder__bottom-buttons">
					<button onClick={() => this.substract('01:00:00:00')}>
						<FontAwesomeIcon icon={faCaretDown} />
					</button>
					<button onClick={() => this.substract('00:01:00:00')}>
						<FontAwesomeIcon icon={faCaretDown} />
					</button>
					<button onClick={() => this.substract('00:00:01:00')}>
						<FontAwesomeIcon icon={faCaretDown} />
					</button>
					<button onClick={() => this.substract('00:00:00:01')}>
						<FontAwesomeIcon icon={faCaretDown} />
					</button>
				</div>
			</div>
		)
	}
}
