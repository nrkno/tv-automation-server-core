import { SourceLayerType, ISourceLayer } from '@sofie-automation/blueprints-integration'
import { normalizeArray } from '../../../lib/lib'
import { ShowStyleBases } from '../../../lib/collections/ShowStyleBases'
import { PieceInstances, PieceInstance } from '../../../lib/collections/PieceInstances'
import { IPropsHeader } from './PieceIcon'

interface IFoundPieceInstance {
	sourceLayer: ISourceLayer | undefined
	pieceInstance: PieceInstance | undefined
}

export function findPieceInstanceToShow(
	props: IPropsHeader,
	selectedLayerTypes: Set<SourceLayerType>
): IFoundPieceInstance {
	const pieceInstances = PieceInstances.find({ partInstanceId: props.partInstanceId }).fetch()
	const showStyleBase = ShowStyleBases.findOne(props.showStyleBaseId)

	if (!showStyleBase) {
		return {
			sourceLayer: undefined,
			pieceInstance: undefined,
		}
	}

	const sourceLayers = showStyleBase
		? normalizeArray<ISourceLayer>(
				showStyleBase.sourceLayers.map((layer) => ({ ...layer })),
				'_id'
		  )
		: {}

	return findPieceInstanceToShowFromInstances(pieceInstances, sourceLayers, selectedLayerTypes)
}

export function findPieceInstanceToShowFromInstances(
	pieceInstances: PieceInstance[],
	sourceLayers: {
		[key: string]: ISourceLayer
	},
	selectedLayerTypes: Set<SourceLayerType>
): IFoundPieceInstance {
	let foundSourceLayer: ISourceLayer | undefined
	let foundPiece: PieceInstance | undefined

	for (const pieceInstance of pieceInstances) {
		const layer = sourceLayers[pieceInstance.piece.sourceLayerId]
		if (layer && layer.onPresenterScreen && selectedLayerTypes.has(layer.type)) {
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
