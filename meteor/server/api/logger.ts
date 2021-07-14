import { Meteor } from 'meteor/meteor'
import { logger, transports } from '../logging'

Meteor.methods({
	logger: (type: string, ...args: any[]) => {
		// @ts-ignore
		const loggerFunction: any = logger[type] || logger.log
		loggerFunction(...args)
	},
})

// This is used when running in tests to minimize the logged output:
export function setLoggerLevel(loggerLevel: 'debug' | 'info' | 'warning' | 'error') {
	transports.console.level = loggerLevel
}
