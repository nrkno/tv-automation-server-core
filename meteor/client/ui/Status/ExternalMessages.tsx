import { Meteor } from 'meteor/meteor'
import * as React from 'react'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import { getCurrentTime, Time, unprotectString } from '../../../lib/lib'
import { MomentFromNow } from '../../lib/Moment'
import { getAllowConfigure } from '../../lib/localStorage'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import * as _ from 'underscore'
import { ExternalMessageQueue, ExternalMessageQueueObj } from '../../../lib/collections/ExternalMessageQueue'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { makeTableOfObject } from '../../lib/utilComponents'
import ClassNames from 'classnames'
import { DatePickerFromTo } from '../../lib/datePicker'
import moment from 'moment'
import { Studios, Studio, StudioId } from '../../../lib/collections/Studios'
import { faTrash, faPause, faPlay, faRedo } from '@fortawesome/free-solid-svg-icons'
import { PubSub, meteorSubscribe } from '../../../lib/api/pubsub'
import { MeteorCall } from '../../../lib/api/methods'

interface IExternalMessagesProps {}
interface IExternalMessagesState {
	studioId: StudioId | undefined
}
interface IExternalMessagesTrackedProps {
	studios: Array<Studio>
}

const ExternalMessages = translateWithTracker<
	IExternalMessagesProps,
	IExternalMessagesState,
	IExternalMessagesTrackedProps
>((_props: IExternalMessagesProps) => {
	return {
		studios: Studios.find({}).fetch(),
	}
})(
	class ExternalMessages extends MeteorReactComponent<
		Translated<IExternalMessagesProps & IExternalMessagesTrackedProps>,
		IExternalMessagesState
	> {
		constructor(props) {
			super(props)
			this.state = {
				studioId: undefined,
			}
		}
		componentDidMount() {
			this.subscribe(PubSub.studios, {})
		}
		onClickStudio = (studio) => {
			this.setState({
				studioId: studio._id,
			})
		}
		render() {
			const { t } = this.props

			return (
				<div className="mhl gutter external-message-status">
					<header className="mbs">
						<h1>{t('Message Queue')}</h1>
					</header>
					<div className="mod mvl">
						<strong>Studio</strong>
						<ul>
							{_.map(this.props.studios, (studio) => {
								return (
									<li key={unprotectString(studio._id)}>
										<a href="#" onClick={() => this.onClickStudio(studio)}>
											{studio.name}
										</a>
									</li>
								)
							})}
						</ul>
					</div>
					<div>{this.state.studioId ? <ExternalMessagesInStudio studioId={this.state.studioId} /> : null}</div>
				</div>
			)
		}
	}
)

interface IExternalMessagesInStudioProps {
	studioId: StudioId
}
interface IExternalMessagesInStudioState {
	// devices: Array<PeripheralDevice>
	dateFrom: Time
	dateTo: Time
}
interface IExternalMessagesInStudioTrackedProps {
	queuedMessages: Array<ExternalMessageQueueObj>
	sentMessages: Array<ExternalMessageQueueObj>
}

const ExternalMessagesInStudio = translateWithTracker<
	IExternalMessagesInStudioProps,
	IExternalMessagesInStudioState,
	IExternalMessagesInStudioTrackedProps
>((props: IExternalMessagesInStudioProps) => {
	return {
		queuedMessages: ExternalMessageQueue.find(
			{
				studioId: props.studioId,
				sent: { $not: { $gt: 0 } },
			},
			{
				sort: {
					created: -1,
					lastTry: -1,
				},
			}
		).fetch(),
		sentMessages: ExternalMessageQueue.find(
			{
				studioId: props.studioId,
				sent: { $gt: 0 },
			},
			{
				sort: {
					sent: -1,
					lastTry: -1,
				},
			}
		).fetch(),
	}
})(
	class ExternalMessagesInStudio extends MeteorReactComponent<
		Translated<IExternalMessagesInStudioProps & IExternalMessagesInStudioTrackedProps>,
		IExternalMessagesInStudioState
	> {
		private _currentsub: string = ''
		private _sub?: Meteor.SubscriptionHandle

		constructor(props) {
			super(props)

			this.state = {
				dateFrom: moment().startOf('day').valueOf(),
				dateTo: moment().add(1, 'days').startOf('day').valueOf(),
			}
		}

		componentDidMount() {
			// Subscribe to data:
			this.updateSubscription()
		}
		componentDidUpdate() {
			this.updateSubscription()
		}
		updateSubscription() {
			const h = this.state.dateFrom + '_' + this.state.dateTo
			if (h !== this._currentsub) {
				this._currentsub = h
				if (this._sub) {
					this._sub.stop()
				}
				this._sub = meteorSubscribe(PubSub.externalMessageQueue, {
					studioId: this.props.studioId,
					created: {
						$gte: this.state.dateFrom,
						$lt: this.state.dateTo,
					},
				})
			}
		}
		componentWillUnmount() {
			if (this._sub) {
				this._sub.stop()
			}
			this._cleanUp()
		}
		removeMessage(msg: ExternalMessageQueueObj) {
			MeteorCall.externalMessages.remove(msg._id).catch(console.error)
		}
		toggleHoldMessage(msg: ExternalMessageQueueObj) {
			MeteorCall.externalMessages.toggleHold(msg._id).catch(console.error)
		}
		retryMessage(msg: ExternalMessageQueueObj) {
			MeteorCall.externalMessages.retry(msg._id).catch(console.error)
		}
		renderMessageRow(msg: ExternalMessageQueueObj) {
			const classes: string[] = ['message-row']
			let info: JSX.Element | null = null
			if (msg.sent) {
				classes.push('sent')
				info = (
					<div>
						<b>Sent: </b>
						<MomentFromNow unit="seconds">{msg.sent}</MomentFromNow>
					</div>
				)
			} else if (
				getCurrentTime() - (msg.lastTry || 0) < 10 * 1000 &&
				(msg.lastTry || 0) > (msg.errorMessageTime || 0)
			) {
				classes.push('sending')
				info = (
					<div>
						<b>Sending...</b>
					</div>
				)
			} else if (msg.errorFatal) {
				classes.push('fatal')
				info = (
					<div>
						<b>Fatal error: </b>
						<span className="text-s vsubtle">{msg.errorMessage}</span>
					</div>
				)
			} else if (msg.errorMessage) {
				classes.push('error')
				info = (
					<div>
						<b>Error: </b>
						<span className="text-s vsubtle">{msg.errorMessage}</span>
						<div>
							<MomentFromNow>{msg.errorMessageTime}</MomentFromNow>
						</div>
					</div>
				)
			} else {
				classes.push('waiting')
				if (msg.tryCount) {
					info = (
						<div>
							<b>Tried {msg.tryCount} times</b>
						</div>
					)
				}
				if (msg.lastTry) {
					info = (
						<div>
							<b>Last try: </b>
							<MomentFromNow unit="seconds">{msg.lastTry}</MomentFromNow>
						</div>
					)
				}
			}
			return (
				<tr key={unprotectString(msg._id)} className={ClassNames(classes)}>
					<td className="c2">
						{getAllowConfigure() ? (
							<React.Fragment>
								<button className="action-btn" onClick={() => this.removeMessage(msg)}>
									<FontAwesomeIcon icon={faTrash} />
								</button>
								<button className="action-btn" onClick={() => this.toggleHoldMessage(msg)}>
									{msg.hold ? <FontAwesomeIcon icon={faPlay} /> : <FontAwesomeIcon icon={faPause} />}
								</button>
								<button className="action-btn" onClick={() => this.retryMessage(msg)}>
									<FontAwesomeIcon icon={faRedo} />
								</button>
								<br />
							</React.Fragment>
						) : null}
						ID: {msg._id}
						<br />
						Created: <MomentFromNow unit="seconds">{msg.created}</MomentFromNow>
						{msg.queueForLaterReason !== undefined ? (
							<div>
								<b>Queued for later due to: {msg.queueForLaterReason || 'Unknown reason'}</b>
							</div>
						) : null}
					</td>
					<td className="c7 small">
						<div>{info}</div>
						<div>
							<div>
								<strong>Receiver</strong>
								<br />
								{makeTableOfObject(msg.receiver)}
							</div>
							<div>
								<strong>Message</strong>
								<br />
								{makeTableOfObject(msg.message)}
							</div>
						</div>
					</td>
				</tr>
			)
		}

		renderQueuedMessages() {
			const { t } = this.props
			return (
				<div>
					<h2>{t('Queued Messages')}</h2>
					<table className="table system-status-table">
						<tbody>
							{_.map(this.props.queuedMessages, (msg) => {
								return this.renderMessageRow(msg)
							})}
						</tbody>
					</table>
				</div>
			)
		}
		renderSentMessages() {
			const { t } = this.props
			return (
				<div>
					<h2>{t('Sent Messages')}</h2>
					<table className="table system-status-table">
						<tbody>
							{_.map(this.props.sentMessages, (msg) => {
								return this.renderMessageRow(msg)
							})}
						</tbody>
					</table>
				</div>
			)
		}
		handleChangeDate = (from: Time, to: Time) => {
			this.setState({
				dateFrom: from,
				dateTo: to,
			})
		}

		render() {
			return (
				<div className="mhl gutter external-message-status">
					<div className="paging alc">
						<DatePickerFromTo from={this.state.dateFrom} to={this.state.dateTo} onChange={this.handleChangeDate} />
					</div>
					<div className="mod mvl">
						{this.renderQueuedMessages()}
						{this.renderSentMessages()}
					</div>
				</div>
			)
		}
	}
)
export { ExternalMessages }
