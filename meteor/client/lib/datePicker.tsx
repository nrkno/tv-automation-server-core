import * as React from 'react'
import * as _ from 'underscore'
import DatePicker from 'react-datepicker'
import moment from 'moment'
import 'react-datepicker/dist/react-datepicker.css'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronRight, faChevronLeft } from '@fortawesome/free-solid-svg-icons'
import { Time } from '../../lib/lib'
import { withTranslation, WithTranslation } from 'react-i18next'

interface IProps {
	from: Time
	to: Time
	onChange: (from: Time, to: Time) => void
}
interface IState {
	dateFrom: Date
	dateTo: Date
}
export const DatePickerFromTo = withTranslation()(
	class DatePickerFromTo extends React.Component<IProps & WithTranslation, IState> {
		constructor(props: IProps & WithTranslation) {
			super(props)

			this.state = {
				dateFrom: props.from ? new Date(props.from) : moment().subtract(1, 'days').startOf('day').toDate(),
				dateTo: props.to ? new Date(props.to) : moment().startOf('day').toDate(),
			}
		}
		triggerOnchange = (state: IState) => {
			this.props.onChange(state.dateFrom.valueOf(), state.dateTo.valueOf())
		}
		updateData = (o: Partial<IState>) => {
			this.setState(o as any)

			const newState: IState = _.extend(_.clone(this.state), o)
			this.triggerOnchange(newState)
		}
		handleChangeFrom = (date: Date | null) => {
			if (date) {
				this.updateData({
					dateFrom: date,
				})
			}
		}
		handleChangeTo = (date: Date | null) => {
			if (date) {
				this.updateData({
					dateTo: date,
				})
			}
		}
		onClickPrevious = () => {
			const from = this.state.dateFrom.valueOf()
			const to = this.state.dateTo.valueOf()
			const range = to - from

			this.updateData({
				dateFrom: new Date(from - range),
				dateTo: new Date(to - range),
			})
		}
		onClickNext = () => {
			const from = this.state.dateFrom.valueOf()
			const to = this.state.dateTo.valueOf()
			const range = to - from

			this.updateData({
				dateFrom: new Date(from + range),
				dateTo: new Date(to + range),
			})
		}
		render() {
			const { t } = this.props
			return (
				<div className="datepicker-from-to">
					<button className="action-btn mod mhm" onClick={this.onClickPrevious}>
						<FontAwesomeIcon icon={faChevronLeft} />
					</button>
					<label className="mod mhs mvn">
						{t('From')}
						<div className="picker expco">
							<DatePicker
								dateFormat="yyyy-MM-dd"
								selected={this.state.dateFrom}
								onChange={this.handleChangeFrom}
								className="expco-title"
							/>
						</div>
					</label>
					<label className="mod mhs mvn">
						{t('Until')}
						<div className="picker expco">
							<DatePicker
								dateFormat="yyyy-MM-dd"
								selected={this.state.dateTo}
								onChange={this.handleChangeTo}
								className="expco-title"
							/>
						</div>
					</label>
					<button className="action-btn mod mhm" onClick={this.onClickNext}>
						<FontAwesomeIcon icon={faChevronRight} />
					</button>
				</div>
			)
		}
	}
)
