import { Meteor } from 'meteor/meteor'
import { Timeline, getRoutedTimeline, TimelineComplete } from '../../lib/collections/Timeline'
import { meteorPublish } from './lib'
import { PubSub } from '../../lib/api/pubsub'
import { FindOptions } from '../../lib/typings/meteor'
import { meteorCustomPublishArray } from '../lib/customPublication'
import { setUpOptimizedObserver } from '../lib/optimizedObserver'
import { PeripheralDeviceId, PeripheralDevices } from '../../lib/collections/PeripheralDevices'
import { Studios, getActiveRoutes, StudioId } from '../../lib/collections/Studios'
import { PeripheralDeviceReadAccess } from '../security/peripheralDevice'
import { StudioReadAccess } from '../security/studio'

meteorPublish(PubSub.timeline, function (selector, token) {
	if (!selector) throw new Meteor.Error(400, 'selector argument missing')
	const modifier: FindOptions<TimelineComplete> = {
		fields: {},
	}
	if (StudioReadAccess.studioContent(selector, { userId: this.userId, token })) {
		return Timeline.find(selector, modifier)
	}
	return null
})

meteorCustomPublishArray(
	PubSub.timelineForDevice,
	'studioTimeline',
	function (pub, deviceId: PeripheralDeviceId, token) {
		if (
			PeripheralDeviceReadAccess.peripheralDeviceContent({ deviceId: deviceId }, { userId: this.userId, token })
		) {
			const peripheralDevice = PeripheralDevices.findOne(deviceId)

			if (!peripheralDevice) throw new Meteor.Error('PeripheralDevice "' + deviceId + '" not found')

			const studioId = peripheralDevice.studioId
			if (!studioId) return []

			const observer = setUpOptimizedObserver(
				`pub_${PubSub.timelineForDevice}_${studioId}`,
				(triggerUpdate) => {
					// Set up observers:
					return [
						Studios.find(studioId, {
							fields: {
								// It should be enough to watch the mappingsHash, since that should change whenever there is a
								// change to the mappings or the routes
								mappingsHash: 1,
							},
						}).observe({
							added: () => triggerUpdate({ studioId: studioId }),
							changed: () => triggerUpdate({ studioId: studioId }),
							removed: () => triggerUpdate({ studioId: null }),
						}),
						Timeline.find({
							_id: studioId,
						}).observe({
							added: (timeline) => triggerUpdate({ timeline: timeline }),
							changed: (timeline) => triggerUpdate({ timeline: timeline }),
							removed: () => triggerUpdate({ timeline: null }),
						}),
					]
				},
				() => {
					// Initial data fetch
					return {
						timeline: Timeline.findOne({
							_id: studioId,
						}),
						studioId: studioId,
					}
				},
				(newData: { studioId: StudioId | undefined; timeline: TimelineComplete | undefined }) => {
					// Prepare data for publication:

					if (!newData.studioId || !newData.timeline) {
						return []
					} else {
						const studio = Studios.findOne(newData.studioId)
						if (!studio) return []

						const routes = getActiveRoutes(studio)
						const routedTimeline = getRoutedTimeline(newData.timeline.timeline, routes)

						return [
							{
								_id: newData.timeline._id,
								mappingsHash: studio.mappingsHash,
								timelineHash: newData.timeline.timelineHash,
								timeline: routedTimeline,
							},
						]
					}
				},
				(newData) => {
					pub.updatedDocs(newData)
				}
			)
			pub.onStop(() => {
				observer.stop()
			})
		}
	}
)
