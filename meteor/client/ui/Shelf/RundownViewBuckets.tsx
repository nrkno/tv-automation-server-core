import * as React from 'react'
import { Bucket, BucketId } from '../../../lib/collections/Buckets'
import { BucketAdLib } from '../../../lib/collections/BucketAdlibs'
import { BucketPanel } from './BucketPanel'
import { ShowStyleBase } from '../../../lib/collections/ShowStyleBases'
import { AdLibPiece } from '../../../lib/collections/AdLibPieces'
import { ISourceLayer, IOutputLayer } from '@sofie-automation/blueprints-integration'
import { BucketAdLibAction } from '../../../lib/collections/BucketAdlibActions'
import { ShowStyleVariantId } from '../../../lib/collections/ShowStyleVariants'
import { StudioId } from '../../../lib/collections/Studios'

import { doUserAction, UserAction } from '../../lib/userAction'
import { ClientAPI } from '../../../lib/api/client'

import { withTranslation } from 'react-i18next'
import { faBars } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { unprotectString, partial, literal, ProtectedString } from '../../../lib/lib'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { getElementDocumentOffset } from '../../utils/positions'
import { UIStateStorage } from '../../lib/UIStateStorage'
import { doModalDialog, ModalDialogQueueItem } from '../../lib/ModalDialog'
import { ContextMenuTrigger } from '@jstarpl/react-contextmenu'
import { Translated } from '../../lib/ReactMeteorData/ReactMeteorData'

import { MeteorCall } from '../../../lib/api/methods'
import update from 'immutability-helper'

import { contextMenuHoldToDisplayTime } from '../../lib/lib'
import { RundownAPI } from '../../../lib/api/rundown'
import { AdLibPieceUi } from './AdLibPanel'
import { PieceUi } from '../SegmentTimeline/SegmentTimelineContainer'
import { IAdLibListItem } from './AdLibListItem'
import { setShelfContextMenuContext, ContextType as MenuContextType } from './ShelfContextMenu'
import RundownViewEventBus, {
	RundownViewEvents,
	BucketAdLibEvent,
	BucketEvent,
	IEventContext,
} from '../RundownView/RundownViewEventBus'

export interface BucketAdLibUi extends BucketAdLib {
	sourceLayer?: ISourceLayer
	outputLayer?: IOutputLayer
	status: RundownAPI.PieceStatusCode
}

export interface BucketAdLibActionUi extends AdLibPiece {
	bucketId: BucketId
	sourceLayer?: ISourceLayer
	outputLayer?: IOutputLayer
	isGlobal?: boolean
	isHidden?: boolean
	isSticky?: boolean
	isAction: true
	isClearSourceLayer?: boolean
	adlibAction: BucketAdLibAction
	contentMetaData?: any
	message?: string | null
	showStyleVariantId: ShowStyleVariantId
	studioId: StudioId
}

export type BucketAdLibItem = BucketAdLibUi | BucketAdLibActionUi

export function isAdLibAction(item: BucketAdLibItem): item is BucketAdLibActionUi {
	if (item['adlibAction']) {
		return true
	}
	return false
}

export function isAdLib(item: BucketAdLibItem): item is BucketAdLibUi {
	if (!item['adlibAction']) {
		return true
	}
	return false
}

interface IBucketsProps {
	buckets: Bucket[] | undefined
	playlist: RundownPlaylist
	showStyleBase: ShowStyleBase
	shouldQueue: boolean
	fullViewport: boolean
	displayBuckets?: number[]
	selectedPiece: BucketAdLibActionUi | BucketAdLibUi | IAdLibListItem | PieceUi | undefined

	onSelectPiece?: (piece: BucketAdLibItem | undefined) => void
}

interface IState {
	panelWidths: number[]
	contextBucket: Bucket | undefined
	contextBucketAdLib: BucketAdLibItem | undefined
	editedNameId: BucketId | undefined
	editedPieceName:
		| {
				bucketId: BucketId
				pieceId: ProtectedString<any>
		  }
		| undefined
	localBuckets: Bucket[]
}

export const RundownViewBuckets = withTranslation()(
	class RundownViewBuckets extends React.Component<Translated<IBucketsProps>, IState> {
		private _mouseLast: {
			x: number
			y: number
		} = {
			x: 0,
			y: 0,
		}
		private _mouseOffset: {
			x: number
			y: number
		} = {
			x: 0,
			y: 0,
		}
		private _mouseDown: number
		private _targetBucket: Bucket | undefined

		constructor(props: Translated<IBucketsProps>) {
			super(props)

			this.state = {
				panelWidths: [],
				contextBucket: undefined,
				contextBucketAdLib: undefined,
				editedNameId: undefined,
				editedPieceName: undefined,
				localBuckets: ([] as Bucket[]).concat(props.buckets || []),
			}
		}

		static getDerivedStateFromProps(props: IBucketsProps, state: IState) {
			return {
				panelWidths: props.buckets
					? props.buckets.map((bucket, index) =>
							state.panelWidths[index] !== undefined
								? state.panelWidths[index]
								: UIStateStorage.getItemNumber(
										'rundownView.shelf.buckets',
										unprotectString(bucket._id),
										bucket.width !== undefined ? bucket.width : 0.2
								  )
					  )
					: [],
			}
		}

		componentDidMount() {
			super.componentDidMount && super.componentDidMount()

			RundownViewEventBus.on(RundownViewEvents.CREATE_BUCKET, this.createNewBucket)
			RundownViewEventBus.on(RundownViewEvents.DELETE_BUCKET, this.deleteBucket)
			RundownViewEventBus.on(RundownViewEvents.RENAME_BUCKET, this.renameBucket)
			RundownViewEventBus.on(RundownViewEvents.EMPTY_BUCKET, this.emptyBucket)

			RundownViewEventBus.on(RundownViewEvents.DELETE_BUCKET_ADLIB, this.deleteBucketAdLib)
			RundownViewEventBus.on(RundownViewEvents.RENAME_BUCKET_ADLIB, this.beginRenameBucketAdLib)
		}

		componentWillUnmount() {
			super.componentWillUnmount && super.componentWillUnmount()

			RundownViewEventBus.off(RundownViewEvents.CREATE_BUCKET, this.createNewBucket)
			RundownViewEventBus.off(RundownViewEvents.DELETE_BUCKET, this.deleteBucket)
			RundownViewEventBus.off(RundownViewEvents.RENAME_BUCKET, this.renameBucket)
			RundownViewEventBus.off(RundownViewEvents.EMPTY_BUCKET, this.emptyBucket)

			RundownViewEventBus.off(RundownViewEvents.DELETE_BUCKET_ADLIB, this.deleteBucketAdLib)
			RundownViewEventBus.off(RundownViewEvents.RENAME_BUCKET_ADLIB, this.beginRenameBucketAdLib)
		}

		componentDidUpdate(prevProps: IBucketsProps) {
			if (this.props.buckets !== prevProps.buckets) {
				this.setState({
					localBuckets: ([] as Bucket[]).concat(this.props.buckets || []),
					panelWidths: (this.props.buckets || []).map((bucket) =>
						UIStateStorage.getItemNumber(
							'rundownView.shelf.buckets',
							unprotectString(bucket._id),
							bucket.width !== undefined ? bucket.width : 0.2
						)
					),
				})
			}
		}

		resize = (x: number, y: number) => {
			if (this.props.buckets && this._targetBucket) {
				const index = this.props.buckets.indexOf(this._targetBucket)
				if (index >= 0) {
					const panelWidths = ([] as number[]).concat(this.state.panelWidths)
					const delta = (this._mouseLast.x - x) / window.innerWidth
					const targetWidth = Math.min(1, Math.max(panelWidths[index] + delta, 0))
					panelWidths[index] = targetWidth
					if (index > 0 && targetWidth > 0) {
						panelWidths[index - 1] = Math.min(1, Math.max(panelWidths[index - 1] - delta, 0))
					}

					if (targetWidth > 0) {
						this._mouseLast.x = x
						this._mouseLast.y = y
					}

					this.setState({
						panelWidths,
					})
				}
			}
		}

		endResize = () => {
			// Re-enable pointer-events on the iframes, until the resizing ends
			document.querySelectorAll('iframe').forEach((iframe) => {
				iframe.style.pointerEvents = ''
			})

			if (this.props.buckets) {
				this.props.buckets.forEach((bucket, index) => {
					const width = this.state.panelWidths[index]
					UIStateStorage.setItem('rundownView.shelf.buckets', unprotectString(bucket._id), width)
				})
			}

			document.body.style.cursor = ''
		}

		beginResize = (x: number, y: number, targetBucket: Bucket, targetElement: HTMLElement) => {
			// Disable pointer-events on all iframes, until the resizing ends
			document.querySelectorAll('iframe').forEach((iframe) => {
				iframe.style.pointerEvents = 'none'
			})

			this._mouseLast.x = x
			this._mouseLast.y = y

			const handlePosition = getElementDocumentOffset(targetElement)
			if (handlePosition) {
				this._mouseOffset.x = handlePosition.left - window.scrollX - this._mouseLast.x
				this._mouseOffset.y = handlePosition.top - window.scrollY - this._mouseLast.y
			}

			document.body.style.cursor = 'ew-resize'

			this._mouseDown = Date.now()

			this._targetBucket = targetBucket
		}

		touchMoveHandle = (e: TouchEvent) => {
			this.resize(e.touches[0].clientX, e.touches[0].clientY)
		}

		touchOffHandle = (_e: TouchEvent) => {
			document.removeEventListener('touchmove', this.touchMoveHandle)
			document.removeEventListener('touchcancel', this.touchOffHandle)
			document.removeEventListener('touchend', this.touchOffHandle)

			this.endResize()
		}

		touchOnHandle = (e: React.TouchEvent<HTMLDivElement>, bucket: Bucket) => {
			document.addEventListener('touchmove', this.touchMoveHandle, {
				passive: false,
			})
			document.addEventListener('touchcancel', this.touchOffHandle)
			document.addEventListener('touchend', this.touchOffHandle, {
				passive: false,
			})

			if (e.touches.length > 1) {
				this.touchOffHandle(e.nativeEvent)
				return
			}

			e.preventDefault()

			this.beginResize(e.targetTouches[0].clientX, e.targetTouches[0].clientY, bucket, e.currentTarget)
		}

		dragHandle = (e: MouseEvent) => {
			if (e.buttons !== 1) {
				this.dropHandle(e)
				return
			}

			this.resize(e.clientX, e.clientY)
		}

		dropHandle = (_e: MouseEvent) => {
			document.removeEventListener('mouseup', this.dropHandle)
			document.removeEventListener('mouseleave', this.dropHandle)
			document.removeEventListener('mousemove', this.dragHandle)

			this.endResize()
		}

		grabHandle = (e: React.MouseEvent<HTMLDivElement>, bucket: Bucket) => {
			if (e.button !== 0) {
				return
			}

			document.addEventListener('mouseup', this.dropHandle)
			document.addEventListener('mouseleave', this.dropHandle)
			document.addEventListener('mousemove', this.dragHandle)

			e.preventDefault()

			this.beginResize(e.clientX, e.clientY, bucket, e.currentTarget)
		}

		clearContextBucket = () => {
			this.setState({
				contextBucket: undefined,
				contextBucketAdLib: undefined,
			})
		}

		createNewBucket = (e: IEventContext) => {
			const { t } = this.props

			doUserAction(
				t,
				e.context,
				UserAction.CREATE_BUCKET,
				(e) => MeteorCall.userAction.bucketsCreateNewBucket(e, t('New Bucket'), this.props.playlist.studioId, null),
				(_err, res) => {
					if (ClientAPI.isClientResponseSuccess(res)) {
						this.setState({
							editedNameId: (res.result as Bucket)._id,
						})
					}
				}
			)
		}

		beginRenameBucketAdLib = (e: BucketAdLibEvent | undefined) => {
			if (e) {
				const { piece } = e
				this.setState({
					editedPieceName: {
						bucketId: piece.bucketId,
						pieceId: piece._id,
					},
				})
			} else {
				this.setState({
					editedPieceName: undefined,
				})
			}
		}

		deleteBucketAdLib = (e: BucketAdLibEvent) => {
			const { t } = this.props
			const { piece: bucketAdLib } = e

			doModalDialog(
				literal<ModalDialogQueueItem>({
					message: t('Are you sure you want to delete this AdLib?'),
					title: bucketAdLib.name,
					onAccept: () => {
						const clb = (err) => {
							if (err) return

							if (
								this.props.onSelectPiece &&
								this.props.selectedPiece &&
								bucketAdLib._id === (this.props.selectedPiece as AdLibPieceUi)._id
							) {
								this.props.onSelectPiece(undefined)
							}
						}

						if (isAdLibAction(bucketAdLib)) {
							doUserAction(
								t,
								e.context,
								UserAction.REMOVE_BUCKET_ADLIB,
								(e) => MeteorCall.userAction.bucketsRemoveBucketAdLibAction(e, bucketAdLib.adlibAction._id),
								clb
							)
						} else {
							doUserAction(
								t,
								e.context,
								UserAction.REMOVE_BUCKET_ADLIB,
								(e) => MeteorCall.userAction.bucketsRemoveBucketAdLib(e, bucketAdLib._id),
								clb
							)
						}
					},
				})
			)
		}

		deleteBucket = (e: BucketEvent) => {
			const { t } = this.props
			const { bucket } = e

			doModalDialog(
				literal<ModalDialogQueueItem>({
					message: t('Are you sure you want to delete this Bucket?'),
					title: bucket.name,
					onAccept: () => {
						doUserAction(t, e.context, UserAction.REMOVE_BUCKET, (e) =>
							MeteorCall.userAction.bucketsRemoveBucket(e, bucket._id)
						)
					},
				})
			)
		}

		renameBucket = (e: BucketEvent) => {
			const { bucket } = e

			this.setState({
				editedNameId: bucket._id,
			})
		}

		emptyBucket = (e: BucketEvent) => {
			const { t } = this.props
			const { bucket } = e

			doModalDialog(
				literal<ModalDialogQueueItem>({
					message: t('Are you sure you want to empty (remove all adlibs inside) this Bucket?'),
					title: bucket.name,
					onAccept: () => {
						doUserAction(t, e.context, UserAction.EMPTY_BUCKET, (e) =>
							MeteorCall.userAction.bucketsEmptyBucket(e, bucket._id)
						)
					},
				})
			)
		}

		finishRenameBucket = (e: any, bucket: Bucket, newName: string) => {
			const { t } = this.props

			this.setState({
				editedNameId: undefined,
			})

			if (e.persist) e.persist()

			doUserAction(t, e, UserAction.MODIFY_BUCKET, (e) =>
				MeteorCall.userAction.bucketsModifyBucket(
					e,
					bucket._id,
					partial<Bucket>({
						name: newName,
					})
				)
			)
		}

		private moveBucket = (id: BucketId, atIndex: number) => {
			const { bucket, index } = this.findBucket(id)
			const panelWidth = this.state.panelWidths[index]

			if (bucket) {
				this.setState(
					update(this.state, {
						localBuckets: {
							$splice: [[index, 1], [atIndex, 0, bucket] as any],
						},
						panelWidths: {
							$splice: [[index, 1], [atIndex, 0, panelWidth] as any],
						},
					})
				)
			}
		}

		private findBucket = (id: BucketId) => {
			const { localBuckets: buckets } = this.state
			const bucket = buckets.find((b) => b._id === id)

			return {
				bucket,
				index: bucket ? buckets.indexOf(bucket) : -1,
			}
		}

		private onBucketReorder = (draggedId: BucketId, newIndex: number, oldIndex: number) => {
			const { t } = this.props
			if (this.props.buckets) {
				const draggedB = this.props.buckets.find((b) => b._id === draggedId)

				if (draggedB) {
					let newRank = draggedB._rank

					// Dragged over into first place
					if (newIndex === 0) {
						newRank = this.props.buckets[0]._rank - 1
						// Dragged over into last place
					} else if (newIndex === this.props.buckets.length - 1) {
						newRank = this.props.buckets[this.props.buckets.length - 1]._rank + 1
						// Last element swapped with next to last
					} else if (oldIndex === this.props.buckets.length - 1 && newIndex === this.props.buckets.length - 2) {
						newRank = (this.props.buckets[newIndex - 1]._rank + this.props.buckets[newIndex]._rank) / 2
						// Dragged into any other place
					} else {
						newRank = (this.props.buckets[newIndex]._rank + this.props.buckets[newIndex + 1]._rank) / 2
					}

					doUserAction(t, { type: 'drop' }, UserAction.MODIFY_BUCKET, (e) =>
						MeteorCall.userAction.bucketsModifyBucket(
							e,
							draggedB._id,
							partial<Bucket>({
								_rank: newRank,
							})
						)
					)
				}
			}
		}

		private onAdLibContext = (
			{ contextBucketAdLib, contextBucket }: { contextBucketAdLib: BucketAdLibItem; contextBucket: Bucket },
			callback: () => void
		) => {
			this.setState(
				{
					contextBucket,
					contextBucketAdLib,
				},
				callback
			)
		}

		private bucketPanelStyle = (index: number): React.CSSProperties => {
			return {
				minWidth: this.state.panelWidths[index] * 100 + 'vw',
			}
		}

		render() {
			const { playlist, showStyleBase, shouldQueue } = this.props
			const { localBuckets: buckets } = this.state
			return (
				<>
					{buckets &&
						buckets.map((bucket, index) =>
							!this.props.displayBuckets || this.props.displayBuckets.includes(index) ? (
								<div
									className="rundown-view__shelf__contents__pane"
									key={unprotectString(bucket._id)}
									style={this.bucketPanelStyle(index)}
								>
									{!this.props.fullViewport || index > 0 ? (
										<div
											className="rundown-view__shelf__contents__pane__divider"
											onMouseDown={(e) => this.grabHandle(e, bucket)}
											onTouchStart={(e) => this.touchOnHandle(e, bucket)}
										>
											<div className="rundown-view__shelf__contents__pane__handle">
												<FontAwesomeIcon icon={faBars} />
											</div>
										</div>
									) : null}
									<ContextMenuTrigger
										id="shelf-context-menu"
										attributes={{
											className: 'buckets',
										}}
										collect={() =>
											new Promise<void>((resolve) => {
												setShelfContextMenuContext({
													type: MenuContextType.BUCKET,
													details: {
														bucket,
													},
												})
												resolve()
											})
										}
										holdToDisplay={contextMenuHoldToDisplayTime()}
									>
										{this.state.panelWidths[index] > 0 && (
											<BucketPanel
												playlist={playlist}
												showStyleBase={showStyleBase}
												shouldQueue={shouldQueue}
												bucket={bucket}
												editableName={this.state.editedNameId === bucket._id}
												editedPiece={
													this.state.editedPieceName && this.state.editedPieceName.bucketId === bucket._id
														? this.state.editedPieceName.pieceId
														: undefined
												}
												onPieceNameRename={() => this.beginRenameBucketAdLib(undefined)}
												onNameChanged={(e, name) => this.finishRenameBucket(e, bucket, name)}
												moveBucket={this.moveBucket}
												findBucket={this.findBucket}
												onBucketReorder={this.onBucketReorder}
												onAdLibContext={this.onAdLibContext}
												onSelectAdlib={this.props.onSelectPiece}
												selectedPiece={this.props.selectedPiece}
												hotkeyGroup={bucket.name.replace(/\W/, '_') + 'BucketPanel'}
											/>
										)}
									</ContextMenuTrigger>
								</div>
							) : null
						)}
				</>
			)
		}
	}
)
