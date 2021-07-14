import * as React from 'react'
import { Translated } from '../../../lib/ReactMeteorData/react-meteor-data'
import { ExpectedPackageWorkStatus } from '../../../../lib/collections/ExpectedPackageWorkStatuses'
import { unprotectString } from '../../../../lib/lib'
import { ExpectedPackageDB } from '../../../../lib/collections/ExpectedPackages'
import Tooltip from 'rc-tooltip'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRedo, faStopCircle, faChevronDown, faChevronRight, faExclamation } from '@fortawesome/free-solid-svg-icons'
import { MeteorCall } from '../../../../lib/api/methods'
import { doUserAction, UserAction } from '../../../lib/userAction'

import { withTranslation } from 'react-i18next'
import { DisplayFormattedTime } from '../../RundownList/DisplayFormattedTime'
import { JobStatusIcon } from './JobStatusIcon'

interface IPackageWorkStatusProps {
	package: ExpectedPackageDB
	status: ExpectedPackageWorkStatus
}
interface PackageWorkStatusState {
	isOpen: boolean
}
export const PackageWorkStatus = withTranslation()(
	class PackageWorkStatus extends React.Component<Translated<IPackageWorkStatusProps>, PackageWorkStatusState> {
		constructor(props) {
			super(props)

			this.state = {
				isOpen: false,
			}
		}
		toggleOpen(): void {
			this.setState({
				isOpen: !this.state.isOpen,
			})
		}
		restartExpectation(e: React.MouseEvent<HTMLButtonElement, MouseEvent>, status: ExpectedPackageWorkStatus): void {
			doUserAction(this.props.t, e, UserAction.PACKAGE_MANAGER_RESTART_WORK, (e) =>
				MeteorCall.userAction.packageManagerRestartExpectation(e, status.deviceId, unprotectString(status._id))
			)
		}
		abortExpectation(e: React.MouseEvent<HTMLButtonElement, MouseEvent>, status: ExpectedPackageWorkStatus): void {
			doUserAction(this.props.t, e, UserAction.PACKAGE_MANAGER_RESTART_WORK, (e) =>
				MeteorCall.userAction.packageManagerAbortExpectation(e, status.deviceId, unprotectString(status._id))
			)
		}
		render() {
			const { t } = this.props
			const status = this.props.status
			return (
				<React.Fragment>
					<tr
						key={unprotectString(status._id)}
						className="package-job"
						onClick={(e) => {
							e.preventDefault()
							this.toggleOpen()
						}}
					>
						<td></td>
						<td colSpan={2}>
							<span className="package-job__required">
								{status.requiredForPlayout ? (
									<Tooltip overlay={t('This step is required for playout')} placement="top">
										<span>
											<FontAwesomeIcon icon={faExclamation} />
										</span>
									</Tooltip>
								) : null}
							</span>
							<span className="package-job__status">
								<JobStatusIcon status={status} />
							</span>
							<span className="package-job__description">
								<span className="package__chevron">
									{this.state.isOpen ? (
										<FontAwesomeIcon icon={faChevronDown} />
									) : (
										<FontAwesomeIcon icon={faChevronRight} />
									)}
								</span>
								<span>{status.label}</span>
							</span>
						</td>
						<td className="package-job__buttons">
							<Tooltip overlay={t('Restart')} placement="top">
								<button className="action-btn" onClick={(e) => this.restartExpectation(e, status)}>
									<FontAwesomeIcon icon={faRedo} />
								</button>
							</Tooltip>
							<Tooltip overlay={t('Abort')} placement="top">
								<button
									className="action-btn"
									// disabled={status.status !== 'fullfilled'}
									onClick={(e) => this.abortExpectation(e, status)}
								>
									<FontAwesomeIcon icon={faStopCircle} />
								</button>
							</Tooltip>
						</td>
						<td></td>
					</tr>

					{this.state.isOpen ? (
						<tr key={`${status._id}_view`} className="package-job-details">
							<td></td>
							<td colSpan={4}>
								<table>
									<tbody>
										<tr>
											<td>{t('Work description')}</td>
											<td>{status.description}</td>
										</tr>
										<tr>
											<td>{t('Work status')}</td>
											<td>{status.status}</td>
										</tr>
										<tr>
											<td>{t('Work status reason')}</td>
											<td>
												<Tooltip
													overlay={t('Technical reason: {{reason}}', {
														reason: status.statusReason.tech,
													})}
													placement="bottom"
												>
													<span>{status.statusReason.user ?? status.statusReason?.toString()}</span>
												</Tooltip>
											</td>
										</tr>
										<tr>
											<td>{t('Last updated')}</td>
											<td>
												<DisplayFormattedTime displayTimestamp={status.modified} t={t} />
											</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>
					) : null}
				</React.Fragment>
			)
		}
	}
)
