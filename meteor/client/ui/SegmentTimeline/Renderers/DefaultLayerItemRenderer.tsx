import * as React from 'react'
import ReactDOM from 'react-dom'
import { getElementWidth } from '../../../utils/dimensions'

import { CustomLayerItemRenderer, ICustomLayerItemProps } from './CustomLayerItemRenderer'
interface IProps extends ICustomLayerItemProps {}
interface IState {}

export class DefaultLayerItemRenderer extends CustomLayerItemRenderer<IProps, IState> {
	leftLabel: HTMLSpanElement
	rightLabel: HTMLSpanElement

	constructor(props) {
		super(props)
	}

	setLeftLabelRef = (e: HTMLSpanElement) => {
		this.leftLabel = e
	}

	setRightLabelRef = (e: HTMLSpanElement) => {
		this.rightLabel = e
	}

	componentDidMount() {
		this.updateAnchoredElsWidths()
	}

	updateAnchoredElsWidths = () => {
		const leftLabelWidth = getElementWidth(this.leftLabel)
		const rightLabelWidth = getElementWidth(this.rightLabel)

		this.setAnchoredElsWidths(leftLabelWidth, rightLabelWidth)
	}

	componentDidUpdate(prevProps: Readonly<IProps>, prevState: Readonly<IState>) {
		if (super.componentDidUpdate && typeof super.componentDidUpdate === 'function') {
			super.componentDidUpdate(prevProps, prevState)
		}

		if (this.props.piece.instance.piece.name !== prevProps.piece.instance.piece.name) {
			this.updateAnchoredElsWidths()
		}
	}

	render() {
		return (
			<React.Fragment>
				<span
					className="segment-timeline__piece__label"
					ref={this.setLeftLabelRef}
					style={this.getItemLabelOffsetLeft()}
				>
					<span className="segment-timeline__piece__label">{this.props.piece.instance.piece.name}</span>
				</span>
				<span
					className="segment-timeline__piece__label right-side"
					ref={this.setRightLabelRef}
					style={this.getItemLabelOffsetRight()}
				>
					{this.renderInfiniteIcon()}
					{this.renderOverflowTimeLabel()}
				</span>
			</React.Fragment>
		)
	}
}
