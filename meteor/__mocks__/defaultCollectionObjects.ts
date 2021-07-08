import { DBStudio, StudioId } from '../lib/collections/Studios'
import { getCurrentTime, unprotectString } from '../lib/lib'
import { DBRundownPlaylist, RundownPlaylistId } from '../lib/collections/RundownPlaylists'
import { PeripheralDeviceId } from '../lib/collections/PeripheralDevices'
import { ShowStyleBaseId } from '../lib/collections/ShowStyleBases'
import { ShowStyleVariantId } from '../lib/collections/ShowStyleVariants'
import { DBRundown, RundownId } from '../lib/collections/Rundowns'
import { DBSegment, SegmentId } from '../lib/collections/Segments'
import { PartId, DBPart } from '../lib/collections/Parts'
import { RundownAPI } from '../lib/api/rundown'
import { PieceLifespan, PlaylistTimingType } from '@sofie-automation/blueprints-integration'
import { PieceId, Piece } from '../lib/collections/Pieces'
import { AdLibPiece } from '../lib/collections/AdLibPieces'
import { getRundownId } from '../server/api/ingest/lib'

export function defaultRundownPlaylist(_id: RundownPlaylistId, studioId: StudioId): DBRundownPlaylist {
	return {
		_id: _id,

		externalId: 'MOCK_RUNDOWNPLAYLIST',
		organizationId: null,
		studioId: studioId,

		name: 'Default RundownPlaylist',
		created: getCurrentTime(),
		modified: getCurrentTime(),

		// activationId: undefined,
		rehearsal: false,
		currentPartInstanceId: null,
		nextPartInstanceId: null,
		previousPartInstanceId: null,
		timing: {
			type: PlaylistTimingType.None,
		},
	}
}
export function defaultRundown(
	externalId: string,
	studioId: StudioId,
	ingestDeviceId: PeripheralDeviceId,
	playlistId: RundownPlaylistId,
	showStyleBaseId: ShowStyleBaseId,
	showStyleVariantId: ShowStyleVariantId
): DBRundown {
	return {
		peripheralDeviceId: ingestDeviceId,
		studioId: studioId,
		showStyleBaseId: showStyleBaseId,
		showStyleVariantId: showStyleVariantId,

		organizationId: null,

		playlistId: playlistId,
		_rank: 0,

		_id: getRundownId(studioId, externalId),
		externalId: externalId,
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
		timing: {
			type: PlaylistTimingType.None,
		},
	}
}

export function defaultStudio(_id: StudioId): DBStudio {
	return {
		_id: _id,

		name: 'mockStudio',
		organizationId: null,
		mappings: {},
		supportedShowStyleBase: [],
		blueprintConfig: {},
		settings: {
			mediaPreviewsUrl: '',
			sofieUrl: '',
		},
		_rundownVersionHash: '',
		routeSets: {},
		routeSetExclusivityGroups: {},
		packageContainers: {},
		previewContainerIds: [],
		thumbnailContainerIds: [],
	}
}

export function defaultSegment(_id: SegmentId, rundownId: RundownId): DBSegment {
	return {
		_id: _id,
		_rank: 0,
		externalId: unprotectString(_id),
		rundownId: rundownId,
		name: 'Default Segment',
		externalModified: 1,
	}
}

export function defaultPart(_id: PartId, rundownId: RundownId, segmentId: SegmentId): DBPart {
	return {
		_id: _id,
		rundownId: rundownId,
		segmentId: segmentId,
		_rank: 0,
		externalId: unprotectString(_id),
		title: 'Default Part',
	}
}
export function defaultPiece(_id: PieceId, rundownId: RundownId, segmentId: SegmentId, partId: PartId): Piece {
	return {
		_id: _id,
		externalId: 'MOCK_PIECE',
		startRundownId: rundownId,
		startSegmentId: segmentId,
		startPartId: partId,
		name: 'Default Piece',
		status: RundownAPI.PieceStatusCode.OK,
		lifespan: PieceLifespan.WithinPart,
		invalid: false,
		enable: {
			start: 0,
		},
		sourceLayerId: '',
		outputLayerId: '',
		content: { timelineObjects: [] },
	}
}
export function defaultAdLibPiece(_id: PieceId, rundownId: RundownId, partId: PartId): AdLibPiece {
	return {
		_id: _id,
		externalId: 'MOCK_ADLIB',
		rundownId: rundownId,
		partId: partId,
		_rank: 0,
		name: 'Default Adlib',
		status: RundownAPI.PieceStatusCode.OK,
		lifespan: PieceLifespan.WithinPart,
		sourceLayerId: '',
		outputLayerId: '',
		content: { timelineObjects: [] },
	}
}
