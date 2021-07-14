import { createMongoCollection } from '../../../lib/collections/lib'
import { ProtectedString } from '../../../lib/lib'

// lib/collections/ShowStyles.ts
export interface TemplateMappings {
	[key: string]: string
}
export type ShowStyleId = ProtectedString<'ShowStyleBaseId'>
export interface ShowStyle {
	_id: ShowStyleId
	name: string
	/** Map a template name to a runtime function? */
	templateMappings: TemplateMappings | never[]
	/** The name of the template to be run for the baseline state when the rundown is activated */
	baselineTemplate: string
	/** The name of the template to be run to generate external messages upon TAKEs */
	messageTemplate: string
	/** The name of the blueprint which is used to determine which other blueprint is used to create the part&piece for a story */
	routerBlueprint: string
	/** The name of the blueprint which is the post-process step to run on a segment after any part has changed */
	postProcessBlueprint: string
}
export const ShowStyles = createMongoCollection<ShowStyle, ShowStyle>('showStyles')
