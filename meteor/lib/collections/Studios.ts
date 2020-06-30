import { TransformedCollection } from '../typings/meteor'
import { applyClassToDocument, registerCollection, ProtectedString } from '../lib'
import * as _ from 'underscore'
import { IConfigItem, BlueprintMappings, BlueprintMapping, TSR } from 'tv-automation-sofie-blueprints-integration'
import { Meteor } from 'meteor/meteor'
import { ObserveChangesForHash, createMongoCollection } from './lib'
import { BlueprintId } from './Blueprints'
import { ShowStyleBase, ShowStyleBaseId } from './ShowStyleBases'

export interface MappingsExt extends BlueprintMappings {
	[layerName: string]: MappingExt
}
export interface MappingExt extends BlueprintMapping {
	/** Internal mappings are hidden in the UI */
	internal?: boolean
}

export interface IStudioSettings {
	/** URL to endpoint where media preview are exposed */
	mediaPreviewsUrl: string // (former media_previews_url in config)
	/** URL to Sofie Core endpoint */
	sofieUrl: string // (former sofie_url in config)
	/** URLs for slack webhook to send evaluations */
	slackEvaluationUrls?: string // (former slack_evaluation in config)

	/** Media Resolutions supported by the studio for media playback */
	supportedMediaFormats?: string // (former mediaResolutions in config)
	/** Audio Stream Formats supported by the studio for media playback */
	supportedAudioStreams?: string // (former audioStreams in config)

	/** Should the play from anywhere feature be enabled in this studio */
	enablePlayFromAnywhere?: boolean
}
/** A string, identifying a Studio */
export type StudioId = ProtectedString<'StudioId'>

/** A set of available layer groups in a given installation */
export interface DBStudio {
	_id: StudioId
	/** User-presentable name for the studio installation */
	name: string
	/** Id of the blueprint used by this studio-installation */
	blueprintId?: BlueprintId

	/** Mappings between the physical devices / outputs and logical ones */
	mappings: MappingsExt

	/** List of which ShowStyleBases this studio wants to support */
	supportedShowStyleBase: Array<ShowStyleBaseId>

	/** Config values are used by the Blueprints */
	config: Array<IConfigItem>
	testToolsConfig?: ITestToolsConfig

	settings: IStudioSettings

	_rundownVersionHash: string
}

export interface ITestToolsConfig {
	recordings: {
		deviceId?: string
		channelIndex?: number
		channelFormat: TSR.ChannelFormat
		decklinkDevice?: number
		filePrefix?: string
		urlPrefix?: string
	}
}

export class Studio implements DBStudio {
	public _id: StudioId
	public name: string
	public blueprintId?: BlueprintId
	public mappings: MappingsExt
	public supportedShowStyleBase: Array<ShowStyleBaseId>
	public config: Array<IConfigItem> // TODO - migration to rename
	public settings: IStudioSettings
	public testToolsConfig?: ITestToolsConfig

	public _rundownVersionHash: string

	constructor(document: DBStudio) {
		_.each(_.keys(document), (key) => {
			this[key] = document[key]
		})
	}
}

export const Studios: TransformedCollection<Studio, DBStudio> = createMongoCollection<Studio>('studios', {
	transform: (doc) => applyClassToDocument(Studio, doc),
})
registerCollection('Studios', Studios)

Meteor.startup(() => {
	if (Meteor.isServer) {
		ObserveChangesForHash(Studios, '_rundownVersionHash', ['config'])
	}
})
