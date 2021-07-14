import React from 'react'
import {
	ConnectDropTarget,
	DropTarget,
	DropTargetCollector,
	DropTargetConnector,
	DropTargetMonitor,
	DropTargetSpec,
} from 'react-dnd'
import { withTranslation } from 'react-i18next'
import { RundownId } from '../../../lib/collections/Rundowns'
import { Translated } from '../../lib/ReactMeteorData/ReactMeteorData'
import {
	IRundownPlaylistUiAction,
	isRundownDragObject,
	RundownListDragDropTypes,
	RundownPlaylistUiActionTypes,
} from './DragAndDropTypes'

interface IRundownDropZoneProps {
	activated: boolean
	rundownDropHandler: (id: RundownId) => void
}

interface IRundownDropZoneDropTargetProps {
	connectDropTarget: ConnectDropTarget
	isOverCurrent: boolean
	itemType: string | symbol | null
}

const dropTargetSpec: DropTargetSpec<IRundownDropZoneProps> = {
	drop: (
		props: IRundownDropZoneProps,
		monitor: DropTargetMonitor,
		_component: any
	): IRundownPlaylistUiAction | undefined => {
		const dropped = monitor.getItem()

		console.debug('Drop on drop zone:', dropped)

		if (isRundownDragObject(dropped)) {
			props.rundownDropHandler(dropped.id)
			return {
				// the drop method must return an object to signal that the drop has been handled
				type: RundownPlaylistUiActionTypes.NOOP,
				rundownId: dropped.id,
			}
		}
	},
}

const dropTargetCollector: DropTargetCollector<IRundownDropZoneDropTargetProps, IRundownDropZoneProps> = function (
	connect: DropTargetConnector,
	monitor: DropTargetMonitor,
	_props: IRundownDropZoneProps
) {
	return {
		connectDropTarget: connect.dropTarget(),
		isOverCurrent: monitor.isOver({ shallow: true }),
		itemType: monitor.getItemType(),
	}
}

export const RundownDropZone = DropTarget(
	RundownListDragDropTypes.RUNDOWN,
	dropTargetSpec,
	dropTargetCollector
)(
	withTranslation()(function RundownDropZone(
		props: Translated<IRundownDropZoneProps> & IRundownDropZoneDropTargetProps
	) {
		const { t, activated, connectDropTarget } = props

		return connectDropTarget(
			<div className={`rundown-dropzone ${activated ? 'open' : ''}`}>
				<p>
					<b>{t('Drop rundown here to move it out of its current playlist')}</b>
				</p>
			</div>
		)
	})
)
