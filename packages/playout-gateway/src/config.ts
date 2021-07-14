import { Config } from './connector'
import * as _ from 'underscore'

// CLI arguments / Environment variables --------------
let host: string = process.env.CORE_HOST || '127.0.0.1'
let port: number = parseInt(process.env.CORE_PORT + '', 10) || 3000
let logPath: string = process.env.CORE_LOG || ''
let logLevel: string | undefined = process.env.LOG_LEVEL || undefined
let deviceId: string = process.env.DEVICE_ID || ''
let deviceToken: string = process.env.DEVICE_TOKEN || ''
let disableWatchdog: boolean = process.env.DISABLE_WATCHDOG === '1' || false
let unsafeSSL: boolean = process.env.UNSAFE_SSL === '1' || false
const certs: string[] = (process.env.CERTIFICATES || '').split(';') || []
let disableAtemUpload: boolean = process.env.DISABLE_ATEM_UPLOAD === '1' || false // TODO: change this to be an opt-in instead

let prevProcessArg = ''
process.argv.forEach((val) => {
	val = val + ''

	let nextPrevProcessArg = val
	if (prevProcessArg.match(/-host/i)) {
		host = val
	} else if (prevProcessArg.match(/-port/i)) {
		port = parseInt(val, 10)
	} else if (prevProcessArg.match(/-logLevel/i)) {
		logLevel = val
	} else if (prevProcessArg.match(/-log/i)) {
		logPath = val
	} else if (prevProcessArg.match(/-id/i)) {
		deviceId = val
	} else if (prevProcessArg.match(/-token/i)) {
		deviceToken = val
	} else if (prevProcessArg.match(/-certificates/i)) {
		certs.push(val)
		nextPrevProcessArg = prevProcessArg // so that we can get multiple certificates

		// arguments with no options:
	} else if (val.match(/-disableWatchdog/i)) {
		disableWatchdog = true
	} else if (val.match(/-disableAtemUpload/i)) {
		disableAtemUpload = true
	} else if (val.match(/-unsafeSSL/i)) {
		// Will cause the Node applocation to blindly accept all certificates. Not recommenced unless in local, controlled networks.
		unsafeSSL = true
	}
	prevProcessArg = nextPrevProcessArg + ''
})

const config: Config = {
	process: {
		unsafeSSL: unsafeSSL,
		certificates: _.compact(certs),
	},
	device: {
		deviceId: deviceId,
		deviceToken: deviceToken,
	},
	core: {
		host: host,
		port: port,
		watchdog: !disableWatchdog,
	},
	tsr: {},
}

export { config, logPath, logLevel, disableWatchdog, disableAtemUpload }
