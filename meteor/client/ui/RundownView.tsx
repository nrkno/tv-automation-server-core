import { Meteor } from 'meteor/meteor'
import * as React from 'react'
import { parse as queryStringParse } from 'query-string'
import * as VelocityReact from 'velocity-react'
import { Translated, translateWithTracker } from '../lib/ReactMeteorData/react-meteor-data'
import { VTContent, TSR } from 'tv-automation-sofie-blueprints-integration'
import { withTranslation, WithTranslation } from 'react-i18next'
import timer from 'react-timer-hoc'
import CoreIcon from '@nrk/core-icons/jsx'
import { Spinner } from '../lib/Spinner'
import ClassNames from 'classnames'
import * as _ from 'underscore'
import Escape from 'react-escape'
import * as i18next from 'i18next'
import Moment from 'react-moment'
import Tooltip from 'rc-tooltip'
import { NavLink, Route, Prompt } from 'react-router-dom'
import { RundownPlaylist, RundownPlaylists, RundownPlaylistId } from '../../lib/collections/RundownPlaylists'
import { Rundown, Rundowns, RundownHoldState, RundownId } from '../../lib/collections/Rundowns'
import { Segment, SegmentId } from '../../lib/collections/Segments'
import { Studio, Studios } from '../../lib/collections/Studios'
import { Part, Parts, PartId } from '../../lib/collections/Parts'

import { ContextMenu, MenuItem, ContextMenuTrigger } from 'react-contextmenu'

import {
	RundownTimingProvider,
	withTiming,
	WithTiming,
	CurrentPartRemaining,
	AutoNextStatus,
} from './RundownView/RundownTiming'
import { SegmentTimelineContainer, PieceUi, PartUi, SegmentUi } from './SegmentTimeline/SegmentTimelineContainer'
import { SegmentContextMenu } from './SegmentTimeline/SegmentContextMenu'
import { Shelf, ShelfBase, ShelfTabs } from './Shelf/Shelf'
import { RundownOverview } from './RundownView/RundownOverview'
import { RundownSystemStatus } from './RundownView/RundownSystemStatus'

import { getCurrentTime, unprotectString, protectString } from '../../lib/lib'
import { RundownUtils } from '../lib/rundown'

import * as mousetrap from 'mousetrap'
import { ErrorBoundary } from '../lib/ErrorBoundary'
import { ModalDialog, doModalDialog, isModalShowing } from '../lib/ModalDialog'
import { MeteorReactComponent } from '../lib/MeteorReactComponent'
import { getAllowStudio, getAllowDeveloper, getHelpMode, getAllowConfigure, getAllowService } from '../lib/localStorage'
import { ClientAPI } from '../../lib/api/client'
import {
	scrollToPart,
	scrollToPosition,
	scrollToSegment,
	maintainFocusOnPartInstance,
	scrollToPartInstance,
} from '../lib/viewPort'
import { AfterBroadcastForm } from './AfterBroadcastForm'
import { Tracker } from 'meteor/tracker'
import { RundownFullscreenControls } from './RundownView/RundownFullscreenControls'
import { mousetrapHelper } from '../lib/mousetrapHelper'
import { ShowStyleBases, ShowStyleBase } from '../../lib/collections/ShowStyleBases'
import { PeripheralDevicesAPI, callPeripheralDeviceFunction } from '../lib/clientAPI'
import {
	RONotificationEvent,
	onRONotificationClick as rundownNotificationHandler,
	RundownNotifier,
	reloadRundownPlaylistClick,
} from './RundownView/RundownNotifier'
import { NotificationCenterPanel } from '../lib/notifications/NotificationCenterPanel'
import { NotificationCenter, NoticeLevel, Notification } from '../lib/notifications/notifications'
import { SupportPopUp } from './SupportPopUp'
import { KeyboardFocusIndicator } from '../lib/KeyboardFocusIndicator'
import { PeripheralDevices, PeripheralDevice } from '../../lib/collections/PeripheralDevices'
import { PeripheralDeviceAPI } from '../../lib/api/peripheralDevice'
import { doUserAction, UserAction } from '../lib/userAction'
import { ReloadRundownPlaylistResponse, TriggerReloadDataResponse } from '../../lib/api/userActions'
import { ClipTrimDialog } from './ClipTrimPanel/ClipTrimDialog'
import { NoteType } from '../../lib/api/notes'
import { PubSub } from '../../lib/api/pubsub'
import {
	RundownLayout,
	RundownLayouts,
	RundownLayoutType,
	RundownLayoutBase,
	RundownLayoutId,
} from '../../lib/collections/RundownLayouts'
import { VirtualElement } from '../lib/VirtualElement'
import { SEGMENT_TIMELINE_ELEMENT_ID } from './SegmentTimeline/SegmentTimeline'
import { NoraPreviewRenderer } from './SegmentTimeline/Renderers/NoraPreviewRenderer'
import { Buckets, Bucket } from '../../lib/collections/Buckets'
import { contextMenuHoldToDisplayTime } from '../lib/lib'
import { OffsetPosition } from '../utils/positions'
import { Settings } from '../../lib/Settings'
import { MeteorCall } from '../../lib/api/methods'
import { PointerLockCursor } from '../lib/PointerLockCursor'
import { AdLibPieceUi } from './Shelf/AdLibPanel'
import { documentTitle } from '../lib/documentTitle'
import { PartInstanceId } from '../../lib/collections/PartInstances'
import { RundownDividerHeader } from './RundownView/RundownDividerHeader'

export const MAGIC_TIME_SCALE_FACTOR = 0.03

type WrappedShelf = ShelfBase & { getWrappedInstance(): ShelfBase }

interface ITimingWarningProps {
	playlist: RundownPlaylist
	inActiveRundownView?: boolean
	studioMode: boolean
	oneMinuteBeforeAction: (e: Event) => void
}

interface ITimingWarningState {
	plannedStartCloseShown?: boolean
	plannedStartCloseShow?: boolean
}
const WarningDisplay = withTranslation()(
	timer(5000)(
		class WarningDisplay extends React.Component<Translated<ITimingWarningProps>, ITimingWarningState> {
			private readonly REHEARSAL_MARGIN = 1 * 60 * 1000

			constructor(props: Translated<ITimingWarningProps>) {
				super(props)

				this.state = {}
			}

			componentDidUpdate(prevProps: ITimingWarningProps) {
				if (
					(this.props.playlist.active && !prevProps.playlist.active && this.props.playlist.rehearsal) ||
					this.props.playlist.rehearsal !== prevProps.playlist.rehearsal
				) {
					this.setState({
						plannedStartCloseShown: false,
					})
				}

				if (
					this.props.playlist.active &&
					this.props.playlist.rehearsal &&
					this.props.playlist.expectedStart &&
					// the expectedStart is near
					getCurrentTime() + this.REHEARSAL_MARGIN > this.props.playlist.expectedStart &&
					// but it's not horribly in the past
					getCurrentTime() <
						this.props.playlist.expectedStart + (this.props.playlist.expectedDuration || 60 * 60 * 1000) &&
					!this.props.inActiveRundownView &&
					!this.state.plannedStartCloseShown
				) {
					this.setState({
						plannedStartCloseShow: true,
						plannedStartCloseShown: true,
					})
				}
			}

			discard = () => {
				this.setState({
					plannedStartCloseShow: false,
				})
			}

			oneMinuteBeforeAction = (e: any) => {
				this.setState({
					plannedStartCloseShow: false,
				})

				this.props.oneMinuteBeforeAction(e)
			}

			render() {
				const { t } = this.props

				if (!this.props.playlist) return null

				return (
					<ModalDialog
						title={t('Start time is close')}
						acceptText={t('Yes')}
						secondaryText={t('No')}
						onAccept={this.oneMinuteBeforeAction}
						onDiscard={this.discard}
						onSecondary={this.discard}
						show={
							this.props.studioMode &&
							this.state.plannedStartCloseShow &&
							!(this.props.playlist.active && !this.props.playlist.rehearsal) &&
							this.props.playlist.active
						}>
						<p>
							{t(
								'You are in rehearsal mode, the broadcast starts in less than 1 minute. Do you want to reset the rundown and go into playout mode?'
							)}
						</p>
					</ModalDialog>
				)
			}
		}
	)
)
interface ITimingDisplayProps {
	rundownPlaylist: RundownPlaylist
}

export enum RundownViewKbdShortcuts {
	RUNDOWN_TAKE = 'f12',
	RUNDOWN_TAKE2 = 'enter', // is only going to use the rightmost enter key for take
	RUNDOWN_HOLD = 'h',
	RUNDOWN_UNDO_HOLD = 'shift+h',
	RUNDOWN_ACTIVATE = '§',
	RUNDOWN_ACTIVATE2 = '\\',
	RUNDOWN_ACTIVATE3 = '|',
	RUNDOWN_ACTIVATE_REHEARSAL = 'mod+§',
	RUNDOWN_DEACTIVATE = 'mod+shift+§',
	RUNDOWN_GO_TO_LIVE = 'mod+home',
	RUNDOWN_REWIND_SEGMENTS = 'shift+home',
	RUNDOWN_RESET_RUNDOWN = 'mod+shift+f12',
	RUNDOWN_RESET_RUNDOWN2 = 'mod+shift+enter',
	RUNDOWN_TOGGLE_SHELF = 'tab',
	ADLIB_QUEUE_MODIFIER = 'shift',
	RUNDOWN_NEXT_FORWARD = 'f9',
	RUNDOWN_NEXT_DOWN = 'f10',
	RUNDOWN_NEXT_BACK = 'shift+f9',
	RUNDOWN_NEXT_UP = 'shift+f10',
	RUNDOWN_DISABLE_NEXT_ELEMENT = 'g',
	RUNDOWN_UNDO_DISABLE_NEXT_ELEMENT = 'shift+g',
	RUNDOWN_LOG_ERROR = 'backspace',
	SHOW_CURRENT_SEGMENT_FULL_NONLATCH = '',
}

const TimingDisplay = withTranslation()(
	withTiming<ITimingDisplayProps & WithTranslation, {}>()(
		class TimingDisplay extends React.Component<Translated<WithTiming<ITimingDisplayProps>>> {
			render() {
				const { t } = this.props

				if (!this.props.rundownPlaylist) return null

				return (
					<div className="timing mod">
						{this.props.rundownPlaylist.startedPlayback &&
						this.props.rundownPlaylist.active &&
						!this.props.rundownPlaylist.rehearsal ? (
							<span className="timing-clock plan-start left">
								<span className="timing-clock-label left">{t('Started')}</span>
								<Moment interval={0} format="HH:mm:ss" date={this.props.rundownPlaylist.startedPlayback} />
							</span>
						) : (
							<span className="timing-clock plan-start left">
								<span className="timing-clock-label left">{t('Planned Start')}</span>
								<Moment interval={0} format="HH:mm:ss" date={this.props.rundownPlaylist.expectedStart} />
							</span>
						)}
						{this.props.rundownPlaylist.startedPlayback &&
						this.props.rundownPlaylist.active &&
						!this.props.rundownPlaylist.rehearsal ? (
							this.props.rundownPlaylist.expectedStart ? (
								<span className="timing-clock countdown playback-started left">
									<span
										className="timing-clock-label left hide-overflow rundown-name"
										title={this.props.rundownPlaylist.name}>
										{this.props.rundownPlaylist.name}
									</span>
									{RundownUtils.formatDiffToTimecode(
										this.props.rundownPlaylist.startedPlayback - this.props.rundownPlaylist.expectedStart,
										true,
										false,
										true,
										true,
										true
									)}
								</span>
							) : (
								<span className="timing-clock countdown playback-started left">
									<span
										className="timing-clock-label left hide-overflow rundown-name"
										title={this.props.rundownPlaylist.name}>
										{this.props.rundownPlaylist.name}
									</span>
								</span>
							)
						) : (
							(this.props.rundownPlaylist.expectedStart ? (
								<span
									className={ClassNames('timing-clock countdown plan-start left', {
										heavy: getCurrentTime() > this.props.rundownPlaylist.expectedStart,
									})}>
									<span
										className="timing-clock-label left hide-overflow rundown-name"
										title={this.props.rundownPlaylist.name}>
										{this.props.rundownPlaylist.name}
									</span>
									{RundownUtils.formatDiffToTimecode(
										getCurrentTime() - this.props.rundownPlaylist.expectedStart,
										true,
										false,
										true,
										true,
										true
									)}
								</span>
							) : (
								<span className={ClassNames('timing-clock countdown plan-start left')}>
									<span
										className="timing-clock-label left hide-overflow rundown-name"
										title={this.props.rundownPlaylist.name}>
										{this.props.rundownPlaylist.name}
									</span>
								</span>
							)) || undefined
						)}
						<span className="timing-clock time-now">
							<Moment interval={0} format="HH:mm:ss" date={getCurrentTime()} />
						</span>
						{this.props.rundownPlaylist.currentPartInstanceId && (
							<span className="timing-clock current-remaining">
								<CurrentPartRemaining
									currentPartInstanceId={this.props.rundownPlaylist.currentPartInstanceId}
									heavyClassName="overtime"
								/>
								<AutoNextStatus />
								{this.props.rundownPlaylist.holdState &&
								this.props.rundownPlaylist.holdState !== RundownHoldState.COMPLETE ? (
									<div className="rundown__header-status rundown__header-status--hold">{t('Hold')}</div>
								) : null}
							</span>
						)}
						{this.props.rundownPlaylist.expectedDuration ? (
							<React.Fragment>
								{this.props.rundownPlaylist.expectedStart && this.props.rundownPlaylist.expectedDuration && (
									<span className="timing-clock plan-end right visual-last-child">
										<span className="timing-clock-label right">{t('Planned End')}</span>
										<Moment
											interval={0}
											format="HH:mm:ss"
											date={this.props.rundownPlaylist.expectedStart + this.props.rundownPlaylist.expectedDuration}
										/>
									</span>
								)}
								{this.props.rundownPlaylist.expectedStart && this.props.rundownPlaylist.expectedDuration && (
									<span className="timing-clock countdown plan-end right">
										{RundownUtils.formatDiffToTimecode(
											getCurrentTime() -
												(this.props.rundownPlaylist.expectedStart + this.props.rundownPlaylist.expectedDuration),
											true,
											true,
											true
										)}
									</span>
								)}
								{this.props.rundownPlaylist.expectedDuration && (
									<span
										className={ClassNames('timing-clock heavy-light right', {
											heavy:
												(this.props.timingDurations.asPlayedRundownDuration || 0) <
												(this.props.rundownPlaylist.expectedDuration || 0),
											light:
												(this.props.timingDurations.asPlayedRundownDuration || 0) >
												(this.props.rundownPlaylist.expectedDuration || 0),
										})}>
										<span className="timing-clock-label right">{t('Diff')}</span>
										{RundownUtils.formatDiffToTimecode(
											(this.props.timingDurations.asPlayedRundownDuration || 0) -
												this.props.rundownPlaylist.expectedDuration,
											true,
											false,
											true,
											true,
											true,
											undefined,
											true
										)}
									</span>
								)}
							</React.Fragment>
						) : (
							<React.Fragment>
								{this.props.timingDurations ? (
									<span className="timing-clock plan-end right visual-last-child">
										<span className="timing-clock-label right">{t('Expected End')}</span>
										<Moment
											interval={0}
											format="HH:mm:ss"
											date={getCurrentTime() + (this.props.timingDurations.totalRundownDuration || 0)}
										/>
									</span>
								) : null}
								{this.props.timingDurations ? (
									<span
										className={ClassNames('timing-clock heavy-light right', {
											heavy:
												(this.props.timingDurations.asPlayedRundownDuration || 0) <
												(this.props.timingDurations.totalRundownDuration || 0),
											light:
												(this.props.timingDurations.asPlayedRundownDuration || 0) >
												(this.props.timingDurations.totalRundownDuration || 0),
										})}>
										<span className="timing-clock-label right">{t('Diff')}</span>
										{RundownUtils.formatDiffToTimecode(
											(this.props.timingDurations.asPlayedRundownDuration || 0) -
												(this.props.timingDurations.totalRundownDuration || 0),
											true,
											false,
											true,
											true,
											true,
											undefined,
											true
										)}
									</span>
								) : null}
							</React.Fragment>
						)}
					</div>
				)
			}
		}
	)
)

interface HotkeyDefinition {
	key: string
	label: string
}

interface IRundownHeaderProps {
	playlist: RundownPlaylist
	studio: Studio
	rundownIds: RundownId[]
	onActivate?: (isRehearsal: boolean) => void
	onRegisterHotkeys?: (hotkeys: Array<HotkeyDefinition>) => void
	studioMode: boolean
	inActiveRundownView?: boolean
}

interface IRundownHeaderState {
	isError: boolean
	errorMessage?: string
}

const RundownHeader = withTranslation()(
	class RundownHeader extends React.Component<Translated<IRundownHeaderProps>, IRundownHeaderState> {
		bindKeys: Array<{
			key: string
			up?: (e: KeyboardEvent) => any
			down?: (e: KeyboardEvent) => any
			label: string
			global?: boolean
			coolDown?: number
		}> = []
		constructor(props: Translated<IRundownHeaderProps>) {
			super(props)

			const { t } = props
			if (this.props.studioMode) {
				this.bindKeys = [
					{
						key: RundownViewKbdShortcuts.RUNDOWN_TAKE,
						up: this.keyTake,
						label: t('Take'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_TAKE2,
						up: this.keyTake,
						label: t('Take'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_HOLD,
						up: this.keyHold,
						label: t('Hold'),
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_UNDO_HOLD,
						up: this.keyHoldUndo,
						label: t('Undo Hold'),
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_ACTIVATE,
						up: this.keyActivate,
						label: t('Activate'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_ACTIVATE2,
						up: this.keyActivate,
						label: t('Activate'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_ACTIVATE3,
						up: this.keyActivate,
						label: t('Activate'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_DEACTIVATE,
						up: this.keyDeactivate,
						label: t('Deactivate'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_ACTIVATE_REHEARSAL,
						up: this.keyActivateRehearsal,
						label: t('Activate (Rehearsal)'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_RESET_RUNDOWN,
						up: this.keyResetRundown,
						label: t('Reset Rundown'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_RESET_RUNDOWN2,
						up: this.keyResetRundown,
						label: t('Reset Rundown'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_NEXT_FORWARD,
						up: this.keyMoveNextForward,
						label: t('Move Next forwards'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_NEXT_DOWN,
						up: this.keyMoveNextDown,
						label: t('Move Next to the following segment'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_NEXT_UP,
						up: this.keyMoveNextUp,
						label: t('Move Next to the previous segment'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_NEXT_BACK,
						up: this.keyMoveNextBack,
						label: t('Move Next backwards'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_DISABLE_NEXT_ELEMENT,
						up: this.keyDisableNextPiece,
						label: t('Disable the next element'),
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_UNDO_DISABLE_NEXT_ELEMENT,
						up: this.keyDisableNextPieceUndo,
						label: t('Undo Disable the next element'),
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_LOG_ERROR,
						up: this.keyLogError,
						label: t('Log Error'),
						coolDown: 1000,
					},
				]
			} else {
				this.bindKeys = []
			}
			this.state = {
				isError: false,
			}
		}
		componentDidMount() {
			// $(document).on("keydown", function(e) {
			// 	console.log(e)
			// })

			let preventDefault = (e: Event) => {
				e.preventDefault()
				e.stopImmediatePropagation()
				e.stopPropagation()
			}
			_.each(this.bindKeys, (k) => {
				const method = k.global ? mousetrapHelper.bindGlobal : mousetrapHelper.bind
				let lastUsed = Date.now()
				if (k.up) {
					method(
						k.key,
						(e: KeyboardEvent) => {
							preventDefault(e)
							if (k.coolDown && lastUsed > Date.now() - k.coolDown) return
							if (k.up) k.up(e)
							lastUsed = Date.now()
						},
						'keyup',
						'RundownHeader'
					)
					method(
						k.key,
						(e: KeyboardEvent) => {
							preventDefault(e)
						},
						'keydown',
						'RundownHeader'
					)
				}
				if (k.down) {
					method(
						k.key,
						(e: KeyboardEvent) => {
							preventDefault(e)
							if (k.coolDown && lastUsed > Date.now() - k.coolDown) return
							if (k.down) k.down(e)
							lastUsed = Date.now()
						},
						'keydown',
						'RundownHeader'
					)
				}
			})

			if (typeof this.props.onRegisterHotkeys === 'function') {
				this.props.onRegisterHotkeys(this.bindKeys)
			}

			reloadRundownPlaylistClick.set(this.reloadRundownPlaylist)
		}

		componentWillUnmount() {
			_.each(this.bindKeys, (k) => {
				if (k.up) {
					mousetrapHelper.unbind(k.key, 'RundownHeader', 'keyup')
					mousetrapHelper.unbind(k.key, 'RundownHeader', 'keydown')
				}
				if (k.down) {
					mousetrapHelper.unbind(k.key, 'RundownHeader', 'keydown')
				}
			})
		}
		keyTake = (e: ExtendedKeyboardEvent) => {
			if (e.key !== 'Enter' || e.location === 3) {
				// only allow the rightmost enter key
				if (!isModalShowing()) this.take(e)
			}
		}
		keyHold = (e: ExtendedKeyboardEvent) => {
			this.hold(e)
		}
		keyHoldUndo = (e: ExtendedKeyboardEvent) => {
			this.holdUndo(e)
		}
		keyActivate = (e: ExtendedKeyboardEvent) => {
			this.activate(e)
		}
		keyActivateRehearsal = (e: ExtendedKeyboardEvent) => {
			this.activateRehearsal(e)
		}

		keyDeactivate = (e: ExtendedKeyboardEvent) => {
			this.deactivate(e)
		}
		keyResetRundown = (e: ExtendedKeyboardEvent) => {
			this.resetRundown(e)
		}
		keyReloadRundown = (e: ExtendedKeyboardEvent) => {
			this.reloadRundownPlaylist(e)
		}
		keyMoveNextForward = (e: ExtendedKeyboardEvent) => {
			// "forward" = to next Part
			this.moveNext(e, 1, 0)
		}
		keyMoveNextBack = (e: ExtendedKeyboardEvent) => {
			// "down" = to next Segment
			this.moveNext(e, -1, 0)
		}
		keyMoveNextDown = (e: ExtendedKeyboardEvent) => {
			// "down" = to next Segment
			this.moveNext(e, 0, 1)
		}
		keyMoveNextUp = (e: ExtendedKeyboardEvent) => {
			// "down" = to next Segment
			this.moveNext(e, 0, -1)
		}
		keyDisableNextPiece = (e: ExtendedKeyboardEvent) => {
			this.disableNextPiece(e)
		}
		keyDisableNextPieceUndo = (e: ExtendedKeyboardEvent) => {
			this.disableNextPieceUndo(e)
		}
		keyLogError = (e: ExtendedKeyboardEvent) => {
			this.takeRundownSnapshot(e)
		}

		disableNextPiece = (e: any) => {
			const { t } = this.props

			if (this.props.studioMode) {
				doUserAction(t, e, UserAction.DISABLE_NEXT_PIECE, (e) =>
					MeteorCall.userAction.disableNextPiece(e, this.props.playlist._id, false)
				)
			}
		}

		disableNextPieceUndo = (e: any) => {
			const { t } = this.props

			if (this.props.studioMode) {
				doUserAction(t, e, UserAction.DISABLE_NEXT_PIECE, (e) =>
					MeteorCall.userAction.disableNextPiece(e, this.props.playlist._id, true)
				)
			}
		}

		take = (e: any) => {
			const { t } = this.props
			if (this.props.studioMode) {
				doUserAction(t, e, UserAction.TAKE, (e) => MeteorCall.userAction.take(e, this.props.playlist._id))
			}
		}

		moveNext = (e: any, horizonalDelta: number, verticalDelta: number) => {
			const { t } = this.props
			if (this.props.studioMode) {
				if (this.props.playlist.active) {
					doUserAction(
						t,
						e,
						UserAction.MOVE_NEXT,
						(e) => MeteorCall.userAction.moveNext(e, this.props.playlist._id, horizonalDelta, verticalDelta),
						(err, partId) => {
							if (!err && partId) {
								scrollToPart(partId).catch(() => console.error)
							}
						}
					)
				}
			}
		}

		discardError = () => {
			this.setState({
				isError: false,
			})
		}

		hold = (e: any) => {
			const { t } = this.props
			if (this.props.studioMode && this.props.playlist.active) {
				doUserAction(t, e, UserAction.ACTIVATE_HOLD, (e) =>
					MeteorCall.userAction.activateHold(e, this.props.playlist._id, false)
				)
			}
		}

		holdUndo = (e: any) => {
			const { t } = this.props
			if (
				this.props.studioMode &&
				this.props.playlist.active &&
				this.props.playlist.holdState === RundownHoldState.PENDING
			) {
				doUserAction(t, e, UserAction.ACTIVATE_HOLD, (e) =>
					MeteorCall.userAction.activateHold(e, this.props.playlist._id, true)
				)
			}
		}

		rundownShouldHaveStarted() {
			return getCurrentTime() > (this.props.playlist.expectedStart || 0)
		}
		rundownShouldHaveEnded() {
			return getCurrentTime() > (this.props.playlist.expectedStart || 0) + (this.props.playlist.expectedDuration || 0)
		}

		handleAnotherPlaylistActive = (
			playlistId: RundownPlaylistId,
			rehersal: boolean,
			err: ClientAPI.ClientResponseError,
			clb?: Function
		) => {
			const { t } = this.props

			function handleResult(err, response: void) {
				if (!err) {
					if (typeof clb === 'function') clb(response)
				} else {
					console.error(err)
					doModalDialog({
						title: t('Failed to activate'),
						message: t('Something went wrong, please contact the system administrator if the problem persists.'),
						acceptOnly: true,
						warning: true,
						yes: t('OK'),
						onAccept: () => {
							console.log()
						},
					})
				}
			}

			const otherRundowns = err.details as Rundown[]
			doModalDialog({
				title: t('Another Rundown is Already Active!'),
				message: t(
					'The rundown "{{rundownName}}" will need to be deactivated in order to activate this one.\n\nAre you sure you want to activate this one anyway?',
					{
						rundownName: otherRundowns.map((i) => i.name).join(', '),
					}
				),
				yes: t('Activate Anyway'),
				no: t('Cancel'),
				actions: [
					{
						label: t('Activate Anyway (GO ON AIR)'),
						classNames: 'btn-primary',
						on: (e) => {
							doUserAction(
								t,
								e,
								UserAction.DEACTIVATE_OTHER_RUNDOWN_PLAYLIST,
								(e) => MeteorCall.userAction.forceResetAndActivate(e, playlistId, false),
								handleResult
							)
						},
					},
				],
				warning: true,
				onAccept: (e) => {
					doUserAction(
						t,
						e,
						UserAction.DEACTIVATE_OTHER_RUNDOWN_PLAYLIST,
						(e) => MeteorCall.userAction.forceResetAndActivate(e, playlistId, rehersal),
						handleResult
					)
				},
			})
		}

		activate = (e: any) => {
			const { t } = this.props
			if (e.persist) e.persist()

			if (
				this.props.studioMode &&
				(!this.props.playlist.active || (this.props.playlist.active && this.props.playlist.rehearsal))
			) {
				const onSuccess = () => {
					this.deferFlushAndRewindSegments()
					if (typeof this.props.onActivate === 'function') this.props.onActivate(false)
				}
				const doActivate = () => {
					doUserAction(
						t,
						e,
						UserAction.ACTIVATE_RUNDOWN_PLAYLIST,
						(e) => MeteorCall.userAction.activate(e, this.props.playlist._id, false),
						(err) => {
							if (!err) {
								if (typeof this.props.onActivate === 'function') this.props.onActivate(false)
							} else if (ClientAPI.isClientResponseError(err)) {
								if (err.error === 409) {
									this.handleAnotherPlaylistActive(this.props.playlist._id, false, err, () => {
										if (typeof this.props.onActivate === 'function') this.props.onActivate(false)
									})
									return false
								}
							}
						}
					)
				}
				if (!this.rundownShouldHaveStarted()) {
					// The broadcast hasn't started yet
					doModalDialog({
						title: this.props.playlist.name,
						message: t('Do you want to activate this Rundown?'),
						onAccept: () => {
							this.rewindSegments()
							doUserAction(
								t,
								e,
								UserAction.RESET_AND_ACTIVATE_RUNDOWN_PLAYLIST,
								(e) => MeteorCall.userAction.resetAndActivate(e, this.props.playlist._id),
								(err) => {
									if (!err) {
										onSuccess()
									} else if (ClientAPI.isClientResponseError(err)) {
										if (err.error === 409) {
											this.handleAnotherPlaylistActive(this.props.playlist._id, false, err, onSuccess)
											return false
										}
									}
								}
							)
						},
					})
				} else if (!this.rundownShouldHaveEnded()) {
					// The broadcast has started
					doActivate()
				} else {
					// The broadcast has ended, going into active mode is probably not what you want to do
					doModalDialog({
						title: this.props.playlist.name,
						message: t('The planned end time has passed, are you sure you want to activate this Rundown?'),
						onAccept: () => {
							doActivate()
						},
					})
				}
			}
		}
		activateRehearsal = (e: any) => {
			const { t } = this.props
			if (e.persist) e.persist()

			if (
				this.props.studioMode &&
				(!this.props.playlist.active || (this.props.playlist.active && !this.props.playlist.rehearsal))
			) {
				const onSuccess = () => {
					if (typeof this.props.onActivate === 'function') this.props.onActivate(false)
				}
				let doActivateRehersal = () => {
					doUserAction(
						t,
						e,
						UserAction.ACTIVATE_RUNDOWN_PLAYLIST,
						(e) => MeteorCall.userAction.activate(e, this.props.playlist._id, true),
						(err) => {
							if (!err) {
								onSuccess()
							} else if (ClientAPI.isClientResponseError(err)) {
								if (err.error === 409) {
									this.handleAnotherPlaylistActive(this.props.playlist._id, true, err, onSuccess)
									return false
								}
							}
						}
					)
				}
				if (!this.rundownShouldHaveStarted()) {
					// The broadcast hasn't started yet
					if (!this.props.playlist.active) {
						// inactive, do the full preparation:
						doUserAction(
							t,
							e,
							UserAction.PREPARE_FOR_BROADCAST,
							(e) => MeteorCall.userAction.prepareForBroadcast(e, this.props.playlist._id),
							(err) => {
								if (!err) {
									onSuccess()
								} else if (ClientAPI.isClientResponseError(err)) {
									if (err.error === 409) {
										this.handleAnotherPlaylistActive(this.props.playlist._id, true, err, onSuccess)
										return false
									}
								}
							}
						)
					} else if (!this.props.playlist.rehearsal) {
						// Active, and not in rehearsal
						doModalDialog({
							title: this.props.playlist.name,
							message: t('Are you sure you want to activate Rehearsal Mode?'),
							onAccept: (e) => {
								doActivateRehersal()
							},
						})
					} else {
						// Already in rehersal, do nothing
					}
				} else {
					// The broadcast has started
					if (!this.rundownShouldHaveEnded()) {
						// We are in the broadcast
						doModalDialog({
							title: this.props.playlist.name,
							message: t('Are you sure you want to activate Rehearsal Mode?'),
							onAccept: (e) => {
								doActivateRehersal()
							},
						})
					} else {
						// The broadcast has ended
						doActivateRehersal()
					}
				}
			}
		}
		deactivate = (e: any) => {
			const { t } = this.props
			if (e.persist) e.persist()

			if (this.props.studioMode && this.props.playlist.active) {
				if (this.rundownShouldHaveStarted()) {
					if (this.props.playlist.rehearsal) {
						// We're in rehearsal mode
						doUserAction(t, e, UserAction.DEACTIVATE_RUNDOWN_PLAYLIST, (e) =>
							MeteorCall.userAction.deactivate(e, this.props.playlist._id)
						)
					} else {
						doModalDialog({
							title: this.props.playlist.name,
							message: t('Are you sure you want to deactivate this Rundown?\n(This will clear the outputs)'),
							warning: true,
							onAccept: () => {
								doUserAction(t, e, UserAction.DEACTIVATE_RUNDOWN_PLAYLIST, (e) =>
									MeteorCall.userAction.deactivate(e, this.props.playlist._id)
								)
							},
						})
					}
				} else {
					// Do it right away
					doUserAction(t, e, UserAction.DEACTIVATE_RUNDOWN_PLAYLIST, (e) =>
						MeteorCall.userAction.deactivate(e, this.props.playlist._id)
					)
				}
			}
		}

		resetRundown = (e: any) => {
			const { t } = this.props
			if (e.persist) e.persist()

			let doReset = () => {
				this.rewindSegments() // Do a rewind right away
				doUserAction(
					t,
					e,
					UserAction.RESET_RUNDOWN_PLAYLIST,
					(e) => MeteorCall.userAction.resetRundownPlaylist(e, this.props.playlist._id),
					() => {
						this.deferFlushAndRewindSegments()
					}
				)
			}
			if (this.props.playlist.active && !this.props.playlist.rehearsal && !Settings.allowRundownResetOnAir) {
				// The rundown is active and not in rehersal
				doModalDialog({
					title: this.props.playlist.name,
					message: t('The rundown can not be reset while it is active'),
					onAccept: () => {
						// nothing
					},
					acceptOnly: true,
					yes: 'OK',
				})
			} else {
				doReset()
			}
		}

		reloadRundownPlaylist = (e: any) => {
			const { t } = this.props
			if (this.props.studioMode) {
				doUserAction(
					t,
					e,
					UserAction.RELOAD_RUNDOWN_DATA,
					(e) => MeteorCall.userAction.reloadData(e, this.props.playlist._id),
					(err, reloadResponse) => {
						if (!err && reloadResponse) {
							if (!handleRundownPlaylistReloadResponse(t, this.props.playlist, reloadResponse)) {
								if (this.props.playlist && this.props.playlist.nextPartInstanceId) {
									scrollToPartInstance(this.props.playlist.nextPartInstanceId).catch(() => console.error)
								}
							}
						}
					}
				)
			}
		}

		takeRundownSnapshot = (e) => {
			const { t } = this.props
			if (this.props.studioMode) {
				doUserAction(
					t,
					e,
					UserAction.CREATE_SNAPSHOT_FOR_DEBUG,
					(e) => MeteorCall.userAction.storeRundownSnapshot(e, this.props.playlist._id, 'Taken by user'),
					undefined,
					t('A snapshot of the current Running\xa0Order has been created for troubleshooting.')
				)
			}
		}

		resetAndActivateRundown = (e: any) => {
			// Called from the ModalDialog, 1 minute before broadcast starts
			if (this.props.studioMode) {
				const { t } = this.props
				this.rewindSegments() // Do a rewind right away

				doUserAction(
					t,
					e,
					UserAction.RESET_AND_ACTIVATE_RUNDOWN_PLAYLIST,
					(e) => MeteorCall.userAction.resetAndActivate(e, this.props.playlist._id),
					(err) => {
						if (!err) {
							this.deferFlushAndRewindSegments()
							if (typeof this.props.onActivate === 'function') this.props.onActivate(false)
						}
					}
				)
			}
		}

		rewindSegments() {
			window.dispatchEvent(new Event(RundownViewEvents.rewindsegments))
		}
		deferFlushAndRewindSegments() {
			// Do a rewind later, when the UI has updated
			Meteor.defer(() => {
				Tracker.flush()
				Meteor.setTimeout(() => {
					this.rewindSegments()
					window.dispatchEvent(new Event(RundownViewEvents.goToTop))
				}, 500)
			})
		}

		render() {
			const { t } = this.props
			return (
				<React.Fragment>
					<Escape to="document">
						<ContextMenu id="rundown-context-menu">
							<div className="react-contextmenu-label">{this.props.playlist && this.props.playlist.name}</div>
							{this.props.studioMode ? (
								<React.Fragment>
									{!(this.props.playlist.active && this.props.playlist.rehearsal) ? (
										!this.rundownShouldHaveStarted() && !this.props.playlist.active ? (
											<MenuItem onClick={(e) => this.activateRehearsal(e)}>
												{t('Prepare Studio and Activate (Rehearsal)')}
											</MenuItem>
										) : (
											<MenuItem onClick={(e) => this.activateRehearsal(e)}>{t('Activate (Rehearsal)')}</MenuItem>
										)
									) : (
										<MenuItem onClick={(e) => this.activate(e)}>{t('Activate')}</MenuItem>
									)}
									{this.props.playlist.active ? (
										<MenuItem onClick={(e) => this.deactivate(e)}>{t('Deactivate')}</MenuItem>
									) : null}
									{this.props.playlist.active ? <MenuItem onClick={(e) => this.take(e)}>{t('Take')}</MenuItem> : null}
									{this.props.playlist.active ? <MenuItem onClick={(e) => this.hold(e)}>{t('Hold')}</MenuItem> : null}
									{!(
										this.props.playlist.active &&
										!this.props.playlist.rehearsal &&
										!Settings.allowRundownResetOnAir
									) ? (
										<MenuItem onClick={(e) => this.resetRundown(e)}>{t('Reset Rundown')}</MenuItem>
									) : null}
									<MenuItem onClick={(e) => this.reloadRundownPlaylist(e)}>{t('Reload ENPS Data')}</MenuItem>
									<MenuItem onClick={(e) => this.takeRundownSnapshot(e)}>{t('Store Snapshot')}</MenuItem>
								</React.Fragment>
							) : (
								<React.Fragment>
									<MenuItem>{t('No actions available')}</MenuItem>
								</React.Fragment>
							)}
						</ContextMenu>
					</Escape>
					<div
						className={ClassNames('header rundown', {
							active: this.props.playlist.active,
							'not-active': !this.props.playlist.active,

							rehearsal: this.props.playlist.rehearsal,
						})}>
						<ContextMenuTrigger
							id="rundown-context-menu"
							attributes={{
								className: 'flex-col col-timing horizontal-align-center',
							}}
							holdToDisplay={contextMenuHoldToDisplayTime()}>
							<WarningDisplay
								studioMode={this.props.studioMode}
								inActiveRundownView={this.props.inActiveRundownView}
								playlist={this.props.playlist}
								oneMinuteBeforeAction={this.resetAndActivateRundown}
							/>
							<div className="row first-row super-dark">
								<div className="flex-col left horizontal-align-left">
									<div className="badge mod">
										<Tooltip
											overlay={t('Add ?studio=1 to the URL to enter studio mode')}
											visible={getHelpMode() && !getAllowStudio()}
											placement="bottom">
											<div className="media-elem mrs sofie-logo" />
										</Tooltip>
										<div className="bd mls">
											<span className="logo-text"></span>
										</div>
									</div>
								</div>
								<div className="flex-col right horizontal-align-right">
									<div className="links mod close">
										<NavLink to="/rundowns">
											<CoreIcon.NrkClose />
										</NavLink>
									</div>
								</div>
								<TimingDisplay rundownPlaylist={this.props.playlist} />
								<RundownSystemStatus
									studio={this.props.studio}
									playlist={this.props.playlist}
									rundownIds={this.props.rundownIds}
								/>
							</div>
							<div className="row dark">
								<div className="col c12 rundown-overview">
									<RundownOverview rundownPlaylistId={this.props.playlist._id} />
								</div>
							</div>
						</ContextMenuTrigger>
					</div>
					<ModalDialog
						title={t('Error')}
						acceptText={t('OK')}
						show={!!this.state.isError}
						onAccept={this.discardError}
						onDiscard={this.discardError}>
						<p>{this.state.errorMessage}</p>
					</ModalDialog>
				</React.Fragment>
			)
		}
	}
)

interface IProps {
	match?: {
		params: {
			playlistId: RundownPlaylistId
		}
	}
	playlistId?: RundownPlaylistId
	inActiveRundownView?: boolean
	onlyShelf?: boolean
}

export interface IContextMenuContext {
	segment?: SegmentUi
	part?: PartUi | null

	partDocumentOffset?: OffsetPosition
	timeScale?: number
	mousePosition?: OffsetPosition
	partStartsAt?: number
}

interface IState {
	timeScale: number
	studioMode: boolean
	contextMenuContext: IContextMenuContext | null
	bottomMargin: string
	followLiveSegments: boolean
	manualSetAsNext: boolean
	subsReady: boolean
	usedHotkeys: Array<HotkeyDefinition>
	isNotificationsCenterOpen: boolean
	isSupportPanelOpen: boolean
	isInspectorShelfExpanded: boolean
	isClipTrimmerOpen: boolean
	selectedPiece: AdLibPieceUi | PieceUi | undefined
	rundownLayout: RundownLayout | undefined
}

export enum RundownViewEvents {
	'rewindsegments' = 'sofie:rundownRewindSegments',
	'goToLiveSegment' = 'sofie:goToLiveSegment',
	'goToTop' = 'sofie:goToTop',
	'segmentZoomOn' = 'sofie:segmentZoomOn',
	'segmentZoomOff' = 'sofie:segmentZoomOff',
	'revealInShelf' = 'sofie:revealInShelf',
	'switchShelfTab' = 'sofie:switchShelfTab',
	'goToPart' = 'sofie:goToPart',
	'goToPartInstance' = 'sofie:goToPartInstance',
	'selectPiece' = 'sofie:selectPiece',
}

export interface IGoToPartEvent {
	segmentId: SegmentId
	partId: PartId
}
export interface IGoToPartInstanceEvent {
	segmentId: SegmentId
	partInstanceId: PartInstanceId
}

type MatchedSegment = {
	rundown: Rundown
	segments: Segment[]
}

interface ITrackedProps {
	rundownPlaylistId: RundownPlaylistId
	rundowns: Rundown[]
	playlist?: RundownPlaylist
	matchedSegments: MatchedSegment[]
	studio?: Studio
	showStyleBase?: ShowStyleBase
	rundownLayouts?: Array<RundownLayoutBase>
	buckets: Bucket[]
	casparCGPlayoutDevices?: PeripheralDevice[]
	rundownLayoutId?: RundownLayoutId
	shelfDisplayOptions: {
		buckets: boolean
		layout: boolean
		inspector: boolean
	}
	bucketDisplayFilter: number[] | undefined
}
export const RundownView = translateWithTracker<IProps, IState, ITrackedProps>((props: IProps) => {
	let playlistId
	if (props.match && props.match.params.playlistId) {
		playlistId = decodeURIComponent(unprotectString(props.match.params.playlistId))
	} else if (props.playlistId) {
		playlistId = props.playlistId
	}

	const playlist = RundownPlaylists.findOne(playlistId)
	let rundowns: Rundown[] = []
	let studio: Studio | undefined
	if (playlist) {
		studio = Studios.findOne({ _id: playlist.studioId })
		rundowns = playlist.getRundowns()
	}

	const params = queryStringParse(location.search)

	const displayOptions = ((params['display'] as string) || 'buckets,layout,inspector').split(',')
	const bucketDisplayFilter = !(params['buckets'] as string)
		? undefined
		: (params['buckets'] as string).split(',').map((v) => parseInt(v))

	// let rundownDurations = calculateDurations(rundown, parts)
	return {
		rundownPlaylistId: playlistId,
		rundowns,
		matchedSegments: playlist
			? playlist.getRundownsAndSegments({
					isHidden: {
						$ne: true,
					},
			  })
			: [],
		playlist,
		studio: studio,
		showStyleBase: rundowns.length > 0 ? ShowStyleBases.findOne(rundowns[0].showStyleBaseId) : undefined,
		rundownLayouts:
			rundowns.length > 0 ? RundownLayouts.find({ showStyleBaseId: rundowns[0].showStyleBaseId }).fetch() : undefined,
		buckets:
			(playlist &&
				Buckets.find(
					{
						studioId: playlist.studioId,
					},
					{
						sort: {
							_rank: 1,
						},
					}
				).fetch()) ||
			[],
		casparCGPlayoutDevices:
			(studio &&
				PeripheralDevices.find({
					parentDeviceId: {
						$in: PeripheralDevices.find({
							studioId: studio._id,
						})
							.fetch()
							.map((i) => i._id),
					},
					type: PeripheralDeviceAPI.DeviceType.PLAYOUT,
					subType: TSR.DeviceType.CASPARCG,
				}).fetch()) ||
			undefined,
		rundownLayoutId: protectString((params['layout'] as string) || ''),
		shelfDisplayOptions: {
			buckets: displayOptions.includes('buckets'),
			layout: displayOptions.includes('layout'),
			inspector: displayOptions.includes('inspector'),
		},
		bucketDisplayFilter,
	}
})(
	class RundownView extends MeteorReactComponent<Translated<IProps & ITrackedProps>, IState> {
		private readonly LIVELINE_HISTORY_SIZE = 100

		private bindKeys: Array<{
			key: string
			up?: (e: KeyboardEvent) => any
			down?: (e: KeyboardEvent) => any
			label: string
			global?: boolean
		}> = []
		private usedArgumentKeys: Array<{
			key: string
			up?: (e: KeyboardEvent) => any
			down?: (e: KeyboardEvent) => any
			label: string
			global?: boolean
		}> = []
		private _segmentZoomOn: boolean = false

		constructor(props: Translated<IProps & ITrackedProps>) {
			super(props)

			const { t } = this.props

			this.bindKeys = [
				{
					key: RundownViewKbdShortcuts.RUNDOWN_GO_TO_LIVE,
					up: this.onGoToLiveSegment,
					label: t('Go to On Air line'),
					global: true,
				},
				{
					key: RundownViewKbdShortcuts.RUNDOWN_REWIND_SEGMENTS,
					up: this.onRewindSegments,
					label: t('Rewind segments to start'),
					global: true,
				},
			]

			if (RundownViewKbdShortcuts.SHOW_CURRENT_SEGMENT_FULL_NONLATCH) {
				this.bindKeys.push({
					key: RundownViewKbdShortcuts.SHOW_CURRENT_SEGMENT_FULL_NONLATCH,
					down: this.onShowCurrentSegmentFullOn,
					up: this.onShowCurrentSegmentFullOff,
					label: t('Show entire current segment'),
					global: false,
				})
			}

			this.usedArgumentKeys = []

			this.state = {
				timeScale: MAGIC_TIME_SCALE_FACTOR * Settings.defaultTimeScale,
				studioMode: getAllowStudio(),
				contextMenuContext: null,
				bottomMargin: '',
				followLiveSegments: true,
				manualSetAsNext: false,
				subsReady: false,
				usedHotkeys: _.clone(this.bindKeys).concat([
					// Register additional hotkeys or legend entries
					{
						key: 'Esc',
						label: t('Cancel currently pressed hotkey'),
					},
					{
						key: 'F11',
						label: t('Change to fullscreen mode'),
					},
				]),
				isNotificationsCenterOpen: false,
				isSupportPanelOpen: false,
				isInspectorShelfExpanded: false,
				isClipTrimmerOpen: false,
				selectedPiece: undefined,
				rundownLayout: undefined,
			}
		}

		static getDerivedStateFromProps(props: Translated<IProps & ITrackedProps>) {
			let selectedLayout: RundownLayoutBase | undefined = undefined

			if (props.rundownLayouts) {
				// first try to use the one selected by the user
				if (props.rundownLayoutId) {
					selectedLayout = props.rundownLayouts.find((i) => i._id === props.rundownLayoutId)
				}

				// if couldn't find based on id, try matching part of the name
				if (props.rundownLayoutId && !selectedLayout) {
					selectedLayout = props.rundownLayouts.find(
						(i) => i.name.indexOf(unprotectString(props.rundownLayoutId!)) >= 0
					)
				}

				// if not, try the first RUNDOWN_LAYOUT available
				if (!selectedLayout) {
					selectedLayout = props.rundownLayouts.find((i) => i.type === RundownLayoutType.RUNDOWN_LAYOUT)
				}

				// if still not found, use the first one
				if (!selectedLayout) {
					selectedLayout = props.rundownLayouts[0]
				}
			}

			return {
				rundownLayout: selectedLayout,
			}
		}

		componentDidMount() {
			let playlistId = this.props.rundownPlaylistId

			this.subscribe(PubSub.rundownPlaylists, {
				_id: playlistId,
			})
			this.subscribe(PubSub.rundowns, {
				playlistId,
			})
			this.autorun(() => {
				let playlist = RundownPlaylists.findOne(playlistId)
				if (playlist) {
					this.subscribe(PubSub.studios, {
						_id: playlist.studioId,
					})
					this.subscribe(PubSub.buckets, {
						studioId: playlist.studioId,
					})
				}
			})
			this.autorun(() => {
				let playlist = RundownPlaylists.findOne(playlistId)
				if (playlist) {
					const rundowns = playlist.getRundowns()
					this.subscribe(PubSub.showStyleBases, {
						_id: {
							$in: rundowns.map((i) => i.showStyleBaseId),
						},
					})
					this.subscribe(PubSub.rundownLayouts, {
						showStyleBaseId: {
							$in: rundowns.map((i) => i.showStyleBaseId),
						},
					})

					const rundownIDs = rundowns.map((i) => i._id)
					this.subscribe(PubSub.segments, {
						rundownId: {
							$in: rundownIDs,
						},
					})
					this.subscribe(PubSub.adLibPieces, {
						rundownId: {
							$in: rundownIDs,
						},
					})
					this.subscribe(PubSub.rundownBaselineAdLibPieces, {
						rundownId: {
							$in: rundownIDs,
						},
					})
					this.subscribe(PubSub.adLibActions, {
						rundownId: {
							$in: rundownIDs,
						},
					})
					this.subscribe(PubSub.rundownBaselineAdLibActions, {
						rundownId: {
							$in: rundownIDs,
						},
					})
				}
			})
			this.autorun(() => {
				let subsReady = this.subscriptionsReady()
				if (subsReady !== this.state.subsReady) {
					this.setState({
						subsReady: subsReady,
					})
				}
			})

			document.body.classList.add('dark', 'vertical-overflow-only')

			let preventDefault = (e) => {
				e.preventDefault()
				e.stopImmediatePropagation()
				e.stopPropagation()
			}
			_.each(this.bindKeys, (k) => {
				const method = k.global ? mousetrap.bindGlobal : mousetrap.bind
				if (k.up) {
					method(
						k.key,
						(e: KeyboardEvent) => {
							if (k.up) k.up(e)
						},
						'keyup'
					)
					method(
						k.key,
						(e: KeyboardEvent) => {
							preventDefault(e)
						},
						'keydown'
					)
				}
				if (k.down) {
					method(
						k.key,
						(e: KeyboardEvent) => {
							if (k.down) k.down(e)
						},
						'keydown'
					)
				}
			})

			rundownNotificationHandler.set(this.onRONotificationClick)

			window.addEventListener(RundownViewEvents.goToLiveSegment, this.onGoToLiveSegment)
			window.addEventListener(RundownViewEvents.goToTop, this.onGoToTop)

			if (this.props.playlist) {
				documentTitle.set(this.props.playlist.name)
			}

			const themeColor = document.head.querySelector('meta[name="theme-color"]')
			if (themeColor) {
				themeColor.setAttribute('data-content', themeColor.getAttribute('content') || '')
				themeColor.setAttribute('content', '#000000')
			}
		}

		componentDidUpdate(prevProps: IProps & ITrackedProps, prevState: IState) {
			if (
				this.props.playlist &&
				prevProps.playlist &&
				prevProps.playlist.currentPartInstanceId !== this.props.playlist.currentPartInstanceId &&
				this.state.manualSetAsNext
			) {
				this.setState({
					manualSetAsNext: false,
					followLiveSegments: true,
				})
			} else if (
				this.props.playlist &&
				prevProps.playlist &&
				prevProps.playlist.active &&
				!this.props.playlist.active
			) {
				this.setState({
					followLiveSegments: true,
				})
			} else if (
				this.props.playlist &&
				prevProps.playlist &&
				!prevProps.playlist.active &&
				this.props.playlist.active &&
				this.props.playlist.nextPartInstanceId
			) {
				scrollToPartInstance(this.props.playlist.nextPartInstanceId).catch(() => console.error)
			} else if (
				// after take
				this.props.playlist &&
				prevProps.playlist &&
				this.props.playlist.currentPartInstanceId !== prevProps.playlist.currentPartInstanceId &&
				this.props.playlist.currentPartInstanceId &&
				this.state.followLiveSegments
			) {
				scrollToPartInstance(this.props.playlist.currentPartInstanceId, true).catch(() => console.error)
			} else if (
				// initial Rundown open
				this.props.playlist &&
				this.props.playlist.currentPartInstanceId &&
				this.state.subsReady &&
				!prevState.subsReady
			) {
				// allow for some time for the Rundown to render
				maintainFocusOnPartInstance(this.props.playlist.currentPartInstanceId, 7000, true, true)
			}

			if (
				typeof this.props.playlist !== typeof prevProps.playlist ||
				(this.props.playlist || { _id: '' })._id !== (prevProps.playlist || { _id: '' })._id ||
				(this.props.playlist || { active: false }).active !== (prevProps.playlist || { active: false }).active ||
				this.state.studioMode !== prevState.studioMode
			) {
				if (this.props.playlist && this.props.playlist.active && this.state.studioMode && !getAllowDeveloper()) {
					window.addEventListener('beforeunload', this.onBeforeUnload)
				} else {
					window.removeEventListener('beforeunload', this.onBeforeUnload)
				}
			}

			if (
				typeof this.props.showStyleBase !== typeof prevProps.showStyleBase ||
				(this.props.showStyleBase && this.props.showStyleBase.runtimeArguments)
			) {
				this.refreshHotkeys()
			}

			if (
				typeof this.props.playlist !== typeof prevProps.playlist ||
				(this.props.playlist || { name: '' }).name !== (prevProps.playlist || { name: '' }).name
			) {
				if (this.props.playlist && this.props.playlist.name) {
					documentTitle.set(this.props.playlist.name)
				} else {
					documentTitle.set(null)
				}
			}
		}

		refreshHotkeys = () => {
			const { t } = this.props
			let preventDefault = (e) => {
				e.preventDefault()
				e.stopImmediatePropagation()
				e.stopPropagation()
			}
			const noOp = (e) => {
				preventDefault(e)
			}

			this.usedArgumentKeys.forEach((k) => {
				if (k.up) {
					mousetrapHelper.unbind(k.key, 'RuntimeArguments', 'keyup')
					mousetrapHelper.unbind(k.key, 'RuntimeArguments', 'keydown')
				}
				if (k.down) {
					mousetrapHelper.unbind(k.key, 'RuntimeArguments', 'keydown')
				}
			})
			this.usedArgumentKeys = []

			if (this.props.showStyleBase) {
				_.each(this.props.showStyleBase.runtimeArguments, (i) => {
					const combos = i.hotkeys.split(',')

					const handler = (e: KeyboardEvent) => {
						if (this.props.playlist && this.props.playlist.active && this.props.playlist.nextPartInstanceId) {
							const playlistId = this.props.playlist._id
							const nextPartInstanceId = this.props.playlist.nextPartInstanceId
							doUserAction(t, e, UserAction.TOGGLE_PART_ARGUMENT, (e) =>
								MeteorCall.userAction.togglePartArgument(e, playlistId, nextPartInstanceId, i.property, i.value)
							)
						}
					}
					_.each(combos, (combo: string) => {
						mousetrapHelper.bind(combo, handler, 'keyup', 'RuntimeArguments')
						mousetrapHelper.bind(combo, noOp, 'keydown', 'RuntimeArguments')
						this.usedArgumentKeys.push({
							up: handler,
							key: combo,
							label: i.label || '',
						})
					})
				})
			}
		}

		onSelectPiece = (piece: PieceUi) => {
			if (piece) {
				const vtContent = piece.instance.piece.content as VTContent | undefined
				if (
					vtContent &&
					vtContent.editable &&
					(vtContent.editable.editorialDuration !== undefined || vtContent.editable.editorialStart !== undefined)
				) {
					this.setState({
						isClipTrimmerOpen: true,
						selectedPiece: piece,
					})
				} else {
					window.dispatchEvent(
						new CustomEvent<{
							piece: PieceUi | AdLibPieceUi | undefined
						}>(RundownViewEvents.selectPiece, {
							detail: {
								piece: piece,
							},
						})
					)
				}
			}
		}

		componentWillUnmount() {
			this._cleanUp()
			document.body.classList.remove('dark', 'vertical-overflow-only')
			// window.removeEventListener('scroll', this.onWindowScroll)
			window.removeEventListener('beforeunload', this.onBeforeUnload)

			_.each(this.bindKeys, (k) => {
				if (k.up) {
					mousetrap.unbind(k.key, 'keyup')
					mousetrap.unbind(k.key, 'keydown')
				}
				if (k.down) {
					mousetrap.unbind(k.key, 'keydown')
				}
			})

			_.each(this.usedArgumentKeys, (k) => {
				if (k.up) {
					mousetrapHelper.unbind(k.key, 'RuntimeArguments', 'keyup')
					mousetrapHelper.unbind(k.key, 'RuntimeArguments', 'keydown')
				}
				if (k.down) {
					mousetrapHelper.unbind(k.key, 'RuntimeArguments', 'keydown')
				}
			})

			documentTitle.set(null)

			const themeColor = document.head.querySelector('meta[name="theme-color"]')
			if (themeColor) {
				themeColor.setAttribute('content', themeColor.getAttribute('data-content') || '#ffffff')
			}

			window.removeEventListener(RundownViewEvents.goToLiveSegment, this.onGoToLiveSegment)
			window.removeEventListener(RundownViewEvents.goToTop, this.onGoToTop)
		}

		onBeforeUnload = (e: any) => {
			const { t } = this.props

			e.preventDefault()
			e.returnValue = t('This rundown is now active. Are you sure you want to exit this screen?')

			return t('This rundown is now active. Are you sure you want to exit this screen?')
		}

		onRewindSegments = () => {
			window.dispatchEvent(new Event(RundownViewEvents.rewindsegments))
		}

		onShowCurrentSegmentFullOn = () => {
			if (this._segmentZoomOn === false) {
				console.log(`Dispatching event: ${RundownViewEvents.segmentZoomOn}`)
				window.dispatchEvent(new Event(RundownViewEvents.segmentZoomOn))
				this._segmentZoomOn = true
			}
		}

		onShowCurrentSegmentFullOff = () => {
			console.log(`Dispatching event: ${RundownViewEvents.segmentZoomOff}`)
			window.dispatchEvent(new Event(RundownViewEvents.segmentZoomOff))
			this._segmentZoomOn = false
		}

		onTimeScaleChange = (timeScaleVal) => {
			if (Number.isFinite(timeScaleVal) && timeScaleVal > 0) {
				this.setState({
					timeScale: timeScaleVal,
				})
			}
		}

		onSegmentScroll = () => {
			if (this.state.followLiveSegments && this.props.playlist && this.props.playlist.active) {
				this.setState({
					followLiveSegments: false,
				})
			}
		}

		// onWindowScroll = (e: Event) => {
		// 	console.log('Scroll handler')
		// 	const isAutoScrolling = document.body.classList.contains('auto-scrolling')
		// 	if (this.state.followLiveSegments && !isAutoScrolling && this.props.rundown && this.props.rundown.active) {
		// 		this.setState({
		// 			followLiveSegments: false
		// 		})
		// 	}
		// }

		onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
			if (
				!e.altKey &&
				e.ctrlKey &&
				!e.shiftKey &&
				!e.metaKey &&
				// @ts-ignore
				!window.keyboardModifiers.altRight &&
				e.deltaY !== 0
			) {
				this.onTimeScaleChange(Math.min(500, this.state.timeScale * (1 + 0.001 * (e.deltaY * -1))))
				e.preventDefault()
			}
		}

		onGoToTop = () => {
			scrollToPosition(0).catch(console.error)

			window.requestIdleCallback(
				() => {
					this.setState({
						followLiveSegments: true,
					})
				},
				{ timeout: 1000 }
			)
		}
		onGoToLiveSegment = () => {
			if (
				this.props.playlist &&
				this.props.playlist.active &&
				!this.props.playlist.currentPartInstanceId &&
				this.props.playlist.nextPartInstanceId
			) {
				this.setState({
					followLiveSegments: true,
				})
				scrollToPartInstance(this.props.playlist.nextPartInstanceId, true).catch(console.error)
				setTimeout(() => {
					this.setState({
						followLiveSegments: true,
					})
					window.dispatchEvent(new Event(RundownViewEvents.rewindsegments))
				}, 2000)
			} else if (this.props.playlist && this.props.playlist.active && this.props.playlist.currentPartInstanceId) {
				this.setState({
					followLiveSegments: true,
				})
				scrollToPartInstance(this.props.playlist.currentPartInstanceId, true).catch(console.error)
				setTimeout(() => {
					this.setState({
						followLiveSegments: true,
					})
					window.dispatchEvent(new Event(RundownViewEvents.rewindsegments))
				}, 2000)
			} else {
				this.setState({
					followLiveSegments: true,
				})
			}
		}

		onActivate = () => {
			this.onGoToLiveSegment()
		}

		onContextMenu = (contextMenuContext: IContextMenuContext) => {
			this.setState({
				contextMenuContext,
			})
		}

		onSetNext = (part: Part, e: any, offset?: number, take?: boolean) => {
			const { t } = this.props
			if (this.state.studioMode && part && part._id && this.props.playlist) {
				const playlistId = this.props.playlist._id
				doUserAction(
					t,
					e,
					UserAction.SET_NEXT,
					(e) => MeteorCall.userAction.setNext(e, playlistId, part._id, offset),
					(err) => {
						this.setState({
							manualSetAsNext: true,
						})
						if (!err && take && this.props.playlist) {
							const playlistId = this.props.playlist._id
							doUserAction(t, e, UserAction.TAKE, (e) => MeteorCall.userAction.take(e, playlistId))
						}
					}
				)
			}
		}
		onSetNextSegment = (segmentId: SegmentId | null, e: any) => {
			const { t } = this.props
			if (this.state.studioMode && (segmentId || segmentId === null) && this.props.playlist) {
				const playlistId = this.props.playlist._id
				doUserAction(
					t,
					e,
					UserAction.SET_NEXT,
					(e) => MeteorCall.userAction.setNextSegment(e, playlistId, segmentId),
					(err, res) => {
						if (err) console.error(err)
						this.setState({
							manualSetAsNext: true,
						})
					}
				)
			}
		}

		onResyncSegment = (segmentId: SegmentId, e: any) => {
			const { t } = this.props
			if (this.state.studioMode && this.props.rundownPlaylistId) {
				doUserAction(t, e, UserAction.RESYNC_SEGMENT, (e) => MeteorCall.userAction.resyncSegment(e, segmentId))
			}
		}

		onPieceDoubleClick = (item: PieceUi, e: React.MouseEvent<HTMLDivElement>) => {
			const { t } = this.props
			if (
				this.state.studioMode &&
				item &&
				item.instance &&
				this.props.playlist &&
				this.props.playlist.currentPartInstanceId
			) {
				const idToCopy = item.instance.isTemporary ? item.instance.piece._id : item.instance._id
				const playlistId = this.props.playlist._id
				const currentPartInstanceId = this.props.playlist.currentPartInstanceId
				doUserAction(t, e, UserAction.TAKE_PIECE, (e) =>
					MeteorCall.userAction.pieceTakeNow(e, playlistId, currentPartInstanceId, idToCopy)
				)
			}
		}

		onRONotificationClick = (e: RONotificationEvent) => {
			if (e.sourceLocator) {
				let segmentId = e.sourceLocator.segmentId

				if (!segmentId) {
					if (e.sourceLocator.partId) {
						let part = Parts.findOne(e.sourceLocator.partId)
						if (part) {
							segmentId = part.segmentId
						}
					}
				}
				if (segmentId) {
					scrollToSegment(segmentId).catch(console.error)
				}
			}
		}
		onHeaderNoteClick = (segmentId: SegmentId, level: NoteType) => {
			NotificationCenter.snoozeAll()
			const isOpen = this.state.isNotificationsCenterOpen
			this.setState({
				isNotificationsCenterOpen: true,
			})
			setTimeout(
				function() {
					NotificationCenter.highlightSource(
						segmentId,
						level === NoteType.ERROR ? NoticeLevel.CRITICAL : NoticeLevel.WARNING
					)
				},
				isOpen ? 1 : 1000
			)
		}

		onToggleSupportPanel = () => {
			this.setState({
				isSupportPanelOpen: !this.state.isSupportPanelOpen,
			})
		}

		renderSegments() {
			if (this.props.matchedSegments) {
				let globalIndex = 0
				return this.props.matchedSegments.map((rundownAndSegments, rundownIndex, rundownArray) => (
					<React.Fragment key={unprotectString(rundownAndSegments.rundown._id)}>
						{this.props.matchedSegments.length > 1 && (
							<RundownDividerHeader
								key={`rundown_${rundownAndSegments.rundown._id}`}
								rundown={rundownAndSegments.rundown}
							/>
						)}
						{rundownAndSegments.segments.map((segment, segmentIndex, segmentArray) => {
							if (this.props.studio && this.props.playlist && this.props.showStyleBase) {
								return (
									<ErrorBoundary key={unprotectString(segment._id)}>
										<VirtualElement
											id={SEGMENT_TIMELINE_ELEMENT_ID + segment._id}
											margin={'100% 0px 100% 0px'}
											initialShow={globalIndex++ < window.innerHeight / 260}
											placeholderHeight={260}
											placeholderClassName="placeholder-shimmer-element segment-timeline-placeholder"
											width="auto">
											<SegmentTimelineContainer
												id={SEGMENT_TIMELINE_ELEMENT_ID + segment._id}
												studio={this.props.studio}
												showStyleBase={this.props.showStyleBase}
												followLiveSegments={this.state.followLiveSegments}
												segmentId={segment._id}
												playlist={this.props.playlist}
												liveLineHistorySize={this.LIVELINE_HISTORY_SIZE}
												timeScale={this.state.timeScale}
												onTimeScaleChange={this.onTimeScaleChange}
												onContextMenu={this.onContextMenu}
												onSegmentScroll={this.onSegmentScroll}
												isLastSegment={
													rundownIndex === rundownArray.length - 1 && segmentIndex === segmentArray.length - 1
												}
												onPieceClick={this.onSelectPiece}
												onPieceDoubleClick={this.onPieceDoubleClick}
												onHeaderNoteClick={(level) => this.onHeaderNoteClick(segment._id, level)}
											/>
										</VirtualElement>
									</ErrorBoundary>
								)
							}
						})}
					</React.Fragment>
				))
			} else {
				return <div></div>
			}
		}

		renderSegmentsList() {
			if (this.props.playlist && this.props.rundowns.length) {
				return <div className="segment-timeline-container">{this.renderSegments()}</div>
			} else {
				return (
					<div className="mod">
						<Spinner />
					</div>
				)
			}
		}

		onChangeBottomMargin = (newBottomMargin: string) => {
			this.setState({
				bottomMargin: newBottomMargin,
			})
		}

		onRegisterHotkeys = (hotkeys: Array<HotkeyDefinition>) => {
			// @ts-ignore
			this.state.usedHotkeys = this.state.usedHotkeys.concat(hotkeys) // we concat directly to the state object member, because we need to
			this.setState({
				usedHotkeys: this.state.usedHotkeys,
			})
		}

		onContextMenuTop = (e: React.MouseEvent<HTMLDivElement>): boolean => {
			if (!getAllowDeveloper()) {
				e.preventDefault()
				e.stopPropagation()
			}
			return false
		}

		onToggleNotifications = () => {
			if (!this.state.isNotificationsCenterOpen === true) {
				NotificationCenter.highlightSource(undefined, NoticeLevel.CRITICAL)
			}

			NotificationCenter.isOpen = !this.state.isNotificationsCenterOpen

			this.setState({
				isNotificationsCenterOpen: !this.state.isNotificationsCenterOpen,
			})
		}

		onToggleHotkeys = () => {
			if (!this.state.isInspectorShelfExpanded) {
				this.setState({
					isInspectorShelfExpanded: true,
				})
				window.dispatchEvent(
					new CustomEvent(RundownViewEvents.switchShelfTab, {
						detail: {
							tab: ShelfTabs.SYSTEM_HOTKEYS,
						},
					})
				)
			} else {
				this.setState({
					isInspectorShelfExpanded: false,
				})
			}
		}

		onRestartPlayout = (e: React.MouseEvent<HTMLButtonElement>) => {
			const { t } = this.props

			if (this.props.studio) {
				const attachedPlayoutGateways = PeripheralDevices.find({
					studioId: this.props.studio._id,
					connected: true,
					type: PeripheralDeviceAPI.DeviceType.PLAYOUT,
				}).fetch()
				if (attachedPlayoutGateways.length === 0) {
					NotificationCenter.push(
						new Notification(
							undefined,
							NoticeLevel.CRITICAL,
							t(
								'There are no Playout\xa0Gateways connected and attached to this studio. Please contact the system administrator to start the Playout Gateway.'
							),
							'RundownView'
						)
					)
					return
				}
				attachedPlayoutGateways.forEach((item) => {
					PeripheralDevicesAPI.restartDevice(item, e)
						.then(() => {
							NotificationCenter.push(
								new Notification(
									undefined,
									NoticeLevel.NOTIFICATION,
									t('Playout\xa0Gateway "{{playoutDeviceName}}" is now restarting.', { playoutDeviceName: item.name }),
									'RundownView'
								)
							)
						})
						.catch(() => {
							NotificationCenter.push(
								new Notification(
									undefined,
									NoticeLevel.CRITICAL,
									t('Could not restart Playout\xa0Gateway "{{playoutDeviceName}}".', { playoutDeviceName: item.name }),
									'RundownView'
								)
							)
						})
				})
			}
		}

		onRestartCasparCG = (device: PeripheralDevice) => {
			const { t } = this.props

			doModalDialog({
				title: t('Restart CasparCG Server'),
				message: t('Do you want to restart CasparCG Server "{{device}}"?', { device: device.name }),
				onAccept: (event: any) => {
					callPeripheralDeviceFunction(event, device._id, 'restartCasparCG')
						.then(() => {
							NotificationCenter.push(
								new Notification(
									undefined,
									NoticeLevel.NOTIFICATION,
									t('CasparCG on device "{{deviceName}}" restarting...', { deviceName: device.name }),
									'SystemStatus'
								)
							)
						})
						.catch((err) => {
							NotificationCenter.push(
								new Notification(
									undefined,
									NoticeLevel.WARNING,
									t('Failed to restart CasparCG on device: "{{deviceName}}": {{errorMessage}}', {
										deviceName: device.name,
										errorMessage: err + '',
									}),
									'SystemStatus'
								)
							)
						})
				},
			})
		}

		onTakeRundownSnapshot = (e: React.MouseEvent<HTMLButtonElement>) => {
			const { t } = this.props
			if (this.props.playlist) {
				const playlistId = this.props.playlist._id
				doUserAction(
					t,
					e,
					UserAction.CREATE_SNAPSHOT_FOR_DEBUG,
					(e) => MeteorCall.userAction.storeRundownSnapshot(e, playlistId, 'User requested log at' + getCurrentTime()),
					undefined,
					t('A snapshot of the current Running\xa0Order has been created for troubleshooting.')
				)
			}
		}

		onShelfChangeExpanded = (value: boolean) => {
			this.setState({
				isInspectorShelfExpanded: value,
			})
		}

		onTake = (e: any) => {
			const { t } = this.props
			if (this.state.studioMode && this.props.playlist) {
				const playlistId = this.props.playlist._id
				doUserAction(t, e, UserAction.TAKE, (e) => MeteorCall.userAction.take(e, playlistId))
			}
		}

		getStyle() {
			return {
				marginBottom: this.state.bottomMargin,
			}
		}

		render() {
			const { t } = this.props

			if (this.state.subsReady) {
				if (this.props.playlist && this.props.studio && this.props.showStyleBase && !this.props.onlyShelf) {
					return (
						<RundownTimingProvider playlist={this.props.playlist} defaultDuration={Settings.defaultDisplayDuration}>
							<div
								className={ClassNames('rundown-view', {
									'notification-center-open': this.state.isNotificationsCenterOpen,
									'rundown-view--studio-mode': this.state.studioMode,
								})}
								style={this.getStyle()}
								onWheelCapture={this.onWheel}
								onContextMenu={this.onContextMenuTop}>
								<ErrorBoundary>
									{this.state.studioMode && !Settings.disableBlurBorder && (
										<KeyboardFocusIndicator>
											<div className="rundown-view__focus-lost-frame"></div>
										</KeyboardFocusIndicator>
									)}
								</ErrorBoundary>
								<ErrorBoundary>
									<RundownFullscreenControls
										isFollowingOnAir={this.state.followLiveSegments}
										onFollowOnAir={this.onGoToLiveSegment}
										onRewindSegments={this.onRewindSegments}
										isNotificationCenterOpen={this.state.isNotificationsCenterOpen}
										onToggleNotifications={this.onToggleNotifications}
										isSupportPanelOpen={this.state.isSupportPanelOpen}
										onToggleSupportPanel={this.onToggleSupportPanel}
										isStudioMode={this.state.studioMode}
										onTake={this.onTake}
									/>
								</ErrorBoundary>
								<ErrorBoundary>
									<VelocityReact.VelocityTransitionGroup
										enter={{
											animation: {
												translateX: ['0%', '100%'],
											},
											easing: 'ease-out',
											duration: 300,
										}}
										leave={{
											animation: {
												translateX: ['100%', '0%'],
											},
											easing: 'ease-in',
											duration: 500,
										}}>
										{this.state.isNotificationsCenterOpen && <NotificationCenterPanel />}
									</VelocityReact.VelocityTransitionGroup>
									<VelocityReact.VelocityTransitionGroup
										enter={{
											animation: {
												translateX: ['0%', '100%'],
											},
											easing: 'ease-out',
											duration: 300,
										}}
										leave={{
											animation: {
												translateX: ['100%', '0%'],
											},
											easing: 'ease-in',
											duration: 500,
										}}>
										{this.state.isSupportPanelOpen && (
											<SupportPopUp>
												<button className="btn btn-primary" onClick={this.onToggleHotkeys}>
													{t('Show Hotkeys')}
												</button>
												<button className="btn btn-primary" onClick={this.onTakeRundownSnapshot}>
													{t('Take a Snapshot')}
												</button>
												{this.state.studioMode && (
													<button className="btn btn-primary" onClick={this.onRestartPlayout}>
														{t('Restart Playout')}
													</button>
												)}
												{this.state.studioMode &&
													this.props.casparCGPlayoutDevices &&
													this.props.casparCGPlayoutDevices.map((i) => (
														<button
															className="btn btn-primary"
															onClick={() => this.onRestartCasparCG(i)}
															key={unprotectString(i._id)}>
															{t('Restart {{device}}', { device: i.name })}
														</button>
													))}
											</SupportPopUp>
										)}
									</VelocityReact.VelocityTransitionGroup>
								</ErrorBoundary>
								<ErrorBoundary>
									{this.state.studioMode && (
										<Prompt
											when={this.props.playlist.active || false}
											message={t('This rundown is now active. Are you sure you want to exit this screen?')}
										/>
									)}
								</ErrorBoundary>
								<ErrorBoundary>
									<RundownHeader
										playlist={this.props.playlist}
										studio={this.props.studio}
										rundownIds={this.props.rundowns.map((r) => r._id)}
										onActivate={this.onActivate}
										studioMode={this.state.studioMode}
										onRegisterHotkeys={this.onRegisterHotkeys}
										inActiveRundownView={this.props.inActiveRundownView}
									/>
								</ErrorBoundary>
								<ErrorBoundary>
									<NoraPreviewRenderer />
								</ErrorBoundary>
								<ErrorBoundary>
									<SegmentContextMenu
										contextMenuContext={this.state.contextMenuContext}
										playlist={this.props.playlist}
										onSetNext={this.onSetNext}
										onSetNextSegment={this.onSetNextSegment}
										onResyncSegment={this.onResyncSegment}
										studioMode={this.state.studioMode}
										enablePlayFromAnywhere={!!this.props.studio.settings.enablePlayFromAnywhere}
									/>
								</ErrorBoundary>
								<ErrorBoundary>
									{this.state.isClipTrimmerOpen &&
										this.state.selectedPiece &&
										RundownUtils.isPieceInstance(this.state.selectedPiece) &&
										this.props.studio &&
										this.props.playlist && (
											<ClipTrimDialog
												studio={this.props.studio}
												playlistId={this.props.playlist._id}
												selectedPiece={this.state.selectedPiece.instance.piece}
												onClose={() => this.setState({ isClipTrimmerOpen: false })}
											/>
										)}
								</ErrorBoundary>
								{this.renderSegmentsList()}
								<ErrorBoundary>
									{this.props.matchedSegments && this.props.matchedSegments.length > 0 && (
										<AfterBroadcastForm playlist={this.props.playlist} />
									)}
								</ErrorBoundary>
								<ErrorBoundary>
									<PointerLockCursor />
								</ErrorBoundary>
								<ErrorBoundary>
									<Shelf
										buckets={this.props.buckets}
										isExpanded={this.state.isInspectorShelfExpanded}
										onChangeExpanded={this.onShelfChangeExpanded}
										hotkeys={this.state.usedHotkeys}
										playlist={this.props.playlist}
										showStyleBase={this.props.showStyleBase}
										studioMode={this.state.studioMode}
										onChangeBottomMargin={this.onChangeBottomMargin}
										onRegisterHotkeys={this.onRegisterHotkeys}
										rundownLayout={this.state.rundownLayout}
										shelfDisplayOptions={this.props.shelfDisplayOptions}
										bucketDisplayFilter={this.props.bucketDisplayFilter}
									/>
								</ErrorBoundary>
								<ErrorBoundary>
									{this.props.playlist && this.props.studio && this.props.showStyleBase && (
										<RundownNotifier
											playlistId={this.props.playlist._id}
											studio={this.props.studio}
											showStyleBase={this.props.showStyleBase}
										/>
									)}
								</ErrorBoundary>
							</div>
							{
								// USE IN CASE OF DEBUGGING EMERGENCY
								/* getDeveloperMode() && <div id='debug-console' className='debug-console' style={{
							background: 'rgba(255,255,255,0.7)',
							color: '#000',
							position: 'fixed',
							top: '0',
							right: '0',
							zIndex: 10000,
							pointerEvents: 'none'
						}}>
						</div> */
							}
						</RundownTimingProvider>
					)
				} else if (this.props.playlist && this.props.studio && this.props.showStyleBase && this.props.onlyShelf) {
					return (
						<ErrorBoundary>
							<Shelf
								buckets={this.props.buckets}
								isExpanded={this.state.isInspectorShelfExpanded}
								onChangeExpanded={this.onShelfChangeExpanded}
								hotkeys={this.state.usedHotkeys}
								playlist={this.props.playlist}
								showStyleBase={this.props.showStyleBase}
								studioMode={this.state.studioMode}
								onChangeBottomMargin={this.onChangeBottomMargin}
								onRegisterHotkeys={this.onRegisterHotkeys}
								rundownLayout={this.state.rundownLayout}
								fullViewport={true}
								shelfDisplayOptions={this.props.shelfDisplayOptions}
								bucketDisplayFilter={this.props.bucketDisplayFilter}
							/>
						</ErrorBoundary>
					)
				} else {
					return (
						<div className="rundown-view rundown-view--unpublished">
							<div className="rundown-view__label">
								<p>
									{!this.props.playlist
										? t('This rundown has been unpublished from Sofie.')
										: !this.props.studio
										? t('Error: The studio of this Rundown was not found.')
										: !this.props.rundowns.length
										? t('This playlist is empty')
										: !this.props.showStyleBase
										? t('Error: The ShowStyle of this Rundown was not found.')
										: t('Unknown error')}
								</p>
								<p>
									<Route
										render={({ history }) => (
											<button
												className="btn btn-primary"
												onClick={() => {
													history.push('/rundowns')
												}}>
												{t('Return to list')}
											</button>
										)}
									/>
								</p>
							</div>
						</div>
					)
				}
			} else {
				return (
					<div className="rundown-view rundown-view--loading">
						<Spinner />
					</div>
				)
			}
		}
	}
)

export function handleRundownPlaylistReloadResponse(
	t: i18next.TFunction,
	rundownPlaylist: RundownPlaylist,
	result: ReloadRundownPlaylistResponse
): boolean {
	let hasDoneSomething = false

	let maybeMissingRundownId: RundownId | null = null
	_.each(result.rundownsResponses, (r) => {
		if (r.response === TriggerReloadDataResponse.MISSING) {
			maybeMissingRundownId = r.rundownId
		}
	})
	if (maybeMissingRundownId) {
		const missingRundownId: RundownId = maybeMissingRundownId
		const missingRundown = Rundowns.findOne(missingRundownId)
		const missingRundownName = missingRundown ? missingRundown.name : 'N/A'
		hasDoneSomething = true
		const notification = NotificationCenter.push(
			new Notification(
				undefined,
				NoticeLevel.CRITICAL,
				t('Rundown {{rundownName}} in Playlist {{playlistName}} is missing, what do you want to do?', {
					rundownName: missingRundownName,
					playlistName: rundownPlaylist.name,
				}),
				'userAction',
				undefined,
				true,
				[
					// actions:
					{
						label: t('Mark the rundown as unsynced'),
						type: 'default',
						action: () => {
							doUserAction(
								t,
								'Missing rundown action',
								UserAction.UNSYNC_RUNDOWN,
								(e) => MeteorCall.userAction.unsyncRundown(e, missingRundownId),
								(err) => {
									if (!err) {
										notification.stop()
									}
								}
							)
						},
					},
					{
						label: t('Remove just the rundown'),
						type: 'default',
						action: () => {
							doModalDialog({
								title: rundownPlaylist.name,
								message: t(
									'Do you really want to remove just the rundown "{{rundownName}}" in the playlist {{playlistName}}? This cannot be undone!',
									{
										rundownName: missingRundownName,
										playlistName: rundownPlaylist.name,
									}
								),
								onAccept: () => {
									// nothing
									doUserAction(
										t,
										'Missing rundown action',
										UserAction.REMOVE_RUNDOWN,
										(e) => MeteorCall.userAction.removeRundown(e, missingRundownId),
										(err) => {
											if (!err) {
												notification.stop()
												window.location.assign(`/`)
											}
										}
									)
								},
							})
						},
					},
					{
						label: t('Remove rundown playlist'),
						type: 'default',
						action: () => {
							doModalDialog({
								title: rundownPlaylist.name,
								message: t(
									'Do you really want to remove the rundownPlaylist "{{rundownName}}"? This cannot be undone!',
									{ rundownName: missingRundownName }
								),
								onAccept: () => {
									// nothing
									doUserAction(
										t,
										'Missing rundown action',
										UserAction.REMOVE_RUNDOWN_PLAYLIST,
										(e) => MeteorCall.userAction.removeRundownPlaylist(e, rundownPlaylist._id),
										(err) => {
											if (!err) {
												notification.stop()
												window.location.assign(`/`)
											}
										}
									)
								},
							})
						},
					},
				]
			)
		)
	}
	return hasDoneSomething
}
