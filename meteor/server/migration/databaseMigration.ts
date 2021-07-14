import { Meteor } from 'meteor/meteor'
import * as semver from 'semver'
import {
	BlueprintManifestType,
	InputFunctionCore,
	InputFunctionShowStyle,
	InputFunctionStudio,
	MigrateFunctionCore,
	MigrateFunctionShowStyle,
	MigrateFunctionStudio,
	MigrationContextShowStyle as IMigrationContextShowStyle,
	MigrationContextStudio as IMigrationContextStudio,
	MigrationStep,
	MigrationStepBase,
	MigrationStepInput,
	MigrationStepInputFilteredResult,
	MigrationStepInputResult,
	ShowStyleBlueprintManifest,
	StudioBlueprintManifest,
	ValidateFunctionCore,
	ValidateFunctionShowStyle,
	ValidateFunctionStudio,
} from '@sofie-automation/blueprints-integration'
import * as _ from 'underscore'
import {
	GetMigrationStatusResult,
	MigrationChunk,
	MigrationStepType,
	RunMigrationResult,
} from '../../lib/api/migration'
import { logger } from '../../lib/logging'
import { internalStoreSystemSnapshot } from '../api/snapshot'
import { ShowStyleBases } from '../../lib/collections/ShowStyleBases'
import { Blueprints } from '../../lib/collections/Blueprints'
import {
	GENESIS_SYSTEM_VERSION,
	getCoreSystem,
	parseVersion,
	setCoreSystemVersion,
	Version,
} from '../../lib/collections/CoreSystem'
import { SnapshotId } from '../../lib/collections/Snapshots'
import { Studios } from '../../lib/collections/Studios'
import { getHash, protectString, unprotectString, waitForPromise } from '../../lib/lib'
import { evalBlueprint } from '../api/blueprints/cache'
import { MigrationContextShowStyle, MigrationContextStudio } from '../api/blueprints/migrationContext'
import { CURRENT_SYSTEM_VERSION } from './currentSystemVersion'

/**
 * These versions are not supported anymore (breaking changes occurred after these versions)
 * This means that things like snaphots from older versions cannot be restored from
 */
export const UNSUPPORTED_VERSIONS = [
	// 0.18.0 to 0.19.0: Major refactoring, (ShowStyles was split into ShowStyleBase &
	//    ShowStyleVariant, configs & layers wher emoved from studio to ShowStyles)
	'<=0.18',
	// 0.24.0 to 0.25.0: Major refactoring, Renaming of RunningOrders, segmentLines & segmentLineItems to Rundowns, parts & pieces. And a lot more
	'<=0.24',
]

export function isVersionSupported(version: Version) {
	let isSupported: boolean = true
	_.each(UNSUPPORTED_VERSIONS, (uv) => {
		if (semver.satisfies(version, uv)) {
			isSupported = false
		}
	})
	return isSupported
}

interface MigrationStepInternal extends MigrationStep {
	chunk: MigrationChunk
	_rank: number
	_version: Version // step version
	_validateResult: string | boolean
}

const coreMigrationSteps: Array<MigrationStep> = []

/**
 * Add new system Migration step
 * @param step
 */
export function addMigrationStep(step: MigrationStep) {
	coreMigrationSteps.push(step)
}
/**
 * Convenience method to add multiple steps of the same version
 * @param version
 * @param steps
 */
export function addMigrationSteps(version: string, steps: Array<MigrationStepBase>) {
	return () => {
		_.each(steps, (step) => {
			addMigrationStep(
				_.extend(step, {
					version: version,
				})
			)
		})
	}
}
/** Removes all migration steps (used in tests) */
export function clearMigrationSteps() {
	coreMigrationSteps.splice(0, 99999)
}

export interface PreparedMigration {
	hash: string
	chunks: MigrationChunk[]
	steps: MigrationStepInternal[]
	migrationNeeded: boolean
	automaticStepCount: number
	manualStepCount: number
	ignoredStepCount: number
	manualInputs: MigrationStepInput[]
	partialMigration: boolean
}
export function prepareMigration(returnAllChunks?: boolean): PreparedMigration {
	const databaseSystem = getCoreSystem()
	if (!databaseSystem) throw new Meteor.Error(500, 'System version not set up')

	// Discover applicable migration steps:
	let migrationNeeded: boolean = false
	const allMigrationSteps: Array<MigrationStepInternal> = []
	const migrationChunks: Array<MigrationChunk> = []
	let rank: number = 0

	const databaseVersion = parseVersion(databaseSystem.version)
	const targetVersion = parseVersion(CURRENT_SYSTEM_VERSION)

	if (!semver.eq(databaseVersion, targetVersion)) migrationNeeded = true

	// Collect migration steps from core system:
	const chunk: MigrationChunk = {
		sourceType: MigrationStepType.CORE,
		sourceName: 'system',
		_dbVersion: databaseVersion,
		_targetVersion: targetVersion,
		_steps: [],
	}
	migrationChunks.push(chunk)

	// Collect migration steps from system:
	_.each(coreMigrationSteps, (step) => {
		allMigrationSteps.push({
			id: step.id,
			overrideSteps: step.overrideSteps,
			validate: step.validate,
			canBeRunAutomatically: step.canBeRunAutomatically,
			migrate: step.migrate,
			input: step.input,
			dependOnResultFrom: step.dependOnResultFrom,
			version: step.version,
			_version: parseVersion(step.version),
			_validateResult: false, // to be set later
			_rank: rank++,
			chunk: chunk,
		})
	})

	// Collect migration steps from blueprints:
	Blueprints.find({}).forEach((blueprint) => {
		// console.log('bp', blueprint._id)
		if (blueprint.code) {
			const blueprintManifest = evalBlueprint(blueprint)

			// @ts-ignore
			if (!blueprint.databaseVersion || _.isString(blueprint.databaseVersion)) blueprint.databaseVersion = {}
			if (!blueprint.databaseVersion.showStyle) blueprint.databaseVersion.showStyle = {}
			if (!blueprint.databaseVersion.studio) blueprint.databaseVersion.studio = {}

			if (blueprint.blueprintType === BlueprintManifestType.SHOWSTYLE) {
				const bp = blueprintManifest as ShowStyleBlueprintManifest

				// Find all showStyles that uses this blueprint:
				ShowStyleBases.find({
					blueprintId: blueprint._id,
				}).forEach((showStyleBase) => {
					const chunk: MigrationChunk = {
						sourceType: MigrationStepType.SHOWSTYLE,
						sourceName: 'Blueprint ' + blueprint.name + ' for showStyle ' + showStyleBase.name,
						blueprintId: blueprint._id,
						sourceId: showStyleBase._id,
						_dbVersion: parseVersion(
							blueprint.databaseVersion.showStyle[unprotectString(showStyleBase._id)] || '0.0.0'
						),
						_targetVersion: parseVersion(bp.blueprintVersion),
						_steps: [],
					}
					migrationChunks.push(chunk)
					// Add show-style migration steps from blueprint:
					_.each(bp.showStyleMigrations, (step) => {
						allMigrationSteps.push(
							prefixIdsOnStep('blueprint_' + blueprint._id + '_showStyle_' + showStyleBase._id + '_', {
								id: step.id,
								overrideSteps: step.overrideSteps,
								validate: step.validate,
								canBeRunAutomatically: step.canBeRunAutomatically,
								migrate: step.migrate,
								input: step.input,
								dependOnResultFrom: step.dependOnResultFrom,
								version: step.version,
								_version: parseVersion(step.version),
								_validateResult: false, // to be set later
								_rank: rank++,
								chunk: chunk,
							})
						)
					})
				})
			} else if (blueprint.blueprintType === BlueprintManifestType.STUDIO) {
				const bp = blueprintManifest as StudioBlueprintManifest
				// Find all studios that use this blueprint
				Studios.find({
					blueprintId: blueprint._id,
				}).forEach((studio) => {
					const chunk: MigrationChunk = {
						sourceType: MigrationStepType.STUDIO,
						sourceName: 'Blueprint ' + blueprint.name + ' for studio ' + studio.name,
						blueprintId: blueprint._id,
						sourceId: studio._id,
						_dbVersion: parseVersion(
							blueprint.databaseVersion.studio[unprotectString(studio._id)] || '0.0.0'
						),
						_targetVersion: parseVersion(bp.blueprintVersion),
						_steps: [],
					}
					migrationChunks.push(chunk)
					// Add studio migration steps from blueprint:
					_.each(bp.studioMigrations, (step) => {
						allMigrationSteps.push(
							prefixIdsOnStep('blueprint_' + blueprint._id + '_studio_' + studio._id + '_', {
								id: step.id,
								overrideSteps: step.overrideSteps,
								validate: step.validate,
								canBeRunAutomatically: step.canBeRunAutomatically,
								migrate: step.migrate,
								input: step.input,
								dependOnResultFrom: step.dependOnResultFrom,
								version: step.version,
								_version: parseVersion(step.version),
								_validateResult: false, // to be set later
								_rank: rank++,
								chunk: chunk,
							})
						)
					})
				})
			} else {
				// No migrations for system blueprints
			}
		} else {
			console.log(`blueprint ${blueprint._id} has no code`)
		}
	})

	// Sort, smallest version first:
	allMigrationSteps.sort((a, b) => {
		// First, sort by type:
		if (a.chunk.sourceType === MigrationStepType.CORE && b.chunk.sourceType !== MigrationStepType.CORE) return -1
		if (a.chunk.sourceType !== MigrationStepType.CORE && b.chunk.sourceType === MigrationStepType.CORE) return 1

		// if (a.chunk.sourceType === MigrationStepType.SYSTEM && b.chunk.sourceType !== MigrationStepType.SYSTEM) return -1
		// if (a.chunk.sourceType !== MigrationStepType.SYSTEM && b.chunk.sourceType === MigrationStepType.SYSTEM) return 1

		if (a.chunk.sourceType === MigrationStepType.STUDIO && b.chunk.sourceType !== MigrationStepType.STUDIO)
			return -1
		if (a.chunk.sourceType !== MigrationStepType.STUDIO && b.chunk.sourceType === MigrationStepType.STUDIO) return 1

		if (a.chunk.sourceType === MigrationStepType.SHOWSTYLE && b.chunk.sourceType !== MigrationStepType.SHOWSTYLE)
			return -1
		if (a.chunk.sourceType !== MigrationStepType.SHOWSTYLE && b.chunk.sourceType === MigrationStepType.SHOWSTYLE)
			return 1

		// Then, sort by version:
		if (semver.gt(a._version, b._version)) return 1
		if (semver.lt(a._version, b._version)) return -1

		// Lastly, keep ranking:
		if (a._rank > b._rank) return 1
		if (a._rank < b._rank) return -1
		return 0
	})

	let automaticStepCount: number = 0
	let manualStepCount: number = 0
	let ignoredStepCount: number = 0

	let partialMigration: boolean = false

	// Filter steps:
	const migrationSteps: { [id: string]: MigrationStepInternal } = {}
	const ignoredSteps: { [id: string]: true } = {}
	let includesCoreStep = false
	_.each(allMigrationSteps, (step: MigrationStepInternal) => {
		if (!step.canBeRunAutomatically && (!step.input || (_.isArray(step.input) && !step.input.length)))
			throw new Meteor.Error(500, `MigrationStep "${step.id}" is manual, but no input is provided`)

		if (step.chunk.sourceType !== MigrationStepType.CORE && includesCoreStep) {
			// stop here as core migrations need to be run before anything else can
			partialMigration = true
			return
		}

		if (partialMigration) return
		if (
			semver.gt(step._version, step.chunk._dbVersion) && // step version is larger than database version
			semver.lte(step._version, step.chunk._targetVersion) // // step version is less than (or equal) to system version
		) {
			// Step is in play
			if (step.overrideSteps) {
				// Override / delete other steps
				_.each(step.overrideSteps, (overrideId: string) => {
					delete migrationSteps[overrideId]
					if (ignoredSteps[overrideId]) {
						delete ignoredSteps[overrideId]
						ignoredStepCount--
					}
				})
			}

			if (migrationSteps[step.id] || ignoredSteps[step.id])
				throw new Meteor.Error(500, `Error: MigrationStep.id must be unique: "${step.id}"`)

			if (step.dependOnResultFrom) {
				if (ignoredSteps[step.dependOnResultFrom]) {
					// dependent step was ignored, continue then
				} else if (migrationSteps[step.dependOnResultFrom]) {
					// we gotta pause here
					partialMigration = true
					return
				}
			}

			// Check if the step can be applied:
			try {
				if (step.chunk.sourceType === MigrationStepType.CORE) {
					const validate = step.validate as ValidateFunctionCore
					step._validateResult = validate(false)
				} else if (step.chunk.sourceType === MigrationStepType.STUDIO) {
					const validate = step.validate as ValidateFunctionStudio
					step._validateResult = validate(getMigrationStudioContext(step.chunk), false)
				} else if (step.chunk.sourceType === MigrationStepType.SHOWSTYLE) {
					const validate = step.validate as ValidateFunctionShowStyle
					step._validateResult = validate(getMigrationShowStyleContext(step.chunk), false)
				} else throw new Meteor.Error(500, `Unknown step.chunk.sourceType "${step.chunk.sourceType}"`)
			} catch (error) {
				throw new Meteor.Error(500, `Error in migration step "${step.id}": ${error.reason || error.toString()}`)
			}

			if (step._validateResult) {
				migrationSteps[step.id] = step
				includesCoreStep = includesCoreStep || step.chunk.sourceType === MigrationStepType.CORE
			} else {
				// No need to run step
				ignoredSteps[step.id] = true
				ignoredStepCount++
			}
		} else {
			// Step is not applicable
		}
	})

	// check if there are any manual steps:
	// (this makes an automatic migration impossible)

	const manualInputs: Array<MigrationStepInput> = []
	const stepsHash: Array<string> = []
	_.each(migrationSteps, (step: MigrationStepInternal) => {
		stepsHash.push(step.id)
		step.chunk._steps.push(step.id)
		if (!step.canBeRunAutomatically) {
			manualStepCount++

			if (step.input) {
				let input: Array<MigrationStepInput> = []
				if (_.isArray(step.input)) {
					input = []
					_.each(step.input, (i) => {
						input.push(_.clone(i))
					})
				} else if (_.isFunction(step.input)) {
					if (step.chunk.sourceType === MigrationStepType.CORE) {
						const inputFunction = step.input as InputFunctionCore
						input = inputFunction()
					} else if (step.chunk.sourceType === MigrationStepType.STUDIO) {
						const inputFunction = step.input as InputFunctionStudio
						input = inputFunction(getMigrationStudioContext(step.chunk))
					} else if (step.chunk.sourceType === MigrationStepType.SHOWSTYLE) {
						const inputFunction = step.input as InputFunctionShowStyle
						input = inputFunction(getMigrationShowStyleContext(step.chunk))
					} else throw new Meteor.Error(500, `Unknown step.chunk.sourceType "${step.chunk.sourceType}"`)
				}
				if (input.length) {
					_.each(input, (i) => {
						if (i.label && _.isString(step._validateResult)) {
							i.label = (i.label + '').replace(/\$validation/g, step._validateResult)
						}
						if (i.description && _.isString(step._validateResult)) {
							i.description = (i.description + '').replace(/\$validation/g, step._validateResult)
						}
						manualInputs.push(
							_.extend({}, i, {
								stepId: step.id,
							})
						)
					})
				}
			}
		} else {
			automaticStepCount++
		}
	})

	// Only return the chunks which has steps in them:
	const activeChunks = returnAllChunks
		? migrationChunks
		: _.filter(migrationChunks, (chunk) => {
				return chunk._steps.length > 0
		  })
	const hash = getHash(stepsHash.join(','))

	const steps = _.values(migrationSteps)

	if (steps.length > 0) migrationNeeded = true

	return {
		hash: hash,
		chunks: activeChunks,
		steps: steps,
		migrationNeeded: migrationNeeded,
		automaticStepCount: automaticStepCount,
		manualStepCount: manualStepCount,
		ignoredStepCount: ignoredStepCount,
		manualInputs: manualInputs,
		partialMigration: partialMigration,
	}
}
function prefixIdsOnStep(prefix: string, step: MigrationStepInternal): MigrationStepInternal {
	step.id = prefix + step.id
	if (step.overrideSteps) {
		step.overrideSteps = _.map(step.overrideSteps, (override) => {
			return prefix + override
		})
	}
	if (step.dependOnResultFrom) {
		step.dependOnResultFrom = prefix + step.dependOnResultFrom
	}
	return step
}

export function runMigration(
	chunks: Array<MigrationChunk>,
	hash: string,
	inputResults: Array<MigrationStepInputResult>,
	isFirstOfPartialMigrations: boolean = true,
	chunksLeft: number = 20
): RunMigrationResult {
	if (chunksLeft < 0) {
		logger.error(`Migration: Bailing out, looks like we're in a loop`)
		throw new Meteor.Error(500, 'Infinite loop in migrations')
	}
	logger.info(`Migration: Starting`)
	// logger.info(`Migration: Starting, from "${baseVersion}" to "${targetVersion}".`)

	// Verify the input:
	const migration = prepareMigration(true)

	const manualInputsWithUserPrompt = _.filter(migration.manualInputs, (manualInput) => {
		return !!(manualInput.stepId && manualInput.attribute)
	})
	if (migration.hash !== hash)
		throw new Meteor.Error(500, `Migration input hash differ from expected: "${hash}", "${migration.hash}"`)

	if (manualInputsWithUserPrompt.length !== inputResults.length) {
		throw new Meteor.Error(
			500,
			`Migration manualInput lengths differ from expected: "${inputResults.length}", "${migration.manualInputs.length}"`
		)
	}

	// Check that chunks match:
	let unmatchedChunk = _.find(migration.chunks, (migrationChunk) => {
		return !_.find(chunks, (chunk) => {
			return _.isEqual(_.omit(chunk, ['_steps']), _.omit(migrationChunk, ['_steps']))
		})
	})
	if (unmatchedChunk)
		throw new Meteor.Error(
			500,
			`Migration input chunks differ from expected, chunk "${JSON.stringify(unmatchedChunk)}" not found in input`
		)
	unmatchedChunk = _.find(chunks, (chunk) => {
		return !_.find(migration.chunks, (migrationChunk) => {
			return _.isEqual(_.omit(chunk, ['_steps']), _.omit(migrationChunk, ['_steps']))
		})
	})
	if (unmatchedChunk)
		throw new Meteor.Error(
			500,
			`Migration input chunks differ from expected, chunk in input "${JSON.stringify(
				unmatchedChunk
			)}" not found in migration.chunks`
		)
	if (migration.chunks.length !== chunks.length) throw new Meteor.Error(500, `Migration input chunk lengths differ`)

	_.each(migration.chunks, (chunk) => {
		logger.info(
			`Migration: Chunk: ${chunk.sourceType}, ${chunk.sourceName}, from ${chunk._dbVersion} to ${chunk._targetVersion}`
		)
	})

	const warningMessages: Array<string> = []
	let snapshotId: SnapshotId = protectString('')
	if (isFirstOfPartialMigrations) {
		// First, take a system snapshot:
		const system = getCoreSystem()
		if (system && system.storePath) {
			try {
				snapshotId = waitForPromise(
					internalStoreSystemSnapshot(null, null, `Automatic, taken before migration`)
				)
			} catch (e) {
				warningMessages.push(`Error when taking snapshot:${e.toString()}`)
				logger.error(e)
			}
		}
	}

	logger.info(
		`Migration: ${migration.automaticStepCount} automatic and ${migration.manualStepCount} manual steps (${migration.ignoredStepCount} ignored).`
	)

	logger.debug(inputResults)

	_.each(migration.steps, (step: MigrationStepInternal) => {
		try {
			// Prepare input from user
			const stepInput: MigrationStepInputFilteredResult = {}
			_.each(inputResults, (ir) => {
				if (ir.stepId === step.id) {
					stepInput[ir.attribute] = ir.value
				}
			})

			// Run the migration script

			if (step.migrate !== undefined) {
				logger.info(`Running migration step "${step.id}"`)

				if (step.chunk.sourceType === MigrationStepType.CORE) {
					const migration = step.migrate as MigrateFunctionCore
					migration(stepInput)
				} else if (step.chunk.sourceType === MigrationStepType.STUDIO) {
					const migration = step.migrate as MigrateFunctionStudio
					migration(getMigrationStudioContext(step.chunk), stepInput)
				} else if (step.chunk.sourceType === MigrationStepType.SHOWSTYLE) {
					const migration = step.migrate as MigrateFunctionShowStyle
					migration(getMigrationShowStyleContext(step.chunk), stepInput)
				} else throw new Meteor.Error(500, `Unknown step.chunk.sourceType "${step.chunk.sourceType}"`)
			}

			// After migration, run the validation again
			// Since the migration should be done by now, the validate should return true

			let validateMessage: string | boolean = false

			if (step.chunk.sourceType === MigrationStepType.CORE) {
				const validate = step.validate as ValidateFunctionCore
				validateMessage = validate(true)
			} else if (step.chunk.sourceType === MigrationStepType.STUDIO) {
				const validate = step.validate as ValidateFunctionStudio
				validateMessage = validate(getMigrationStudioContext(step.chunk), true)
			} else if (step.chunk.sourceType === MigrationStepType.SHOWSTYLE) {
				const validate = step.validate as ValidateFunctionShowStyle
				validateMessage = validate(getMigrationShowStyleContext(step.chunk), true)
			} else throw new Meteor.Error(500, `Unknown step.chunk.sourceType "${step.chunk.sourceType}"`)

			// let validate = step.validate as ValidateFunctionCore
			// let validateMessage: string | boolean = validate(true)
			if (validateMessage) {
				// Something's not right
				let msg = `Step "${step.id}": Something went wrong, validation didn't approve of the changes. The changes have been applied, but might need to be confirmed.`
				if (validateMessage !== true && _.isString(validateMessage)) {
					msg += ` (Validation error: ${validateMessage})`
				}
				warningMessages.push(msg)
			}
		} catch (e) {
			logger.error(`Error in Migration step ${step.id}: ${e}`)
			logger.error(e.stack ? e.stack : e.toString())
			warningMessages.push(`Internal server error in step ${step.id}`)
		}
	})

	let migrationCompleted: boolean = false

	if (migration.manualStepCount === 0 && !warningMessages.length) {
		// continue automatically with the next batch
		logger.info('Migration: Automatically continuing with next batch..')
		migration.partialMigration = false
		const s = getMigrationStatus()
		if (s.migration.automaticStepCount > 0 || s.migration.manualStepCount > 0) {
			try {
				const res = runMigration(s.migration.chunks, s.migration.hash, inputResults, false, chunksLeft - 1)
				if (res.migrationCompleted) {
					return res
				}
				_.each(res.warnings, (w) => warningMessages.push(w))
			} catch (e) {
				warningMessages.push(`When running next chunk: ${e}`)
				migration.partialMigration = true
			}
		}
	}
	if (!migration.partialMigration && !warningMessages.length) {
		// if there are no warning messages, we can complete the migration right away:
		logger.info(`Migration: Completing...`)
		completeMigration(migration.chunks)
		migrationCompleted = true
	}

	_.each(warningMessages, (str) => {
		logger.warn(`Migration: ${str}`)
	})
	logger.info(`Migration: End`)
	return {
		migrationCompleted: migrationCompleted,
		partialMigration: migration.partialMigration,
		warnings: warningMessages,
		snapshot: snapshotId,
	}
}
function completeMigration(chunks: Array<MigrationChunk>) {
	_.each(chunks, (chunk) => {
		if (chunk.sourceType === MigrationStepType.CORE) {
			setCoreSystemVersion(chunk._targetVersion)
		} else if (chunk.sourceType === MigrationStepType.STUDIO || chunk.sourceType === MigrationStepType.SHOWSTYLE) {
			if (!chunk.blueprintId) throw new Meteor.Error(500, `chunk.blueprintId missing!`)
			if (!chunk.sourceId) throw new Meteor.Error(500, `chunk.sourceId missing!`)

			const blueprint = Blueprints.findOne(chunk.blueprintId)
			if (!blueprint) throw new Meteor.Error(404, `Blueprint "${chunk.blueprintId}" not found!`)

			const m: any = {}
			if (chunk.sourceType === MigrationStepType.STUDIO) {
				logger.info(
					`Updating Blueprint "${chunk.sourceName}" version, from "${
						blueprint.databaseVersion.studio[unprotectString(chunk.sourceId)]
					}" to "${chunk._targetVersion}".`
				)
				m[`databaseVersion.studio.${chunk.sourceId}`] = chunk._targetVersion
			} else if (chunk.sourceType === MigrationStepType.SHOWSTYLE) {
				logger.info(
					`Updating Blueprint "${chunk.sourceName}" version, from "${
						blueprint.databaseVersion.showStyle[unprotectString(chunk.sourceId)]
					}" to "${chunk._targetVersion}".`
				)
				m[`databaseVersion.showStyle.${chunk.sourceId}`] = chunk._targetVersion
			} else throw new Meteor.Error(500, `Bad chunk.sourcetype: "${chunk.sourceType}"`)

			Blueprints.update(chunk.blueprintId, { $set: m })
		} else throw new Meteor.Error(500, `Unknown chunk.sourcetype: "${chunk.sourceType}"`)
	})
}
export function updateDatabaseVersion(targetVersionStr: string) {
	const targetVersion = parseVersion(targetVersionStr)
	setCoreSystemVersion(targetVersion)
}

export function updateDatabaseVersionToSystem() {
	updateDatabaseVersion(CURRENT_SYSTEM_VERSION)
}

export function getMigrationStatus(): GetMigrationStatusResult {
	const migration = prepareMigration(true)

	return {
		// databaseVersion:	 		databaseVersion,
		// databasePreviousVersion:	system.previousVersion,
		// systemVersion:		 		systemVersion,
		migrationNeeded: migration.migrationNeeded,

		migration: {
			canDoAutomaticMigration: migration.manualStepCount === 0,

			manualInputs: migration.manualInputs,
			hash: migration.hash,
			chunks: migration.chunks,

			automaticStepCount: migration.automaticStepCount,
			manualStepCount: migration.manualStepCount,
			ignoredStepCount: migration.ignoredStepCount,
			partialMigration: migration.partialMigration,
		},
	}
}
export function forceMigration(chunks: Array<MigrationChunk>) {
	logger.info(`Force migration`)

	_.each(chunks, (chunk) => {
		logger.info(
			`Force migration: Chunk: ${chunk.sourceType}, ${chunk.sourceName}, from ${chunk._dbVersion} to ${chunk._targetVersion}`
		)
	})

	return completeMigration(chunks)
}
export function resetDatabaseVersions() {
	updateDatabaseVersion(GENESIS_SYSTEM_VERSION)

	Blueprints.find().forEach((blueprint) => {
		Blueprints.update(blueprint._id, {
			$set: {
				databaseVersion: {
					studio: {},
					showStyle: {},
				},
			},
		})
	})
}

function getMigrationStudioContext(chunk: MigrationChunk): IMigrationContextStudio {
	if (chunk.sourceType !== MigrationStepType.STUDIO)
		throw new Meteor.Error(500, `wrong chunk.sourceType "${chunk.sourceType}", expected STUDIO`)
	if (!chunk.sourceId) throw new Meteor.Error(500, `chunk.sourceId missing`)

	const studio = Studios.findOne(chunk.sourceId)
	if (!studio) throw new Meteor.Error(404, `Studio "${chunk.sourceId}" not found`)

	return new MigrationContextStudio(studio)
}
function getMigrationShowStyleContext(chunk: MigrationChunk): IMigrationContextShowStyle {
	if (chunk.sourceType !== MigrationStepType.SHOWSTYLE)
		throw new Meteor.Error(500, `wrong chunk.sourceType "${chunk.sourceType}", expected SHOWSTYLE`)
	if (!chunk.sourceId) throw new Meteor.Error(500, `chunk.sourceId missing`)

	const showStyleBase = ShowStyleBases.findOne(chunk.sourceId)
	if (!showStyleBase) throw new Meteor.Error(404, `ShowStyleBase "${chunk.sourceId}" not found`)

	return new MigrationContextShowStyle(showStyleBase)
}
