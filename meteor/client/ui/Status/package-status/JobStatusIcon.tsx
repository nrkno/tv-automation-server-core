import * as React from 'react'
import { Translated } from '../../../lib/ReactMeteorData/react-meteor-data'
import { ExpectedPackageWorkStatus } from '../../../../lib/collections/ExpectedPackageWorkStatuses'
import { withTranslation } from 'react-i18next'

interface IJobStatusIconProps {
	status: ExpectedPackageWorkStatus
}
interface JobStatusIconState {}

export const JobStatusIcon = withTranslation()(
	class JobStatusIcon extends React.Component<Translated<IJobStatusIconProps>, JobStatusIconState> {
		constructor(props) {
			super(props)
		}
		getProgressbar() {
			const { t } = this.props

			let progress: number
			let label: string
			if (this.props.status.status === 'fulfilled') {
				progress = 1
				label = t('Done')
			} else if (this.props.status.status === 'working') {
				progress = this.props.status.progress || 0
				label = Math.floor(progress * 100) + '%'
			} else {
				progress = 0
				label = this.props.status.status
			}

			return (
				<div
					className="job-status-icon"
					style={{
						width: '10em',
					}}
				>
					<div
						className="job-status-icon__progress"
						style={{
							width: progress * 100 + '%',
						}}
					></div>
					<div className="job-status-icon__label">{label}</div>
				</div>
			)
		}
		render() {
			return <>{this.getProgressbar()}</>
		}
	}
)
