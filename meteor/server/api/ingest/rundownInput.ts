import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'
import { PeripheralDevice, PeripheralDeviceId } from '../../../lib/collections/PeripheralDevices'
import { Rundown, Rundowns, DBRundown, RundownId } from '../../../lib/collections/Rundowns'
import { Part, Parts, DBPart, PartId } from '../../../lib/collections/Parts'
import { Piece, Pieces } from '../../../lib/collections/Pieces'
import {
	saveIntoDb,
	getCurrentTime,
	literal,
	sumChanges,
	anythingChanged,
	ReturnType,
	asyncCollectionUpsert,
	asyncCollectionUpdate,
	waitForPromise,
	PreparedChanges,
	prepareSaveIntoDb,
	savePreparedChanges,
	asyncCollectionFindOne,
	waitForPromiseAll,
	asyncCollectionRemove,
	normalizeArray,
	normalizeArrayFunc,
	asyncCollectionInsert,
	asyncCollectionFindFetch,
	waitForPromiseObj,
	unprotectString,
	protectString,
	omit,
	ProtectedString,
	check,
	Omit,
	PreparedChangesChangesDoc,
} from '../../../lib/lib'
import { PeripheralDeviceSecurity } from '../../security/peripheralDevices'
import {
	IngestRundown,
	IngestSegment,
	IngestPart,
	BlueprintResultSegment,
} from 'tv-automation-sofie-blueprints-integration'
import { logger } from '../../../lib/logging'
import { Studio, Studios } from '../../../lib/collections/Studios'
import {
	selectShowStyleVariant,
	afterRemoveSegments,
	afterRemoveParts,
	ServerRundownAPI,
	removeSegments,
	updatePartRanks,
	produceRundownPlaylistInfo,
} from '../rundown'
import { loadShowStyleBlueprints, getBlueprintOfRundown } from '../blueprints/cache'
import { ShowStyleContext, RundownContext, SegmentContext, NotesContext } from '../blueprints/context'
import { Blueprints, Blueprint, BlueprintId } from '../../../lib/collections/Blueprints'
import {
	RundownBaselineObj,
	RundownBaselineObjs,
	RundownBaselineObjId,
} from '../../../lib/collections/RundownBaselineObjs'
import { Random } from 'meteor/random'
import {
	postProcessRundownBaselineItems,
	postProcessAdLibPieces,
	postProcessPieces,
	postProcessAdLibActions,
	postProcessGlobalAdLibActions,
} from '../blueprints/postProcess'
import {
	RundownBaselineAdLibItem,
	RundownBaselineAdLibPieces,
} from '../../../lib/collections/RundownBaselineAdLibPieces'
import { DBSegment, Segments, SegmentId } from '../../../lib/collections/Segments'
import { AdLibPiece, AdLibPieces } from '../../../lib/collections/AdLibPieces'
import {
	saveRundownCache,
	saveSegmentCache,
	loadCachedIngestSegment,
	loadCachedRundownData,
	LocalIngestRundown,
	LocalIngestSegment,
	makeNewIngestSegment,
	makeNewIngestPart,
	makeNewIngestRundown,
	updateIngestRundownWithData,
	isLocalIngestRundown,
} from './ingestCache'
import {
	getRundownId,
	getSegmentId,
	getPartId,
	getStudioFromDevice,
	getRundown,
	canBeUpdated,
	getRundownPlaylist,
	getSegment,
	extendIngestRundownCore,
	modifyPlaylistExternalId,
} from './lib'
import { PackageInfo } from '../../coreSystem'
import { updateExpectedMediaItemsOnRundown } from '../expectedMediaItems'
import { triggerUpdateTimelineAfterIngestData } from '../playout/playout'
import { PartNote, NoteType, SegmentNote, RundownNote } from '../../../lib/api/notes'
import { syncFunction } from '../../codeControl'
import { updateSourceLayerInfinitesAfterPart } from '../playout/infinites'
import { UpdateNext } from './updateNext'
import { extractExpectedPlayoutItems, updateExpectedPlayoutItemsOnRundown } from './expectedPlayoutItems'
import { ExpectedPlayoutItem, ExpectedPlayoutItems } from '../../../lib/collections/ExpectedPlayoutItems'
import {
	RundownPlaylists,
	DBRundownPlaylist,
	RundownPlaylist,
	RundownPlaylistId,
} from '../../../lib/collections/RundownPlaylists'
import { Mongo } from 'meteor/mongo'
import {
	isTooCloseToAutonext,
	getSelectedPartInstancesFromCache,
	getRundownPlaylistFromCache,
	getRundownsSegmentsAndPartsFromCache,
	removeRundownFromCache,
} from '../playout/lib'
import { PartInstances, PartInstance } from '../../../lib/collections/PartInstances'
import {
	PieceInstances,
	wrapPieceToInstance,
	PieceInstance,
	PieceInstanceId,
} from '../../../lib/collections/PieceInstances'
import { CacheForRundownPlaylist, initCacheForRundownPlaylist } from '../../DatabaseCaches'
import { prepareSaveIntoCache, savePreparedChangesIntoCache, saveIntoCache } from '../../DatabaseCache'
import { reportRundownDataHasChanged } from '../asRunLog'
import { Settings } from '../../../lib/Settings'
import { AdLibAction, AdLibActions } from '../../../lib/collections/AdLibActions'
import {
	RundownBaselineAdLibActions,
	RundownBaselineAdLibAction,
} from '../../../lib/collections/RundownBaselineAdLibActions'
import { IngestDataCache } from '../../../lib/collections/IngestDataCache'
import { removeEmptyPlaylists } from '../rundownPlaylist'

/** Priority for handling of synchronous events. Lower means higher priority */
export enum RundownSyncFunctionPriority {
	/** Events initiated from external (ingest) devices */
	INGEST = 0,
	/** Events initiated from user, for triggering ingest actions */
	USER_INGEST = 9,
	/** Events initiated from user, for playout */
	USER_PLAYOUT = 10,
}
export function rundownPlaylistSyncFunction<T extends Function>(
	rundownPlaylistId: RundownPlaylistId,
	priority: RundownSyncFunctionPriority,
	fcn: T
): ReturnType<T> {
	return syncFunction(fcn, `ingest_rundown_${rundownPlaylistId}`, undefined, priority)()
}

interface SegmentChanges {
	segmentId: SegmentId
	segment: PreparedChanges<DBSegment>
	parts: PreparedChanges<DBPart>
	pieces: PreparedChanges<Piece>
	adlibPieces: PreparedChanges<AdLibPiece>
}

export namespace RundownInput {
	// Get info on the current rundowns from this device:
	export function dataRundownList(self: any, deviceId: PeripheralDeviceId, deviceToken: string) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(deviceId, deviceToken, self)
		logger.info('dataRundownList')
		return listIngestRundowns(peripheralDevice)
	}
	export function dataRundownGet(
		self: any,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string
	) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(deviceId, deviceToken, self)
		logger.info('dataRundownGet', rundownExternalId)
		check(rundownExternalId, String)
		return getIngestRundown(peripheralDevice, rundownExternalId)
	}
	// Delete, Create & Update Rundown (and it's contents):
	export function dataRundownDelete(
		self: any,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string
	) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(deviceId, deviceToken, self)
		logger.info('dataRundownDelete', rundownExternalId)
		check(rundownExternalId, String)
		handleRemovedRundown(peripheralDevice, rundownExternalId)
	}
	export function dataRundownCreate(
		self: any,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		ingestRundown: IngestRundown
	) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(deviceId, deviceToken, self)
		logger.info('dataRundownCreate', ingestRundown)
		check(ingestRundown, Object)
		handleUpdatedRundown(peripheralDevice, ingestRundown, 'dataRundownCreate')
	}
	export function dataRundownUpdate(
		self: any,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		ingestRundown: IngestRundown
	) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(deviceId, deviceToken, self)
		logger.info('dataRundownUpdate', ingestRundown)
		check(ingestRundown, Object)
		handleUpdatedRundown(peripheralDevice, ingestRundown, 'dataRundownUpdate')
	}
	// Delete, Create & Update Segment (and it's contents):
	export function dataSegmentDelete(
		self: any,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		segmentExternalId: string
	) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(deviceId, deviceToken, self)
		logger.info('dataSegmentDelete', rundownExternalId, segmentExternalId)
		check(rundownExternalId, String)
		check(segmentExternalId, String)
		handleRemovedSegment(peripheralDevice, rundownExternalId, segmentExternalId)
	}
	export function dataSegmentCreate(
		self: any,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		ingestSegment: IngestSegment
	) {
		let peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(deviceId, deviceToken, self)
		logger.info('dataSegmentCreate', rundownExternalId, ingestSegment)
		check(rundownExternalId, String)
		check(ingestSegment, Object)
		handleUpdatedSegment(peripheralDevice, rundownExternalId, ingestSegment)
	}
	export function dataSegmentUpdate(
		self: any,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		ingestSegment: IngestSegment
	) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(deviceId, deviceToken, self)
		logger.info('dataSegmentUpdate', rundownExternalId, ingestSegment)
		check(rundownExternalId, String)
		check(ingestSegment, Object)
		handleUpdatedSegment(peripheralDevice, rundownExternalId, ingestSegment)
	}
	// Delete, Create & Update Part:
	export function dataPartDelete(
		self: any,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		segmentExternalId: string,
		partExternalId: string
	) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(deviceId, deviceToken, self)
		logger.info('dataPartDelete', rundownExternalId, segmentExternalId, partExternalId)
		check(rundownExternalId, String)
		check(segmentExternalId, String)
		check(partExternalId, String)
		handleRemovedPart(peripheralDevice, rundownExternalId, segmentExternalId, partExternalId)
	}
	export function dataPartCreate(
		self: any,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		segmentExternalId: string,
		ingestPart: IngestPart
	) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(deviceId, deviceToken, self)
		logger.info('dataPartCreate', rundownExternalId, segmentExternalId, ingestPart)
		check(rundownExternalId, String)
		check(segmentExternalId, String)
		check(ingestPart, Object)
		handleUpdatedPart(peripheralDevice, rundownExternalId, segmentExternalId, ingestPart)
	}
	export function dataPartUpdate(
		self: any,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		segmentExternalId: string,
		ingestPart: IngestPart
	) {
		const peripheralDevice = PeripheralDeviceSecurity.getPeripheralDevice(deviceId, deviceToken, self)
		logger.info('dataPartUpdate', rundownExternalId, segmentExternalId, ingestPart)
		check(rundownExternalId, String)
		check(segmentExternalId, String)
		check(ingestPart, Object)
		handleUpdatedPart(peripheralDevice, rundownExternalId, segmentExternalId, ingestPart)
	}
}

function getIngestRundown(peripheralDevice: PeripheralDevice, rundownExternalId: string): IngestRundown {
	const rundown = Rundowns.findOne({
		peripheralDeviceId: peripheralDevice._id,
		externalId: rundownExternalId,
	})
	if (!rundown) {
		throw new Meteor.Error(404, `Rundown ${rundownExternalId} does not exist`)
	}

	return loadCachedRundownData(rundown._id, rundown.externalId)
}
function listIngestRundowns(peripheralDevice: PeripheralDevice): string[] {
	const rundowns = Rundowns.find({
		peripheralDeviceId: peripheralDevice._id,
	}).fetch()

	return rundowns.map((r) => r.externalId)
}

export function handleRemovedRundown(peripheralDevice: PeripheralDevice, rundownExternalId: string) {
	const studio = getStudioFromDevice(peripheralDevice)
	const rundownId = getRundownId(studio, rundownExternalId)
	const rundownPlaylistId = getRundown(rundownId, rundownExternalId).playlistId

	rundownPlaylistSyncFunction(rundownPlaylistId, RundownSyncFunctionPriority.INGEST, () => {
		const rundown = getRundown(rundownId, rundownExternalId)
		const playlist = getRundownPlaylist(rundown)

		const cache = waitForPromise(initCacheForRundownPlaylist(playlist))

		if (canBeUpdated(rundown)) {
			let okToRemove: boolean = true
			if (!isUpdateAllowed(cache, playlist, rundown, { removed: [rundown] }, {}, {})) {
				const { currentPartInstance, nextPartInstance } = getSelectedPartInstancesFromCache(cache, playlist)

				if (
					(currentPartInstance && currentPartInstance.rundownId === rundown._id) ||
					(isTooCloseToAutonext(currentPartInstance) &&
						nextPartInstance &&
						nextPartInstance.rundownId === rundown._id)
				) {
					okToRemove = false
				}
				if (!currentPartInstance && nextPartInstance) {
					// The playlist is active, but hasn't started playing yet
					if (nextPartInstance.rundownId === rundown._id) {
						okToRemove = false
					}
				}
			}
			if (okToRemove) {
				logger.info(`Removing rundown "${rundown._id}"`)
				removeRundownFromCache(cache, rundown)
			} else {
				// Don't allow removing currently playing rundown playlists:
				logger.warn(
					`Not allowing removal of currently playing rundown "${rundown._id}", making it unsynced instead`
				)
				ServerRundownAPI.unsyncRundownInner(cache, rundown._id)
			}
		} else {
			logger.info(`Rundown "${rundown._id}" cannot be updated`)
			if (!rundown.unsynced) {
				ServerRundownAPI.unsyncRundownInner(cache, rundown._id)
			}
		}

		waitForPromise(cache.saveAllToDatabase())
	})
}
/** Handle an updated (or inserted) Rundown */
export function handleUpdatedRundown(
	peripheralDevice: PeripheralDevice,
	ingestRundown: IngestRundown,
	dataSource: string
) {
	const studio = getStudioFromDevice(peripheralDevice)
	const rundownId = getRundownId(studio, ingestRundown.externalId)
	if (peripheralDevice && peripheralDevice.studioId !== studio._id) {
		throw new Meteor.Error(
			500,
			`PeripheralDevice "${peripheralDevice._id}" does not belong to studio "${studio._id}"`
		)
	}

	// Lock behind a playlist if it exists
	const existingRundown = Rundowns.findOne(rundownId)
	const playlistId = existingRundown ? existingRundown.playlistId : protectString('newPlaylist')
	return rundownPlaylistSyncFunction(playlistId, RundownSyncFunctionPriority.INGEST, () =>
		handleUpdatedRundownInner(studio, rundownId, makeNewIngestRundown(ingestRundown), dataSource, peripheralDevice)
	)
}
export function handleUpdatedRundownInner(
	studio: Studio,
	rundownId: RundownId,
	ingestRundown: IngestRundown | LocalIngestRundown,
	dataSource?: string,
	peripheralDevice?: PeripheralDevice
) {
	const existingDbRundown = Rundowns.findOne(rundownId)
	if (!canBeUpdated(existingDbRundown)) return

	updateRundownAndSaveCache(studio, rundownId, existingDbRundown, ingestRundown, dataSource, peripheralDevice)
}
export function updateRundownAndSaveCache(
	studio: Studio,
	rundownId: RundownId,
	existingDbRundown: Rundown | undefined,
	ingestRundown: IngestRundown | LocalIngestRundown,
	dataSource?: string,
	peripheralDevice?: PeripheralDevice
) {
	logger.info((existingDbRundown ? 'Updating' : 'Adding') + ' rundown ' + rundownId)

	const newIngestRundown = isLocalIngestRundown(ingestRundown) ? ingestRundown : makeNewIngestRundown(ingestRundown)

	saveRundownCache(rundownId, newIngestRundown)

	updateRundownFromIngestData(studio, existingDbRundown, ingestRundown, dataSource, peripheralDevice)
}
export function regenerateRundown(rundownId: RundownId) {
	logger.info(`Regenerating rundown ${rundownId}`)
	const existingDbRundown = Rundowns.findOne(rundownId)
	if (!existingDbRundown) throw new Meteor.Error(404, `Rundown "${rundownId}" not found`)

	const studio = Studios.findOne(existingDbRundown.studioId)
	if (!studio) throw new Meteor.Error(404, `Studio "${existingDbRundown.studioId}" not found`)

	const ingestRundown = loadCachedRundownData(rundownId, existingDbRundown.externalId)

	const dataSource = 'regenerate'

	updateRundownFromIngestData(studio, existingDbRundown, ingestRundown, dataSource, undefined)
}
function updateRundownFromIngestData(
	studio: Studio,
	existingDbRundown: Rundown | undefined,
	ingestRundown: IngestRundown,
	dataSource?: string,
	peripheralDevice?: PeripheralDevice
): boolean {
	const extendedIngestRundown = extendIngestRundownCore(ingestRundown, existingDbRundown)
	const rundownId = getRundownId(studio, ingestRundown.externalId)

	const showStyle = selectShowStyleVariant(studio, extendedIngestRundown)
	if (!showStyle) {
		logger.debug('Blueprint rejected the rundown')
		throw new Meteor.Error(501, 'Blueprint rejected the rundown')
	}

	const showStyleBlueprint = loadShowStyleBlueprints(showStyle.base).blueprint
	const notesContext = new NotesContext(
		`${showStyle.base.name}-${showStyle.variant.name}`,
		`showStyleBaseId=${showStyle.base._id},showStyleVariantId=${showStyle.variant._id}`,
		true
	)
	const blueprintContext = new ShowStyleContext(studio, showStyle.base._id, showStyle.variant._id, notesContext)
	const rundownRes = showStyleBlueprint.getRundown(blueprintContext, extendedIngestRundown)

	// Ensure the ids in the notes are clean
	const rundownNotes = _.map(notesContext.getNotes(), (note) =>
		literal<RundownNote>({
			type: note.type,
			message: note.message,
			origin: {
				name: `${showStyle.base.name}-${showStyle.variant.name}`,
			},
		})
	)
	rundownRes.rundown.playlistExternalId = modifyPlaylistExternalId(
		rundownRes.rundown.playlistExternalId,
		showStyle.base
	)

	const showStyleBlueprintDb = (Blueprints.findOne(showStyle.base.blueprintId) as Blueprint) || {}

	const dbRundownData: DBRundown = _.extend(
		_.clone(existingDbRundown) || {},
		_.omit(
			literal<DBRundown>({
				...rundownRes.rundown,
				notes: rundownNotes,
				_id: rundownId,
				externalId: ingestRundown.externalId,
				studioId: studio._id,
				showStyleVariantId: showStyle.variant._id,
				showStyleBaseId: showStyle.base._id,
				unsynced: false,

				importVersions: {
					studio: studio._rundownVersionHash,
					showStyleBase: showStyle.base._rundownVersionHash,
					showStyleVariant: showStyle.variant._rundownVersionHash,
					blueprint: showStyleBlueprintDb.blueprintVersion,
					core: PackageInfo.versionExtended || PackageInfo.version,
				},

				// omit the below fields:
				created: 0, // omitted, set later, below
				modified: 0, // omitted, set later, below
				peripheralDeviceId: protectString(''), // omitted, set later, below
				dataSource: '', // omitted, set later, below
				playlistId: protectString<RundownPlaylistId>(''), // omitted, set later, in produceRundownPlaylistInfo
				_rank: 0, // omitted, set later, in produceRundownPlaylistInfo
			}),
			['created', 'modified', 'peripheralDeviceId', 'dataSource', 'playlistId', '_rank']
		)
	)
	if (peripheralDevice) {
		dbRundownData.peripheralDeviceId = peripheralDevice._id
	}
	if (dataSource) {
		dbRundownData.dataSource = dataSource
	}
	// Do a check if we're allowed to move out of currently playing playlist:
	if (existingDbRundown && existingDbRundown.playlistExternalId !== dbRundownData.playlistExternalId) {
		// The rundown is going to change playlist
		const existingPlaylist = RundownPlaylists.findOne(existingDbRundown.playlistId)
		if (existingPlaylist) {
			const { currentPartInstance } = existingPlaylist.getSelectedPartInstances()

			if (
				existingPlaylist.active &&
				currentPartInstance &&
				currentPartInstance.rundownId === existingDbRundown._id
			) {
				// The rundown contains a PartInstance that is currently on air.
				// We're trying for a "soft approach" here, instead of rejecting the change altogether,
				// and will just revert the playlist change:

				dbRundownData.playlistExternalId = existingDbRundown.playlistExternalId
				dbRundownData.playlistId = existingDbRundown.playlistId

				if (!dbRundownData.notes) dbRundownData.notes = []
				dbRundownData.notes.push({
					type: NoteType.WARNING,
					message: `The Rundown was attempted to be moved out of the Playlist when it was on Air. Move it back and try again later.`,
					origin: {
						name: 'Data update',
					},
				})
			}
		} else {
			logger.warn(`Existing playlist "${existingDbRundown.playlistId}" not found`)
		}
	}

	// Save rundown into database:
	const rundownChanges = saveIntoDb(
		Rundowns,
		{
			_id: dbRundownData._id,
		},
		[dbRundownData],
		{
			beforeInsert: (o) => {
				o.modified = getCurrentTime()
				o.created = getCurrentTime()
				return o
			},
			beforeUpdate: (o) => {
				o.modified = getCurrentTime()
				return o
			},
		}
	)

	const rundownPlaylistInfo = produceRundownPlaylistInfo(studio, dbRundownData, peripheralDevice)

	const playlistChanges = saveIntoDb(
		RundownPlaylists,
		{
			_id: rundownPlaylistInfo.rundownPlaylist._id,
		},
		[rundownPlaylistInfo.rundownPlaylist],
		{
			beforeInsert: (o) => {
				o.created = getCurrentTime()
				o.modified = getCurrentTime()
				o.previousPartInstanceId = null
				o.currentPartInstanceId = null
				o.nextPartInstanceId = null
				return o
			},
			beforeUpdate: (o) => {
				o.modified = getCurrentTime()
				return o
			},
		}
	)

	const dbRundown = Rundowns.findOne(dbRundownData._id)
	if (!dbRundown) throw new Meteor.Error(500, 'Rundown not found (it should have been)')

	handleUpdatedRundownPlaylist(dbRundown, rundownPlaylistInfo.rundownPlaylist, rundownPlaylistInfo.order)
	removeEmptyPlaylists(studio)

	const dbPlaylist = dbRundown.getRundownPlaylist()
	if (!dbPlaylist) throw new Meteor.Error(500, 'RundownPlaylist not found (it should have been)')

	const cache = waitForPromise(initCacheForRundownPlaylist(dbPlaylist))

	// Save the baseline
	const rundownNotesContext = new NotesContext(dbRundown.name, `rundownId=${dbRundown._id}`, true)
	const blueprintRundownContext = new RundownContext(dbRundown, rundownNotesContext, studio)
	logger.info(`Building baseline objects for ${dbRundown._id}...`)
	logger.info(`... got ${rundownRes.baseline.length} objects from baseline.`)

	const baselineObj: RundownBaselineObj = {
		_id: protectString<RundownBaselineObjId>(Random.id(7)),
		rundownId: dbRundown._id,
		objects: postProcessRundownBaselineItems(
			blueprintRundownContext,
			showStyle.base.blueprintId,
			rundownRes.baseline
		),
	}
	// Save the global adlibs
	logger.info(`... got ${rundownRes.globalAdLibPieces.length} adLib objects from baseline.`)
	const baselineAdlibPieces = postProcessAdLibPieces(
		blueprintRundownContext,
		rundownRes.globalAdLibPieces,
		showStyle.base.blueprintId
	)
	logger.info(`... got ${(rundownRes.globalActions || []).length} adLib actions from baseline.`)
	const baselineAdlibActions = postProcessGlobalAdLibActions(
		blueprintRundownContext,
		rundownRes.globalActions || [],
		showStyle.base.blueprintId
	)

	// TODO - store notes from rundownNotesContext

	const segmentsAndParts = getRundownsSegmentsAndPartsFromCache(cache, [dbRundown])
	const existingRundownParts = _.filter(segmentsAndParts.parts, (part) => part.dynamicallyInserted !== true)
	const existingSegments = segmentsAndParts.segments

	const segments: DBSegment[] = []
	const parts: DBPart[] = []
	const segmentPieces: Piece[] = []
	const adlibPieces: AdLibPiece[] = []
	const adlibActions: AdLibAction[] = []

	const { blueprint, blueprintId } = getBlueprintOfRundown(dbRundown)

	_.each(ingestRundown.segments, (ingestSegment: IngestSegment) => {
		const segmentId = getSegmentId(rundownId, ingestSegment.externalId)
		const existingSegment = _.find(existingSegments, (s) => s._id === segmentId)
		const existingParts = existingRundownParts.filter((p) => p.segmentId === segmentId)

		ingestSegment.parts = _.sortBy(ingestSegment.parts, (part) => part.rank)

		const notesContext = new NotesContext(ingestSegment.name, `rundownId=${rundownId},segmentId=${segmentId}`, true)
		const context = new SegmentContext(dbRundown, studio, existingParts, notesContext)
		const res = blueprint.getSegment(context, ingestSegment)

		const segmentContents = generateSegmentContents(
			context,
			blueprintId,
			ingestSegment,
			existingSegment,
			existingParts,
			res
		)
		segments.push(segmentContents.newSegment)
		parts.push(...segmentContents.parts)
		segmentPieces.push(...segmentContents.segmentPieces)
		adlibPieces.push(...segmentContents.adlibPieces)
		adlibActions.push(...segmentContents.adlibActions)
	})

	// Prepare updates:
	let prepareSaveSegments = prepareSaveIntoCache(
		cache.Segments,
		{
			rundownId: rundownId,
		},
		segments
	)
	let prepareSaveParts = prepareSaveIntoCache(
		cache.Parts,
		{
			rundownId: rundownId,
		},
		parts
	)
	let prepareSavePieces = prepareSaveIntoCache(
		cache.Pieces,
		{
			rundownId: rundownId,
			dynamicallyInserted: { $ne: true }, // do not affect dynamically inserted pieces (such as adLib pieces)
		},
		segmentPieces
	)
	let prepareSaveAdLibPieces = prepareSaveIntoCache<AdLibPiece, AdLibPiece>(
		cache.AdLibPieces,
		{
			rundownId: rundownId,
		},
		adlibPieces
	)
	const prepareSaveAdLibActions = prepareSaveIntoDb<AdLibAction, AdLibAction>(
		AdLibActions,
		{
			rundownId: rundownId,
		},
		adlibActions
	)

	if (Settings.allowUnsyncedSegments) {
		if (
			!isUpdateAllowed(
				cache,
				dbPlaylist,
				dbRundown,
				{ changed: [{ doc: dbRundown, oldId: dbRundown._id }] },
				prepareSaveSegments,
				prepareSaveParts
			)
		) {
			ServerRundownAPI.unsyncRundownInner(cache, dbRundown._id)
			waitForPromise(cache.saveAllToDatabase())
			return false
		} else {
			const segmentChanges: SegmentChanges[] = splitIntoSegments(
				prepareSaveSegments,
				prepareSaveParts,
				prepareSavePieces,
				prepareSaveAdLibPieces
			)
			const approvedSegmentChanges: SegmentChanges[] = []
			_.each(segmentChanges, (segmentChange) => {
				if (
					isUpdateAllowed(
						cache,
						dbPlaylist,
						dbRundown,
						{ changed: [{ doc: dbRundown, oldId: dbRundown._id }] },
						segmentChange.segment,
						segmentChange.parts
					)
				) {
					approvedSegmentChanges.push(segmentChange)
				} else {
					ServerRundownAPI.unsyncSegmentInner(cache, rundownId, segmentChange.segmentId)
				}
			})

			prepareSaveSegments = {
				inserted: [],
				changed: [],
				removed: [],
				unchanged: [],
			}

			prepareSaveParts = {
				inserted: [],
				changed: [],
				removed: [],
				unchanged: [],
			}

			prepareSavePieces = {
				inserted: [],
				changed: [],
				removed: [],
				unchanged: [],
			}

			prepareSaveAdLibPieces = {
				inserted: [],
				changed: [],
				removed: [],
				unchanged: [],
			}

			approvedSegmentChanges.forEach((segmentChange) => {
				for (const key in prepareSaveSegments) {
					prepareSaveSegments[key].push(...segmentChange.segment[key])
					prepareSaveParts[key].push(...segmentChange.parts[key])
					prepareSavePieces[key].push(...segmentChange.pieces[key])
					prepareSaveAdLibPieces[key].push(...segmentChange.adlibPieces[key])
				}
			})
		}
	} else {
		// determine if update is allowed here
		if (
			!isUpdateAllowed(
				cache,
				dbPlaylist,
				dbRundown,
				{ changed: [{ doc: dbRundown, oldId: dbRundown._id }] },
				prepareSaveSegments,
				prepareSaveParts
			)
		) {
			ServerRundownAPI.unsyncRundownInner(cache, dbRundown._id)
			waitForPromise(cache.saveAllToDatabase())
			return false
		}
	}
	const allChanges = sumChanges(
		rundownChanges,
		playlistChanges,
		// Save the baseline
		saveIntoCache<RundownBaselineObj, RundownBaselineObj>(
			cache.RundownBaselineObjs,
			{
				rundownId: dbRundown._id,
			},
			[baselineObj]
		),
		// Save the global adlibs
		saveIntoCache<RundownBaselineAdLibItem, RundownBaselineAdLibItem>(
			cache.RundownBaselineAdLibPieces,
			{
				rundownId: dbRundown._id,
			},
			baselineAdlibPieces
		),
		saveIntoDb<RundownBaselineAdLibAction, RundownBaselineAdLibAction>(
			RundownBaselineAdLibActions,
			{
				rundownId: dbRundown._id,
			},
			baselineAdlibActions
		),

		// These are done in this order to ensure that the afterRemoveAll don't delete anything that was simply moved

		savePreparedChangesIntoCache<Piece, Piece>(prepareSavePieces, cache.Pieces, {
			afterInsert(piece) {
				logger.debug('inserted piece ' + piece._id)
				logger.debug(piece)
			},
			afterUpdate(piece) {
				logger.debug('updated piece ' + piece._id)
			},
			afterRemove(piece) {
				logger.debug('deleted piece ' + piece._id)
			},
		}),

		savePreparedChangesIntoCache<AdLibAction, AdLibAction>(prepareSaveAdLibActions, cache.AdLibActions, {
			afterInsert(adlibAction) {
				logger.debug('inserted adlibAction ' + adlibAction._id)
				logger.debug(adlibAction)
			},
			afterUpdate(adlibAction) {
				logger.debug('updated adlibAction ' + adlibAction._id)
			},
			afterRemove(adlibAction) {
				logger.debug('deleted adlibAction ' + adlibAction._id)
			},
		}),
		savePreparedChangesIntoCache<AdLibPiece, AdLibPiece>(prepareSaveAdLibPieces, cache.AdLibPieces, {
			afterInsert(adLibPiece) {
				logger.debug('inserted adLibPiece ' + adLibPiece._id)
				logger.debug(adLibPiece)
			},
			afterUpdate(adLibPiece) {
				logger.debug('updated piece ' + adLibPiece._id)
			},
			afterRemove(adLibPiece) {
				logger.debug('deleted piece ' + adLibPiece._id)
			},
		}),
		savePreparedChangesIntoCache<Part, DBPart>(prepareSaveParts, cache.Parts, {
			afterInsert(part) {
				logger.debug('inserted part ' + part._id)
			},
			afterUpdate(part) {
				logger.debug('updated part ' + part._id)
			},
			afterRemove(part) {
				logger.debug('deleted part ' + part._id)
			},
			afterRemoveAll(parts) {
				afterRemoveParts(cache, rundownId, parts)
			},
		}),

		// Update Segments:
		savePreparedChangesIntoCache(prepareSaveSegments, cache.Segments, {
			afterInsert(segment) {
				logger.info('inserted segment ' + segment._id)
			},
			afterUpdate(segment) {
				logger.info('updated segment ' + segment._id)
			},
			afterRemove(segment) {
				logger.info('removed segment ' + segment._id)
			},
			afterRemoveAll(segments) {
				afterRemoveSegments(
					cache,
					rundownId,
					_.map(segments, (s) => s._id)
				)
			},
		})
	)

	syncChangesToSelectedPartInstances(cache, dbPlaylist, parts, segmentPieces)

	const didChange = anythingChanged(allChanges)
	if (didChange) {
		afterIngestChangedData(
			cache,
			dbRundown,
			_.map(segments, (s) => s._id)
		)

		reportRundownDataHasChanged(cache, dbPlaylist, dbRundown)
	}

	logger.info(`Rundown ${dbRundown._id} update complete`)
	waitForPromise(cache.saveAllToDatabase())
	return didChange
}

function syncChangesToSelectedPartInstances(
	cache: CacheForRundownPlaylist,
	playlist: RundownPlaylist,
	parts: DBPart[],
	pieces: Piece[]
) {
	// TODO-PartInstances - to be removed once new data flow

	function syncPartChanges(partInstance: PartInstance | undefined, rawPieceInstances: PieceInstance[]) {
		// We need to do this locally to avoid wiping out any stored changes
		if (partInstance) {
			const newPart = parts.find((p) => p._id === partInstance.part._id)
			// The part missing is ok, as it should never happen to the current one (and if it does it is better to just keep playing)
			// Or if it was the next, then that will be resolved by a future call to updatenext
			if (newPart) {
				cache.PartInstances.update(partInstance._id, {
					$set: {
						part: {
							...partInstance.part,
							...newPart,
						},
					},
				})

				// Pieces
				const piecesForPart = pieces.filter((p) => p.partId === newPart._id)
				const currentPieceInstances = rawPieceInstances.filter((p) => p.partInstanceId === partInstance._id)
				const currentPieceInstancesMap = normalizeArrayFunc(currentPieceInstances, (p) =>
					unprotectString(p.piece._id)
				)

				// insert
				const newPieces = piecesForPart.filter((p) => !currentPieceInstancesMap[unprotectString(p._id)])
				const insertedIds: PieceInstanceId[] = []
				for (const newPiece of newPieces) {
					const newPieceInstance = wrapPieceToInstance(newPiece, partInstance._id)
					cache.PieceInstances.insert(newPieceInstance)
					insertedIds.push(newPieceInstance._id)
				}

				// prune
				cache.PieceInstances.remove({
					partInstanceId: partInstance._id,
					'piece._id': { $not: { $in: piecesForPart.map((p) => p._id) } },
					dynamicallyInserted: { $ne: true },
				})

				// update
				for (const instance of currentPieceInstances) {
					const piece = piecesForPart.find((p) => p._id === instance.piece._id)
					// If missing that is because the remove is still running, but that is fine
					if (piece) {
						cache.PieceInstances.update(instance._id, {
							$set: {
								piece: {
									...instance.piece,
									...piece,
								},
							},
						})
					}
				}
			}
		}
	}

	// Every PartInstance that is not reset needs to be kept in sync for now.
	// Its bad, but that is what the infinites logic requires
	const partInstances = cache.PartInstances.findFetch({ reset: { $ne: true } })
	const pieceInstances = cache.PieceInstances.findFetch({ reset: { $ne: true } })

	_.each(partInstances, (partInstance) => {
		syncPartChanges(partInstance, pieceInstances)
	})
}

/** Set order and playlistID of rundowns in a playlist */
function handleUpdatedRundownPlaylist(
	currentRundown: DBRundown,
	playlist: DBRundownPlaylist,
	order: _.Dictionary<number>
) {
	let rundowns: DBRundown[] = []
	let selector: Mongo.Selector<DBRundown> = {}
	if (currentRundown.playlistExternalId && playlist.externalId === currentRundown.playlistExternalId) {
		selector = { playlistExternalId: currentRundown.playlistExternalId }
		rundowns = Rundowns.find({ playlistExternalId: currentRundown.playlistExternalId }).fetch()
	} else if (!currentRundown.playlistExternalId) {
		selector = { _id: currentRundown._id }
		rundowns = [currentRundown]
	} else if (currentRundown.playlistExternalId && playlist.externalId !== currentRundown.playlistExternalId) {
		throw new Meteor.Error(
			501,
			`Rundown "${currentRundown._id}" is assigned to a playlist "${currentRundown.playlistExternalId}", but the produced playlist has external ID: "${playlist.externalId}".`
		)
	} else {
		throw new Meteor.Error(501, `Unknown error when handling rundown playlist.`)
	}

	const updated = rundowns.map((r) => {
		const rundownOrder = order[unprotectString(r._id)]
		if (rundownOrder !== undefined) {
			r.playlistId = playlist._id
			r._rank = rundownOrder
		} else {
			// an unranked Rundown is essentially "floated" - it is a part of the playlist, but it shouldn't be visible in the UI
		}
		return r
	})

	saveIntoDb(Rundowns, selector, updated)
}

function handleRemovedSegment(
	peripheralDevice: PeripheralDevice,
	rundownExternalId: string,
	segmentExternalId: string
) {
	const studio = getStudioFromDevice(peripheralDevice)
	const rundownId = getRundownId(studio, rundownExternalId)
	const playlistId = getRundown(rundownId, rundownExternalId).playlistId

	return rundownPlaylistSyncFunction(playlistId, RundownSyncFunctionPriority.INGEST, () => {
		const rundown = getRundown(rundownId, rundownExternalId)
		const playlist = getRundownPlaylist(rundown)
		const segmentId = getSegmentId(rundown._id, segmentExternalId)

		const cache = waitForPromise(initCacheForRundownPlaylist(playlist))

		const segment = cache.Segments.findOne(segmentId)
		if (!segment) throw new Meteor.Error(404, `handleRemovedSegment: Segment "${segmentId}" not found`)

		if (canBeUpdated(rundown, segment)) {
			if (!isUpdateAllowed(cache, playlist, rundown, {}, { removed: [segment] }, {})) {
				ServerRundownAPI.unsyncRundownInner(cache, rundown._id)
			} else {
				if (removeSegments(cache, rundownId, [segmentId]) === 0) {
					throw new Meteor.Error(
						404,
						`handleRemovedSegment: removeSegments: Segment ${segmentExternalId} not found`
					)
				}
			}
		}

		waitForPromise(cache.saveAllToDatabase())
	})
}
export function handleUpdatedSegment(
	peripheralDevice: PeripheralDevice,
	rundownExternalId: string,
	ingestSegment: IngestSegment
) {
	const studio = getStudioFromDevice(peripheralDevice)
	const rundownId = getRundownId(studio, rundownExternalId)
	const playlistId = getRundown(rundownId, rundownExternalId).playlistId

	return rundownPlaylistSyncFunction(playlistId, RundownSyncFunctionPriority.INGEST, () => {
		const rundown = getRundown(rundownId, rundownExternalId)
		const playlist = getRundownPlaylist(rundown)
		const segmentId = getSegmentId(rundown._id, ingestSegment.externalId)
		const segment = Segments.findOne(segmentId) // Note: undefined is valid here, as it means this is a new segment
		if (!canBeUpdated(rundown, segment)) return

		const cache = waitForPromise(initCacheForRundownPlaylist(playlist))
		cache.defer(() => {
			// can we do this?
			saveSegmentCache(rundown._id, segmentId, makeNewIngestSegment(ingestSegment))
		})

		const updatedSegmentId = updateSegmentFromIngestData(cache, studio, playlist, rundown, ingestSegment)
		if (updatedSegmentId) {
			afterIngestChangedData(cache, rundown, [updatedSegmentId])
		}

		waitForPromise(cache.saveAllToDatabase())
	})
}
export function updateSegmentsFromIngestData(
	cache: CacheForRundownPlaylist,
	studio: Studio,
	playlist: RundownPlaylist,
	rundown: Rundown,
	ingestSegments: IngestSegment[]
) {
	const changedSegmentIds: SegmentId[] = []
	for (let ingestSegment of ingestSegments) {
		const segmentId = updateSegmentFromIngestData(cache, studio, playlist, rundown, ingestSegment)
		if (segmentId !== null) {
			changedSegmentIds.push(segmentId)
		}
	}
	if (changedSegmentIds.length > 0) {
		afterIngestChangedData(cache, rundown, changedSegmentIds)
	}
}
/**
 * Run ingestData through blueprints and update the Segment
 * @param cache
 * @param studio
 * @param rundown
 * @param ingestSegment
 * @returns a segmentId if data has changed, null otherwise
 */
function updateSegmentFromIngestData(
	cache: CacheForRundownPlaylist,
	studio: Studio,
	playlist: RundownPlaylist,
	rundown: Rundown,
	ingestSegment: IngestSegment
): SegmentId | null {
	const segmentId = getSegmentId(rundown._id, ingestSegment.externalId)
	const { blueprint, blueprintId } = getBlueprintOfRundown(rundown)

	const existingSegment = cache.Segments.findOne({
		_id: segmentId,
		rundownId: rundown._id,
	})
	// The segment may not yet exist (if it had its id changed), so we need to fetch the old ones manually
	const existingParts = cache.Parts.findFetch({
		rundownId: rundown._id,
		segmentId: segmentId,
		dynamicallyInserted: { $ne: true },
	})

	ingestSegment.parts = _.sortBy(ingestSegment.parts, (s) => s.rank)

	const notesContext = new NotesContext(ingestSegment.name, `rundownId=${rundown._id},segmentId=${segmentId}`, true)
	const context = new SegmentContext(rundown, studio, existingParts, notesContext)
	const res = blueprint.getSegment(context, ingestSegment)

	const { parts, segmentPieces, adlibPieces, adlibActions, newSegment } = generateSegmentContents(
		context,
		blueprintId,
		ingestSegment,
		existingSegment,
		existingParts,
		res
	)

	const prepareSaveParts = prepareSaveIntoCache<Part, DBPart>(
		cache.Parts,
		{
			rundownId: rundown._id,
			$or: [
				{
					// The parts in this Segment:
					segmentId: segmentId,
				},
				{
					// Move over parts from other segments
					_id: { $in: _.pluck(parts, '_id') },
				},
			],
			dynamicallyInserted: { $ne: true }, // do not affect dynamically inserted parts (such as adLib parts)
		},
		parts
	)
	const prepareSavePieces = prepareSaveIntoCache<Piece, Piece>(
		cache.Pieces,
		{
			rundownId: rundown._id,
			partId: { $in: parts.map((p) => p._id) },
			dynamicallyInserted: { $ne: true }, // do not affect dynamically inserted pieces (such as adLib pieces)
		},
		segmentPieces
	)

	const prepareSaveAdLibPieces = prepareSaveIntoCache<AdLibPiece, AdLibPiece>(
		cache.AdLibPieces,
		{
			rundownId: rundown._id,
			partId: { $in: parts.map((p) => p._id) },
		},
		adlibPieces
	)
	const prepareSaveAdLibActions = prepareSaveIntoDb<AdLibAction, AdLibAction>(
		AdLibActions,
		{
			rundownId: rundown._id,
			partId: { $in: parts.map((p) => p._id) },
		},
		adlibActions
	)

	// determine if update is allowed here
	if (
		!isUpdateAllowed(
			cache,
			playlist,
			rundown,
			{},
			{ changed: [{ doc: newSegment, oldId: newSegment._id }] },
			prepareSaveParts
		)
	) {
		ServerRundownAPI.unsyncRundownInner(cache, rundown._id)
		return null
	}

	// Update segment info:
	cache.Segments.upsert(
		{
			_id: segmentId,
			rundownId: rundown._id,
		},
		newSegment
	)

	const changes = sumChanges(
		// These are done in this order to ensure that the afterRemoveAll don't delete anything that was simply moved

		savePreparedChangesIntoCache<Piece, Piece>(prepareSavePieces, cache.Pieces, {
			afterInsert(piece) {
				logger.debug('inserted piece ' + piece._id)
				logger.debug(piece)
			},
			afterUpdate(piece) {
				logger.debug('updated piece ' + piece._id)
			},
			afterRemove(piece) {
				logger.debug('deleted piece ' + piece._id)
			},
		}),
		savePreparedChangesIntoCache<AdLibPiece, AdLibPiece>(prepareSaveAdLibPieces, cache.AdLibPieces, {
			afterInsert(adLibPiece) {
				logger.debug('inserted adLibPiece ' + adLibPiece._id)
				logger.debug(adLibPiece)
			},
			afterUpdate(adLibPiece) {
				logger.debug('updated adLibPiece ' + adLibPiece._id)
			},
			afterRemove(adLibPiece) {
				logger.debug('deleted adLibPiece ' + adLibPiece._id)
			},
		}),
		savePreparedChangesIntoCache<AdLibAction, AdLibAction>(prepareSaveAdLibActions, cache.AdLibActions, {
			afterInsert(adLibAction) {
				logger.debug('inserted adLibAction ' + adLibAction._id)
				logger.debug(adLibAction)
			},
			afterUpdate(adLibAction) {
				logger.debug('updated adLibAction ' + adLibAction._id)
			},
			afterRemove(adLibAction) {
				logger.debug('deleted adLibAction ' + adLibAction._id)
			},
		}),
		savePreparedChangesIntoCache<Part, DBPart>(prepareSaveParts, cache.Parts, {
			afterInsert(part) {
				logger.debug('inserted part ' + part._id)
			},
			afterUpdate(part) {
				logger.debug('updated part ' + part._id)
			},
			afterRemove(part) {
				logger.debug('deleted part ' + part._id)
			},
			afterRemoveAll(parts) {
				afterRemoveParts(cache, rundown._id, parts)
			},
		})
	)

	syncChangesToSelectedPartInstances(cache, getRundownPlaylistFromCache(cache, rundown), parts, segmentPieces)

	return anythingChanged(changes) ? segmentId : null
}
function afterIngestChangedData(cache: CacheForRundownPlaylist, rundown: Rundown, changedSegmentIds: SegmentId[]) {
	const playlist = cache.RundownPlaylists.findOne({ _id: rundown.playlistId })
	// To be called after rundown has been changed
	updateExpectedMediaItemsOnRundown(cache, rundown._id)
	updateExpectedPlayoutItemsOnRundown(cache, rundown._id)
	updatePartRanks(cache, rundown)
	updateSourceLayerInfinitesAfterPart(cache, rundown)

	if (!playlist) {
		throw new Meteor.Error(404, `Orphaned rundown ${rundown._id}`)
	}
	UpdateNext.ensureNextPartIsValid(cache, playlist)

	triggerUpdateTimelineAfterIngestData(cache, rundown._id, changedSegmentIds)
}

export function handleRemovedPart(
	peripheralDevice: PeripheralDevice,
	rundownExternalId: string,
	segmentExternalId: string,
	partExternalId: string
) {
	const studio = getStudioFromDevice(peripheralDevice)
	const rundownId = getRundownId(studio, rundownExternalId)
	const playlistId = getRundown(rundownId, rundownExternalId).playlistId

	return rundownPlaylistSyncFunction(playlistId, RundownSyncFunctionPriority.INGEST, () => {
		const rundown = getRundown(rundownId, rundownExternalId)
		const playlist = getRundownPlaylist(rundown)
		const segmentId = getSegmentId(rundown._id, segmentExternalId)
		const partId = getPartId(rundown._id, partExternalId)
		const segment = getSegment(segmentId)

		const cache = waitForPromise(initCacheForRundownPlaylist(playlist))

		if (canBeUpdated(rundown, segment, partId)) {
			const part = cache.Parts.findOne({
				_id: partId,
				segmentId: segmentId,
				rundownId: rundown._id,
			})
			if (!part) throw new Meteor.Error(404, 'Part not found')

			if (!isUpdateAllowed(cache, playlist, rundown, {}, {}, { removed: [part] })) {
				ServerRundownAPI.unsyncRundownInner(cache, rundown._id)
			} else {
				// Blueprints will handle the deletion of the Part
				const ingestSegment = loadCachedIngestSegment(
					rundown._id,
					rundownExternalId,
					segmentId,
					segmentExternalId
				)
				ingestSegment.parts = ingestSegment.parts.filter((p) => p.externalId !== partExternalId)
				ingestSegment.modified = getCurrentTime()

				cache.defer(() => {
					saveSegmentCache(rundown._id, segmentId, ingestSegment)
				})
				const updatedSegmentId = updateSegmentFromIngestData(cache, studio, playlist, rundown, ingestSegment)
				if (updatedSegmentId) {
					afterIngestChangedData(cache, rundown, [updatedSegmentId])
				}
			}

			waitForPromise(cache.saveAllToDatabase())
		}
	})
}
export function handleUpdatedPart(
	peripheralDevice: PeripheralDevice,
	rundownExternalId: string,
	segmentExternalId: string,
	ingestPart: IngestPart
) {
	const studio = getStudioFromDevice(peripheralDevice)
	const rundownId = getRundownId(studio, rundownExternalId)
	const playlistId = getRundown(rundownId, rundownExternalId).playlistId

	return rundownPlaylistSyncFunction(playlistId, RundownSyncFunctionPriority.INGEST, () => {
		const rundown = getRundown(rundownId, rundownExternalId)
		const playlist = getRundownPlaylist(rundown)

		const cache = waitForPromise(initCacheForRundownPlaylist(playlist))
		handleUpdatedPartInner(cache, studio, playlist, rundown, segmentExternalId, ingestPart)

		waitForPromise(cache.saveAllToDatabase())
	})
}
export function handleUpdatedPartInner(
	cache: CacheForRundownPlaylist,
	studio: Studio,
	playlist: RundownPlaylist,
	rundown: Rundown,
	segmentExternalId: string,
	ingestPart: IngestPart
) {
	// Updated OR created part
	const segmentId = getSegmentId(rundown._id, segmentExternalId)
	const partId = getPartId(rundown._id, ingestPart.externalId)
	const segment = cache.Segments.findOne(segmentId)
	if (!segment) throw new Meteor.Error(404, `Segment "${segmentId}" not found`)

	if (!canBeUpdated(rundown, segment, partId)) return

	const part = cache.Parts.findOne({
		_id: partId,
		segmentId: segmentId,
		rundownId: rundown._id,
	})

	if (part && !isUpdateAllowed(cache, playlist, rundown, {}, {}, { changed: [{ doc: part, oldId: part._id }] })) {
		ServerRundownAPI.unsyncRundownInner(cache, rundown._id)
	} else {
		// Blueprints will handle the creation of the Part
		const ingestSegment: LocalIngestSegment = loadCachedIngestSegment(
			rundown._id,
			rundown.externalId,
			segmentId,
			segmentExternalId
		)
		ingestSegment.parts = ingestSegment.parts.filter((p) => p.externalId !== ingestPart.externalId)
		ingestSegment.parts.push(makeNewIngestPart(ingestPart))
		ingestSegment.modified = getCurrentTime()

		cache.defer(() => {
			saveSegmentCache(rundown._id, segmentId, ingestSegment)
		})
		const updatedSegmentId = updateSegmentFromIngestData(cache, studio, playlist, rundown, ingestSegment)
		if (updatedSegmentId) {
			afterIngestChangedData(cache, rundown, [updatedSegmentId])
		}
	}
}

function generateSegmentContents(
	context: SegmentContext,
	blueprintId: BlueprintId,
	ingestSegment: IngestSegment,
	existingSegment: DBSegment | undefined,
	existingParts: DBPart[],
	blueprintRes: BlueprintResultSegment
) {
	const rundownId = context._rundown._id
	const segmentId = getSegmentId(rundownId, ingestSegment.externalId)
	const rawNotes = context.notesContext.getNotes()

	// Ensure all parts have a valid externalId set on them
	const knownPartIds = blueprintRes.parts.map((p) => p.part.externalId)

	const rawSegmentNotes = _.filter(
		rawNotes,
		(note) => !note.trackingId || knownPartIds.indexOf(note.trackingId) === -1
	)
	const segmentNotes = _.map(rawSegmentNotes, (note) =>
		literal<SegmentNote>({
			type: note.type,
			message: note.message,
			origin: {
				name: '', // TODO
			},
		})
	)

	const newSegment = literal<DBSegment>({
		..._.omit(existingSegment || {}, 'isHidden'),
		...blueprintRes.segment,
		_id: segmentId,
		rundownId: rundownId,
		externalId: ingestSegment.externalId,
		_rank: ingestSegment.rank,
		notes: segmentNotes,
	})

	const parts: DBPart[] = []
	const segmentPieces: Piece[] = []
	const adlibPieces: AdLibPiece[] = []
	const adlibActions: AdLibAction[] = []

	// Parts
	blueprintRes.parts.forEach((blueprintPart, i) => {
		const partId = getPartId(rundownId, blueprintPart.part.externalId)

		const partRawNotes = _.filter(rawNotes, (note) => note.trackingId === blueprintPart.part.externalId)
		const notes = _.map(partRawNotes, (note) =>
			literal<PartNote>({
				type: note.type,
				message: note.message,
				origin: {
					name: '', // TODO
				},
			})
		)

		const existingPart = _.find(existingParts, (p) => p._id === partId)
		const part = literal<DBPart>({
			..._.omit(existingPart || {}, 'invalid'),
			...blueprintPart.part,
			_id: partId,
			rundownId: rundownId,
			segmentId: newSegment._id,
			_rank: i, // This gets updated to a rank unique within its segment in a later step
			notes: notes,
		})
		parts.push(part)

		// This ensures that it doesn't accidently get played while hidden
		if (blueprintRes.segment.isHidden) {
			part.invalid = true
		}

		// Update pieces
		segmentPieces.push(...postProcessPieces(context, blueprintPart.pieces, blueprintId, rundownId, part._id))
		adlibPieces.push(...postProcessAdLibPieces(context, blueprintPart.adLibPieces, blueprintId, part._id))
		adlibActions.push(...postProcessAdLibActions(context, blueprintPart.actions || [], blueprintId, part._id))
	})

	return {
		newSegment,
		parts,
		segmentPieces,
		adlibPieces,
		adlibActions,
	}
}

export function isUpdateAllowed(
	cache: CacheForRundownPlaylist,
	rundownPlaylist: RundownPlaylist,
	rundown: Rundown,
	rundownChanges?: Partial<PreparedChanges<DBRundown>>,
	segmentChanges?: Partial<PreparedChanges<DBSegment>>,
	partChanges?: Partial<PreparedChanges<DBPart>>
): boolean {
	let allowed: boolean = true

	if (!rundown) return false
	if (rundown.unsynced) {
		logger.info(`Rundown "${rundown._id}" has been unsynced and needs to be synced before it can be updated.`)
		return false
	}

	if (rundownPlaylist.active) {
		if (allowed && rundownChanges && rundownChanges.removed && rundownChanges.removed.length) {
			_.each(rundownChanges.removed, (rd) => {
				if (rundown._id === rd._id) {
					// Don't allow removing an active rundown
					logger.warn(
						`Not allowing removal of current active rundown "${rd._id}", making rundown unsynced instead`
					)
					allowed = false
				}
			})
		}
		const { currentPartInstance, nextPartInstance } = getSelectedPartInstancesFromCache(cache, rundownPlaylist)
		if (currentPartInstance) {
			if (allowed && partChanges && partChanges.removed && partChanges.removed.length) {
				_.each(partChanges.removed, (part) => {
					if (currentPartInstance.part._id === part._id) {
						// Don't allow removing currently playing part
						logger.warn(
							`Not allowing removal of currently playing part "${part._id}", making rundown unsynced instead`
						)
						allowed = false
					} else if (
						nextPartInstance &&
						nextPartInstance.part._id === part._id &&
						isTooCloseToAutonext(currentPartInstance, false)
					) {
						// Don't allow removing next part, when autonext is about to happen
						logger.warn(
							`Not allowing removal of nexted part "${part._id}", making rundown unsynced instead`
						)
						allowed = false
					}
				})
			}
			if (allowed && segmentChanges && segmentChanges.removed && segmentChanges.removed.length) {
				_.each(segmentChanges.removed, (segment) => {
					if (currentPartInstance.segmentId === segment._id) {
						// Don't allow removing segment with currently playing part
						logger.warn(
							`Not allowing removal of segment "${segment._id}", containing currently playing part "${currentPartInstance.part._id}", making rundown unsynced instead`
						)
					}
				})
			}
			if (allowed) {
				const currentPart = rundownPlaylist.currentPartInstanceId
					? PartInstances.findOne({ _id: rundownPlaylist.currentPartInstanceId })
					: undefined
				if (segmentChanges && segmentChanges.removed && segmentChanges.removed.length) {
					_.each(segmentChanges.removed, (segment) => {
						if (currentPart && currentPart.segmentId === segment._id) {
							// Don't allow removing segment with currently playing part
							logger.warn(
								`Not allowing removal of segment "${segment._id}", containing currently playing part "${currentPart._id}"`
							)
							allowed = false
						}
					})
				}
				if (
					allowed &&
					partChanges &&
					partChanges.removed &&
					partChanges.removed.length &&
					currentPart &&
					currentPart.part.afterPart
				) {
					// If the currently playing part is a queued part and depending on any of the parts that are to be removed:
					const removedPartIds = partChanges.removed.map((part) => part._id)
					if (removedPartIds.includes(currentPart.part.afterPart)) {
						// Don't allow removal of a part that has a currently playing queued Part
						logger.warn(
							`Not allowing removal of part "${currentPart.part.afterPart}", because currently playing (queued) part "${currentPart._id}" is after it`
						)
						allowed = false
					}
				}
			}
		}
	}
	if (!allowed) {
		if (rundownChanges) logger.debug(`rundownChanges: ${printChanges(rundownChanges)}`)
		if (segmentChanges) logger.debug(`segmentChanges: ${printChanges(segmentChanges)}`)
		if (partChanges) logger.debug(`partChanges: ${printChanges(partChanges)}`)
	}
	return allowed
}
function printChanges(changes: Partial<PreparedChanges<{ _id: ProtectedString<any> }>>): string {
	let str = ''

	if (changes.changed) str += _.map(changes.changed, (doc) => 'change:' + doc.doc._id).join(',')
	if (changes.inserted) str += _.map(changes.inserted, (doc) => 'insert:' + doc._id).join(',')
	if (changes.removed) str += _.map(changes.removed, (doc) => 'remove:' + doc._id).join(',')

	return str
}

type PartIdToSegmentId = Map<PartId, SegmentId>

function splitIntoSegments(
	prepareSaveSegments: PreparedChanges<DBSegment>,
	prepareSaveParts: PreparedChanges<DBPart>,
	prepareSavePieces: PreparedChanges<Piece>,
	prepareSaveAdLibPieces: PreparedChanges<AdLibPiece>
): SegmentChanges[] {
	let changes: SegmentChanges[] = []

	processChangeGroup(changes, prepareSaveSegments, 'changed')
	processChangeGroup(changes, prepareSaveSegments, 'inserted')
	processChangeGroup(changes, prepareSaveSegments, 'removed')
	processChangeGroup(changes, prepareSaveSegments, 'unchanged')

	const partsToSegments: PartIdToSegmentId = new Map()

	prepareSaveParts.changed.forEach((part) => {
		partsToSegments.set(part.doc._id, part.doc.segmentId)
		const index = changes.findIndex((c) => c.segmentId === part.doc.segmentId)
		if (index === -1) {
			const newChange = makeChangeObj(part.doc.segmentId)
			newChange.parts.changed.push(part)
			changes.push(newChange)
		} else {
			changes[index].parts.changed.push(part)
		}
	})
	;['removed', 'inserted', 'unchanged'].forEach((change: keyof Omit<PreparedChanges<DBPart>, 'changed'>) => {
		prepareSaveParts[change].forEach((part: DBPart) => {
			partsToSegments.set(part._id, part.segmentId)
			const index = changes.findIndex((c) => c.segmentId === part.segmentId)
			if (index === -1) {
				const newChange = makeChangeObj(part.segmentId)
				newChange.parts[change].push(part)
				changes.push(newChange)
			} else {
				changes[index].parts[change].push(part)
			}
		})
	})

	for (const piece of prepareSavePieces.changed) {
		const segmentId = partsToSegments.get(piece.doc.partId)
		if (!segmentId) {
			logger.warning(`SegmentId could not be found when trying to modify piece ${piece.doc._id}`)
			break // In theory this shouldn't happen, but reject 'orphaned' changes
		}
		const index = changes.findIndex((c) => c.segmentId === segmentId)
		if (index === -1) {
			const newChange = makeChangeObj(segmentId)
			newChange.pieces.changed.push(piece)
			changes.push(newChange)
		} else {
			changes[index].pieces.changed.push(piece)
		}
	}

	;['removed', 'inserted', 'unchanged'].forEach((change: keyof Omit<PreparedChanges<Piece>, 'changed'>) => {
		for (const piece of prepareSavePieces[change]) {
			const segmentId = partsToSegments.get(piece.partId)
			if (!segmentId) {
				logger.warning(`SegmentId could not be found when trying to modify piece ${piece._id}`)
				break // In theory this shouldn't happen, but reject 'orphaned' changes
			}
			const index = changes.findIndex((c) => c.segmentId === segmentId)
			if (index === -1) {
				const newChange = makeChangeObj(segmentId)
				newChange.pieces[change].push(piece)
				changes.push(newChange)
			} else {
				changes[index].pieces[change].push(piece)
			}
		}
	})

	for (const adlib of prepareSaveAdLibPieces.changed) {
		const segmentId = adlib.doc.partId ? partsToSegments.get(adlib.doc.partId) : undefined
		if (!segmentId) {
			logger.warning(`SegmentId could not be found when trying to modify adlib ${adlib.doc._id}`)
			break // In theory this shouldn't happen, but reject 'orphaned' changes
		}
		const index = changes.findIndex((c) => c.segmentId === segmentId)
		if (index === -1) {
			const newChange = makeChangeObj(segmentId)
			newChange.adlibPieces.changed.push(adlib)
			changes.push(newChange)
		} else {
			changes[index].adlibPieces.changed.push(adlib)
		}
	}

	;['removed', 'inserted', 'unchanged'].forEach((change: keyof Omit<PreparedChanges<AdLibPiece>, 'changed'>) => {
		for (const piece of prepareSaveAdLibPieces[change]) {
			const segmentId = piece.partId ? partsToSegments.get(piece.partId) : undefined
			if (!segmentId) {
				logger.warning(`SegmentId could not be found when trying to modify adlib ${piece._id}`)
				break // In theory this shouldn't happen, but reject 'orphaned' changes
			}
			const index = changes.findIndex((c) => c.segmentId === segmentId)
			if (index === -1) {
				const newChange = makeChangeObj(segmentId)
				newChange.adlibPieces[change].push(piece)
				changes.push(newChange)
			} else {
				changes[index].adlibPieces[change].push(piece)
			}
		}
	})

	return changes
}

function processChangeGroup<
	ChangeType extends keyof PreparedChanges<DBSegment>,
	ChangedObj extends DBSegment | DBPart | Piece | AdLibPiece
>(changes: SegmentChanges[], preparedChanges: PreparedChanges<ChangedObj>, changeField: ChangeType) {
	const subset = preparedChanges[changeField]
	// @ts-ignore
	subset.forEach((ch) => {
		if (changeField === 'changed') {
			const existing = changes.findIndex(
				(c) => (ch as PreparedChangesChangesDoc<ChangedObj>).doc._id === c.segmentId
			)
			processChangeGroupInner(
				existing,
				changes,
				changeField,
				ch,
				(ch as PreparedChangesChangesDoc<ChangedObj>).doc._id
			)
		} else {
			const existing = changes.findIndex((c) => (ch as ChangedObj)._id === c.segmentId)
			processChangeGroupInner(existing, changes, changeField, ch, (ch as ChangedObj)._id)
		}
	})
}

function processChangeGroupInner<ChangeType extends keyof PreparedChanges<DBSegment>>(
	existing: number,
	changes: SegmentChanges[],
	changeField: ChangeType,
	changedObject: PreparedChangesChangesDoc<DBSegment> | DBSegment,
	segmentId
) {
	if (existing !== -1) {
		if (!changes[existing].segment) {
			changes[existing].segment = {
				inserted: [],
				changed: [],
				removed: [],
				unchanged: [],
			}
		}

		// @ts-ignore
		changes[existing].segment[changeField].push(changedObject as any)
	} else {
		const newChange = makeChangeObj(segmentId)
		// @ts-ignore
		newChange.segment[changeField].push(changedObject as any)
		changes.push(newChange)
	}
}

function makeChangeObj(segmentId: SegmentId): SegmentChanges {
	return {
		segmentId,
		segment: {
			inserted: [],
			changed: [],
			removed: [],
			unchanged: [],
		},
		parts: {
			inserted: [],
			changed: [],
			removed: [],
			unchanged: [],
		},
		pieces: {
			inserted: [],
			changed: [],
			removed: [],
			unchanged: [],
		},
		adlibPieces: {
			inserted: [],
			changed: [],
			removed: [],
			unchanged: [],
		},
	}
}
