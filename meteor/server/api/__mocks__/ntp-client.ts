import { RandomMock } from '../../../__mocks__/random'

export const ntpReplyTimeout: number = 1000

export const getNetworkTime = (
	host: string,
	port: number,
	cb: (error: Error | undefined, date: Date | undefined) => void
): void => {
	const validAdresses = ['0.se.pool.ntp.org:123', '1.se.pool.ntp.org:123', '2.se.pool.ntp.org:123']

	const mockDiffFromRealTime = 400 // ms

	const hostPort = `${host}:${port}`
	if (validAdresses.includes(hostPort)) {
		const noise = RandomMock.number() * 2 - 1 // -1 ... +1
		const serverTime = new Date(Date.now() - mockDiffFromRealTime + noise)

		setTimeout(() => {
			cb(undefined, serverTime)
		}, 5)
	} else {
		setTimeout(() => {
			cb(new Error(`Mock: Timeout for host ${hostPort}`), undefined)
		}, 5)
	}
}
