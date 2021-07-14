import { Meteor } from 'meteor/meteor'
import * as React from 'react'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import Moment from 'react-moment'
import { Time, unprotectString } from '../../../lib/lib'
import * as _ from 'underscore'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { UserActionsLog, UserActionsLogItem } from '../../../lib/collections/UserActionsLog'
import { DatePickerFromTo } from '../../lib/datePicker'
import moment from 'moment'
import { PubSub, meteorSubscribe } from '../../../lib/api/pubsub'
import { withTranslation } from 'react-i18next'

interface IUserActionsListProps {
	logItems: UserActionsLogItem[]
	onItemClick?: (item: UserActionsLogItem) => void
	renderButtons?: (item: UserActionsLogItem) => React.ReactElement
}

export const UserActionsList = withTranslation()(
	class UserActionsList extends React.Component<Translated<IUserActionsListProps>> {
		renderMessageHead() {
			const { t } = this.props
			const executionTimeExplanation =
				'formatted as "a + b, (c)" where a is the time it took for Core to execute the command, b is the time it took for the Gateway to execute the timeline and c is the duration it took in TSR to resolve the timeline'
			return (
				<thead>
					<tr>
						<th className="c3 user-action-log__timestamp">{t('Timestamp')}</th>
						<th className="c3 user-action-log__executionTime" title={t(executionTimeExplanation)}>
							{t('Execution time*')}
						</th>
						<th className="c1 user-action-log__userId">{t('User ID')}</th>
						<th className="c2 user-action-log__clientAddress">{t('Client IP')}</th>
						<th className="c3 user-action-log__context">{t('Action')}</th>
						<th className="c3 user-action-log__method">{t('Method')}</th>
						<th className="c1 user-action-log__status">{t('Status')}</th>
						<th className="c1 user-action-log__args">{t('Parameters')}</th>
						{this.props.renderButtons ? <th className="c1 user-action-log__buttons"></th> : null}
					</tr>
				</thead>
			)
		}

		render() {
			return (
				<table className="table user-action-log">
					{this.renderMessageHead()}
					<tbody>
						{_.map(this.props.logItems, (msg) => {
							return (
								<tr
									className={this.props.onItemClick ? 'clickable' : undefined}
									key={unprotectString(msg._id)}
									onClick={() => this.props.onItemClick && this.props.onItemClick(msg)}
								>
									<td className="user-action-log__timestamp">
										<Moment format="YYYY/MM/DD HH:mm:ss.SSS">{msg.timestamp}</Moment>
									</td>
									<td className="user-action-log__executionTime">
										{msg.executionTime ? msg.executionTime : null}
										{msg.gatewayDuration ? ` + ${msg.gatewayDuration.join(', ')}` : null}
										{msg.timelineResolveDuration ? ` (${msg.timelineResolveDuration.join(', ')})` : null}
										{' ms'}
									</td>
									<td className="user-action-log__userId">{msg.userId}</td>
									<td className="user-action-log__clientAddress">{msg.clientAddress}</td>
									<td className="user-action-log__context">{msg.context}</td>
									<td className="user-action-log__method">{msg.method}</td>
									<td className="user-action-log__status">
										{msg.success ? 'Success' : msg.success === false ? 'Error: ' + msg.errorMessage : null}
									</td>
									<td className="user-action-log__args">{msg.args}</td>
									{this.props.renderButtons ? (
										<td className="user-action-log__buttons">{this.props.renderButtons(msg)}</td>
									) : null}
								</tr>
							)
						})}
					</tbody>
				</table>
			)
		}
	}
)

interface IUserActivityProps {}
interface IUserActivityState {
	dateFrom: Time
	dateTo: Time
}
interface IUserActivityTrackedProps {
	log: UserActionsLogItem[]
}

const UserActivity = translateWithTracker<IUserActivityProps, IUserActivityState, IUserActivityTrackedProps>(
	(_props: IUserActivityProps) => {
		return {
			log: UserActionsLog.find(
				{},
				{
					sort: {
						timestamp: 1,
					},
				}
			).fetch(),
		}
	}
)(
	class UserActivity extends MeteorReactComponent<
		Translated<IUserActivityProps & IUserActivityTrackedProps>,
		IUserActivityState
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
				this._sub = meteorSubscribe(PubSub.userActionsLog, {
					timestamp: {
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

		handleChangeDate = (from: Time, to: Time) => {
			this.setState({
				dateFrom: from,
				dateTo: to,
			})
		}

		renderUserActivity() {
			return (
				<div>
					<div className="paging">
						<DatePickerFromTo from={this.state.dateFrom} to={this.state.dateTo} onChange={this.handleChangeDate} />
					</div>
					<UserActionsList
						logItems={_.filter(this.props.log, (ua) => {
							return ua.timestamp >= this.state.dateFrom && ua.timestamp < this.state.dateTo
						})}
					/>
				</div>
			)
		}

		render() {
			const { t } = this.props
			return (
				<div className="mhl gutter external-message-status">
					<header className="mbs">
						<h1>{t('User Activity Log')}</h1>
					</header>
					<div className="mod mvl">{this.renderUserActivity()}</div>
				</div>
			)
		}
	}
)
export { UserActivity }
