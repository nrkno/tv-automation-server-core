import { Meteor } from 'meteor/meteor'
import * as React from 'react'
import * as _ from 'underscore'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import { Rundowns, Rundown } from '../../../lib/collections/Rundowns'
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
import {
	IOutputLayer,
	ISourceLayer,
	PieceLifespan,
	IBlueprintActionTriggerMode,
	SomeTimelineContent,
} from '@sofie-automation/blueprints-integration'
import { PubSub } from '../../../lib/api/pubsub'
import { doUserAction, UserAction } from '../../lib/userAction'
import { NotificationCenter, Notification, NoticeLevel } from '../../lib/notifications/notifications'
import { literal, unprotectString, partial, protectString } from '../../../lib/lib'
import {
	ensureHasTrailingSlash,
	contextMenuHoldToDisplayTime,
	UserAgentPointer,
	USER_AGENT_POINTER_PROPERTY,
} from '../../lib/lib'
import { Studio } from '../../../lib/collections/Studios'
import {
	IDashboardPanelTrackedProps,
	getUnfinishedPieceInstancesGrouped,
	getNextPieceInstancesGrouped,
	isAdLibOnAir,
} from './DashboardPanel'
import { BucketAdLib, BucketAdLibs } from '../../../lib/collections/BucketAdlibs'
import { Bucket, BucketId } from '../../../lib/collections/Buckets'
import { Events as MOSEvents } from '../../lib/data/mos/plugin-support'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { MeteorCall } from '../../../lib/api/methods'
import { DragDropItemTypes } from '../DragDropItemTypes'
import { PieceId } from '../../../lib/collections/Pieces'
import { BucketPieceButton } from './BucketPieceButton'
import { ContextMenuTrigger } from '@jstarpl/react-contextmenu'
import update from 'immutability-helper'
import { ShowStyleVariantId } from '../../../lib/collections/ShowStyleVariants'
import { PartInstances, PartInstance, DBPartInstance } from '../../../lib/collections/PartInstances'
import { AdLibPieceUi } from './AdLibPanel'
import { BucketAdLibActions, BucketAdLibAction } from '../../../lib/collections/BucketAdlibActions'
import { AdLibActionId } from '../../../lib/collections/AdLibActions'
import { RundownUtils } from '../../lib/rundown'
import { RundownAPI } from '../../../lib/api/rundown'
import { BucketAdLibItem, BucketAdLibActionUi, isAdLibAction, isAdLib, BucketAdLibUi } from './RundownViewBuckets'
import { PieceUi } from '../SegmentTimeline/SegmentTimelineContainer'
import { PieceDisplayStyle } from '../../../lib/collections/RundownLayouts'
import RundownViewEventBus, { RundownViewEvents, RevealInShelfEvent } from '../RundownView/RundownViewEventBus'
import { setShelfContextMenuContext, ContextType } from './ShelfContextMenu'
import { MongoFieldSpecifierOnes } from '../../../lib/typings/meteor'
import { translateMessage } from '../../../lib/api/TranslatableMessage'
import { i18nTranslator } from '../i18n'

const bucketSource = {
	beginDrag(props: IBucketPanelProps, monitor: DragSourceMonitor, component: any) {
		const size = {
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
	canDrop(_props: IBucketPanelProps, _monitor: DropTargetMonitor) {
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
	dropActive: boolean
	bucketName: string
	adLibPieces: BucketAdLibItem[]
	singleClickMode: boolean
}

export function actionToAdLibPieceUi(
	action: BucketAdLibAction,
	sourceLayers: _.Dictionary<ISourceLayer>,
	outputLayers: _.Dictionary<IOutputLayer>
): BucketAdLibActionUi {
	let sourceLayerId = ''
	let outputLayerId = ''
	let content: SomeTimelineContent = { timelineObjects: [] }
	if (RundownUtils.isAdlibActionContent(action.display)) {
		sourceLayerId = action.display.sourceLayerId
		outputLayerId = action.display.outputLayerId
		content = {
			timelineObjects: [],
			...action.display.content,
		}
	}

	return literal<BucketAdLibActionUi>({
		_id: protectString(`function_${action._id}`),
		name: translateMessage(action.display.label, i18nTranslator),
		status: RundownAPI.PieceStatusCode.UNKNOWN,
		isAction: true,
		expectedDuration: 0,
		externalId: unprotectString(action._id),
		rundownId: protectString(''), // value doesn't matter
		bucketId: action.bucketId,
		showStyleVariantId: action.showStyleVariantId,
		studioId: action.studioId,
		sourceLayer: sourceLayers[sourceLayerId],
		outputLayer: outputLayers[outputLayerId],
		sourceLayerId,
		outputLayerId,
		_rank: action.display._rank || 0,
		content: content,
		adlibAction: action,
		tags: action.display.tags,
		currentPieceTags: action.display.currentPieceTags,
		nextPieceTags: action.display.nextPieceTags,
		lifespan: PieceLifespan.WithinPart, // value doesn't matter
	})
}

export interface IBucketPanelProps {
	bucket: Bucket
	playlist: RundownPlaylist
	showStyleBase: ShowStyleBase
	shouldQueue: boolean
	hotkeyGroup: string
	editableName?: boolean
	selectedPiece: BucketAdLibActionUi | BucketAdLibUi | IAdLibListItem | PieceUi | undefined
	editedPiece: PieceId | undefined
	onNameChanged: (e: any, newName: string) => void
	moveBucket: (id: BucketId, atIndex: number) => void
	findBucket: (id: BucketId) => { bucket: Bucket | undefined; index: number }
	onBucketReorder: (draggedId: BucketId, newIndex: number, oldIndex: number) => void
	onSelectAdlib
	onAdLibContext: (args: { contextBucket: Bucket; contextBucketAdLib: BucketAdLibItem }, callback: () => void) => void
	onPieceNameRename: () => void
}

export interface IBucketPanelTrackedProps extends IDashboardPanelTrackedProps {
	adLibPieces: BucketAdLibItem[]
	studio: Studio
	showStyleVariantId: ShowStyleVariantId
	outputLayers: Record<string, IOutputLayer>
	sourceLayers: Record<string, ISourceLayer>
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
				fields: literal<MongoFieldSpecifierOnes<DBPartInstance>>({
					rundownId: 1,
					//@ts-ignore
					'part._id': 1,
				}),
			}) as Pick<PartInstance, 'rundownId'> | undefined
			if (part) {
				const rundown = Rundowns.findOne(part.rundownId, {
					fields: {
						showStyleVariantId: 1,
					},
				}) as Pick<Rundown, 'showStyleVariantId'> | undefined
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
			)[0] as Pick<Rundown, 'showStyleVariantId'> | undefined
			if (rundown) {
				showStyleVariantId = rundown.showStyleVariantId
			}
		}
		const tOLayers: {
			[key: string]: IOutputLayer
		} = {}
		const tSLayers: {
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

		const { unfinishedAdLibIds, unfinishedTags } = getUnfinishedPieceInstancesGrouped(
			props.playlist.currentPartInstanceId
		)
		const { nextAdLibIds, nextTags } = getNextPieceInstancesGrouped(props.playlist.nextPartInstanceId)
		const bucketAdLibPieces = BucketAdLibs.find({
			bucketId: props.bucket._id,
		}).fetch()
		const bucketActions = BucketAdLibActions.find({
			bucketId: props.bucket._id,
		})
			.fetch()
			.map((action) => actionToAdLibPieceUi(action, tSLayers, tOLayers))
		const allBucketItems = (bucketAdLibPieces as BucketAdLibItem[])
			.concat(bucketActions)
			.sort((a, b) => a._rank - b._rank || a.name.localeCompare(b.name))
		return literal<IBucketPanelTrackedProps>({
			adLibPieces: allBucketItems,
			studio: props.playlist.getStudio(),
			unfinishedAdLibIds,
			unfinishedTags,
			showStyleVariantId,
			nextAdLibIds,
			nextTags,
			outputLayers: tOLayers,
			sourceLayers: tSLayers,
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
						dropActive: false,
						bucketName: props.bucket.name,
						adLibPieces: props.adLibPieces.slice(),
						singleClickMode: false,
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
						this.subscribe(PubSub.bucketAdLibActions, {
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

					RundownViewEventBus.on(RundownViewEvents.REVEAL_IN_SHELF, this.onRevealInShelf)
				}

				componentDidUpdate(prevProps: IBucketPanelProps & IBucketPanelTrackedProps) {
					if (this.props.adLibPieces !== prevProps.adLibPieces) {
						this.setState({
							adLibPieces: ([] as BucketAdLibItem[]).concat(this.props.adLibPieces || []),
						})
					}

					RundownViewEventBus.off(RundownViewEvents.REVEAL_IN_SHELF, this.onRevealInShelf)
				}

				componentWillUnmount() {
					this._cleanUp()

					window.removeEventListener(MOSEvents.dragenter, this.onDragEnter)
					window.removeEventListener(MOSEvents.dragleave, this.onDragLeave)
				}

				onRevealInShelf = (e: RevealInShelfEvent) => {
					const { pieceId } = e
					if (pieceId) {
						let found = false
						const index = this.state.adLibPieces.findIndex((piece) => piece._id === pieceId)
						if (index >= 0) {
							found = true
						}

						if (found) {
							Meteor.setTimeout(() => {
								const el = document.querySelector(`.dashboard-panel__panel__button[data-obj-id="${pieceId}"]`)
								if (el) {
									el.scrollIntoView({
										behavior: 'smooth',
									})
								}
							}, 100)
						}
					}
				}

				isAdLibOnAir(adLibPiece: AdLibPieceUi) {
					return isAdLibOnAir(this.props.unfinishedAdLibIds, this.props.unfinishedTags, adLibPiece)
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

				onSelectAdLib = (_piece: BucketAdLibItem, _e: any) => {}

				onToggleAdLib = (piece: BucketAdLibItem, queue: boolean, e: any, mode?: IBlueprintActionTriggerMode) => {
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

					const sourceLayer = this.props.sourceLayers && this.props.sourceLayers[piece.sourceLayerId]

					if (queue && sourceLayer && !sourceLayer.isQueueable) {
						console.log(`Item "${piece._id}" is on sourceLayer "${piece.sourceLayerId}" that is not queueable.`)
						return
					}
					if (this.props.playlist && this.props.playlist.currentPartInstanceId) {
						if (isAdLibAction(piece as BucketAdLibItem)) {
							const bucketAction = piece as BucketAdLibActionUi
							doUserAction(t, e, UserAction.START_BUCKET_ADLIB, (e) =>
								MeteorCall.userAction.executeAction(
									e,
									this.props.playlist._id,
									bucketAction.adlibAction._id,
									bucketAction.adlibAction.actionId,
									bucketAction.adlibAction.userData,
									mode?.data
								)
							)
						} else {
							if (
								!this.isAdLibOnAir(piece as any as AdLibPieceUi) ||
								!(sourceLayer && sourceLayer.clearKeyboardHotkey)
							) {
								const currentPartInstanceId = this.props.playlist.currentPartInstanceId

								doUserAction(t, e, UserAction.START_BUCKET_ADLIB, (e) =>
									MeteorCall.userAction.bucketAdlibStart(
										e,
										this.props.playlist._id,
										currentPartInstanceId,
										piece._id,
										queue
									)
								)
							} else {
								if (sourceLayer && sourceLayer.clearKeyboardHotkey) {
									this.onClearAllSourceLayer(sourceLayer, e)
								}
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

				private findAdLib = (id: PieceId): { piece: BucketAdLibItem | undefined; index: number } => {
					const { adLibPieces: pieces } = this.state
					const piece = pieces.find((b) => b._id === id)

					return {
						piece,
						index: piece ? pieces.indexOf(piece) : -1,
					}
				}

				private onAdLibNameChanged = (e: any, piece: BucketAdLibItem, newName: string) => {
					const { t } = this.props
					if (isAdLib(piece)) {
						doUserAction(t, { type: 'drop' }, UserAction.MODIFY_BUCKET, (e) =>
							MeteorCall.userAction.bucketsModifyBucketAdLib(
								e,
								piece._id,
								partial<BucketAdLib>({
									name: newName,
								})
							)
						)
					} else if (isAdLibAction(piece)) {
						doUserAction(t, { type: 'drop' }, UserAction.MODIFY_BUCKET, (e) =>
							MeteorCall.userAction.bucketsModifyBucketAdLibAction(
								e,
								piece.adlibAction._id,
								partial<BucketAdLibAction>({
									//@ts-ignore deep property
									'display.label': newName,
								})
							)
						)
					}

					this.props.onPieceNameRename()
				}

				private onAdLibReorder = (draggedId: PieceId, newIndex: number, oldIndex: number) => {
					const { t } = this.props
					if (this.props.adLibPieces) {
						const draggedOver = this.props.adLibPieces[newIndex]

						const draggedB = this.props.adLibPieces.find((b) => b._id === draggedId)

						if (draggedOver && draggedB) {
							let newRank = draggedOver._rank

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

							if (isAdLib(draggedB)) {
								doUserAction(t, { type: 'drop' }, UserAction.MODIFY_BUCKET, (e) =>
									MeteorCall.userAction.bucketsModifyBucketAdLib(
										e,
										draggedB._id,
										partial<BucketAdLib>({
											_rank: newRank,
										})
									)
								)
							} else if (isAdLibAction(draggedB)) {
								doUserAction(t, { type: 'drop' }, UserAction.MODIFY_BUCKET, (e) =>
									MeteorCall.userAction.bucketsModifyBucketAdLibAction(
										e,
										draggedB.adlibAction._id,
										partial<BucketAdLibAction>({
											//@ts-ignore deep property
											'display._rank': newRank,
										})
									)
								)
							}
						}
					}
				}

				private onAdLibMove = (draggedId: PieceId | AdLibActionId, bucketId: BucketId) => {
					const { t } = this.props
					if (this.props.adLibPieces) {
						const draggedB = this.props.adLibPieces.find((b) => b._id === draggedId)

						if (draggedB && isAdLib(draggedB)) {
							doUserAction(t, { type: 'drop' }, UserAction.MODIFY_BUCKET_ADLIB, (e) =>
								MeteorCall.userAction.bucketsModifyBucketAdLib(
									e,
									draggedB._id,
									partial<BucketAdLib>({
										bucketId,
									})
								)
							)
						} else if (draggedB && isAdLibAction(draggedB)) {
							doUserAction(t, { type: 'drop' }, UserAction.MODIFY_BUCKET_ADLIB, (e) =>
								MeteorCall.userAction.bucketsModifyBucketAdLibAction(
									e,
									draggedB.adlibAction._id,
									partial<BucketAdLibAction>({
										bucketId,
									})
								)
							)
						}
					}
				}

				private setRef = (ref: HTMLDivElement) => {
					this._panel = ref
					if (this._panel) {
						const style = window.getComputedStyle(this._panel)
						// check if a special variable is set through CSS to indicate that we shouldn't expect
						// double clicks to trigger AdLibs
						const value = style.getPropertyValue(USER_AGENT_POINTER_PROPERTY)
						if (this.state.singleClickMode !== (value === UserAgentPointer.NO_POINTER)) {
							this.setState({
								singleClickMode: value === UserAgentPointer.NO_POINTER,
							})
						}
					}
				}

				render() {
					const { connectDragSource, connectDragPreview, connectDropTarget } = this.props

					if (this.props.showStyleBase) {
						return connectDragPreview(
							connectDropTarget(
								<div
									className={ClassNames('dashboard-panel', 'dashboard-panel__panel--bucket', {
										'dashboard-panel__panel--bucket-active': this.state.dropActive,
										'dashboard-panel__panel--sort-dragging': this.props.isDragging,
									})}
									data-bucket-id={this.props.bucket._id}
									ref={this.setRef}
								>
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
										{this.state.adLibPieces.map((adlib: BucketAdLibItem) => (
											<ContextMenuTrigger
												id="shelf-context-menu"
												collect={() =>
													setShelfContextMenuContext({
														type: ContextType.BUCKET_ADLIB,
														details: {
															adLib: adlib,
															bucket: this.props.bucket,
															onToggle: this.onToggleAdLib,
														},
													})
												}
												renderTag="span"
												key={unprotectString(adlib._id)}
												holdToDisplay={contextMenuHoldToDisplayTime()}
											>
												<BucketPieceButton
													piece={adlib as any as IAdLibListItem}
													studio={this.props.studio}
													bucketId={adlib.bucketId}
													layer={this.props.sourceLayers[adlib.sourceLayerId]}
													outputLayer={this.props.outputLayers[adlib.outputLayerId]}
													onToggleAdLib={this.onToggleAdLib as any}
													onSelectAdLib={this.onSelectAdLib as any}
													playlist={this.props.playlist}
													isOnAir={this.isAdLibOnAir(adlib as any as AdLibPieceUi)}
													mediaPreviewUrl={
														this.props.studio
															? ensureHasTrailingSlash(this.props.studio.settings.mediaPreviewsUrl + '' || '') || ''
															: ''
													}
													// Hack: Julian: The adlibs are still executable, so the colour change was reported as a bug https://app.asana.com/0/1200403895331886/1200477738053366.
													// They should be disabled, but we don't have the structure in place for multiple versions, or even regenerating them when changing variant so this will have to do for now
													// disabled={adlib.showStyleVariantId !== this.props.showStyleVariantId}
													findAdLib={this.findAdLib}
													moveAdLib={this.moveAdLib}
													editableName={this.props.editedPiece === adlib._id}
													onNameChanged={(e, name) => this.onAdLibNameChanged(e, adlib, name)}
													onAdLibReorder={this.onAdLibReorder}
													onAdLibMove={this.onAdLibMove}
													isSelected={
														this.props.selectedPiece &&
														RundownUtils.isAdLibPiece(this.props.selectedPiece) &&
														adlib._id === this.props.selectedPiece._id
													}
													toggleOnSingleClick={this.state.singleClickMode}
													displayStyle={PieceDisplayStyle.BUTTONS}
												>
													{adlib.name}
												</BucketPieceButton>
											</ContextMenuTrigger>
										))}
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
