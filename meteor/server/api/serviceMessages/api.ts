import { IncomingMessage, ServerResponse } from 'http'
import { postHandler } from './postHandler'
import { deleteMessage, readAllMessages } from './serviceMessagesApi'
import { PickerPOST, PickerGET, PickerDELETE } from '../http'

PickerPOST.route('/serviceMessages', postHandler)

PickerGET.route('/serviceMessages', getHandler)
PickerGET.route('/serviceMessages/:id', getMessageHandler)

PickerDELETE.route('/serviceMessages/:id', deleteHandler)

/**
 * List all current messages stored on this instance
 */
function getHandler(params, req: IncomingMessage, res: ServerResponse) {
	try {
		const valuesArray = readAllMessages()
		res.setHeader('Content-Type', 'application/json; charset-utf8')
		res.end(JSON.stringify(valuesArray), 'utf-8')
	} catch (error) {
		res.statusCode = 500
		res.end('Unable to list service messages')
		return
	}
}

/**
 * Delete a message
 */
function deleteHandler(params, req: IncomingMessage, res: ServerResponse) {
	const { id } = params
	try {
		if (readAllMessages().find((m) => m.id === id)) {
			const deleted = deleteMessage(id)
			res.setHeader('Content-Type', 'application/json; charset-utf8')
			res.end(JSON.stringify(deleted), 'utf-8')
		} else {
			res.statusCode = 404
			res.end(`Message with id ${id} can not be found`)
		}
	} catch (error) {
		res.statusCode = 500
		res.end(`Unable to delete service message ${id}`)
	}
}

/**
 * Retrieves a single message based on a given id
 */
function getMessageHandler(params, req: IncomingMessage, res: ServerResponse) {
	const { id } = params
	try {
		const message = readAllMessages().find((m) => m.id === id)
		if (message) {
			res.setHeader('Content-Type', 'application/json; charset-utf8')
			res.end(JSON.stringify(message), 'utf-8')
		} else {
			res.statusCode = 404
			res.end(`Message with id ${id} can not be found`)
		}
	} catch (error) {
		res.statusCode = 500
		res.end(`Unable to retrieve service message ${id}`)
	}
}
