import { PackageInfo } from '@sofie-automation/blueprints-integration'
import {
	ExpectedPackageDB,
	ExpectedPackageDBBase,
	ExpectedPackages,
} from '../../../../lib/collections/ExpectedPackages'
import { PackageInfoDB, PackageInfos } from '../../../../lib/collections/PackageInfos'
import { StudioId } from '../../../../lib/collections/Studios'
import { unprotectObjectArray } from '../../../../lib/lib'
import { MongoQuery } from '../../../../lib/typings/meteor'
import { DbCacheReadCollection } from '../../../cache/CacheCollection'
import { CacheForIngest } from '../../ingest/cache'

/**
 * This is a helper class to simplify exposing packageInfo to various places in the blueprints
 */
export class WatchedPackagesHelper {
	private constructor(
		private readonly packages: DbCacheReadCollection<ExpectedPackageDB, ExpectedPackageDB>,
		private readonly packageInfos: DbCacheReadCollection<PackageInfoDB, PackageInfoDB>
	) {}

	/**
	 * Create a helper with no packages. This should be used where the api is in place, but the update flow hasnt been implemented yet so we don't want to expose any data
	 */
	static empty(): WatchedPackagesHelper {
		const watchedPackages = DbCacheReadCollection.createFromArray(ExpectedPackages, [])
		const watchedPackageInfos = DbCacheReadCollection.createFromArray(PackageInfos, [])

		return new WatchedPackagesHelper(watchedPackages, watchedPackageInfos)
	}

	/**
	 * Create a helper, and populate it with data from the database
	 * @param studioId The studio this is for
	 * @param filter A mongo query to specify the packages that should be included
	 */
	static async create<T extends ExpectedPackageDBBase = ExpectedPackageDBBase>(
		studioId: StudioId,
		filter: MongoQuery<Omit<T, 'studioId'>>
	): Promise<WatchedPackagesHelper> {
		// Load all the packages and the infos that are watched
		const watchedPackages = await DbCacheReadCollection.createFromDatabase(ExpectedPackages, {
			...filter,
			studioId: studioId,
		} as any) // TODO: don't use any here
		const watchedPackageInfos = await DbCacheReadCollection.createFromDatabase(PackageInfos, {
			studioId: studioId,
			packageId: { $in: watchedPackages.findFetch().map((p) => p._id) },
		})

		return new WatchedPackagesHelper(watchedPackages, watchedPackageInfos)
	}

	/**
	 * Create a helper, and populate it with data from a CacheForIngest
	 * @param studioId The studio this is for
	 * @param filter A filter to check if each package should be included
	 */
	static async createForIngest(
		cache: CacheForIngest,
		func: ((pkg: ExpectedPackageDB) => boolean) | undefined
	): Promise<WatchedPackagesHelper> {
		const packages = cache.ExpectedPackages.findFetch(func)

		// Load all the packages and the infos that are watched
		const watchedPackages = DbCacheReadCollection.createFromArray(ExpectedPackages, packages)
		const watchedPackageInfos = await DbCacheReadCollection.createFromDatabase(PackageInfos, {
			studioId: cache.Studio.doc._id,
			packageId: { $in: packages.map((p) => p._id) },
		})

		return new WatchedPackagesHelper(watchedPackages, watchedPackageInfos)
	}

	/**
	 * Create a new helper with a subset of the data in the current helper.
	 * This is useful so that all the data for a rundown can be loaded at the start of an ingest operation, and then subsets can be taken for particular blueprint methods without needing to do more db operations.
	 * @param func A filter to check if each package should be included
	 */
	filter(func: (pkg: ExpectedPackageDB) => boolean): WatchedPackagesHelper {
		const watchedPackages = DbCacheReadCollection.createFromArray(ExpectedPackages, this.packages.findFetch(func))

		const newPackageIds = new Set(watchedPackages.findFetch().map((p) => p._id))
		const watchedPackageInfos = DbCacheReadCollection.createFromArray(
			PackageInfos,
			this.packageInfos.findFetch((info) => newPackageIds.has(info.packageId))
		)

		return new WatchedPackagesHelper(watchedPackages, watchedPackageInfos)
	}

	getPackageInfo(packageId: string): Readonly<Array<PackageInfo.Any>> {
		const pkg = this.packages.findOne({
			blueprintPackageId: packageId,
		})
		if (pkg) {
			const info = this.packageInfos.findFetch({
				packageId: pkg._id,
			})
			return unprotectObjectArray(info)
		} else {
			return []
		}
	}
}
