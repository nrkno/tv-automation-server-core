import * as React from 'react'
import { withTranslation, WithTranslation } from 'react-i18next'
import { ClipTrimPanel } from './ClipTrimPanel'
import { VTContent, VTEditableParameters } from '@sofie-automation/blueprints-integration'
import { Studio } from '../../../lib/collections/Studios'
import { ModalDialog } from '../../lib/ModalDialog'
import { doUserAction, UserAction } from '../../lib/userAction'
import { RundownPlaylistId } from '../../../lib/collections/RundownPlaylists'
import { MeteorCall } from '../../../lib/api/methods'
import { NotificationCenter, Notification, NoticeLevel } from '../../lib/notifications/notifications'
import { protectString } from '../../../lib/lib'
import { ClientAPI } from '../../../lib/api/client'
import { Rundown } from '../../../lib/collections/Rundowns'
import { PieceInstancePiece } from '../../../lib/collections/PieceInstances'

export interface IProps {
	playlistId: RundownPlaylistId
	rundown: Rundown
	studio: Studio
	selectedPiece: PieceInstancePiece

	onClose?: () => void
}

interface IState {
	inPoint: number
	duration: number
}

export const ClipTrimDialog = withTranslation()(
	class ClipTrimDialog extends React.Component<IProps & WithTranslation, IState> {
		constructor(props: IProps & WithTranslation) {
			super(props)

			this.state = {
				inPoint: ((this.props.selectedPiece.content as VTContent).editable as VTEditableParameters).editorialStart,
				duration: ((this.props.selectedPiece.content as VTContent).editable as VTEditableParameters).editorialDuration,
			}
		}
		handleChange = (inPoint: number, duration: number) => {
			this.setState({
				inPoint,
				duration,
			})
		}
		handleAccept = (e) => {
			const { t, selectedPiece } = this.props

			this.props.onClose && this.props.onClose()
			doUserAction(
				this.props.t,
				e,
				UserAction.SET_IN_OUT_POINTS,
				(e) =>
					MeteorCall.userAction.setInOutPoints(
						e,
						this.props.playlistId,
						selectedPiece.startPartId,
						selectedPiece._id,
						this.state.inPoint,
						this.state.duration
					),
				(err) => {
					clearTimeout(pendingInOutPoints)

					if (ClientAPI.isClientResponseError(err) && err.message && err.message.match(/timed out/)) {
						NotificationCenter.push(
							new Notification(
								undefined,
								NoticeLevel.CRITICAL,
								(
									<>
										<strong>{selectedPiece.name}</strong>:&ensp;
										{t(
											"Trimming this clip has timed out. It's possible that the story is currently locked for writing in {{nrcsName}} and will eventually be updated. Make sure that the story is not being edited by other users.",
											{ nrcsName: (this.props.rundown && this.props.rundown.externalNRCSName) || 'NRCS' }
										)}
									</>
								),
								protectString('ClipTrimDialog')
							)
						)
					} else if (ClientAPI.isClientResponseError(err) || err) {
						NotificationCenter.push(
							new Notification(
								undefined,
								NoticeLevel.CRITICAL,
								(
									<>
										<strong>{selectedPiece.name}</strong>:&ensp;
										{t('Trimming this clip has failed due to an error: {{error}}.', {
											error: err.message || err.error || err,
										})}
									</>
								),
								protectString('ClipTrimDialog')
							)
						)
					} else {
						NotificationCenter.push(
							new Notification(
								undefined,
								NoticeLevel.NOTIFICATION,
								(
									<>
										<strong>{selectedPiece.name}</strong>:&ensp;
										{t('Trimmed succesfully.')}
									</>
								),
								protectString('ClipTrimDialog')
							)
						)
					}

					return false // do not use default doUserAction failure handler
				}
			)
			const pendingInOutPoints = setTimeout(() => {
				NotificationCenter.push(
					new Notification(
						undefined,
						NoticeLevel.WARNING,
						(
							<>
								<strong>{selectedPiece.name}</strong>:&ensp;
								{t(
									"Trimming this clip is taking longer than expected. It's possible that the story is locked for writing in {{nrcsName}}.",
									{ nrcsName: (this.props.rundown && this.props.rundown.externalNRCSName) || 'NRCS' }
								)}
							</>
						),
						protectString('ClipTrimDialog')
					)
				)
			}, 5 * 1000)
		}
		render() {
			const { t } = this.props
			return (
				<ModalDialog
					title={t('Trim "{{name}}"', { name: this.props.selectedPiece.name })}
					show={true}
					acceptText={t('OK')}
					secondaryText={t('Cancel')}
					onAccept={this.handleAccept}
					onDiscard={() => this.props.onClose && this.props.onClose()}
					onSecondary={() => this.props.onClose && this.props.onClose()}
					className="big"
				>
					<ClipTrimPanel
						studioId={this.props.studio._id}
						playlistId={this.props.playlistId}
						rundownId={this.props.rundown._id}
						pieceId={this.props.selectedPiece._id}
						partId={this.props.selectedPiece.startPartId}
						inPoint={this.state.inPoint}
						duration={this.state.duration}
						onChange={this.handleChange}
					/>
				</ModalDialog>
			)
		}
	}
)
