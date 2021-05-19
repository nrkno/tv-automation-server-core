import * as _ from 'underscore'
import { PeripheralDevices, PeripheralDevice } from '../../lib/collections/PeripheralDevices'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { StatusCode } from '../../server/systemStatus/systemStatus'
import { Studio, Studios, DBStudio } from '../../lib/collections/Studios'
import {
	PieceLifespan,
	IOutputLayer,
	ISourceLayer,
	SourceLayerType,
	StudioBlueprintManifest,
	BlueprintManifestType,
	IngestRundown,
	BlueprintManifestBase,
	ShowStyleBlueprintManifest,
	IShowStyleContext,
	BlueprintResultRundown,
	BlueprintResultSegment,
	IngestSegment,
	IBlueprintAdLibPiece,
	IBlueprintRundown,
	IBlueprintSegment,
	BlueprintResultPart,
	IBlueprintPart,
	IBlueprintPiece,
	TSR,
} from '@sofie-automation/blueprints-integration'
import { ShowStyleBase, ShowStyleBases, DBShowStyleBase, ShowStyleBaseId } from '../../lib/collections/ShowStyleBases'
import {
	ShowStyleVariant,
	DBShowStyleVariant,
	ShowStyleVariants,
	ShowStyleVariantId,
} from '../../lib/collections/ShowStyleVariants'
import { Blueprint, BlueprintId } from '../../lib/collections/Blueprints'
import { ICoreSystem, CoreSystem, SYSTEM_ID } from '../../lib/collections/CoreSystem'
import { internalUploadBlueprint } from '../../server/api/blueprints/api'
import { literal, getCurrentTime, protectString, unprotectString, getRandomId } from '../../lib/lib'
import { DBRundown, Rundowns, RundownId } from '../../lib/collections/Rundowns'
import { DBSegment, Segments } from '../../lib/collections/Segments'
import { DBPart, Parts } from '../../lib/collections/Parts'
import { Piece, Pieces } from '../../lib/collections/Pieces'
import { RundownAPI } from '../../lib/api/rundown'
import { DBRundownPlaylist, RundownPlaylists, RundownPlaylistId } from '../../lib/collections/RundownPlaylists'
import { RundownBaselineAdLibItem, RundownBaselineAdLibPieces } from '../../lib/collections/RundownBaselineAdLibPieces'
import { AdLibPiece, AdLibPieces } from '../../lib/collections/AdLibPieces'
import { restartRandomId } from '../random'
import { MongoMock } from '../mongo'
import {
	defaultRundownPlaylist,
	defaultRundown,
	defaultSegment,
	defaultPart,
	defaultPiece,
	defaultAdLibPiece,
	defaultStudio,
} from '../defaultCollectionObjects'
import { OrganizationId } from '../../lib/collections/Organization'

export enum LAYER_IDS {
	SOURCE_CAM0 = 'cam0',
	SOURCE_VT0 = 'vt0',
	OUTPUT_PGM = 'pgm',
}

function getBlueprintDependencyVersions(): { TSR_VERSION: string; INTEGRATION_VERSION: string } {
	const INTEGRATION_VERSION = require('../../node_modules/@sofie-automation/blueprints-integration/package.json')
		.version

	let TSR_VERSION = ''
	try {
		TSR_VERSION = require('../../node_modules/timeline-state-resolver-types/package.json').version
	} catch (e) {
		TSR_VERSION = require('../../node_modules/@sofie-automation/blueprints-integration/node_modules/timeline-state-resolver-types/package.json')
			.version
	}

	return {
		INTEGRATION_VERSION,
		TSR_VERSION,
	}
}

let dbI: number = 0
export function setupMockPeripheralDevice(
	category: PeripheralDeviceAPI.DeviceCategory,
	type: PeripheralDeviceAPI.DeviceType,
	subType: PeripheralDeviceAPI.DeviceSubType,
	studio?: Studio,
	doc?: Partial<PeripheralDevice>
) {
	doc = doc || {}

	const defaultDevice: PeripheralDevice = {
		_id: protectString('mockDevice' + dbI++),
		name: 'mockDevice',
		organizationId: null,
		studioId: studio ? studio._id : undefined,

		category: category,
		type: type,
		subType: subType,

		created: 1234,
		status: {
			statusCode: StatusCode.GOOD,
		},
		lastSeen: 1234,
		lastConnected: 1234,
		connected: true,
		connectionId: 'myConnectionId',
		token: 'mockToken',
		configManifest: {
			deviceConfig: [],
		},
	}
	const device = _.extend(defaultDevice, doc) as PeripheralDevice
	PeripheralDevices.insert(device)
	return device
}
export function setupMockCore(doc?: Partial<ICoreSystem>): ICoreSystem {
	// Reset everything mongo, to keep the ids predictable
	restartRandomId()
	MongoMock.deleteAllData()

	doc = doc || {}

	const defaultCore: ICoreSystem = {
		_id: SYSTEM_ID,
		name: 'mock Core',
		created: 0,
		modified: 0,
		version: '0.0.0',
		previousVersion: '0.0.0',
		storePath: '',
		serviceMessages: {},
	}
	const coreSystem = _.extend(defaultCore, doc)
	CoreSystem.remove(SYSTEM_ID)
	CoreSystem.insert(coreSystem)
	return coreSystem
}
export function setupMockStudio(doc?: Partial<DBStudio>): Studio {
	doc = doc || {}

	const studio: DBStudio = {
		...defaultStudio(protectString('mockStudio' + dbI++)),
		name: 'mockStudio',
		_rundownVersionHash: 'asdf',
		...doc,
	}
	Studios.insert(studio)
	return studio
}
export function setupMockShowStyleBase(blueprintId: BlueprintId, doc?: Partial<ShowStyleBase>): ShowStyleBase {
	doc = doc || {}

	const defaultShowStyleBase: DBShowStyleBase = {
		_id: protectString('mockShowStyleBase' + dbI++),
		name: 'mockShowStyleBase',
		organizationId: null,
		outputLayers: [
			literal<IOutputLayer>({
				_id: LAYER_IDS.OUTPUT_PGM,
				_rank: 0,
				isPGM: true,
				name: 'PGM',
			}),
		],
		sourceLayers: [
			literal<ISourceLayer>({
				_id: LAYER_IDS.SOURCE_CAM0,
				_rank: 0,
				name: 'Camera',
				type: SourceLayerType.CAMERA,
				exclusiveGroup: 'main',
			}),
			literal<ISourceLayer>({
				_id: LAYER_IDS.SOURCE_VT0,
				_rank: 1,
				name: 'VT',
				type: SourceLayerType.VT,
				exclusiveGroup: 'main',
			}),
		],
		blueprintConfig: {},
		blueprintId: blueprintId,
		// hotkeyLegend?: Array<HotkeyDefinition>
		_rundownVersionHash: '',
	}
	const showStyleBase = _.extend(defaultShowStyleBase, doc)
	ShowStyleBases.insert(showStyleBase)
	return showStyleBase
}
export function setupMockShowStyleVariant(
	showStyleBaseId: ShowStyleBaseId,
	doc?: Partial<ShowStyleVariant>
): ShowStyleVariant {
	doc = doc || {}

	const defaultShowStyleVariant: DBShowStyleVariant = {
		_id: protectString('mockShowStyleVariant' + dbI++),
		name: 'mockShowStyleVariant',
		showStyleBaseId: showStyleBaseId,
		blueprintConfig: {},
		_rundownVersionHash: '',
	}
	const showStyleVariant = _.extend(defaultShowStyleVariant, doc)
	ShowStyleVariants.insert(showStyleVariant)

	return showStyleVariant
}

export function packageBlueprint<T extends BlueprintManifestBase>(
	constants: { [constant: string]: string | number },
	blueprintFcn: () => T
): string {
	let code = blueprintFcn.toString()
	_.each(constants, (newConstant, constant) => {
		if (_.isString(newConstant)) {
			newConstant = newConstant.replace(/^\^/, '') || '0.0.0' // fix the version, the same way the bleprint does it
			newConstant = `'${newConstant}'`
		} else {
			newConstant = `${newConstant}`
		}

		code = code.replace(new RegExp(constant, 'g'), newConstant)
	})
	return `({default: (${code})()})`
}
export function setupMockStudioBlueprint(
	showStyleBaseId: ShowStyleBaseId,
	organizationId: OrganizationId | null = null
): Blueprint {
	const { INTEGRATION_VERSION, TSR_VERSION } = getBlueprintDependencyVersions()

	const BLUEPRINT_TYPE = BlueprintManifestType.STUDIO
	const SHOW_STYLE_ID: string = unprotectString(showStyleBaseId)

	const code = packageBlueprint<StudioBlueprintManifest>(
		{
			// Constants to into code:
			BLUEPRINT_TYPE,
			INTEGRATION_VERSION,
			TSR_VERSION,
			SHOW_STYLE_ID,
		},
		function (): StudioBlueprintManifest {
			return {
				blueprintType: BLUEPRINT_TYPE,
				blueprintVersion: '0.0.0',
				integrationVersion: INTEGRATION_VERSION,
				TSRVersion: TSR_VERSION,

				studioConfigManifest: [],
				studioMigrations: [],
				getBaseline: (): TSR.TSRTimelineObjBase[] => {
					return []
				},
				getShowStyleId: (): string | null => {
					return SHOW_STYLE_ID
				},
			}
		}
	)

	const blueprintId: BlueprintId = protectString('mockBlueprint' + dbI++)
	const blueprintName = 'mockBlueprint'

	return internalUploadBlueprint(blueprintId, code, blueprintName, true, organizationId)
}
export function setupMockShowStyleBlueprint(
	showStyleVariantId: ShowStyleVariantId,
	organizationId?: OrganizationId | null
): Blueprint {
	const { INTEGRATION_VERSION, TSR_VERSION } = getBlueprintDependencyVersions()

	const BLUEPRINT_TYPE = BlueprintManifestType.SHOWSTYLE
	const SHOW_STYLE_VARIANT_ID: string = unprotectString(showStyleVariantId)

	const code = packageBlueprint<ShowStyleBlueprintManifest>(
		{
			// Constants to into code:
			BLUEPRINT_TYPE,
			INTEGRATION_VERSION,
			TSR_VERSION,
			SHOW_STYLE_VARIANT_ID,
		},
		function (): ShowStyleBlueprintManifest {
			return {
				blueprintType: BLUEPRINT_TYPE,
				blueprintVersion: '0.0.0',
				integrationVersion: INTEGRATION_VERSION,
				TSRVersion: TSR_VERSION,

				showStyleConfigManifest: [],
				showStyleMigrations: [],
				getShowStyleVariantId: (): string | null => {
					return SHOW_STYLE_VARIANT_ID
				},
				getRundown: (context: IShowStyleContext, ingestRundown: IngestRundown): BlueprintResultRundown => {
					const rundown: IBlueprintRundown = {
						externalId: ingestRundown.externalId,
						name: ingestRundown.name,
						// expectedStart?:
						// expectedDuration?: number;
						metaData: ingestRundown.payload,
					}
					return {
						rundown,
						globalAdLibPieces: [],
						baseline: [],
					}
				},
				getSegment: (context: unknown, ingestSegment: IngestSegment): BlueprintResultSegment => {
					const segment: IBlueprintSegment = {
						name: ingestSegment.name ? ingestSegment.name : ingestSegment.externalId,
						metaData: ingestSegment.payload,
					}
					const parts: BlueprintResultPart[] = []

					_.each(ingestSegment.parts, (ingestPart) => {
						const part: IBlueprintPart = {
							externalId: ingestPart.externalId,
							title: ingestPart.name,
							metaData: ingestPart.payload,
							// autoNext?: boolean;
							// autoNextOverlap?: number;
							// prerollDuration?: number;
							// transitionPrerollDuration?: number | null;
							// transitionKeepaliveDuration?: number | null;
							// transitionDuration?: number | null;
							// disableOutTransition?: boolean;
							// expectedDuration?: number;
							// holdMode?: PartHoldMode;
							// updateStoryStatus?: boolean;
							// classes?: string[];
							// classesForNext?: string[];
							// displayDurationGroup?: string;
							// displayDuration?: number;
							// invalid?: boolean
						}
						const pieces: IBlueprintPiece[] = []
						const adLibPieces: IBlueprintAdLibPiece[] = []
						parts.push({
							part,
							pieces,
							adLibPieces,
						})
					})
					return {
						segment,
						parts,
					}
				},
				// onRundownActivate?: (context: EventContext & RundownContext) => Promise<void>,
				// onRundownFirstTake?: (context: EventContext & PartEventContext) => Promise<void>,
				// onRundownDeActivate?: (context: EventContext & RundownContext) => Promise<void>,
				// onPreTake?: (context: EventContext & PartEventContext) => Promise<void>,
				// onPostTake?: (context: EventContext & PartEventContext) => Promise<void>,
				// onTimelineGenerate?: (context: EventContext & RundownContext, timeline: Timeline.TimelineObject[]) => Promise<Timeline.TimelineObject[]>,
				// onAsRunEvent?: (context: EventContext & AsRunEventContext) => Promise<IBlueprintExternalMessageQueueObj[]>,
			}
		}
	)

	const blueprintId: BlueprintId = protectString('mockBlueprint' + dbI++)
	const blueprintName = 'mockBlueprint'

	return internalUploadBlueprint(blueprintId, code, blueprintName, true, organizationId)
}
export interface DefaultEnvironment {
	showStyleBaseId: ShowStyleBaseId
	showStyleVariantId: ShowStyleVariantId
	studioBlueprint: Blueprint
	showStyleBlueprint: Blueprint
	showStyleBase: ShowStyleBase
	showStyleVariant: ShowStyleVariant
	studio: Studio
	core: ICoreSystem

	ingestDevice: PeripheralDevice
}
export function setupDefaultStudioEnvironment(organizationId: OrganizationId | null = null): DefaultEnvironment {
	const core = setupMockCore({})

	const showStyleBaseId: ShowStyleBaseId = getRandomId()
	const showStyleVariantId: ShowStyleVariantId = getRandomId()

	const studioBlueprint = setupMockStudioBlueprint(showStyleBaseId, organizationId)
	const showStyleBlueprint = setupMockShowStyleBlueprint(showStyleVariantId, organizationId)

	const showStyleBase = setupMockShowStyleBase(showStyleBlueprint._id, {
		_id: showStyleBaseId,
		organizationId: organizationId,
	})
	const showStyleVariant = setupMockShowStyleVariant(showStyleBase._id, { _id: showStyleVariantId })

	const studio = setupMockStudio({
		blueprintId: studioBlueprint._id,
		supportedShowStyleBase: [showStyleBaseId],
		organizationId: organizationId,
	})
	const ingestDevice = setupMockPeripheralDevice(
		PeripheralDeviceAPI.DeviceCategory.INGEST,
		PeripheralDeviceAPI.DeviceType.MOS,
		PeripheralDeviceAPI.SUBTYPE_PROCESS,
		studio,
		{ organizationId: organizationId }
	)

	return {
		showStyleBaseId,
		showStyleVariantId,
		studioBlueprint,
		showStyleBlueprint,
		showStyleBase,
		showStyleVariant,
		studio,
		core,
		ingestDevice,
	}
}
export function setupDefaultRundownPlaylist(
	env: DefaultEnvironment,
	rundownId0?: RundownId,
	customRundownFactory?: (env: DefaultEnvironment, playlistId: RundownPlaylistId, rundownId: RundownId) => RundownId
): { rundownId: RundownId; playlistId: RundownPlaylistId } {
	const rundownId: RundownId = rundownId0 || getRandomId()

	const playlist: DBRundownPlaylist = defaultRundownPlaylist(
		protectString('playlist_' + rundownId),
		env.studio._id,
		env.ingestDevice._id
	)

	const playlistId = RundownPlaylists.insert(playlist)

	return {
		rundownId: (customRundownFactory || setupDefaultRundown)(env, playlistId, rundownId),
		playlistId,
	}
}
export function setupEmptyEnvironment() {
	const core = setupMockCore({})

	return {
		core,
	}
}
export function setupDefaultRundown(
	env: DefaultEnvironment,
	playlistId: RundownPlaylistId,
	rundownId: RundownId
): RundownId {
	const rundown: DBRundown = {
		peripheralDeviceId: env.ingestDevice._id,
		organizationId: null,
		studioId: env.studio._id,
		showStyleBaseId: env.showStyleBase._id,
		showStyleVariantId: env.showStyleVariant._id,

		playlistId: playlistId,
		_rank: 0,

		_id: rundownId,
		externalId: 'MOCK_RUNDOWN',
		name: 'Default Rundown',

		created: getCurrentTime(),
		modified: getCurrentTime(),
		importVersions: {
			studio: '',
			showStyleBase: '',
			showStyleVariant: '',
			blueprint: '',
			core: '',
		},

		externalNRCSName: 'mock',
	}
	Rundowns.insert(rundown)

	const segment0: DBSegment = {
		_id: protectString(rundownId + '_segment0'),
		_rank: 0,
		externalId: 'MOCK_SEGMENT_0',
		rundownId: rundown._id,
		name: 'Segment 0',
		externalModified: 1,
	}
	Segments.insert(segment0)
	/* tslint:disable:ter-indent*/
	//
	const part00: DBPart = {
		_id: protectString(rundownId + '_part0_0'),
		segmentId: segment0._id,
		rundownId: rundown._id,
		_rank: 0,
		externalId: 'MOCK_PART_0_0',
		title: 'Part 0 0',
	}
	Parts.insert(part00)

	const piece000: Piece = {
		_id: protectString(rundownId + '_piece000'),
		externalId: 'MOCK_PIECE_000',
		startRundownId: rundown._id,
		startSegmentId: part00.segmentId,
		startPartId: part00._id,
		name: 'Piece 000',
		status: RundownAPI.PieceStatusCode.OK,
		enable: {
			start: 0,
		},
		sourceLayerId: env.showStyleBase.sourceLayers[0]._id,
		outputLayerId: env.showStyleBase.outputLayers[0]._id,
		lifespan: PieceLifespan.WithinPart,
		invalid: false,
		content: {
			timelineObjects: [],
		},
	}
	Pieces.insert(piece000)

	const piece001: Piece = {
		_id: protectString(rundownId + '_piece001'),
		externalId: 'MOCK_PIECE_001',
		startRundownId: rundown._id,
		startSegmentId: part00.segmentId,
		startPartId: part00._id,
		name: 'Piece 001',
		status: RundownAPI.PieceStatusCode.OK,
		enable: {
			start: 0,
		},
		sourceLayerId: env.showStyleBase.sourceLayers[1]._id,
		outputLayerId: env.showStyleBase.outputLayers[0]._id,
		lifespan: PieceLifespan.WithinPart,
		invalid: false,
		content: {
			timelineObjects: [],
		},
	}
	Pieces.insert(piece001)

	const adLibPiece000: AdLibPiece = {
		_id: protectString(rundownId + '_adLib000'),
		_rank: 0,
		expectedDuration: 1000,
		lifespan: PieceLifespan.WithinPart,
		externalId: 'MOCK_ADLIB_000',
		partId: part00._id,
		rundownId: segment0.rundownId,
		status: RundownAPI.PieceStatusCode.UNKNOWN,
		name: 'AdLib 0',
		sourceLayerId: env.showStyleBase.sourceLayers[1]._id,
		outputLayerId: env.showStyleBase.outputLayers[0]._id,
		content: {
			timelineObjects: [],
		},
	}

	AdLibPieces.insert(adLibPiece000)

	const part01: DBPart = {
		_id: protectString(rundownId + '_part0_1'),
		segmentId: segment0._id,
		rundownId: segment0.rundownId,
		_rank: 1,
		externalId: 'MOCK_PART_0_1',
		title: 'Part 0 1',
	}
	Parts.insert(part01)

	const piece010: Piece = {
		_id: protectString(rundownId + '_piece010'),
		externalId: 'MOCK_PIECE_010',
		startRundownId: rundown._id,
		startSegmentId: part01.segmentId,
		startPartId: part01._id,
		name: 'Piece 010',
		status: RundownAPI.PieceStatusCode.OK,
		enable: {
			start: 0,
		},
		sourceLayerId: env.showStyleBase.sourceLayers[0]._id,
		outputLayerId: env.showStyleBase.outputLayers[0]._id,
		lifespan: PieceLifespan.WithinPart,
		invalid: false,
		content: {
			timelineObjects: [],
		},
	}
	Pieces.insert(piece010)

	const segment1: DBSegment = {
		_id: protectString(rundownId + '_segment1'),
		_rank: 1,
		externalId: 'MOCK_SEGMENT_2',
		rundownId: rundown._id,
		name: 'Segment 1',
		externalModified: 1,
	}
	Segments.insert(segment1)

	const part10: DBPart = {
		_id: protectString(rundownId + '_part1_0'),
		segmentId: segment1._id,
		rundownId: segment1.rundownId,
		_rank: 0,
		externalId: 'MOCK_PART_1_0',
		title: 'Part 1 0',
	}
	Parts.insert(part10)

	const part11: DBPart = {
		_id: protectString(rundownId + '_part1_1'),
		segmentId: segment1._id,
		rundownId: segment1.rundownId,
		_rank: 1,
		externalId: 'MOCK_PART_1_1',
		title: 'Part 1 1',
	}
	Parts.insert(part11)

	const part12: DBPart = {
		_id: protectString(rundownId + '_part1_2'),
		segmentId: segment1._id,
		rundownId: segment1.rundownId,
		_rank: 2,
		externalId: 'MOCK_PART_1_2',
		title: 'Part 1 2',
	}
	Parts.insert(part12)

	const segment2: DBSegment = {
		_id: protectString(rundownId + '_segment2'),
		_rank: 2,
		externalId: 'MOCK_SEGMENT_2',
		rundownId: rundown._id,
		name: 'Segment 2',
		externalModified: 1,
	}
	Segments.insert(segment2)

	const globalAdLib0: RundownBaselineAdLibItem = {
		_id: protectString(rundownId + '_globalAdLib0'),
		_rank: 0,
		externalId: 'MOCK_GLOBAL_ADLIB_0',
		lifespan: PieceLifespan.OutOnRundownEnd,
		rundownId: segment0.rundownId,
		status: RundownAPI.PieceStatusCode.UNKNOWN,
		name: 'Global AdLib 0',
		sourceLayerId: env.showStyleBase.sourceLayers[0]._id,
		outputLayerId: env.showStyleBase.outputLayers[0]._id,
		content: {
			timelineObjects: [],
		},
	}

	const globalAdLib1: RundownBaselineAdLibItem = {
		_id: protectString(rundownId + '_globalAdLib1'),
		_rank: 0,
		externalId: 'MOCK_GLOBAL_ADLIB_1',
		lifespan: PieceLifespan.OutOnRundownEnd,
		rundownId: segment0.rundownId,
		status: RundownAPI.PieceStatusCode.UNKNOWN,
		name: 'Global AdLib 1',
		sourceLayerId: env.showStyleBase.sourceLayers[1]._id,
		outputLayerId: env.showStyleBase.outputLayers[0]._id,
		content: {
			timelineObjects: [],
		},
	}

	RundownBaselineAdLibPieces.insert(globalAdLib0)
	RundownBaselineAdLibPieces.insert(globalAdLib1)

	return rundownId
}
export function setupRundownWithAutoplayPart0(
	env: DefaultEnvironment,
	playlistId: RundownPlaylistId,
	rundownId: RundownId
): RundownId {
	const rundown: DBRundown = defaultRundown(
		unprotectString(rundownId),
		env.studio._id,
		env.ingestDevice._id,
		playlistId,
		env.showStyleBase._id,
		env.showStyleVariant._id
	)
	rundown._id = rundownId
	Rundowns.insert(rundown)

	const segment0: DBSegment = {
		...defaultSegment(protectString(rundownId + '_segment0'), rundown._id),
		_rank: 0,
		externalId: 'MOCK_SEGMENT_0',
		name: 'Segment 0',
	}
	Segments.insert(segment0)
	/* tslint:disable:ter-indent*/
	//
	const part00: DBPart = {
		...defaultPart(protectString(rundownId + '_part0_0'), rundown._id, segment0._id),
		externalId: 'MOCK_PART_0_0',
		title: 'Part 0 0',

		expectedDuration: 20,
		autoNext: true,
	}
	Parts.insert(part00)

	const piece000: Piece = {
		...defaultPiece(protectString(rundownId + '_piece000'), rundown._id, part00.segmentId, part00._id),
		externalId: 'MOCK_PIECE_000',
		name: 'Piece 000',
		sourceLayerId: env.showStyleBase.sourceLayers[0]._id,
		outputLayerId: env.showStyleBase.outputLayers[0]._id,
	}
	Pieces.insert(piece000)

	const piece001: Piece = {
		...defaultPiece(protectString(rundownId + '_piece001'), rundown._id, part00.segmentId, part00._id),
		externalId: 'MOCK_PIECE_001',
		name: 'Piece 001',
		sourceLayerId: env.showStyleBase.sourceLayers[1]._id,
		outputLayerId: env.showStyleBase.outputLayers[0]._id,
	}
	Pieces.insert(piece001)

	const adLibPiece000: AdLibPiece = {
		...defaultAdLibPiece(protectString(rundownId + '_adLib000'), segment0.rundownId, part00._id),
		expectedDuration: 1000,
		externalId: 'MOCK_ADLIB_000',
		status: RundownAPI.PieceStatusCode.UNKNOWN,
		name: 'AdLib 0',
		sourceLayerId: env.showStyleBase.sourceLayers[1]._id,
		outputLayerId: env.showStyleBase.outputLayers[0]._id,
	}

	AdLibPieces.insert(adLibPiece000)

	const part01: DBPart = {
		...defaultPart(protectString(rundownId + '_part0_1'), rundown._id, segment0._id),
		_rank: 1,
		externalId: 'MOCK_PART_0_1',
		title: 'Part 0 1',
	}
	Parts.insert(part01)

	const piece010: Piece = {
		...defaultPiece(protectString(rundownId + '_piece010'), rundown._id, part01.segmentId, part01._id),
		externalId: 'MOCK_PIECE_010',
		name: 'Piece 010',
		sourceLayerId: env.showStyleBase.sourceLayers[0]._id,
		outputLayerId: env.showStyleBase.outputLayers[0]._id,
	}
	Pieces.insert(piece010)

	const segment1: DBSegment = {
		...defaultSegment(protectString(rundownId + '_segment1'), rundown._id),
		_rank: 1,
		externalId: 'MOCK_SEGMENT_2',
		name: 'Segment 1',
	}
	Segments.insert(segment1)

	const part10: DBPart = {
		...defaultPart(protectString(rundownId + '_part1_0'), rundown._id, segment1._id),
		_rank: 0,
		externalId: 'MOCK_PART_1_0',
		title: 'Part 1 0',
	}
	Parts.insert(part10)

	const part11: DBPart = {
		...defaultPart(protectString(rundownId + '_part1_1'), rundown._id, segment1._id),
		_rank: 1,
		externalId: 'MOCK_PART_1_1',
		title: 'Part 1 1',
	}
	Parts.insert(part11)

	const part12: DBPart = {
		...defaultPart(protectString(rundownId + '_part1_2'), rundown._id, segment1._id),
		_rank: 2,
		externalId: 'MOCK_PART_1_2',
		title: 'Part 1 2',
	}
	Parts.insert(part12)

	const segment2: DBSegment = {
		...defaultSegment(protectString(rundownId + '_segment2'), rundown._id),
		_rank: 2,
		externalId: 'MOCK_SEGMENT_2',
		name: 'Segment 2',
	}
	Segments.insert(segment2)

	const globalAdLib0: RundownBaselineAdLibItem = {
		_id: protectString(rundownId + '_globalAdLib0'),
		_rank: 0,
		externalId: 'MOCK_GLOBAL_ADLIB_0',
		lifespan: PieceLifespan.OutOnRundownChange,
		rundownId: segment0.rundownId,
		status: RundownAPI.PieceStatusCode.UNKNOWN,
		name: 'Global AdLib 0',
		sourceLayerId: env.showStyleBase.sourceLayers[0]._id,
		outputLayerId: env.showStyleBase.outputLayers[0]._id,
		content: {
			timelineObjects: [],
		},
	}

	const globalAdLib1: RundownBaselineAdLibItem = {
		_id: protectString(rundownId + '_globalAdLib1'),
		_rank: 0,
		externalId: 'MOCK_GLOBAL_ADLIB_1',
		lifespan: PieceLifespan.OutOnRundownChange,
		rundownId: segment0.rundownId,
		status: RundownAPI.PieceStatusCode.UNKNOWN,
		name: 'Global AdLib 1',
		sourceLayerId: env.showStyleBase.sourceLayers[1]._id,
		outputLayerId: env.showStyleBase.outputLayers[0]._id,
		content: {
			timelineObjects: [],
		},
	}

	RundownBaselineAdLibPieces.insert(globalAdLib0)
	RundownBaselineAdLibPieces.insert(globalAdLib1)

	return rundownId
}

// const studioBlueprint
// const showStyleBlueprint
// const showStyleVariant
