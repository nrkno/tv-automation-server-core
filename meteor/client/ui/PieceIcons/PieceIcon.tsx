import { withTracker } from '../../lib/ReactMeteorData/ReactMeteorData'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import * as React from 'react'
import { SourceLayerType, ISourceLayer, CameraContent, RemoteContent } from '@sofie-automation/blueprints-integration'
import CamInputIcon from './Renderers/CamInput'
import VTInputIcon from './Renderers/VTInput'
import SplitInputIcon from './Renderers/SplitInput'
import RemoteInputIcon from './Renderers/RemoteInput'
import LiveSpeakInputIcon from './Renderers/LiveSpeakInput'
import GraphicsInputIcon from './Renderers/GraphicsInput'
import { ShowStyleBaseId } from '../../../lib/collections/ShowStyleBases'
import { PubSub } from '../../../lib/api/pubsub'
import { PieceInstance } from '../../../lib/collections/PieceInstances'
import { PartInstanceId } from '../../../lib/collections/PartInstances'
import { RundownId } from '../../../lib/collections/Rundowns'
import { findPieceInstanceToShow } from './utils'

export interface IPropsHeader {
	partInstanceId: PartInstanceId
	rundownIds: RundownId[]
	showStyleBaseId: ShowStyleBaseId
}

export const PieceIconContainer = withTracker((props: IPropsHeader) => {
	const supportedLayers = new Set([
		SourceLayerType.GRAPHICS,
		SourceLayerType.LIVE_SPEAK,
		SourceLayerType.REMOTE,
		SourceLayerType.SPLITS,
		SourceLayerType.VT,
		SourceLayerType.CAMERA,
	])
	return findPieceInstanceToShow(props, supportedLayers)
})(
	class PieceIconContainer extends MeteorReactComponent<
		IPropsHeader & { sourceLayer: ISourceLayer; pieceInstance: PieceInstance }
	> {
		componentDidMount() {
			this.subscribe(PubSub.pieceInstancesSimple, {
				rundownId: { $in: this.props.rundownIds },
			})
			this.subscribe(PubSub.showStyleBases, {
				_id: this.props.showStyleBaseId,
			})
		}

		render() {
			const piece = this.props.pieceInstance ? this.props.pieceInstance.piece : undefined
			if (this.props.sourceLayer && piece) {
				switch (this.props.sourceLayer.type) {
					case SourceLayerType.GRAPHICS:
						return <GraphicsInputIcon abbreviation={this.props.sourceLayer.abbreviation} />
					case SourceLayerType.LIVE_SPEAK:
						return <LiveSpeakInputIcon abbreviation={this.props.sourceLayer.abbreviation} />
					case SourceLayerType.REMOTE:
						const rmContent = piece ? (piece.content as RemoteContent | undefined) : undefined
						return (
							<RemoteInputIcon
								inputIndex={rmContent ? rmContent.studioLabel : undefined}
								abbreviation={this.props.sourceLayer.abbreviation}
							/>
						)
					case SourceLayerType.SPLITS:
						return <SplitInputIcon abbreviation={this.props.sourceLayer.abbreviation} piece={piece} />
					case SourceLayerType.VT:
						return <VTInputIcon abbreviation={this.props.sourceLayer.abbreviation} />
					case SourceLayerType.CAMERA:
						const camContent = piece ? (piece.content as CameraContent | undefined) : undefined
						return (
							<CamInputIcon
								inputIndex={camContent ? camContent.studioLabel : undefined}
								abbreviation={this.props.sourceLayer.abbreviation}
							/>
						)
				}
			}
			return null
		}
	}
)
