import * as React from 'react'

import { ScriptContent } from '@sofie-automation/blueprints-integration'
import { CustomLayerItemRenderer, ICustomLayerItemProps } from './CustomLayerItemRenderer'
import { withTranslation, WithTranslation } from 'react-i18next'
import * as _ from 'underscore'

import { getElementWidth } from '../../../utils/dimensions'
import { MicFloatingInspector } from '../../FloatingInspectors/MicFloatingInspector'
interface IProps extends ICustomLayerItemProps {}
interface IState {}

export const MicSourceRenderer = withTranslation()(
	class MicSourceRenderer extends CustomLayerItemRenderer<IProps & WithTranslation, IState> {
		itemPosition: number
		itemWidth: number
		itemElement: HTMLElement | null
		lineItem: HTMLElement
		linePosition: number
		leftLabel: HTMLSpanElement
		rightLabel: HTMLSpanElement

		readTime: number
		lastPartDuration: number

		private _lineAtEnd: boolean = false

		constructor(props: IProps & WithTranslation) {
			super(props)
		}

		repositionLine = () => {
			this.lineItem.style.left = this.linePosition + 'px'
		}

		addClassToLine = (className: string) => {
			this.lineItem.classList.add(className)
		}

		removeClassFromLine = (className: string) => {
			this.lineItem.classList.remove(className)
		}

		refreshLine = () => {
			if (this.itemElement && !this.props.relative) {
				this.itemPosition = this.itemElement.offsetLeft
				const content = this.props.piece.instance.piece.content as ScriptContent | undefined
				if (content && content.sourceDuration) {
					const scriptReadTime = content.sourceDuration * this.props.timeScale
					this.readTime = content.sourceDuration
					const positionByReadTime = this.itemPosition + scriptReadTime
					const positionByPartEnd = this.props.partDuration * this.props.timeScale

					if (
						positionByReadTime !== this.linePosition ||
						(this._lineAtEnd && positionByPartEnd !== this.lastPartDuration)
					) {
						this.linePosition = positionByReadTime
						this.lastPartDuration = positionByPartEnd
						this.repositionLine()

						if (
							!this._lineAtEnd &&
							(positionByReadTime >= positionByPartEnd || Math.abs(positionByReadTime - positionByPartEnd) <= 4)
						) {
							// difference is less than a frame
							this.addClassToLine('at-end')
							this._lineAtEnd = true
						} else if (this._lineAtEnd && positionByReadTime < positionByPartEnd) {
							this.removeClassFromLine('at-end')
							this._lineAtEnd = false
						}
					}
					this.removeClassFromLine('hidden')
				} else {
					this.addClassToLine('hidden')
				}
			}
		}

		setLeftLabelRef = (e: HTMLSpanElement) => {
			this.leftLabel = e
		}

		setRightLabelRef = (e: HTMLSpanElement) => {
			this.rightLabel = e
		}

		componentDidMount() {
			// Create line element
			this.lineItem = document.createElement('div')
			this.lineItem.classList.add('segment-timeline__piece-appendage', 'script-line', 'hidden')
			this.updateAnchoredElsWidths()
			if (this.props.itemElement) {
				this.itemElement = this.props.itemElement
				this.itemElement.parentNode &&
					this.itemElement.parentNode.parentNode &&
					this.itemElement.parentNode.parentNode.appendChild(this.lineItem)
				this.refreshLine()
			}
		}

		updateAnchoredElsWidths = () => {
			const leftLabelWidth = getElementWidth(this.leftLabel)
			const rightLabelWidth = getElementWidth(this.rightLabel)

			this.setAnchoredElsWidths(leftLabelWidth, rightLabelWidth)
		}

		componentDidUpdate(prevProps: Readonly<IProps & WithTranslation>, prevState: Readonly<IState>) {
			let _forceSizingRecheck = false

			if (super.componentDidUpdate && typeof super.componentDidUpdate === 'function') {
				super.componentDidUpdate(prevProps, prevState)
			}

			if (
				prevProps.partDuration !== this.props.partDuration ||
				prevProps.piece.renderedInPoint !== this.props.piece.renderedInPoint ||
				prevProps.piece.renderedDuration !== this.props.piece.renderedDuration ||
				!_.isEqual(prevProps.piece.instance.userDuration, this.props.piece.instance.userDuration) ||
				!_.isEqual(prevProps.piece.instance.piece.enable, this.props.piece.instance.piece.enable) ||
				prevProps.timeScale !== this.props.timeScale
			) {
				_forceSizingRecheck = true
			}

			if (
				!_forceSizingRecheck &&
				this._lineAtEnd === true &&
				(this.props.part.instance.part.expectedDuration || this.props.partDuration) * this.props.timeScale !==
					(prevProps.part.instance.part.expectedDuration || prevProps.partDuration) * prevProps.timeScale
			) {
				_forceSizingRecheck = true
			}

			// Move the line element
			if (this.itemElement !== this.props.itemElement) {
				if (this.itemElement) {
					this.lineItem.remove()
				}
				this.itemElement = this.props.itemElement
				if (this.itemElement) {
					this.itemElement.parentNode &&
						this.itemElement.parentNode.parentNode &&
						this.itemElement.parentNode.parentNode.appendChild(this.lineItem)
					_forceSizingRecheck = true
				}
			}

			const content = this.props.piece.instance.piece.content as ScriptContent | undefined
			if (content && content.sourceDuration && content.sourceDuration !== this.readTime) {
				_forceSizingRecheck = true
			}

			if (_forceSizingRecheck) {
				this.refreshLine()
			}

			if (this.props.piece.instance.piece.name !== prevProps.piece.instance.piece.name) {
				this.updateAnchoredElsWidths()
			}
		}

		componentWillUnmount() {
			// Remove the line element
			this.lineItem.remove()
		}

		render() {
			const { t } = this.props
			let labelItems = (this.props.piece.instance.piece.name || '').split('||')
			let begin = labelItems[0] || ''
			let end = labelItems[1] || ''

			// function shorten (str: string, maxLen: number, separator: string = ' ') {
			// 	if (str.length <= maxLen) return str
			// 	return str.substr(0, str.substr(0, maxLen).lastIndexOf(separator))
			// }

			const content = this.props.piece.instance.piece.content as ScriptContent | undefined

			return (
				<React.Fragment>
					<span
						className="segment-timeline__piece__label first-words overflow-label"
						ref={this.setLeftLabelRef}
						style={this.getItemLabelOffsetLeft()}
					>
						{begin}
					</span>
					<span
						className="segment-timeline__piece__label right-side"
						ref={this.setRightLabelRef}
						style={this.getItemLabelOffsetRight()}
					>
						<span className="segment-timeline__piece__label last-words">{end}</span>
						{this.renderInfiniteIcon()}
						{this.renderOverflowTimeLabel()}
					</span>
					{content && (
						<MicFloatingInspector
							content={content}
							floatingInspectorStyle={this.getFloatingInspectorStyle()}
							itemElement={this.props.itemElement}
							showMiniInspector={this.props.showMiniInspector}
							typeClass={this.props.typeClass}
						/>
					)}
				</React.Fragment>
			)
		}
	}
)
