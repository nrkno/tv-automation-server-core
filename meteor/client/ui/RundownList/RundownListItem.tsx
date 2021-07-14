import React from 'react'
import { Rundown, RundownId } from '../../../lib/collections/Rundowns'
import { ShowStyleBase } from '../../../lib/collections/ShowStyleBases'
import { Studio, Studios } from '../../../lib/collections/Studios'
import { getAllowConfigure, getAllowService, getAllowStudio } from '../../lib/localStorage'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/ReactMeteorData'
import { confirmDeleteRundown, confirmReSyncRundown, getShowStyleBaseLink } from './util'
import { UIStateStorage } from '../../lib/UIStateStorage'
import {
	ConnectDragSource,
	ConnectDropTarget,
	DragElementWrapper,
	DragPreviewOptions,
	DragSource,
	DragSourceCollector,
	DragSourceConnector,
	DragSourceMonitor,
	DragSourceSpec,
	DropTarget,
	DropTargetCollector,
	DropTargetConnector,
	DropTargetMonitor,
	DropTargetSpec,
} from 'react-dnd'
import {
	IRundownDragObject,
	IRundownPlaylistUiAction,
	isRundownDragObject,
	RundownListDragDropTypes,
	RundownPlaylistUiActionTypes,
} from './DragAndDropTypes'
import { getEmptyImage } from 'react-dnd-html5-backend'
import { unprotectString } from '../../../lib/lib'
import RundownListItemView from './RundownListItemView'
import { Settings } from '../../../lib/Settings'
import { RundownPlaylistId } from '../../../lib/collections/RundownPlaylists'
import { MeteorCall } from '../../../lib/api/methods'
import { ShowStyleVariant } from '../../../lib/collections/ShowStyleVariants'
import { doUserAction, UserAction } from '../../lib/userAction'
import { RundownLayoutBase } from '../../../lib/collections/RundownLayouts'

export const HTML_ID_PREFIX = 'rundown-'

export interface IRundownListItemProps {
	isActive: boolean
	rundown: Rundown
	rundownViewUrl?: string
	rundownLayouts: Array<RundownLayoutBase>
	swapRundownOrder: (a: RundownId, b: RundownId) => void
	playlistId: RundownPlaylistId
	isOnlyRundownInPlaylist?: boolean
	action?: IRundownPlaylistUiAction
}

interface IRundownListItemTrackedProps {
	studio: Studio | undefined
	showStyleBase: ShowStyleBase | undefined
	showStyleVariant: ShowStyleVariant | undefined
}

interface IRundownDragSourceProps {
	connectDragSource: ConnectDragSource
	dragPreview: DragElementWrapper<DragPreviewOptions>
	isDragging: boolean
}

const dragSpec: DragSourceSpec<IRundownListItemProps, IRundownDragObject> = {
	beginDrag: (props: IRundownListItemProps, _monitor, _component: React.Component) => {
		const id = props.rundown._id
		return { id, rundownLayouts: props.rundownLayouts }
	},
	isDragging: (props, monitor) => {
		return props.rundown._id === monitor.getItem().id
	},
}

const dragCollector: DragSourceCollector<IRundownDragSourceProps, IRundownListItemProps> = function (
	connect: DragSourceConnector,
	monitor: DragSourceMonitor,
	_props: IRundownListItemProps
): IRundownDragSourceProps {
	return {
		connectDragSource: connect.dragSource(),
		dragPreview: connect.dragPreview(),
		isDragging: monitor.isDragging(),
	}
}

interface IRundownDropTargetProps {
	connectDropTarget: ConnectDropTarget
}

const dropSpec: DropTargetSpec<IRundownListItemProps> = {
	canDrop: (props: IRundownListItemProps, monitor: DropTargetMonitor): boolean => {
		/*
		 * Dropping a rundown on a rundown will add that rundown to the rundown's
		 * parent playlist. This is only allowed if enabled in settings.
		 * In addition it also should not be handled if the rundown is part of a
		 * playlist with multiple rundowns, because then the playlist component
		 * will be the legal drop target and handle the drop itself.
		 */
		return (
			Settings.allowMultiplePlaylistsInGUI === true &&
			props.isOnlyRundownInPlaylist === true &&
			props.playlistId !== undefined &&
			monitor.getItemType() === RundownListDragDropTypes.RUNDOWN
		)
	},

	drop(props: IRundownListItemProps, monitor: DropTargetMonitor) {
		if (monitor.didDrop()) {
			return
		}

		const dropped = monitor.getItem()

		console.debug(`Drop on rundown ${props.rundown._id} (playlist ${props.playlistId}):`, dropped)

		if (isRundownDragObject(dropped)) {
			return {
				type: 'HANDLE_RUNDOWN_DROP',
				rundownId: dropped.id,
				targetPlaylistId: props.playlistId,
			}
		}
	},

	hover(props: IRundownListItemProps, monitor: DropTargetMonitor) {
		if (monitor.getItemType() === RundownListDragDropTypes.RUNDOWN) {
			const item = monitor.getItem() as IRundownDragObject

			// if that rundown is not this rundown
			if (item && props.rundown._id !== item.id) {
				props.swapRundownOrder(props.rundown._id, item.id)
			}
		}
	},
}

const dropCollect: DropTargetCollector<IRundownDropTargetProps, IRundownListItemProps> = (
	connect: DropTargetConnector,
	_monitor: DropTargetMonitor,
	_props: IRundownListItemProps
) => {
	return {
		connectDropTarget: connect.dropTarget(),
	}
}

// interface IRundownDragLayerProps {
// 	currentOffset: XYCoord | null
// 	clientOffset: XYCoord | null
// }

// const dragLayerCollect: DragLayerCollector<IRundownDragSourceProps & IRundownListItemProps, IRundownDragLayerProps> =
// 	function (monitor, props) {
// 		let currentOffset: XYCoord | null = null
// 		let clientOffset: XYCoord | null = null

// 		if (monitor.getItem()?.id === props.rundown._id) {
// 			currentOffset = monitor.getDifferenceFromInitialOffset()
// 			clientOffset = monitor.getClientOffset()
// 		}

// 		return {
// 			currentOffset,
// 			clientOffset,
// 		}
// 	}

export const RundownListItem = translateWithTracker<IRundownListItemProps, {}, IRundownListItemTrackedProps>(
	(props: Translated<IRundownListItemProps>) => {
		let studio: Studio | undefined = undefined
		let showStyle: ShowStyleBase | undefined = undefined
		let showStyleVariant: ShowStyleVariant | undefined = undefined

		try {
			studio = Studios.findOne(props.rundown.studioId)
		} catch (e) {
			// this is fine, we'll probably have it eventually and the component can render without it
		}
		try {
			showStyle = props.rundown.getShowStyleBase()
		} catch (e) {
			// this is fine, we'll probably have it eventually and the component can render without it
		}
		try {
			showStyleVariant = props.rundown.getShowStyleVariant()
		} catch (e) {
			// this is fine, we'll probably have it eventually and the component can render without it
		}

		return {
			studio,
			showStyleBase: showStyle,
			showStyleVariant,
		}
	}
)(
	DragSource(
		RundownListDragDropTypes.RUNDOWN,
		dragSpec,
		dragCollector
	)(
		DropTarget(
			RundownListDragDropTypes.RUNDOWN,
			dropSpec,
			dropCollect
		)(
			class RundownListItem extends React.Component<
				Translated<IRundownListItemProps> &
					IRundownDragSourceProps &
					IRundownDropTargetProps &
					IRundownListItemTrackedProps
			> {
				constructor(
					props: Translated<IRundownListItemProps> &
						IRundownDragSourceProps &
						IRundownDropTargetProps &
						IRundownListItemTrackedProps
				) {
					super(props)

					this.state = {
						selectedView: UIStateStorage.getItemString(`rundownList.${props.studio?._id}`, 'defaultView', 'default'),
					}

					this.props.dragPreview(getEmptyImage()) // override default dom node screenshot behavior
				}

				handleRundownDrop(rundownId: RundownId) {
					const { rundown, playlistId, t } = this.props
					doUserAction(t, 'Drag and drop add rundown to playlist', UserAction.RUNDOWN_ORDER_MOVE, (e) =>
						MeteorCall.userAction.moveRundown(e, rundownId, playlistId, [rundown._id, rundownId])
					)
				}

				componentDidUpdate(prevProps) {
					const { action } = this.props
					if (action && action.targetPlaylistId === this.props.playlistId) {
						const { type, rundownId } = action
						switch (type) {
							case RundownPlaylistUiActionTypes.HANDLE_RUNDOWN_DROP:
								this.handleRundownDrop(rundownId)
								break
							default:
								console.debug(`Unknown action type ${type}`, this.props.action)
						}
					}

					if (prevProps.studio !== this.props.studio) {
						this.setState({
							selectedView: UIStateStorage.getItemString(
								`rundownList.${this.props.studio?._id}`,
								'defaultView',
								'default'
							),
						})
					}
				}

				render() {
					const {
						isActive,
						t,
						rundown,
						connectDragSource,
						connectDropTarget,
						isDragging,
						rundownViewUrl,
						rundownLayouts,
						isOnlyRundownInPlaylist,
					} = this.props
					const userCanConfigure = getAllowConfigure()

					const classNames: string[] = []
					if (isDragging) classNames.push('dragging')
					if (rundown.orphaned) classNames.push('unsynced')

					// rundown ids can start with digits, which is illegal for HTML id attributes
					const htmlElementId = `${HTML_ID_PREFIX}${unprotectString(rundown._id)}`

					const showStyleLabel =
						this.props.showStyleVariant &&
						this.props.showStyleBase &&
						this.props.showStyleVariant.name !== this.props.showStyleBase.name
							? t('{{showStyleVariant}} – {{showStyleBase}}', {
									showStyleVariant: this.props.showStyleVariant.name,
									showStyleBase: this.props.showStyleBase.name,
							  })
							: this.props.showStyleBase?.name || ''

					return (
						<RundownListItemView
							isActive={isActive}
							classNames={classNames}
							connectDragSource={connectDragSource}
							connectDropTarget={connectDropTarget}
							htmlElementId={htmlElementId}
							isDragLayer={false}
							renderTooltips={isDragging !== true}
							rundownViewUrl={rundownViewUrl}
							rundown={rundown}
							isOnlyRundownInPlaylist={isOnlyRundownInPlaylist}
							rundownLayouts={rundownLayouts}
							showStyleName={showStyleLabel}
							showStyleBaseURL={userCanConfigure ? getShowStyleBaseLink(rundown.showStyleBaseId) : undefined}
							confirmDeleteRundownHandler={
								(rundown.orphaned && getAllowStudio()) || userCanConfigure || getAllowService()
									? () => confirmDeleteRundown(rundown, t)
									: undefined
							}
							confirmReSyncRundownHandler={
								rundown.orphaned && getAllowStudio() ? () => confirmReSyncRundown(rundown, t) : undefined
							}
						/>
					)
				}
			}
		)
	)
)
