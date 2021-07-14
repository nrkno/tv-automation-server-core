import { DBRundown, RundownId, Rundowns } from './collections/Rundowns'
import { NoteType, TrackedNote } from './api/notes'
import { Segments, DBSegment } from './collections/Segments'
import { Part, Parts } from './collections/Parts'
import { unprotectString, literal, generateTranslation, normalizeArrayToMap, assertNever } from './lib'
import * as _ from 'underscore'
import { DBPartInstance, PartInstance, PartInstances } from './collections/PartInstances'
import { MongoFieldSpecifierOnes } from './typings/meteor'
import { RundownPlaylist } from './collections/RundownPlaylists'
import { ITranslatableMessage } from './api/TranslatableMessage'

export function getSegmentPartNotes(rundownIds: RundownId[]): TrackedNote[] {
	const rundowns = Rundowns.find(
		{ _id: { $in: rundownIds } },
		{
			fields: {
				_id: 1,
				_rank: 1,
				name: 1,
				externalNRCSName: 1,
			},
		}
	).fetch()

	const segments = Segments.find(
		{
			rundownId: {
				$in: rundownIds,
			},
		},
		{
			sort: { _rank: 1 },
			fields: {
				_id: 1,
				_rank: 1,
				rundownId: 1,
				name: 1,
				notes: 1,
				orphaned: 1,
			},
		}
	).fetch()

	const parts = Parts.find(
		{
			rundownId: { $in: rundownIds },
			segmentId: { $in: segments.map((segment) => segment._id) },
		},
		{
			sort: { _rank: 1 },
			fields: {
				_id: 1,
				_rank: 1,
				segmentId: 1,
				rundownId: 1,
				notes: 1,
				title: 1,
				invalid: 1,
				invalidReason: 1,
			},
		}
	).fetch()

	const deletedPartInstances = PartInstances.find(
		{
			rundownId: { $in: rundownIds },
			segmentId: { $in: segments.map((segment) => segment._id) },
			reset: { $ne: true },
			orphaned: 'deleted',
		},
		{
			fields: literal<MongoFieldSpecifierOnes<DBPartInstance>>({
				_id: 1,
				segmentId: 1,
				rundownId: 1,
				orphaned: 1,
				reset: 1,
				// @ts-ignore
				'part.title': 1,
			}),
		}
	).fetch()

	const sortedSegments = RundownPlaylist._sortSegments(segments, rundowns)
	const sortedParts = RundownPlaylist._sortPartsInner(parts, segments)

	return getAllNotesForSegmentAndParts(rundowns, sortedSegments, sortedParts, deletedPartInstances)
}

function getAllNotesForSegmentAndParts(
	rundowns: DBRundown[],
	segments: DBSegment[],
	parts: Part[],
	deletedPartInstances: PartInstance[]
): Array<TrackedNote> {
	const notes: Array<TrackedNote> = []

	const rundownsMap = normalizeArrayToMap(rundowns, '_id')
	const partsBySegment = _.groupBy(parts, (p) => p.segmentId)
	const partInstancesBySegment = _.groupBy(deletedPartInstances, (p) => p.segmentId)

	for (const segment of segments) {
		const segmentParts = partsBySegment[unprotectString(segment._id)] || []
		const partInstances = partInstancesBySegment[unprotectString(segment._id)] || []

		notes.push(
			...getBasicNotesForSegment(
				segment,
				rundownsMap.get(segment.rundownId)?.externalNRCSName ?? 'NRCS',
				segmentParts,
				partInstances
			)
		)
	}

	return notes
}

export function getBasicNotesForSegment(
	segment: DBSegment,
	nrcsName: string,
	parts: Part[],
	partInstances: Pick<DBPartInstance, 'orphaned' | 'reset' | 'part'>[]
): Array<TrackedNote> {
	const notes: Array<TrackedNote> = []

	if (segment.notes) {
		notes.push(
			...segment.notes.map((note) =>
				literal<TrackedNote>({
					...note,
					rank: segment._rank,
					origin: {
						...note.origin,
						segmentId: segment._id,
						rundownId: segment.rundownId,
						name: note.origin.name || segment.name,
					},
				})
			)
		)
	}

	if (segment.orphaned === 'deleted') {
		notes.push({
			type: NoteType.WARNING,
			message: generateTranslation('Segment no longer exists in {{nrcs}}', {
				nrcs: nrcsName,
			}),
			rank: segment._rank,
			origin: {
				segmentId: segment._id,
				rundownId: segment.rundownId,
				name: segment.name,
			},
		})
	} else {
		const deletedPartInstances = partInstances.filter((p) => p.orphaned === 'deleted' && !p.reset)
		if (deletedPartInstances.length > 0) {
			notes.push({
				type: NoteType.WARNING,
				message: generateTranslation('The following parts no longer exist in {{nrcs}}: {{partNames}}', {
					nrcs: nrcsName,
					partNames: deletedPartInstances.map((p) => p.part.title).join(', '),
				}),
				rank: segment._rank,
				origin: {
					segmentId: segment._id,
					rundownId: segment.rundownId,
					name: segment.name,
				},
			})
		}
	}

	for (const part of parts) {
		const newNotes = part.notes?.slice() || []

		// Temporarily disable showing invalidReason notifications
		//		-- Jan Starzak, 2021/06/30
		// if (part.invalidReason) {
		// 	newNotes.push({
		// 		type: NoteType.ERROR,
		// 		message: part.invalidReason.message,
		// 		origin: {
		// 			name: part.title,
		// 		},
		// 	})
		// }

		if (newNotes.length > 0) {
			notes.push(
				...newNotes.map((n) => ({
					...n,
					rank: segment._rank,
					origin: {
						...n.origin,
						segmentId: part.segmentId,
						partId: part._id,
						rundownId: part.rundownId,
						segmentName: segment.name,
						name: n.origin.name || part.title,
					},
				}))
			)
		}
	}

	return notes
}

export enum ServerTranslatedMesssages {
	PLAYLIST_ON_AIR_CANT_MOVE_RUNDOWN,
}
export function getTranslatedMessage(
	key: ServerTranslatedMesssages,
	args?: { [key: string]: any }
): ITranslatableMessage {
	switch (key) {
		case ServerTranslatedMesssages.PLAYLIST_ON_AIR_CANT_MOVE_RUNDOWN:
			return generateTranslation(
				'The Rundown was attempted to be moved out of the Playlist when it was on Air. Move it back and try again later.',
				args
			)

		default:
			assertNever(key)
			return { key, args }
	}
}
