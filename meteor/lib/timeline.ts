import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'
import { TimelineObjGeneric, TimelineObjGroup } from './collections/Timeline'
import { TimelineObject } from 'superfly-timeline'
import { clone } from './lib'
import { logger } from './logging'

// This is a collection of functions that match what the playout-gateway / TSR does
// playout-gateway:
export function transformTimeline(timeline: Array<TimelineObjGeneric>): Array<TimelineContentObject> {
	const transformObject = (obj: TimelineObjGeneric | TimelineObjGroup): TimelineContentObject => {
		if (!obj.id) throw new Meteor.Error(500, `Timeline object missing id attribute ${JSON.stringify(obj)} `)

		const transformedObj: TimelineContentObject = clone(_.omit(obj, ['_id', 'studioId']))
		transformedObj.id = obj.id

		if (!transformedObj.content) transformedObj.content = {}
		if (transformedObj.isGroup) {
			if (!transformedObj.content.objects) transformedObj.content.objects = []
		}

		return transformedObj
	}

	// First, transform and convert timeline to a key-value store, for fast referencing:
	const objects: { [id: string]: TimelineContentObject } = {}
	_.each(timeline, (obj: TimelineObjGeneric) => {
		const transformedObj = transformObject(obj)
		objects[transformedObj.id] = transformedObj
	})

	// Go through all objects:
	const transformedTimeline: Array<TimelineContentObject> = []
	_.each(objects, (obj: TimelineContentObject) => {
		if (obj.inGroup) {
			const groupObj = objects[obj.inGroup]
			if (groupObj) {
				// Add object into group:
				if (!groupObj.children) groupObj.children = []
				if (groupObj.children) {
					delete obj.inGroup
					groupObj.children.push(obj)
				}
			} else {
				// referenced group not found
				logger.warn('Referenced group "' + obj.inGroup + '" not found! Referenced by "' + obj.id + '"')
				transformedTimeline.push(obj)
			}
		} else {
			// Add object to timeline
			delete obj.inGroup
			transformedTimeline.push(obj)
		}
	})
	return transformedTimeline
}

// TSR: ---------
export interface TimelineContentObject extends TimelineObject {
	inGroup?: string
}
