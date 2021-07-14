import { TFunction } from 'i18next'
import moment from 'moment'
import { getCurrentTime } from '../../../lib/lib'

export function DisplayFormattedTimeInner(
	t: TFunction,
	/** Timestamp to display */
	displayTimestamp: number,
	/** Timestamp of "now", if omitted, defaults to "now" */
	nowTimestamp?: number,
	/* If set, uses the time zone (in minutes) */
	timeZone?: number
) {
	const now = moment(nowTimestamp ?? getCurrentTime()) // use synced time instead of client time
	const timeToFormat = moment(displayTimestamp)

	if (timeZone !== undefined) {
		now.utcOffset(timeZone)
		timeToFormat.utcOffset(timeZone)
	}

	const diffDays = now.diff(timeToFormat, 'days')

	let formattedDateString: string
	if (Math.abs(diffDays) < 6) {
		// Overrides to be able to display calendar based string with Moment without
		// time of day. Because we override the strings from Moment they won't be
		// automatically localized by Moment. Therefore we need to use the general
		// translation functionality for this in order for localization to work.
		// This is horrible, and hopefully will be replaced with something
		// smoother when we replace Moment.
		const momentCalendarOptions = {
			sameDay: `[${t('Today')}] HH:mm:ss`,
			lastDay: `[${t('Yesterday')}] HH:mm:ss`,
			nextDay: `[${t('Tomorrow')}] HH:mm:ss`,
			nextWeek: 'dddd HH:mm:ss',
			lastWeek: `[${t('Last')}] dddd HH:mm:ss`,
		}

		formattedDateString = timeToFormat.calendar(now, momentCalendarOptions)
	} else {
		formattedDateString = now.to(timeToFormat)
	}

	return formattedDateString
}
