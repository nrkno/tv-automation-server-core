import * as _ from 'underscore'
import { logger } from '../../logging'
import { Meteor } from 'meteor/meteor'
import { BlueprintManifestSet } from '@sofie-automation/blueprints-integration'
import { ServerResponse, IncomingMessage } from 'http'
import { check, Match } from '../../../lib/check'
import { URL } from 'url'
import { retrieveBlueprintAsset, uploadBlueprint, uploadBlueprintAsset } from './api'
import { protectString, waitForPromise } from '../../../lib/lib'
import { BlueprintId } from '../../../lib/collections/Blueprints'
import { PickerGET, PickerPOST } from '../http'
import path from 'path'

PickerPOST.route('/blueprints/restore/:blueprintId', (params, req: IncomingMessage, res: ServerResponse) => {
	res.setHeader('Content-Type', 'text/plain')
	logger.debug(`/blueprints/restore/:${params?.blueprintId}`)

	let content = ''
	try {
		const blueprintId = params.blueprintId
		const url = new URL(req.url || '', 'http://localhost')
		const force = url.searchParams.get('force') === '1' || url.searchParams.get('force') === 'true'

		const blueprintNames = url.searchParams.get('name') || undefined
		const blueprintName: string | undefined = _.isArray(blueprintNames) ? blueprintNames[0] : blueprintNames

		check(blueprintId, String)
		check(blueprintName, Match.Maybe(String))

		const userId = req.headers.authorization ? req.headers.authorization.split(' ')[1] : ''
		const body = (req as any).body as string | undefined
		if (!body) throw new Meteor.Error(400, 'Restore Blueprint: Missing request body')

		if (!_.isString(body) || body.length < 10)
			throw new Meteor.Error(400, 'Restore Blueprint: Invalid request body')

		waitForPromise(
			uploadBlueprint(
				{ userId: protectString(userId) },
				protectString<BlueprintId>(blueprintId),
				body,
				blueprintName,
				force
			)
		)

		res.statusCode = 200
	} catch (e) {
		res.statusCode = 500
		content = e + ''
		logger.error('Blueprint restore failed: ' + e)
	}

	res.end(content)
})
PickerPOST.route('/blueprints/restore', (params, req: IncomingMessage, res: ServerResponse) => {
	res.setHeader('Content-Type', 'text/plain')

	let content = ''
	try {
		const body = req.body
		if (!body) throw new Meteor.Error(400, 'Restore Blueprint: Missing request body')

		let collection = body
		if (typeof body === 'string') {
			if (body.length < 10) throw new Meteor.Error(400, 'Restore Blueprint: Invalid request body')
			try {
				collection = JSON.parse(body) as BlueprintManifestSet
			} catch (e) {
				throw new Meteor.Error(400, 'Restore Blueprint: Failed to parse request body')
			}
		} else if (typeof body !== 'object') {
			throw new Meteor.Error(400, 'Restore Blueprint: Invalid request body')
		}

		const isBlueprintManifestSet = (collection: string | object): collection is BlueprintManifestSet =>
			typeof collection === 'object' && 'blueprints' in collection
		if (!isBlueprintManifestSet(collection))
			throw new Meteor.Error(400, 'Restore Blueprint: Malformed request body')

		if (!Meteor.isTest) logger.info(`Got blueprint collection. ${Object.keys(body).length} blueprints`)

		const errors: any[] = []
		for (const id of _.keys(collection.blueprints)) {
			try {
				const userId = req.headers.authorization ? req.headers.authorization.split(' ')[1] : ''
				waitForPromise(
					uploadBlueprint(
						{ userId: protectString(userId) },
						protectString<BlueprintId>(id),
						collection.blueprints[id],
						id
					)
				)
			} catch (e) {
				logger.error('Blueprint restore failed: ' + e)
				errors.push(e)
			}
		}
		if (collection.assets) {
			for (const id of _.keys(collection.assets)) {
				try {
					const userId = req.headers.authorization ? req.headers.authorization.split(' ')[1] : ''
					uploadBlueprintAsset({ userId: protectString(userId) }, id, collection.assets[id])
				} catch (e) {
					logger.error('Blueprint assets upload failed: ' + e)
					errors.push(e)
				}
			}
		}

		// Report errors
		if (errors.length > 0) {
			res.statusCode = 500
			content += 'Errors were encountered: \n'
			for (const e of errors) {
				content += e + '\n'
			}
		} else {
			res.statusCode = 200
		}
	} catch (e) {
		res.statusCode = 500
		content = e + ''
		logger.error('Blueprint restore failed: ' + e)
	}

	res.end(content)
})

// TODO - should these be based on blueprintId?
PickerPOST.route('/blueprints/assets', (_params, req: IncomingMessage, res: ServerResponse) => {
	res.setHeader('Content-Type', 'text/plain')

	let content = ''
	try {
		const body = req.body
		if (!body) throw new Meteor.Error(400, 'Upload Blueprint assets: Missing request body')

		let collection = body
		if (typeof body === 'string') {
			if (body.length < 10) throw new Meteor.Error(400, 'Upload Blueprint assets: Invalid request body')
			try {
				collection = JSON.parse(body) as Record<string, string>
			} catch (e) {
				throw new Meteor.Error(400, 'Upload Blueprint assets: Failed to parse request body')
			}
		} else if (typeof body !== 'object') {
			throw new Meteor.Error(400, 'Upload Blueprint assets: Invalid request body')
		}

		if (!Meteor.isTest) logger.info(`Got blueprint assets. ${Object.keys(collection).length} assets`)

		const errors: any[] = []
		for (const id of _.keys(collection)) {
			try {
				const userId = req.headers.authorization ? req.headers.authorization.split(' ')[1] : ''
				uploadBlueprintAsset({ userId: protectString(userId) }, id, collection[id])
			} catch (e) {
				logger.error('Blueprint assets upload failed: ' + e)
				errors.push(e)
			}
		}

		// Report errors
		if (errors.length > 0) {
			res.statusCode = 500
			content += 'Errors were encountered: \n'
			for (const e of errors) {
				content += e + '\n'
			}
		} else {
			res.statusCode = 200
		}
	} catch (e) {
		res.statusCode = 500
		content = e + ''
		logger.error('Blueprint assets upload failed: ' + e)
	}

	res.end(content)
})
PickerGET.route('/blueprints/assets/(.*)', (params, req, res) => {
	logger.debug(`/blueprints/assets/:${params[0]}`)
	// TODO - some sort of user verification
	// for now just check it's a png to prevent snapshots being downloaded

	const filePath = params[0]
	if (filePath.match(/\.(png|svg)?$/)) {
		const userId = req.headers.authorization ? req.headers.authorization.split(' ')[1] : ''
		try {
			const data = retrieveBlueprintAsset({ userId: protectString(userId) }, filePath)
			const extension = path.extname(filePath)
			if (extension === '.svg') {
				res.setHeader('Content-Type', 'image/svg+xml')
			} else if (extension === '.png') {
				res.setHeader('Content-Type', 'image/png')
			}
			res.statusCode = 200
			res.write(data)
		} catch {
			res.statusCode = 404 // Probably
		}
	} else {
		res.statusCode = 403
	}

	res.end()
})
