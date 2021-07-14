import * as React from 'react'

import { ISourceLayerUi, IOutputLayerUi, PartUi, PieceUi } from '../SegmentTimelineContainer'

import { RundownUtils } from '../../../lib/rundown'
import { faCut } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { PieceLifespan, VTContent } from '@sofie-automation/blueprints-integration'
import { OffsetPosition } from '../../../utils/positions'

export interface ICustomLayerItemProps {
	mediaPreviewUrl?: string
	typeClass?: string
	layer: ISourceLayerUi
	outputLayer: IOutputLayerUi
	outputGroupCollapsed: boolean
	part: PartUi
	isLiveLine: boolean
	partStartsAt: number
	partDuration: number // 0 if unknown
	partExpectedDuration: number
	piece: PieceUi
	timeScale: number
	onFollowLiveLine?: (state: boolean, event: any) => void
	relative?: boolean
	followLiveLine: boolean
	liveLineHistorySize: number
	livePosition: number | null
	showMiniInspector: boolean
	itemElement: HTMLDivElement | null
	elementPosition: OffsetPosition
	cursorPosition: OffsetPosition
	cursorTimePosition: number
	layerIndex: number
	isTooSmallForText: boolean
	isPreview: boolean
	getItemLabelOffsetLeft?: () => React.CSSProperties
	getItemLabelOffsetRight?: () => React.CSSProperties
	getItemDuration?: (returnInfinite?: boolean) => number
	setAnchoredElsWidths?: (rightAnchoredWidth: number, leftAnchoredWidth: number) => void
}
export interface ISourceLayerItemState {}

export class CustomLayerItemRenderer<
	IProps extends ICustomLayerItemProps,
	IState extends ISourceLayerItemState
> extends React.Component<ICustomLayerItemProps & IProps, ISourceLayerItemState & IState> {
	getItemLabelOffsetLeft(): React.CSSProperties {
		if (this.props.getItemLabelOffsetLeft && typeof this.props.getItemLabelOffsetLeft === 'function') {
			return this.props.getItemLabelOffsetLeft()
		} else {
			return {}
		}
	}

	getItemLabelOffsetRight(): React.CSSProperties {
		if (this.props.getItemLabelOffsetRight && typeof this.props.getItemLabelOffsetRight === 'function') {
			return this.props.getItemLabelOffsetRight()
		} else {
			return {}
		}
	}

	getFloatingInspectorStyle(): React.CSSProperties {
		return {
			left: (this.props.elementPosition.left + this.props.cursorPosition.left).toString() + 'px',
			top: this.props.elementPosition.top + 'px',
		}
	}

	getItemDuration(returnInfinite?: boolean): number {
		if (typeof this.props.getItemDuration === 'function') {
			return this.props.getItemDuration(returnInfinite)
		}
		return this.props.partDuration
	}

	setAnchoredElsWidths(leftAnchoredWidth: number, rightAnchoredWidth: number): void {
		if (this.props.setAnchoredElsWidths && typeof this.props.setAnchoredElsWidths === 'function') {
			return this.props.setAnchoredElsWidths(leftAnchoredWidth, rightAnchoredWidth)
		}
	}

	doesOverflowTime(): number | false {
		const uiPiece = this.props.piece
		const innerPiece = uiPiece.instance.piece

		const vtContent = innerPiece.content as VTContent | undefined
		if (
			vtContent &&
			vtContent.sourceDuration &&
			(uiPiece.renderedDuration === Number.POSITIVE_INFINITY ||
				uiPiece.renderedDuration === null ||
				vtContent.sourceDuration > (uiPiece.renderedDuration || 0))
		) {
			let time = 0
			if (uiPiece.renderedDuration === Number.POSITIVE_INFINITY || uiPiece.renderedDuration === null) {
				time = (uiPiece.renderedInPoint || 0) + vtContent.sourceDuration - ((this.props.partDuration || 0) as number)
			} else {
				time = vtContent.sourceDuration - (uiPiece.renderedDuration || 0)
			}

			// only display differences greater than 1 second
			return time > 0 ? time : false
		}
		return false
	}

	renderOverflowTimeLabel() {
		const overflowTime = this.doesOverflowTime()
		if (
			overflowTime !== false &&
			(!this.props.part.instance.part.autoNext ||
				this.props.piece.instance.adLibSourceId !== undefined ||
				this.props.piece.instance.dynamicallyInserted)
		) {
			return (
				<div className="segment-timeline__piece__label label-overflow-time">
					{RundownUtils.formatDiffToTimecode(overflowTime, true, false, true)}
				</div>
			)
		}
		return null
	}

	renderInfiniteItemContentEnded() {
		const uiPiece = this.props.piece
		const innerPiece = uiPiece.instance.piece

		const vtContent = innerPiece.content as VTContent | undefined
		const seek = vtContent && vtContent.seek ? vtContent.seek : 0
		if (
			vtContent &&
			vtContent.sourceDuration !== undefined &&
			vtContent.sourceDuration !== 0 &&
			(this.props.piece.renderedInPoint || 0) + (vtContent.sourceDuration - seek) < (this.props.partDuration || 0)
		) {
			return (
				<div
					className="segment-timeline__piece__source-finished"
					style={{
						left: this.props.relative
							? (((vtContent.sourceDuration - seek) / (this.getItemDuration() || 1)) * 100).toString() + '%'
							: Math.round((vtContent.sourceDuration - seek) * this.props.timeScale).toString() + 'px',
					}}
				></div>
			)
		}
		return null
	}

	renderInfiniteIcon() {
		const uiPiece = this.props.piece
		const innerPiece = uiPiece.instance.piece

		return (innerPiece.lifespan === PieceLifespan.OutOnRundownEnd ||
			innerPiece.lifespan === PieceLifespan.OutOnShowStyleEnd) &&
			!uiPiece.instance.userDuration &&
			uiPiece.renderedDuration === null ? (
			<div className="segment-timeline__piece__label label-icon label-infinite-icon">
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="#ffff00" viewBox="0 0 8 8">
					<path
						d="M2 0c-1.31 0-2 1.01-2 2s.69 2 2 2c.79 0 1.42-.56 2-1.22.58.66 1.19 1.22 2 1.22 1.31 0 2-1.01 2-2s-.69-2-2-2c-.81 0-1.42.56-2 1.22-.58-.66-1.21-1.22-2-1.22zm0 1c.42 0 .88.47 1.34 1-.46.53-.92 1-1.34 1-.74 0-1-.54-1-1 0-.46.26-1 1-1zm4 0c.74 0 1 .54 1 1 0 .46-.26 1-1 1-.43 0-.89-.47-1.34-1 .46-.53.91-1 1.34-1z"
						transform="translate(0 2)"
					/>
				</svg>
			</div>
		) : null
	}

	renderContentTrimmed() {
		const innerPiece = this.props.piece.instance.piece
		const vtContent = innerPiece.content as VTContent | undefined

		return vtContent &&
			vtContent.editable &&
			vtContent.editable.editorialDuration !== undefined &&
			vtContent.editable.editorialDuration !== vtContent.sourceDuration ? (
			<div className="segment-timeline__piece__label label-icon">
				<FontAwesomeIcon icon={faCut} />
			</div>
		) : null
	}

	render() {
		return this.props.children
	}
}
