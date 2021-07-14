import { testInFiber } from '../../../__mocks__/helpers/jest'
import {
	setupDefaultStudioEnvironment,
	DefaultEnvironment,
	setupDefaultRundownPlaylist,
} from '../../../__mocks__/helpers/database'
import { RundownUtils } from '../rundown'
import { RundownPlaylists, RundownPlaylistId } from '../../../lib/collections/RundownPlaylists'

describe('client/lib/rundown', () => {
	let env: DefaultEnvironment
	let playlistId: RundownPlaylistId
	beforeAll(async () => {
		env = await setupDefaultStudioEnvironment()
		playlistId = setupDefaultRundownPlaylist(env).playlistId
	})
	testInFiber('RundownUtils.getResolvedSegment', () => {
		const showStyleBase = env.showStyleBase
		const playlist = RundownPlaylists.findOne(playlistId)
		if (!playlist) throw new Error('Rundown not found')

		const { currentPartInstance, nextPartInstance } = playlist.getSelectedPartInstances()

		const rundowns = playlist.getRundowns()
		const segments = playlist.getSegments()
		const parts = playlist.getAllOrderedParts()
		const rundown = rundowns[0]
		const segment = segments[0]
		// const nextSegment = segments[1]

		const resolvedSegment = RundownUtils.getResolvedSegment(
			showStyleBase,
			playlist,
			rundown,
			segment,
			new Set(segments.slice(0, 0).map((segment) => segment._id)),
			[],
			new Map(),
			parts.map((part) => part._id),
			currentPartInstance,
			nextPartInstance
		)
		expect(resolvedSegment).toBeTruthy()
		expect(resolvedSegment.parts).toHaveLength(2)
		expect(resolvedSegment).toMatchObject({
			// segmentExtended: SegmentExtended,
			// parts: Array<PartExtended>,
			isLiveSegment: false,
			isNextSegment: false,
			currentLivePart: undefined,
			currentNextPart: undefined,
			hasRemoteItems: false,
			hasGuestItems: false,
			hasAlreadyPlayed: false,
			autoNextPart: false,
		})
		expect(resolvedSegment).toMatchSnapshot()
	})
})
