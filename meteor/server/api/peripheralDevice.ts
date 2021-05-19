import { Meteor } from 'meteor/meteor'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { check, Match } from '../../lib/check'
import * as _ from 'underscore'
import { NewPeripheralDeviceAPI } from '../../lib/api/peripheralDevice'
import { PeripheralDevices, PeripheralDeviceId } from '../../lib/collections/PeripheralDevices'
import { Rundowns } from '../../lib/collections/Rundowns'
import { getCurrentTime, protectString, makePromise, waitForPromise, getRandomId, applyToArray } from '../../lib/lib'
import { PeripheralDeviceCommands, PeripheralDeviceCommandId } from '../../lib/collections/PeripheralDeviceCommands'
import { logger } from '../logging'
import { Timeline, TimelineComplete, TimelineHash } from '../../lib/collections/Timeline'
import { ServerPlayoutAPI } from './playout/playout'
import { registerClassToMeteorMethods } from '../methods'
import { IncomingMessage, ServerResponse } from 'http'
import { parse as parseUrl } from 'url'
import { RundownInput } from './ingest/rundownInput'
import {
	IngestRundown,
	IngestSegment,
	IngestPart,
	ExpectedPackageStatusAPI,
} from '@sofie-automation/blueprints-integration'
import { MosIntegration } from './ingest/mosDevice/mosIntegration'
import { MediaScannerIntegration } from './integration/media-scanner'
import { MediaObject } from '../../lib/collections/MediaObjects'
import { MediaManagerIntegration } from './integration/mediaWorkFlows'
import { MediaWorkFlowId, MediaWorkFlow } from '../../lib/collections/MediaWorkFlows'
import { MediaWorkFlowStepId, MediaWorkFlowStep } from '../../lib/collections/MediaWorkFlowSteps'
import * as MOS from 'mos-connection'
import { determineDiffTime, getTimeDiff } from './systemTime/systemTime'
import { PeripheralDeviceContentWriteAccess } from '../security/peripheralDevice'
import { MethodContextAPI, MethodContext } from '../../lib/api/methods'
import { triggerWriteAccess, triggerWriteAccessBecauseNoCheckNecessary } from '../security/lib/securityVerify'
import { checkAccessAndGetPeripheralDevice } from './ingest/lib'
import { PickerPOST } from './http'
import { RundownPlaylist, RundownPlaylistId } from '../../lib/collections/RundownPlaylists'
import { getValidActivationCache } from '../cache/ActivationCache'
import { UserActionsLog } from '../../lib/collections/UserActionsLog'
import { PieceGroupMetadata } from '../../lib/rundown/pieces'
import { PackageManagerIntegration } from './integration/expectedPackages'
import { ExpectedPackageId } from '../../lib/collections/ExpectedPackages'
import { ExpectedPackageWorkStatusId } from '../../lib/collections/ExpectedPackageWorkStatuses'
import { PackageInfoDBType } from '../../lib/collections/PackageInfos'
import { runStudioOperationWithCache, StudioLockFunctionPriority } from './studio/lockFunction'
import { PlayoutLockFunctionPriority, runPlayoutOperationWithLockFromStudioOperation } from './playout/lockFunction'
import { DbCacheWriteCollection } from '../cache/CacheCollection'
import { CacheForStudio } from './studio/cache'
import { PieceInstance, PieceInstanceId, PieceInstances } from '../../lib/collections/PieceInstances'
import { PartInstanceId } from '../../lib/collections/PartInstances'
import { executePeripheralDeviceFuntion } from '../../lib/api/peripheralDeviceInternal'

// import {ServerPeripheralDeviceAPIMOS as MOS} from './peripheralDeviceMos'
export namespace ServerPeripheralDeviceAPI {
	export function initialize(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		token: string,
		options: PeripheralDeviceAPI.InitOptions
	): PeripheralDeviceId {
		triggerWriteAccess() // This is somewhat of a hack, since we want to check if it exists at all, before checking access
		check(deviceId, String)
		const existingDevice = PeripheralDevices.findOne(deviceId)
		if (existingDevice) {
			PeripheralDeviceContentWriteAccess.peripheralDevice({ userId: context.userId, token }, deviceId)
		}

		check(token, String)
		check(options, Object)
		check(options.name, String)
		check(options.category, String)
		check(options.type, String)
		check(options.subType, Match.OneOf(Number, String))
		check(options.parentDeviceId, Match.Optional(String))
		check(options.versions, Match.Optional(Object))

		// Omitting some of the properties that tend to be rather large
		logger.debug('Initialize device ' + deviceId, _.omit(options, 'versions', 'configManifest'))

		if (existingDevice) {
			PeripheralDevices.update(deviceId, {
				$set: {
					lastSeen: getCurrentTime(),
					lastConnected: getCurrentTime(),
					connected: true,
					connectionId: options.connectionId,

					category: options.category,
					type: options.type,
					subType: options.subType,

					name:
						// Only allow name changes if the name is unmodified:
						existingDevice.name === existingDevice.deviceName || existingDevice.deviceName === undefined
							? options.name
							: existingDevice.name,
					deviceName: options.name,
					parentDeviceId: protectString<PeripheralDeviceId>(options.parentDeviceId),
					versions: options.versions,

					configManifest: options.configManifest,
				},
			})
		} else {
			PeripheralDevices.insert({
				_id: deviceId,
				organizationId: null,
				created: getCurrentTime(),
				status: {
					statusCode: PeripheralDeviceAPI.StatusCode.UNKNOWN,
				},
				studioId: protectString(''),
				connected: true,
				connectionId: options.connectionId,
				lastSeen: getCurrentTime(),
				lastConnected: getCurrentTime(),
				token: token,

				category: options.category,
				type: options.type,
				subType: options.subType,

				name: options.name,
				deviceName: options.name,
				parentDeviceId: protectString<PeripheralDeviceId>(options.parentDeviceId),
				versions: options.versions,
				// settings: {},

				configManifest: options.configManifest,
			})
		}
		return deviceId
	}
	export function unInitialize(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		token: string
	): PeripheralDeviceId {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, token, context)

		// TODO: Add an authorization for this?

		PeripheralDevices.remove(deviceId)
		return deviceId
	}
	export function setStatus(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		token: string,
		status: PeripheralDeviceAPI.StatusObject
	): PeripheralDeviceAPI.StatusObject {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, token, context)

		check(deviceId, String)
		check(token, String)
		check(status, Object)
		check(status.statusCode, Number)
		if (
			status.statusCode < PeripheralDeviceAPI.StatusCode.UNKNOWN ||
			status.statusCode > PeripheralDeviceAPI.StatusCode.FATAL
		) {
			throw new Meteor.Error(400, 'device status code is not known')
		}

		// check if we have to update something:
		if (!_.isEqual(status, peripheralDevice.status)) {
			logger.info(
				`Changed status of device ${peripheralDevice._id} "${peripheralDevice.name}" to ${status.statusCode}`
			)
			// perform the update:
			PeripheralDevices.update(deviceId, {
				$set: {
					status: status,
					connected: true,
				},
			})
		} else if (!peripheralDevice.connected) {
			PeripheralDevices.update(deviceId, {
				$set: {
					connected: true,
				},
			})
		}
		return status
	}
	export function ping(context: MethodContext, deviceId: PeripheralDeviceId, token: string): void {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, token, context)

		check(deviceId, String)
		check(token, String)

		// Update lastSeen
		PeripheralDevices.update(deviceId, {
			$set: {
				lastSeen: getCurrentTime(),
			},
		})
	}
	export function getPeripheralDevice(context: MethodContext, deviceId: PeripheralDeviceId, token: string) {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, token, context)

		return peripheralDevice
	}

	/**
	 * Called from Playout-gateway when the trigger-time of a timeline object has updated
	 * ( typically when using the "now"-feature )
	 */
	export function timelineTriggerTime(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		token: string,
		results: PeripheralDeviceAPI.TimelineTriggerTimeResult
	) {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, token, context)

		if (!peripheralDevice.studioId)
			throw new Meteor.Error(401, `peripheralDevice "${deviceId}" not attached to a studio`)

		const studioId = peripheralDevice.studioId

		// check(r.time, Number)
		check(results, Array)
		_.each(results, (o) => {
			check(o.id, String)
			check(o.time, Number)
		})

		if (results.length > 0) {
			runStudioOperationWithCache(
				'timelineTriggerTime',
				studioId,
				StudioLockFunctionPriority.CALLBACK_PLAYOUT,
				(studioCache) => {
					const activePlaylists = studioCache.getActiveRundownPlaylists()

					if (activePlaylists.length === 1) {
						const activePlaylist = activePlaylists[0]
						const playlistId = activePlaylist._id
						runPlayoutOperationWithLockFromStudioOperation(
							'timelineTriggerTime',
							studioCache,
							activePlaylist,
							PlayoutLockFunctionPriority.CALLBACK_PLAYOUT,
							async () => {
								const rundownIDs = Rundowns.find({ playlistId }).map((r) => r._id)

								// We only need the PieceInstances, so load just them
								const pieceInstanceCache = new DbCacheWriteCollection<PieceInstance, PieceInstance>(
									PieceInstances
								)

								await pieceInstanceCache.prepareInit({ rundownId: { $in: rundownIDs } }, true)

								// Take ownership of the playlist in the db, so that we can mutate the timeline and piece instances
								timelineTriggerTimeInner(studioCache, results, pieceInstanceCache, activePlaylist)

								await pieceInstanceCache.updateDatabaseWithData()
							}
						)
					} else {
						timelineTriggerTimeInner(studioCache, results, undefined, undefined)
					}
				}
			)
		}
	}

	function timelineTriggerTimeInner(
		cache: CacheForStudio,
		results: PeripheralDeviceAPI.TimelineTriggerTimeResult,
		pieceInstanceCache: DbCacheWriteCollection<PieceInstance, PieceInstance> | undefined,
		activePlaylist: RundownPlaylist | undefined
	) {
		let lastTakeTime: number | undefined

		// ------------------------------
		let timelineObjs = cache.Timeline.findOne(cache.Studio.doc._id)?.timeline || []
		let tlChanged = false

		_.each(results, (o) => {
			check(o.id, String)

			logger.info(`Timeline: Setting time: "${o.id}": ${o.time}`)

			const obj = timelineObjs.find((tlo) => tlo.id === o.id)
			if (obj) {
				applyToArray(obj.enable, (enable) => {
					if (enable.start === 'now') {
						enable.start = o.time
						enable.setFromNow = true

						tlChanged = true
					}
				})

				// TODO - we should do the same for the partInstance.
				// Or should we not update the now for them at all? as we should be getting the onPartPlaybackStarted immediately after

				const objPieceId = (obj.metaData as Partial<PieceGroupMetadata> | undefined)?.pieceId
				if (objPieceId && activePlaylist && pieceInstanceCache) {
					logger.info('Update PieceInstance: ', {
						pieceId: objPieceId,
						time: new Date(o.time).toTimeString(),
					})

					const pieceInstance = pieceInstanceCache.findOne(objPieceId)
					if (pieceInstance) {
						pieceInstanceCache.update(pieceInstance._id, {
							$set: {
								'piece.enable.start': o.time,
							},
						})

						const takeTime = pieceInstance.dynamicallyInserted
						if (pieceInstance.dynamicallyInserted && takeTime) {
							lastTakeTime = lastTakeTime === undefined ? takeTime : Math.max(lastTakeTime, takeTime)
						}
					}
				}
			}
		})

		if (lastTakeTime !== undefined && activePlaylist?.currentPartInstanceId && pieceInstanceCache) {
			// We updated some pieceInstance from now, so lets ensure any earlier adlibs do not still have a now
			const remainingNowPieces = pieceInstanceCache.findFetch({
				partInstanceId: activePlaylist.currentPartInstanceId,
				dynamicallyInserted: { $exists: true },
				disabled: { $ne: true },
			})
			for (const piece of remainingNowPieces) {
				const pieceTakeTime = piece.dynamicallyInserted
				if (pieceTakeTime && pieceTakeTime <= lastTakeTime && piece.piece.enable.start === 'now') {
					// Disable and hide the instance
					pieceInstanceCache.update(piece._id, {
						$set: {
							disabled: true,
							hidden: true,
						},
					})
				}
			}
		}
		if (tlChanged) {
			cache.Timeline.update(
				cache.Studio.doc._id,
				{
					$set: {
						timeline: timelineObjs,
						timelineHash: getRandomId(),
						generated: getCurrentTime(),
					},
				},
				true
			)
		}
	}
	export function partPlaybackStarted(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		token: string,
		r: PeripheralDeviceAPI.PartPlaybackStartedResult
	) {
		// This is called from the playout-gateway when a part starts playing.
		// Note that this function can / might be called several times from playout-gateway for the same part
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, token, context)

		check(r.time, Number)
		check(r.rundownPlaylistId, String)
		check(r.partInstanceId, String)

		ServerPlayoutAPI.onPartPlaybackStarted(
			context,
			peripheralDevice,
			protectString<RundownPlaylistId>(r.rundownPlaylistId),
			protectString<PartInstanceId>(r.partInstanceId),
			r.time
		)
	}
	export function partPlaybackStopped(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		token: string,
		r: PeripheralDeviceAPI.PartPlaybackStoppedResult
	) {
		// This is called from the playout-gateway when an
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, token, context)

		check(r.time, Number)
		check(r.rundownPlaylistId, String)
		check(r.partInstanceId, String)

		ServerPlayoutAPI.onPartPlaybackStopped(
			context,
			protectString<RundownPlaylistId>(r.rundownPlaylistId),
			protectString<PartInstanceId>(r.partInstanceId),
			r.time
		)
	}
	export function piecePlaybackStarted(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		token: string,
		r: PeripheralDeviceAPI.PiecePlaybackStartedResult
	) {
		// This is called from the playout-gateway when an auto-next event occurs
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, token, context)

		check(r.time, Number)
		check(r.rundownPlaylistId, String)
		check(r.pieceInstanceId, String)
		check(r.dynamicallyInserted, Match.Optional(Boolean))

		ServerPlayoutAPI.onPiecePlaybackStarted(
			context,
			protectString<RundownPlaylistId>(r.rundownPlaylistId),
			protectString<PieceInstanceId>(r.pieceInstanceId),
			!!r.dynamicallyInserted,
			r.time
		)
	}
	export function piecePlaybackStopped(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		token: string,
		r: PeripheralDeviceAPI.PiecePlaybackStartedResult
	) {
		// This is called from the playout-gateway when an auto-next event occurs
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, token, context)

		check(r.time, Number)
		check(r.rundownPlaylistId, String)
		check(r.pieceInstanceId, String)
		check(r.dynamicallyInserted, Match.Optional(Boolean))

		ServerPlayoutAPI.onPiecePlaybackStopped(
			context,
			protectString<RundownPlaylistId>(r.rundownPlaylistId),
			protectString<PieceInstanceId>(r.pieceInstanceId),
			!!r.dynamicallyInserted,
			r.time
		)
	}
	export function pingWithCommand(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		token: string,
		message: string,
		cb?: Function
	) {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, token, context)

		executePeripheralDeviceFuntion(
			peripheralDevice._id,
			(err, res) => {
				if (err) {
					logger.warn(err)
				}

				if (cb) cb(err, res)
			},
			'pingResponse',
			message
		)

		ping(context, deviceId, token)
	}
	export function killProcess(context: MethodContext, deviceId: PeripheralDeviceId, token: string, really: boolean) {
		// This is used in integration tests only
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, token, context)

		// Make sure this never runs if this server isn't empty:
		if (Rundowns.find().count()) throw new Meteor.Error(400, 'Unable to run killProcess: Rundowns not empty!')

		if (really) {
			this.logger.info('KillProcess command received from ' + peripheralDevice._id + ', shutting down in 1000ms!')
			setTimeout(() => {
				process.exit(0)
			}, 1000)
			return true
		}
		return false
	}
	export function testMethod(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		token: string,
		returnValue: string,
		throwError?: boolean
	): string {
		// used for integration tests with core-connection
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, token, context)

		check(deviceId, String)
		check(token, String)
		check(returnValue, String)

		if (throwError) {
			throw new Meteor.Error(418, 'Error thrown, as requested')
		} else {
			return returnValue
		}
	}
	export const executeFunction: (
		deviceId: PeripheralDeviceId,
		functionName: string,
		...args: any[]
	) => any = Meteor.wrapAsync((deviceId: PeripheralDeviceId, functionName: string, ...args: any[]) => {
		let args0 = args.slice(0, -1)
		let cb = args.slice(-1)[0] // the last argument in ...args
		executePeripheralDeviceFuntion(deviceId, cb, functionName, ...args0)
	})

	export function requestUserAuthToken(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		token: string,
		authUrl: string
	) {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, token, context)

		if (peripheralDevice.type !== PeripheralDeviceAPI.DeviceType.SPREADSHEET) {
			throw new Meteor.Error(400, 'can only request user auth token for peripheral device of spreadsheet type')
		}
		check(authUrl, String)

		PeripheralDevices.update(peripheralDevice._id, {
			$set: {
				accessTokenUrl: authUrl,
			},
		})
	}
	export function storeAccessToken(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		token: string,
		accessToken: any
	) {
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, token, context)

		if (peripheralDevice.type !== PeripheralDeviceAPI.DeviceType.SPREADSHEET) {
			throw new Meteor.Error(400, 'can only store access token for peripheral device of spreadsheet type')
		}

		PeripheralDevices.update(peripheralDevice._id, {
			$set: {
				accessTokenUrl: '',
				'secretSettings.accessToken': accessToken,
				'settings.secretAccessToken': true,
			},
		})
	}
	export function reportResolveDone(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		timelineHash: TimelineHash,
		/** Resolve duration, as reported by playout-gateway/TSR */
		resolveDuration: number
	) {
		// Device (playout gateway) reports that it has finished resolving a timeline
		const peripheralDevice = checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)

		check(timelineHash, String)
		check(resolveDuration, Number)

		if (peripheralDevice.studioId) {
			const timeline = Timeline.findOne(
				{
					_id: peripheralDevice.studioId,
				},
				{
					fields: {
						timelineHash: 1,
						generated: 1,
					},
				}
			) as Pick<TimelineComplete, 'timelineHash' | 'generated'>

			// Compare the timelineHash with the one we have in the timeline.
			// We're using that to determine when the timeline was generated (in Core)
			// In order to determine the total latency (roundtrip from timeline-generation => resolving done in playout-gateway)
			if (timeline) {
				if (timeline.timelineHash === timelineHash) {
					/** Time when timeline was generated in Core */
					const startTime = timeline.generated
					const endTime = getCurrentTime()

					const totalLatency = endTime - startTime

					/** How many latencies we store for statistics */
					const LATENCIES_MAX_LENGTH = 100

					/** Any latency higher than this is not realistic */
					const MAX_REALISTIC_LATENCY = 1000 // ms

					if (totalLatency < MAX_REALISTIC_LATENCY) {
						if (!peripheralDevice.latencies) peripheralDevice.latencies = []
						peripheralDevice.latencies.unshift(totalLatency)

						if (peripheralDevice.latencies.length > LATENCIES_MAX_LENGTH) {
							// Trim anything after LATENCIES_MAX_LENGTH
							peripheralDevice.latencies.splice(LATENCIES_MAX_LENGTH, 999)
						}
						PeripheralDevices.update(peripheralDevice._id, {
							$set: {
								latencies: peripheralDevice.latencies,
							},
						})
						// Because the ActivationCache is used during playout, we need to update that as well:
						const activationCache = getValidActivationCache(peripheralDevice.studioId)
						if (activationCache) {
							const device = waitForPromise(activationCache.getPeripheralDevices()).find(
								(device) => device._id === peripheralDevice._id
							)
							if (device) {
								device.latencies = peripheralDevice.latencies
							}
						}

						// Also store the result to userActions, if possible.
						UserActionsLog.update(
							{
								success: true,
								doneTime: { $gt: startTime },
							},
							{
								$push: {
									gatewayDuration: totalLatency,
									timelineResolveDuration: resolveDuration,
								},
							},
							{ multi: false }
						)
					}
				}
			}
		}
	}
}

PickerPOST.route('/devices/:deviceId/uploadCredentials', (params, req: IncomingMessage, res: ServerResponse, next) => {
	res.setHeader('Content-Type', 'text/plain')

	let content = ''
	try {
		let deviceId: PeripheralDeviceId = protectString(decodeURIComponent(params.deviceId))
		check(deviceId, String)

		if (!deviceId) throw new Meteor.Error(400, `parameter deviceId is missing`)

		const peripheralDevice = PeripheralDevices.findOne(deviceId)
		if (!peripheralDevice) throw new Meteor.Error(404, `Peripheral device "${deviceId}" not found`)

		let url = parseUrl(req.url || '', true)

		let fileNames = url.query['name'] || undefined
		let fileName: string = (_.isArray(fileNames) ? fileNames[0] : fileNames) || ''

		check(fileName, String)

		const body = (req as any).body
		if (!body) throw new Meteor.Error(400, 'Upload credentials: Missing request body')

		if (typeof body !== 'string' || body.length < 10)
			throw new Meteor.Error(400, 'Upload credentials: Invalid request body')

		logger.info('Upload credentails, ' + body.length + ' bytes')

		const credentials = JSON.parse(body)

		PeripheralDevices.update(peripheralDevice._id, {
			$set: {
				'secretSettings.credentials': credentials,
				'settings.secretCredentials': true,
			},
		})

		res.statusCode = 200
	} catch (e) {
		res.statusCode = 500
		content = e + ''
		logger.error('Upload credentials failed: ' + e)
	}

	res.end(content)
})

/** WHen a device has executed a PeripheralDeviceCommand, it will reply to this endpoint with the result */
function functionReply(
	context: MethodContext,
	deviceId: PeripheralDeviceId,
	deviceToken: string,
	commandId: PeripheralDeviceCommandId,
	err: any,
	result: any
): void {
	const device = checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)

	// logger.debug('functionReply', err, result)
	PeripheralDeviceCommands.update(
		{
			_id: commandId,
			deviceId: { $in: _.compact([device._id, device.parentDeviceId]) },
		},
		{
			$set: {
				hasReply: true,
				reply: result,
				replyError: err,
				replyTime: getCurrentTime(),
			},
		}
	)
}

// Set up ALL PeripheralDevice methods:
class ServerPeripheralDeviceAPIClass extends MethodContextAPI implements NewPeripheralDeviceAPI {
	// -------- System time --------
	determineDiffTime() {
		triggerWriteAccessBecauseNoCheckNecessary()
		return determineDiffTime()
	}
	getTimeDiff() {
		triggerWriteAccessBecauseNoCheckNecessary()
		return makePromise(() => getTimeDiff())
	}
	getTime() {
		triggerWriteAccessBecauseNoCheckNecessary()
		return makePromise(() => getCurrentTime())
	}

	// ----- PeripheralDevice --------------
	functionReply(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		commandId: PeripheralDeviceCommandId,
		err: any,
		result: any
	) {
		return makePromise(() => functionReply(this, deviceId, deviceToken, commandId, err, result))
	}
	initialize(deviceId: PeripheralDeviceId, deviceToken: string, options: PeripheralDeviceAPI.InitOptions) {
		return makePromise(() => ServerPeripheralDeviceAPI.initialize(this, deviceId, deviceToken, options))
	}
	unInitialize(deviceId: PeripheralDeviceId, deviceToken: string) {
		return makePromise(() => ServerPeripheralDeviceAPI.unInitialize(this, deviceId, deviceToken))
	}
	setStatus(deviceId: PeripheralDeviceId, deviceToken: string, status: PeripheralDeviceAPI.StatusObject) {
		return makePromise(() => ServerPeripheralDeviceAPI.setStatus(this, deviceId, deviceToken, status))
	}
	ping(deviceId: PeripheralDeviceId, deviceToken: string) {
		return makePromise(() => ServerPeripheralDeviceAPI.ping(this, deviceId, deviceToken))
	}
	getPeripheralDevice(deviceId: PeripheralDeviceId, deviceToken: string) {
		return makePromise(() => ServerPeripheralDeviceAPI.getPeripheralDevice(this, deviceId, deviceToken))
	}
	pingWithCommand(deviceId: PeripheralDeviceId, deviceToken: string, message: string, cb?: Function) {
		return makePromise(() => ServerPeripheralDeviceAPI.pingWithCommand(this, deviceId, deviceToken, message, cb))
	}
	killProcess(deviceId: PeripheralDeviceId, deviceToken: string, really: boolean) {
		return makePromise(() => ServerPeripheralDeviceAPI.killProcess(this, deviceId, deviceToken, really))
	}
	testMethod(deviceId: PeripheralDeviceId, deviceToken: string, returnValue: string, throwError?: boolean) {
		return makePromise(() =>
			ServerPeripheralDeviceAPI.testMethod(this, deviceId, deviceToken, returnValue, throwError)
		)
	}

	// ------ Playout Gateway --------
	timelineTriggerTime(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		r: PeripheralDeviceAPI.TimelineTriggerTimeResult
	) {
		return makePromise(() => ServerPeripheralDeviceAPI.timelineTriggerTime(this, deviceId, deviceToken, r))
	}
	partPlaybackStarted(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		r: PeripheralDeviceAPI.PartPlaybackStartedResult
	) {
		return makePromise(() => ServerPeripheralDeviceAPI.partPlaybackStarted(this, deviceId, deviceToken, r))
	}
	partPlaybackStopped(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		r: PeripheralDeviceAPI.PartPlaybackStartedResult
	) {
		return makePromise(() => ServerPeripheralDeviceAPI.partPlaybackStopped(this, deviceId, deviceToken, r))
	}
	piecePlaybackStopped(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		r: PeripheralDeviceAPI.PiecePlaybackStartedResult
	) {
		return makePromise(() => ServerPeripheralDeviceAPI.piecePlaybackStopped(this, deviceId, deviceToken, r))
	}
	piecePlaybackStarted(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		r: PeripheralDeviceAPI.PiecePlaybackStartedResult
	) {
		return makePromise(() => ServerPeripheralDeviceAPI.piecePlaybackStarted(this, deviceId, deviceToken, r))
	}
	reportResolveDone(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		timelineHash: TimelineHash,
		resolveDuration: number
	) {
		return makePromise(() =>
			ServerPeripheralDeviceAPI.reportResolveDone(this, deviceId, deviceToken, timelineHash, resolveDuration)
		)
	}

	// ------ Spreadsheet Gateway --------
	requestUserAuthToken(deviceId: PeripheralDeviceId, deviceToken: string, authUrl: string) {
		return makePromise(() => ServerPeripheralDeviceAPI.requestUserAuthToken(this, deviceId, deviceToken, authUrl))
	}
	storeAccessToken(deviceId: PeripheralDeviceId, deviceToken: string, authToken: any) {
		return makePromise(() => ServerPeripheralDeviceAPI.storeAccessToken(this, deviceId, deviceToken, authToken))
	}

	// ------ Ingest methods: ------------
	dataRundownList(deviceId: PeripheralDeviceId, deviceToken: string) {
		return makePromise(() => RundownInput.dataRundownList(this, deviceId, deviceToken))
	}
	dataRundownGet(deviceId: PeripheralDeviceId, deviceToken: string, rundownExternalId: string) {
		return makePromise(() => RundownInput.dataRundownGet(this, deviceId, deviceToken, rundownExternalId))
	}
	dataRundownDelete(deviceId: PeripheralDeviceId, deviceToken: string, rundownExternalId: string) {
		return makePromise(() => RundownInput.dataRundownDelete(this, deviceId, deviceToken, rundownExternalId))
	}
	dataRundownCreate(deviceId: PeripheralDeviceId, deviceToken: string, ingestRundown: IngestRundown) {
		return makePromise(() => RundownInput.dataRundownCreate(this, deviceId, deviceToken, ingestRundown))
	}
	dataRundownUpdate(deviceId: PeripheralDeviceId, deviceToken: string, ingestRundown: IngestRundown) {
		return makePromise(() => RundownInput.dataRundownUpdate(this, deviceId, deviceToken, ingestRundown))
	}
	dataSegmentGet(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		segmentExternalId: string
	) {
		return makePromise(() =>
			RundownInput.dataSegmentGet(this, deviceId, deviceToken, rundownExternalId, segmentExternalId)
		)
	}
	dataSegmentDelete(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		segmentExternalId: string
	) {
		return makePromise(() =>
			RundownInput.dataSegmentDelete(this, deviceId, deviceToken, rundownExternalId, segmentExternalId)
		)
	}
	dataSegmentCreate(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		ingestSegment: IngestSegment
	) {
		return makePromise(() =>
			RundownInput.dataSegmentCreate(this, deviceId, deviceToken, rundownExternalId, ingestSegment)
		)
	}
	dataSegmentUpdate(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		ingestSegment: IngestSegment
	) {
		return makePromise(() =>
			RundownInput.dataSegmentUpdate(this, deviceId, deviceToken, rundownExternalId, ingestSegment)
		)
	}
	dataSegmentRanksUpdate(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		newRanks: { [segmentExternalId: string]: number }
	) {
		return makePromise(() => {
			RundownInput.dataSegmentRanksUpdate(this, deviceId, deviceToken, rundownExternalId, newRanks)
		})
	}
	dataPartDelete(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		segmentExternalId: string,
		partExternalId: string
	) {
		return makePromise(() =>
			RundownInput.dataPartDelete(
				this,
				deviceId,
				deviceToken,
				rundownExternalId,
				segmentExternalId,
				partExternalId
			)
		)
	}
	dataPartCreate(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		segmentExternalId: string,
		ingestPart: IngestPart
	) {
		return makePromise(() =>
			RundownInput.dataPartCreate(this, deviceId, deviceToken, rundownExternalId, segmentExternalId, ingestPart)
		)
	}
	dataPartUpdate(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		rundownExternalId: string,
		segmentExternalId: string,
		ingestPart: IngestPart
	) {
		return makePromise(() =>
			RundownInput.dataPartUpdate(this, deviceId, deviceToken, rundownExternalId, segmentExternalId, ingestPart)
		)
	}

	// ------ MOS methods: --------
	mosRoCreate(deviceId: PeripheralDeviceId, deviceToken: string, mosRunningOrder: MOS.IMOSRunningOrder) {
		return makePromise(() => MosIntegration.mosRoCreate(this, deviceId, deviceToken, mosRunningOrder))
	}
	mosRoReplace(deviceId: PeripheralDeviceId, deviceToken: string, mosRunningOrder: MOS.IMOSRunningOrder) {
		return makePromise(() => MosIntegration.mosRoReplace(this, deviceId, deviceToken, mosRunningOrder))
	}
	mosRoDelete(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		mosRunningOrderId: MOS.MosString128,
		force?: boolean
	) {
		return makePromise(() => MosIntegration.mosRoDelete(this, deviceId, deviceToken, mosRunningOrderId, force))
	}
	mosRoMetadata(deviceId: PeripheralDeviceId, deviceToken: string, metadata: MOS.IMOSRunningOrderBase) {
		return makePromise(() => MosIntegration.mosRoMetadata(this, deviceId, deviceToken, metadata))
	}
	mosRoStatus(deviceId: PeripheralDeviceId, deviceToken: string, status: MOS.IMOSRunningOrderStatus) {
		return makePromise(() => MosIntegration.mosRoStatus(this, deviceId, deviceToken, status))
	}
	mosRoStoryStatus(deviceId: PeripheralDeviceId, deviceToken: string, status: MOS.IMOSStoryStatus) {
		return makePromise(() => MosIntegration.mosRoStoryStatus(this, deviceId, deviceToken, status))
	}
	mosRoItemStatus(deviceId: PeripheralDeviceId, deviceToken: string, status: MOS.IMOSItemStatus) {
		return makePromise(() => MosIntegration.mosRoItemStatus(this, deviceId, deviceToken, status))
	}
	mosRoStoryInsert(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: MOS.IMOSStoryAction,
		Stories: Array<MOS.IMOSROStory>
	) {
		return makePromise(() => MosIntegration.mosRoStoryInsert(this, deviceId, deviceToken, Action, Stories))
	}
	mosRoItemInsert(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: MOS.IMOSItemAction,
		Items: Array<MOS.IMOSItem>
	) {
		return makePromise(() => MosIntegration.mosRoItemInsert(this, deviceId, deviceToken, Action, Items))
	}
	mosRoStoryReplace(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: MOS.IMOSStoryAction,
		Stories: Array<MOS.IMOSROStory>
	) {
		return makePromise(() => MosIntegration.mosRoStoryReplace(this, deviceId, deviceToken, Action, Stories))
	}
	mosRoItemReplace(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: MOS.IMOSItemAction,
		Items: Array<MOS.IMOSItem>
	) {
		return makePromise(() => MosIntegration.mosRoItemReplace(this, deviceId, deviceToken, Action, Items))
	}
	mosRoStoryMove(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: MOS.IMOSStoryAction,
		Stories: Array<MOS.MosString128>
	) {
		return makePromise(() => MosIntegration.mosRoStoryMove(this, deviceId, deviceToken, Action, Stories))
	}
	mosRoItemMove(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: MOS.IMOSItemAction,
		Items: Array<MOS.MosString128>
	) {
		return makePromise(() => MosIntegration.mosRoItemMove(this, deviceId, deviceToken, Action, Items))
	}
	mosRoStoryDelete(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: MOS.IMOSROAction,
		Stories: Array<MOS.MosString128>
	) {
		return makePromise(() => MosIntegration.mosRoStoryDelete(this, deviceId, deviceToken, Action, Stories))
	}
	mosRoItemDelete(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: MOS.IMOSStoryAction,
		Items: Array<MOS.MosString128>
	) {
		return makePromise(() => MosIntegration.mosRoItemDelete(this, deviceId, deviceToken, Action, Items))
	}
	mosRoStorySwap(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: MOS.IMOSROAction,
		StoryID0: MOS.MosString128,
		StoryID1: MOS.MosString128
	) {
		return makePromise(() => MosIntegration.mosRoStorySwap(this, deviceId, deviceToken, Action, StoryID0, StoryID1))
	}
	mosRoItemSwap(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		Action: MOS.IMOSStoryAction,
		ItemID0: MOS.MosString128,
		ItemID1: MOS.MosString128
	) {
		return makePromise(() => MosIntegration.mosRoItemSwap(this, deviceId, deviceToken, Action, ItemID0, ItemID1))
	}
	mosRoReadyToAir(deviceId: PeripheralDeviceId, deviceToken: string, Action: MOS.IMOSROReadyToAir) {
		return makePromise(() => MosIntegration.mosRoReadyToAir(this, deviceId, deviceToken, Action))
	}
	mosRoFullStory(deviceId: PeripheralDeviceId, deviceToken: string, story: MOS.IMOSROFullStory) {
		return makePromise(() => MosIntegration.mosRoFullStory(this, deviceId, deviceToken, story))
	}
	// ------- Media Manager (Media Scanner)
	getMediaObjectRevisions(deviceId: PeripheralDeviceId, deviceToken: string, collectionId: string) {
		return makePromise(() =>
			MediaScannerIntegration.getMediaObjectRevisions(this, deviceId, deviceToken, collectionId)
		)
	}
	updateMediaObject(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		collectionId: string,
		id: string,
		doc: MediaObject | null
	) {
		return makePromise(() =>
			MediaScannerIntegration.updateMediaObject(this, deviceId, deviceToken, collectionId, id, doc)
		)
	}
	clearMediaObjectCollection(deviceId: PeripheralDeviceId, deviceToken: string, collectionId: string) {
		return makePromise(() =>
			MediaScannerIntegration.clearMediaObjectCollection(deviceId, deviceToken, collectionId)
		)
	}
	// ------- Media Manager --------------
	getMediaWorkFlowRevisions(deviceId: PeripheralDeviceId, deviceToken: string) {
		return makePromise(() => MediaManagerIntegration.getMediaWorkFlowRevisions(this, deviceId, deviceToken))
	}
	getMediaWorkFlowStepRevisions(deviceId: PeripheralDeviceId, deviceToken: string) {
		return makePromise(() => MediaManagerIntegration.getMediaWorkFlowStepRevisions(this, deviceId, deviceToken))
	}
	updateMediaWorkFlow(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		workFlowId: MediaWorkFlowId,
		obj: MediaWorkFlow | null
	) {
		return makePromise(() =>
			MediaManagerIntegration.updateMediaWorkFlow(this, deviceId, deviceToken, workFlowId, obj)
		)
	}
	updateMediaWorkFlowStep(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		docId: MediaWorkFlowStepId,
		obj: MediaWorkFlowStep | null
	) {
		return makePromise(() =>
			MediaManagerIntegration.updateMediaWorkFlowStep(this, deviceId, deviceToken, docId, obj)
		)
	}
	insertExpectedPackageWorkStatus(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		workStatusId: ExpectedPackageWorkStatusId,
		workStatus: ExpectedPackageStatusAPI.WorkStatus
	) {
		return makePromise(() =>
			PackageManagerIntegration.insertExpectedPackageWorkStatus(
				this,
				deviceId,
				deviceToken,
				workStatusId,
				workStatus
			)
		)
	}
	updateExpectedPackageWorkStatus(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		workStatusId: ExpectedPackageWorkStatusId,
		workStatus: Partial<ExpectedPackageStatusAPI.WorkStatus>
	) {
		return makePromise(() =>
			PackageManagerIntegration.updateExpectedPackageWorkStatus(
				this,
				deviceId,
				deviceToken,
				workStatusId,
				workStatus
			)
		)
	}
	removeExpectedPackageWorkStatus(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		workStatusId: ExpectedPackageWorkStatusId
	) {
		return makePromise(() =>
			PackageManagerIntegration.removeExpectedPackageWorkStatus(this, deviceId, deviceToken, workStatusId)
		)
	}
	removeAllExpectedPackageWorkStatusOfDevice(deviceId: PeripheralDeviceId, deviceToken: string) {
		return makePromise(() =>
			PackageManagerIntegration.removeAllExpectedPackageWorkStatusOfDevice(this, deviceId, deviceToken)
		)
	}
	updatePackageContainerPackageStatus(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		containerId: string,
		packageId: string,
		packageStatus: ExpectedPackageStatusAPI.PackageContainerPackageStatus | null
	) {
		return makePromise(() =>
			PackageManagerIntegration.updatePackageContainerPackageStatus(
				this,
				deviceId,
				deviceToken,
				containerId,
				packageId,
				packageStatus
			)
		)
	}
	fetchPackageInfoMetadata(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		type: string,
		packageIds: ExpectedPackageId[]
	) {
		return makePromise(() =>
			PackageManagerIntegration.fetchPackageInfoMetadata(this, deviceId, deviceToken, type, packageIds)
		)
	}
	updatePackageInfo(
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		type: PackageInfoDBType, // string
		packageId: ExpectedPackageId,
		expectedContentVersionHash: string,
		actualContentVersionHash: string,
		payload: any
	) {
		return makePromise(() =>
			PackageManagerIntegration.updatePackageInfo(
				this,
				deviceId,
				deviceToken,
				type,
				packageId,
				expectedContentVersionHash,
				actualContentVersionHash,
				payload
			)
		)
	}
	removePackageInfo(deviceId: PeripheralDeviceId, deviceToken: string, type: string, packageId: ExpectedPackageId) {
		return makePromise(() =>
			PackageManagerIntegration.removePackageInfo(this, deviceId, deviceToken, type, packageId)
		)
	}
}
registerClassToMeteorMethods(PeripheralDeviceAPI.methods, ServerPeripheralDeviceAPIClass, false)
