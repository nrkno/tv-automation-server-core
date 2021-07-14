import { registerCollection, ProtectedString } from '../lib'
import { createMongoCollection } from './lib'
import { StudioId } from './Studios'
import { registerIndex } from '../database'
import { PackageInfo } from '@sofie-automation/blueprints-integration'

/** A string, identifying a MediaObj */
export type MediaObjId = ProtectedString<'MediaObjId'>

export interface MediaObject0 {
	_id: MediaObjId
	/** Media object file path relative to playout server */
	mediaPath: string
	/** Media object size in bytes */
	mediaSize: number
	/** Timestamp when the media object was last updated */
	mediaTime: number
	/** Info about media content. If undefined: inficates that the media is NOT playable (could be transferring, or a placeholder)  */
	mediainfo?: MediaInfo

	/** Thumbnail file size in bytes */
	thumbSize: number
	/** Thumbnail last updated timestamp */
	thumbTime: number

	/** Preview file size in bytes */
	previewSize?: number
	/** Thumbnail last updated timestamp */
	previewTime?: number
	/** Preview location */
	previewPath?: string

	cinf: string // useless to us
	tinf: string // useless to us

	_attachments: {
		[key: string]: MediaAttachment // add more here
	}
	_rev: string
}

export interface MediaObject extends MediaObject0 {
	/** The studio this Mediaobject resides in */
	studioId: StudioId
	/** the Id of the MediaObject database this object has been imported from - essentially CasparCG Device Id this file is on */
	collectionId: string // Note: To be renamed to storageId
	/** the Id in the MediaObject in the source database */
	objId: string
	/** The playable reference (CasparCG clip name, quantel GUID, etc) */
	mediaId: string
}

export interface MediaStream {
	codec: MediaStreamCodec

	// video
	width?: number
	height?: number
	sample_aspect_ratio?: string
	display_aspect_ratio?: string
	pix_fmt?: string
	bits_per_raw_sample?: string

	// audio
	sample_fmt?: string
	sample_rate?: string
	channels?: number
	channel_layout?: string
	bits_per_sample?: number

	// common
	time_base?: string
	start_time?: string
	duration_ts?: number
	duration?: string

	bit_rate?: string
	max_bit_rate?: string
	nb_frames?: string
}

export interface MediaFormat {
	name?: string
	long_name?: string
	start_time?: number
	duration?: number
	bit_rate?: string
	max_bit_rate?: number
}

export interface Metadata {
	scenes?: Array<number>
	blacks?: Array<PackageInfo.Anomaly>
	freezes?: Array<PackageInfo.Anomaly>
}

export interface MediaInfo extends Metadata {
	name: string
	field_order?: PackageInfo.FieldOrder
	streams?: MediaStream[]
	format?: MediaFormat
	timebase?: number
}

export interface MediaAttachment {
	digest: string
	content_type: string
	revpos: number
	data?: string // base64
}

export enum MediaStreamType {
	Audio = 'audio',
	Video = 'video',
}

export interface MediaStreamCodec {
	type?: MediaStreamType
	long_name?: string
	time_base?: string
	tag_string?: string
	is_avc?: string
}

export const MediaObjects = createMongoCollection<MediaObject, MediaObject>('mediaObjects')
registerCollection('MediaObjects', MediaObjects)
registerIndex(MediaObjects, {
	studioId: 1,
	collectionId: 1,
	objId: 1,
	mediaId: 1,
})
registerIndex(MediaObjects, {
	studioId: 1,
	mediaId: 1,
})
