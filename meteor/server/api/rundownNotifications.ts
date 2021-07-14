import { Meteor } from 'meteor/meteor'
import {
	RundownNotificationsAPI,
	IMediaObjectIssue,
	RundownNotificationsAPIMethods,
} from '../../lib/api/rundownNotifications'
import { registerClassToMeteorMethods } from '../methods'
import { RundownId, Rundowns } from '../../lib/collections/Rundowns'
import { PartNote } from '../../lib/api/notes'
import { makePromise, normalizeArrayToMap } from '../../lib/lib'
import { getSegmentPartNotes } from '../../lib/rundownNotifications'
import { MethodContextAPI } from '../../lib/api/methods'
import { RundownReadAccess } from '../security/rundown'
import { triggerWriteAccessBecauseNoCheckNecessary } from '../security/lib/securityVerify'
import _ from 'underscore'
import { RundownAPI } from '../../lib/api/rundown'
import { Parts } from '../../lib/collections/Parts'
import { Pieces } from '../../lib/collections/Pieces'
import { Segments } from '../../lib/collections/Segments'
import { ShowStyleBases } from '../../lib/collections/ShowStyleBases'
import { Studios } from '../../lib/collections/Studios'
import { checkPieceContentStatus } from '../../lib/mediaObjects'

async function getMediaObjectIssues(rundownIds: RundownId[]): Promise<IMediaObjectIssue[]> {
	const rundowns = await Rundowns.findFetchAsync({
		_id: {
			$in: rundownIds,
		},
	})

	const allStatus = Promise.all(
		rundowns.map(async (rundown) => {
			const [showStyle, rundownStudio] = await Promise.all([
				ShowStyleBases.findOneAsync(rundown.showStyleBaseId),
				Studios.findOneAsync(rundown.studioId),
			])

			if (showStyle && rundownStudio) {
				const showStyleBase = showStyle
				const studio = rundownStudio

				const pSegments = Segments.findFetchAsync({ rundownId: rundown._id })

				const pieces = await Pieces.findFetchAsync({
					startRundownId: rundown._id,
				})
				const parts = await Parts.findFetchAsync(
					{
						_id: { $in: pieces.map((p) => p.startPartId) },
					},
					{
						fields: {
							_id: 1,
							_rank: 1,
							title: 1,
							segmentId: 1,
						},
					}
				)
				const partMap = normalizeArrayToMap(parts, '_id')
				const segmentsMap = normalizeArrayToMap(await pSegments, '_id')

				const pieceStatus = pieces.map(async (piece) =>
					makePromise(() => {
						// run these in parallel. checkPieceContentStatus does some db ops
						const sourceLayer = showStyleBase.sourceLayers.find((i) => i._id === piece.sourceLayerId)
						const part = partMap.get(piece.startPartId)
						const segment = part ? segmentsMap.get(part.segmentId) : undefined
						if (segment && sourceLayer && part) {
							// we don't want this to be in a non-reactive context, so we manage this computation manually
							const { status, message } = checkPieceContentStatus(piece, sourceLayer, studio)
							if (
								status !== RundownAPI.PieceStatusCode.OK &&
								status !== RundownAPI.PieceStatusCode.UNKNOWN &&
								status !== RundownAPI.PieceStatusCode.SOURCE_NOT_SET
							) {
								return {
									rundownId: part.rundownId,
									segmentId: segment._id,
									segmentRank: segment._rank,
									segmentName: segment.name,
									partId: part._id,
									partRank: part._rank,
									pieceId: piece._id,
									name: piece.name,
									status,
									message,
								}
							}
						}
						return undefined
					})
				)
				return _.compact(await Promise.all(pieceStatus))
			}
		})
	)

	return _.flatten(await allStatus)
}

class ServerRundownNotificationsAPI extends MethodContextAPI implements RundownNotificationsAPI {
	async getSegmentPartNotes(rundownIds: RundownId[]): Promise<(PartNote & { rank: number })[]> {
		triggerWriteAccessBecauseNoCheckNecessary()
		rundownIds.forEach((rundownId) => {
			if (!RundownReadAccess.rundownContent({ rundownId }, this)) {
				throw new Meteor.Error(401, 'Invalid access creditials for Segment Parts Notes')
			}
		})
		return makePromise(() => getSegmentPartNotes.apply(this, [rundownIds]))
	}
	async getMediaObjectIssues(rundownIds: RundownId[]): Promise<IMediaObjectIssue[]> {
		triggerWriteAccessBecauseNoCheckNecessary()
		rundownIds.forEach((rundownId) => {
			if (!RundownReadAccess.rundownContent({ rundownId }, this)) {
				throw new Meteor.Error(401, 'Invalid access creditials for Media Object Issues')
			}
		})
		return getMediaObjectIssues.apply(this, [rundownIds])
	}
}
registerClassToMeteorMethods(RundownNotificationsAPIMethods, ServerRundownNotificationsAPI, false)
