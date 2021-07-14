import * as React from 'react'
import { getElementWidth } from '../../../utils/dimensions'

import ClassNames from 'classnames'
import { CustomLayerItemRenderer, ICustomLayerItemProps } from './CustomLayerItemRenderer'

import {
	SourceLayerType,
	SplitsContent,
	SplitsContentBoxContent,
	SplitsContentBoxProperties,
} from '@sofie-automation/blueprints-integration'
import { literal } from '../../../../lib/lib'
import { RundownUtils } from '../../../lib/rundown'
import { SplitsFloatingInspector } from '../../FloatingInspectors/SplitsFloatingInspector'

export enum SplitRole {
	ART = 0,
	BOX = 1,
}

export interface SplitSubItem {
	_id: string
	type: SourceLayerType
	label: string
	// TODO: To be replaced with the structure used by the Core
	role: SplitRole
	content?: SplitsContentBoxProperties['geometry']
}

type IProps = ICustomLayerItemProps

interface IState {
	subItems: Array<SplitSubItem>
}

const DEFAULT_POSITIONS = [
	{
		x: 0.25,
		y: 0.5,
		scale: 0.5,
	},
	{
		x: 0.75,
		y: 0.5,
		scale: 0.5,
	},
]

export class SplitsSourceRenderer extends CustomLayerItemRenderer<IProps, IState> {
	leftLabel: HTMLSpanElement | null
	rightLabel: HTMLSpanElement | null

	constructor(props) {
		super(props)
		this.state = {
			subItems: [],
		}
	}

	static generateSplitSubItems(
		boxSourceConfiguration: (SplitsContentBoxContent & SplitsContentBoxProperties)[]
	): SplitSubItem[] {
		return boxSourceConfiguration.map((item, index) => {
			return literal<SplitSubItem>({
				_id: item.studioLabel + '_' + index,
				type: item.type,
				label: item.studioLabel,
				role: SplitRole.BOX,
				content: item.geometry || DEFAULT_POSITIONS[index],
			})
		})
	}

	static getDerivedStateFromProps(props: IProps): IState {
		let subItems: Array<SplitSubItem> = []
		const splitContent = props.piece.instance.piece.content as Partial<SplitsContent> | undefined
		if (splitContent && splitContent.boxSourceConfiguration) {
			subItems = SplitsSourceRenderer.generateSplitSubItems(splitContent.boxSourceConfiguration)
		}

		return {
			subItems: subItems,
		}
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
		const leftLabelWidth = this.leftLabel ? Math.max(0, getElementWidth(this.leftLabel) - 2) : 0
		const rightLabelWidth = this.rightLabel ? Math.max(0, getElementWidth(this.rightLabel) - 2) : 0

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

	renderSubItems() {
		return this.state.subItems
			.filter((i) => i.role !== SplitRole.ART)
			.reverse()
			.map((item, index, array) => {
				return (
					<div
						key={'item-' + item._id}
						className={ClassNames(
							'segment-timeline__piece__preview__item',
							RundownUtils.getSourceLayerClassName(item.type),
							{
								second: array.length > 1 && index > 0 && item.type === array[index - 1].type,
							}
						)}
					></div>
				)
			})
	}

	render() {
		const labelItems = this.props.piece.instance.piece.name.split('||')
		const begin = labelItems[0] || ''
		const end = labelItems[1] || ''

		return (
			<React.Fragment>
				<div className="segment-timeline__piece__preview">{this.renderSubItems()}</div>
				{!this.props.isTooSmallForText && (
					<>
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
							{end && <span className="segment-timeline__piece__label last-words">{end}</span>}
							{this.renderInfiniteIcon()}
							{this.renderOverflowTimeLabel()}
						</span>
					</>
				)}
				{this.props.piece.instance.piece.content ? (
					<SplitsFloatingInspector
						floatingInspectorStyle={this.getFloatingInspectorStyle()}
						content={this.props.piece.instance.piece.content as Partial<SplitsContent>}
						itemElement={this.props.itemElement}
						showMiniInspector={this.props.showMiniInspector}
						typeClass={this.props.typeClass}
					/>
				) : null}
			</React.Fragment>
		)
	}
}
