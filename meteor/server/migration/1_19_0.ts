import { addMigrationSteps } from './databaseMigration'

/*
 * **************************************************************************************
 *
 *  These migrations are destined for the next release
 *
 * **************************************************************************************
 */
// Release 31
export const addSteps = addMigrationSteps('1.19.0', [])
