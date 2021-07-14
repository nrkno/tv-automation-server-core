import { ExpectedPackageDBType, ExpectedPackageId, ExpectedPackages } from '../../../lib/collections/ExpectedPackages'
import { PackageInfoDB } from '../../../lib/collections/PackageInfos'
import { RundownId, Rundowns } from '../../../lib/collections/Rundowns'
import { SegmentId } from '../../../lib/collections/Segments'
import { assertNever, lazyIgnore } from '../../../lib/lib'
import { logger } from '../../logging'
import { runIngestOperationWithCache } from './lockFunction'
import { Meteor } from 'meteor/meteor'
import { regenerateSegmentsFromIngestData } from './generation'

export function onUpdatedPackageInfo(packageId: ExpectedPackageId, _doc: PackageInfoDB | null) {
	logger.info(`PackageInfo updated "${packageId}"`)

	const pkg = ExpectedPackages.findOne(packageId)
	if (!pkg) {
		logger.error(`onUpdatedPackageInfo: Received update for missing package: "${packageId}"`)
		return
	}

	if (pkg.listenToPackageInfoUpdates) {
		switch (pkg.fromPieceType) {
			case ExpectedPackageDBType.PIECE:
			case ExpectedPackageDBType.ADLIB_PIECE:
			case ExpectedPackageDBType.ADLIB_ACTION:
			case ExpectedPackageDBType.BASELINE_ADLIB_PIECE:
			case ExpectedPackageDBType.BASELINE_ADLIB_ACTION:
			case ExpectedPackageDBType.RUNDOWN_BASELINE_OBJECTS: {
				const existingEntry = pendingPackageUpdates.get(pkg.rundownId)
				if (existingEntry) {
					// already queued, add to the batch
					existingEntry.push(pkg._id)
				} else {
					pendingPackageUpdates.set(pkg.rundownId, [pkg._id])
				}

				lazyIgnore(
					`onUpdatedPackageInfoForRundown_${pkg.rundownId}`,
					() => {
						const packageIds = pendingPackageUpdates.get(pkg.rundownId)
						if (packageIds) {
							pendingPackageUpdates.delete(pkg.rundownId)
							onUpdatedPackageInfoForRundown(pkg.rundownId, packageIds).catch((e) => {
								logger.error(`Updating ExpectedPackages for Rundown "${pkg.rundownId}" failed: ${e}`)
							})
						}
					},
					1000
				)
				break
			}
			case ExpectedPackageDBType.BUCKET_ADLIB:
			case ExpectedPackageDBType.BUCKET_ADLIB_ACTION:
			case ExpectedPackageDBType.STUDIO_BASELINE_OBJECTS:
				// Ignore, as we can't handle that for now
				break
			default:
				assertNever(pkg)
				break
		}
	}
}

const pendingPackageUpdates = new Map<RundownId, Array<ExpectedPackageId>>()

async function onUpdatedPackageInfoForRundown(
	rundownId: RundownId,
	packageIds: Array<ExpectedPackageId>
): Promise<void> {
	if (packageIds.length === 0) {
		return
	}

	const tmpRundown = Rundowns.findOne(rundownId)
	if (!tmpRundown) {
		logger.error(
			`onUpdatedPackageInfoForRundown: Missing rundown "${rundownId}" for packages "${packageIds.join(', ')}"`
		)
		return
	}

	return runIngestOperationWithCache(
		'onUpdatedPackageInfoForRundown',
		tmpRundown.studioId,
		tmpRundown.externalId,
		(ingestRundown) => {
			if (!ingestRundown)
				throw new Meteor.Error('onUpdatedPackageInfoForRundown called but ingestData is undefined')
			return ingestRundown // don't mutate any ingest data
		},
		async (cache, ingestRundown) => {
			if (!ingestRundown)
				throw new Meteor.Error('onUpdatedPackageInfoForRundown called but ingestData is undefined')

			/** All segments that need updating */
			const segmentsToUpdate = new Set<SegmentId>()
			let regenerateRundownBaseline = false

			for (const packageId of packageIds) {
				const pkg = cache.ExpectedPackages.findOne(packageId)
				if (pkg) {
					if (
						pkg.fromPieceType === ExpectedPackageDBType.PIECE ||
						pkg.fromPieceType === ExpectedPackageDBType.ADLIB_PIECE
					) {
						segmentsToUpdate.add(pkg.segmentId)
					} else if (
						pkg.fromPieceType === ExpectedPackageDBType.BASELINE_ADLIB_ACTION ||
						pkg.fromPieceType === ExpectedPackageDBType.BASELINE_ADLIB_PIECE ||
						pkg.fromPieceType === ExpectedPackageDBType.RUNDOWN_BASELINE_OBJECTS
					) {
						regenerateRundownBaseline = true
					}
				} else {
					logger.warn(`onUpdatedPackageInfoForRundown: Missing package: "${packageId}"`)
				}
			}

			logger.info(
				`onUpdatedPackageInfoForRundown: PackageInfo for "${packageIds.join(
					', '
				)}" will trigger update of segments: ${Array.from(segmentsToUpdate).join(', ')}`
			)

			if (regenerateRundownBaseline) {
				// trigger a re-generation of the rundown baseline
				// TODO - to be implemented.
			}

			const { result, skippedSegments } = await regenerateSegmentsFromIngestData(
				cache,
				ingestRundown,
				Array.from(segmentsToUpdate)
			)

			if (skippedSegments.length > 0) {
				logger.warn(
					`onUpdatedPackageInfoForRundown: Some segments were skipped during update: ${skippedSegments.join(
						', '
					)}`
				)
			}

			logger.warn(`onUpdatedPackageInfoForRundown: Changed ${result?.changedSegmentIds.length ?? 0} segments`)
			return result
		}
	)
}
