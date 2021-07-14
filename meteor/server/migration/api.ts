import { check, Match } from '../../lib/check'
import { registerClassToMeteorMethods } from '../methods'
import { MigrationChunk, NewMigrationAPI, RunMigrationResult, MigrationAPIMethods } from '../../lib/api/migration'
import * as Migrations from './databaseMigration'
import { MigrationStepInputResult } from '@sofie-automation/blueprints-integration'
import { makePromise } from '../../lib/lib'
import { MethodContextAPI, MethodContext } from '../../lib/api/methods'
import { SystemWriteAccess } from '../security/system'

function getMigrationStatus(context: MethodContext) {
	SystemWriteAccess.migrations(context)
	return Migrations.getMigrationStatus()
}
function runMigration(
	context: MethodContext,
	chunks: Array<MigrationChunk>,
	hash: string,
	inputResults: Array<MigrationStepInputResult>,
	isFirstOfPartialMigrations?: boolean
): RunMigrationResult {
	check(chunks, Array)
	check(hash, String)
	check(inputResults, Array)
	check(isFirstOfPartialMigrations, Match.Optional(Boolean))

	SystemWriteAccess.migrations(context)

	return Migrations.runMigration(chunks, hash, inputResults, isFirstOfPartialMigrations)
}
function forceMigration(context: MethodContext, chunks: Array<MigrationChunk>) {
	check(chunks, Array)
	SystemWriteAccess.migrations(context)
	return Migrations.forceMigration(chunks)
}
function resetDatabaseVersions(context: MethodContext) {
	SystemWriteAccess.migrations(context)
	return Migrations.resetDatabaseVersions()
}

class ServerMigrationAPI extends MethodContextAPI implements NewMigrationAPI {
	async getMigrationStatus() {
		return makePromise(() => getMigrationStatus(this))
	}
	async runMigration(
		chunks: Array<MigrationChunk>,
		hash: string,
		inputResults: Array<MigrationStepInputResult>,
		isFirstOfPartialMigrations?: boolean
	) {
		return makePromise(() => runMigration(this, chunks, hash, inputResults, isFirstOfPartialMigrations))
	}
	async forceMigration(chunks: Array<MigrationChunk>) {
		return makePromise(() => forceMigration(this, chunks))
	}
	async resetDatabaseVersions() {
		return makePromise(() => resetDatabaseVersions(this))
	}
}
registerClassToMeteorMethods(MigrationAPIMethods, ServerMigrationAPI, false)
