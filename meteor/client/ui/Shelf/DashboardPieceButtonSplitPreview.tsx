import * as React from 'react'
import * as _ from 'underscore'
import ClassNames from 'classnames'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { RundownUtils } from '../../lib/rundown'
import { SourceLayerType, SplitsContent } from '@sofie-automation/blueprints-integration'
import { SplitRole } from '../SegmentTimeline/Renderers/SplitsSourceRenderer'
import { literal } from '../../../lib/lib'
import { PieceGeneric } from '../../../lib/collections/Pieces'

interface SplitSubItem {
	_id: string
	type: SourceLayerType
	role: SplitRole
	content?: any
}

interface IProps {
	piece: PieceGeneric
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

export const DashboardPieceButtonSplitPreview = translateWithTracker<IProps, {}, {}>((_props: IProps) => {
	return {}
})(
	class DashboardPieceButtonSplitPreview extends MeteorReactComponent<Translated<IProps>> {
		private objId: string

		constructor(props: IProps) {
			super(props)
		}

		render() {
			const subItems = _.map((this.props.piece.content as SplitsContent).boxSourceConfiguration, (item, index) => {
				return literal<SplitSubItem>({
					_id: item.studioLabel + '_' + index,
					type: item.type,
					role: SplitRole.BOX,
					content: item.geometry || DEFAULT_POSITIONS[index],
				})
			})
			return (
				<div className="video-preview">
					{subItems.reverse().map((item, index, array) => {
						return (
							<div
								className={ClassNames(
									'video-preview',
									RundownUtils.getSourceLayerClassName(item.type),
									{
										background: item.role === SplitRole.ART,
										box: item.role === SplitRole.BOX,
									},
									{
										second: array.length > 1 && index > 0 && item.type === array[index - 1].type,
									}
								)}
								key={item._id + '-preview'}
								style={{
									left: ((item.content && item.content.x) * 100).toString() + '%',
									top: ((item.content && item.content.y) * 100).toString() + '%',
									width: ((item.content && item.content.scale) * 100).toString() + '%',
									height: ((item.content && item.content.scale) * 100).toString() + '%',
									clipPath:
										item.content && item.content.crop
											? `inset(${item.content.crop.top * 100}% ${item.content.crop.right * 100}% ${
													item.content.crop.bottom * 100
											  }% ${item.content.crop.left * 100}%)`
											: undefined,
								}}
							></div>
						)
					})}
				</div>
			)
		}
	}
)
