import * as _ from 'underscore'
import {
	setupDefaultStudioEnvironment,
	setupMockStudio,
	setupDefaultRundown,
	DefaultEnvironment,
	setupDefaultRundownPlaylist,
} from '../../../../__mocks__/helpers/database'
import { getHash, literal, protectString, unprotectObject, unprotectString } from '../../../../lib/lib'
import { Studio } from '../../../../lib/collections/Studios'
import {
	LookaheadMode,
	NotesContext as INotesContext,
	IBlueprintPart,
	IBlueprintPartDB,
	IBlueprintAsRunLogEventContent,
	IBlueprintSegment,
	IBlueprintSegmentDB,
	IBlueprintPieceDB,
	TSR,
	IBlueprintPartInstance,
	IBlueprintPieceInstance,
} from 'tv-automation-sofie-blueprints-integration'
import {
	CommonContext,
	StudioConfigContext,
	StudioContext,
	ShowStyleContext,
	NotesContext,
	SegmentContext,
	PartEventContext,
	AsRunEventContext,
} from '../context'
import { ConfigRef } from '../config'
import { ShowStyleBases } from '../../../../lib/collections/ShowStyleBases'
import { ShowStyleVariant, ShowStyleVariants } from '../../../../lib/collections/ShowStyleVariants'
import { Rundowns, Rundown, RundownId } from '../../../../lib/collections/Rundowns'
import { DBPart, PartId } from '../../../../lib/collections/Parts'
import { AsRunLogEvent, AsRunLog } from '../../../../lib/collections/AsRunLog'
import { IngestDataCache, IngestCacheType } from '../../../../lib/collections/IngestDataCache'
import { Pieces } from '../../../../lib/collections/Pieces'
import {
	wrapPartToTemporaryInstance,
	PartInstance,
	PartInstances,
	unprotectPartInstance,
} from '../../../../lib/collections/PartInstances'
import { PieceInstances } from '../../../../lib/collections/PieceInstances'
import { SegmentId } from '../../../../lib/collections/Segments'

describe('Test blueprint api context', () => {
	function generateSparsePieceInstances(rundown: Rundown) {
		_.each(rundown.getParts(), (part, i) => {
			// make into a partInstance
			PartInstances.insert({
				_id: protectString(`${part._id}_instance`),
				rundownId: part.rundownId,
				segmentId: part.segmentId,
				takeCount: i,
				rehearsal: false,
				part,
			})

			const count = ((i + 2) % 4) + 1 // Some consistent randomness
			for (let i = 0; i < count; i++) {
				PieceInstances.insert({
					_id: protectString(`${part._id}_piece${i}`),
					rundownId: rundown._id,
					partInstanceId: protectString(`${part._id}_instance`),
					piece: {
						_id: protectString(`${part._id}_piece_inner${i}`),
						rundownId: rundown._id,
						partId: part._id,
						content: {
							index: i,
						},
					},
				} as any)
			}
		})
	}

	let env: DefaultEnvironment
	beforeAll(() => {
		env = setupDefaultStudioEnvironment()
	})

	describe('CommonContext', () => {
		test('no param', () => {
			const context = new CommonContext('pre')

			const res = context.getHashId(undefined as any)
			expect(res).toEqual(getHash('pre_hash0'))
			expect(context.unhashId(res)).toEqual('hash0')
		})
		test('no param + notUnique', () => {
			const context = new CommonContext('pre')

			const res = context.getHashId(undefined as any, true)
			expect(res).toEqual(getHash('pre_hash0_1'))
			expect(context.unhashId(res)).toEqual('hash0_1')
		})
		test('empty param', () => {
			const context = new CommonContext('pre')

			const res = context.getHashId('')
			expect(res).toEqual(getHash('pre_hash0'))
			expect(context.unhashId(res)).toEqual('hash0')

			const res2 = context.getHashId('')
			expect(res2).toEqual(getHash('pre_hash1'))
			expect(context.unhashId(res2)).toEqual('hash1')

			expect(res2).not.toEqual(res)
		})
		test('string', () => {
			const context = new CommonContext('pre')

			const res = context.getHashId('something')
			expect(res).toEqual(getHash('pre_something'))
			expect(context.unhashId(res)).toEqual('something')

			const res2 = context.getHashId('something')
			expect(res2).toEqual(getHash('pre_something'))
			expect(context.unhashId(res2)).toEqual('something')

			expect(res2).toEqual(res)
		})
		test('string + notUnique', () => {
			const context = new CommonContext('pre')

			const res = context.getHashId('something', true)
			expect(res).toEqual(getHash('pre_something_0'))
			expect(context.unhashId(res)).toEqual('something_0')

			const res2 = context.getHashId('something', true)
			expect(res2).toEqual(getHash('pre_something_1'))
			expect(context.unhashId(res2)).toEqual('something_1')

			expect(res2).not.toEqual(res)
		})
	})

	describe('NotesContext', () => {
		// TODO
	})

	describe('StudioConfigContext', () => {
		function mockStudio() {
			return setupMockStudio({
				settings: {
					sofieUrl: 'testUrl',
					mediaPreviewsUrl: '',
				},
				config: [
					{ _id: 'abc', value: true },
					{ _id: '123', value: 'val2' },
				],
			})
		}

		test('getStudio', () => {
			const studio = mockStudio()
			const context = new StudioConfigContext(studio)

			expect(context.getStudio()).toEqual(studio)
		})
		test('getStudioConfig', () => {
			const studio = mockStudio()
			const context = new StudioConfigContext(studio)

			expect(context.getStudioConfig()).toEqual({
				SofieHostURL: 'testUrl', // Injected
				abc: true,
				'123': 'val2',
			})
		})
		test('getStudioConfigRef', () => {
			const studio = mockStudio()
			const context = new StudioConfigContext(studio)

			const getStudioConfigRef = jest.spyOn(ConfigRef, 'getStudioConfigRef')
			getStudioConfigRef.mockImplementation(() => {
				return 'configVal1'
			})

			try {
				expect(context.getStudioConfigRef('conf1')).toEqual('configVal1')

				expect(getStudioConfigRef).toHaveBeenCalledTimes(1)
				expect(getStudioConfigRef).toHaveBeenCalledWith(studio._id, 'conf1')
			} finally {
				getStudioConfigRef.mockRestore()
			}
		})
	})

	describe('StudioContext', () => {
		function mockStudio() {
			return setupMockStudio({
				mappings: {
					abc: {
						deviceId: 'abc',
						device: TSR.DeviceType.ABSTRACT,
						lookahead: LookaheadMode.PRELOAD,
					},
				},
			})
		}

		test('getStudioMappings', () => {
			const studio = mockStudio()
			const context = new StudioContext(studio)

			expect(context.getStudioMappings()).toEqual({
				abc: {
					deviceId: 'abc',
					device: TSR.DeviceType.ABSTRACT,
					lookahead: LookaheadMode.PRELOAD,
				},
			})
		})
	})

	describe('ShowStyleContext', () => {
		function mockStudio() {
			return setupMockStudio({
				mappings: {
					abc: {
						deviceId: 'abc',
						device: TSR.DeviceType.ABSTRACT,
						lookahead: LookaheadMode.PRELOAD,
					},
				},
			})
		}

		function getContext(
			studio: Studio,
			contextName?: string,
			rundownId?: RundownId,
			segmentId?: SegmentId,
			partId?: PartId
		) {
			const showStyleVariant = ShowStyleVariants.findOne() as ShowStyleVariant
			expect(showStyleVariant).toBeTruthy()

			const notesContext = new NotesContext(
				contextName || 'N/A',
				`rundownId=${rundownId},segmentId=${segmentId}`,
				false
			)
			return new ShowStyleContext(studio, showStyleVariant.showStyleBaseId, showStyleVariant._id, notesContext)
		}

		test('handleNotesExternally', () => {
			const studio = mockStudio()
			const context = getContext(studio)
			const notesContext: NotesContext = context.notesContext
			expect(notesContext).toBeTruthy()

			expect(notesContext.handleNotesExternally).toEqual(context.handleNotesExternally)
			expect(notesContext.handleNotesExternally).toBeFalsy()

			// set to true
			context.handleNotesExternally = true
			expect(notesContext.handleNotesExternally).toEqual(context.handleNotesExternally)
			expect(notesContext.handleNotesExternally).toBeTruthy()

			// and back to false
			context.handleNotesExternally = false
			expect(notesContext.handleNotesExternally).toEqual(context.handleNotesExternally)
			expect(notesContext.handleNotesExternally).toBeFalsy()
		})

		test('getShowStyleBase', () => {
			const studio = mockStudio()
			const context = getContext(studio)

			const showStyleBase = context.getShowStyleBase()
			expect(showStyleBase).toBeTruthy()
			expect(showStyleBase._id).toEqual((context as any).showStyleBaseId)
		})

		test('getShowStyleConfig', () => {
			const studio = mockStudio()
			const context = getContext(studio)

			// Set some config
			ShowStyleVariants.update((context as any).showStyleVariantId, {
				$set: {
					config: [
						{ _id: 'one', value: true },
						{ _id: 'two', value: 'val2' },
					],
				},
			})
			ShowStyleBases.update((context as any).showStyleBaseId, {
				$set: {
					config: [
						{ _id: 'two', value: 'default' },
						{ _id: 'three', value: 765 },
					],
				},
			})

			expect(context.getShowStyleConfig()).toEqual({
				one: true,
				two: 'val2',
				three: 765,
			})
		})

		test('getShowStyleConfigRef', () => {
			const studio = mockStudio()
			const context = getContext(studio)

			const getShowStyleConfigRef = jest.spyOn(ConfigRef, 'getShowStyleConfigRef')
			getShowStyleConfigRef.mockImplementation(() => {
				return 'configVal1'
			})

			try {
				expect(context.getShowStyleConfigRef('conf1')).toEqual('configVal1')

				expect(getShowStyleConfigRef).toHaveBeenCalledTimes(1)
				expect(getShowStyleConfigRef).toHaveBeenCalledWith((context as any).showStyleVariantId, 'conf1')
			} finally {
				getShowStyleConfigRef.mockRestore()
			}
		})

		class FakeNotesContext implements INotesContext {
			error: (message: string) => void = jest.fn()
			warning: (message: string) => void = jest.fn()
			getHashId: (originString: string, originIsNotUnique?: boolean | undefined) => string = jest.fn(
				() => 'hashed'
			)
			unhashId: (hash: string) => string = jest.fn(() => 'unhash')
		}

		test('notes', () => {
			const studio = mockStudio()
			const context = getContext(studio)

			// Fake the notes context
			const fakeNotes = new FakeNotesContext()
				// Apply mocked notesContext:
			;(context as any).notesContext = fakeNotes

			context.error('this is an error', 'extid1')

			expect(fakeNotes.error).toHaveBeenCalledTimes(1)
			expect(fakeNotes.error).toHaveBeenCalledWith('this is an error', 'extid1')

			context.warning('this is an warning', 'extid1')
			expect(fakeNotes.warning).toHaveBeenCalledTimes(1)
			expect(fakeNotes.warning).toHaveBeenCalledWith('this is an warning', 'extid1')

			const hash = context.getHashId('str 1', false)
			expect(hash).toEqual('hashed')
			expect(fakeNotes.getHashId).toHaveBeenCalledTimes(1)
			expect(fakeNotes.getHashId).toHaveBeenCalledWith('str 1', false)

			const unhash = context.unhashId('str 1')
			expect(unhash).toEqual('unhash')
			expect(fakeNotes.unhashId).toHaveBeenCalledTimes(1)
			expect(fakeNotes.unhashId).toHaveBeenCalledWith('str 1')
		})
	})

	describe('SegmentContext', () => {
		test('getRuntimeArguments empty', () => {
			const defaultSetup = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(defaultSetup.rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const notesContext = new NotesContext('', `rundownId=${rundown._id},segmentId=N/A`, true)
			const context = new SegmentContext(rundown, undefined, {}, notesContext)
			expect(context.getStudio()).toBeTruthy()

			expect(context.getRuntimeArguments('')).toBeUndefined()
			expect(context.getRuntimeArguments('part1')).toBeUndefined()
		})

		test('getRuntimeArguments with data', () => {
			const defaultSetup = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(defaultSetup.rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const notesContext = new NotesContext('', `rundownId=${rundown._id},segmentId=N/A`, true)
			const context = new SegmentContext(
				rundown,
				undefined,
				{
					part1: {
						a: 'b',
						c: 'd',
					},
					part5: {},
				},
				notesContext
			)
			expect(context.getStudio()).toBeTruthy()

			expect(context.getRuntimeArguments('')).toBeUndefined()
			expect(context.getRuntimeArguments('part1')).toEqual({
				a: 'b',
				c: 'd',
			})
			expect(context.getRuntimeArguments('part2')).toBeUndefined()
			expect(context.getRuntimeArguments('part5')).toEqual({})
		})

		test('getRuntimeArguments from parts data', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const notesContext = new NotesContext('segment name', `rundownId=${rundownId},segmentId=N/A`, true)
			const context = new SegmentContext(
				rundown,
				undefined,
				[
					literal<Partial<DBPart>>({
						externalId: 'part1',
						runtimeArguments: {
							a: 'b',
							c: 'd',
						},
					}) as DBPart,
					literal<Partial<DBPart>>({
						externalId: 'part2',
					}) as DBPart,
					literal<Partial<DBPart>>({
						externalId: 'part5',
						runtimeArguments: {},
					}) as DBPart,
				],
				notesContext
			)
			expect(context.getStudio()).toBeTruthy()

			expect(context.getRuntimeArguments('')).toBeUndefined()
			expect(context.getRuntimeArguments('part1')).toEqual({
				a: 'b',
				c: 'd',
			})
			expect(context.getRuntimeArguments('part2')).toBeUndefined()
			expect(context.getRuntimeArguments('part5')).toEqual({})
		})
	})

	describe('PartEventContext', () => {
		test('get part', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const mockPart = {
				_id: protectString('not-a-real-part'),
			}

			const tmpPart = wrapPartToTemporaryInstance(mockPart as DBPart)
			const context = new PartEventContext(rundown, undefined, tmpPart)
			expect(context.getStudio()).toBeTruthy()

			expect(context.part).toEqual(tmpPart)
		})
	})

	describe('AsRunEventContext', () => {
		function getContext(rundown: Rundown, event?: Partial<AsRunLogEvent>) {
			const mockEvent: AsRunLogEvent = {
				_id: protectString(`${rundown._id}_tmp`),
				timestamp: Date.now(),
				rundownId: rundown._id,
				studioId: rundown.studioId,
				rehersal: false,
				content: IBlueprintAsRunLogEventContent.STARTEDPLAYBACK,
				...event,
			}

			return new AsRunEventContext(rundown, undefined, mockEvent)
		}
		test('getAllAsRunEvents', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const mockEvent: AsRunLogEvent = {
				_id: protectString(`${rundown._id}_tmp`),
				timestamp: Date.now(),
				rundownId: rundown._id,
				studioId: rundown.studioId,
				rehersal: false,
				content: IBlueprintAsRunLogEventContent.STARTEDPLAYBACK,
			}

			const context = new AsRunEventContext(rundown, undefined, mockEvent)
			expect(context.getStudio()).toBeTruthy()
			expect(context.asRunEvent).toEqual(mockEvent)

			// Should be no events yet
			expect(context.getAllAsRunEvents()).toHaveLength(0)

			AsRunLog.insert({
				_id: protectString(`${rundown._id}_event1`),
				timestamp: Date.now() - 1000,
				rundownId: rundown._id,
				studioId: rundown.studioId,
				rehersal: true,
				content: IBlueprintAsRunLogEventContent.STOPPEDPLAYBACK,
			})
			AsRunLog.insert(mockEvent)
			AsRunLog.insert({
				_id: protectString(`${rundown._id}_event2`),
				timestamp: Date.now() - 2000,
				rundownId: rundown._id,
				studioId: rundown.studioId,
				rehersal: true,
				content: IBlueprintAsRunLogEventContent.STARTEDPLAYBACK,
			})

			// Should now be some
			const events = context.getAllAsRunEvents()
			expect(events).toHaveLength(3)
			expect(_.pluck(events, '_id')).toEqual([
				`${rundown._id}_event2`,
				`${rundown._id}_event1`,
				`${rundown._id}_tmp`,
			])
		})

		test('getSegments', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown)

			// Should be some defaults
			expect(_.pluck(context.getSegments(), '_id')).toEqual([
				`${rundown._id}_segment0`,
				`${rundown._id}_segment1`,
				`${rundown._id}_segment2`,
			])
		})

		test('getSegment - no id', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown)

			try {
				// Event doesnt have a segment id
				context.getSegment()
				// Should not get here
				expect(false).toBeTruthy()
			} catch (e) {
				expect(e.message).toEqual('Match error: Expected string, got undefined')
			}
		})
		test('getSegment - empty id', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown)

			try {
				context.getSegment('')
				// Should not get here
				expect(false).toBeTruthy()
			} catch (e) {
				expect(e.message).toEqual('Match error: Expected string, got undefined')
			}
		})
		test('getSegment - unknown id', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown)

			expect(context.getSegment('not-a-real-segment')).toBeUndefined()
		})
		test('getSegment - good', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown)

			const segment = context.getSegment(`${rundown._id}_segment1`) as IBlueprintSegmentDB
			expect(segment).toBeTruthy()
			expect(segment._id).toEqual(`${rundown._id}_segment1`)
		})
		test('getSegment - empty id with event segmentId', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown, {
				segmentId: protectString(`${rundown._id}_segment0`),
			})

			const segment = context.getSegment('') as IBlueprintSegmentDB
			expect(segment).toBeTruthy()
			expect(segment._id).toEqual(`${rundown._id}_segment0`)
		})
		test('getSegment - good with event segmentId', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown, {
				segmentId: protectString(`${rundown._id}_segment1`),
			})

			const segment = context.getSegment(`${rundown._id}_segment2`) as IBlueprintSegmentDB
			expect(segment).toBeTruthy()
			expect(segment._id).toEqual(`${rundown._id}_segment2`)
		})

		test('getParts', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()
			generateSparsePieceInstances(rundown)

			const context = getContext(rundown)

			// Should be some defaults
			expect(_.pluck(context.getParts(), '_id')).toEqual([
				`${rundown._id}_part0_0`,
				`${rundown._id}_part0_1`,
				`${rundown._id}_part1_0`,
				`${rundown._id}_part1_1`,
				`${rundown._id}_part1_2`,
			])
		})

		test('getPartInstance - no id', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()
			generateSparsePieceInstances(rundown)

			const context = getContext(rundown)

			try {
				// Event doesnt have a segment id
				context.getPartInstance()
				// Should not get here
				expect(false).toBeTruthy()
			} catch (e) {
				expect(e.message).toEqual('Match error: Expected string, got undefined')
			}
		})
		test('getPartInstance - empty id', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()
			generateSparsePieceInstances(rundown)

			const context = getContext(rundown)

			try {
				context.getPartInstance('')
				// Should not get here
				expect(false).toBeTruthy()
			} catch (e) {
				expect(e.message).toEqual('Match error: Expected string, got undefined')
			}
		})
		test('getPartInstance - unknown id', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()
			generateSparsePieceInstances(rundown)

			const context = getContext(rundown)

			expect(context.getPartInstance('not-a-real-part')).toBeUndefined()
		})
		test('getPartInstance - good', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()
			generateSparsePieceInstances(rundown)

			const context = getContext(rundown)

			const part = context.getPartInstance(`${rundown._id}_part1_0_instance`) as IBlueprintPartInstance
			expect(part).toBeTruthy()
			expect(part._id).toEqual(`${rundown._id}_part1_0_instance`)
		})
		test('getPartInstance - empty id with event partId', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()
			generateSparsePieceInstances(rundown)

			const context = getContext(rundown, {
				partInstanceId: protectString(`${rundown._id}_part1_1_instance`),
			})

			const part = context.getPartInstance('') as IBlueprintPartInstance
			expect(part).toBeTruthy()
			expect(part._id).toEqual(`${rundown._id}_part1_1_instance`)
		})
		test('getPartInstance - good with event partId', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()
			generateSparsePieceInstances(rundown)

			const context = getContext(rundown, {
				partInstanceId: protectString(`${rundown._id}_part1_2_instance`),
			})

			const part = context.getPartInstance(`${rundown._id}_part0_1_instance`) as IBlueprintPartInstance
			expect(part).toBeTruthy()
			expect(part._id).toEqual(`${rundown._id}_part0_1_instance`)
		})

		test('getIngestDataForPartInstance - no part', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown)

			try {
				context.getIngestDataForPartInstance(undefined as any)
				// Should not get here
				expect(false).toBeTruthy()
			} catch (e) {
				expect(e.message).toEqual("Cannot read property 'part' of undefined")
			}
		})
		test('getIngestDataForPartInstance - no id', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown)

			try {
				context.getIngestDataForPartInstance({} as any)
				// Should not get here
				expect(false).toBeTruthy()
			} catch (e) {
				expect(e.message).toEqual("Cannot read property '_id' of undefined")
			}
		})
		test('getIngestDataForPartInstance - no data', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown)

			const part = rundown.getParts()[3]
			expect(part).toBeTruthy()

			const partInstance = wrapPartToTemporaryInstance(part)
			const ingestPart = context.getIngestDataForPartInstance(unprotectPartInstance(partInstance))
			expect(ingestPart).toBeUndefined()
		})
		test('getIngestDataForPartInstance - good', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown)

			const part = rundown.getParts()[3]
			expect(part).toBeTruthy()

			IngestDataCache.insert({
				_id: protectString(''),
				rundownId: rundown._id,
				segmentId: part.segmentId,
				partId: part._id,
				type: IngestCacheType.PART,
				modified: 0,
				data: {
					fakeData: true,
				} as any,
			})

			const partInstance = wrapPartToTemporaryInstance(part)
			const ingestPart = context.getIngestDataForPartInstance(unprotectObject(partInstance))
			expect(ingestPart).toEqual({
				fakeData: true,
			})
		})

		test('getIngestDataForRundown - no data', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown)

			const ingestRundown = context.getIngestDataForRundown()
			expect(ingestRundown).toBeUndefined()
		})
		// TODO
		// test('getIngestDataForRundown - good', () => {
		// 	const rundownId = setupDefaultRundown(env)
		// 	const rundown = Rundowns.findOne(rundownId) as Rundown
		// 	expect(rundown).toBeTruthy()

		// 	const context = getContext(rundown)

		// 	const ingestRundown = context.getIngestDataForRundown()
		// 	expect(ingestRundown).toBeUndefined()
		// })

		test('getPieceInstances - good', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown)

			// Generate some pieces
			generateSparsePieceInstances(rundown)

			const part = PartInstances.find({ rundownId: rundown._id }).fetch()[3]
			expect(part).toBeTruthy()

			// Should be some defaults
			expect(_.pluck(context.getPieceInstances(unprotectString(part._id)), '_id')).toEqual([
				`${rundown._id}_part1_1_piece0`,
				`${rundown._id}_part1_1_piece1`,
			])
		})
		test('getPieceInstances - bad id', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown)

			// Generate some pieces
			generateSparsePieceInstances(rundown)

			// Should be some defaults
			expect(context.getPieceInstances('not-a-real-part')).toHaveLength(0)
		})
		test('getPieceInstances - empty id', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown)

			// Generate some pieces
			generateSparsePieceInstances(rundown)

			// Should be some defaults
			expect(context.getPieceInstances('')).toHaveLength(0)
		})

		test('getPieceInstance - no id', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown)

			// Generate some pieces
			generateSparsePieceInstances(rundown)

			expect(context.getPieceInstance()).toBeUndefined()
		})
		test('getPieceInstance - empty id', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown)

			// Generate some pieces
			generateSparsePieceInstances(rundown)

			expect(context.getPieceInstance('')).toBeUndefined()
		})
		test('getPieceInstance - unknown id', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown)

			// Generate some pieces
			generateSparsePieceInstances(rundown)

			expect(context.getPieceInstance('not-a-real-piece')).toBeUndefined()
		})
		test('getPieceInstance - good', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown)

			// Generate some pieces
			generateSparsePieceInstances(rundown)

			const piece = context.getPieceInstance(`${rundown._id}_part0_1_piece3`) as IBlueprintPieceInstance
			expect(piece).toBeTruthy()
			expect(piece._id).toEqual(`${rundown._id}_part0_1_piece3`)
		})
		test('getPieceInstance - empty id with event pieceId', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown, {
				pieceInstanceId: protectString(`${rundown._id}_part0_1_piece2`),
			})

			// Generate some pieces
			generateSparsePieceInstances(rundown)

			const piece = context.getPieceInstance('') as IBlueprintPieceInstance
			expect(piece).toBeTruthy()
			expect(piece._id).toEqual(`${rundown._id}_part0_1_piece2`)
		})
		test('getPieceInstance - good with event pieceId', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown, {
				pieceInstanceId: protectString(`${rundown._id}_part0_1_piece2`),
			})

			// Generate some pieces
			generateSparsePieceInstances(rundown)

			const piece = context.getPieceInstance(`${rundown._id}_part1_2_piece0`) as IBlueprintPieceInstance
			expect(piece).toBeTruthy()
			expect(piece._id).toEqual(`${rundown._id}_part1_2_piece0`)
		})

		test('formatDateAsTimecode', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown)

			const d = new Date('2019-01-01 18:33:34:896')
			expect(context.formatDateAsTimecode(d.getTime())).toEqual('18:33:34:22')
		})

		test('formatDurationAsTimecode', () => {
			const { rundownId } = setupDefaultRundownPlaylist(env)
			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()

			const context = getContext(rundown)

			expect(context.formatDurationAsTimecode(0)).toEqual('00:00:00:00')
			expect(context.formatDurationAsTimecode(10000)).toEqual('00:00:10:00')
			expect(context.formatDurationAsTimecode(12345678)).toEqual('03:25:45:16')
		})
	})
})
