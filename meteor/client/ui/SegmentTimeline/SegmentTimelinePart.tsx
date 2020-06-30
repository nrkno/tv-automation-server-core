import * as React from 'react'
import { withTranslation, WithTranslation } from 'react-i18next'

import ClassNames from 'classnames'
import * as _ from 'underscore'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { Rundown } from '../../../lib/collections/Rundowns'
import { Studio } from '../../../lib/collections/Studios'
import { SegmentUi, PartUi, IOutputLayerUi, ISourceLayerUi, PieceUi } from './SegmentTimelineContainer'
import { SourceLayerItemContainer } from './SourceLayerItemContainer'
import { RundownTiming, WithTiming, withTiming } from '../RundownView/RundownTiming'

import { ContextMenuTrigger } from 'react-contextmenu'

import { RundownUtils } from '../../lib/rundown'
import { getCurrentTime, literal, unprotectString } from '../../../lib/lib'
import { ensureHasTrailingSlash, contextMenuHoldToDisplayTime } from '../../lib/lib'

import { DEBUG_MODE } from './SegmentTimelineDebugMode'
import { Translated } from '../../lib/ReactMeteorData/ReactMeteorData'
import { ConfigItemValue } from 'tv-automation-sofie-blueprints-integration'

import { getElementDocumentOffset, OffsetPosition } from '../../utils/positions'
import { IContextMenuContext } from '../RundownView'
import { CSSProperties } from '../../styles/_cssVariables'

export const SegmentTimelineLineElementId = 'rundown__segment__line__'
export const SegmentTimelinePartElementId = 'rundown__segment__part__'

interface ISourceLayerPropsBase {
	key: string
	outputLayer: IOutputLayerUi
	playlist: RundownPlaylist
	segment: SegmentUi
	part: PartUi
	mediaPreviewUrl: string
	startsAt: number
	duration: number
	timeScale: number
	isLiveLine: boolean
	isNextLine: boolean
	outputGroupCollapsed: boolean
	onFollowLiveLine?: (state: boolean, event: any) => void
	onPieceClick?: (piece: PieceUi, e: React.MouseEvent<HTMLDivElement>) => void
	onPieceDoubleClick?: (item: PieceUi, e: React.MouseEvent<HTMLDivElement>) => void
	relative: boolean
	totalSegmentDuration?: number
	followLiveLine: boolean
	liveLineHistorySize: number
	livePosition: number | null
	scrollLeft: number
	scrollWidth: number
	liveLinePadding: number
	autoNextPart: boolean
	onContextMenu?: (contextMenuContext: IContextMenuContext) => void
}
interface ISourceLayerProps extends ISourceLayerPropsBase {
	layer: ISourceLayerUi
}

class SourceLayerBase<T extends ISourceLayerPropsBase> extends React.PureComponent<T> {
	private mousePosition: OffsetPosition = { left: 0, top: 0 }

	getPartContext = (props) => {
		const partElement = document.querySelector('#' + SegmentTimelinePartElementId + this.props.part.instance._id)
		const partDocumentOffset = getElementDocumentOffset(partElement)

		const ctx = literal<IContextMenuContext>({
			segment: this.props.segment,
			part: this.props.part,
			partDocumentOffset: partDocumentOffset || undefined,
			timeScale: this.props.timeScale,
			mousePosition: this.mousePosition,
			partStartsAt: this.props.startsAt,
		})

		if (this.props.onContextMenu && typeof this.props.onContextMenu === 'function') {
			this.props.onContextMenu(ctx)
		}

		return ctx
	}

	onMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
		this.mousePosition = { left: e.pageX, top: e.pageY }
	}
}

class SourceLayer extends SourceLayerBase<ISourceLayerProps> {
	renderInside() {
		if (this.props.layer.pieces !== undefined) {
			return _.chain(
				this.props.layer.pieces.filter((piece) => {
					// filter only pieces belonging to this part
					return piece.instance.partInstanceId === this.props.part.instance._id
						? // filter only pieces, that have not been hidden from the UI
						  piece.instance.piece.hidden !== true && piece.instance.piece.virtual !== true
						: false
				})
			)
				.sortBy((it) => it.renderedInPoint)
				.sortBy((it) => it.instance.piece.infiniteMode)
				.sortBy((it) => it.cropped)
				.map((piece) => {
					return (
						<SourceLayerItemContainer
							key={piece.instance._id}
							{..._.omit(this.props, 'key')} // kz: TODO two keys is to many but which one to choose?
							// The following code is fine, just withTracker HOC messing with available props
							onClick={this.props.onPieceClick}
							onDoubleClick={this.props.onPieceDoubleClick}
							mediaPreviewUrl={this.props.mediaPreviewUrl}
							piece={piece}
							layer={this.props.layer}
							outputLayer={this.props.outputLayer}
							part={this.props.part}
							partStartsAt={this.props.startsAt}
							partDuration={this.props.duration}
							timeScale={this.props.timeScale}
							relative={this.props.relative}
							autoNextPart={this.props.autoNextPart}
							liveLinePadding={this.props.liveLinePadding}
							scrollLeft={this.props.scrollLeft}
							scrollWidth={this.props.scrollWidth}
						/>
					)
				})
				.value()
		}
	}

	render() {
		return (
			<ContextMenuTrigger
				id="segment-timeline-context-menu"
				attributes={{
					className: 'segment-timeline__layer',
					onMouseUpCapture: (e) => this.onMouseUp(e),
				}}
				holdToDisplay={contextMenuHoldToDisplayTime()}
				collect={this.getPartContext}>
				{this.renderInside()}
			</ContextMenuTrigger>
		)
	}
}

interface IFlattenedSourceLayerProps extends ISourceLayerPropsBase {
	layers: ISourceLayerUi[]
}
class FlattenedSourceLayers extends SourceLayerBase<IFlattenedSourceLayerProps> {
	renderInside() {
		return this.props.layers.map((layer) => {
			if (layer.pieces !== undefined) {
				return _.chain(
					layer.pieces.filter((piece) => {
						// filter only pieces belonging to this part
						return piece.instance.partInstanceId === this.props.part.instance._id
							? // filter only pieces, that have not been hidden from the UI
							  piece.instance.piece.hidden !== true && piece.instance.piece.virtual !== true
							: false
					})
				)
					.sortBy((it) => it.renderedInPoint)
					.sortBy((it) => it.instance.piece.infiniteMode)
					.sortBy((it) => it.cropped)
					.map((piece) => {
						return (
							<SourceLayerItemContainer
								key={piece.instance._id}
								{..._.omit(this.props, 'key')}
								// The following code is fine, just withTracker HOC messing with available props
								onClick={this.props.onPieceClick}
								onDoubleClick={this.props.onPieceDoubleClick}
								mediaPreviewUrl={this.props.mediaPreviewUrl}
								piece={piece}
								layer={layer}
								outputLayer={this.props.outputLayer}
								part={this.props.part}
								partStartsAt={this.props.startsAt}
								partDuration={this.props.duration}
								timeScale={this.props.timeScale}
								relative={this.props.relative}
								autoNextPart={this.props.autoNextPart}
								liveLinePadding={this.props.liveLinePadding}
								scrollLeft={this.props.scrollLeft}
								scrollWidth={this.props.scrollWidth}
							/>
						)
					})
					.value()
			}
		})
	}

	render() {
		return (
			<ContextMenuTrigger
				id="segment-timeline-context-menu"
				attributes={{
					className: 'segment-timeline__layer segment-timeline__layer--flattened',
					onMouseUpCapture: (e) => this.onMouseUp(e),
				}}
				collect={this.getPartContext}>
				{this.renderInside()}
			</ContextMenuTrigger>
		)
	}
}

interface IOutputGroupProps {
	layer: IOutputLayerUi
	playlist: RundownPlaylist
	segment: SegmentUi
	part: PartUi
	mediaPreviewUrl: string
	startsAt: number
	duration: number
	timeScale: number
	collapsedOutputs: {
		[key: string]: boolean
	}
	isLiveLine: boolean
	isNextLine: boolean
	onFollowLiveLine?: (state: boolean, event: any) => void
	onPieceClick?: (piece: PieceUi, e: React.MouseEvent<HTMLDivElement>) => void
	onPieceDoubleClick?: (item: PieceUi, e: React.MouseEvent<HTMLDivElement>) => void
	followLiveLine: boolean
	liveLineHistorySize: number
	livePosition: number | null
	scrollLeft: number
	scrollWidth: number
	liveLinePadding: number
	autoNextPart: boolean
	relative: boolean
	onContextMenu?: (contextMenuContext: IContextMenuContext) => void
}
class OutputGroup extends React.PureComponent<IOutputGroupProps> {
	static whyDidYouRender = true

	renderInside(isOutputGroupCollapsed) {
		if (this.props.layer.sourceLayers !== undefined) {
			if (!this.props.layer.isFlattened) {
				return this.props.layer.sourceLayers
					.filter((i) => !i.isHidden)
					.sort((a, b) => a._rank - b._rank)
					.map((sourceLayer) => {
						return (
							<SourceLayer
								key={sourceLayer._id}
								{...this.props}
								layer={sourceLayer}
								playlist={this.props.playlist}
								outputLayer={this.props.layer}
								outputGroupCollapsed={isOutputGroupCollapsed}
								segment={this.props.segment}
								part={this.props.part}
								startsAt={this.props.startsAt}
								duration={this.props.duration}
								timeScale={this.props.timeScale}
								autoNextPart={this.props.autoNextPart}
								liveLinePadding={this.props.liveLinePadding}
							/>
						)
					})
			} else {
				return (
					<FlattenedSourceLayers
						key={this.props.layer._id + '_flattened'}
						{...this.props}
						layers={this.props.layer.sourceLayers.filter((i) => !i.isHidden).sort((a, b) => a._rank - b._rank)}
						playlist={this.props.playlist}
						outputLayer={this.props.layer}
						outputGroupCollapsed={isOutputGroupCollapsed}
						segment={this.props.segment}
						part={this.props.part}
						startsAt={this.props.startsAt}
						duration={this.props.duration}
						timeScale={this.props.timeScale}
						autoNextPart={this.props.autoNextPart}
						liveLinePadding={this.props.liveLinePadding}
					/>
				)
			}
		}
	}

	render() {
		const isCollapsed =
			this.props.collapsedOutputs[this.props.layer._id] !== undefined
				? this.props.collapsedOutputs[this.props.layer._id] === true
				: this.props.layer.isDefaultCollapsed
		return (
			<div
				className={ClassNames('segment-timeline__output-group', {
					collapsable:
						this.props.layer.sourceLayers && this.props.layer.sourceLayers.length > 1 && !this.props.layer.isFlattened,
					collapsed: isCollapsed,
					flattened: this.props.layer.isFlattened,
				})}>
				{DEBUG_MODE && (
					<div className="segment-timeline__debug-info red">
						{RundownUtils.formatTimeToTimecode(this.props.startsAt)}
					</div>
				)}
				{this.renderInside(isCollapsed)}
			</div>
		)
	}
}

interface IProps {
	segment: SegmentUi
	playlist: RundownPlaylist
	studio: Studio
	part: PartUi
	timeScale: number
	onCollapseOutputToggle?: (layer: IOutputLayerUi, event: any) => void
	collapsedOutputs: {
		[key: string]: boolean
	}
	onCollapseSegmentToggle?: (event: any) => void
	isCollapsed?: boolean
	scrollLeft: number
	scrollWidth: number
	onScroll?: (scrollLeft: number, event: any) => void
	onFollowLiveLine?: (state: boolean, event: any) => void
	onPieceClick?: (piece: PieceUi, e: React.MouseEvent<HTMLDivElement>) => void
	onPieceDoubleClick?: (item: PieceUi, e: React.MouseEvent<HTMLDivElement>) => void
	followLiveLine: boolean
	autoNextPart: boolean
	liveLineHistorySize: number
	livePosition: number | null
	relative: boolean
	totalSegmentDuration?: number
	firstPartInSegment?: PartUi
	onContextMenu?: (contextMenuContext: IContextMenuContext) => void
	isLastInSegment: boolean
	isAfterLastValidInSegmentAndItsLive: boolean
	isLastSegment: boolean
}

interface IState {
	isLive: boolean
	isNext: boolean
	isDurationSettling: boolean
	liveDuration: number

	isInsideViewport: boolean
}

const LIVE_LINE_TIME_PADDING = 150

const CARRIAGE_RETURN_ICON = (
	<div className="segment-timeline__part__nextline__label__carriage-return">
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 11.36 7.92">
			<g>
				<path d="M10.36,0V2.2A3.06,3.06,0,0,1,7.3,5.25H3.81V3.51L0,5.71,3.81,7.92V6.25H7.3a4.06,4.06,0,0,0,4.06-4V0Z" />
			</g>
		</svg>
	</div>
)

export const SegmentTimelinePart = withTranslation()(
	withTiming<IProps & WithTranslation, IState>((props: IProps) => {
		return {
			isHighResolution: false,
			filter: (durations: RundownTiming.RundownTimingContext) => {
				durations = durations || {}

				const partId = unprotectString(props.part.instance.part._id)
				const firstPartInSegmentId = props.firstPartInSegment
					? unprotectString(props.firstPartInSegment.instance.part._id)
					: undefined
				return [
					(durations.partDurations || {})[partId],
					(durations.partDisplayStartsAt || {})[partId],
					(durations.partDisplayDurations || {})[partId],
					firstPartInSegmentId ? (durations.partDisplayStartsAt || {})[firstPartInSegmentId] : undefined,
					firstPartInSegmentId ? (durations.partDisplayDurations || {})[firstPartInSegmentId] : undefined,
				]
			},
		}
	})(
		class SegmentTimelinePart0 extends React.Component<Translated<WithTiming<IProps>>, IState> {
			private delayedInstanceUpdate: NodeJS.Timer | undefined

			constructor(props: Translated<WithTiming<IProps>>) {
				super(props)

				const partInstance = this.props.part.instance

				const isLive = this.props.playlist.currentPartInstanceId === partInstance._id
				const isNext = this.props.playlist.nextPartInstanceId === partInstance._id
				const startedPlayback = partInstance.part.startedPlayback

				this.state = {
					isLive,
					isNext,
					isDurationSettling: false,
					isInsideViewport: false,
					liveDuration: isLive
						? Math.max(
								(startedPlayback &&
									props.timingDurations.partDurations &&
									SegmentTimelinePart0.getCurrentLiveLinePosition(
										props.part,
										props.timingDurations.currentTime || getCurrentTime()
									) + SegmentTimelinePart0.getLiveLineTimePadding(props.timeScale)) ||
									0,
								props.timingDurations.partDurations
									? partInstance.part.displayDuration ||
											props.timingDurations.partDurations[unprotectString(partInstance.part._id)]
									: 0
						  )
						: 0,
				}
			}

			static getDerivedStateFromProps(nextProps: IProps & RundownTiming.InjectedROTimingProps): Partial<IState> {
				const isLive = nextProps.playlist.currentPartInstanceId === nextProps.part.instance._id
				const isNext = nextProps.playlist.nextPartInstanceId === nextProps.part.instance._id

				const nextPartInner = nextProps.part.instance.part

				const startedPlayback = nextPartInner.startedPlayback

				const isDurationSettling =
					!!nextProps.playlist.active && !isLive && !!startedPlayback && !nextPartInner.duration

				const liveDuration =
					(isLive || isDurationSettling) && !nextProps.autoNextPart && !nextPartInner.autoNext
						? Math.max(
								(startedPlayback &&
									nextProps.timingDurations.partDurations &&
									(nextProps.relative
										? SegmentTimelinePart0.getCurrentLiveLinePosition(
												nextProps.part,
												nextProps.timingDurations.currentTime || getCurrentTime()
										  )
										: SegmentTimelinePart0.getCurrentLiveLinePosition(
												nextProps.part,
												nextProps.timingDurations.currentTime || getCurrentTime()
										  ) + SegmentTimelinePart0.getLiveLineTimePadding(nextProps.timeScale))) ||
									0,
								nextProps.timingDurations.partDurations
									? nextPartInner.displayDuration ||
											nextProps.timingDurations.partDurations[unprotectString(nextPartInner._id)]
									: 0
						  )
						: 0

				const isInsideViewport =
					nextProps.relative ||
					isLive ||
					RundownUtils.isInsideViewport(
						nextProps.scrollLeft,
						nextProps.scrollWidth,
						nextProps.part,
						SegmentTimelinePart0.getPartStartsAt(nextProps),
						SegmentTimelinePart0.getPartDuration(nextProps, liveDuration)
					)

				const partial = {
					isLive,
					isNext,
					isDurationSettling,
					liveDuration,
					isInsideViewport,
				}

				return partial
			}

			static getLiveLineTimePadding(timeScale): number {
				return LIVE_LINE_TIME_PADDING / timeScale
			}

			static getCurrentLiveLinePosition(part: PartUi, currentTime: number): number {
				if (part.instance.part.startedPlayback && part.instance.part.getLastStartedPlayback()) {
					if (part.instance.part.duration) {
						return part.instance.part.duration
					} else {
						return currentTime - (part.instance.part.getLastStartedPlayback() || 0)
					}
				} else {
					return 0
				}
			}

			queueDelayedUpdate() {
				this.delayedInstanceUpdate = setTimeout(() => {
					this.delayedInstanceUpdate = undefined
					this.forceUpdate()
				}, 5000)
			}

			shouldComponentUpdate(nextProps: WithTiming<IProps>, nextState: IState) {
				if (!_.isMatch(this.props, nextProps) || !_.isMatch(this.state, nextState)) {
					if (this.delayedInstanceUpdate) clearTimeout(this.delayedInstanceUpdate)
					if (
						this.props.part.instance.isTemporary === true &&
						nextProps.part.instance.isTemporary === false &&
						this.props.part.pieces.length > 0 &&
						nextProps.part.pieces.length === 0 &&
						!nextProps.part.instance.part.invalid
					) {
						this.queueDelayedUpdate()
						return false
					} else if (
						this.props.part.instance.isTemporary === false &&
						nextProps.part.instance.isTemporary === false &&
						this.props.part.pieces.length === 0 &&
						nextProps.part.pieces.length === 0 &&
						!nextProps.part.instance.part.invalid
					) {
						this.queueDelayedUpdate()
						return false
					}
					return true
				} else {
					return false
				}
			}

			getLayerStyle() {
				// this.props.part.expectedDuration ||
				if (this.props.relative) {
					return {
						width:
							(
								(SegmentTimelinePart0.getPartDuration(this.props, this.state.liveDuration) /
									(this.props.totalSegmentDuration || 1)) *
								100
							).toString() + '%',
						// width: (Math.max(this.state.liveDuration, this.props.part.duration || this.props.part.expectedDuration || 3000) / (this.props.totalSegmentDuration || 1) * 100).toString() + '%',
						willChange: this.state.isLive ? 'width' : undefined,
					}
				} else {
					return {
						minWidth:
							Math.floor(
								SegmentTimelinePart0.getPartDuration(this.props, this.state.liveDuration) * this.props.timeScale
							).toString() + 'px',
						// minWidth: (Math.max(this.state.liveDuration, this.props.part.duration || this.props.part.expectedDuration || 3000) * this.props.timeScale).toString() + 'px',
						willChange: this.state.isLive ? 'minWidth' : undefined,
					}
				}
			}

			static getPartDuration(props: WithTiming<IProps>, liveDuration: number): number {
				// const part = this.props.part
				const innerPart = props.part.instance.part

				return Math.max(
					liveDuration,
					innerPart.duration ||
						(props.timingDurations.partDisplayDurations &&
							props.timingDurations.partDisplayDurations[unprotectString(props.part.instance.part._id)]) ||
						props.part.renderedDuration ||
						0
				)

				/* return part.duration !== undefined ? part.duration : Math.max(
			((this.props.timingDurations.partDurations && this.props.timingDurations.partDurations[unprotectString(part._id)]) || 0),
			this.props.part.renderedDuration || 0, this.state.liveDuration, 0) */
			}

			static getPartStartsAt(props: WithTiming<IProps>): number {
				return Math.max(
					0,
					(props.firstPartInSegment &&
						props.timingDurations.partDisplayStartsAt &&
						props.timingDurations.partDisplayStartsAt[unprotectString(props.part.instance.part._id)] -
							props.timingDurations.partDisplayStartsAt[unprotectString(props.firstPartInSegment.instance.part._id)]) ||
						0
				)
			}

			renderTimelineOutputGroups(part: PartUi) {
				if (this.props.segment.outputLayers !== undefined) {
					return _.map(
						_.filter(this.props.segment.outputLayers, (layer) => {
							return layer.used ? true : false
						}).sort((a, b) => {
							return a._rank - b._rank
						}),
						(layer, id) => {
							// Only render output layers used by the segment
							if (layer.used) {
								return (
									<OutputGroup
										key={layer._id}
										collapsedOutputs={this.props.collapsedOutputs}
										followLiveLine={this.props.followLiveLine}
										liveLineHistorySize={this.props.liveLineHistorySize}
										livePosition={this.props.livePosition}
										onContextMenu={this.props.onContextMenu}
										onFollowLiveLine={this.props.onFollowLiveLine}
										onPieceClick={this.props.onPieceClick}
										onPieceDoubleClick={this.props.onPieceDoubleClick}
										scrollLeft={this.props.scrollLeft}
										scrollWidth={this.props.scrollWidth}
										relative={this.props.relative}
										mediaPreviewUrl={
											ensureHasTrailingSlash(this.props.studio.settings.mediaPreviewsUrl + '' || '') || ''
										}
										layer={layer}
										segment={this.props.segment}
										part={part}
										playlist={this.props.playlist}
										startsAt={SegmentTimelinePart0.getPartStartsAt(this.props) || this.props.part.startsAt || 0}
										duration={SegmentTimelinePart0.getPartDuration(this.props, this.state.liveDuration)}
										isLiveLine={this.props.playlist.currentPartInstanceId === part.instance._id}
										isNextLine={this.props.playlist.nextPartInstanceId === part.instance._id}
										timeScale={this.props.timeScale}
										autoNextPart={this.props.autoNextPart}
										liveLinePadding={SegmentTimelinePart0.getLiveLineTimePadding(this.props.timeScale)}
									/>
								)
							}
						}
					)
				}
			}

			getFutureShadeStyle = () => {
				return {
					width:
						Math.min(
							Math.max(
								0,
								(this.props.livePosition || 0) +
									SegmentTimelinePart0.getLiveLineTimePadding(this.props.timeScale) -
									(this.props.part.instance.part.expectedDuration || this.props.part.renderedDuration || 0)
							),
							SegmentTimelinePart0.getLiveLineTimePadding(this.props.timeScale)
						) *
							this.props.timeScale +
						'px',
				}
			}

			static convertHexToRgba(hexColor: string): { red: number; green: number; blue: number } | undefined {
				if (hexColor.substr(0, 1) !== '#') return
				if (hexColor.length !== 7) return

				const red = parseInt(hexColor.substr(1, 2), 16)
				const green = parseInt(hexColor.substr(3, 2), 16)
				const blue = parseInt(hexColor.substr(5, 2), 16)

				return { red, green, blue }
			}

			render() {
				const { t } = this.props

				const innerPart = this.props.part.instance.part

				const isEndOfShow =
					this.props.isLastSegment &&
					this.props.isLastInSegment &&
					(!this.state.isLive || (this.state.isLive && !this.props.playlist.nextPartInstanceId))
				let invalidReasonColorVars: CSSProperties | undefined = undefined
				if (innerPart.invalidReason && innerPart.invalidReason.color) {
					const invalidColor = SegmentTimelinePart0.convertHexToRgba(innerPart.invalidReason.color)
					if (invalidColor) {
						invalidReasonColorVars = {
							['--invalid-reason-color-opaque']: `rgba(${invalidColor.red}, ${invalidColor.green}, ${invalidColor.blue}, 1)`,
							['--invalid-reason-color-transparent']: `rgba(${invalidColor.red}, ${invalidColor.green}, ${invalidColor.blue}, 0)`,
						}
					}
				}

				if (this.state.isInsideViewport) {
					return (
						<div
							className={ClassNames('segment-timeline__part', {
								live: this.state.isLive,
								next: this.state.isNext || this.props.isAfterLastValidInSegmentAndItsLive,
								invalid: innerPart.invalid && !innerPart.gap,
								floated: innerPart.floated,
								gap: innerPart.gap,

								'duration-settling': this.state.isDurationSettling,
							})}
							data-obj-id={this.props.part.instance._id}
							id={SegmentTimelinePartElementId + this.props.part.instance._id}
							style={_.extend(this.getLayerStyle(), invalidReasonColorVars)}>
							{innerPart.invalid ? <div className="segment-timeline__part__invalid-cover"></div> : null}
							{innerPart.floated ? <div className="segment-timeline__part__floated-cover"></div> : null}

							<div
								className={ClassNames('segment-timeline__part__nextline', {
									// This is the base, basic line
									'auto-next':
										(this.state.isNext && this.props.autoNextPart) ||
										(!this.state.isNext && this.props.part.willProbablyAutoNext),
									invalid: innerPart.invalid && !innerPart.gap,
									floated: innerPart.floated,
									offset: !!this.props.playlist.nextTimeOffset,
								})}>
								<div
									className={ClassNames('segment-timeline__part__nextline__label', {
										'segment-timeline__part__nextline__label--thin':
											(this.props.autoNextPart || this.props.part.willProbablyAutoNext) && !this.state.isNext,
									})}>
									{innerPart.invalid && !innerPart.gap ? (
										<span>{t('Invalid')}</span>
									) : (
										<React.Fragment>
											{((this.state.isNext && this.props.autoNextPart) ||
												(!this.state.isNext && this.props.part.willProbablyAutoNext)) &&
												t('Auto') + ' '}
											{(this.state.isNext || this.props.isAfterLastValidInSegmentAndItsLive) && t('Next')}
										</React.Fragment>
									)}
									{this.props.isAfterLastValidInSegmentAndItsLive && CARRIAGE_RETURN_ICON}
								</div>
								{!this.props.relative && this.props.part.instance.part.identifier && (
									<div className="segment-timeline__identifier">{this.props.part.instance.part.identifier}</div>
								)}
							</div>
							{this.props.playlist.nextTimeOffset &&
							this.state.isNext && ( // This is the off-set line
									<div
										className={ClassNames('segment-timeline__part__nextline', {
											'auto-next': this.props.part.willProbablyAutoNext,
											invalid: innerPart.invalid && !innerPart.gap,
											floated: innerPart.floated,
										})}
										style={{
											left: this.props.relative
												? (this.props.playlist.nextTimeOffset /
														(SegmentTimelinePart0.getPartDuration(this.props, this.state.liveDuration) || 1)) *
														100 +
												  '%'
												: this.props.playlist.nextTimeOffset * this.props.timeScale + 'px',
										}}>
										<div
											className={ClassNames('segment-timeline__part__nextline__label', {
												'segment-timeline__part__nextline__label--thin':
													(this.props.autoNextPart || this.props.part.willProbablyAutoNext) && !this.state.isNext,
											})}>
											{innerPart.invalid ? (
												!innerPart.gap && <span>{t('Invalid')}</span>
											) : (
												<React.Fragment>
													{(this.props.autoNextPart || this.props.part.willProbablyAutoNext) && t('Auto') + ' '}
													{this.state.isNext && t('Next')}
												</React.Fragment>
											)}
										</div>
									</div>
								)}
							{DEBUG_MODE && (
								<div className="segment-timeline__debug-info">
									{this.props.livePosition} / {this.props.part.startsAt} /{' '}
									{
										((this.props.timingDurations || { partStartsAt: {} }).partStartsAt || {})[
											unprotectString(innerPart._id)
										]
									}
								</div>
							)}
							{this.state.isLive && !this.props.relative && !this.props.autoNextPart && !innerPart.autoNext && (
								<div className="segment-timeline__part__future-shade" style={this.getFutureShadeStyle()}></div>
							)}
							{this.renderTimelineOutputGroups(this.props.part)}
							{this.props.isLastInSegment && (
								<div
									className={ClassNames(
										'segment-timeline__part__nextline',
										'segment-timeline__part__nextline--endline',
										{
											'auto-next': innerPart.autoNext,
											'is-next':
												this.state.isLive &&
												((!this.props.isLastSegment && !this.props.isLastInSegment) ||
													!!this.props.playlist.nextPartInstanceId),
											'show-end': isEndOfShow,
										}
									)}>
									<div
										className={ClassNames('segment-timeline__part__nextline__label', {
											'segment-timeline__part__nextline__label--thin': innerPart.autoNext && !this.state.isLive,
										})}>
										{innerPart.autoNext && t('Auto') + ' '}
										{this.state.isLive && t('Next')}
										{!isEndOfShow && CARRIAGE_RETURN_ICON}
									</div>
								</div>
							)}
							{isEndOfShow && (
								<div className="segment-timeline__part__show-end">
									<div className="segment-timeline__part__show-end__label">{t('Show End')}</div>
								</div>
							)}
						</div>
					)
				} else {
					// render placeholders
					return (
						<div
							className={ClassNames('segment-timeline__part', {
								live: this.state.isLive,
								next: this.state.isNext,
							})}
							data-obj-id={this.props.part.instance._id}
							style={this.getLayerStyle()}>
							{/* render it empty, just to take up space */}
						</div>
					)
				}
			}
		}
	)
)
