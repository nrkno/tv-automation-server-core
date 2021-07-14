import { withTracker } from '../../lib/ReactMeteorData/ReactMeteorData'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import * as React from 'react'
import { SourceLayerType, ISourceLayer, VTContent } from '@sofie-automation/blueprints-integration'
import { ShowStyleBaseId } from '../../../lib/collections/ShowStyleBases'
import { PubSub } from '../../../lib/api/pubsub'
import { PieceInstance } from '../../../lib/collections/PieceInstances'
import { PartInstanceId } from '../../../lib/collections/PartInstances'
import { RundownId } from '../../../lib/collections/Rundowns'
import { findPieceInstanceToShow } from './utils'
import { Timediff } from '../ClockView/Timediff'
import { getCurrentTime } from '../../../lib/lib'

export interface IPropsHeader {
	partInstanceId: PartInstanceId
	rundownIds: RundownId[]
	showStyleBaseId: ShowStyleBaseId
	partExpectedDuration: number | undefined
	partStartedPlayback: number | undefined
	partAutoNext: boolean
}

export const PieceCountdownContainer = withTracker((props: IPropsHeader) => {
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
	class PieceCountdown extends MeteorReactComponent<
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
			const sourceDuration = (piece?.content as VTContent)?.sourceDuration
			const seek = (piece?.content as VTContent)?.seek || 0
			const pieceEnable = typeof piece?.enable.start !== 'number' ? 0 : piece?.enable.start
			if (
				this.props.partStartedPlayback &&
				this.props.sourceLayer &&
				piece &&
				piece.content &&
				sourceDuration &&
				((this.props.partAutoNext && pieceEnable + (sourceDuration - seek) < (this.props.partExpectedDuration || 0)) ||
					(!this.props.partAutoNext &&
						Math.abs(pieceEnable + (sourceDuration - seek) - (this.props.partExpectedDuration || 0)) > 500))
			) {
				const freezeCountdown = this.props.partStartedPlayback + pieceEnable + sourceDuration - getCurrentTime()
				if (freezeCountdown > 0) {
					return (
						<>
							<Timediff time={freezeCountdown} />
							<img className="freeze-icon" src="/icons/freeze-presenter-screen.svg" />
						</>
					)
				}
			}
			return null
		}
	}
)
