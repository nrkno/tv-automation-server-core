import * as React from 'react'
import ClassNames from 'classnames'
import { RundownAPI } from '../../../lib/api/rundown'

import { DEFAULT_BUTTON_HEIGHT, DEFAULT_BUTTON_WIDTH } from './DashboardPieceButton'
import { DashboardLayoutActionButton, ActionButtonType } from '../../../lib/collections/RundownLayouts'
import { DashboardActionButton } from './DashboardActionButton'
import { doUserAction, UserAction } from '../../lib/userAction'
import { withTranslation } from 'react-i18next'
import { Translated } from '../../lib/ReactMeteorData/react-meteor-data'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { MeteorCall } from '../../../lib/api/methods'
import { RundownHoldState } from '../../../lib/collections/Rundowns'

export interface IDashboardButtonGroupProps {
	buttons: DashboardLayoutActionButton[]
	studioMode: boolean
	playlist: RundownPlaylist

	onChangeQueueAdLib: (isQueue: boolean, e: any) => void
}

export const DashboardActionButtonGroup = withTranslation()(
	class DashboardActionButtonGroup extends React.Component<Translated<IDashboardButtonGroupProps>> {
		private take = (e: any) => {
			if (this.props.studioMode) {
				const { t } = this.props
				doUserAction(t, e, UserAction.TAKE, (e) => MeteorCall.userAction.take(e, this.props.playlist._id))
			}
		}

		private hold = (e: any) => {
			if (this.props.studioMode) {
				const { t } = this.props
				if (!this.props.playlist.holdState) {
					doUserAction(t, e, UserAction.ACTIVATE_HOLD, (e) =>
						MeteorCall.userAction.activateHold(e, this.props.playlist._id)
					)
				} else if (this.props.playlist.holdState === RundownHoldState.PENDING) {
					doUserAction(t, e, UserAction.ACTIVATE_HOLD, (e) =>
						MeteorCall.userAction.activateHold(e, this.props.playlist._id, true)
					)
				}
			}
		}

		private moveNext = (e: any, horizonalDelta: number, verticalDelta: number) => {
			if (this.props.studioMode) {
				const { t } = this.props
				if (this.props.playlist.active) {
					doUserAction(t, e, UserAction.MOVE_NEXT, (e) =>
						MeteorCall.userAction.moveNext(e, this.props.playlist._id, horizonalDelta, verticalDelta)
					)
				}
			}
		}

		private moveNextPart = (e: any) => {
			this.moveNext(e, 1, 0)
		}

		private moveNextSegment = (e: any) => {
			this.moveNext(e, 0, 1)
		}

		private movePreviousPart = (e: any) => {
			this.moveNext(e, -1, 0)
		}

		private movePreviousSegment = (e: any) => {
			this.moveNext(e, 0, -1)
		}

		private activate = (e: any) => {
			if (this.props.studioMode) {
				const { t } = this.props
				doUserAction(t, e, UserAction.ACTIVATE_RUNDOWN_PLAYLIST, (e) =>
					MeteorCall.userAction.activate(e, this.props.playlist._id, false)
				)
			}
		}

		private activateRehearsal = (e: any) => {
			if (this.props.studioMode) {
				const { t } = this.props
				doUserAction(t, e, UserAction.ACTIVATE_RUNDOWN_PLAYLIST, (e) =>
					MeteorCall.userAction.activate(e, this.props.playlist._id, true)
				)
			}
		}

		private deactivate = (e: any) => {
			if (this.props.studioMode) {
				const { t } = this.props
				doUserAction(t, e, UserAction.DEACTIVATE_RUNDOWN_PLAYLIST, (e) =>
					MeteorCall.userAction.deactivate(e, this.props.playlist._id)
				)
			}
		}

		private resetRundown = (e: any) => {
			if (this.props.studioMode) {
				const { t } = this.props
				doUserAction(t, e, UserAction.RESET_RUNDOWN_PLAYLIST, (e) =>
					MeteorCall.userAction.resetRundownPlaylist(e, this.props.playlist._id)
				)
			}
		}

		private onButtonDown = (button: DashboardLayoutActionButton, e: React.SyntheticEvent<HTMLElement>) => {
			switch (button.type) {
				case ActionButtonType.QUEUE_ADLIB:
					this.props.onChangeQueueAdLib && this.props.onChangeQueueAdLib(true, e)
					break
			}
		}

		private onButtonUp = (button: DashboardLayoutActionButton, e: React.SyntheticEvent<HTMLElement>) => {
			switch (button.type) {
				case ActionButtonType.TAKE:
					this.take(e)
					break
				case ActionButtonType.QUEUE_ADLIB:
					this.props.onChangeQueueAdLib && this.props.onChangeQueueAdLib(false, e)
					break
				case ActionButtonType.HOLD:
					this.hold(e)
					break
				case ActionButtonType.MOVE_NEXT_PART:
					this.moveNextPart(e)
					break
				case ActionButtonType.MOVE_NEXT_SEGMENT:
					this.moveNextSegment(e)
					break
				case ActionButtonType.MOVE_PREVIOUS_PART:
					this.movePreviousPart(e)
					break
				case ActionButtonType.MOVE_PREVIOUS_SEGMENT:
					this.movePreviousSegment(e)
					break
				case ActionButtonType.RESET_RUNDOWN:
					this.resetRundown(e)
					break
				case ActionButtonType.ACTIVATE_REHEARSAL:
					this.activateRehearsal(e)
					break
				case ActionButtonType.ACTIVATE:
					this.activate(e)
					break
				case ActionButtonType.DEACTIVATE:
					this.deactivate(e)
					break
			}
		}

		render() {
			return this.props.buttons.map((button: DashboardLayoutActionButton, index) => (
				<DashboardActionButton
					key={button._id}
					onButtonDown={this.onButtonDown}
					onButtonUp={this.onButtonUp}
					button={button}
				/>
			))
		}
	}
)
