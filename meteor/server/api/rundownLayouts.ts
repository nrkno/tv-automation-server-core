import { Meteor } from 'meteor/meteor'
import { check, Match } from '../../lib/check'
import { registerClassToMeteorMethods } from '../methods'
import { NewRundownLayoutsAPI, RundownLayoutsAPIMethods } from '../../lib/api/rundownLayouts'
import {
	RundownLayouts,
	RundownLayoutType,
	RundownLayoutBase,
	RundownLayoutId,
} from '../../lib/collections/RundownLayouts'
import { literal, getRandomId, protectString, makePromise } from '../../lib/lib'
import { ServerResponse, IncomingMessage } from 'http'
import { logger } from '../logging'
import { ShowStyleBases, ShowStyleBaseId } from '../../lib/collections/ShowStyleBases'
import { BlueprintId } from '../../lib/collections/Blueprints'
import { MethodContext, MethodContextAPI } from '../../lib/api/methods'
import { UserId } from '../../lib/collections/Users'
import { ShowStyleContentWriteAccess } from '../security/showStyle'
import { PickerPOST, PickerGET } from './http'

export function createRundownLayout(
	name: string,
	type: RundownLayoutType,
	showStyleBaseId: ShowStyleBaseId,
	blueprintId: BlueprintId | undefined,
	userId?: UserId | undefined,
	exposeAsStandalone?: boolean,
	exposeAsShelf?: boolean,
	openByDefault?: boolean
) {
	const id: RundownLayoutId = getRandomId()
	RundownLayouts.insert(
		literal<RundownLayoutBase>({
			_id: id,
			name,
			showStyleBaseId,
			blueprintId,
			filters: [],
			type,
			userId,
			exposeAsStandalone: !!exposeAsStandalone,
			exposeAsShelf: !!exposeAsShelf,
			icon: '',
			iconColor: '#ffffff',
			openByDefault: openByDefault ?? false,
		})
	)
	return id
}

export function removeRundownLayout(layoutId: RundownLayoutId) {
	RundownLayouts.remove(layoutId)
}

PickerPOST.route('/shelfLayouts/upload/:showStyleBaseId', (params, req: IncomingMessage, res: ServerResponse) => {
	res.setHeader('Content-Type', 'text/plain')

	const showStyleBaseId: ShowStyleBaseId = protectString(params.showStyleBaseId)

	check(showStyleBaseId, String)

	const showStyleBase = ShowStyleBases.findOne(showStyleBaseId)

	let content = ''
	try {
		if (!showStyleBase) throw new Meteor.Error(404, `ShowStylebase "${showStyleBaseId}" not found`)

		const body = req.body
		if (!body) throw new Meteor.Error(400, 'Restore Shelf Layout: Missing request body')

		if (typeof body !== 'string' || body.length < 10)
			throw new Meteor.Error(400, 'Restore Shelf Layout: Invalid request body')

		const layout = JSON.parse(body) as RundownLayoutBase
		check(layout._id, Match.Optional(String))
		check(layout.name, String)
		check(layout.filters, Array)
		check(layout.type, String)

		layout.showStyleBaseId = showStyleBase._id

		RundownLayouts.upsert(layout._id, layout)

		res.statusCode = 200
	} catch (e) {
		res.statusCode = 500
		content = e + ''
		logger.error('Shelf Layout restore failed: ' + e)
	}

	res.end(content)
})

PickerGET.route('/shelfLayouts/download/:id', (params, req: IncomingMessage, res: ServerResponse) => {
	const layoutId: RundownLayoutId = protectString(params.id)

	check(layoutId, String)

	let content = ''
	const layout = RundownLayouts.findOne(layoutId)
	if (!layout) {
		res.statusCode = 404
		content = 'Shelf Layout not found'
		res.end(content)
		return
	}

	try {
		content = JSON.stringify(layout, undefined, 2)
		res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(layout.name)}.json`)
		res.setHeader('Content-Type', 'application/json')
		res.statusCode = 200
	} catch (e) {
		res.statusCode = 500
		content = e + ''
		logger.error('Shelf layout restore failed: ' + e)
	}

	res.end(content)
})

/** Add RundownLayout into showStyleBase */
function apiCreateRundownLayout(
	context: MethodContext,
	name: string,
	type: RundownLayoutType,
	showStyleBaseId: ShowStyleBaseId
) {
	check(name, String)
	check(type, String)
	check(showStyleBaseId, String)

	const access = ShowStyleContentWriteAccess.anyContent(context, showStyleBaseId)

	return createRundownLayout(name, type, showStyleBaseId, undefined, access.userId || undefined)
}
function apiRemoveRundownLayout(context: MethodContext, id: RundownLayoutId) {
	check(id, String)

	const access = ShowStyleContentWriteAccess.rundownLayout(context, id)
	const rundownLayout = access.rundownLayout
	if (!rundownLayout) throw new Meteor.Error(404, `RundownLayout "${id}" not found`)

	removeRundownLayout(id)
}

class ServerRundownLayoutsAPI extends MethodContextAPI implements NewRundownLayoutsAPI {
	createRundownLayout(name: string, type: RundownLayoutType, showStyleBaseId: ShowStyleBaseId) {
		return makePromise(() => apiCreateRundownLayout(this, name, type, showStyleBaseId))
	}
	removeRundownLayout(rundownLayoutId: RundownLayoutId) {
		return makePromise(() => apiRemoveRundownLayout(this, rundownLayoutId))
	}
}
registerClassToMeteorMethods(
	RundownLayoutsAPIMethods,
	ServerRundownLayoutsAPI,
	false,
	(methodContext: MethodContext, methodName: string, args: any[], fcn: Function) => {
		return fcn.apply(methodContext, args)
	}
)
