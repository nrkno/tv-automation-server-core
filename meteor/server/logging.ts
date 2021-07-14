import * as Winston from 'winston'
import * as fs from 'fs'
import { getAbsolutePath } from './lib'
import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'

// @todo: remove this and do a PR to https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/winston
// because there's an error in the typings logging.debug() takes any, not only string
interface LoggerInstanceFixed extends Winston.Logger {
	error: LeveledLogMethodFixed
	warn: LeveledLogMethodFixed
	help: LeveledLogMethodFixed
	data: LeveledLogMethodFixed
	info: LeveledLogMethodFixed
	debug: LeveledLogMethodFixed
	prompt: LeveledLogMethodFixed
	verbose: LeveledLogMethodFixed
	input: LeveledLogMethodFixed
	silly: LeveledLogMethodFixed

	emerg: LeveledLogMethodFixed
	alert: LeveledLogMethodFixed
	crit: LeveledLogMethodFixed
	warning: LeveledLogMethodFixed
	notice: LeveledLogMethodFixed
}
interface LogMeta {
	[key: string]: any
}
interface LeveledLogMethodFixed {
	(msg: any, callback: Winston.LogCallback): LoggerInstanceFixed
	(msg: any, meta: LogMeta, callback: Winston.LogCallback): LoggerInstanceFixed
	(msg: any, ...meta: LogMeta[]): LoggerInstanceFixed
}
const leadingZeros = (num: number | string, length: number) => {
	num = num + ''
	if (num.length < length) {
		return '00000000000000000000000000000000000000000'.slice(0, length - num.length) + num
	} else {
		return num
	}
}
let logToFile = false
if (process.env.LOG_TO_FILE) logToFile = true

let logPath = process.env.LOG_FILE || ''

let logger: LoggerInstanceFixed
let transports

function safeStringify(o: any): string {
	try {
		return JSON.stringify(o) // make single line
	} catch (e) {
		return 'ERROR in safeStringify: ' + (e || 'N/A').toString()
	}
}
if (logToFile || logPath !== '') {
	if (logPath === '') {
		const time = new Date()
		const startDate =
			time.getFullYear() +
			'-' +
			leadingZeros(time.getMonth(), 2) +
			'-' +
			leadingZeros(time.getDate(), 2) +
			'_' +
			leadingZeros(time.getHours(), 2) +
			'_' +
			leadingZeros(time.getMinutes(), 2) +
			'_' +
			leadingZeros(time.getSeconds(), 2)
		const logDirectory = getAbsolutePath() + '/.meteor/local/log'
		logPath = logDirectory + '/log_' + startDate + '.log'
		// let logPath = './log/'

		if (!fs.existsSync(logDirectory)) {
			fs.mkdirSync(logDirectory)
		}
	}
	transports = {
		console: new Winston.transports.Console({
			level: 'verbose',
			handleExceptions: true,
		}),
		file: new Winston.transports.File({
			level: 'silly',
			handleExceptions: true,
			filename: logPath,
		}),
	}
	logger = Winston.createLogger({
		format: Winston.format.json(),
		transports: [transports.console, transports.file],
	})
	console.log('Logging to ' + logPath)
} else {
	transports = {
		console: new Winston.transports.Console({
			level: 'silly',
			handleExceptions: true,
		}),
	}
	if (Meteor.isProduction) {
		logger = Winston.createLogger({
			format: Winston.format.json(),
			transports: [transports.console],
		})
	} else {
		const customFormat = Winston.format.printf((o) => {
			const meta = _.omit(o, 'level', 'message', 'timestamp')
			return `[${o.level}] ${o.message} ${!_.isEmpty(meta) ? safeStringify(meta) : ''}`
		})

		logger = Winston.createLogger({
			format: Winston.format.combine(Winston.format.timestamp(), customFormat),
			transports: [transports.console],
		})
	}
}

export { logger, transports }
