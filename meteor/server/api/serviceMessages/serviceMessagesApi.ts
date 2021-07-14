import { CoreSystem, getCoreSystem, ServiceMessage } from '../../../lib/collections/CoreSystem'
import { logger } from '../../logging'

export { deleteMessage, readAllMessages, writeMessage, WriteStatus }

interface WriteStatus {
	isUpdate?: boolean
}

/**
 * Get all service messages in the system currently
 *
 * @returns all service messages currently stored in the system
 *
 * @throws if messages cant be read due to a technical problem
 */
function readAllMessages(): Array<ServiceMessage> {
	const coreSystem = getCoreSystem()
	if (!coreSystem || !coreSystem.serviceMessages) {
		logger.error('coreSystem.serviceMessages doesnt exist. ServiceMessages API wont work.')
		throw new Error('coreSystem.serviceMessages is not available. Database not migrated?')
	}

	const { serviceMessages } = coreSystem
	const messages = Object.keys(serviceMessages).map((key) => serviceMessages[key])

	return messages
}

/**
 * Store a service message in the system
 *
 * @param message - the message to be stored
 *
 * @returns status for the write operation
 *
 * @throws when a message can't be written
 */
function writeMessage(message: ServiceMessage): WriteStatus {
	const coreSystem = getCoreSystem()
	if (!coreSystem || !coreSystem.serviceMessages) {
		throw new Error('coreSystem.serviceMessages is not available. Database not migrated?')
	}

	const { serviceMessages } = coreSystem
	const isUpdate = serviceMessages[message.id] ? true : false

	try {
		serviceMessages[message.id] = message
		CoreSystem.update(coreSystem._id, { $set: { serviceMessages } })
		return { isUpdate }
	} catch (error) {
		logger.error(error.message)
		throw new Error(`Unable to store service message: ${error.message}`)
	}
}

function deleteMessage(id: string): ServiceMessage {
	const coreSystem = getCoreSystem()
	if (!coreSystem || !coreSystem.serviceMessages) {
		throw new Error('coreSystem.serviceMessages is not available. Database not migrated?')
	}

	const { serviceMessages } = coreSystem
	const message = serviceMessages[id]

	try {
		if (message) {
			delete serviceMessages[message.id]
			CoreSystem.update(coreSystem._id, { $set: { serviceMessages } })
			return message
		} else {
			throw new Error(`Message with id ${id} can not be found, and therefore not deleted`)
		}
	} catch (error) {
		logger.error(error.message)
		throw new Error(`Unable to delete service message ${id}: ${error.message}`)
	}
}
