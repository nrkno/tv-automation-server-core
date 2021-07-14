import * as React from 'react'

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
		take = (e: any) => {
			const { t } = this.props
			if (this.props.studioMode) {
				doUserAction(t, e, UserAction.TAKE, (e) => MeteorCall.userAction.take(e, this.props.playlist._id))
			}
		}

		moveNext = (e: any, horizontalDelta: number, verticalDelta: number) => {
			const { t } = this.props
			if (this.props.studioMode) {
				doUserAction(t, e, UserAction.MOVE_NEXT, (e) =>
					MeteorCall.userAction.moveNext(e, this.props.playlist._id, horizontalDelta, verticalDelta)
				)
			}
		}

		hold = (e: any) => {
			const { t } = this.props
			if (this.props.studioMode && this.props.playlist.activationId) {
				doUserAction(t, e, UserAction.ACTIVATE_HOLD, (e) =>
					MeteorCall.userAction.activateHold(
						e,
						this.props.playlist._id,
						this.props.playlist.holdState === RundownHoldState.PENDING
					)
				)
			}
		}

		onButtonDown = (button: DashboardLayoutActionButton, e: React.SyntheticEvent<HTMLElement>) => {
			switch (button.type) {
				case ActionButtonType.QUEUE_ADLIB:
					this.props.onChangeQueueAdLib && this.props.onChangeQueueAdLib(true, e)
					break
			}
		}

		onButtonUp = (button: DashboardLayoutActionButton, e: React.SyntheticEvent<HTMLElement>) => {
			switch (button.type) {
				case ActionButtonType.TAKE:
					this.take(e)
					break
				case ActionButtonType.QUEUE_ADLIB:
					this.props.onChangeQueueAdLib && this.props.onChangeQueueAdLib(false, e)
					break
				case ActionButtonType.MOVE_NEXT_PART:
					this.moveNext(e, 1, 0)
					break
				case ActionButtonType.MOVE_NEXT_SEGMENT:
					this.moveNext(e, 0, 1)
					break
				case ActionButtonType.MOVE_PREVIOUS_PART:
					this.moveNext(e, -1, 0)
					break
				case ActionButtonType.MOVE_PREVIOUS_SEGMENT:
					this.moveNext(e, 0, -1)
					break
				case ActionButtonType.HOLD:
					this.hold(e)
					break
			}
		}

		render() {
			return this.props.buttons.map((button: DashboardLayoutActionButton) => (
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
