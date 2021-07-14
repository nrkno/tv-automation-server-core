import { Meteor } from 'meteor/meteor'
import { Random } from 'meteor/random'
import _ from 'underscore'
import { SegmentNote, PartNote, RundownNote } from '../../../lib/api/notes'
import { AdLibAction } from '../../../lib/collections/AdLibActions'
import { AdLibPiece } from '../../../lib/collections/AdLibPieces'
import { ExpectedPackageDBType } from '../../../lib/collections/ExpectedPackages'
import { DBPart, Part } from '../../../lib/collections/Parts'
import { getExternalNRCSName, PeripheralDevice } from '../../../lib/collections/PeripheralDevices'
import { Piece } from '../../../lib/collections/Pieces'
import { RundownBaselineAdLibAction } from '../../../lib/collections/RundownBaselineAdLibActions'
import { RundownBaselineAdLibItem } from '../../../lib/collections/RundownBaselineAdLibPieces'
import { RundownBaselineObj, RundownBaselineObjId } from '../../../lib/collections/RundownBaselineObjs'
import { DBRundown } from '../../../lib/collections/Rundowns'
import { DBSegment, SegmentId } from '../../../lib/collections/Segments'
import { ShowStyleCompound } from '../../../lib/collections/ShowStyleVariants'
import { getCurrentTime, literal, protectString, unprotectString } from '../../../lib/lib'
import { Settings } from '../../../lib/Settings'
import { logChanges, saveIntoCache } from '../../cache/lib'
import { PackageInfo } from '../../coreSystem'
import { sumChanges, anythingChanged } from '../../lib/database'
import { logger } from '../../logging'
import { WrappedShowStyleBlueprint, loadShowStyleBlueprint } from '../blueprints/cache'
import { CommonContext, SegmentUserContext, ShowStyleUserContext, StudioUserContext } from '../blueprints/context'
import { WatchedPackagesHelper } from '../blueprints/context/watchedPackages'
import {
	postProcessPieces,
	postProcessAdLibPieces,
	postProcessAdLibActions,
	postProcessRundownBaselineItems,
	postProcessGlobalAdLibActions,
} from '../blueprints/postProcess'
import { profiler } from '../profiler'
import { selectShowStyleVariant } from '../rundown'
import { getShowStyleCompoundForRundown } from '../showStyles'
import { CacheForIngest } from './cache'
import { updateBaselineExpectedPackagesOnRundown } from './expectedPackages'
import { LocalIngestRundown, LocalIngestSegment } from './ingestCache'
import {
	getSegmentId,
	getPartId,
	extendIngestRundownCore,
	modifyPlaylistExternalId,
	getRundown,
	canSegmentBeUpdated,
} from './lib'
import { CommitIngestData } from './lockFunction'

export interface UpdateSegmentsResult {
	segments: DBSegment[]
	parts: DBPart[]
	pieces: Piece[]
	adlibPieces: AdLibPiece[]
	adlibActions: AdLibAction[]

	/** ShowStyle, if loaded to reuse */
	showStyle: ShowStyleCompound | undefined
	/** Blueprint, if loaded to reuse */
	blueprint: WrappedShowStyleBlueprint | undefined
}

async function getWatchedPackagesHelper(
	allRundownWatchedPackages0: WatchedPackagesHelper | null,
	cache: CacheForIngest,
	ingestSegments: LocalIngestSegment[]
): Promise<WatchedPackagesHelper> {
	if (allRundownWatchedPackages0) {
		return allRundownWatchedPackages0
	} else {
		const segmentIds = new Set(ingestSegments.map((s) => getSegmentId(cache.RundownId, s.externalId)))
		return WatchedPackagesHelper.createForIngest(cache, (p) => 'segmentId' in p && segmentIds.has(p.segmentId))
	}
}

/**
 * Generate the content for some segments
 * @param cache The ingest cache of the rundown
 * @param rundown The rundown being updated/generated
 * @param ingestSegments The segments to regenerate
 */
export async function calculateSegmentsFromIngestData(
	cache: CacheForIngest,
	ingestSegments: LocalIngestSegment[],
	allRundownWatchedPackages0: WatchedPackagesHelper | null
): Promise<UpdateSegmentsResult> {
	const span = profiler.startSpan('ingest.rundownInput.calculateSegmentsFromIngestData')

	const rundown = getRundown(cache)

	const res: Omit<UpdateSegmentsResult, 'showStyle' | 'blueprint'> = {
		segments: [],
		parts: [],
		pieces: [],
		adlibPieces: [],
		adlibActions: [],
	}

	if (ingestSegments.length > 0) {
		const pShowStyle = getShowStyleCompoundForRundown(rundown)
		const pAllRundownWatchedPackages = getWatchedPackagesHelper(allRundownWatchedPackages0, cache, ingestSegments)

		const showStyle = await pShowStyle
		const pBlueprint = loadShowStyleBlueprint(showStyle)

		const blueprint = await pBlueprint
		const allRundownWatchedPackages = await pAllRundownWatchedPackages

		for (const ingestSegment of ingestSegments) {
			const segmentId = getSegmentId(cache.RundownId, ingestSegment.externalId)

			// Ensure the parts are sorted by rank
			ingestSegment.parts.sort((a, b) => a.rank - b.rank)

			// Filter down to the packages for this segment
			const watchedPackages = allRundownWatchedPackages.filter(
				(p) => 'segmentId' in p && p.segmentId === segmentId
			)

			const context = new SegmentUserContext(
				{
					name: `getSegment=${ingestSegment.name}`,
					identifier: `rundownId=${rundown._id},segmentId=${segmentId}`,
				},
				cache.Studio.doc,
				showStyle,
				rundown,
				watchedPackages
			)

			const blueprintRes = blueprint.blueprint.getSegment(context, ingestSegment)

			// Ensure all parts have a valid externalId set on them
			const knownPartExternalIds = blueprintRes.parts.map((p) => p.part.externalId)

			const segmentNotes: SegmentNote[] = []
			for (const note of context.notes) {
				if (!note.partExternalId || knownPartExternalIds.indexOf(note.partExternalId) === -1) {
					segmentNotes.push(
						literal<SegmentNote>({
							type: note.type,
							message: {
								...note.message,
								namespaces: [unprotectString(blueprint.blueprintId)],
							},
							origin: {
								name: '', // TODO
							},
						})
					)
				}
			}

			const newSegment = literal<DBSegment>({
				...blueprintRes.segment,
				_id: segmentId,
				rundownId: rundown._id,
				externalId: ingestSegment.externalId,
				externalModified: ingestSegment.modified,
				_rank: ingestSegment.rank,
				notes: segmentNotes,
			})
			res.segments.push(newSegment)

			blueprintRes.parts.forEach((blueprintPart, i) => {
				const partId = getPartId(rundown._id, blueprintPart.part.externalId)

				const notes: PartNote[] = []

				for (const note of context.notes) {
					if (note.partExternalId === blueprintPart.part.externalId) {
						notes.push(
							literal<PartNote>({
								type: note.type,
								message: {
									...note.message,
									namespaces: [unprotectString(blueprint.blueprintId)],
								},
								origin: {
									name: '', // TODO
								},
							})
						)
					}
				}

				const existingPart = cache.Parts.findOne(partId)
				const part = literal<DBPart>({
					...blueprintPart.part,
					_id: partId,
					rundownId: rundown._id,
					segmentId: newSegment._id,
					_rank: i, // This gets updated to a rank unique within its segment in a later step
					notes: notes,
					invalidReason: blueprintPart.part.invalidReason
						? {
								...blueprintPart.part.invalidReason,
								message: {
									...blueprintPart.part.invalidReason.message,
									namespaces: [unprotectString(blueprint.blueprintId)],
								},
						  }
						: undefined,

					// Preserve:
					status: existingPart?.status, // This property is 'owned' by core and updated via its own flow
				})
				res.parts.push(part)

				// This ensures that it doesn't accidently get played while hidden
				if (blueprintRes.segment.isHidden) {
					part.invalid = true
				}

				// Update pieces
				res.pieces.push(
					...postProcessPieces(
						context,
						blueprintPart.pieces,
						blueprint.blueprintId,
						rundown._id,
						newSegment._id,
						part._id,
						undefined,
						undefined,
						part.invalid
					)
				)
				res.adlibPieces.push(
					...postProcessAdLibPieces(
						context,
						blueprint.blueprintId,
						rundown._id,
						part._id,
						blueprintPart.adLibPieces
					)
				)
				res.adlibActions.push(
					...postProcessAdLibActions(
						context,
						blueprint.blueprintId,
						rundown._id,
						part._id,
						blueprintPart.actions || []
					)
				)
			})

			// If the segment has no parts, then hide it
			if (blueprintRes.parts.length === 0) {
				newSegment.isHidden = true
			}
		}

		span?.end()
		return {
			...res,

			showStyle,
			blueprint,
		}
	} else {
		span?.end()
		return {
			...res,

			showStyle: undefined,
			blueprint: undefined,
		}
	}
}

/**
 * Save the calculated UpdateSegmentsResult into the cache
 * Note: this will NOT remove any segments, it is expected for that to be done later
 * @param cache The cache to save into
 * @param data The data to save
 * @param isWholeRundownUpdate Whether this is a whole rundown change (This will remove any stray items)
 */
export function saveSegmentChangesToCache(
	cache: CacheForIngest,
	data: UpdateSegmentsResult,
	isWholeRundownUpdate: boolean
): void {
	const newPartIds = data.parts.map((p) => p._id)
	const newSegmentIds = data.segments.map((p) => p._id)

	const partChanges = saveIntoCache<Part, DBPart>(
		cache.Parts,
		isWholeRundownUpdate ? {} : { $or: [{ segmentId: { $in: newSegmentIds } }, { _id: { $in: newPartIds } }] },
		data.parts
	)
	logChanges('Parts', partChanges)
	const affectedPartIds = [...partChanges.removed, ...newPartIds]

	logChanges(
		'Pieces',
		saveIntoCache<Piece, Piece>(
			cache.Pieces,
			isWholeRundownUpdate ? {} : { startPartId: { $in: affectedPartIds } },
			data.pieces
		)
	)
	logChanges(
		'AdLibActions',
		saveIntoCache<AdLibAction, AdLibAction>(
			cache.AdLibActions,
			isWholeRundownUpdate ? {} : { partId: { $in: affectedPartIds } },
			data.adlibActions
		)
	)
	logChanges(
		'AdLibPieces',
		saveIntoCache<AdLibPiece, AdLibPiece>(
			cache.AdLibPieces,
			isWholeRundownUpdate ? {} : { partId: { $in: affectedPartIds } },
			data.adlibPieces
		)
	)

	// Update Segments: Only update, never remove
	for (const segment of data.segments) {
		cache.Segments.replace(segment)
	}
}

export async function updateSegmentFromIngestData(
	cache: CacheForIngest,
	ingestSegment: LocalIngestSegment,
	isNewSegment: boolean
): Promise<CommitIngestData | null> {
	const span = profiler.startSpan('ingest.rundownInput.handleUpdatedPartInner')

	const rundown = getRundown(cache)

	// Updated OR created part
	const segmentId = getSegmentId(rundown._id, ingestSegment.externalId)
	const segment = cache.Segments.findOne(segmentId)
	if (!isNewSegment && !segment) throw new Meteor.Error(404, `Segment "${segmentId}" not found`)
	if (!canSegmentBeUpdated(rundown, segment, isNewSegment)) return null

	const segmentChanges = await calculateSegmentsFromIngestData(cache, [ingestSegment], null)
	saveSegmentChangesToCache(cache, segmentChanges, false)

	span?.end()
	return {
		changedSegmentIds: segmentChanges.segments.map((s) => s._id),
		removedSegmentIds: [],
		renamedSegments: new Map(),

		removeRundown: false,

		showStyle: segmentChanges.showStyle,
		blueprint: segmentChanges.blueprint,
	}
}

export async function regenerateSegmentsFromIngestData(
	cache: CacheForIngest,
	ingestRundown: LocalIngestRundown,
	segmentIds: SegmentId[]
): Promise<{ result: CommitIngestData | null; skippedSegments: SegmentId[] }> {
	const span = profiler.startSpan('ingest.rundownInput.handleUpdatedPartInner')

	if (segmentIds.length === 0) {
		return { result: null, skippedSegments: [] }
	}

	const rundown = getRundown(cache)

	const skippedSegments: SegmentId[] = []
	const ingestSegments: LocalIngestSegment[] = []

	for (const segmentId of segmentIds) {
		const segment = cache.Segments.findOne(segmentId)
		if (!segment) {
			skippedSegments.push(segmentId)
		} else if (!canSegmentBeUpdated(rundown, segment, false)) {
			skippedSegments.push(segmentId)
		} else {
			const ingestSegment = ingestRundown.segments.find((s) => s.externalId === segment.externalId)
			if (!ingestSegment) {
				skippedSegments.push(segmentId)
			} else {
				ingestSegments.push(ingestSegment)
			}
		}
	}

	const segmentChanges = await calculateSegmentsFromIngestData(cache, ingestSegments, null)

	saveSegmentChangesToCache(cache, segmentChanges, false)

	const result: CommitIngestData = {
		changedSegmentIds: segmentChanges.segments.map((s) => s._id),
		removedSegmentIds: [],
		renamedSegments: new Map(),

		removeRundown: false,

		showStyle: segmentChanges.showStyle,
		blueprint: segmentChanges.blueprint,
	}

	span?.end()
	return {
		result,
		skippedSegments,
	}
}

export async function updateRundownFromIngestData(
	cache: CacheForIngest,
	ingestRundown: LocalIngestRundown,
	peripheralDevice: PeripheralDevice | undefined
): Promise<CommitIngestData> {
	const span = profiler.startSpan('ingest.rundownInput.updateRundownFromIngestData')

	// canBeUpdated is to be run by the callers

	const extendedIngestRundown = extendIngestRundownCore(ingestRundown, cache.Rundown.doc)

	const selectShowStyleContext = new StudioUserContext(
		{
			name: 'selectShowStyleVariant',
			identifier: `studioId=${cache.Studio.doc._id},rundownId=${cache.RundownId},ingestRundownId=${cache.RundownExternalId}`,
			tempSendUserNotesIntoBlackHole: true,
		},
		cache.Studio.doc
	)
	// TODO-CONTEXT save any user notes from selectShowStyleContext
	const showStyle = await selectShowStyleVariant(selectShowStyleContext, extendedIngestRundown)
	if (!showStyle) {
		logger.debug('Blueprint rejected the rundown')
		throw new Meteor.Error(501, 'Blueprint rejected the rundown')
	}

	const pAllRundownWatchedPackages = WatchedPackagesHelper.createForIngest(cache, undefined)

	const showStyleBlueprint = await loadShowStyleBlueprint(showStyle.base)
	const allRundownWatchedPackages = await pAllRundownWatchedPackages

	const rundownBaselinePackages = allRundownWatchedPackages.filter(
		(pkg) =>
			pkg.fromPieceType === ExpectedPackageDBType.BASELINE_ADLIB_ACTION ||
			pkg.fromPieceType === ExpectedPackageDBType.RUNDOWN_BASELINE_OBJECTS
	)

	const blueprintContext = new ShowStyleUserContext(
		{
			name: `${showStyle.base.name}-${showStyle.variant.name}`,
			identifier: `showStyleBaseId=${showStyle.base._id},showStyleVariantId=${showStyle.variant._id}`,
		},
		cache.Studio.doc,
		showStyle.compound,
		rundownBaselinePackages
	)
	const rundownRes = showStyleBlueprint.blueprint.getRundown(blueprintContext, extendedIngestRundown)

	const translationNamespaces: string[] = []
	if (showStyleBlueprint.blueprintId) {
		translationNamespaces.push(unprotectString(showStyleBlueprint.blueprintId))
	}
	if (cache.Studio.doc.blueprintId) {
		translationNamespaces.push(unprotectString(cache.Studio.doc.blueprintId))
	}

	// Ensure the ids in the notes are clean
	const rundownNotes = blueprintContext.notes.map((note) =>
		literal<RundownNote>({
			type: note.type,
			message: {
				...note.message,
				namespaces: translationNamespaces,
			},
			origin: {
				name: `${showStyle.base.name}-${showStyle.variant.name}`,
			},
		})
	)
	rundownRes.rundown.playlistExternalId = modifyPlaylistExternalId(
		rundownRes.rundown.playlistExternalId,
		showStyle.base
	)

	const dbRundownData = literal<DBRundown>({
		...rundownRes.rundown,
		notes: rundownNotes,
		_id: cache.RundownId,
		externalId: ingestRundown.externalId,
		organizationId: cache.Studio.doc.organizationId,
		studioId: cache.Studio.doc._id,
		showStyleVariantId: showStyle.variant._id,
		showStyleBaseId: showStyle.base._id,
		orphaned: undefined,

		importVersions: {
			studio: cache.Studio.doc._rundownVersionHash,
			showStyleBase: showStyle.base._rundownVersionHash,
			showStyleVariant: showStyle.variant._rundownVersionHash,
			blueprint: showStyleBlueprint.blueprint.blueprintVersion,
			core: PackageInfo.versionExtended || PackageInfo.version,
		},

		created: cache.Rundown.doc?.created ?? getCurrentTime(),
		modified: getCurrentTime(),

		peripheralDeviceId: peripheralDevice?._id,
		externalNRCSName: getExternalNRCSName(peripheralDevice),

		// validated later
		playlistId: protectString(''),
		_rank: 0,
		...(cache.Rundown.doc
			? _.pick(cache.Rundown.doc, 'playlistId', '_rank', 'baselineModifyHash', 'airStatus', 'status')
			: {}),
	})
	const dbRundown = cache.Rundown.replace(dbRundownData)

	// Save the baseline
	const blueprintRundownContext = new CommonContext({
		name: dbRundown.name,
		identifier: `rundownId=${dbRundown._id}`,
	})
	logger.info(`Building baseline objects for ${dbRundown._id}...`)
	logger.info(`... got ${rundownRes.baseline.timelineObjects.length} objects from baseline.`)
	logger.info(`... got ${rundownRes.globalAdLibPieces.length} adLib objects from baseline.`)
	logger.info(`... got ${(rundownRes.globalActions || []).length} adLib actions from baseline.`)

	const { baselineObjects, baselineAdlibPieces, baselineAdlibActions } = await cache.loadBaselineCollections()
	const rundownBaselineChanges = sumChanges(
		saveIntoCache<RundownBaselineObj, RundownBaselineObj>(baselineObjects, {}, [
			{
				_id: protectString<RundownBaselineObjId>(Random.id(7)),
				rundownId: dbRundown._id,
				objects: postProcessRundownBaselineItems(
					blueprintRundownContext,
					showStyle.base.blueprintId,
					rundownRes.baseline.timelineObjects
				),
			},
		]),
		// Save the global adlibs
		saveIntoCache<RundownBaselineAdLibItem, RundownBaselineAdLibItem>(
			baselineAdlibPieces,
			{},
			postProcessAdLibPieces(
				blueprintRundownContext,
				showStyle.base.blueprintId,
				dbRundown._id,
				undefined,
				rundownRes.globalAdLibPieces
			)
		),
		saveIntoCache<RundownBaselineAdLibAction, RundownBaselineAdLibAction>(
			baselineAdlibActions,
			{},
			postProcessGlobalAdLibActions(
				blueprintRundownContext,
				showStyle.base.blueprintId,
				dbRundown._id,
				rundownRes.globalActions || []
			)
		)
	)
	if (anythingChanged(rundownBaselineChanges)) {
		// If any of the rundown baseline datas was modified, we'll update the baselineModifyHash of the rundown
		cache.Rundown.update({
			$set: {
				baselineModifyHash: Random.id(),
			},
		})
	}

	// TODO - store notes from rundownNotesContext

	const segmentChanges = await calculateSegmentsFromIngestData(
		cache,
		ingestRundown.segments,
		allRundownWatchedPackages
	)

	/** Don't remove segments for now, orphan them instead. The 'commit' phase will clean them up if possible */
	const removedSegments = cache.Segments.findFetch({ _id: { $nin: segmentChanges.segments.map((s) => s._id) } })
	for (const oldSegment of removedSegments) {
		segmentChanges.segments.push({
			...oldSegment,
			orphaned: 'deleted',
		})
	}

	if (Settings.preserveUnsyncedPlayingSegmentContents && removedSegments.length > 0) {
		// Preserve any old content, unless the part is referenced in another segment
		const retainSegments = new Set(removedSegments.map((s) => s._id))
		const newPartIds = new Set(segmentChanges.parts.map((p) => p._id))
		const oldParts = cache.Parts.findFetch((p) => retainSegments.has(p.segmentId) && !newPartIds.has(p._id))
		segmentChanges.parts.push(...oldParts)

		const oldPartIds = new Set(oldParts.map((p) => p._id))
		segmentChanges.pieces.push(...cache.Pieces.findFetch((p) => oldPartIds.has(p.startPartId)))
		segmentChanges.adlibPieces.push(...cache.AdLibPieces.findFetch((p) => p.partId && oldPartIds.has(p.partId)))
		segmentChanges.adlibActions.push(...cache.AdLibActions.findFetch((p) => p.partId && oldPartIds.has(p.partId)))
	}

	updateBaselineExpectedPackagesOnRundown(cache, rundownRes.baseline)

	saveSegmentChangesToCache(cache, segmentChanges, true)

	logger.info(`Rundown ${dbRundown._id} update complete`)

	span?.end()
	return literal<CommitIngestData>({
		changedSegmentIds: segmentChanges.segments.map((s) => s._id),
		removedSegmentIds: removedSegments.map((s) => s._id),
		renamedSegments: new Map(),

		removeRundown: false,

		showStyle: showStyle.compound,
		blueprint: showStyleBlueprint,
	})
}
