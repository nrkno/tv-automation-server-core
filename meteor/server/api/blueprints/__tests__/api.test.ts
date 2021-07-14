import * as _ from 'underscore'
import { setupDefaultStudioEnvironment, packageBlueprint } from '../../../../__mocks__/helpers/database'
import { testInFiber } from '../../../../__mocks__/helpers/jest'
import { literal, getRandomId, protectString } from '../../../../lib/lib'
import { Blueprints, Blueprint } from '../../../../lib/collections/Blueprints'
import { BlueprintManifestType } from '@sofie-automation/blueprints-integration'
import { CoreSystem, SYSTEM_ID, ICoreSystem } from '../../../../lib/collections/CoreSystem'
import { BlueprintAPIMethods } from '../../../../lib/api/blueprint'
import { Meteor } from 'meteor/meteor'
import { insertBlueprint, uploadBlueprint } from '../api'
import { MethodContext } from '../../../../lib/api/methods'
import '../../../../__mocks__/_extendJest'

require('../../peripheralDevice.ts') // include in order to create the Meteor methods needed

const DEFAULT_CONTEXT: MethodContext = {
	userId: null,
	isSimulation: false,
	connection: {
		id: 'mockConnectionId',
		close: () => {},
		onClose: () => {},
		clientAddress: '127.0.0.1',
		httpHeaders: {},
	},
	setUserId: () => {},
	unblock: () => {},
}

describe('Test blueprint management api', () => {
	beforeAll(async () => {
		await setupDefaultStudioEnvironment()
	})

	function getCurrentBlueprintIds() {
		return _.pluck(Blueprints.find().fetch(), '_id')
	}
	function ensureSystemBlueprint() {
		const existingBp = Blueprints.findOne({ blueprintType: BlueprintManifestType.SYSTEM })
		if (existingBp) {
			return existingBp
		} else {
			const blueprint: Blueprint = {
				_id: getRandomId(),
				name: 'Fake blueprint',
				organizationId: null,
				code: `({default: (() => 5)()})`,
				created: 0,
				modified: 0,

				blueprintId: protectString(''),
				blueprintType: BlueprintManifestType.SYSTEM,

				studioConfigManifest: [],
				showStyleConfigManifest: [],

				databaseVersion: {
					showStyle: {},
					studio: {},
				},

				blueprintVersion: '',
				integrationVersion: '',
				TSRVersion: '',
			}
			Blueprints.insert(blueprint)
			return blueprint
		}
	}

	describe('assignSystemBlueprint', () => {
		function getActiveSystemBlueprintId() {
			const core = CoreSystem.findOne(SYSTEM_ID) as ICoreSystem
			expect(core).toBeTruthy()
			return core.blueprintId
		}

		testInFiber('empty id', () => {
			const initialBlueprintId = getActiveSystemBlueprintId()

			expect(() => Meteor.call(BlueprintAPIMethods.assignSystemBlueprint, '')).toThrowError(
				'[404] Blueprint not found'
			)

			expect(getActiveSystemBlueprintId()).toEqual(initialBlueprintId)
		})
		testInFiber('unknown id', () => {
			const blueprint = ensureSystemBlueprint()
			const initialBlueprintId = getActiveSystemBlueprintId()

			expect(() => Meteor.call(BlueprintAPIMethods.assignSystemBlueprint, blueprint._id + '_no')).toThrowError(
				'[404] Blueprint not found'
			)

			expect(getActiveSystemBlueprintId()).toEqual(initialBlueprintId)
		})
		testInFiber('good', () => {
			const blueprint = ensureSystemBlueprint()

			// Ensure starts off 'wrong'
			expect(getActiveSystemBlueprintId()).not.toEqual(blueprint._id)

			Meteor.call(BlueprintAPIMethods.assignSystemBlueprint, blueprint._id)

			// Ensure ends up good
			expect(getActiveSystemBlueprintId()).toEqual(blueprint._id)
		})
		testInFiber('unassign', () => {
			// Ensure starts off 'wrong'
			expect(getActiveSystemBlueprintId()).toBeTruthy()

			Meteor.call(BlueprintAPIMethods.assignSystemBlueprint)

			// Ensure ends up good
			expect(getActiveSystemBlueprintId()).toBeFalsy()
		})
		testInFiber('wrong type', () => {
			const blueprint = Blueprints.findOne({ blueprintType: BlueprintManifestType.SHOWSTYLE }) as Blueprint
			expect(blueprint).toBeTruthy()

			// Ensure starts off 'wrong'
			const initialBlueprintId = getActiveSystemBlueprintId()
			expect(initialBlueprintId).not.toEqual(blueprint._id)

			expect(() => Meteor.call(BlueprintAPIMethods.assignSystemBlueprint, blueprint._id)).toThrowError(
				'[404] Blueprint not of type SYSTEM'
			)

			// Ensure ends up good
			expect(getActiveSystemBlueprintId()).toEqual(initialBlueprintId)
		})
	})

	describe('removeBlueprint', () => {
		testInFiber('undefined id', () => {
			expect(() => Meteor.call(BlueprintAPIMethods.removeBlueprint)).toThrowError(
				'Match error: Expected string, got undefined'
			)
		})

		testInFiber('empty id', () => {
			expect(() => Meteor.call(BlueprintAPIMethods.removeBlueprint, '')).toThrowError(
				'[404] Blueprint id "" was not found'
			)
		})
		testInFiber('missing id', () => {
			// Should not error
			Meteor.call(BlueprintAPIMethods.removeBlueprint, 'not_a_real_blueprint')
		})
		testInFiber('good', () => {
			const blueprint = ensureSystemBlueprint()
			expect(Blueprints.findOne(blueprint._id)).toBeTruthy()

			Meteor.call(BlueprintAPIMethods.removeBlueprint, blueprint._id)

			expect(Blueprints.findOne(blueprint._id)).toBeFalsy()
		})
	})

	describe('insertBlueprint', () => {
		testInFiber('no params', () => {
			const initialBlueprints = getCurrentBlueprintIds()

			const newId = Meteor.call(BlueprintAPIMethods.insertBlueprint)
			expect(newId).toBeTruthy()

			const finalBlueprints = getCurrentBlueprintIds()
			expect(finalBlueprints).toContain(newId)

			expect(finalBlueprints).toEqual(initialBlueprints.concat(newId))

			// Check some props
			const blueprint = Blueprints.findOne(newId) as Blueprint
			expect(blueprint).toBeTruthy()
			expect(blueprint.name).toBeTruthy()
			expect(blueprint.blueprintType).toBeFalsy()
		})
		testInFiber('with name', async () => {
			const rawName = 'some_fake_name'
			const newId = await insertBlueprint(DEFAULT_CONTEXT, undefined, rawName)
			expect(newId).toBeTruthy()

			// Check some props
			const blueprint = Blueprints.findOne(newId) as Blueprint
			expect(blueprint).toBeTruthy()
			expect(blueprint.name).toEqual(rawName)
			expect(blueprint.blueprintType).toBeFalsy()
		})
		testInFiber('with type', async () => {
			const type = BlueprintManifestType.STUDIO
			const newId = await insertBlueprint(DEFAULT_CONTEXT, type, undefined)
			expect(newId).toBeTruthy()

			// Check some props
			const blueprint = Blueprints.findOne(newId) as Blueprint
			expect(blueprint).toBeTruthy()
			expect(blueprint.name).toBeTruthy()
			expect(blueprint.blueprintType).toEqual(type)
		})
	})

	describe('uploadBlueprint', () => {
		testInFiber('empty id', async () => {
			await expect(uploadBlueprint(DEFAULT_CONTEXT, protectString(''), '0')).rejects.toThrowMeteor(
				400,
				'Blueprint id "" is not valid'
			)
		})
		testInFiber('empty body', async () => {
			await expect(uploadBlueprint(DEFAULT_CONTEXT, protectString('blueprint99'), '')).rejects.toThrowMeteor(
				400,
				'Blueprint blueprint99 failed to parse'
			)
		})
		testInFiber('body not a manifest', async () => {
			await expect(
				uploadBlueprint(DEFAULT_CONTEXT, protectString('blueprint99'), `({default: (() => 5)()})`)
			).rejects.toThrowMeteor(400, 'Blueprint blueprint99 returned a manifest of type number')
		})
		testInFiber('manifest missing blueprintType', async () => {
			const blueprintStr = packageBlueprint({}, () => {
				return {
					blueprintType: undefined as any,
					blueprintVersion: '0.0.0',
					integrationVersion: '0.0.0',
					TSRVersion: '0.0.0',

					// studioConfigManifest: [],
					// studioMigrations: [],
					// getBaseline: (context: IStudioContext): TSRTimelineObjBase[] => {
					// 	return []
					// },
					// getShowStyleId: (context: IStudioConfigContext, showStyles: Array<IBlueprintShowStyleBase>, ingestRundown: IngestRundown): string | null => {
					// 	return showStyles[0]._id
					// }
				}
			})
			await expect(
				uploadBlueprint(DEFAULT_CONTEXT, protectString('blueprint99'), blueprintStr)
			).rejects.toThrowMeteor(
				400,
				`Blueprint blueprint99 returned a manifest of unknown blueprintType "undefined"`
			)
		})
		testInFiber('replace existing with different type', async () => {
			const BLUEPRINT_TYPE = BlueprintManifestType.STUDIO
			const blueprintStr = packageBlueprint(
				{
					BLUEPRINT_TYPE,
				},
				() => {
					return {
						blueprintType: BLUEPRINT_TYPE,
						blueprintVersion: '0.0.0',
						integrationVersion: '0.0.0',
						TSRVersion: '0.0.0',
					}
				}
			)

			const existingBlueprint = Blueprints.findOne({
				blueprintType: BlueprintManifestType.SHOWSTYLE,
			}) as Blueprint
			expect(existingBlueprint).toBeTruthy()

			await expect(uploadBlueprint(DEFAULT_CONTEXT, existingBlueprint._id, blueprintStr)).rejects.toThrowMeteor(
				400,
				`Cannot replace old blueprint (of type \"showstyle\") with new blueprint of type \"studio\"`
			)
		})
		testInFiber('success - showstyle', async () => {
			const BLUEPRINT_TYPE = BlueprintManifestType.SHOWSTYLE
			const blueprintStr = packageBlueprint(
				{
					BLUEPRINT_TYPE,
				},
				() => {
					return {
						blueprintId: 'ss1',
						blueprintType: BLUEPRINT_TYPE,
						blueprintVersion: '0.1.0',
						integrationVersion: '0.2.0',
						TSRVersion: '0.3.0',
						showStyleConfigManifest: ['show1'],
						studioConfigManifest: ['studio1'],
					}
				}
			)

			const blueprint = await uploadBlueprint(DEFAULT_CONTEXT, protectString('tmp_showstyle'), blueprintStr)
			expect(blueprint).toBeTruthy()
			expect(blueprint).toMatchObject(
				literal<Omit<Blueprint, 'created' | 'modified' | 'databaseVersion'>>({
					_id: protectString('tmp_showstyle'),
					name: 'tmp_showstyle',
					organizationId: null,
					blueprintType: BLUEPRINT_TYPE,
					blueprintId: protectString('ss1'),
					blueprintVersion: '0.1.0',
					integrationVersion: '0.2.0',
					TSRVersion: '0.3.0',
					showStyleConfigManifest: ['show1'] as any,
					studioConfigManifest: [],
					code: blueprintStr,
				})
			)
		})
		testInFiber('success - studio', async () => {
			const BLUEPRINT_TYPE = BlueprintManifestType.STUDIO
			const blueprintStr = packageBlueprint(
				{
					BLUEPRINT_TYPE,
				},
				() => {
					return {
						blueprintType: BLUEPRINT_TYPE,
						blueprintVersion: '0.1.0',
						integrationVersion: '0.2.0',
						TSRVersion: '0.3.0',
						showStyleConfigManifest: ['show1'],
						studioConfigManifest: ['studio1'],
					}
				}
			)

			const blueprint = await uploadBlueprint(
				DEFAULT_CONTEXT,
				protectString('tmp_studio'),
				blueprintStr,
				'tmp name'
			)
			expect(blueprint).toBeTruthy()
			expect(blueprint).toMatchObject(
				literal<Omit<Blueprint, 'created' | 'modified' | 'databaseVersion'>>({
					_id: protectString('tmp_studio'),
					name: 'tmp name',
					organizationId: null,
					blueprintId: protectString(''),
					blueprintType: BLUEPRINT_TYPE,
					blueprintVersion: '0.1.0',
					integrationVersion: '0.2.0',
					TSRVersion: '0.3.0',
					showStyleConfigManifest: [],
					studioConfigManifest: ['studio1'] as any,
					code: blueprintStr,
				})
			)
		})
		testInFiber('success - system', async () => {
			const BLUEPRINT_TYPE = BlueprintManifestType.SYSTEM
			const blueprintStr = packageBlueprint(
				{
					BLUEPRINT_TYPE,
				},
				() => {
					return {
						blueprintId: 'sys',
						blueprintType: BLUEPRINT_TYPE,
						blueprintVersion: '0.1.0',
						integrationVersion: '0.2.0',
						TSRVersion: '0.3.0',
						showStyleConfigManifest: ['show1'],
						studioConfigManifest: ['studio1'],
					}
				}
			)

			const blueprint = await uploadBlueprint(
				DEFAULT_CONTEXT,
				protectString('tmp_system'),
				blueprintStr,
				'tmp name'
			)
			expect(blueprint).toBeTruthy()
			expect(blueprint).toMatchObject(
				literal<Omit<Blueprint, 'created' | 'modified' | 'databaseVersion'>>({
					_id: protectString('tmp_system'),
					name: 'tmp name',
					organizationId: null,
					blueprintId: protectString('sys'),
					blueprintType: BLUEPRINT_TYPE,
					blueprintVersion: '0.1.0',
					integrationVersion: '0.2.0',
					TSRVersion: '0.3.0',
					showStyleConfigManifest: [],
					studioConfigManifest: [],
					code: blueprintStr,
				})
			)
		})
		testInFiber('update - studio', async () => {
			const BLUEPRINT_TYPE = BlueprintManifestType.STUDIO
			const blueprintStr = packageBlueprint(
				{
					BLUEPRINT_TYPE,
				},
				() => {
					return {
						blueprintType: BLUEPRINT_TYPE,
						blueprintVersion: '0.1.0',
						integrationVersion: '0.2.0',
						TSRVersion: '0.3.0',
						showStyleConfigManifest: ['show1'],
						studioConfigManifest: ['studio1'],
					}
				}
			)

			const existingBlueprint = Blueprints.findOne({ blueprintType: BlueprintManifestType.STUDIO }) as Blueprint
			expect(existingBlueprint).toBeTruthy()
			expect(existingBlueprint.blueprintId).toBeFalsy()

			const blueprint = await uploadBlueprint(DEFAULT_CONTEXT, existingBlueprint._id, blueprintStr)
			expect(blueprint).toBeTruthy()
			expect(blueprint).toMatchObject(
				literal<Omit<Blueprint, 'created' | 'modified' | 'databaseVersion'>>({
					_id: existingBlueprint._id,
					name: existingBlueprint.name,
					organizationId: null,
					blueprintId: protectString(''),
					blueprintType: BLUEPRINT_TYPE,
					blueprintVersion: '0.1.0',
					integrationVersion: '0.2.0',
					TSRVersion: '0.3.0',
					showStyleConfigManifest: [],
					studioConfigManifest: ['studio1'] as any,
					code: blueprintStr,
				})
			)
		})
		testInFiber('update - matching blueprintId', async () => {
			const BLUEPRINT_TYPE = BlueprintManifestType.SHOWSTYLE
			const blueprintStr = packageBlueprint(
				{
					BLUEPRINT_TYPE,
				},
				() => {
					return {
						blueprintId: 'ss1',
						blueprintType: BLUEPRINT_TYPE,
						blueprintVersion: '0.1.0',
						integrationVersion: '0.2.0',
						TSRVersion: '0.3.0',
						showStyleConfigManifest: ['show1'],
						studioConfigManifest: ['studio1'],
					}
				}
			)

			const existingBlueprint = Blueprints.findOne({
				blueprintType: BlueprintManifestType.SHOWSTYLE,
				blueprintId: protectString('ss1'),
			}) as Blueprint
			expect(existingBlueprint).toBeTruthy()
			expect(existingBlueprint.blueprintId).toBeTruthy()

			const blueprint = await uploadBlueprint(DEFAULT_CONTEXT, existingBlueprint._id, blueprintStr)
			expect(blueprint).toBeTruthy()
			expect(blueprint).toMatchObject(
				literal<Omit<Blueprint, 'created' | 'modified' | 'databaseVersion'>>({
					_id: existingBlueprint._id,
					name: existingBlueprint.name,
					organizationId: null,
					blueprintId: protectString('ss1'),
					blueprintType: BLUEPRINT_TYPE,
					blueprintVersion: '0.1.0',
					integrationVersion: '0.2.0',
					TSRVersion: '0.3.0',
					showStyleConfigManifest: ['show1'] as any,
					studioConfigManifest: [],
					code: blueprintStr,
				})
			)
		})
		testInFiber('update - change blueprintId', async () => {
			const BLUEPRINT_TYPE = BlueprintManifestType.SHOWSTYLE
			const blueprintStr = packageBlueprint(
				{
					BLUEPRINT_TYPE,
				},
				() => {
					return {
						blueprintId: 'show2',
						blueprintType: BLUEPRINT_TYPE,
						blueprintVersion: '0.1.0',
						integrationVersion: '0.2.0',
						TSRVersion: '0.3.0',
						showStyleConfigManifest: ['show1'],
						studioConfigManifest: ['studio1'],
					}
				}
			)

			const existingBlueprint = Blueprints.findOne({
				blueprintType: BlueprintManifestType.SHOWSTYLE,
				blueprintId: protectString('ss1'),
			}) as Blueprint
			expect(existingBlueprint).toBeTruthy()
			expect(existingBlueprint.blueprintId).toBeTruthy()

			await expect(uploadBlueprint(DEFAULT_CONTEXT, existingBlueprint._id, blueprintStr)).rejects.toThrowMeteor(
				422,
				`Cannot replace old blueprint \"${existingBlueprint._id}\" (\"ss1\") with new blueprint \"show2\"`
			)
		})
		testInFiber('update - drop blueprintId', async () => {
			const BLUEPRINT_TYPE = BlueprintManifestType.SHOWSTYLE
			const blueprintStr = packageBlueprint(
				{
					BLUEPRINT_TYPE,
				},
				() => {
					return {
						blueprintType: BLUEPRINT_TYPE,
						blueprintVersion: '0.1.0',
						integrationVersion: '0.2.0',
						TSRVersion: '0.3.0',
						showStyleConfigManifest: ['show1'],
						studioConfigManifest: ['studio1'],
					}
				}
			)

			const existingBlueprint = Blueprints.findOne({
				blueprintType: BlueprintManifestType.SHOWSTYLE,
				blueprintId: protectString('ss1'),
			}) as Blueprint
			expect(existingBlueprint).toBeTruthy()
			expect(existingBlueprint.blueprintId).toBeTruthy()

			await expect(uploadBlueprint(DEFAULT_CONTEXT, existingBlueprint._id, blueprintStr)).rejects.toThrowMeteor(
				422,
				`Cannot replace old blueprint \"${existingBlueprint._id}\" (\"ss1\") with new blueprint \"\"`
			)
		})
	})
})
