import { addMigrationSteps } from './databaseMigration'
import { CURRENT_SYSTEM_VERSION } from './currentSystemVersion'
import { getCoreSystem } from '../../lib/collections/CoreSystem'
import * as semver from 'semver'
import {
	PackageContainerPackageStatusDB,
	PackageContainerPackageStatuses,
} from '../../lib/collections/PackageContainerPackageStatus'
import { MongoSelector } from '../../lib/typings/meteor'
import { literal } from '../../lib/lib'
import { dropDeprecatedDatabase, getDeprecatedDatabase } from './deprecatedDatabases/1_35_0'

/*
 * **************************************************************************************
 *
 *  These migrations are destined for the next release
 *
 * (This file is to be renamed to the correct version number when doing the release)
 *
 * **************************************************************************************
 */
// Release X
export const addSteps = addMigrationSteps(CURRENT_SYSTEM_VERSION, [
	//                     ^--- To be set to an absolute version number when doing the release
	// add steps here:
	// {
	// 	id: 'my fancy step',
	// 	canBeRunAutomatically: true,
	// 	validate: () => {
	// 		return false
	// 	},
	// 	migrate: () => {
	// 		//
	// 	}
	// },
	//
	//

	{
		id: 'Fix badly named collection PackageContainerStatuses',
		canBeRunAutomatically: true,
		validate: () => {
			// Note: in versions <1.35, the collection PackageContainerPackageStatuses had mistankenly been created at the mongo-collection
			// "packageContainerStatuses" instead of "packageContainerPackageStatuses"

			const databaseSystem = getCoreSystem()

			// Only run this if version is under 1.33.0, in order to not create the deprecated databases
			if (databaseSystem && semver.satisfies(databaseSystem.version, '<1.33.0')) {
				const wrongCollection = getDeprecatedDatabase()

				if (wrongCollection) {
					// Find documents that is not (the possibly upcoming) packageContainerStatuses, but is instead of packageContainerPackageStatuses:
					const count = wrongCollection
						.find(
							literal<MongoSelector<PackageContainerPackageStatusDB>>({
								studioId: { $exists: true },
								containerId: { $exists: true },
								packageId: { $exists: true },
								modified: { $exists: true },
								status: { $exists: true },
								'status.contentVersionHash': { $exists: true },
								'status.isPlaceholder': { $exists: true },
								'status.status': { $exists: true },
							})
						)
						.count()
					if (count)
						return `Collection PackageContainerStatuses contains "${count}" documents that need to be moved`
				}
			}
			return false
		},
		migrate: () => {
			const wrongCollection = getDeprecatedDatabase()

			if (wrongCollection) {
				wrongCollection
					.find({
						studioId: { $exists: true },
						containerId: { $exists: true },
						packageId: { $exists: true },
						modified: { $exists: true },
						status: { $exists: true },
						'status.contentVersionHash': { $exists: true },
						'status.isPlaceholder': { $exists: true },
						'status.status': { $exists: true },
					})
					.forEach((doc: any) => {
						PackageContainerPackageStatuses.insert(doc)
						wrongCollection.remove(doc._id)
					})

				dropDeprecatedDatabase()
			}
		},
	},
])
