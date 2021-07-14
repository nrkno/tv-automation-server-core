import { addMigrationSteps } from './databaseMigration'
import { ensureCollectionProperty } from './lib'

/*
 * **************************************************************************************
 *
 *  These migrations are destined for the next release
 *
 * **************************************************************************************
 */
// Release 31
export const addSteps = addMigrationSteps('1.19.0', [
	ensureCollectionProperty('CoreSystem', {}, 'cron.casparCGRestart.enabled', true),
])
