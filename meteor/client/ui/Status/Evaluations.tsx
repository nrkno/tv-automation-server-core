import { Meteor } from 'meteor/meteor'
import * as React from 'react'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import Moment from 'react-moment'
import { Time, unprotectString } from '../../../lib/lib'
import * as _ from 'underscore'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { Evaluations, Evaluation } from '../../../lib/collections/Evaluations'
import { DatePickerFromTo } from '../../lib/datePicker'
import moment from 'moment'
import { getQuestionOptions } from '../AfterBroadcastForm'
import { PubSub, meteorSubscribe } from '../../../lib/api/pubsub'
interface IEvaluationProps {}
interface IEvaluationState {
	dateFrom: Time
	dateTo: Time
}
interface IEvaluationTrackedProps {
	evaluations: Evaluation[]
}

const EvaluationView = translateWithTracker<IEvaluationProps, IEvaluationState, IEvaluationTrackedProps>(
	(_props: IEvaluationProps) => {
		return {
			evaluations: Evaluations.find(
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
	class EvaluationView extends MeteorReactComponent<
		Translated<IEvaluationProps & IEvaluationTrackedProps>,
		IEvaluationState
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
				this._sub = meteorSubscribe(PubSub.evaluations, {
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

		renderMessageHead() {
			const { t } = this.props
			return (
				<thead>
					<tr>
						<th className="c3 user-action-log__timestamp">{t('Timestamp')}</th>
						<th className="c1 user-action-log__userId">{t('User Name')}</th>
						<th>{t('Rundown')}</th>
						<th colSpan={99} className="c8">
							{t('Answers')}
						</th>
					</tr>
				</thead>
			)
		}
		handleChangeDate = (from: Time, to: Time) => {
			this.setState({
				dateFrom: from,
				dateTo: to,
			})
		}

		renderEvaluation() {
			const { t } = this.props
			return (
				<div>
					<div className="paging">
						<DatePickerFromTo from={this.state.dateFrom} to={this.state.dateTo} onChange={this.handleChangeDate} />
					</div>
					<table className="table user-action-log">
						{this.renderMessageHead()}
						<tbody>
							{_.map(
								_.filter(this.props.evaluations, (e) => {
									return e.timestamp >= this.state.dateFrom && e.timestamp < this.state.dateTo
								}),
								(evaluation) => {
									let tds = [
										<td key="c0" className="user-action-log__timestamp">
											<Moment format="YYYY/MM/DD HH:mm:ss">{evaluation.timestamp}</Moment>
										</td>,
										<td key="c1" className="user-action-log__userId">
											{evaluation.answers && evaluation.answers.q2}
										</td>,
										<td key="c2" className="user-action-log__rundown">
											{evaluation.playlistId}
										</td>,
									]
									tds = tds.concat(
										_.map(evaluation.answers, (answer, key) => {
											let str: string = answer
											if (key === 'q0') {
												_.find(getQuestionOptions(t), (o) => {
													if (o.value === str) {
														str = o.name
														return true
													}
												})
											}
											return (
												<td key={key} className="user-action-log__answer">
													{str}
												</td>
											)
										})
									)
									return <tr key={unprotectString(evaluation._id)}>{tds}</tr>
								}
							)}
						</tbody>
					</table>
				</div>
			)
		}

		render() {
			const { t } = this.props
			return (
				<div className="mhl gutter external-message-status">
					<header className="mbs">
						<h1>{t('Evaluations')}</h1>
					</header>
					<div className="mod mvl">{this.renderEvaluation()}</div>
				</div>
			)
		}
	}
)
export { EvaluationView }
