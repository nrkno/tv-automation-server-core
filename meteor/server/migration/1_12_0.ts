import { addMigrationSteps } from './databaseMigration'
import { Studios } from '../../lib/collections/Studios'
import { ShowStyleBases } from '../../lib/collections/ShowStyleBases'
import { Pieces } from '../../lib/collections/Pieces'
import { Part, Parts } from '../../lib/collections/Parts'
import { Piece as Piece_1_11_0 } from './deprecatedDataTypes/1_11_0'
import { unprotectString, ProtectedString, objectPathSet } from '../../lib/lib'
import { TransformedCollection } from '../../lib/typings/meteor'
import { IBlueprintConfig } from '@sofie-automation/blueprints-integration'
import { ShowStyleVariants } from '../../lib/collections/ShowStyleVariants'
import { Timeline } from '../../lib/collections/Timeline'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { ensureCollectionProperty, removeCollectionProperty, setExpectedVersion } from './lib'

// Release 24
export const addSteps = addMigrationSteps('1.12.0', [
	ensureCollectionProperty('Studios', {}, 'routeSets', {}, undefined),
	ensureCollectionProperty('Studios', {}, 'organizationId', null, undefined),
	ensureCollectionProperty('PeripheralDevices', {}, 'organizationId', null, undefined),
	ensureCollectionProperty('ShowStyleBases', {}, 'organizationId', null, undefined),
	removeCollectionProperty('ShowStyleBases', {}, 'runtimeArguments'),

	{
		id: 'Pieces properties',
		canBeRunAutomatically: true,
		validate: () => {
			const pieceCount = Pieces.find({
				rundownId: { $exists: true },
				partId: { $exists: true },
			}).count()
			let result: string | boolean = false
			if (pieceCount > 0) result = `${pieceCount} pieces need to be migrated`

			return result
		},
		migrate: () => {
			const parts: { [partId: string]: Part } = {}
			Pieces.find({
				rundownId: { $exists: true },
				partId: { $exists: true },
			}).forEach((piece0) => {
				const piece = (piece0 as any) as Piece_1_11_0

				let part: Part | undefined = parts[unprotectString(piece.partId)]
				if (!part) {
					part = Parts.findOne(piece.partId)
					if (part) {
						parts[unprotectString(piece.partId)] = part
					}
				}
				if (part) {
					Pieces.update(piece._id, {
						$set: {
							startRundownId: piece.rundownId,
							startPartId: piece.partId,
							startSegmentId: part.segmentId,
						},
						$unset: {
							rundownId: 1,
							partId: 1,
						},
					})
				} else {
					// If the Piece has no part, it's an orphan and should be removed
					Pieces.remove(piece._id)
				}
			})
		},
	},
	migrateConfigToBlueprintConfig('Migrate config to blueprintConfig in Studios', Studios),
	migrateConfigToBlueprintConfig('Migrate config to blueprintConfig in ShowStyleBases', ShowStyleBases),
	migrateConfigToBlueprintConfig('Migrate config to blueprintConfig in ShowStyleVariants', ShowStyleVariants),
	{
		id: 'Single timeline object',
		canBeRunAutomatically: true,
		validate: () => {
			const badCount = Timeline.find({
				timeline: { $exists: false },
			}).count()
			if (badCount > 0) {
				return `${badCount} timeline objects need to be deleted`
			}
			return false
		},
		migrate: () => {
			Timeline.remove({
				timeline: { $exists: false },
			})
		},
	},
	//
	//
	setExpectedVersion('expectedVersion.playoutDevice', PeripheralDeviceAPI.DeviceType.PLAYOUT, '_process', '^1.11.0'),
	setExpectedVersion('expectedVersion.mosDevice', PeripheralDeviceAPI.DeviceType.MOS, '_process', '^1.5.0'),
	setExpectedVersion(
		'expectedVersion.mediaManager',
		PeripheralDeviceAPI.DeviceType.MEDIA_MANAGER,
		'_process',
		'^1.2.1'
	),
])

function migrateConfigToBlueprintConfig<
	T extends DBInterface,
	DBInterface extends { _id: ProtectedString<any>; blueprintConfig: IBlueprintConfig }
>(id: string, collection: TransformedCollection<T, DBInterface>) {
	return {
		id,
		canBeRunAutomatically: true,
		validate: () => {
			const documents = collection.find({ config: { $exists: true } }).fetch()
			if (documents.length) {
				return true
			}
			return false
		},
		migrate: () => {
			const documents = collection.find({ config: { $exists: true } }).fetch() as Array<
				T & { config: Array<{ _id: string; value: any }> }
			>
			for (const document of documents) {
				const newDocument = migrateConfigToBlueprintConfigOnObject(document)
				collection.update(document._id, newDocument)
			}
		},
	}
}
export function migrateConfigToBlueprintConfigOnObject<
	DBInterface extends {
		_id: ProtectedString<any>
		blueprintConfig?: IBlueprintConfig
	}
>(document: DBInterface): DBInterface {
	if (!document.blueprintConfig) {
		document.blueprintConfig = {}
		// @ts-ignore old typing
		const oldConfig = document.config as any
		if (oldConfig) {
			for (const item of oldConfig) {
				objectPathSet(document.blueprintConfig, item._id, item.value)
			}
		}
	}
	// @ts-ignore old typing
	delete document.config
	return document
}
