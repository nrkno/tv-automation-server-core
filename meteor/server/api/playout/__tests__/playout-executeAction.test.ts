import '../../../../__mocks__/_extendJest'
import { testInFiber, beforeEachInFiber } from '../../../../__mocks__/helpers/jest'
import {
	DefaultEnvironment,
	setupDefaultStudioEnvironment,
	setupDefaultRundownPlaylist,
	packageBlueprint,
} from '../../../../__mocks__/helpers/database'
import { ServerPlayoutAPI } from '../playout'
import { ActionExecutionContext, ActionPartChange } from '../../blueprints/context'
import { Rundown, Rundowns, RundownId } from '../../../../lib/collections/Rundowns'
import { RundownPlaylist, RundownPlaylistId, RundownPlaylists } from '../../../../lib/collections/RundownPlaylists'
import { ShowStyleBase, ShowStyleBases } from '../../../../lib/collections/ShowStyleBases'
import { Blueprints, BlueprintId } from '../../../../lib/collections/Blueprints'
import { BLUEPRINT_CACHE_CONTROL } from '../../blueprints/cache'
import { ShowStyleBlueprintManifest, BlueprintManifestType } from '@sofie-automation/blueprints-integration'
import { VerifiedRundownPlaylistContentAccess } from '../../lib'

jest.mock('../../playout/infinites')
import {
	syncPlayheadInfinitesForNextPartInstance,
	getPieceInstancesForPart,
	fetchPiecesThatMayBeActiveForPart,
} from '../../playout/infinites'
type TsyncPlayheadInfinitesForNextPartInstance = jest.MockedFunction<typeof syncPlayheadInfinitesForNextPartInstance>
const syncPlayheadInfinitesForNextPartInstanceMock =
	syncPlayheadInfinitesForNextPartInstance as TsyncPlayheadInfinitesForNextPartInstance
type TgetPieceInstancesForPart = jest.MockedFunction<typeof getPieceInstancesForPart>
type TfetchPiecesThatMayBeActiveForPart = jest.MockedFunction<typeof fetchPiecesThatMayBeActiveForPart>
const {
	getPieceInstancesForPart: getPieceInstancesForPartOrig,
	fetchPiecesThatMayBeActiveForPart: fetchPiecesThatMayBeActiveForPartOrig,
} = jest.requireActual('../../playout/infinites')
;(getPieceInstancesForPart as TgetPieceInstancesForPart).mockImplementation(getPieceInstancesForPartOrig)
;(fetchPiecesThatMayBeActiveForPart as TfetchPiecesThatMayBeActiveForPart).mockImplementation(
	fetchPiecesThatMayBeActiveForPartOrig
)

jest.mock('../../playout/timeline')
import { updateTimeline } from '../../playout/timeline'
import { AdLibActionId } from '../../../../lib/collections/AdLibActions'
import { protectString } from '../../../../lib/lib'
type TupdateTimeline = jest.MockedFunction<typeof updateTimeline>
const updateTimelineMock = updateTimeline as TupdateTimeline

function DEFAULT_ACCESS(rundownPlaylistID: RundownPlaylistId): VerifiedRundownPlaylistContentAccess {
	const playlist = RundownPlaylists.findOne(rundownPlaylistID) as RundownPlaylist
	expect(playlist).toBeTruthy()
	return { userId: null, organizationId: null, studioId: null, playlist: playlist, cred: {} }
}

describe('Playout API', () => {
	describe('executeAction', () => {
		let env: DefaultEnvironment
		let playlistId: RundownPlaylistId
		let rundownId: RundownId
		let blueprintId: BlueprintId

		beforeEachInFiber(async () => {
			BLUEPRINT_CACHE_CONTROL.disable = true

			env = await setupDefaultStudioEnvironment()

			const { playlistId: playlistId0, rundownId: rundownId0 } = setupDefaultRundownPlaylist(env)
			playlistId = playlistId0
			rundownId = rundownId0

			ServerPlayoutAPI.activateRundownPlaylist(DEFAULT_ACCESS(playlistId), playlistId, true)
			ServerPlayoutAPI.takeNextPart(DEFAULT_ACCESS(playlistId), playlistId)

			const rundown = Rundowns.findOne(rundownId) as Rundown
			expect(rundown).toBeTruthy()
			const showStyle = ShowStyleBases.findOne(rundown.showStyleBaseId) as ShowStyleBase
			expect(showStyle).toBeTruthy()

			blueprintId = showStyle.blueprintId

			syncPlayheadInfinitesForNextPartInstanceMock.mockClear()
			updateTimelineMock.mockClear()
		})

		afterEach(() => {
			BLUEPRINT_CACHE_CONTROL.disable = false
		})

		testInFiber('invalid parameters', () => {
			// @ts-ignore
			expect(() => ServerPlayoutAPI.executeAction(DEFAULT_ACCESS(playlistId), 9, '', '')).toThrowError(
				'Match error: Expected string'
			)
			// @ts-ignore
			expect(() => ServerPlayoutAPI.executeAction(DEFAULT_ACCESS(playlistId), '', 9, '')).toThrowError(
				'Match error: Expected string'
			)
		})

		testInFiber('throws errors', () => {
			const actionDocId: AdLibActionId = protectString('action-id')
			const actionId = 'some-action'
			const userData = { blobby: true }

			expect(() =>
				ServerPlayoutAPI.executeAction(DEFAULT_ACCESS(playlistId), playlistId, actionDocId, actionId, userData)
			).toThrowError(/ShowStyle blueprint .* does not support executing actions/)

			const BLUEPRINT_TYPE = BlueprintManifestType.SHOWSTYLE

			// Change the blueprint and try again
			Blueprints.update(blueprintId, {
				$set: {
					code: packageBlueprint<ShowStyleBlueprintManifest>(
						{
							// Constants to into code:
							BLUEPRINT_TYPE,
						},
						function (): any {
							return {
								blueprintType: BLUEPRINT_TYPE,
								executeAction: () => {
									throw new Error('action execution threw')
								},
							}
						}
					),
				},
			})
			expect(() =>
				ServerPlayoutAPI.executeAction(DEFAULT_ACCESS(playlistId), playlistId, actionDocId, actionId, userData)
			).toThrowError('action execution threw')

			expect(syncPlayheadInfinitesForNextPartInstanceMock).toHaveBeenCalledTimes(0)
			expect(updateTimelineMock).toHaveBeenCalledTimes(0)
		})

		testInFiber('no changes', () => {
			const BLUEPRINT_TYPE = BlueprintManifestType.SHOWSTYLE
			const STATE_NONE = ActionPartChange.NONE
			const STATE_SAFE = ActionPartChange.SAFE_CHANGE

			Blueprints.update(blueprintId, {
				$set: {
					code: packageBlueprint<ShowStyleBlueprintManifest>(
						{
							// Constants to into code:
							BLUEPRINT_TYPE,
							STATE_NONE,
							STATE_SAFE,
						},
						function (): any {
							return {
								blueprintType: BLUEPRINT_TYPE,
								executeAction: (context0) => {
									const context = context0 as ActionExecutionContext
									if (context.nextPartState !== STATE_NONE)
										throw new Error('nextPartState started wrong')
									if (context.currentPartState !== STATE_NONE)
										throw new Error('nextPartState started wrong')
								},
							}
						}
					),
				},
			})

			const actionDocId: AdLibActionId = protectString('action-id')
			const actionId = 'some-action'
			const userData = { blobby: true }
			ServerPlayoutAPI.executeAction(DEFAULT_ACCESS(playlistId), playlistId, actionDocId, actionId, userData)

			expect(syncPlayheadInfinitesForNextPartInstanceMock).toHaveBeenCalledTimes(0)
			expect(updateTimelineMock).toHaveBeenCalledTimes(0)
		})

		testInFiber('safe next part', () => {
			const BLUEPRINT_TYPE = BlueprintManifestType.SHOWSTYLE
			const STATE_NONE = ActionPartChange.NONE
			const STATE_SAFE = ActionPartChange.SAFE_CHANGE

			Blueprints.update(blueprintId, {
				$set: {
					code: packageBlueprint<ShowStyleBlueprintManifest>(
						{
							// Constants to into code:
							BLUEPRINT_TYPE,
							STATE_NONE,
							STATE_SAFE,
						},
						function (): any {
							return {
								blueprintType: BLUEPRINT_TYPE,
								executeAction: (context0) => {
									const context = context0 as ActionExecutionContext
									if (context.nextPartState !== STATE_NONE)
										throw new Error('nextPartState started wrong')
									if (context.currentPartState !== STATE_NONE)
										throw new Error('nextPartState started wrong')

									context.nextPartState = STATE_SAFE
								},
							}
						}
					),
				},
			})

			const actionDocId: AdLibActionId = protectString('action-id')
			const actionId = 'some-action'
			const userData = { blobby: true }
			ServerPlayoutAPI.executeAction(DEFAULT_ACCESS(playlistId), playlistId, actionDocId, actionId, userData)

			expect(syncPlayheadInfinitesForNextPartInstanceMock).toHaveBeenCalledTimes(1)
			expect(updateTimelineMock).toHaveBeenCalledTimes(1)
		})

		testInFiber('safe current part', () => {
			const BLUEPRINT_TYPE = BlueprintManifestType.SHOWSTYLE
			const STATE_NONE = ActionPartChange.NONE
			const STATE_SAFE = ActionPartChange.SAFE_CHANGE

			Blueprints.update(blueprintId, {
				$set: {
					code: packageBlueprint<ShowStyleBlueprintManifest>(
						{
							// Constants to into code:
							BLUEPRINT_TYPE,
							STATE_NONE,
							STATE_SAFE,
						},
						function (): any {
							return {
								blueprintType: BLUEPRINT_TYPE,
								executeAction: (context0) => {
									const context = context0 as ActionExecutionContext
									if (context.nextPartState !== STATE_NONE)
										throw new Error('nextPartState started wrong')
									if (context.currentPartState !== STATE_NONE)
										throw new Error('nextPartState started wrong')

									context.currentPartState = STATE_SAFE
								},
							}
						}
					),
				},
			})

			const actionDocId: AdLibActionId = protectString('action-id')
			const actionId = 'some-action'
			const userData = { blobby: true }
			ServerPlayoutAPI.executeAction(DEFAULT_ACCESS(playlistId), playlistId, actionDocId, actionId, userData)

			expect(syncPlayheadInfinitesForNextPartInstanceMock).toHaveBeenCalledTimes(1)
			expect(updateTimelineMock).toHaveBeenCalledTimes(1)
		})

		testInFiber('take after execute (true)', () => {
			const api = ServerPlayoutAPI
			const mockTake = jest.fn().mockReturnThis()
			api.callTakeWithCache = mockTake

			const BLUEPRINT_TYPE = BlueprintManifestType.SHOWSTYLE
			const STATE_NONE = ActionPartChange.NONE
			const STATE_SAFE = ActionPartChange.SAFE_CHANGE

			Blueprints.update(blueprintId, {
				$set: {
					code: packageBlueprint<ShowStyleBlueprintManifest>(
						{
							// Constants to into code:
							BLUEPRINT_TYPE,
							STATE_NONE,
							STATE_SAFE,
						},
						function (): any {
							return {
								blueprintType: BLUEPRINT_TYPE,
								executeAction: (context0) => {
									const context = context0 as ActionExecutionContext
									context.takeAfterExecuteAction(true)
								},
							}
						}
					),
				},
			})

			const actionDocId: AdLibActionId = protectString('action-id')
			const actionId = 'some-action'
			const userData = { blobby: true }
			api.executeAction(DEFAULT_ACCESS(playlistId), playlistId, actionDocId, actionId, userData)

			const timesTakeCalled = mockTake.mock.calls.length
			mockTake.mockRestore()
			expect(timesTakeCalled).toBe(1)
		})

		testInFiber('take after execute (false)', () => {
			const api = ServerPlayoutAPI
			const mockTake = jest.fn().mockReturnThis()
			api.callTakeWithCache = mockTake

			const BLUEPRINT_TYPE = BlueprintManifestType.SHOWSTYLE
			const STATE_NONE = ActionPartChange.NONE
			const STATE_SAFE = ActionPartChange.SAFE_CHANGE

			Blueprints.update(blueprintId, {
				$set: {
					code: packageBlueprint<ShowStyleBlueprintManifest>(
						{
							// Constants to into code:
							BLUEPRINT_TYPE,
							STATE_NONE,
							STATE_SAFE,
						},
						function (): any {
							return {
								blueprintType: BLUEPRINT_TYPE,
								executeAction: (context0) => {
									const context = context0 as ActionExecutionContext
									context.takeAfterExecuteAction(false)
								},
							}
						}
					),
				},
			})

			const actionDocId: AdLibActionId = protectString('action-id')
			const actionId = 'some-action'
			const userData = { blobby: true }
			api.executeAction(DEFAULT_ACCESS(playlistId), playlistId, actionDocId, actionId, userData)

			const timesTakeCalled = mockTake.mock.calls.length
			mockTake.mockRestore()
			expect(timesTakeCalled).toBe(0)
		})
	})
})
