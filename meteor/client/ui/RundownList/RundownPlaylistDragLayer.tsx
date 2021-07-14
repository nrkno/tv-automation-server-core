import * as React from 'react'
import { DragLayer, DragLayerMonitor } from 'react-dnd'
import { IRundownDragObject, RundownListDragDropTypes } from './DragAndDropTypes'
import { Rundowns } from '../../../lib/collections/Rundowns'
import RundownListItemView from './RundownListItemView'
import { ShowStyleBases } from '../../../lib/collections/ShowStyleBases'
import { getElementWidth } from '../../utils/dimensions'
import { HTML_ID_PREFIX } from './RundownListItem'

const layerStyles: React.CSSProperties = {
	position: 'fixed',
	pointerEvents: 'none',
	zIndex: 100,
	left: 0,
	top: 0,
	width: '100%',
	height: '100%',
}

function getItemStyles(props) {
	const { currentOffset, draggedWidth } = props
	if (!currentOffset) {
		return {
			display: 'none',
		}
	}

	const { x, y } = currentOffset
	const transform = `translate3d(${x}px, ${y}px, 1px)`
	return {
		transform: transform,
		WebkitTransform: transform,
		width: draggedWidth ? `${draggedWidth}px` : undefined,
	}
}

function RundownPlaylistDragLayer(props) {
	if (!props.isDragging) {
		return null
	}

	function renderItem(type: RundownListDragDropTypes, item: IRundownDragObject) {
		switch (type) {
			case RundownListDragDropTypes.RUNDOWN: {
				const rundown = Rundowns.findOne(item.id)
				const showStyle = ShowStyleBases.findOne(rundown?.showStyleBaseId)
				const classNames = ['drag-preview'].concat(props.draggedClassNames || [])
				return (
					<RundownListItemView
						isActive={false}
						renderTooltips={false}
						rundown={rundown!}
						rundownLayouts={item.rundownLayouts}
						classNames={classNames}
						connectDragSource={(props) => props}
						connectDropTarget={(props) => props}
						htmlElementId="drag-preview"
						isDragLayer={true}
						showStyleName={showStyle?.name || ''}
					/>
				)
			}
		}
	}

	return (
		<div style={layerStyles} className="rundown-list">
			<div style={getItemStyles(props)}>{renderItem(props.itemType, props.item)}</div>
		</div>
	)
}

function collect(monitor: DragLayerMonitor) {
	let draggedWidth: number | undefined
	let draggedClassNames: string[] | undefined

	const dragging = monitor.getItem()
	if (dragging) {
		const { id } = dragging
		const htmlElementId = `${HTML_ID_PREFIX}${id}`
		const el = document.querySelector(`#${htmlElementId}`)
		if (el instanceof HTMLElement) {
			draggedWidth = getElementWidth(el)
			draggedClassNames = Array.from(el.classList)
		}
	}

	return {
		item: monitor.getItem(),
		itemType: monitor.getItemType(),
		currentOffset: monitor.getSourceClientOffset(),
		isDragging: monitor.isDragging(),
		draggedWidth,
		draggedClassNames,
	}
}

export default DragLayer(collect)(RundownPlaylistDragLayer)
