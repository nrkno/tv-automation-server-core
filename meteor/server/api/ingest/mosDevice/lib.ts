import * as _ from 'underscore'
import * as MOS from 'mos-connection'
import { Studio } from '../../../../lib/collections/Studios'
import { Meteor } from 'meteor/meteor'
import { getRundownId, getPartId } from '../lib'
import { IngestPart } from '@sofie-automation/blueprints-integration'
import { RundownId, Rundowns } from '../../../../lib/collections/Rundowns'
import { getCurrentTime } from '../../../../lib/lib'

export function getRundownIdFromMosRO(studio: Studio, runningOrderMosId: MOS.MosString128) {
	if (!runningOrderMosId) throw new Meteor.Error(401, 'parameter runningOrderMosId missing!')
	return getRundownId(studio, parseMosString(runningOrderMosId))
}

export function getRundownFromMosRO(studio: Studio, runningOrderMosId: MOS.MosString128) {
	const rundownId = getRundownIdFromMosRO(studio, runningOrderMosId)
	const rundownExternalId = parseMosString(runningOrderMosId)

	const rundown = Rundowns.findOne(rundownId)
	if (!rundown) throw new Meteor.Error(404, `Rundown "${rundownId}" ("${rundownExternalId}") not found`)
	if (getCurrentTime() - rundown.modified > 3600 * 1000) {
		const m = getCurrentTime()
		rundown.modified = m
		Meteor.defer(() => {
			Rundowns.update(rundownId, { $set: { modified: m } })
		})
	}

	return rundown
}

export function getPartIdFromMosStory(rundownId: RundownId, partMosId: MOS.MosString128) {
	if (!partMosId) throw new Meteor.Error(401, 'parameter partMosId missing!')
	return getPartId(rundownId, parseMosString(partMosId))
}

export function getSegmentExternalId(rundownId: RundownId, ingestPart: IngestPart) {
	return `${rundownId}_${ingestPart.name.split(';')[0]}_${ingestPart.externalId}`
}

export function fixIllegalObject(o: any) {
	if (_.isArray(o)) {
		_.each(o, (val, _key) => {
			fixIllegalObject(val)
		})
	} else if (_.isObject(o)) {
		_.each(_.keys(o), (key: string) => {
			const val = o[key]
			if ((key + '').match(/^\$/)) {
				const newKey = key.replace(/^\$/, '@')
				o[newKey] = val
				delete o[key]
				key = newKey
			}
			fixIllegalObject(val)
		})
	}
}

export function parseMosString(str: MOS.MosString128): string {
	if (!str) throw new Meteor.Error(401, 'parseMosString: str parameter missing!')
	return str['_str'] || str.toString()
}
