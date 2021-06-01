import { SourceLayerType, ISourceLayer } from '@sofie-automation/blueprints-integration'
import { normalizeArray } from '../../../lib/lib'
import { ShowStyleBases } from '../../../lib/collections/ShowStyleBases'
import { PieceInstances, PieceInstance } from '../../../lib/collections/PieceInstances'
import { IPropsHeader } from './PieceIcon'

export function findPieceInstanceToShow(props: IPropsHeader, supportedLayers: Set<SourceLayerType>) {
	let pieceInstances = PieceInstances.find({ partInstanceId: props.partInstanceId }).fetch()
	let showStyleBase = ShowStyleBases.findOne(props.showStyleBaseId)

	let sourceLayers = showStyleBase
		? normalizeArray<ISourceLayer>(
				showStyleBase.sourceLayers.map((layer) => ({ ...layer })),
				'_id'
		  )
		: {}
	let foundSourceLayer: ISourceLayer | undefined
	let foundPiece: PieceInstance | undefined

	for (const pieceInstance of pieceInstances) {
		let layer = sourceLayers[pieceInstance.piece.sourceLayerId]
		if (layer && layer.onPresenterScreen && supportedLayers.has(layer.type)) {
			if (foundSourceLayer && foundPiece) {
				if (
					pieceInstance.piece.enable &&
					foundPiece.piece.enable &&
					((pieceInstance.piece.enable.start || 0) > (foundPiece.piece.enable.start || 0) ||
						layer._rank >= foundSourceLayer._rank) // TODO: look into this, what should the do, really?
				) {
					foundSourceLayer = layer
					foundPiece = pieceInstance
				}
			} else {
				foundSourceLayer = layer
				foundPiece = pieceInstance
			}
		}
	}

	return {
		sourceLayer: foundSourceLayer,
		pieceInstance: foundPiece,
	}
}
