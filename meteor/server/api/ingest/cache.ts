import { AdLibAction, AdLibActions } from '../../../lib/collections/AdLibActions'
import { AdLibPiece, AdLibPieces } from '../../../lib/collections/AdLibPieces'
import { ExpectedMediaItem, ExpectedMediaItems } from '../../../lib/collections/ExpectedMediaItems'
import { ExpectedPlayoutItem, ExpectedPlayoutItems } from '../../../lib/collections/ExpectedPlayoutItems'
import { Part, DBPart, Parts } from '../../../lib/collections/Parts'
import { Piece, Pieces } from '../../../lib/collections/Pieces'
import {
	RundownBaselineAdLibAction,
	RundownBaselineAdLibActions,
} from '../../../lib/collections/RundownBaselineAdLibActions'
import {
	RundownBaselineAdLibItem,
	RundownBaselineAdLibPieces,
} from '../../../lib/collections/RundownBaselineAdLibPieces'
import { RundownBaselineObj, RundownBaselineObjs } from '../../../lib/collections/RundownBaselineObjs'
import { Rundown, DBRundown, Rundowns } from '../../../lib/collections/Rundowns'
import { Segment, DBSegment, Segments } from '../../../lib/collections/Segments'
import { Studio, Studios, StudioId } from '../../../lib/collections/Studios'
import { DbCacheWriteCollection } from '../../cache/CacheCollection'
import { DbCacheReadObject, DbCacheWriteOptionalObject } from '../../cache/CacheObject'
import { CacheBase } from '../../cache/CacheBase'
import { profiler } from '../profiler'
import { removeRundownsFromDb } from '../rundownPlaylist'
import { getRundownId } from './lib'
import { ExpectedPackageDB, ExpectedPackages } from '../../../lib/collections/ExpectedPackages'
import PLazy from 'p-lazy'

export class Lazy<T> {
	private value!: T
	private loading: PLazy<void> | undefined

	public constructor(init: () => Promise<T>) {
		this.loading = new PLazy((resolve, reject) => {
			try {
				init()
					.then((v) => {
						this.value = v
						this.loading = undefined
						resolve()
					})
					.catch(() => reject())
			} catch (e) {
				reject()
			}
		})
	}

	public async get(): Promise<T> {
		if (this.loading) {
			await this.loading
		}

		return this.value
	}

	public getIfLoaded(): T | undefined {
		if (!this.loading) {
			return this.value
		} else {
			return undefined
		}
	}

	public isLoaded(): boolean {
		return !this.loading
	}
}

export class CacheForIngest extends CacheBase<CacheForIngest> {
	public readonly isIngest = true
	private toBeRemoved = false

	public readonly Studio: DbCacheReadObject<Studio, Studio>
	public readonly Rundown: DbCacheWriteOptionalObject<Rundown, DBRundown>
	public readonly RundownExternalId: string

	public readonly Segments: DbCacheWriteCollection<Segment, DBSegment>
	public readonly Parts: DbCacheWriteCollection<Part, DBPart>
	public readonly Pieces: DbCacheWriteCollection<Piece, Piece>

	public readonly AdLibPieces: DbCacheWriteCollection<AdLibPiece, AdLibPiece>
	public readonly AdLibActions: DbCacheWriteCollection<AdLibAction, AdLibAction>

	public readonly ExpectedMediaItems: DbCacheWriteCollection<ExpectedMediaItem, ExpectedMediaItem>
	public readonly ExpectedPlayoutItems: DbCacheWriteCollection<ExpectedPlayoutItem, ExpectedPlayoutItem>
	public readonly ExpectedPackages: DbCacheWriteCollection<ExpectedPackageDB, ExpectedPackageDB>

	public readonly RundownBaselineObjs: Lazy<DbCacheWriteCollection<RundownBaselineObj, RundownBaselineObj>>
	public readonly RundownBaselineAdLibPieces: Lazy<
		DbCacheWriteCollection<RundownBaselineAdLibItem, RundownBaselineAdLibItem>
	>
	public readonly RundownBaselineAdLibActions: Lazy<
		DbCacheWriteCollection<RundownBaselineAdLibAction, RundownBaselineAdLibAction>
	>

	public get RundownId() {
		return this.Rundown.doc?._id ?? getRundownId(this.Studio.doc, this.RundownExternalId)
	}

	private constructor(
		rundownExternalId: string,
		segments: DbCacheWriteCollection<Segment, DBSegment>,
		parts: DbCacheWriteCollection<Part, DBPart>,
		pieces: DbCacheWriteCollection<Piece, Piece>,
		adLibPieces: DbCacheWriteCollection<AdLibPiece, AdLibPiece>,
		adLibActions: DbCacheWriteCollection<AdLibAction, AdLibAction>,
		expectedMediaItems: DbCacheWriteCollection<ExpectedMediaItem, ExpectedMediaItem>,
		expectedPlayoutItems: DbCacheWriteCollection<ExpectedPlayoutItem, ExpectedPlayoutItem>,
		expectedPackages: DbCacheWriteCollection<ExpectedPackageDB, ExpectedPackageDB>
	) {
		super()

		this.Studio = new DbCacheReadObject(Studios, false)
		this.Rundown = new DbCacheWriteOptionalObject(Rundowns)
		this.RundownExternalId = rundownExternalId

		this.Segments = segments
		this.Parts = parts
		this.Pieces = pieces

		this.AdLibPieces = adLibPieces
		this.AdLibActions = adLibActions

		this.ExpectedMediaItems = expectedMediaItems
		this.ExpectedPlayoutItems = expectedPlayoutItems
		this.ExpectedPackages = expectedPackages

		this.RundownBaselineObjs = new Lazy(async () =>
			DbCacheWriteCollection.createFromDatabase(RundownBaselineObjs, { rundownId: this.RundownId })
		)
		this.RundownBaselineAdLibPieces = new Lazy(async () =>
			DbCacheWriteCollection.createFromDatabase(RundownBaselineAdLibPieces, { rundownId: this.RundownId })
		)
		this.RundownBaselineAdLibActions = new Lazy(async () =>
			DbCacheWriteCollection.createFromDatabase(RundownBaselineAdLibActions, { rundownId: this.RundownId })
		)
	}

	static async create(studioId: StudioId, rundownExternalId: string): Promise<CacheForIngest> {
		const rundownId = getRundownId(studioId, rundownExternalId)
		const collections = await Promise.all([
			DbCacheWriteCollection.createFromDatabase(Segments, { rundownId: rundownId }),
			DbCacheWriteCollection.createFromDatabase(Parts, { rundownId: rundownId }),
			DbCacheWriteCollection.createFromDatabase(Pieces, { startRundownId: rundownId }),

			DbCacheWriteCollection.createFromDatabase(AdLibPieces, { rundownId: rundownId }),
			DbCacheWriteCollection.createFromDatabase(AdLibActions, { rundownId: rundownId }),

			DbCacheWriteCollection.createFromDatabase(ExpectedMediaItems, { rundownId: rundownId }),
			DbCacheWriteCollection.createFromDatabase(ExpectedPlayoutItems, { rundownId: rundownId }),
			DbCacheWriteCollection.createFromDatabase(ExpectedPackages, { rundownId: rundownId }),
		])

		const res = new CacheForIngest(rundownExternalId, ...collections)

		await Promise.all([res.Studio._initialize(studioId), res.Rundown._initialize(rundownId)])

		return res
	}

	async loadBaselineCollections(): Promise<{
		baselineObjects: DbCacheWriteCollection<RundownBaselineObj, RundownBaselineObj>
		baselineAdlibPieces: DbCacheWriteCollection<RundownBaselineAdLibItem, RundownBaselineAdLibItem>
		baselineAdlibActions: DbCacheWriteCollection<RundownBaselineAdLibAction, RundownBaselineAdLibAction>
	}> {
		const [baselineObjects, baselineAdlibPieces, baselineAdlibActions] = await Promise.all([
			this.RundownBaselineObjs.get(),
			this.RundownBaselineAdLibPieces.get(),
			this.RundownBaselineAdLibActions.get(),
		])

		return {
			baselineObjects,
			baselineAdlibPieces,
			baselineAdlibActions,
		}
	}

	/**
	 * Remove the rundown when this cache is saved.
	 * The cache is cleared of any documents, and any deferred functions are discarded
	 * Note: any deferred functions that get added after this will be ignoted
	 */
	removeRundown() {
		this.toBeRemoved = true

		super.markCollectionsForRemoval()

		// Discard any hooks too
		this._deferredAfterSaveFunctions.length = 0
		this._deferredFunctions.length = 0
	}

	discardChanges() {
		this._abortActiveTimeout()

		this.toBeRemoved = false
		super.discardChanges()

		// Discard any hooks too
		this._deferredAfterSaveFunctions.length = 0
		this._deferredFunctions.length = 0

		this.assertNoChanges()
	}

	async saveAllToDatabase() {
		if (this.toBeRemoved) {
			const span = profiler.startSpan('CacheForIngest.saveAllToDatabase')
			this._abortActiveTimeout()

			// Ignoring any deferred functions

			if (this.Rundown.doc) {
				await removeRundownsFromDb([this.Rundown.doc._id])
			}

			super.assertNoChanges()
			span?.end()
		} else {
			await super.saveAllToDatabase()
		}
	}
}
