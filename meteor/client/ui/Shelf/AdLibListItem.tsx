import * as React from 'react'
import ClassNames from 'classnames'
import { Translated } from '../../lib/ReactMeteorData/react-meteor-data'
import { RundownAPI } from '../../../lib/api/rundown'

import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { ISourceLayer, IOutputLayer, IBlueprintActionTriggerMode } from '@sofie-automation/blueprints-integration'
import { AdLibPieceUi } from './AdLibPanel'
import { ScanInfoForPackages } from '../../../lib/mediaObjects'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { unprotectString } from '../../../lib/lib'
import renderItem from './Renderers/ItemRendererFactory'
import { withMediaObjectStatus } from '../SegmentTimeline/withMediaObjectStatus'
import { Studio } from '../../../lib/collections/Studios'
import { ContextMenuTrigger } from '@jstarpl/react-contextmenu'
import { contextMenuHoldToDisplayTime } from '../../lib/lib'
import { setShelfContextMenuContext, ContextType as MenuContextType } from './ShelfContextMenu'

export interface IAdLibListItem extends AdLibPieceUi {
	status: RundownAPI.PieceStatusCode
	contentMetaData?: any
	contentPackageInfos?: ScanInfoForPackages
	sourceLayer?: ISourceLayer
	outputLayer?: IOutputLayer
	hotkey?: string
	isHidden?: boolean
	invalid?: boolean
	floated?: boolean
}

interface IListViewItemProps {
	piece: IAdLibListItem
	studio: Studio
	layer: ISourceLayer | undefined
	selected: boolean
	onSelectAdLib: (aSLine: IAdLibListItem) => void
	onToggleAdLib: (aSLine: IAdLibListItem, queue: boolean, context: any, mode?: IBlueprintActionTriggerMode) => void
	playlist: RundownPlaylist
}

const _isMacLike = !!navigator.platform.match(/(Mac|iPhone|iPod|iPad)/i)

export const AdLibListItem = withMediaObjectStatus<IListViewItemProps, {}>()(
	class AdLibListItem extends MeteorReactComponent<Translated<IListViewItemProps>> {
		constructor(props: IListViewItemProps) {
			super(props)
		}

		render() {
			return (
				<ContextMenuTrigger
					id="shelf-context-menu"
					attributes={{
						className: ClassNames('adlib-panel__list-view__list__segment__item', {
							selected: this.props.selected,
							invalid: this.props.piece.invalid,
							floated: this.props.piece.floated,
						}),
						//@ts-ignore React.HTMLAttributes does not list data attributes, but that's fine
						'data-obj-id': this.props.piece._id,
						onClick: () => this.props.onSelectAdLib(this.props.piece),
						onContextMenu: () => this.props.onSelectAdLib(this.props.piece),
						onDoubleClick: (e) => this.props.onToggleAdLib(this.props.piece, e.shiftKey, e),
					}}
					collect={() =>
						setShelfContextMenuContext({
							type: MenuContextType.ADLIB,
							details: {
								adLib: this.props.piece,
								onToggle: this.props.onToggleAdLib,
							},
						})
					}
					holdToDisplay={contextMenuHoldToDisplayTime()}
					renderTag="tr"
					key={unprotectString(this.props.piece._id)}
				>
					{renderItem({
						adLibListItem: this.props.piece,
						layer: this.props.layer,
						outputLayer: this.props.piece.outputLayer,
						selected: this.props.selected,
						status: this.props.piece.status,
						message: this.props.piece.message,
						metadata: this.props.piece.contentMetaData,
						mediaPreviewUrl: this.props.studio.settings.mediaPreviewsUrl,
						packageInfos: this.props.piece.contentPackageInfos,
						studioPackageContainers: this.props.studio.packageContainers,
					})}
				</ContextMenuTrigger>
			)
		}
	}
)
