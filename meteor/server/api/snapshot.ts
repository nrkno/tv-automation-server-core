import * as Path from 'path'
import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'
import { ServerResponse, IncomingMessage } from 'http'
import * as bodyParser from 'body-parser'
import { check, Match } from '../../lib/check'
import { Studio, Studios, StudioId } from '../../lib/collections/Studios'
import {
	Snapshots,
	DeprecatedSnapshotRundown,
	SnapshotType,
	SnapshotSystem,
	SnapshotDebug,
	SnapshotBase,
	SnapshotRundownPlaylist,
	SnapshotId,
} from '../../lib/collections/Snapshots'
import { Rundowns, DBRundown, RundownId } from '../../lib/collections/Rundowns'
import { UserActionsLog, UserActionsLogItem } from '../../lib/collections/UserActionsLog'
import { Segments, Segment, SegmentId } from '../../lib/collections/Segments'
import { Part, Parts, PartId } from '../../lib/collections/Parts'
import { Pieces, Piece, PieceId } from '../../lib/collections/Pieces'
import { AdLibPieces, AdLibPiece } from '../../lib/collections/AdLibPieces'
import { MediaObjects, MediaObject } from '../../lib/collections/MediaObjects'
import {
	getCurrentTime,
	Time,
	formatDateTime,
	fixValidPath,
	protectString,
	getRandomId,
	unprotectString,
	makePromise,
	ProtectedString,
	protectStringArray,
} from '../../lib/lib'
import { ShowStyleBases, ShowStyleBase, ShowStyleBaseId } from '../../lib/collections/ShowStyleBases'
import { PeripheralDevices, PeripheralDevice, PeripheralDeviceId } from '../../lib/collections/PeripheralDevices'
import { logger } from '../logging'
import { Timeline, TimelineComplete } from '../../lib/collections/Timeline'
import { PeripheralDeviceCommands, PeripheralDeviceCommand } from '../../lib/collections/PeripheralDeviceCommands'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { ServerPeripheralDeviceAPI } from './peripheralDevice'
import { registerClassToMeteorMethods } from '../methods'
import { NewSnapshotAPI, SnapshotAPIMethods } from '../../lib/api/shapshot'
import { getCoreSystem, ICoreSystem, CoreSystem, parseVersion } from '../../lib/collections/CoreSystem'
import { fsWriteFile, fsReadFile, fsUnlinkFile } from '../lib'
import { CURRENT_SYSTEM_VERSION } from '../migration/currentSystemVersion'
import { isVersionSupported } from '../migration/databaseMigration'
import { ShowStyleVariant, ShowStyleVariants } from '../../lib/collections/ShowStyleVariants'
import { Blueprints, Blueprint, BlueprintId } from '../../lib/collections/Blueprints'
import { VTContent } from '@sofie-automation/blueprints-integration'
import { MongoQuery } from '../../lib/typings/meteor'
import { ExpectedMediaItem, ExpectedMediaItems } from '../../lib/collections/ExpectedMediaItems'
import { ExpectedPackageDB, ExpectedPackages } from '../../lib/collections/ExpectedPackages'
import { IngestDataCacheObj, IngestDataCache } from '../../lib/collections/IngestDataCache'
import { importIngestRundown } from './ingest/http'
import { RundownBaselineObj, RundownBaselineObjs } from '../../lib/collections/RundownBaselineObjs'
import { RundownBaselineAdLibItem, RundownBaselineAdLibPieces } from '../../lib/collections/RundownBaselineAdLibPieces'
import { RundownPlaylists, DBRundownPlaylist, RundownPlaylistId } from '../../lib/collections/RundownPlaylists'
import { RundownLayouts, RundownLayoutBase } from '../../lib/collections/RundownLayouts'
import { ExpectedPlayoutItem, ExpectedPlayoutItems } from '../../lib/collections/ExpectedPlayoutItems'
import { PartInstances, PartInstance, PartInstanceId } from '../../lib/collections/PartInstances'
import { PieceInstance, PieceInstances, PieceInstanceId } from '../../lib/collections/PieceInstances'
import { makePlaylistFromRundown_1_0_0 } from '../migration/deprecatedDataTypes/1_0_1'
import { OrganizationId } from '../../lib/collections/Organization'
import { Settings } from '../../lib/Settings'
import { MethodContext, MethodContextAPI } from '../../lib/api/methods'
import { Credentials, isResolvedCredentials } from '../security/lib/credentials'
import { OrganizationContentWriteAccess } from '../security/organization'
import { StudioContentWriteAccess, StudioReadAccess } from '../security/studio'
import { SystemWriteAccess } from '../security/system'
import { PickerPOST, PickerGET } from './http'
import { getPartId, getSegmentId } from './ingest/lib'
import { Piece as Piece_1_11_0 } from '../migration/deprecatedDataTypes/1_11_0'
import { AdLibActions, AdLibAction } from '../../lib/collections/AdLibActions'
import {
	RundownBaselineAdLibActions,
	RundownBaselineAdLibAction,
} from '../../lib/collections/RundownBaselineAdLibActions'
import { migrateConfigToBlueprintConfigOnObject } from '../migration/1_12_0'
import { saveIntoDb, sumChanges } from '../lib/database'

interface DeprecatedRundownSnapshot {
	// Old, from the times before rundownPlaylists
	version: string
	rundownId: RundownId
	snapshot: DeprecatedSnapshotRundown
	rundown: DBRundown
	ingestData: Array<IngestDataCacheObj>
	userActions: Array<UserActionsLogItem>
	baselineObjs: Array<RundownBaselineObj>
	baselineAdlibs: Array<RundownBaselineAdLibItem>
	segments: Array<Segment>
	parts: Array<Part>
	pieces: Array<Piece>
	adLibPieces: Array<AdLibPiece>
	mediaObjects: Array<MediaObject>
	expectedMediaItems: Array<ExpectedMediaItem>
}

interface RundownPlaylistSnapshot {
	version: string
	playlistId: RundownPlaylistId
	snapshot: SnapshotRundownPlaylist
	playlist: DBRundownPlaylist
	rundowns: Array<DBRundown>
	ingestData: Array<IngestDataCacheObj>
	userActions: Array<UserActionsLogItem>
	baselineObjs: Array<RundownBaselineObj>
	baselineAdlibs: Array<RundownBaselineAdLibItem>
	segments: Array<Segment>
	parts: Array<Part>
	partInstances: Array<PartInstance>
	pieces: Array<Piece>
	pieceInstances: Array<PieceInstance>
	adLibPieces: Array<AdLibPiece>
	adLibActions: Array<AdLibAction>
	baselineAdLibActions: Array<RundownBaselineAdLibAction>
	mediaObjects: Array<MediaObject>
	expectedMediaItems: Array<ExpectedMediaItem>
	expectedPlayoutItems: Array<ExpectedPlayoutItem>
	expectedPackages: Array<ExpectedPackageDB>
}
interface SystemSnapshot {
	version: string
	studioId: StudioId | null
	snapshot: SnapshotSystem
	studios: Array<Studio>
	showStyleBases: Array<ShowStyleBase>
	showStyleVariants: Array<ShowStyleVariant>
	blueprints?: Array<Blueprint> // optional, to be backwards compatible
	rundownLayouts?: Array<RundownLayoutBase> // optional, to be backwards compatible
	devices: Array<PeripheralDevice>
	deviceCommands: Array<PeripheralDeviceCommand>
	coreSystem: ICoreSystem
}
interface DebugSnapshot {
	version: string
	studioId?: StudioId
	snapshot: SnapshotDebug
	system: SystemSnapshot
	activeRundownPlaylists: Array<RundownPlaylistSnapshot>
	timeline: TimelineComplete[]
	userActionLog: Array<UserActionsLogItem>
	deviceSnaphots: Array<DeviceSnapshot>
}
interface DeviceSnapshot {
	deviceId: PeripheralDeviceId
	created: Time
	replyTime: Time
	content: any
}
type AnySnapshot = RundownPlaylistSnapshot | SystemSnapshot | DebugSnapshot | DeprecatedRundownSnapshot

/**
 * Create a snapshot of all items related to a RundownPlaylist
 * @param playlistId
 */
function createRundownPlaylistSnapshot(
	playlistId: RundownPlaylistId,
	organizationId: OrganizationId | null
): RundownPlaylistSnapshot {
	let snapshotId: SnapshotId = getRandomId()
	logger.info(`Generating RundownPlaylist snapshot "${snapshotId}" for RundownPlaylist "${playlistId}"`)

	const playlist = RundownPlaylists.findOne(playlistId)
	if (!playlist) throw new Meteor.Error(404, `Playlist "${playlistId}" not found`)
	const rundowns = playlist.getRundowns()
	const rundownIds = rundowns.map((i) => i._id)
	const ingestData = IngestDataCache.find({ rundownId: { $in: rundownIds } }, { sort: { modified: -1 } }).fetch() // @todo: check sorting order
	const userActions = UserActionsLog.find({
		args: {
			$regex:
				`.*(` +
				rundownIds
					.concat(playlistId as any)
					.map((i) => `"${i}"`)
					.join('|') +
				`).*`,
		},
	}).fetch()

	const segments = playlist.getSegments()
	const parts = playlist.getAllOrderedParts()
	const partInstances = playlist.getAllPartInstances()
	const pieces = Pieces.find({ startRundownId: { $in: rundownIds } }).fetch()
	const pieceInstances = PieceInstances.find({ rundownId: { $in: rundownIds } }).fetch()
	const adLibPieces = AdLibPieces.find({ rundownId: { $in: rundownIds } }).fetch()
	const baselineAdlibs = RundownBaselineAdLibPieces.find({ rundownId: { $in: rundownIds } }).fetch()
	const adLibActions = AdLibActions.find({ rundownId: { $in: rundownIds } }).fetch()
	const baselineAdLibActions = RundownBaselineAdLibActions.find({ rundownId: { $in: rundownIds } }).fetch()
	const mediaObjectIds: Array<string> = [
		..._.compact(pieces.map((piece) => (piece.content as VTContent | undefined)?.fileName)),
		..._.compact(adLibPieces.map((adLibPiece) => (adLibPiece.content as VTContent | undefined)?.fileName)),
		..._.compact(baselineAdlibs.map((adLibPiece) => (adLibPiece.content as VTContent | undefined)?.fileName)),
	]
	const mediaObjects = MediaObjects.find({ mediaId: { $in: mediaObjectIds } }).fetch()
	const expectedMediaItems = ExpectedMediaItems.find({ partId: { $in: parts.map((i) => i._id) } }).fetch()
	const expectedPlayoutItems = ExpectedPlayoutItems.find({ rundownId: { $in: rundownIds } }).fetch()
	const expectedPackages = ExpectedPackages.find({ rundownId: { $in: rundownIds } }).fetch()
	const baselineObjs = RundownBaselineObjs.find({ rundownId: { $in: rundownIds } }).fetch()

	logger.info(`Snapshot generation done`)
	return {
		version: CURRENT_SYSTEM_VERSION,
		playlistId,
		snapshot: {
			_id: snapshotId,
			organizationId: organizationId,
			created: getCurrentTime(),
			type: SnapshotType.RUNDOWNPLAYLIST,
			playlistId,
			studioId: playlist.studioId,
			name: `Rundown_${playlist.name}_${playlist._id}_${formatDateTime(getCurrentTime())}`,
			version: CURRENT_SYSTEM_VERSION,
		},
		playlist,
		rundowns,
		ingestData,
		userActions,
		baselineObjs,
		baselineAdlibs,
		segments,
		parts,
		partInstances,
		pieces,
		pieceInstances,
		adLibPieces,
		adLibActions,
		baselineAdLibActions,
		mediaObjects,
		expectedMediaItems,
		expectedPlayoutItems,
		expectedPackages,
	}
}

/**
 * Create a snapshot of all items related to the base system (all settings),
 * that means all studios, showstyles, peripheralDevices etc
 * If studioId is provided, only return items related to that studio
 * @param studioId (Optional) Only generate for a certain studio
 */
function createSystemSnapshot(studioId: StudioId | null, organizationId: OrganizationId | null): SystemSnapshot {
	let snapshotId: SnapshotId = getRandomId()
	logger.info(`Generating System snapshot "${snapshotId}"` + (studioId ? `for studio "${studioId}"` : ''))

	const coreSystem = getCoreSystem()
	if (!coreSystem) throw new Meteor.Error(500, `coreSystem not set up`)

	if (Settings.enableUserAccounts && !organizationId)
		throw new Meteor.Error(500, 'Not able to create a systemSnaphost without organizationId')

	let queryStudio: MongoQuery<Studio> = {}
	let queryShowStyleBases: MongoQuery<ShowStyleBase> = {}
	let queryShowStyleVariants: MongoQuery<ShowStyleVariant> = {}
	let queryRundownLayouts: MongoQuery<RundownLayoutBase> = {}
	let queryDevices: MongoQuery<PeripheralDevice> = {}
	let queryBlueprints: MongoQuery<Blueprint> = {}

	if (studioId) queryStudio = { _id: studioId }
	else if (organizationId) queryStudio = { organizationId: organizationId }
	const studios = Studios.find(queryStudio).fetch()

	if (studioId) {
		let ids: ShowStyleBaseId[] = []
		_.each(studios, (studio) => {
			ids = ids.concat(studio.supportedShowStyleBase)
		})
		queryShowStyleBases = {
			_id: { $in: ids },
		}
	} else if (organizationId) {
		queryShowStyleBases = { organizationId: organizationId }
	}
	const showStyleBases = ShowStyleBases.find(queryShowStyleBases).fetch()

	const showStyleBaseIds = _.map(showStyleBases, (s) => s._id)

	queryShowStyleVariants = { showStyleBaseId: { $in: showStyleBaseIds } }
	queryRundownLayouts = { showStyleBaseId: { $in: showStyleBaseIds } }
	const showStyleVariants = ShowStyleVariants.find(queryShowStyleVariants).fetch()
	const rundownLayouts = RundownLayouts.find(queryRundownLayouts).fetch()

	if (studioId) queryDevices = { studioId: studioId }
	else if (organizationId) queryDevices = { organizationId: organizationId }
	const devices = PeripheralDevices.find(queryDevices).fetch()

	if (studioId) {
		let blueprintIds: BlueprintId[] = []
		_.each(showStyleBases, (showStyleBase) => {
			blueprintIds = blueprintIds.concat(showStyleBase.blueprintId)
		})
		queryBlueprints = {
			_id: { $in: blueprintIds },
		}
	} else if (organizationId) {
		queryBlueprints = {
			organizationId: organizationId,
		}
	}
	const blueprints = Blueprints.find(queryBlueprints).fetch()

	const deviceCommands = PeripheralDeviceCommands.find({
		deviceId: { $in: _.map(devices, (device) => device._id) },
	}).fetch()

	logger.info(`Snapshot generation done`)
	return {
		version: CURRENT_SYSTEM_VERSION,
		studioId: studioId,
		snapshot: {
			_id: snapshotId,
			organizationId: organizationId,
			type: SnapshotType.SYSTEM,
			created: getCurrentTime(),
			name: `System` + (studioId ? `_${studioId}` : '') + `_${formatDateTime(getCurrentTime())}`,
			version: CURRENT_SYSTEM_VERSION,
		},
		studios,
		showStyleBases,
		showStyleVariants,
		blueprints,
		rundownLayouts,
		devices,
		coreSystem,
		deviceCommands: deviceCommands,
	}
}

/**
 * Create a snapshot of active rundowns related to a studio and all related data, for debug purposes
 * @param studioId
 */
function createDebugSnapshot(studioId: StudioId, organizationId: OrganizationId | null): DebugSnapshot {
	let snapshotId: SnapshotId = getRandomId()
	logger.info(`Generating Debug snapshot "${snapshotId}" for studio "${studioId}"`)

	const studio = Studios.findOne(studioId)
	if (!studio) throw new Meteor.Error(404, `Studio ${studioId} not found`)

	let systemSnapshot = createSystemSnapshot(studioId, organizationId)

	let activePlaylists = RundownPlaylists.find({
		studioId: studio._id,
		activationId: { $exists: true },
	}).fetch()

	let activePlaylistSnapshots = _.map(activePlaylists, (playlist) => {
		return createRundownPlaylistSnapshot(playlist._id, organizationId)
	})

	let timeline = Timeline.find().fetch()
	let userActionLogLatest = UserActionsLog.find({
		timestamp: {
			$gt: getCurrentTime() - 1000 * 3600 * 3, // latest 3 hours
		},
	}).fetch()

	// Also fetch debugInfo from devices:
	let deviceSnaphots: Array<DeviceSnapshot> = []
	_.each(systemSnapshot.devices, (device) => {
		if (device.connected && device.subType === PeripheralDeviceAPI.SUBTYPE_PROCESS) {
			let startTime = getCurrentTime()
			let deviceSnapshot = ServerPeripheralDeviceAPI.executeFunction(device._id, 'getSnapshot')

			deviceSnaphots.push({
				deviceId: device._id,
				created: startTime,
				replyTime: getCurrentTime(),
				content: deviceSnapshot,
			})
			logger.info('Got snapshot from device "' + device._id + '"')
		}
	})

	logger.info(`Snapshot generation done`)
	return {
		version: CURRENT_SYSTEM_VERSION,
		studioId: studioId,
		snapshot: {
			_id: snapshotId,
			organizationId: organizationId,
			type: SnapshotType.DEBUG,
			created: getCurrentTime(),
			name: `Debug_${studioId}_${formatDateTime(getCurrentTime())}`,
			version: CURRENT_SYSTEM_VERSION,
		},
		system: systemSnapshot,
		activeRundownPlaylists: activePlaylistSnapshots,
		timeline: timeline,
		userActionLog: userActionLogLatest,
		deviceSnaphots: deviceSnaphots,
	}
}

// Setup endpoints:
function handleResponse(response: ServerResponse, snapshotFcn: () => { snapshot: SnapshotBase }) {
	try {
		let s: any = snapshotFcn()
		response.setHeader('Content-Type', 'application/json')
		response.setHeader(
			'Content-Disposition',
			`attachment; filename*=UTF-8''${encodeURIComponent(s.snapshot.name)}.json`
		)

		let content = _.isString(s) ? s : JSON.stringify(s, null, 4)
		response.statusCode = 200
		response.end(content)
	} catch (e) {
		response.setHeader('Content-Type', 'text/plain')
		response.statusCode = e.errorCode || 500
		response.end('Error: ' + e.toString())

		if (e.errorCode !== 404) {
			logger.error(e)
		}
	}
}
function storeSnaphot(
	snapshot: { snapshot: SnapshotBase },
	organizationId: OrganizationId | null,
	comment: string
): SnapshotId {
	let system = getCoreSystem()
	if (!system) throw new Meteor.Error(500, `CoreSystem not found!`)
	if (!system.storePath) throw new Meteor.Error(500, `CoreSystem.storePath not set!`)

	let fileName = fixValidPath(snapshot.snapshot.name) + '.json'
	let filePath = Path.join(system.storePath, fileName)

	let str = JSON.stringify(snapshot)

	// Store to the persistant file storage
	logger.info(`Save snapshot file ${filePath}`)
	if (!Meteor.isTest) {
		// If we're running in a unit-test, don't write to disk
		fsWriteFile(filePath, str)
	}

	let id = Snapshots.insert({
		_id: protectString(fileName),
		organizationId: organizationId,
		fileName: fileName,
		type: snapshot.snapshot.type,
		created: snapshot.snapshot.created,
		name: snapshot.snapshot.name,
		description: snapshot.snapshot.description,
		version: CURRENT_SYSTEM_VERSION,
		comment: comment,
	})

	return id
}
function retreiveSnapshot(snapshotId: SnapshotId, cred0: Credentials): AnySnapshot {
	let snapshot = Snapshots.findOne(snapshotId)
	if (!snapshot) throw new Meteor.Error(404, `Snapshot not found!`)

	if (Settings.enableUserAccounts) {
		if (snapshot.type === SnapshotType.RUNDOWNPLAYLIST) {
			if (!snapshot.studioId)
				throw new Meteor.Error(500, `Snapshot is of type "${snapshot.type}" but hase no studioId`)
			StudioContentWriteAccess.dataFromSnapshot(cred0, snapshot.studioId)
		} else if (snapshot.type === SnapshotType.RUNDOWN) {
			if (!snapshot.studioId)
				throw new Meteor.Error(500, `Snapshot is of type "${snapshot.type}" but hase no studioId`)
			StudioContentWriteAccess.dataFromSnapshot(cred0, snapshot.studioId)
		} else if (snapshot.type === SnapshotType.SYSTEM) {
			if (!snapshot.organizationId)
				throw new Meteor.Error(500, `Snapshot is of type "${snapshot.type}" but has no organizationId`)
			OrganizationContentWriteAccess.dataFromSnapshot(cred0, snapshot.organizationId)
		} else {
			SystemWriteAccess.coreSystem(cred0)
		}
	}

	let system = getCoreSystem()
	if (!system) throw new Meteor.Error(500, `CoreSystem not found!`)
	if (!system.storePath) throw new Meteor.Error(500, `CoreSystem.storePath not set!`)

	let filePath = Path.join(system.storePath, snapshot.fileName)

	let dataStr = !Meteor.isTest // If we're running in a unit-test, don't access files
		? fsReadFile(filePath).toString()
		: ''

	let readSnapshot = JSON.parse(dataStr)

	return readSnapshot
}
function restoreFromSnapshot(snapshot: AnySnapshot) {
	// Determine what kind of snapshot

	if (!_.isObject(snapshot)) throw new Meteor.Error(500, `Restore input data is not an object`)
	// First, some special (debugging) cases:
	// @ts-ignore is's not really a snapshot here:
	if (snapshot.externalId && snapshot.segments && snapshot.type === 'mos') {
		// Special: Not a snapshot, but a datadump of a MOS rundown
		const studio = Studios.findOne(Meteor.settings.manualSnapshotIngestStudioId || 'studio0')
		if (studio) {
			importIngestRundown(studio._id, snapshot)
			return
		}
		throw new Meteor.Error(500, `No Studio found`)
	}

	// Then, continue as if it's a normal snapshot:

	if (!snapshot.snapshot) throw new Meteor.Error(500, `Restore input data is not a snapshot (${_.keys(snapshot)})`)

	if (snapshot.snapshot.type === SnapshotType.RUNDOWN) {
		// A snapshot of a rundown (to be deprecated)
		if ((snapshot as RundownPlaylistSnapshot).playlistId) {
			// temporary check, from snapshots where the type was rundown, but it actually was a rundownPlaylist
			return restoreFromRundownPlaylistSnapshot(snapshot as RundownPlaylistSnapshot)
		} else {
			return restoreFromDeprecatedRundownSnapshot(snapshot as DeprecatedRundownSnapshot)
		}
	} else if (snapshot.snapshot.type === SnapshotType.RUNDOWNPLAYLIST) {
		// A snapshot of a rundownPlaylist
		return restoreFromRundownPlaylistSnapshot(snapshot as RundownPlaylistSnapshot)
	} else if (snapshot.snapshot.type === SnapshotType.SYSTEM) {
		// A snapshot of a system
		return restoreFromSystemSnapshot(snapshot as SystemSnapshot)
	} else {
		throw new Meteor.Error(402, `Unknown snapshot type "${snapshot.snapshot.type}"`)
	}
}

function restoreFromDeprecatedRundownSnapshot(snapshot0: DeprecatedRundownSnapshot) {
	// Convert the Rundown snaphost into a rundown playlist
	// This is somewhat of a hack, it's just to be able to import older snapshots into the system

	const snapshot = (_.clone(snapshot0) as any) as RundownPlaylistSnapshot

	// Make up a rundownPlaylist:
	snapshot.playlist = makePlaylistFromRundown_1_0_0(snapshot0.rundown)
	snapshot.playlistId = snapshot.playlist._id

	delete snapshot['rundown']
	snapshot.rundowns = [snapshot0.rundown]
	snapshot.rundowns[0]._rank = 0
	snapshot.rundowns[0].playlistId = snapshot.playlist._id

	return restoreFromRundownPlaylistSnapshot(snapshot)
}
export function restoreFromRundownPlaylistSnapshot(
	snapshot: RundownPlaylistSnapshot,
	studioId?: StudioId,
	showStyleId?: ShowStyleBaseId
) {
	logger.info(`Restoring from rundown snapshot "${snapshot.snapshot.name}"`)
	const oldPlaylistId = snapshot.playlistId

	if (!isVersionSupported(parseVersion(snapshot.version || '0.18.0'))) {
		throw new Meteor.Error(400, `Cannot restore, the snapshot comes from an older, unsupported version of Sofie`)
	}

	if (oldPlaylistId !== snapshot.playlist._id)
		throw new Meteor.Error(
			500,
			`Restore snapshot: playlistIds don\'t match, "${oldPlaylistId}", "${snapshot.playlist._id}!"`
		)

	// const dbPlaylist = RundownPlaylists.findOne(playlistId)
	// const dbRundowns = dbPlaylist ? dbPlaylist.getRundowns() : []
	// const dbRundownMap = normalizeArray(dbRundowns, '_id')

	// const unsynced = dbRundowns.reduce((p, v) => (p || v.unsynced), false)
	// if (unsynced) throw new Meteor.Error(500, `Not allowed to restore into synced Rundown!`)
	if (!studioId) {
		const studios = Studios.find().fetch()
		const snapshotStudioExists = studios.find((studio) => studio._id === snapshot.playlist.studioId)
		if (studios.length >= 1 && !snapshotStudioExists) {
			// TODO Choose better than just the first
			snapshot.playlist.studioId = studios[0]._id
		}
	} else {
		snapshot.playlist.studioId = studioId
	}

	const playlistId = (snapshot.playlist._id = getRandomId())
	snapshot.playlist.restoredFromSnapshotId = snapshot.playlistId
	delete snapshot.playlist.activationId
	snapshot.playlist.currentPartInstanceId = null
	snapshot.playlist.nextPartInstanceId = null

	snapshot.rundowns.forEach((rd) => {
		if (!rd.orphaned) {
			rd.orphaned = 'from-snapshot'
		}

		rd.playlistId = playlistId
		rd.restoredFromSnapshotId = rd._id
		delete rd.peripheralDeviceId
		rd.studioId = snapshot.playlist.studioId
		rd.notifiedCurrentPlayingPartExternalId = undefined

		const showStyleVariants = ShowStyleVariants.find().fetch()
		const snapshotShowStyleVariantExists = showStyleVariants.find(
			(variant) => variant._id === rd.showStyleVariantId && variant.showStyleBaseId === rd.showStyleBaseId
		)
		if (!showStyleId) {
			if (showStyleVariants.length >= 1 && !snapshotShowStyleVariantExists) {
				// TODO Choose better than just the first
				rd.showStyleBaseId = showStyleVariants[0].showStyleBaseId
				rd.showStyleVariantId = showStyleVariants[0]._id
			}
		} else {
			rd.showStyleBaseId = showStyleId
		}
	})

	// Migrate old data:
	// 1.12.0 Release 24:
	const partSegmentIds: { [partId: string]: SegmentId } = {}
	_.each(snapshot.parts, (part) => {
		partSegmentIds[unprotectString(part._id)] = part.segmentId
	})
	_.each(snapshot.pieces, (piece) => {
		const pieceOld = (piece as any) as Partial<Piece_1_11_0>
		if (pieceOld.rundownId) {
			piece.startRundownId = pieceOld.rundownId
			delete pieceOld.rundownId
		}
		if (pieceOld.partId) {
			piece.startPartId = pieceOld.partId
			delete pieceOld.partId
			piece.startSegmentId = partSegmentIds[unprotectString(piece.startPartId)]
		}
	})

	// List any ids that need updating on other documents
	const rundownIdMap: { [key: string]: RundownId } = {}
	const getNewRundownId = (oldRundownId: RundownId) => {
		return rundownIdMap[unprotectString(oldRundownId)]
	}
	_.each(snapshot.rundowns, (rd) => {
		const oldId = rd._id
		rundownIdMap[unprotectString(oldId)] = rd._id = getRandomId()
	})
	const partIdMap: { [key: string]: PartId } = {}
	_.each(snapshot.parts, (part) => {
		const oldId = part._id
		partIdMap[unprotectString(oldId)] = part._id = part.externalId
			? getPartId(getNewRundownId(part.rundownId), part.externalId)
			: getRandomId()
	})
	const partInstanceIdMap: { [key: string]: PartInstanceId } = {}
	_.each(snapshot.partInstances, (partInstance) => {
		const oldId = partInstance._id
		partInstanceIdMap[unprotectString(oldId)] = partInstance._id = getRandomId()
		partInstance.part._id = partIdMap[unprotectString(partInstance.part._id)] || getRandomId()
	})
	const segmentIdMap: { [key: string]: SegmentId } = {}
	_.each(snapshot.segments, (segment) => {
		const oldId = segment._id
		segmentIdMap[unprotectString(oldId)] = segment._id = getSegmentId(
			getNewRundownId(segment.rundownId),
			segment.externalId
		)
	})
	const pieceIdMap: { [key: string]: PieceId } = {}
	_.each(snapshot.pieces, (piece) => {
		const oldId = piece._id
		piece.startRundownId = rundownIdMap[unprotectString(piece.startRundownId)]
		piece.startPartId = partIdMap[unprotectString(piece.startPartId)]
		piece.startSegmentId = segmentIdMap[unprotectString(piece.startSegmentId)]
		pieceIdMap[unprotectString(oldId)] = piece._id = getRandomId()
	})
	const pieceInstanceIdMap: { [key: string]: PieceInstanceId } = {}
	_.each(snapshot.pieceInstances, (pieceInstance) => {
		const oldId = pieceInstance._id
		pieceInstanceIdMap[unprotectString(oldId)] = pieceInstance._id = getRandomId()
		pieceInstance.piece._id = pieceIdMap[unprotectString(pieceInstance.piece._id)] || getRandomId()
		if (pieceInstance.infinite) {
			pieceInstance.infinite.infinitePieceId = pieceIdMap[unprotectString(pieceInstance.infinite.infinitePieceId)]
		}
	})

	const rundownIds = snapshot.rundowns.map((r) => r._id)

	// Apply the updates of any properties to any document
	function updateItemIds<
		T extends {
			_id: ProtectedString<any>
			rundownId?: RundownId
			partId?: PartId
			segmentId?: SegmentId
			part?: T
			piece?: T
		}
	>(objs: undefined | T[], updateId: boolean): T[] {
		const updateIds = (obj: T) => {
			if (obj.rundownId) {
				obj.rundownId = rundownIdMap[unprotectString(obj.rundownId)]
			}

			if (obj.partId) {
				obj.partId = partIdMap[unprotectString(obj.partId)]
			}
			if (obj.segmentId) {
				obj.segmentId = segmentIdMap[unprotectString(obj.segmentId)]
			}

			if (updateId) {
				obj._id = getRandomId()
			}

			if (obj.part) {
				updateIds(obj.part)
			}
			if (obj.piece) {
				updateIds(obj.piece)
			}

			return obj
		}
		return (objs || []).map((obj) => updateIds(obj))
	}

	saveIntoDb(RundownPlaylists, { _id: playlistId }, [snapshot.playlist])
	saveIntoDb(Rundowns, { playlistId }, snapshot.rundowns)
	saveIntoDb(IngestDataCache, { rundownId: { $in: rundownIds } }, updateItemIds(snapshot.ingestData, true))
	// saveIntoDb(UserActionsLog, {}, snapshot.userActions)
	saveIntoDb(RundownBaselineObjs, { rundownId: { $in: rundownIds } }, updateItemIds(snapshot.baselineObjs, true))
	saveIntoDb(
		RundownBaselineAdLibPieces,
		{ rundownId: { $in: rundownIds } },
		updateItemIds(snapshot.baselineAdlibs, true)
	)
	saveIntoDb(
		RundownBaselineAdLibActions,
		{ rundownId: { $in: rundownIds } },
		updateItemIds(snapshot.baselineAdLibActions, true)
	)
	saveIntoDb(Segments, { rundownId: { $in: rundownIds } }, updateItemIds(snapshot.segments, false))
	saveIntoDb(Parts, { rundownId: { $in: rundownIds } }, updateItemIds(snapshot.parts, false))
	saveIntoDb(PartInstances, { rundownId: { $in: rundownIds } }, snapshot.partInstances)
	saveIntoDb(Pieces, { rundownId: { $in: rundownIds } }, updateItemIds(snapshot.pieces, false))
	saveIntoDb(PieceInstances, { rundownId: { $in: rundownIds } }, snapshot.pieceInstances)
	saveIntoDb(AdLibPieces, { rundownId: { $in: rundownIds } }, updateItemIds(snapshot.adLibPieces, true))
	saveIntoDb(AdLibActions, { rundownId: { $in: rundownIds } }, updateItemIds(snapshot.adLibActions, true))
	saveIntoDb(
		MediaObjects,
		{ _id: { $in: _.map(snapshot.mediaObjects, (mediaObject) => mediaObject._id) } },
		snapshot.mediaObjects
	)
	saveIntoDb(
		ExpectedMediaItems,
		{ partId: { $in: protectStringArray(_.keys(partIdMap)) } },
		updateItemIds(snapshot.expectedMediaItems, true)
	)
	saveIntoDb(
		ExpectedPlayoutItems,
		{ rundownId: { $in: rundownIds } },
		updateItemIds(snapshot.expectedPlayoutItems || [], true)
	)
	saveIntoDb(
		ExpectedPackages,
		{ rundownId: { $in: rundownIds } },
		updateItemIds(snapshot.expectedPackages || [], true)
	)

	logger.info(`Restore done`)
}
function restoreFromSystemSnapshot(snapshot: SystemSnapshot) {
	logger.info(`Restoring from system snapshot "${snapshot.snapshot.name}"`)
	let studioId = snapshot.studioId

	if (!isVersionSupported(parseVersion(snapshot.version || '0.18.0'))) {
		throw new Meteor.Error(400, `Cannot restore, the snapshot comes from an older, unsupported version of Sofie`)
	}
	// Migrate data changes:
	snapshot.studios = _.map(snapshot.studios, (studio) => {
		if (!studio.routeSets) studio.routeSets = {}
		return migrateConfigToBlueprintConfigOnObject(studio)
	})
	snapshot.showStyleBases = _.map(snapshot.showStyleBases, (showStyleBase) => {
		// delete showStyleBase.runtimeArguments // todo: add this?
		return migrateConfigToBlueprintConfigOnObject(showStyleBase)
	})
	snapshot.showStyleVariants = _.map(snapshot.showStyleVariants, (showStyleVariant) => {
		return migrateConfigToBlueprintConfigOnObject(showStyleVariant)
	})

	let changes = sumChanges(
		saveIntoDb(Studios, studioId ? { _id: studioId } : {}, snapshot.studios),
		saveIntoDb(ShowStyleBases, {}, snapshot.showStyleBases),
		saveIntoDb(ShowStyleVariants, {}, snapshot.showStyleVariants),
		snapshot.blueprints ? saveIntoDb(Blueprints, {}, snapshot.blueprints) : null,
		snapshot.rundownLayouts ? saveIntoDb(RundownLayouts, {}, snapshot.rundownLayouts) : null,
		saveIntoDb(PeripheralDevices, studioId ? { studioId: studioId } : {}, snapshot.devices),
		saveIntoDb(CoreSystem, {}, [snapshot.coreSystem])
	)
	// saveIntoDb(PeripheralDeviceCommands, {}, snapshot.deviceCommands) // ignored

	logger.info(
		`Restore done (added ${changes.added}, updated ${changes.updated}, removed ${changes.removed} documents)`
	)
}
/** Take and store a system snapshot */
export function storeSystemSnapshot(context: MethodContext, studioId: StudioId | null, reason: string) {
	if (!_.isNull(studioId)) check(studioId, String)
	const { organizationId, cred } = OrganizationContentWriteAccess.snapshot(context)
	if (Settings.enableUserAccounts && isResolvedCredentials(cred)) {
		if (cred.user && !cred.user.superAdmin) throw new Meteor.Error(401, 'Only Super Admins can store Snapshots')
	}
	return internalStoreSystemSnapshot(organizationId, studioId, reason)
}
/** Take and store a system snapshot. For internal use only, performs no access control. */
export function internalStoreSystemSnapshot(
	organizationId: OrganizationId | null,
	studioId: StudioId | null,
	reason: string
) {
	if (!_.isNull(studioId)) check(studioId, String)

	let s = createSystemSnapshot(studioId, organizationId)
	return storeSnaphot(s, organizationId, reason)
}
export function storeRundownPlaylistSnapshot(context: MethodContext, playlistId: RundownPlaylistId, reason: string) {
	check(playlistId, String)
	const { organizationId } = OrganizationContentWriteAccess.snapshot(context)
	let s = createRundownPlaylistSnapshot(playlistId, organizationId)
	return storeSnaphot(s, organizationId, reason)
}
export function storeDebugSnapshot(context: MethodContext, studioId: StudioId, reason: string) {
	check(studioId, String)
	const { organizationId, cred } = OrganizationContentWriteAccess.snapshot(context)
	if (Settings.enableUserAccounts && isResolvedCredentials(cred)) {
		if (cred.user && !cred.user.superAdmin) throw new Meteor.Error(401, 'Only Super Admins can store Snapshots')
	}
	let s = createDebugSnapshot(studioId, organizationId)
	return storeSnaphot(s, organizationId, reason)
}
export function restoreSnapshot(context: MethodContext, snapshotId: SnapshotId) {
	check(snapshotId, String)
	const { cred } = OrganizationContentWriteAccess.snapshot(context)
	if (Settings.enableUserAccounts && isResolvedCredentials(cred)) {
		if (cred.user && !cred.user.superAdmin) throw new Meteor.Error(401, 'Only Super Admins can store Snapshots')
	}
	let snapshot = retreiveSnapshot(snapshotId, context)
	return restoreFromSnapshot(snapshot)
}
export function removeSnapshot(context: MethodContext, snapshotId: SnapshotId) {
	check(snapshotId, String)
	const { snapshot, cred } = OrganizationContentWriteAccess.snapshot(context, snapshotId)
	if (Settings.enableUserAccounts && isResolvedCredentials(cred)) {
		if (cred.user && !cred.user.superAdmin) throw new Meteor.Error(401, 'Only Super Admins can store Snapshots')
	}
	logger.info(`Removing snapshot ${snapshotId}`)

	if (!snapshot) throw new Meteor.Error(404, `Snapshot "${snapshotId}" not found!`)

	if (snapshot.fileName) {
		// remove from disk
		let system = getCoreSystem()
		if (!system) throw new Meteor.Error(500, `CoreSystem not found!`)
		if (!system.storePath) throw new Meteor.Error(500, `CoreSystem.storePath not set!`)

		let filePath = Path.join(system.storePath, snapshot.fileName)
		try {
			logger.info(`Removing snapshot file ${filePath}`)

			if (!Meteor.isTest) {
				// If we're running in a unit-test, don't access files
				fsUnlinkFile(filePath)
			}
		} catch (e) {
			// Log the error, but continue
			logger.error('Error in removeSnapshot')
			logger.error(e)
		}
	}
	Snapshots.remove(snapshot._id)
}
if (!Settings.enableUserAccounts) {
	// For backwards compatibility:

	PickerGET.route('/snapshot/system/:studioId', (params, req: IncomingMessage, response: ServerResponse) => {
		return handleResponse(response, () => {
			check(params.studioId, Match.Optional(String))

			const cred0: Credentials = { userId: null, token: params.token }
			const { organizationId, cred } = OrganizationContentWriteAccess.snapshot(cred0)
			StudioReadAccess.studio({ _id: protectString(params.studioId) }, cred)

			return createSystemSnapshot(protectString(params.studioId), organizationId)
		})
	})
	PickerGET.route('/snapshot/rundown/:playlistId', (params, req: IncomingMessage, response: ServerResponse) => {
		return handleResponse(response, () => {
			check(params.playlistId, String)

			const cred0: Credentials = { userId: null, token: params.token }
			const { organizationId, cred } = OrganizationContentWriteAccess.snapshot(cred0)
			const playlist = RundownPlaylists.findOne(protectString(params.playlistId))
			if (!playlist) throw new Meteor.Error(404, `RundownPlaylist "${params.playlistId}" not found`)
			StudioReadAccess.studioContent({ studioId: playlist.studioId }, cred)

			return createRundownPlaylistSnapshot(playlist._id, organizationId)
		})
	})
	PickerGET.route('/snapshot/debug/:studioId', (params, req: IncomingMessage, response: ServerResponse) => {
		return handleResponse(response, () => {
			check(params.studioId, String)

			const cred0: Credentials = { userId: null, token: params.token }
			const { organizationId, cred } = OrganizationContentWriteAccess.snapshot(cred0)
			StudioReadAccess.studio({ _id: protectString(params.studioId) }, cred)

			return createDebugSnapshot(protectString(params.studioId), organizationId)
		})
	})
}
PickerPOST.route('/snapshot/restore', (params, req: IncomingMessage, response: ServerResponse) => {
	let content = 'ok'
	try {
		response.setHeader('Content-Type', 'text/plain')
		let snapshot = req.body as any
		if (!snapshot) throw new Meteor.Error(400, 'Restore Snapshot: Missing request body')

		if (typeof snapshot !== 'object') {
			// sometimes, the browser can send the JSON with wrong mimetype, resulting in it not being parsed
			snapshot = JSON.parse(snapshot)
		}

		restoreFromSnapshot(snapshot)

		response.statusCode = 200
		response.end(content)
	} catch (e) {
		response.setHeader('Content-Type', 'text/plain')
		response.statusCode = e.errorCode || 500
		response.end('Error: ' + e.toString())

		if (e.errorCode !== 404) {
			logger.error(e)
		}
	}
})
if (!Settings.enableUserAccounts) {
	// For backwards compatibility:

	// Retrieve snapshot:
	PickerGET.route('/snapshot/retrieve/:snapshotId', (params, req: IncomingMessage, response: ServerResponse) => {
		return handleResponse(response, () => {
			check(params.snapshotId, String)
			return retreiveSnapshot(protectString(params.snapshotId), { userId: null })
		})
	})
}
// Retrieve snapshot:
PickerGET.route('/snapshot/:token/retrieve/:snapshotId', (params, req: IncomingMessage, response: ServerResponse) => {
	return handleResponse(response, () => {
		check(params.snapshotId, String)
		return retreiveSnapshot(protectString(params.snapshotId), { userId: null, token: params.token })
	})
})

class ServerSnapshotAPI extends MethodContextAPI implements NewSnapshotAPI {
	storeSystemSnapshot(studioId: StudioId | null, reason: string) {
		return makePromise(() => storeSystemSnapshot(this, studioId, reason))
	}
	storeRundownPlaylist(playlistId: RundownPlaylistId, reason: string) {
		return makePromise(() => storeRundownPlaylistSnapshot(this, playlistId, reason))
	}
	storeDebugSnapshot(studioId: StudioId, reason: string) {
		return makePromise(() => storeDebugSnapshot(this, studioId, reason))
	}
	restoreSnapshot(snapshotId: SnapshotId) {
		return makePromise(() => restoreSnapshot(this, snapshotId))
	}
	removeSnapshot(snapshotId: SnapshotId) {
		return makePromise(() => removeSnapshot(this, snapshotId))
	}
}
registerClassToMeteorMethods(SnapshotAPIMethods, ServerSnapshotAPI, false)
