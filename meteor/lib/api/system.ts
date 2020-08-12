export interface RundownPlaylistValidateBlueprintConfigResult {
	studio: string[]
	showStyles: Array<{
		id: string
		name: string
		checkFailed: boolean
		fields: string[]
	}>
}

export interface SystemAPI {
	doSystemBenchmark(): Promise<any>
}

export enum SystemAPIMethods {
	'doSystemBenchmark' = 'system.doSystemBenchmark',
}
