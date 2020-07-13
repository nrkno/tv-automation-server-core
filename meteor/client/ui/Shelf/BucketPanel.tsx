import * as React from 'react'
import * as _ from 'underscore'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import { Rundowns } from '../../../lib/collections/Rundowns'
import { IAdLibListItem } from './AdLibListItem'
import ClassNames from 'classnames'
import {
	DragSource,
	DropTarget,
	ConnectDragSource,
	ConnectDropTarget,
	DragSourceMonitor,
	DropTargetMonitor,
	ConnectDragPreview,
} from 'react-dnd'
import { faBars } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { ShowStyleBase } from '../../../lib/collections/ShowStyleBases'
import { IOutputLayer, ISourceLayer } from 'tv-automation-sofie-blueprints-integration'
import { PubSub } from '../../../lib/api/pubsub'
import { doUserAction, UserAction } from '../../lib/userAction'
import { NotificationCenter, Notification, NoticeLevel } from '../../lib/notifications/notifications'
import { literal, unprotectString, partial } from '../../../lib/lib'
import { ensureHasTrailingSlash, contextMenuHoldToDisplayTime } from '../../lib/lib'
import { Studio } from '../../../lib/collections/Studios'
import { getUnfinishedPieceInstancesReactive, DashboardPanelInner, dashboardElementPosition } from './DashboardPanel'
import { BucketAdLib, BucketAdLibs } from '../../../lib/collections/BucketAdlibs'
import { Bucket, BucketId } from '../../../lib/collections/Buckets'
import { Events as MOSEvents } from '../../lib/data/mos/plugin-support'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { MeteorCall } from '../../../lib/api/methods'
import { PieceInstance } from '../../../lib/collections/PieceInstances'
import { DragDropItemTypes } from '../DragDropItemTypes'
import { PieceId } from '../../../lib/collections/Pieces'
import { BucketPieceButton } from './BucketPieceButton'
import { ContextMenuTrigger } from 'react-contextmenu'
import update from 'immutability-helper'
import { ShowStyleVariantId } from '../../../lib/collections/ShowStyleVariants'
import { PartInstances } from '../../../lib/collections/PartInstances'

const HOTKEY_GROUP = 'BucketPanel'

const bucketSource = {
	beginDrag(props: IBucketPanelProps, monitor: DragSourceMonitor, component: any) {
		let size = {
			width: 0,
			height: 0,
		}

		if (component._panel) {
			const { width, height } = (component._panel as HTMLDivElement).getBoundingClientRect()
			size.width = width
			size.height = height
		}

		return {
			id: props.bucket._id,
			originalIndex: props.findBucket(props.bucket._id).index,
			size,
		}
	},

	endDrag(props: IBucketPanelProps, monitor: DragSourceMonitor) {
		const { id: droppedId, originalIndex } = monitor.getItem()
		const didDrop = monitor.didDrop()

		if (!didDrop) {
			props.moveBucket(droppedId, originalIndex)
		} else {
			const { index: newIndex } = monitor.getDropResult()
			props.onBucketReorder(droppedId, newIndex, originalIndex)
		}
	},
}

const bucketTarget = {
	canDrop(props: IBucketPanelProps, monitor: DropTargetMonitor) {
		return true
	},

	hover(props: IBucketPanelProps, monitor: DropTargetMonitor, component: any) {
		if (monitor.getItemType() === DragDropItemTypes.BUCKET) {
			const { id: draggedId, size: draggedSize } = monitor.getItem()
			const overId = props.bucket._id
			let farEnough = true
			let rect = {
				width: 0,
				height: 0,
				left: 0,
				top: 0,
			}
			if (draggedId !== overId) {
				if (
					component &&
					component.decoratedRef &&
					component.decoratedRef.current &&
					component.decoratedRef.current._panel
				) {
					rect = (component.decoratedRef.current._panel as HTMLDivElement).getBoundingClientRect()
				}
				const draggedPosition = monitor.getClientOffset()
				if (draggedPosition) {
					if (rect.width - (draggedPosition.x - rect.left) >= draggedSize.width) {
						farEnough = false
					}
				}
				if (farEnough) {
					const { index: overIndex } = props.findBucket(overId)
					props.moveBucket(draggedId, overIndex)
				}
			}
		}
	},

	drop(props: IBucketPanelProps, monitor: DropTargetMonitor) {
		const { index } = props.findBucket(props.bucket._id)

		return {
			index,
			bucketId: props.bucket._id,
			action:
				monitor.getItemType() === DragDropItemTypes.BUCKET
					? 'reorder'
					: monitor.getItemType() === DragDropItemTypes.BUCKET_ADLIB_PIECE
					? monitor.getItem().bucketId === props.bucket._id
						? 'reorder'
						: 'move'
					: undefined,
		}
	},
}

interface IState {
	outputLayers: {
		[key: string]: IOutputLayer
	}
	sourceLayers: {
		[key: string]: ISourceLayer
	}
	dropActive: boolean
	bucketName: string
	adLibPieces: BucketAdLib[]
}

export interface IBucketPanelProps {
	bucket: Bucket
	playlist: RundownPlaylist
	showStyleBase: ShowStyleBase
	shouldQueue: boolean
	editableName?: boolean
	onNameChanged: (e: any, newName: string) => void
	moveBucket: (id: BucketId, atIndex: number) => void
	findBucket: (id: BucketId) => { bucket: Bucket | undefined; index: number }
	onBucketReorder: (draggedId: BucketId, newIndex: number, oldIndex: number) => void
	onAdLibContext: (args: { contextBucket: Bucket; contextBucketAdLib: BucketAdLib }, callback: () => void) => void
}

export interface IBucketPanelTrackedProps {
	adLibPieces: BucketAdLib[]
	unfinishedPieceInstances: _.Dictionary<PieceInstance[]>
	studio: Studio
	showStyleVariantId: ShowStyleVariantId
}

interface BucketSourceCollectedProps {
	connectDragSource: ConnectDragSource
	connectDragPreview: ConnectDragPreview
	isDragging: boolean
}

interface BucketTargetCollectedProps {
	connectDropTarget: ConnectDropTarget
}

export const BucketPanel = translateWithTracker<Translated<IBucketPanelProps>, IState, IBucketPanelTrackedProps>(
	(props: Translated<IBucketPanelProps>) => {
		let showStyleVariantId
		const selectedPart = props.playlist.currentPartInstanceId || props.playlist.nextPartInstanceId
		if (selectedPart) {
			const part = PartInstances.findOne(selectedPart, {
				fields: {
					rundownId: 1,
				},
			})
			if (part) {
				const rundown = Rundowns.findOne(part.rundownId, {
					fields: {
						showStyleVariantId: 1,
					},
				})
				if (rundown) {
					showStyleVariantId = rundown.showStyleVariantId
				}
			}
		}
		if (showStyleVariantId === undefined) {
			const rundown = props.playlist.getRundowns(
				{},
				{
					fields: {
						showStyleVariantId: 1,
					},
				}
			)[0]
			if (rundown) {
				showStyleVariantId = rundown.showStyleVariantId
			}
		}
		return literal<IBucketPanelTrackedProps>({
			adLibPieces: BucketAdLibs.find(
				{
					bucketId: props.bucket._id,
				},
				{
					sort: {
						_rank: 1,
						name: 1,
					},
				}
			).fetch(),
			studio: props.playlist.getStudio(),
			unfinishedPieceInstances: getUnfinishedPieceInstancesReactive(props.playlist.currentPartInstanceId),
			showStyleVariantId,
		})
	},
	(data, props: IBucketPanelProps, nextProps: IBucketPanelProps) => {
		return !_.isEqual(props, nextProps)
	}
)(
	DropTarget([DragDropItemTypes.BUCKET, DragDropItemTypes.BUCKET_ADLIB_PIECE], bucketTarget, (connect) => ({
		connectDropTarget: connect.dropTarget(),
	}))(
		DragSource(DragDropItemTypes.BUCKET, bucketSource, (connect, monitor) => ({
			connectDragSource: connect.dragSource(),
			connectDragPreview: connect.dragPreview(),
			isDragging: monitor.isDragging(),
		}))(
			class BucketPanel extends MeteorReactComponent<
				Translated<IBucketPanelProps & IBucketPanelTrackedProps> &
					BucketSourceCollectedProps &
					BucketTargetCollectedProps,
				IState
			> {
				_nameTextBox: HTMLInputElement | null = null
				_panel: HTMLDivElement | null = null

				constructor(props: Translated<IBucketPanelProps & IBucketPanelTrackedProps>) {
					super(props)

					this.state = {
						outputLayers: {},
						sourceLayers: {},
						dropActive: false,
						bucketName: props.bucket.name,
						adLibPieces: ([] as BucketAdLib[]).concat(props.adLibPieces || []),
					}
				}

				static getDerivedStateFromProps(props: IBucketPanelProps & IBucketPanelTrackedProps, state) {
					let tOLayers: {
						[key: string]: IOutputLayer
					} = {}
					let tSLayers: {
						[key: string]: ISourceLayer
					} = {}

					if (props.showStyleBase && props.showStyleBase.outputLayers && props.showStyleBase.sourceLayers) {
						props.showStyleBase.outputLayers.forEach((item) => {
							tOLayers[item._id] = item
						})
						props.showStyleBase.sourceLayers.forEach((item) => {
							tSLayers[item._id] = item
						})
					}

					return {
						outputLayers: tOLayers,
						sourceLayers: tSLayers,
					}
				}

				componentDidMount() {
					this.subscribe(PubSub.buckets, {
						_id: this.props.bucket._id,
					})
					this.subscribe(PubSub.studios, {
						_id: this.props.playlist.studioId,
					})
					this.autorun(() => {
						const showStyles = this.props.playlist
							.getRundowns()
							.map((rundown) => [rundown.showStyleBaseId, rundown.showStyleVariantId])
						const showStyleBases = showStyles.map((showStyle) => showStyle[0])
						const showStyleVariants = showStyles.map((showStyle) => showStyle[1])
						this.subscribe(PubSub.bucketAdLibPieces, {
							bucketId: this.props.bucket._id,
							studioId: this.props.playlist.studioId,
							showStyleVariantId: {
								$in: showStyleVariants,
							},
						})
						this.subscribe(PubSub.showStyleBases, {
							_id: {
								$in: showStyleBases,
							},
						})
					})

					window.addEventListener(MOSEvents.dragenter, this.onDragEnter)
					window.addEventListener(MOSEvents.dragleave, this.onDragLeave)
				}

				componentDidUpdate(prevProps: IBucketPanelProps & IBucketPanelTrackedProps) {
					if (this.props.adLibPieces !== prevProps.adLibPieces) {
						this.setState({
							adLibPieces: ([] as BucketAdLib[]).concat(this.props.adLibPieces || []),
						})
					}
				}

				componentWillUnmount() {
					this._cleanUp()

					window.removeEventListener(MOSEvents.dragenter, this.onDragEnter)
					window.removeEventListener(MOSEvents.dragleave, this.onDragLeave)
				}

				isAdLibOnAir(adLib: IAdLibListItem) {
					if (
						this.props.unfinishedPieceInstances[unprotectString(adLib._id)] &&
						this.props.unfinishedPieceInstances[unprotectString(adLib._id)].length > 0
					) {
						return true
					}
					return false
				}

				onDragEnter = () => {
					this.setState({
						dropActive: true,
					})
				}

				onDragLeave = () => {
					this.setState({
						dropActive: false,
					})
				}

				onClearAllSourceLayer = (sourceLayer: ISourceLayer, e: any) => {
					// console.log(sourceLayer)
					const { t } = this.props
					if (this.props.playlist._id && this.props.playlist.currentPartInstanceId) {
						const currentPartInstanceId = this.props.playlist.currentPartInstanceId
						doUserAction(t, e, UserAction.CLEAR_SOURCELAYER, (e) =>
							MeteorCall.userAction.sourceLayerOnPartStop(e, this.props.playlist._id, currentPartInstanceId, [
								sourceLayer._id,
							])
						)
					}
				}

				onToggleAdLib = (piece: IAdLibListItem, queue: boolean, e: any) => {
					const { t } = this.props

					queue = queue || this.props.shouldQueue

					if (piece.invalid) {
						NotificationCenter.push(
							new Notification(
								t('Invalid AdLib'),
								NoticeLevel.WARNING,
								t('Cannot play this AdLib because it is marked as Invalid'),
								'toggleAdLib'
							)
						)
						return
					}
					if (piece.floated) {
						NotificationCenter.push(
							new Notification(
								t('Floated AdLib'),
								NoticeLevel.WARNING,
								t('Cannot play this AdLib because it is marked as Floated'),
								'toggleAdLib'
							)
						)
						return
					}

					let sourceLayer = this.state.sourceLayers && this.state.sourceLayers[piece.sourceLayerId]

					if (queue && sourceLayer && sourceLayer.isQueueable) {
						console.log(`Item "${piece._id}" is on sourceLayer "${piece.sourceLayerId}" that is not queueable.`)
						return
					}
					if (this.props.playlist && this.props.playlist.currentPartInstanceId) {
						if (!this.isAdLibOnAir(piece) || !(sourceLayer && sourceLayer.clearKeyboardHotkey)) {
							const currentPartInstanceId = this.props.playlist.currentPartInstanceId

							doUserAction(t, e, UserAction.START_BUCKET_ADLIB, (e) =>
								MeteorCall.userAction.bucketAdlibStart(e, this.props.playlist._id, currentPartInstanceId, piece._id)
							)
						} else {
							if (sourceLayer && sourceLayer.clearKeyboardHotkey) {
								this.onClearAllSourceLayer(sourceLayer, e)
							}
						}
					}
				}

				private onRenameTextBoxKeyUp = (e: KeyboardEvent) => {
					if (e.key === 'Escape') {
						this.setState(
							{
								bucketName: this.props.bucket.name,
							},
							() => {
								this._nameTextBox && this._nameTextBox.blur()
							}
						)
						e.preventDefault()
						e.stopPropagation()
						e.stopImmediatePropagation()
					} else if (e.key === 'Enter') {
						this._nameTextBox && this._nameTextBox.blur()
						e.preventDefault()
						e.stopPropagation()
						e.stopImmediatePropagation()
					}
				}

				private onRenameTextBoxBlur = (e: React.FocusEvent<HTMLInputElement>) => {
					if (!this.state.bucketName.trim()) {
						this.setState(
							{
								bucketName: this.props.bucket.name,
							},
							() => {
								this.props.onNameChanged && this.props.onNameChanged(e, this.state.bucketName)
							}
						)
					} else {
						this.props.onNameChanged && this.props.onNameChanged(e, this.state.bucketName)
					}
				}

				private onRenameTextBoxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
					this.setState({
						bucketName: e.target.value || '',
					})
				}

				private renameTextBoxFocus = (input: HTMLInputElement) => {
					input.focus()
					input.setSelectionRange(0, input.value.length)
				}

				private onRenameTextBoxShow = (ref: HTMLInputElement) => {
					if (ref && !this._nameTextBox) {
						ref.addEventListener('keyup', this.onRenameTextBoxKeyUp)
						this.renameTextBoxFocus(ref)
					}
					this._nameTextBox = ref
				}

				private moveAdLib = (id: PieceId, atIndex: number) => {
					const { piece, index } = this.findAdLib(id)

					if (piece) {
						this.setState(
							update(this.state, {
								adLibPieces: {
									$splice: [[index, 1], [atIndex, 0, piece] as any],
								},
							})
						)
					}
				}

				private findAdLib = (id: PieceId): { piece: BucketAdLib | undefined; index: number } => {
					const { adLibPieces: pieces } = this.state
					const piece = pieces.find((b) => b._id === id)

					return {
						piece,
						index: piece ? pieces.indexOf(piece) : -1,
					}
				}

				private onAdLibReorder = (draggedId: PieceId, newIndex: number, oldIndex: number) => {
					const { t } = this.props
					if (this.props.adLibPieces) {
						const draggedOver = this.props.adLibPieces[newIndex]

						if (draggedOver) {
							var newRank = draggedOver._rank

							// Dragged over into first place
							if (newIndex === 0) {
								newRank = draggedOver._rank - 1
								// Dragged over into last place
							} else if (newIndex === this.props.adLibPieces.length - 1) {
								newRank = draggedOver._rank + 1
								// Last element swapped with next to last
							} else if (
								oldIndex === this.props.adLibPieces.length - 1 &&
								newIndex === this.props.adLibPieces.length - 2
							) {
								newRank = (this.props.adLibPieces[newIndex - 1]._rank + this.props.adLibPieces[newIndex]._rank) / 2
								// Dragged into any other place
							} else {
								newRank = (this.props.adLibPieces[newIndex]._rank + this.props.adLibPieces[newIndex + 1]._rank) / 2
							}

							doUserAction(t, { type: 'drop' }, UserAction.MODIFY_BUCKET, (e) =>
								MeteorCall.userAction.bucketsModifyBucketAdLib(
									e,
									draggedId,
									partial<BucketAdLib>({
										_rank: newRank,
									})
								)
							)
						}
					}
				}

				private onAdLibMove = (draggedId: PieceId, bucketId: BucketId) => {
					const { t } = this.props
					if (this.props.adLibPieces) {
						const draggedB = this.props.adLibPieces.find((b) => b._id === draggedId)

						if (draggedB) {
							doUserAction(t, { type: 'drop' }, UserAction.MODIFY_BUCKET_ADLIB, (e) =>
								MeteorCall.userAction.bucketsModifyBucketAdLib(
									e,
									draggedB._id,
									partial<BucketAdLib>({
										bucketId,
									})
								)
							)
						}
					}
				}

				render() {
					const { isDragging, connectDragSource, connectDragPreview, connectDropTarget } = this.props
					const opacity = isDragging ? 0 : 1

					if (this.props.showStyleBase) {
						return connectDragPreview(
							connectDropTarget(
								<div
									className={ClassNames('dashboard-panel', 'dashboard-panel__panel--bucket', {
										'dashboard-panel__panel--bucket-active': this.state.dropActive,
										'dashboard-panel__panel--sort-dragging': this.props.isDragging,
									})}
									data-bucket-id={this.props.bucket._id}
									ref={(el) => (this._panel = el)}>
									{this.props.editableName ? (
										<input
											className="h4 dashboard-panel__header"
											value={this.state.bucketName}
											onChange={this.onRenameTextBoxChange}
											onBlur={this.onRenameTextBoxBlur}
											ref={this.onRenameTextBoxShow}
										/>
									) : (
										<h4 className="dashboard-panel__header">
											{connectDragSource(
												<span className="dashboard-panel__handle">
													<FontAwesomeIcon icon={faBars} />
												</span>
											)}
											&nbsp;
											{this.state.bucketName}
										</h4>
									)}
									{/* 
						<FontAwesomeIcon icon={faBars} />&nbsp;
						
						{ filter.enableSearch &&
							<AdLibPanelToolbar
								onFilterChange={this.onFilterChange} />
						} */}
									<div className="dashboard-panel__panel">
										{this.state.adLibPieces.map((adlib: BucketAdLib) => {
											return (
												<ContextMenuTrigger
													id="bucket-context-menu"
													collect={() =>
														new Promise((resolve) => {
															this.props.onAdLibContext(
																{
																	contextBucketAdLib: adlib,
																	contextBucket: this.props.bucket,
																},
																resolve
															)
														})
													}
													renderTag="span"
													key={unprotectString(adlib._id)}
													holdToDisplay={contextMenuHoldToDisplayTime()}>
													<BucketPieceButton
														adLibListItem={(adlib as any) as IAdLibListItem}
														bucketId={adlib.bucketId}
														layer={this.state.sourceLayers[adlib.sourceLayerId]}
														outputLayer={this.state.outputLayers[adlib.outputLayerId]}
														onToggleAdLib={this.onToggleAdLib}
														playlist={this.props.playlist}
														isOnAir={this.isAdLibOnAir((adlib as any) as IAdLibListItem)}
														mediaPreviewUrl={
															this.props.studio
																? ensureHasTrailingSlash(this.props.studio.settings.mediaPreviewsUrl + '' || '') || ''
																: ''
														}
														disabled={adlib.showStyleVariantId !== this.props.showStyleVariantId}
														findAdLib={this.findAdLib}
														moveAdLib={this.moveAdLib}
														onAdLibReorder={this.onAdLibReorder}
														onAdLibMove={this.onAdLibMove}>
														{adlib.name}
													</BucketPieceButton>
												</ContextMenuTrigger>
											)
										})}
									</div>
								</div>
							)
						)
					}
					return null
				}
			}
		)
	)
)
