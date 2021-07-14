import { addMigrationSteps } from './databaseMigration'
import { ensureCollectionProperty } from './lib'

/*
 * **************************************************************************************
 *
 *  These migrations are destined for the next release
 *
 * (This file is to be renamed to the correct version number when doing the release)
 *
 * **************************************************************************************
 */
// Release 26
export const addSteps = addMigrationSteps('1.14.0', [
	ensureCollectionProperty('Studios', {}, 'routeSetExclusivityGroups', {}, undefined),
])
