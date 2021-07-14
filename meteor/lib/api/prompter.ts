import { Meteor } from 'meteor/meteor'
import { check } from '../../lib/check'
import * as _ from 'underscore'
import { ISourceLayer, ScriptContent, SourceLayerType } from '@sofie-automation/blueprints-integration'
import { RundownPlaylists, RundownPlaylistId } from '../collections/RundownPlaylists'
import { getRandomId, normalizeArray, normalizeArrayToMap } from '../lib'
import { SegmentId } from '../collections/Segments'
import { PieceId } from '../collections/Pieces'
import { getPieceInstancesForPartInstance, getSegmentsWithPartInstances } from '../Rundown'
import { PartInstanceId } from '../collections/PartInstances'
import { PartId } from '../collections/Parts'
import { FindOptions } from '../typings/meteor'
import { PieceInstance, PieceInstances } from '../collections/PieceInstances'
import { Rundown, RundownId } from '../collections/Rundowns'
import { ShowStyleBase, ShowStyleBaseId, ShowStyleBases } from '../collections/ShowStyleBases'
import { processAndPrunePieceInstanceTimings } from '../rundown/infinites'

// export interface NewPrompterAPI {
// 	getPrompterData (playlistId: RundownPlaylistId): Promise<PrompterData>
// }
// export enum PrompterAPIMethods {
// 	'getPrompterData' = 'PrompterMethods.getPrompterData'
// }

export interface PrompterDataSegment {
	id: SegmentId
	title: string | undefined
	parts: PrompterDataPart[]
}
export interface PrompterDataPart {
	id: PartInstanceId
	title: string | undefined
	pieces: PrompterDataPiece[]
}
export interface PrompterDataPiece {
	id: PieceId
	text: string
}
export interface PrompterData {
	title: string
	currentPartInstanceId: PartInstanceId | null
	nextPartInstanceId: PartInstanceId | null
	segments: Array<PrompterDataSegment>
}

export namespace PrompterAPI {
	// TODO: discuss: move this implementation to server-side?
	export function getPrompterData(playlistId: RundownPlaylistId): PrompterData {
		check(playlistId, String)

		const playlist = RundownPlaylists.findOne(playlistId)
		if (!playlist) throw new Meteor.Error(404, `RundownPlaylist "${playlistId}" not found!`)
		const rundowns = playlist.getRundowns()
		const rundownIdsToShowStyleBaseIds: Map<RundownId, ShowStyleBaseId> = new Map()
		const rundownIdsToShowStyleBase: Map<RundownId, [ShowStyleBase, Record<string, ISourceLayer>] | undefined> =
			new Map()
		for (const rundown of rundowns) {
			rundownIdsToShowStyleBaseIds.set(rundown._id, rundown.showStyleBaseId)
			const showStyleBase = ShowStyleBases.findOne(rundown.showStyleBaseId)
			rundownIdsToShowStyleBase.set(
				rundown._id,
				showStyleBase ? [showStyleBase, normalizeArray(showStyleBase.sourceLayers, '_id')] : undefined
			)
		}
		const rundownMap = normalizeArrayToMap(rundowns, '_id')

		const { currentPartInstance, nextPartInstance } = playlist.getSelectedPartInstances()

		const groupedParts = getSegmentsWithPartInstances(playlist, undefined, undefined, undefined, undefined, undefined, {
			fields: {
				isTaken: 0,
				previousPartEndState: 0,
				takeCount: 0,
				timings: 0,
			},
		})

		// const groupedParts = _.groupBy(parts, (p) => p.segmentId)

		const data: PrompterData = {
			title: playlist.name,
			currentPartInstanceId: currentPartInstance ? currentPartInstance._id : null,
			nextPartInstanceId: nextPartInstance ? nextPartInstance._id : null,
			segments: [],
		}

		const piecesIncluded: PieceId[] = []
		const segmentIds: SegmentId[] = groupedParts.map(({ segment }) => segment._id)
		const orderedAllPartIds: PartId[] = _.flatten(
			groupedParts.map(({ partInstances }) => partInstances.map((partInstance) => partInstance.part._id))
		)

		let nextPartIsAfterCurrentPart = false
		if (nextPartInstance && currentPartInstance) {
			if (nextPartInstance.segmentId === currentPartInstance.segmentId) {
				nextPartIsAfterCurrentPart = currentPartInstance.part._rank < nextPartInstance.part._rank
			} else {
				const nextPartSegmentIndex = segmentIds.indexOf(nextPartInstance.segmentId)
				const currentPartSegmentIndex = segmentIds.indexOf(currentPartInstance.segmentId)
				if (nextPartSegmentIndex >= 0 && currentPartSegmentIndex >= 0) {
					nextPartIsAfterCurrentPart = currentPartSegmentIndex < nextPartSegmentIndex
				}
			}
		}

		let currentRundownIndex = 0
		let previousRundown: Rundown | null = null
		const rundownIds = rundowns.map((rundown) => rundown._id)

		groupedParts.forEach(({ segment, partInstances }, segmentIndex) => {
			const segmentId = segment._id
			const rundown = rundownMap.get(segment.rundownId)
			if (rundown && rundown !== previousRundown) {
				currentRundownIndex = rundowns.indexOf(rundown)
				previousRundown = rundown
			}
			if ((segment && segment.isHidden) || !rundown) {
				// Skip if is hidden or rundown not found
				return
			}

			const segmentData: PrompterDataSegment = {
				id: segmentId,
				title: segment ? segment.name : undefined,
				parts: [],
			}

			const partIds = partInstances.map((part) => part.part._id)

			for (let partIndex = 0; partIndex < partInstances.length; partIndex++) {
				const partInstance = partInstances[partIndex]
				const partData: PrompterDataPart = {
					id: partInstance._id,
					title: partInstance.part.title,
					pieces: [],
				}

				const pieceInstanceFieldOptions: FindOptions<PieceInstance> = {
					fields: {
						startedPlayback: 0,
						stoppedPlayback: 0,
						userDuration: 0,
					},
				}

				const rawPieceInstances = getPieceInstancesForPartInstance(
					playlist.activationId,
					rundown,
					partInstance,
					new Set(partIds.slice(0, partIndex)),
					new Set(segmentIds.slice(0, segmentIndex)),
					rundownIds.slice(0, currentRundownIndex),
					rundownIdsToShowStyleBaseIds,
					orderedAllPartIds,
					nextPartIsAfterCurrentPart,
					currentPartInstance,
					currentPartInstance
						? PieceInstances.find(
								{
									partInstanceId: currentPartInstance._id,
								},
								pieceInstanceFieldOptions
						  ).fetch()
						: undefined,
					pieceInstanceFieldOptions,
					true
				)

				const showStyleBaseAndSLayers = rundownIdsToShowStyleBase.get(partInstance.rundownId)
				if (showStyleBaseAndSLayers) {
					const preprocessedPieces = processAndPrunePieceInstanceTimings(
						showStyleBaseAndSLayers[0],
						rawPieceInstances,
						0,
						true
					)

					preprocessedPieces.forEach((pieceInstance) => {
						const piece = pieceInstance.piece
						const sourceLayer = showStyleBaseAndSLayers[1][piece.sourceLayerId] as ISourceLayer | undefined

						if (piece.content && sourceLayer && sourceLayer.type === SourceLayerType.SCRIPT) {
							const content = piece.content as ScriptContent
							if (content.fullScript) {
								if (piecesIncluded.indexOf(piece.continuesRefId || piece._id) >= 0) {
									return // piece already included in prompter script
								}
								piecesIncluded.push(piece.continuesRefId || piece._id)
								partData.pieces.push({
									id: piece._id,
									text: content.fullScript,
								})
							}
						}
					})
				}

				if (partData.pieces.length === 0) {
					// insert an empty line
					partData.pieces.push({
						id: getRandomId(),
						text: '',
					})
				}

				segmentData.parts.push(partData)
			}

			data.segments.push(segmentData)
		})
		return data
	}
}

if (Meteor.isClient) {
	// @ts-ignore
	window.getPrompterData = PrompterAPI.getPrompterData
}
