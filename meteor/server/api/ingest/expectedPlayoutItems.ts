import { Piece } from '../../../lib/collections/Pieces'
import {
	ExpectedPlayoutItem,
	ExpectedPlayoutItemRundown,
	ExpectedPlayoutItems,
	ExpectedPlayoutItemStudio,
} from '../../../lib/collections/ExpectedPlayoutItems'
import * as _ from 'underscore'
import { RundownId } from '../../../lib/collections/Rundowns'
import { AdLibPiece } from '../../../lib/collections/AdLibPieces'
import { PartId } from '../../../lib/collections/Parts'
import { getRandomId, protectString, waitForPromiseAll } from '../../../lib/lib'
import { CacheForIngest } from './cache'
import { saveIntoCache } from '../../cache/lib'
import { StudioId } from '../../../lib/collections/Studios'
import { AdLibAction } from '../../../lib/collections/AdLibActions'
import { RundownBaselineAdLibAction } from '../../../lib/collections/RundownBaselineAdLibActions'
import { ExpectedPlayoutItemGeneric } from '@sofie-automation/blueprints-integration'
import { CacheForPlayout } from '../playout/cache'
import { CacheForStudio } from '../studio/cache'
import { saveIntoDb } from '../../lib/database'

function extractExpectedPlayoutItems(
	studioId: StudioId,
	rundownId: RundownId,
	partId: PartId | undefined,
	piece: Piece | AdLibPiece | AdLibAction | RundownBaselineAdLibAction
): ExpectedPlayoutItem[] {
	const expectedPlayoutItemsGeneric: ExpectedPlayoutItem[] = []

	if (piece.expectedPlayoutItems) {
		_.each(piece.expectedPlayoutItems, (pieceItem, i) => {
			expectedPlayoutItemsGeneric.push({
				...pieceItem,
				_id: protectString(piece._id + '_' + i),
				studioId: studioId,
				rundownId: rundownId,
				// pieceId: piece._id,
				partId: partId,
			})
		})
	}

	return expectedPlayoutItemsGeneric
}

/** @deprecated */
export function updateExpectedPlayoutItemsOnRundown(cache: CacheForIngest): void {
	const expectedPlayoutItems: ExpectedPlayoutItem[] = []

	const studioId = cache.Studio.doc._id
	const rundownId = cache.RundownId

	// It isn't great to have to load these unnecessarily, but expectedPackages will resolve this
	const [baselineAdlibPieces, baselineAdlibActions] = waitForPromiseAll([
		cache.RundownBaselineAdLibPieces.get(),
		cache.RundownBaselineAdLibActions.get(),
	])

	for (const piece of cache.Pieces.findFetch({})) {
		expectedPlayoutItems.push(...extractExpectedPlayoutItems(studioId, rundownId, piece.startPartId, piece))
	}
	for (const piece of cache.AdLibPieces.findFetch({})) {
		expectedPlayoutItems.push(...extractExpectedPlayoutItems(studioId, rundownId, piece.partId, piece))
	}
	for (const piece of baselineAdlibPieces.findFetch({})) {
		expectedPlayoutItems.push(...extractExpectedPlayoutItems(studioId, rundownId, undefined, piece))
	}
	for (const action of cache.AdLibActions.findFetch({})) {
		expectedPlayoutItems.push(...extractExpectedPlayoutItems(studioId, rundownId, action.partId, action))
	}
	for (const action of baselineAdlibActions.findFetch({})) {
		expectedPlayoutItems.push(...extractExpectedPlayoutItems(studioId, rundownId, undefined, action))
	}

	saveIntoCache<ExpectedPlayoutItem, ExpectedPlayoutItem>(
		cache.ExpectedPlayoutItems,
		{ baseline: { $exists: false } },
		expectedPlayoutItems
	)
}

export function updateBaselineExpectedPlayoutItemsOnRundown(
	cache: CacheForIngest,
	items?: ExpectedPlayoutItemGeneric[]
) {
	saveIntoCache<ExpectedPlayoutItem, ExpectedPlayoutItem>(
		cache.ExpectedPlayoutItems,
		{ baseline: 'rundown' },
		(items || []).map((item): ExpectedPlayoutItemRundown => {
			return {
				...item,
				_id: getRandomId(),
				studioId: cache.Studio.doc._id,
				rundownId: cache.RundownId,
				baseline: 'rundown',
			}
		})
	)
}
export function updateBaselineExpectedPlayoutItemsOnStudio(
	cache: CacheForStudio | CacheForPlayout,
	items?: ExpectedPlayoutItemGeneric[]
) {
	cache.deferAfterSave(async () => {
		await saveIntoDb(
			ExpectedPlayoutItems,
			{ studioId: cache.Studio.doc._id, baseline: 'studio' },
			(items || []).map((item): ExpectedPlayoutItemStudio => {
				return {
					...item,
					_id: getRandomId(),
					studioId: cache.Studio.doc._id,
					baseline: 'studio',
				}
			})
		)
	})
}
