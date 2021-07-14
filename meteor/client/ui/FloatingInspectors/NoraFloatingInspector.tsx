import React, { useEffect } from 'react'
import { NoraContent } from '@sofie-automation/blueprints-integration'
import Escape from 'react-escape'

interface IPropsHeader {
	noraContent: NoraContent | undefined
	style: React.CSSProperties
	displayOn?: 'document' | 'viewport'
}

interface IStateHeader extends IPropsHeader {
	show: boolean
	flip: {
		x: boolean
		y: boolean
	}
	displayOn: 'document' | 'viewport'
}

export const NoraFloatingInspector: React.FunctionComponent<IPropsHeader> = (props: IPropsHeader) => {
	useEffect(() => {
		if (props.noraContent) {
			NoraPreviewRenderer.show(props.noraContent, props.style, props.displayOn || 'document')
		}

		return () => {
			NoraPreviewRenderer.hide()
		}
	})
	return null
}

export class NoraPreviewRenderer extends React.Component<{}, IStateHeader> {
	static _singletonRef: NoraPreviewRenderer

	iframeElement: HTMLIFrameElement

	private _intersections:
		| {
				boundingClientRect: {
					top: number
					right: number
					bottom: number
					left: number
				}
				intersectionRect: {
					top: number
					right: number
					bottom: number
					left: number
				}
		  }
		| undefined
	private _observer: IntersectionObserver | undefined

	static show(noraContent: NoraContent, style: React.CSSProperties, displayOn: 'document' | 'viewport') {
		NoraPreviewRenderer._singletonRef._show(noraContent, style, displayOn)
	}

	static hide() {
		NoraPreviewRenderer._singletonRef._hide()
	}

	constructor(props) {
		super(props)

		this.state = {
			show: false,
			noraContent: undefined,
			style: {},
			flip: {
				x: false,
				y: false,
			},
			displayOn: 'document',
		}
		NoraPreviewRenderer._singletonRef = this
	}

	private postNoraEvent(contentWindow: Window, noraContent: NoraContent) {
		contentWindow.postMessage(
			{
				event: 'nora',
				contentToShow: {
					manifest: noraContent.payload.manifest,
					template: {
						event: 'preview',
						name: noraContent.payload.template.name,
						channel: 'gfx1',
						layer: noraContent.payload.template.layer,
						system: 'html',
					},
					content: {
						...noraContent.payload.content,
						_valid: false,
					},
					timing: {
						duration: '00:05',
						in: 'auto',
						out: 'auto',
						timeIn: '00:00',
					},
					step: noraContent.payload.step,
				},
			},
			'*'
		)
	}

	private _show(noraContent: NoraContent, style: React.CSSProperties, displayOn?: 'document' | 'viewport') {
		if (JSON.stringify(this.state.noraContent) !== JSON.stringify(noraContent)) {
			if (this.iframeElement && this.iframeElement.contentWindow) {
				this.postNoraEvent(this.iframeElement.contentWindow, noraContent)
			}
		}

		let x = this.state.flip.x
		let y = this.state.flip.y

		if (this._intersections) {
			if (y && this._intersections.intersectionRect.bottom < this._intersections.boundingClientRect.bottom) {
				// flip to bottom
				y = false
			} else if (!y && this._intersections.intersectionRect.top > this._intersections.boundingClientRect.top) {
				// flip to top
				y = true
			}
			if (x && this._intersections.intersectionRect.right < this._intersections.boundingClientRect.right) {
				// flip to bottom
				x = false
			} else if (!x && this._intersections.intersectionRect.left > this._intersections.boundingClientRect.left) {
				// flip to top
				x = true
			}
		}

		this.setState({
			show: true,
			noraContent,
			style,
			flip: {
				x,
				y,
			},
			displayOn: displayOn || 'document',
		})
	}

	private _hide() {
		this.setState({
			show: false,
		})
	}

	private _setPreview = (e: HTMLIFrameElement) => {
		if (!e) return
		this.iframeElement = e
		const noraContent = this.state.noraContent
		window.onmessage = (msg) => {
			if (msg.data.source === 'nora-render') console.log(msg)
		}
		setTimeout(() => {
			if (e.contentWindow && noraContent) {
				this.postNoraEvent(e.contentWindow, noraContent)
			}
		}, 1000)

		// set up IntersectionObserver to keep the preview inside the viewport
		const options = {
			threshold: [] as number[],
		}
		for (let i = 0; i < 50; i++) {
			options.threshold.push(i / 50)
		}

		this._observer = new IntersectionObserver((entries) => {
			entries.forEach((entry) => {
				if (entry.target === e) {
					this._intersections = {
						boundingClientRect: entry.boundingClientRect,
						intersectionRect: entry.intersectionRect,
					}
				}
			})
		}, options)
		this._observer.observe(e)
	}

	componentWillUnmount() {
		if (this._observer) this._observer.disconnect()
	}

	getElStyle() {
		const style = { ...this.state.style }
		style.visibility = this.state.show ? 'visible' : 'hidden'

		if (this.state.flip.x && this.state.flip.y) {
			style.transform = 'translate(0, var(--popdown))'
		} else if (this.state.flip.x) {
			style.transform = 'translate(0, -100%)'
		} else if (this.state.flip.y) {
			style.transform = 'translate(-100%, var(--popdown))'
		}

		return style
	}

	render() {
		const stepContent = this.state.noraContent?.payload?.step
		const isMultiStep = this.state.noraContent?.payload?.step?.enabled === true

		return (
			<React.Fragment>
				<Escape to={this.state.displayOn}>
					<div
						className="segment-timeline__mini-inspector segment-timeline__mini-inspector--graphics segment-timeline__mini-inspector--graphics--preview"
						style={this.getElStyle()}
					>
						<div className="preview">
							<img width="100%" src="../images/previewBG.png" alt="" />
							<iframe
								sandbox="allow-scripts allow-same-origin"
								src={this.state.noraContent?.previewRenderer}
								ref={this._setPreview}
								width="1920"
								height="1080"
							></iframe>
						</div>
						{isMultiStep && stepContent ? (
							<div className="segment-timeline__mini-inspector--graphics--preview__step-chevron">
								{stepContent.to === 'next' ? (stepContent.from || 0) + 1 : stepContent.to || 1}
								{typeof stepContent.total === 'number' && stepContent.total > 0 ? (
									<span className="segment-timeline__mini-inspector--graphics--preview__step-chevron__total">
										/{stepContent.total}
									</span>
								) : null}
							</div>
						) : null}
					</div>
				</Escape>
			</React.Fragment>
		)
	}
}
