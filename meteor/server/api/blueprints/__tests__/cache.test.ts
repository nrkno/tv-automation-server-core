import '../../../../__mocks__/_extendJest'
import { setupDefaultStudioEnvironment } from '../../../../__mocks__/helpers/database'
import { Rundown, DBRundown } from '../../../../lib/collections/Rundowns'
import { literal, protectString } from '../../../../lib/lib'
import {
	loadSystemBlueprints,
	loadStudioBlueprint,
	loadShowStyleBlueprint,
	WrappedStudioBlueprint,
	BLUEPRINT_CACHE_CONTROL,
} from '../cache'
import { getCoreSystem, ICoreSystem } from '../../../../lib/collections/CoreSystem'
import { Blueprints } from '../../../../lib/collections/Blueprints'
import {
	BlueprintManifestType,
	BlueprintResultRundown,
	BlueprintResultSegment,
	PlaylistTimingType,
} from '@sofie-automation/blueprints-integration'
import { Studios, Studio } from '../../../../lib/collections/Studios'
import { ShowStyleBase, ShowStyleBases } from '../../../../lib/collections/ShowStyleBases'
import { generateFakeBlueprint } from './lib'

describe('Test blueprint cache', () => {
	beforeAll(async () => {
		await setupDefaultStudioEnvironment()
	})
	beforeEach(() => {
		BLUEPRINT_CACHE_CONTROL.disable = true
	})
	afterEach(() => {
		BLUEPRINT_CACHE_CONTROL.disable = false
	})

	describe('loadSystemBlueprints', () => {
		function getCore(): ICoreSystem {
			const core = getCoreSystem() as ICoreSystem
			expect(core).toBeTruthy()
			return core
		}
		test('Blueprint not specified', async () => {
			const core = getCore()
			expect(core.blueprintId).toBeFalsy()

			const blueprint = await loadSystemBlueprints(core)
			expect(blueprint).toBeFalsy()
		})
		test('Blueprint does not exist', async () => {
			const core = getCore()
			core.blueprintId = protectString('fake_id')
			expect(core.blueprintId).toBeTruthy()

			Blueprints.remove(protectString('fake_id'))

			await expect(loadSystemBlueprints(core)).rejects.toThrowMeteor(
				404,
				`Blueprint "${core.blueprintId}" not found! (referenced by CoreSystem)`
			)
		})
		test('Blueprint no type', async () => {
			const core = getCore()
			core.blueprintId = protectString('fake_id')
			expect(core.blueprintId).toBeTruthy()

			Blueprints.remove(protectString('fake_id'))
			Blueprints.insert(generateFakeBlueprint('fake_id'))

			await expect(loadSystemBlueprints(core)).rejects.toThrowMeteor(
				500,
				`Blueprint "${core.blueprintId}" is not valid for a CoreSystem (undefined)!`
			)
		})

		test('Blueprint wrong type', async () => {
			const core = getCore()
			core.blueprintId = protectString('fake_id')
			expect(core.blueprintId).toBeTruthy()

			Blueprints.remove(protectString('fake_id'))
			const bp = generateFakeBlueprint('fake_id', BlueprintManifestType.SHOWSTYLE)
			Blueprints.insert(bp)

			expect(BLUEPRINT_CACHE_CONTROL.disable).toBeTruthy()
			await expect(loadSystemBlueprints(core)).rejects.toThrowMeteor(
				500,
				`Blueprint "${core.blueprintId}" is not valid for a CoreSystem (showstyle)!`
			)
		})

		test('Blueprint wrong internal type', async () => {
			const core = getCore()
			core.blueprintId = protectString('fake_id')
			expect(core.blueprintId).toBeTruthy()

			const manifest = () => ({
				blueprintType: 'studio' as BlueprintManifestType.STUDIO,
				blueprintVersion: '0.0.0',
				integrationVersion: '0.0.0',
				TSRVersion: '0.0.0',

				studioConfigManifest: [],
				studioMigrations: [],
				getBaseline: () => {
					return {
						timelineObjects: [],
					}
				},
				getShowStyleId: () => null,
			})

			Blueprints.remove(protectString('fake_id'))
			Blueprints.insert(generateFakeBlueprint('fake_id', BlueprintManifestType.SYSTEM, manifest))

			await expect(loadSystemBlueprints(core)).rejects.toThrowMeteor(
				500,
				`Evaluated Blueprint-manifest and document does not have the same blueprintType ("studio", "system")!`
			)
		})
		test('Blueprint correct type', async () => {
			const core = getCore()
			core.blueprintId = protectString('fake_id')
			expect(core.blueprintId).toBeTruthy()

			const manifest = () => ({
				blueprintType: 'system' as BlueprintManifestType.SYSTEM,

				blueprintVersion: '0.0.0',
				integrationVersion: '0.0.0',
				TSRVersion: '0.0.0',
			})

			Blueprints.remove(protectString('fake_id'))
			Blueprints.insert(generateFakeBlueprint('fake_id', BlueprintManifestType.SYSTEM, manifest))

			const blueprint = await loadSystemBlueprints(core)
			expect(blueprint).toBeTruthy()
		})
	})

	describe('loadStudioBlueprints', () => {
		function getStudio(): Studio {
			const studio = Studios.findOne() as Studio
			expect(studio).toBeTruthy()
			return studio
		}

		test('Blueprint not specified', async () => {
			const studio = getStudio()
			studio.blueprintId = undefined
			expect(studio.blueprintId).toBeFalsy()

			const blueprint = await loadStudioBlueprint(studio)
			expect(blueprint).toBeFalsy()
		})
		test('Blueprint does not exist', async () => {
			const studio = getStudio()
			studio.blueprintId = protectString('fake_id')
			expect(studio.blueprintId).toBeTruthy()

			Blueprints.remove(protectString('fake_id'))

			await expect(loadStudioBlueprint(studio)).rejects.toThrowMeteor(
				404,
				`Blueprint "${studio.blueprintId}" not found! (referenced by Studio \"${studio._id}\")`
			)
		})
		test('Blueprint no type', async () => {
			const studio = getStudio()
			studio.blueprintId = protectString('fake_id')
			expect(studio.blueprintId).toBeTruthy()

			Blueprints.remove(protectString('fake_id'))
			Blueprints.insert(generateFakeBlueprint('fake_id'))

			await expect(loadStudioBlueprint(studio)).rejects.toThrowMeteor(
				500,
				`Blueprint "${studio.blueprintId}" is not valid for a Studio \"${studio._id}\" (undefined)!`
			)
		})
		test('Blueprint wrong type', async () => {
			const studio = getStudio()
			studio.blueprintId = protectString('fake_id')
			expect(studio.blueprintId).toBeTruthy()

			Blueprints.remove(protectString('fake_id'))
			Blueprints.insert(generateFakeBlueprint('fake_id', BlueprintManifestType.SHOWSTYLE))

			await expect(loadStudioBlueprint(studio)).rejects.toThrowMeteor(
				500,
				`Blueprint "${studio.blueprintId}" is not valid for a Studio \"${studio._id}\" (showstyle)!`
			)
		})
		test('Blueprint wrong internal type', async () => {
			const studio = getStudio()
			studio.blueprintId = protectString('fake_id')
			expect(studio.blueprintId).toBeTruthy()

			const manifest = () => ({
				blueprintType: 'system' as BlueprintManifestType.SYSTEM,

				blueprintVersion: '0.0.0',
				integrationVersion: '0.0.0',
				TSRVersion: '0.0.0',
			})

			Blueprints.remove(protectString('fake_id'))
			Blueprints.insert(generateFakeBlueprint('fake_id', BlueprintManifestType.STUDIO, manifest))

			await expect(loadStudioBlueprint(studio)).rejects.toThrowMeteor(
				500,
				`Evaluated Blueprint-manifest and document does not have the same blueprintType ("system", "studio")!`
			)
		})
		test('Blueprint correct type', async () => {
			const studio = getStudio()
			studio.blueprintId = protectString('fake_id')
			expect(studio.blueprintId).toBeTruthy()

			const manifest = () => ({
				blueprintType: 'studio' as BlueprintManifestType.STUDIO,
				blueprintVersion: '0.0.0',
				integrationVersion: '0.0.0',
				TSRVersion: '0.0.0',

				studioConfigManifest: [],
				studioMigrations: [],
				getBaseline: () => {
					return {
						timelineObjects: [],
					}
				},
				getShowStyleId: () => null,
			})

			Blueprints.remove(protectString('fake_id'))
			Blueprints.insert(generateFakeBlueprint('fake_id', BlueprintManifestType.STUDIO, manifest))

			const blueprint = (await loadStudioBlueprint(studio)) as WrappedStudioBlueprint
			expect(blueprint).toBeTruthy()

			expect(blueprint.blueprint.blueprintType).toEqual('studio')
		})
	})

	describe('loadShowStyleBlueprints', () => {
		function getShowStyle(): ShowStyleBase {
			const showStyle = ShowStyleBases.findOne() as ShowStyleBase
			expect(showStyle).toBeTruthy()
			return showStyle
		}

		test('Blueprint not specified', async () => {
			const showStyle = getShowStyle()
			;(showStyle as any).blueprintId = undefined
			expect(showStyle.blueprintId).toBeFalsy()

			await expect(loadShowStyleBlueprint(showStyle)).rejects.toThrowMeteor(
				500,
				`ShowStyleBase "${showStyle._id}" has no defined blueprint!`
			)
		})
		test('Blueprint does not exist', async () => {
			const showStyle = getShowStyle()
			showStyle.blueprintId = protectString('fake_id')
			expect(showStyle.blueprintId).toBeTruthy()

			Blueprints.remove(protectString('fake_id'))

			await expect(loadShowStyleBlueprint(showStyle)).rejects.toThrowMeteor(
				404,
				`Blueprint "${showStyle.blueprintId}" not found! (referenced by ShowStyleBase "${showStyle._id}")`
			)
		})
		test('Blueprint no type', async () => {
			const showStyle = getShowStyle()
			showStyle.blueprintId = protectString('fake_id')
			expect(showStyle.blueprintId).toBeTruthy()

			Blueprints.remove(protectString('fake_id'))
			Blueprints.insert(generateFakeBlueprint('fake_id'))

			await expect(loadShowStyleBlueprint(showStyle)).rejects.toThrowMeteor(
				500,
				`Blueprint "${showStyle.blueprintId}" is not valid for a ShowStyle "${showStyle._id}" (undefined)!`
			)
		})
		test('Blueprint wrong type', async () => {
			const showStyle = getShowStyle()
			showStyle.blueprintId = protectString('fake_id')
			expect(showStyle.blueprintId).toBeTruthy()

			Blueprints.remove(protectString('fake_id'))
			Blueprints.insert(generateFakeBlueprint('fake_id', BlueprintManifestType.SYSTEM))

			await expect(loadShowStyleBlueprint(showStyle)).rejects.toThrowMeteor(
				500,
				`Blueprint "${showStyle.blueprintId}" is not valid for a ShowStyle \"${showStyle._id}\" (system)!`
			)
		})
		test('Blueprint wrong internal type', async () => {
			const showStyle = getShowStyle()
			showStyle.blueprintId = protectString('fake_id')
			expect(showStyle.blueprintId).toBeTruthy()

			const manifest = () => ({
				blueprintType: 'system' as BlueprintManifestType.SYSTEM,

				blueprintVersion: '0.0.0',
				integrationVersion: '0.0.0',
				TSRVersion: '0.0.0',
			})

			Blueprints.remove(protectString('fake_id'))
			Blueprints.insert(generateFakeBlueprint('fake_id', BlueprintManifestType.SHOWSTYLE, manifest))

			await expect(loadShowStyleBlueprint(showStyle)).rejects.toThrowMeteor(
				500,
				`Evaluated Blueprint-manifest and document does not have the same blueprintType ("system", "showstyle")!`
			)
		})
		test('Blueprint correct type', async () => {
			const showStyle = getShowStyle()
			showStyle.blueprintId = protectString('fake_id')
			expect(showStyle.blueprintId).toBeTruthy()

			const manifest = () => ({
				blueprintType: 'showstyle' as BlueprintManifestType.SHOWSTYLE,

				blueprintVersion: '0.0.0',
				integrationVersion: '0.0.0',
				TSRVersion: '0.0.0',

				showStyleConfigManifest: [],
				showStyleMigrations: [],
				getShowStyleVariantId: () => null,
				getRundown: () => null as any as BlueprintResultRundown,
				getSegment: () => null as any as BlueprintResultSegment,
			})

			Blueprints.remove(protectString('fake_id'))
			Blueprints.insert(generateFakeBlueprint('fake_id', BlueprintManifestType.SHOWSTYLE, manifest))

			const blueprint = await loadShowStyleBlueprint(showStyle)
			expect(blueprint).toBeTruthy()
		})
	})

	describe('getBlueprintOfRundown', () => {
		function getRundown() {
			return new Rundown(
				literal<DBRundown>({
					_id: protectString('ro1'),
					playlistId: protectString('pls0'),
					_rank: 1,
					externalId: 'ro1',
					studioId: protectString('studio0'),
					showStyleBaseId: protectString(''),
					showStyleVariantId: protectString('variant0'),
					peripheralDeviceId: protectString(''),
					created: 0,
					modified: 0,
					importVersions: {} as any,
					name: 'test',
					externalNRCSName: 'mockNRCS',
					organizationId: protectString(''),
					timing: {
						type: PlaylistTimingType.None,
					},
				})
			)
		}
		test('Valid showStyleBase', async () => {
			const showStyle = ShowStyleBases.findOne() as ShowStyleBase
			expect(showStyle).toBeTruthy()

			const rundown = getRundown()
			rundown.showStyleBaseId = showStyle._id

			const blueprint = await loadShowStyleBlueprint(showStyle)
			expect(blueprint).toBeTruthy()
		})
	})
})
