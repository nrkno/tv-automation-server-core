import { PeripheralDevices, PeripheralDevice } from '../lib/collections/PeripheralDevices'
import { getCurrentTime } from '../lib/lib'
import { Meteor } from 'meteor/meteor'

Meteor.onConnection((conn: Meteor.Connection) => {
	const connectionId = conn.id
	// var clientAddress = conn.clientAddress; // ip-adress

	conn.onClose(() => {
		// called when a connection is closed

		if (connectionId) {
			PeripheralDevices.find({
				connectionId: connectionId,
			}).forEach((p) => {
				// set the status of the machine to offline:

				PeripheralDevices.update(p._id, {
					$set: {
						lastSeen: getCurrentTime(),
						connected: false,
						// connectionId: ''
					},
				})
				PeripheralDevices.update(
					{
						parentDeviceId: p._id,
					},
					{
						$set: {
							lastSeen: getCurrentTime(),
							connected: false,
							// connectionId: ''
						},
					}
				)
			})
		}
	})
})

Meteor.startup(() => {
	// Reset the connection status of the devices
	PeripheralDevices.find({
		connected: true,
		lastSeen: { $lt: getCurrentTime() - 60 * 1000 },
	}).forEach((device: PeripheralDevice) => {
		PeripheralDevices.update(device._id, {
			$set: {
				connected: false,
			},
		})
	})
})
