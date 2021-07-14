import { TSR } from '@sofie-automation/blueprints-integration'
import { StudioId, MappingsExt, IStudioSettings } from '../../../lib/collections/Studios'
import { ShowStyleBaseId } from '../../../lib/collections/ShowStyleBases'
import { BlueprintId } from '../../../lib/collections/Blueprints'

export interface IConfigItem {
	_id: string
	value: any
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

export interface Studio {
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
