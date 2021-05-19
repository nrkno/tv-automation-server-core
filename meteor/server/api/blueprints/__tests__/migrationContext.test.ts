import * as _ from 'underscore'
import { setupDefaultStudioEnvironment } from '../../../../__mocks__/helpers/database'
import { testInFiber } from '../../../../__mocks__/helpers/jest'
import { PeripheralDevice, PeripheralDevices } from '../../../../lib/collections/PeripheralDevices'
import { literal, getRandomId, protectString } from '../../../../lib/lib'
import {
	LookaheadMode,
	BlueprintMapping,
	ISourceLayer,
	SourceLayerType,
	IOutputLayer,
	TSR,
	IBlueprintShowStyleVariant,
	IBlueprintConfig,
} from '@sofie-automation/blueprints-integration'
import { Studios, Studio, MappingExt } from '../../../../lib/collections/Studios'
import { MigrationContextStudio, MigrationContextShowStyle } from '../migrationContext'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { PlayoutDeviceSettings } from '../../../../lib/collections/PeripheralDeviceSettings/playoutDevice'
import { ShowStyleBase, ShowStyleBases } from '../../../../lib/collections/ShowStyleBases'
import { ShowStyleVariant, ShowStyleVariants } from '../../../../lib/collections/ShowStyleVariants'

describe('Test blueprint migrationContext', () => {
	beforeAll(() => {
		setupDefaultStudioEnvironment()
	})

	describe('MigrationContextStudio', () => {
		function getContext() {
			const studio = Studios.findOne() as Studio
			expect(studio).toBeTruthy()
			return new MigrationContextStudio(studio)
		}
		function getStudio(context: MigrationContextStudio): Studio {
			const studio = (context as any).studio
			expect(studio).toBeTruthy()
			return studio
		}
		describe('mappings', () => {
			function getMappingFromDb(studio: Studio, mappingId: string): MappingExt | undefined {
				const studio2 = Studios.findOne(studio._id) as Studio
				expect(studio2).toBeTruthy()
				return studio2.mappings[mappingId]
			}

			testInFiber('getMapping: no id', () => {
				const ctx = getContext()
				const mapping = ctx.getMapping('')
				expect(mapping).toBeFalsy()
			})
			testInFiber('getMapping: missing', () => {
				const ctx = getContext()
				const mapping = ctx.getMapping('fake_mapping')
				expect(mapping).toBeFalsy()
			})
			testInFiber('getMapping: good', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)
				const rawMapping = {
					device: TSR.DeviceType.ABSTRACT,
					deviceId: protectString('dev1'),
					lookahead: LookaheadMode.NONE,
				}
				studio.mappings['mapping1'] = rawMapping

				const mapping = ctx.getMapping('mapping1') as BlueprintMapping
				expect(mapping).toEqual(rawMapping)

				// Ensure it is a copy
				mapping.deviceId = 'changed'
				expect(mapping).not.toEqual(studio.mappings['mapping1'])
			})

			testInFiber('insertMapping: good', () => {
				const ctx = getContext()

				const rawMapping = {
					device: TSR.DeviceType.ABSTRACT,
					deviceId: 'dev1',
					lookahead: LookaheadMode.NONE,
				}

				const mappingId = ctx.insertMapping('mapping2', rawMapping)
				expect(mappingId).toEqual('mapping2')

				// get should return the same
				const mapping = ctx.getMapping('mapping2')
				expect(mapping).toEqual(rawMapping)

				// check db is the same
				const dbMapping = getMappingFromDb(getStudio(ctx), 'mapping2')
				expect(dbMapping).toEqual(rawMapping)
			})
			testInFiber('insertMapping: no id', () => {
				const ctx = getContext()

				const rawMapping = {
					device: TSR.DeviceType.ABSTRACT,
					deviceId: 'dev1',
					lookahead: LookaheadMode.NONE,
				}

				try {
					ctx.insertMapping('', rawMapping)
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] Mapping id "" is invalid`)
				}

				// get should return the same
				const mapping = ctx.getMapping('')
				expect(mapping).toBeFalsy()

				// check db is the same
				const dbMapping = getMappingFromDb(getStudio(ctx), '')
				expect(dbMapping).toBeFalsy()
			})
			testInFiber('insertMapping: existing', () => {
				const ctx = getContext()
				const existingMapping = ctx.getMapping('mapping2')
				expect(existingMapping).toBeTruthy()

				const rawMapping = {
					device: TSR.DeviceType.ATEM,
					deviceId: 'dev2',
					lookahead: LookaheadMode.PRELOAD,
				}
				expect(rawMapping).not.toEqual(existingMapping)

				try {
					ctx.insertMapping('mapping2', rawMapping)
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[404] Mapping "mapping2" cannot be inserted as it already exists`)
				}

				// get should return the same
				const mapping = ctx.getMapping('mapping2')
				expect(mapping).toEqual(existingMapping)

				// check db is the same
				const dbMapping = getMappingFromDb(getStudio(ctx), 'mapping2')
				expect(dbMapping).toEqual(existingMapping)
			})

			testInFiber('updateMapping: good', () => {
				const ctx = getContext()
				const existingMapping = ctx.getMapping('mapping2') as BlueprintMapping
				expect(existingMapping).toBeTruthy()

				const rawMapping = {
					device: TSR.DeviceType.HYPERDECK,
					deviceId: 'hyper0',
				}
				ctx.updateMapping('mapping2', rawMapping)

				const expectedMapping = {
					...existingMapping,
					...rawMapping,
				}

				// get should return the same
				const mapping = ctx.getMapping('mapping2')
				expect(mapping).toEqual(expectedMapping)

				// check db is the same
				const dbMapping = getMappingFromDb(getStudio(ctx), 'mapping2')
				expect(dbMapping).toEqual(expectedMapping)
			})
			testInFiber('updateMapping: no props', () => {
				const ctx = getContext()
				const existingMapping = ctx.getMapping('mapping2') as BlueprintMapping
				expect(existingMapping).toBeTruthy()

				// Should not error
				ctx.updateMapping('mapping2', {})
			})
			testInFiber('updateMapping: no id', () => {
				const ctx = getContext()
				const existingMapping = ctx.getMapping('') as BlueprintMapping
				expect(existingMapping).toBeFalsy()

				try {
					ctx.updateMapping('', { device: TSR.DeviceType.HYPERDECK })
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[404] Mapping "" cannot be updated as it does not exist`)
				}
			})
			testInFiber('updateMapping: missing', () => {
				const ctx = getContext()
				expect(ctx.getMapping('mapping1')).toBeFalsy()

				const rawMapping = {
					device: TSR.DeviceType.HYPERDECK,
					deviceId: 'hyper0',
				}

				try {
					ctx.updateMapping('mapping1', rawMapping)
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[404] Mapping "mapping1" cannot be updated as it does not exist`)
				}

				// get should return the same
				const mapping = ctx.getMapping('mapping1')
				expect(mapping).toBeFalsy()

				// check db is the same
				const dbMapping = getMappingFromDb(getStudio(ctx), 'mapping1')
				expect(dbMapping).toBeFalsy()
			})

			testInFiber('removeMapping: missing', () => {
				const ctx = getContext()
				expect(ctx.getMapping('mapping1')).toBeFalsy()

				// Should not error
				ctx.removeMapping('mapping1')
			})
			testInFiber('removeMapping: no id', () => {
				const ctx = getContext()
				expect(ctx.getMapping('')).toBeFalsy()
				expect(ctx.getMapping('mapping2')).toBeTruthy()

				// Should not error
				ctx.removeMapping('')

				// ensure other mappings still exist
				expect(getMappingFromDb(getStudio(ctx), 'mapping2')).toBeTruthy()
			})
			testInFiber('removeMapping: good', () => {
				const ctx = getContext()
				expect(ctx.getMapping('mapping2')).toBeTruthy()

				ctx.removeMapping('mapping2')

				// check was removed
				expect(ctx.getMapping('mapping2')).toBeFalsy()
				expect(getMappingFromDb(getStudio(ctx), 'mapping2')).toBeFalsy()
			})
		})

		describe('config', () => {
			function getAllConfigFromDb(studio: Studio): IBlueprintConfig {
				const studio2 = Studios.findOne(studio._id) as Studio
				expect(studio2).toBeTruthy()
				return studio2.blueprintConfig
			}

			testInFiber('getConfig: no id', () => {
				const ctx = getContext()

				expect(ctx.getConfig('')).toBeFalsy()
			})
			testInFiber('getConfig: missing', () => {
				const ctx = getContext()

				expect(ctx.getConfig('conf1')).toBeFalsy()
			})
			testInFiber('getConfig: good', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)

				studio.blueprintConfig['conf1'] = 5
				expect(ctx.getConfig('conf1')).toEqual(5)

				studio.blueprintConfig['conf2'] = '   af '
				expect(ctx.getConfig('conf2')).toEqual('af')
			})

			testInFiber('setConfig: no id', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)
				const initialConfig = _.clone(studio.blueprintConfig)

				try {
					ctx.setConfig('', 34)
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] Config id "" is invalid`)
				}

				// Config should not have changed
				expect(studio.blueprintConfig).toEqual(initialConfig)
				expect(getAllConfigFromDb(studio)).toEqual(initialConfig)
			})
			testInFiber('setConfig: insert', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)
				const initialConfig = _.clone(studio.blueprintConfig)
				expect(ctx.getConfig('conf1')).toBeFalsy()

				ctx.setConfig('conf1', 34)

				const expectedItem = {
					_id: 'conf1',
					value: 34,
				}
				expect(ctx.getConfig('conf1')).toEqual(expectedItem.value)

				// Config should have changed
				initialConfig[expectedItem._id] = expectedItem.value
				expect(studio.blueprintConfig).toEqual(initialConfig)
				expect(getAllConfigFromDb(studio)).toEqual(initialConfig)
			})
			testInFiber('setConfig: insert undefined', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)
				const initialConfig = _.clone(studio.blueprintConfig)
				expect(ctx.getConfig('confUndef')).toBeFalsy()

				ctx.setConfig('confUndef', undefined as any)

				const expectedItem = {
					_id: 'confUndef',
					value: undefined as any,
				}
				expect(ctx.getConfig('confUndef')).toEqual(expectedItem.value)

				// Config should have changed
				initialConfig[expectedItem._id] = expectedItem.value
				expect(studio.blueprintConfig).toEqual(initialConfig)
				expect(getAllConfigFromDb(studio)).toEqual(initialConfig)
			})

			testInFiber('setConfig: update', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)
				const initialConfig = _.clone(studio.blueprintConfig)
				expect(ctx.getConfig('conf1')).toBeTruthy()

				ctx.setConfig('conf1', 'hello')

				const expectedItem = {
					_id: 'conf1',
					value: 'hello',
				}
				expect(ctx.getConfig('conf1')).toEqual(expectedItem.value)

				// Config should have changed
				initialConfig[expectedItem._id] = expectedItem.value
				expect(studio.blueprintConfig).toEqual(initialConfig)
				expect(getAllConfigFromDb(studio)).toEqual(initialConfig)
			})
			testInFiber('setConfig: update undefined', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)
				const initialConfig = _.clone(studio.blueprintConfig)
				expect(ctx.getConfig('conf1')).toBeTruthy()

				ctx.setConfig('conf1', undefined as any)

				const expectedItem = {
					_id: 'conf1',
					value: undefined as any,
				}
				expect(ctx.getConfig('conf1')).toEqual(expectedItem.value)

				// Config should have changed
				initialConfig[expectedItem._id] = expectedItem.value
				expect(studio.blueprintConfig).toEqual(initialConfig)
				expect(getAllConfigFromDb(studio)).toEqual(initialConfig)
			})

			testInFiber('removeConfig: no id', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)
				ctx.setConfig('conf1', true)
				const initialConfig = _.clone(studio.blueprintConfig)
				expect(ctx.getConfig('conf1')).toBeTruthy()

				// Should not error
				ctx.removeConfig('')

				// Config should not have changed
				expect(studio.blueprintConfig).toEqual(initialConfig)
				expect(getAllConfigFromDb(studio)).toEqual(initialConfig)
			})
			testInFiber('removeConfig: missing', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)
				const initialConfig = _.clone(studio.blueprintConfig)
				expect(ctx.getConfig('conf1')).toBeTruthy()
				expect(ctx.getConfig('fake_conf')).toBeFalsy()

				// Should not error
				ctx.removeConfig('fake_conf')

				// Config should not have changed
				expect(studio.blueprintConfig).toEqual(initialConfig)
				expect(getAllConfigFromDb(studio)).toEqual(initialConfig)
			})
			testInFiber('removeConfig: good', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)
				const initialConfig = _.clone(studio.blueprintConfig)
				expect(ctx.getConfig('conf1')).toBeTruthy()

				// Should not error
				ctx.removeConfig('conf1')

				// Config should have changed
				delete initialConfig['conf1']
				expect(studio.blueprintConfig).toEqual(initialConfig)
				expect(getAllConfigFromDb(studio)).toEqual(initialConfig)
			})
		})

		describe('devices', () => {
			function createPlayoutDevice(studio: Studio) {
				return PeripheralDevices.insert({
					_id: getRandomId(),
					name: 'Fake parent device',
					organizationId: null,
					type: PeripheralDeviceAPI.DeviceType.PLAYOUT,
					category: PeripheralDeviceAPI.DeviceCategory.PLAYOUT,
					subType: PeripheralDeviceAPI.SUBTYPE_PROCESS,
					studioId: studio._id,
					created: 0,
					lastConnected: 0,
					lastSeen: 0,
					status: {
						statusCode: 0,
					},
					connected: false,
					connectionId: null,
					token: '',
					settings: literal<PlayoutDeviceSettings>({
						devices: {
							device01: {
								type: TSR.DeviceType.ABSTRACT,
								options: {},
							},
						},
						locations: {},
					}),
					configManifest: {
						deviceConfig: [], // can be empty as it's only useful for UI.
					},
				})
			}
			function getPlayoutDevice(studio: Studio): PeripheralDevice {
				const device = PeripheralDevices.findOne({
					studioId: studio._id,
					type: PeripheralDeviceAPI.DeviceType.PLAYOUT,
					category: PeripheralDeviceAPI.DeviceCategory.PLAYOUT,
					subType: PeripheralDeviceAPI.SUBTYPE_PROCESS,
				})
				expect(device).toBeTruthy()
				return device as PeripheralDevice
			}

			testInFiber('getDevice: no id', () => {
				const ctx = getContext()
				const device = ctx.getDevice('')
				expect(device).toBeFalsy()
			})
			testInFiber('getDevice: missing', () => {
				const ctx = getContext()
				const device = ctx.getDevice('fake_device')
				expect(device).toBeFalsy()
			})
			testInFiber('getDevice: missing with parent', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)
				const playoutId = createPlayoutDevice(studio)
				expect(playoutId).toBeTruthy()

				const device = ctx.getDevice('fake_device')
				expect(device).toBeFalsy()
			})
			testInFiber('getDevice: good', () => {
				const ctx = getContext()
				const peripheral = getPlayoutDevice(getStudio(ctx))
				expect(peripheral).toBeTruthy()

				const device = ctx.getDevice('device01')
				expect(device).toBeTruthy()

				// Ensure bad id doesnt match it
				const device2 = ctx.getDevice('fake_device')
				expect(device2).toBeFalsy()
			})

			testInFiber('insertDevice: no id', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)
				const initialSettings = getPlayoutDevice(studio).settings
				expect(ctx.getDevice('')).toBeFalsy()

				try {
					ctx.insertDevice('', { type: TSR.DeviceType.ABSTRACT } as any)
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] Device id "" is invalid`)
				}

				expect(ctx.getDevice('')).toBeFalsy()
				expect(getPlayoutDevice(studio).settings).toEqual(initialSettings)
			})
			// testInFiber('insertDevice: no parent', () => { TODO
			// 	const ctx = getContext()
			// 	const studio = getStudio(ctx)
			// 	const initialSettings = getPlayoutDevice(studio).settings

			// 	try {
			// 		ctx.insertDevice('', { type: TSR.DeviceType.ABSTRACT })
			// 		fail('expected to throw')
			// 	} catch (e) {
			// 		expect(e.message).toBe(`[500] Device id "" is invalid`)
			// 	}

			// 	expect(ctx.getDevice('')).toBeFalsy()
			// 	expect(getPlayoutDevice(studio).settings).toEqual(initialSettings)
			// })
			testInFiber('insertDevice: already exists', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)
				const initialSettings = getPlayoutDevice(studio).settings
				expect(ctx.getDevice('device01')).toBeTruthy()

				try {
					ctx.insertDevice('device01', { type: TSR.DeviceType.CASPARCG } as any)
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[404] Device "device01" cannot be inserted as it already exists`)
				}

				expect(getPlayoutDevice(studio).settings).toEqual(initialSettings)
			})
			testInFiber('insertDevice: ok', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)
				const initialSettings = getPlayoutDevice(studio).settings as PlayoutDeviceSettings
				expect(ctx.getDevice('device11')).toBeFalsy()

				const rawDevice: any = { type: TSR.DeviceType.CASPARCG }

				const deviceId = ctx.insertDevice('device11', rawDevice)
				expect(deviceId).toEqual('device11')

				initialSettings.devices[deviceId] = rawDevice
				expect(getPlayoutDevice(studio).settings).toEqual(initialSettings)

				const device = ctx.getDevice(deviceId)
				expect(device).toEqual(rawDevice)
			})

			testInFiber('updateDevice: no id', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)
				const initialSettings = getPlayoutDevice(studio).settings
				expect(ctx.getDevice('')).toBeFalsy()

				try {
					ctx.updateDevice('', { type: TSR.DeviceType.ABSTRACT })
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] Device id "" is invalid`)
				}

				expect(ctx.getDevice('')).toBeFalsy()
				expect(getPlayoutDevice(studio).settings).toEqual(initialSettings)
			})
			// testInFiber('updateDevice: no parent', () => { TODO
			// 	const ctx = getContext()
			// 	const studio = getStudio(ctx)
			// 	const initialSettings = getPlayoutDevice(studio).settings

			// 	try {
			// 		ctx.updateDevice('', { type: TSR.DeviceType.ABSTRACT })
			// 		fail('expected to throw')
			// 	} catch (e) {
			// 		expect(e.message).toBe(`[500] Device id "" is invalid`)
			// 	}

			// 	expect(ctx.getDevice('')).toBeFalsy()
			// 	expect(getPlayoutDevice(studio).settings).toEqual(initialSettings)
			// })
			testInFiber('updateDevice: missing', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)
				const initialSettings = getPlayoutDevice(studio).settings
				expect(ctx.getDevice('device22')).toBeFalsy()

				try {
					ctx.updateDevice('device22', { type: TSR.DeviceType.ATEM })
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[404] Device "device22" cannot be updated as it does not exist`)
				}

				expect(getPlayoutDevice(studio).settings).toEqual(initialSettings)
			})
			testInFiber('Device: good', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)
				const initialSettings = getPlayoutDevice(studio).settings as PlayoutDeviceSettings
				expect(ctx.getDevice('device01')).toBeTruthy()

				const rawDevice: any = {
					type: TSR.DeviceType.HYPERDECK,
				}
				const expectedDevice = {
					...initialSettings.devices['device01'],
					...rawDevice,
				}

				ctx.updateDevice('device01', rawDevice)

				expect(ctx.getDevice('device01')).toEqual(expectedDevice)

				initialSettings.devices['device01'] = expectedDevice
				expect(getPlayoutDevice(studio).settings).toEqual(initialSettings)
			})

			testInFiber('removeDevice: no id', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)
				const initialSettings = getPlayoutDevice(studio).settings
				expect(ctx.getDevice('')).toBeFalsy()

				try {
					ctx.removeDevice('')
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] Device id "" is invalid`)
				}

				expect(ctx.getDevice('')).toBeFalsy()
				expect(getPlayoutDevice(studio).settings).toEqual(initialSettings)
			})
			// testInFiber('removeDevice: no parent', () => { TODO
			// 	const ctx = getContext()
			// 	const studio = getStudio(ctx)
			// 	const initialSettings = getPlayoutDevice(studio).settings

			// 	try {
			// 		ctx.removeDevice('', { type: TSR.DeviceType.ABSTRACT })
			// 		fail('expected to throw')
			// 	} catch (e) {
			// 		expect(e.message).toBe(`[500] Device id "" is invalid`)
			// 	}

			// 	expect(ctx.getDevice('')).toBeFalsy()
			// 	expect(getPlayoutDevice(studio).settings).toEqual(initialSettings)
			// })
			testInFiber('removeDevice: missing', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)
				const initialSettings = getPlayoutDevice(studio).settings
				expect(ctx.getDevice('device22')).toBeFalsy()

				// Should not error
				ctx.removeDevice('device22')

				expect(getPlayoutDevice(studio).settings).toEqual(initialSettings)
			})
			testInFiber('removeDevice: good', () => {
				const ctx = getContext()
				const studio = getStudio(ctx)
				const initialSettings = getPlayoutDevice(studio).settings as PlayoutDeviceSettings
				expect(ctx.getDevice('device01')).toBeTruthy()

				// Should not error
				ctx.removeDevice('device01')

				expect(ctx.getDevice('device01')).toBeFalsy()
				delete initialSettings.devices['device01']
				expect(getPlayoutDevice(studio).settings).toEqual(initialSettings)
			})
		})
	})

	describe('MigrationContextShowStyle', () => {
		function getContext() {
			const showStyle = ShowStyleBases.findOne() as ShowStyleBase
			expect(showStyle).toBeTruthy()
			return new MigrationContextShowStyle(showStyle)
		}
		function getShowStyle(context: MigrationContextShowStyle): ShowStyleBase {
			const showStyleBase = (context as any).showStyleBase
			expect(showStyleBase).toBeTruthy()
			return showStyleBase
		}
		function createVariant(ctx: MigrationContextShowStyle, id: string, config?: IBlueprintConfig) {
			const showStyle = getShowStyle(ctx)

			const rawVariant = literal<ShowStyleVariant>({
				_id: protectString(ctx.getVariantId(id)),
				name: 'test',
				showStyleBaseId: showStyle._id,
				blueprintConfig: config || {},
				_rundownVersionHash: '',
			})
			ShowStyleVariants.insert(rawVariant)

			return rawVariant
		}

		describe('variants', () => {
			testInFiber('getAllVariants: good', () => {
				const ctx = getContext()
				const variants = ctx.getAllVariants()
				expect(variants).toHaveLength(1)
			})
			testInFiber('getAllVariants: missing base', () => {
				const ctx = new MigrationContextShowStyle({ _id: 'fakeStyle' } as any)
				const variants = ctx.getAllVariants()
				expect(variants).toHaveLength(0)
			})

			testInFiber('getVariantId: consistent', () => {
				const ctx = getContext()

				const id1 = ctx.getVariantId('variant1')
				const id2 = ctx.getVariantId('variant1')
				expect(id2).toEqual(id1)

				const id3 = ctx.getVariantId('variant2')
				expect(id3).not.toEqual(id1)
			})
			testInFiber('getVariantId: different base', () => {
				const ctx = getContext()
				const ctx2 = new MigrationContextShowStyle({ _id: 'fakeStyle' } as any)

				const id1 = ctx.getVariantId('variant1')
				const id2 = ctx2.getVariantId('variant1')
				expect(id2).not.toEqual(id1)
			})

			testInFiber('getVariant: good', () => {
				const ctx = getContext()
				const rawVariant = createVariant(ctx, 'variant1')

				const variant = ctx.getVariant('variant1')
				expect(variant).toBeTruthy()
				expect(variant).toEqual(rawVariant)
			})
			testInFiber('getVariant: no id', () => {
				const ctx = getContext()

				try {
					ctx.getVariant('')
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] Variant id "" is invalid`)
				}
			})
			testInFiber('getVariant: missing', () => {
				const ctx = getContext()

				const variant = ctx.getVariant('fake_variant')
				expect(variant).toBeFalsy()
			})

			testInFiber('insertVariant: no id', () => {
				const ctx = getContext()
				const initialVariants = _.clone(ctx.getAllVariants())

				try {
					ctx.insertVariant('', {
						name: 'test2',
					})
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] Variant id "" is invalid`)
				}

				expect(ctx.getAllVariants()).toEqual(initialVariants)
			})
			testInFiber('insertVariant: already exists', () => {
				const ctx = getContext()
				const initialVariants = _.clone(ctx.getAllVariants())
				expect(ctx.getVariant('variant1')).toBeTruthy()

				try {
					ctx.insertVariant('variant1', {
						name: 'test2',
					})
					fail('expected to throw')
				} catch (e) {
					// TODO - tidy up the error type
					// expect(e.message).toBe(`[500] Variant id "variant1" already exists`)
				}

				expect(ctx.getAllVariants()).toEqual(initialVariants)
			})
			testInFiber('insertVariant: good', () => {
				const ctx = getContext()
				const initialVariants = _.clone(ctx.getAllVariants())
				expect(ctx.getVariant('variant2')).toBeFalsy()

				const variantId = ctx.insertVariant('variant2', {
					name: 'test2',
				})
				expect(variantId).toBeTruthy()
				expect(variantId).toEqual(ctx.getVariantId('variant2'))

				initialVariants.push(
					(literal<ShowStyleVariant>({
						_id: protectString(variantId),
						showStyleBaseId: getShowStyle(ctx)._id,
						name: 'test2',
						blueprintConfig: {},
						_rundownVersionHash: '',
					}) as any) as IBlueprintShowStyleVariant
				)
				expect(ctx.getAllVariants()).toEqual(initialVariants)
			})

			testInFiber('updateVariant: no id', () => {
				const ctx = getContext()
				const initialVariants = _.clone(ctx.getAllVariants())

				try {
					ctx.updateVariant('', {
						name: 'test12',
					})
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] Variant id "" is invalid`)
				}

				expect(ctx.getAllVariants()).toEqual(initialVariants)
			})
			testInFiber('updateVariant: missing', () => {
				const ctx = getContext()
				const initialVariants = _.clone(ctx.getAllVariants())
				expect(ctx.getVariant('variant11')).toBeFalsy()

				try {
					ctx.updateVariant('variant11', {
						name: 'test2',
					})
					fail('expected to throw')
				} catch (e) {
					// TODO - tidy up the error type
					// expect(e.message).toBe(`[404] Variant id "variant1" does not exist`)
				}

				expect(ctx.getAllVariants()).toEqual(initialVariants)
			})
			testInFiber('updateVariant: good', () => {
				const ctx = getContext()
				const initialVariants = _.clone(ctx.getAllVariants())
				expect(ctx.getVariant('variant1')).toBeTruthy()

				ctx.updateVariant('variant1', {
					name: 'newname',
				})

				_.each(initialVariants, (variant) => {
					if (variant._id === ctx.getVariantId('variant1')) {
						variant.name = 'newname'
					}
				})
				expect(ctx.getAllVariants()).toEqual(initialVariants)
			})

			testInFiber('removeVariant: no id', () => {
				const ctx = getContext()
				const initialVariants = _.clone(ctx.getAllVariants())

				try {
					ctx.removeVariant('')
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] Variant id "" is invalid`)
				}

				expect(ctx.getAllVariants()).toEqual(initialVariants)
			})
			testInFiber('removeVariant: missing', () => {
				const ctx = getContext()
				const initialVariants = _.clone(ctx.getAllVariants())
				expect(ctx.getVariant('variant11')).toBeFalsy()

				// Should not error
				ctx.removeVariant('variant11')

				expect(ctx.getAllVariants()).toEqual(initialVariants)
			})
			testInFiber('removeVariant: good', () => {
				const ctx = getContext()
				const initialVariants = _.clone(ctx.getAllVariants())
				expect(ctx.getVariant('variant1')).toBeTruthy()

				// Should not error
				ctx.removeVariant('variant1')

				const expectedVariants = _.filter(
					initialVariants,
					(variant) => variant._id !== ctx.getVariantId('variant1')
				)
				expect(ctx.getAllVariants()).toEqual(expectedVariants)
			})
		})

		describe('sourcelayer', () => {
			function getAllSourceLayersFromDb(showStyle: ShowStyleBase): ISourceLayer[] {
				const showStyle2 = ShowStyleBases.findOne(showStyle._id) as ShowStyleBase
				expect(showStyle2).toBeTruthy()
				return showStyle2.sourceLayers
			}

			testInFiber('getSourceLayer: no id', () => {
				const ctx = getContext()

				try {
					ctx.getSourceLayer('')
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] SourceLayer id "" is invalid`)
				}
			})
			testInFiber('getSourceLayer: missing', () => {
				const ctx = getContext()

				const layer = ctx.getSourceLayer('fake_source_layer')
				expect(layer).toBeFalsy()
			})
			testInFiber('getSourceLayer: good', () => {
				const ctx = getContext()

				const layer = ctx.getSourceLayer('cam0') as ISourceLayer
				expect(layer).toBeTruthy()
				expect(layer._id).toEqual('cam0')

				const layer2 = ctx.getSourceLayer('vt0') as ISourceLayer
				expect(layer2).toBeTruthy()
				expect(layer2._id).toEqual('vt0')
			})

			testInFiber('insertSourceLayer: no id', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialSourceLayers = _.clone(showStyle.sourceLayers)

				try {
					ctx.insertSourceLayer('', {
						name: 'test',
						_rank: 10,
						type: SourceLayerType.UNKNOWN,
					})
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] SourceLayer id "" is invalid`)
				}

				expect(getShowStyle(ctx).sourceLayers).toEqual(initialSourceLayers)
				expect(getAllSourceLayersFromDb(showStyle)).toEqual(initialSourceLayers)
			})
			testInFiber('insertSourceLayer: existing', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialSourceLayers = _.clone(showStyle.sourceLayers)

				try {
					ctx.insertSourceLayer('vt0', {
						name: 'test',
						_rank: 10,
						type: SourceLayerType.UNKNOWN,
					})
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] SourceLayer "vt0" already exists`)
				}

				expect(getShowStyle(ctx).sourceLayers).toEqual(initialSourceLayers)
				expect(getAllSourceLayersFromDb(showStyle)).toEqual(initialSourceLayers)
			})
			testInFiber('insertSourceLayer: good', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialSourceLayers = _.clone(showStyle.sourceLayers)

				const rawLayer = {
					name: 'test',
					_rank: 10,
					type: SourceLayerType.UNKNOWN,
				}

				ctx.insertSourceLayer('lay1', rawLayer)

				initialSourceLayers.push({
					...rawLayer,
					_id: 'lay1',
				})
				expect(getShowStyle(ctx).sourceLayers).toEqual(initialSourceLayers)
				expect(getAllSourceLayersFromDb(showStyle)).toEqual(initialSourceLayers)
			})

			testInFiber('updateSourceLayer: no id', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialSourceLayers = _.clone(showStyle.sourceLayers)

				try {
					ctx.updateSourceLayer('', {
						name: 'test',
						_rank: 10,
						type: SourceLayerType.UNKNOWN,
					})
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] SourceLayer id "" is invalid`)
				}

				expect(getShowStyle(ctx).sourceLayers).toEqual(initialSourceLayers)
				expect(getAllSourceLayersFromDb(showStyle)).toEqual(initialSourceLayers)
			})
			testInFiber('updateSourceLayer: missing', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialSourceLayers = _.clone(showStyle.sourceLayers)

				try {
					ctx.updateSourceLayer('fake99', {
						name: 'test',
						_rank: 10,
						type: SourceLayerType.UNKNOWN,
					})
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[404] SourceLayer "fake99" cannot be updated as it does not exist`)
				}

				expect(getShowStyle(ctx).sourceLayers).toEqual(initialSourceLayers)
				expect(getAllSourceLayersFromDb(showStyle)).toEqual(initialSourceLayers)
			})
			testInFiber('updateSourceLayer: good', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialSourceLayers = _.clone(showStyle.sourceLayers)
				expect(ctx.getSourceLayer('lay1')).toBeTruthy()

				const rawLayer = {
					name: 'test98',
					type: SourceLayerType.VT,
				}

				ctx.updateSourceLayer('lay1', rawLayer)

				_.each(initialSourceLayers, (layer, i) => {
					if (layer._id === 'lay1') {
						initialSourceLayers[i] = {
							...layer,
							...rawLayer,
						}
					}
				})
				expect(getShowStyle(ctx).sourceLayers).toEqual(initialSourceLayers)
				expect(getAllSourceLayersFromDb(showStyle)).toEqual(initialSourceLayers)
			})

			testInFiber('removeSourceLayer: no id', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialSourceLayers = _.clone(showStyle.sourceLayers)

				try {
					ctx.removeSourceLayer('')
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] SourceLayer id "" is invalid`)
				}

				expect(getShowStyle(ctx).sourceLayers).toEqual(initialSourceLayers)
				expect(getAllSourceLayersFromDb(showStyle)).toEqual(initialSourceLayers)
			})
			testInFiber('removeSourceLayer: missing', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialSourceLayers = _.clone(showStyle.sourceLayers)
				expect(ctx.getSourceLayer('fake99')).toBeFalsy()

				// Should not error
				ctx.removeSourceLayer('fake99')

				expect(getShowStyle(ctx).sourceLayers).toEqual(initialSourceLayers)
				expect(getAllSourceLayersFromDb(showStyle)).toEqual(initialSourceLayers)
			})
			testInFiber('removeSourceLayer: good', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialSourceLayers = _.clone(showStyle.sourceLayers)
				expect(ctx.getSourceLayer('lay1')).toBeTruthy()

				// Should not error
				ctx.removeSourceLayer('lay1')

				const expectedSourceLayers = _.filter(initialSourceLayers, (layer) => layer._id !== 'lay1')
				expect(getShowStyle(ctx).sourceLayers).toEqual(expectedSourceLayers)
				expect(getAllSourceLayersFromDb(showStyle)).toEqual(expectedSourceLayers)
			})
		})

		describe('outputlayer', () => {
			function getAllOutputLayersFromDb(showStyle: ShowStyleBase): IOutputLayer[] {
				const showStyle2 = ShowStyleBases.findOne(showStyle._id) as ShowStyleBase
				expect(showStyle2).toBeTruthy()
				return showStyle2.outputLayers
			}

			testInFiber('getOutputLayer: no id', () => {
				const ctx = getContext()

				try {
					ctx.getOutputLayer('')
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] OutputLayer id "" is invalid`)
				}
			})
			testInFiber('getOutputLayer: missing', () => {
				const ctx = getContext()

				const layer = ctx.getOutputLayer('fake_source_layer')
				expect(layer).toBeFalsy()
			})
			testInFiber('getOutputLayer: good', () => {
				const ctx = getContext()

				const layer = ctx.getOutputLayer('pgm') as IOutputLayer
				expect(layer).toBeTruthy()
				expect(layer._id).toEqual('pgm')
			})

			testInFiber('insertOutputLayer: no id', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialOutputLayers = _.clone(showStyle.outputLayers)

				try {
					ctx.insertOutputLayer('', {
						name: 'test',
						_rank: 10,
						isPGM: true,
					})
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] OutputLayer id "" is invalid`)
				}

				expect(getShowStyle(ctx).outputLayers).toEqual(initialOutputLayers)
				expect(getAllOutputLayersFromDb(showStyle)).toEqual(initialOutputLayers)
			})
			testInFiber('insertOutputLayer: existing', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialOutputLayers = _.clone(showStyle.outputLayers)

				try {
					ctx.insertOutputLayer('pgm', {
						name: 'test',
						_rank: 10,
						isPGM: true,
					})
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] OutputLayer "pgm" already exists`)
				}

				expect(getShowStyle(ctx).outputLayers).toEqual(initialOutputLayers)
				expect(getAllOutputLayersFromDb(showStyle)).toEqual(initialOutputLayers)
			})
			testInFiber('insertOutputLayer: good', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialOutputLayers = _.clone(showStyle.outputLayers)

				const rawLayer = {
					name: 'test',
					_rank: 10,
					isPGM: true,
				}

				ctx.insertOutputLayer('lay1', rawLayer)

				initialOutputLayers.push({
					...rawLayer,
					_id: 'lay1',
				})
				expect(getShowStyle(ctx).outputLayers).toEqual(initialOutputLayers)
				expect(getAllOutputLayersFromDb(showStyle)).toEqual(initialOutputLayers)
			})

			testInFiber('updateOutputLayer: no id', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialOutputLayers = _.clone(showStyle.outputLayers)

				try {
					ctx.updateOutputLayer('', {
						name: 'test',
						_rank: 10,
						isPGM: true,
					})
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] OutputLayer id "" is invalid`)
				}

				expect(getShowStyle(ctx).outputLayers).toEqual(initialOutputLayers)
				expect(getAllOutputLayersFromDb(showStyle)).toEqual(initialOutputLayers)
			})
			testInFiber('updateOutputLayer: missing', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialOutputLayers = _.clone(showStyle.outputLayers)

				try {
					ctx.updateOutputLayer('fake99', {
						name: 'test',
						_rank: 10,
						isPGM: true,
					})
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[404] OutputLayer "fake99" cannot be updated as it does not exist`)
				}

				expect(getShowStyle(ctx).outputLayers).toEqual(initialOutputLayers)
				expect(getAllOutputLayersFromDb(showStyle)).toEqual(initialOutputLayers)
			})
			testInFiber('updateOutputLayer: good', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialOutputLayers = _.clone(showStyle.outputLayers)
				expect(ctx.getOutputLayer('lay1')).toBeTruthy()

				const rawLayer = {
					name: 'test98',
				}

				ctx.updateOutputLayer('lay1', rawLayer)

				_.each(initialOutputLayers, (layer, i) => {
					if (layer._id === 'lay1') {
						initialOutputLayers[i] = {
							...layer,
							...rawLayer,
						}
					}
				})
				expect(getShowStyle(ctx).outputLayers).toEqual(initialOutputLayers)
				expect(getAllOutputLayersFromDb(showStyle)).toEqual(initialOutputLayers)
			})

			testInFiber('removeOutputLayer: no id', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialOutputLayers = _.clone(showStyle.outputLayers)

				try {
					ctx.removeOutputLayer('')
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] OutputLayer id "" is invalid`)
				}

				expect(getShowStyle(ctx).outputLayers).toEqual(initialOutputLayers)
				expect(getAllOutputLayersFromDb(showStyle)).toEqual(initialOutputLayers)
			})
			testInFiber('removeOutputLayer: missing', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialOutputLayers = _.clone(showStyle.outputLayers)
				expect(ctx.getOutputLayer('fake99')).toBeFalsy()

				// Should not error
				ctx.removeOutputLayer('fake99')

				expect(getShowStyle(ctx).outputLayers).toEqual(initialOutputLayers)
				expect(getAllOutputLayersFromDb(showStyle)).toEqual(initialOutputLayers)
			})
			testInFiber('removeOutputLayer: good', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialOutputLayers = _.clone(showStyle.outputLayers)
				expect(ctx.getOutputLayer('lay1')).toBeTruthy()

				// Should not error
				ctx.removeOutputLayer('lay1')

				const expectedOutputLayers = _.filter(initialOutputLayers, (layer) => layer._id !== 'lay1')
				expect(getShowStyle(ctx).outputLayers).toEqual(expectedOutputLayers)
				expect(getAllOutputLayersFromDb(showStyle)).toEqual(expectedOutputLayers)
			})
		})

		describe('base-config', () => {
			function getAllBaseConfigFromDb(showStyle: ShowStyleBase): IBlueprintConfig {
				const showStyle2 = ShowStyleBases.findOne(showStyle._id) as ShowStyleBase
				expect(showStyle2).toBeTruthy()
				return showStyle2.blueprintConfig
			}

			testInFiber('getBaseConfig: no id', () => {
				const ctx = getContext()

				expect(ctx.getBaseConfig('')).toBeFalsy()
			})
			testInFiber('getBaseConfig: missing', () => {
				const ctx = getContext()

				expect(ctx.getBaseConfig('conf1')).toBeFalsy()
			})
			testInFiber('getBaseConfig: good', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)

				showStyle.blueprintConfig['conf1'] = 5
				expect(ctx.getBaseConfig('conf1')).toEqual(5)

				showStyle.blueprintConfig['conf2'] = '   af '
				expect(ctx.getBaseConfig('conf2')).toEqual('af')
			})

			testInFiber('setBaseConfig: no id', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialBaseConfig = _.clone(showStyle.blueprintConfig)

				try {
					ctx.setBaseConfig('', 34)
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] Config id "" is invalid`)
				}

				// BaseConfig should not have changed
				expect(showStyle.blueprintConfig).toEqual(initialBaseConfig)
				expect(getAllBaseConfigFromDb(showStyle)).toEqual(initialBaseConfig)
			})
			testInFiber('setBaseConfig: insert', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialBaseConfig = _.clone(showStyle.blueprintConfig)
				expect(ctx.getBaseConfig('conf1')).toBeFalsy()

				ctx.setBaseConfig('conf1', 34)

				const expectedItem = {
					_id: 'conf1',
					value: 34,
				}
				expect(ctx.getBaseConfig('conf1')).toEqual(expectedItem.value)

				// BaseConfig should have changed
				initialBaseConfig[expectedItem._id] = expectedItem.value
				expect(showStyle.blueprintConfig).toEqual(initialBaseConfig)
				expect(getAllBaseConfigFromDb(showStyle)).toEqual(initialBaseConfig)
			})
			testInFiber('setBaseConfig: insert undefined', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialBaseConfig = _.clone(showStyle.blueprintConfig)
				expect(ctx.getBaseConfig('confUndef')).toBeFalsy()

				try {
					ctx.setBaseConfig('confUndef', undefined as any)
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[400] setBaseConfig \"confUndef\": value is undefined`)
				}

				// BaseConfig should not have changed
				expect(showStyle.blueprintConfig).toEqual(initialBaseConfig)
				expect(getAllBaseConfigFromDb(showStyle)).toEqual(initialBaseConfig)
			})

			testInFiber('setBaseConfig: update', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialBaseConfig = _.clone(showStyle.blueprintConfig)
				expect(ctx.getBaseConfig('conf1')).toBeTruthy()

				ctx.setBaseConfig('conf1', 'hello')

				const expectedItem = {
					_id: 'conf1',
					value: 'hello',
				}
				expect(ctx.getBaseConfig('conf1')).toEqual(expectedItem.value)

				// BaseConfig should have changed
				initialBaseConfig[expectedItem._id] = expectedItem.value
				expect(showStyle.blueprintConfig).toEqual(initialBaseConfig)
				expect(getAllBaseConfigFromDb(showStyle)).toEqual(initialBaseConfig)
			})
			testInFiber('setBaseConfig: update undefined', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialBaseConfig = _.clone(showStyle.blueprintConfig)
				expect(ctx.getBaseConfig('conf1')).toBeTruthy()

				try {
					ctx.setBaseConfig('conf1', undefined as any)
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[400] setBaseConfig \"conf1\": value is undefined`)
				}

				// BaseConfig should not have changed
				expect(showStyle.blueprintConfig).toEqual(initialBaseConfig)
				expect(getAllBaseConfigFromDb(showStyle)).toEqual(initialBaseConfig)
			})

			testInFiber('removeBaseConfig: no id', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				ctx.setBaseConfig('conf1', true)
				const initialBaseConfig = _.clone(showStyle.blueprintConfig)
				expect(ctx.getBaseConfig('conf1')).toBeTruthy()

				// Should not error
				ctx.removeBaseConfig('')

				// BaseConfig should not have changed
				expect(showStyle.blueprintConfig).toEqual(initialBaseConfig)
				expect(getAllBaseConfigFromDb(showStyle)).toEqual(initialBaseConfig)
			})
			testInFiber('removeBaseConfig: missing', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialBaseConfig = _.clone(showStyle.blueprintConfig)
				expect(ctx.getBaseConfig('conf1')).toBeTruthy()
				expect(ctx.getBaseConfig('fake_conf')).toBeFalsy()

				// Should not error
				ctx.removeBaseConfig('fake_conf')

				// BaseConfig should not have changed
				expect(showStyle.blueprintConfig).toEqual(initialBaseConfig)
				expect(getAllBaseConfigFromDb(showStyle)).toEqual(initialBaseConfig)
			})
			testInFiber('removeBaseConfig: good', () => {
				const ctx = getContext()
				const showStyle = getShowStyle(ctx)
				const initialBaseConfig = _.clone(showStyle.blueprintConfig)
				expect(ctx.getBaseConfig('conf1')).toBeTruthy()

				// Should not error
				ctx.removeBaseConfig('conf1')

				// BaseConfig should have changed
				delete initialBaseConfig['conf1']
				expect(showStyle.blueprintConfig).toEqual(initialBaseConfig)
				expect(getAllBaseConfigFromDb(showStyle)).toEqual(initialBaseConfig)
			})
		})
		describe('variant-config', () => {
			function getAllVariantConfigFromDb(ctx: MigrationContextShowStyle, variantId: string): IBlueprintConfig {
				const variant = ShowStyleVariants.findOne(
					protectString(ctx.getVariantId(variantId))
				) as ShowStyleVariant
				expect(variant).toBeTruthy()
				return variant.blueprintConfig
			}

			testInFiber('getVariantConfig: no variant id', () => {
				const ctx = getContext()

				try {
					ctx.getVariantConfig('', 'conf1')
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[404] ShowStyleVariant \"\" not found`)
				}
			})
			testInFiber('getVariantConfig: missing variant', () => {
				const ctx = getContext()

				try {
					ctx.getVariantConfig('fake_variant', 'conf1')
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[404] ShowStyleVariant \"fake_variant\" not found`)
				}
			})
			testInFiber('getVariantConfig: missing', () => {
				const ctx = getContext()
				createVariant(ctx, 'configVariant', { conf1: 5, conf2: '   af ' })

				expect(ctx.getVariantConfig('configVariant', 'conf11')).toBeFalsy()
			})
			testInFiber('getVariantConfig: good', () => {
				const ctx = getContext()
				expect(ctx.getVariant('configVariant')).toBeTruthy()

				expect(ctx.getVariantConfig('configVariant', 'conf1')).toEqual(5)
				expect(ctx.getVariantConfig('configVariant', 'conf2')).toEqual('af')
			})

			testInFiber('setVariantConfig: no variant id', () => {
				const ctx = getContext()

				try {
					ctx.setVariantConfig('', 'conf1', 5)
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[404] ShowStyleVariant \"\" not found`)
				}
			})
			testInFiber('setVariantConfig: missing variant', () => {
				const ctx = getContext()

				try {
					ctx.setVariantConfig('fake_variant', 'conf1', 5)
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[404] ShowStyleVariant \"fake_variant\" not found`)
				}
			})
			testInFiber('setVariantConfig: no id', () => {
				const ctx = getContext()
				const initialVariantConfig = _.clone(getAllVariantConfigFromDb(ctx, 'configVariant'))
				expect(ctx.getVariant('configVariant')).toBeTruthy()

				try {
					ctx.setVariantConfig('configVariant', '', 34)
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[500] Config id "" is invalid`)
				}

				// VariantConfig should not have changed
				expect(getAllVariantConfigFromDb(ctx, 'configVariant')).toEqual(initialVariantConfig)
			})
			testInFiber('setVariantConfig: insert', () => {
				const ctx = getContext()
				const initialVariantConfig = _.clone(getAllVariantConfigFromDb(ctx, 'configVariant'))
				expect(ctx.getVariantConfig('configVariant', 'conf19')).toBeFalsy()

				ctx.setVariantConfig('configVariant', 'conf19', 34)

				const expectedItem = {
					_id: 'conf19',
					value: 34,
				}
				expect(ctx.getVariantConfig('configVariant', 'conf19')).toEqual(expectedItem.value)

				// VariantConfig should have changed
				initialVariantConfig[expectedItem._id] = expectedItem.value
				expect(getAllVariantConfigFromDb(ctx, 'configVariant')).toEqual(initialVariantConfig)
			})
			testInFiber('setVariantConfig: insert undefined', () => {
				const ctx = getContext()
				const initialVariantConfig = _.clone(getAllVariantConfigFromDb(ctx, 'configVariant'))
				expect(ctx.getVariantConfig('configVariant', 'confUndef')).toBeFalsy()

				try {
					ctx.setVariantConfig('configVariant', 'confUndef', undefined as any)
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(
						`[400] setVariantConfig \"configVariant\", \"confUndef\": value is undefined`
					)
				}

				// VariantConfig should not have changed
				expect(getAllVariantConfigFromDb(ctx, 'configVariant')).toEqual(initialVariantConfig)
			})

			testInFiber('setVariantConfig: update', () => {
				const ctx = getContext()
				const initialVariantConfig = _.clone(getAllVariantConfigFromDb(ctx, 'configVariant'))
				expect(ctx.getVariantConfig('configVariant', 'conf1')).toBeTruthy()

				ctx.setVariantConfig('configVariant', 'conf1', 'hello')

				const expectedItem = {
					_id: 'conf1',
					value: 'hello',
				}
				expect(ctx.getVariantConfig('configVariant', 'conf1')).toEqual(expectedItem.value)

				// VariantConfig should have changed
				initialVariantConfig[expectedItem._id] = expectedItem.value
				expect(getAllVariantConfigFromDb(ctx, 'configVariant')).toEqual(initialVariantConfig)
			})
			testInFiber('setVariantConfig: update undefined', () => {
				const ctx = getContext()
				const initialVariantConfig = _.clone(getAllVariantConfigFromDb(ctx, 'configVariant'))
				expect(ctx.getVariantConfig('configVariant', 'conf1')).toBeTruthy()

				try {
					ctx.setVariantConfig('configVariant', 'conf1', undefined as any)
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[400] setVariantConfig \"configVariant\", \"conf1\": value is undefined`)
				}

				// VariantConfig should not have changed
				expect(getAllVariantConfigFromDb(ctx, 'configVariant')).toEqual(initialVariantConfig)
			})

			testInFiber('removeVariantConfig: no variant id', () => {
				const ctx = getContext()

				try {
					ctx.removeVariantConfig('', 'conf1')
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[404] ShowStyleVariant \"\" not found`)
				}
			})
			testInFiber('removeVariantConfig: missing variant', () => {
				const ctx = getContext()

				try {
					ctx.removeVariantConfig('fake_variant', 'conf1')
					fail('expected to throw')
				} catch (e) {
					expect(e.message).toBe(`[404] ShowStyleVariant \"fake_variant\" not found`)
				}
			})
			testInFiber('removeVariantConfig: no id', () => {
				const ctx = getContext()
				ctx.setVariantConfig('configVariant', 'conf1', true)
				const initialVariantConfig = _.clone(getAllVariantConfigFromDb(ctx, 'configVariant'))
				expect(ctx.getVariantConfig('configVariant', 'conf1')).toBeTruthy()

				// Should not error
				ctx.removeVariantConfig('configVariant', '')

				// VariantConfig should not have changed
				expect(getAllVariantConfigFromDb(ctx, 'configVariant')).toEqual(initialVariantConfig)
			})
			testInFiber('removeVariantConfig: missing', () => {
				const ctx = getContext()
				const initialVariantConfig = _.clone(getAllVariantConfigFromDb(ctx, 'configVariant'))
				expect(ctx.getVariantConfig('configVariant', 'conf1')).toBeTruthy()
				expect(ctx.getVariantConfig('configVariant', 'fake_conf')).toBeFalsy()

				// Should not error
				ctx.removeVariantConfig('configVariant', 'fake_conf')

				// VariantConfig should not have changed
				expect(getAllVariantConfigFromDb(ctx, 'configVariant')).toEqual(initialVariantConfig)
			})
			testInFiber('removeVariantConfig: good', () => {
				const ctx = getContext()
				const initialVariantConfig = _.clone(getAllVariantConfigFromDb(ctx, 'configVariant'))
				expect(ctx.getVariantConfig('configVariant', 'conf1')).toBeTruthy()

				// Should not error
				ctx.removeVariantConfig('configVariant', 'conf1')

				// VariantConfig should have changed
				delete initialVariantConfig['conf1']
				expect(getAllVariantConfigFromDb(ctx, 'configVariant')).toEqual(initialVariantConfig)
			})
		})
	})
})
