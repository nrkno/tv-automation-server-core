import * as React from 'react'
import { getElementWidth } from '../../../utils/dimensions'

import { CustomLayerItemRenderer, ICustomLayerItemProps } from './CustomLayerItemRenderer'
import { NoraContent } from '@sofie-automation/blueprints-integration'
import { L3rdFloatingInspector } from '../../FloatingInspectors/L3rdFloatingInspector'

type IProps = ICustomLayerItemProps
interface IState {}
export class L3rdSourceRenderer extends CustomLayerItemRenderer<IProps, IState> {
	leftLabel: HTMLElement | null
	rightLabel: HTMLElement | null
	lastOverflowTime: boolean

	updateAnchoredElsWidths = () => {
		const leftLabelWidth = this.leftLabel ? getElementWidth(this.leftLabel) : 0
		const rightLabelWidth = this.rightLabel ? getElementWidth(this.rightLabel) : 0

		this.setAnchoredElsWidths(leftLabelWidth, rightLabelWidth)
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

	componentDidUpdate(prevProps: Readonly<IProps>, prevState: Readonly<IState>) {
		if (super.componentDidUpdate && typeof super.componentDidUpdate === 'function') {
			super.componentDidUpdate(prevProps, prevState)
		}

		const newOverflowTime = this.doesOverflowTime() > 0 ? true : false
		if (
			this.props.piece.instance.piece.name !== prevProps.piece.instance.piece.name ||
			newOverflowTime !== this.lastOverflowTime
		) {
			this.lastOverflowTime = newOverflowTime
			this.updateAnchoredElsWidths()
		}
	}

	render() {
		const innerPiece = this.props.piece.instance.piece
		const noraContent = innerPiece.content as NoraContent | undefined

		const stepContent = noraContent?.payload?.step
		const isMultiStep = stepContent?.enabled === true

		return (
			<React.Fragment>
				{!this.props.isTooSmallForText && (
					<>
						<span
							className="segment-timeline__piece__label"
							ref={this.setLeftLabelRef}
							style={this.getItemLabelOffsetLeft()}
						>
							{isMultiStep && stepContent ? (
								<span className="segment-timeline__piece__step-chevron">
									{stepContent.to === 'next' ? (stepContent.from || 0) + 1 : stepContent.to || 1}
								</span>
							) : null}
							<span className="segment-timeline__piece__label">{innerPiece.name}</span>
						</span>
						<span
							className="segment-timeline__piece__label right-side"
							ref={this.setRightLabelRef}
							style={this.getItemLabelOffsetRight()}
						>
							{this.renderInfiniteIcon()}
							{this.renderOverflowTimeLabel()}
						</span>
						{isMultiStep ? (
							<>
								<span className="segment-timeline__piece--collapsed__step-chevron"></span>
								<span className="segment-timeline__piece--decoration__step-chevron"></span>
							</>
						) : null}
					</>
				)}
				<L3rdFloatingInspector
					content={noraContent}
					itemElement={this.props.itemElement}
					piece={this.props.piece.instance.piece}
					showMiniInspector={this.props.showMiniInspector}
					floatingInspectorStyle={this.getFloatingInspectorStyle()}
					pieceRenderedDuration={this.props.piece.renderedDuration}
					pieceRenderedIn={this.props.piece.renderedInPoint}
				/>
			</React.Fragment>
		)
	}
}
