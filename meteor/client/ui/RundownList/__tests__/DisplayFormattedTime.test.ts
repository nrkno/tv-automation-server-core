import { TFunction } from 'i18next'
import { DisplayFormattedTimeInner } from '../DisplayFormattedTimeInner'

describe('ui/RundownList/DisplayFormattedTime', () => {
	describe('DisplayFormattedTime', () => {
		it('should format various situations correctly', () => {
			const now: number = new Date('2021-06-09T12:00:00Z').getTime()
			const tz = 0

			const t: TFunction = (str: string) => {
				return str
			}

			// Dates in the future:

			// Today:
			expect(DisplayFormattedTimeInner(t, time('2021-06-09T12:00:00Z'), now, tz)).toBe('Today 12:00:00')
			expect(DisplayFormattedTimeInner(t, time('2021-06-09T12:00:14Z'), now, tz)).toBe('Today 12:00:14')
			expect(DisplayFormattedTimeInner(t, time('2021-06-09T12:15:30Z'), now, tz)).toBe('Today 12:15:30')
			expect(DisplayFormattedTimeInner(t, time('2021-06-09T23:00:00Z'), now, tz)).toBe('Today 23:00:00')
			// Tomorrow:
			expect(DisplayFormattedTimeInner(t, time('2021-06-10T08:00:00Z'), now, tz)).toBe('Tomorrow 08:00:00')
			// In 3 days:
			expect(DisplayFormattedTimeInner(t, time('2021-06-12T08:00:00Z'), now, tz)).toBe('Saturday 08:00:00')
			// Next week:
			expect(DisplayFormattedTimeInner(t, time('2021-06-19T08:00:00Z'), now, tz)).toBe('in 10 days')
			// In a few months:
			expect(DisplayFormattedTimeInner(t, time('2021-08-19T08:00:00Z'), now, tz)).toBe('in 2 months')
			// In a long time:
			expect(DisplayFormattedTimeInner(t, time('2022-06-09T08:00:00Z'), now, tz)).toBe('in a year')

			// Dates in the past:
			// Today:
			expect(DisplayFormattedTimeInner(t, time('2021-06-09T11:59:00Z'), now, tz)).toBe('Today 11:59:00')
			expect(DisplayFormattedTimeInner(t, time('2021-06-09T11:00:00Z'), now, tz)).toBe('Today 11:00:00')
			expect(DisplayFormattedTimeInner(t, time('2021-06-09T03:15:30Z'), now, tz)).toBe('Today 03:15:30')
			expect(DisplayFormattedTimeInner(t, time('2021-06-09T00:00:00Z'), now, tz)).toBe('Today 00:00:00')
			// Yesterday:
			expect(DisplayFormattedTimeInner(t, time('2021-06-08T08:00:00Z'), now, tz)).toBe('Yesterday 08:00:00')
			// 3 days ago:
			expect(DisplayFormattedTimeInner(t, time('2021-06-07T08:00:00Z'), now, tz)).toBe('Last Monday 08:00:00')
			// Last week:
			expect(DisplayFormattedTimeInner(t, time('2021-06-02T08:00:00Z'), now, tz)).toBe('7 days ago')
			// A few months ago:
			expect(DisplayFormattedTimeInner(t, time('2021-04-15T08:00:00Z'), now, tz)).toBe('2 months ago')
			// A long long time ago:
			expect(DisplayFormattedTimeInner(t, time('2020-05-30T08:00:00Z'), now, tz)).toBe('a year ago')
		})
	})
})

function time(dateString: string): number {
	return new Date(dateString).getTime()
}
