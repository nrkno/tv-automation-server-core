import * as React from 'react'
import { withTranslation } from 'react-i18next'
import { Translated } from '../../lib/ReactMeteorData/ReactMeteorData'
import ClassNames from 'classnames'

export interface IProps {
	currentTime?: number
	duration?: number
	onCurrentTimeChange?: (currentTime: number) => void
	src: string | undefined
	fps?: number
}

interface IState {
	isMouseDown: boolean
}

export const VideoEditMonitor = withTranslation()(
	class VideoEditMonitor extends React.Component<Translated<IProps>, IState> {
		private videoEl: HTMLVideoElement
		private retryCount: number = 0
		private internalTime: number = 0
		private lastPosition: number

		constructor(props: Translated<IProps>) {
			super(props)

			this.internalTime = props.currentTime || 0
			this.state = {
				isMouseDown: false,
			}
		}

		videoMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
			this.setState({
				isMouseDown: true,
			})
			window.addEventListener('mouseup', this.videoMouseUp)
			window.addEventListener('mousemove', this.videoMouseMove)
			this.lastPosition = e.pageX
		}

		videoMouseUp = (_e: MouseEvent): void => {
			this.setState({
				isMouseDown: false,
			})
			this.cleanUpListeners()
		}

		cleanUpListeners = () => {
			window.removeEventListener('mouseup', this.videoMouseUp)
			window.removeEventListener('mousemove', this.videoMouseMove)
		}

		videoMouseMove = (e: MouseEvent) => {
			if (this.state.isMouseDown && this.videoEl) {
				e.preventDefault()

				if (this.videoEl.readyState <= 2) {
					// we are moving around the video, but the player is stuck
					this.retryCount++
				} else {
					this.retryCount = 0
				}

				if (this.retryCount > 20) {
					// reset the video playback component if too many tries failed
					this.videoEl.src = this.props.src || ''
					this.retryCount = 0
				}

				const delta = (e.pageX - this.lastPosition) / Math.min(document.body.clientWidth, this.videoEl.clientWidth * 3)
				const targetTime = Math.max(
					0,
					Math.min(
						this.internalTime + (this.props.duration || this.videoEl.duration) * delta,
						(this.props.duration || this.videoEl.duration) - 0.001
					)
				)
				if (Number.isFinite(targetTime)) {
					this.videoEl.currentTime = targetTime
					this.internalTime = targetTime
					if (this.props.onCurrentTimeChange) {
						this.props.onCurrentTimeChange(this.internalTime)
					}
				}
				this.lastPosition = e.pageX
			}
		}

		handleStepBack = (_e: React.MouseEvent<HTMLButtonElement>) => {
			if (this.props.fps) {
				this.internalTime = Math.max(0, this.internalTime - 1 / this.props.fps)
				this.videoEl.currentTime = this.internalTime
				if (this.props.onCurrentTimeChange) {
					this.props.onCurrentTimeChange(this.internalTime)
				}
			}
		}

		handleFastBackward = (_e: React.MouseEvent<HTMLButtonElement>) => {
			// TODO
		}

		handlePlay = (_e: React.MouseEvent<HTMLButtonElement>) => {
			this.videoEl.play().catch(() => console.error('Could not start playback'))
		}

		handleStepForward = (_e: React.MouseEvent<HTMLButtonElement>) => {
			if (this.props.fps) {
				this.internalTime = Math.min(
					this.props.duration || this.videoEl.duration,
					this.internalTime + 1 / this.props.fps
				)
				this.videoEl.currentTime = this.internalTime
				if (this.props.onCurrentTimeChange) {
					this.props.onCurrentTimeChange(this.internalTime)
				}
			}
		}

		handleFastForward = (_e: React.MouseEvent<HTMLButtonElement>) => {
			// TODO
		}

		componentWillUnmount() {
			this.cleanUpListeners()
		}

		componentDidUpdate() {
			if (this.videoEl) {
				if (this.videoEl.src !== this.props.src) {
					this.videoEl.src = this.props.src || ''
				}
				this.videoEl.currentTime = this.props.currentTime || 0
				this.internalTime = this.props.currentTime || 0
			}
		}

		render() {
			return (
				<div className="video-edit-monitor">
					<div
						className={ClassNames('video-edit-monitor__monitor', {
							'video-edit-monitor__monitor--mouse-down': this.state.isMouseDown,
						})}
						onMouseDown={this.videoMouseDown}
					>
						<video className="video-edit-monitor__video" ref={this.setVideo}></video>
					</div>
					<div className="video-edit-monitor__waveform"></div>
					{/* <div className='video-edit-monitor__buttons'>
					{this.props.fps && <button className='video-edit-monitor__button' onClick={this.handleStepBack}><FontAwesomeIcon icon={faStepBackward} /></button>}
					<button className='video-edit-monitor__button' onClick={this.handleFastBackward}><FontAwesomeIcon icon={faFastBackward} /></button>
					<button className='video-edit-monitor__button' onClick={this.handlePlay}><FontAwesomeIcon icon={faPlay} /> 1s</button>
					{this.props.fps && <button className='video-edit-monitor__button' onClick={this.handleStepForward}><FontAwesomeIcon icon={faStepForward} /></button>}
					<button className='video-edit-monitor__button' onClick={this.handleFastForward}><FontAwesomeIcon icon={faFastForward} /></button>
				</div> */}
				</div>
			)
		}

		private setVideo = (el: HTMLVideoElement) => {
			this.videoEl = el
			if (el) {
				this.videoEl.src = this.props.src || ''
			}
		}
	}
)
