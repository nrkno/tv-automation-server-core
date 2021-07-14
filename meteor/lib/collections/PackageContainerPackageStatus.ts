import { registerCollection, ProtectedString, Time, protectString } from '../lib'
import { createMongoCollection } from './lib'
import { StudioId } from './Studios'
import { registerIndex } from '../database'
import { ExpectedPackageStatusAPI } from '@sofie-automation/blueprints-integration'
import { ExpectedPackageId } from './ExpectedPackages'

/**
 * The PackageContainerPackageStatuses-collection contains statuses about "a Package on a specific PackageContainer"
 * PackageContainerPackageStatuses are populated by the Package Manager-device and can be used to look up whether a Package
 * (that originally is specified in the ExpectedPackages collection) is present on a certain Package Container.
 *
 * Note: A "Package Container" is a generic term for "something that contains packages".
 * One  example of this could be a Media-folder (the "package container") which contains Media-files ("packages").
 */

/** Id of a package container */
export type PackageContainerPackageId = ProtectedString<'PackageContainerPackageId'>

export interface PackageContainerPackageStatusDB {
	_id: PackageContainerPackageId // unique id, see getPackageContainerPackageId()

	/** The studio this PackageContainer is defined in */
	studioId: StudioId

	/** The PackageContainer the package is in */
	containerId: string

	/** The Package this status is for */
	packageId: string

	/** The status of the Package */
	status: ExpectedPackageStatusAPI.PackageContainerPackageStatus

	modified: Time
}

export const PackageContainerPackageStatuses = createMongoCollection<
	PackageContainerPackageStatusDB,
	PackageContainerPackageStatusDB
>('packageContainerPackageStatuses')
registerCollection('PackageContainerStatuses', PackageContainerPackageStatuses)

registerIndex(PackageContainerPackageStatuses, {
	studioId: 1,
	containerId: 1,
	packageId: 1,
})

export function getPackageContainerPackageId(
	studioId: StudioId,
	containerId: string,
	packageId: string | ExpectedPackageId
): PackageContainerPackageId {
	return protectString(`${studioId}_${containerId}_${packageId}`)
}
