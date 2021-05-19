export interface DeviceConfigManifest {
	deviceConfig: ConfigManifestEntry[]
	deviceOAuthFlow?: DeviceOAuthFlow
	layerMappings?: MappingsManifest
}

export interface SubDeviceConfigManifest {
	defaultType: string
	config: {
		[type: string]: SubDeviceConfigManifestEntry[] | ConfigManifestEntry[]
	}
}

export interface DeviceOAuthFlow {
	credentialsHelp: string
	credentialsURL: string
}

export enum ConfigManifestEntryType {
	LABEL = 'label',
	LINK = 'link',
	STRING = 'string',
	MULTILINE_STRING = 'multiline_string',
	BOOLEAN = 'boolean',
	/** @deprecated use INT/FLOAT instead */
	NUMBER = 'float',
	FLOAT = 'float',
	INT = 'int',
	TABLE = 'table',
	OBJECT = 'object',
	ENUM = 'enum', // @todo: implement
}

export type ConfigManifestEntry =
	| ConfigManifestEntryBase
	| ConfigManifestEnumEntry
	| TableConfigManifestEntry
	| ConfigManifestIntEntry
	| ConfigManifestFloatEntry
	| SubDeviceConfigManifestEntry
export interface ConfigManifestEntryBase {
	id: string
	name: string
	type: ConfigManifestEntryType
	values?: any // for enum
	placeholder?: string
	hint?: string
}
export interface ConfigManifestEntryDefault extends ConfigManifestEntryBase {
	type: Exclude<
		ConfigManifestEntryType,
		ConfigManifestEntryType.ENUM | ConfigManifestEntryType.INT | ConfigManifestEntryType.FLOAT
	>
}
export interface ConfigManifestIntEntry extends ConfigManifestEntryBase {
	type: ConfigManifestEntryType.INT
	/** Zero-based values will be stored in the database (and reported to blueprints) as values starting from 0, however,
	 * 	when rendered in settings pages they will appear as value + 1
	 */
	zeroBased?: boolean
}
export interface ConfigManifestFloatEntry extends ConfigManifestEntryBase {
	type: ConfigManifestEntryType.FLOAT
}
export interface ConfigManifestEnumEntry extends ConfigManifestEntryBase {
	type: ConfigManifestEntryType.ENUM
	values: any // for enum
}
export interface SubDeviceConfigManifestEntry extends ConfigManifestEntryBase {
	columnName?: string
	columnEditable?: boolean
	defaultVal?: any // TODO - is this wanted?
}

export interface TableConfigManifestEntry extends ConfigManifestEntryBase {
	/** Whether this follows the deviceId logic for updating */
	isSubDevices?: boolean
	subDeviceDefaultName?: string
	defaultType?: string
	type: ConfigManifestEntryType.TABLE
	deviceTypesMapping?: any
	typeField?: string
	/** Only one type means that the option will not be present */
	config: { [type: string]: ConfigManifestEntry[] }
}

export type MappingsManifest = Record<string, MappingManifestEntry[]>

export interface MappingManifestEntryProps {
	optional?: boolean
	includeInSummary?: boolean
}

export type MappingManifestEntry = MappingManifestEntryProps &
	(ConfigManifestEntryDefault | ConfigManifestEnumEntry | ConfigManifestIntEntry | ConfigManifestFloatEntry)
