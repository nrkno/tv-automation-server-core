import * as React from 'react'
import { Translated } from '../../../lib/ReactMeteorData/react-meteor-data'
import { ExpectedPackageWorkStatus } from '../../../../lib/collections/ExpectedPackageWorkStatuses'
import { assertNever, unprotectString } from '../../../../lib/lib'
import { ExpectedPackageDB } from '../../../../lib/collections/ExpectedPackages'
import Tooltip from 'rc-tooltip'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faChevronRight } from '@fortawesome/free-solid-svg-icons'
import ClassNames from 'classnames'
import { ExpectedPackage } from '@sofie-automation/blueprints-integration'
import { withTranslation } from 'react-i18next'
import { DisplayFormattedTime } from '../../RundownList/DisplayFormattedTime'
import { PackageWorkStatus } from './PackageWorkStatus'

interface IPackageStatusProps {
	package: ExpectedPackageDB
	statuses: ExpectedPackageWorkStatus[]
}
interface PackageStatusState {
	isOpen: boolean
	requiredWorking: boolean
	allWorking: boolean
}

export const PackageStatus = withTranslation()(
	class PackageStatus extends React.Component<Translated<IPackageStatusProps>, PackageStatusState> {
		private requiredProgress: number
		private allProgress: number
		private requiredProgressLastChanged: number
		private allProgressLastChanged: number
		private requiredModifiedHash: number
		private allModifiedHash: number

		/** How long to wait before considering an unchanged package to not be "working" annymore */
		private WORKING_TIMEOUT = 2000

		private updateWorkingStateTimeout: NodeJS.Timeout | null = null

		constructor(props) {
			super(props)

			this.state = {
				isOpen: false,
				// requiredProgress: this.getProgress(true),
				// allProgress: this.getProgress(false),
				requiredWorking: false,
				allWorking: false,
			}

			this.requiredProgress = this.getProgress(true)
			this.allProgress = this.getProgress(false)
			this.requiredModifiedHash = this.getModifiedHash(true)
			this.allModifiedHash = this.getModifiedHash(false)
			this.requiredProgressLastChanged = 0
			this.allProgressLastChanged = 0
		}
		toggleOpen(): void {
			this.setState({
				isOpen: !this.state.isOpen,
			})
		}
		componentDidUpdate(): void {
			this.updateWorkingState()
		}
		updateWorkingState(): void {
			const requiredProgress = this.getProgress(true)
			const allProgress = this.getProgress(false)

			const requiredModifiedHash = this.getModifiedHash(true)
			const allModifiedHash = this.getModifiedHash(false)

			if (requiredProgress !== this.requiredProgress || requiredModifiedHash !== this.requiredModifiedHash) {
				this.requiredProgress = requiredProgress
				this.requiredModifiedHash = requiredModifiedHash
				this.requiredProgressLastChanged = Date.now()
			}
			if (allProgress !== this.allProgress || allModifiedHash !== this.allModifiedHash) {
				this.allProgress = allProgress
				this.allModifiedHash = allModifiedHash
				this.allProgressLastChanged = Date.now()
			}

			const requiredWorking = Date.now() - this.requiredProgressLastChanged < this.WORKING_TIMEOUT // 1 second
			const allWorking = Date.now() - this.allProgressLastChanged < this.WORKING_TIMEOUT // 1 second

			if (requiredWorking !== this.state.requiredWorking || allWorking !== this.state.allWorking) {
				this.setState({
					requiredWorking,
					allWorking,
				})
			}
			if (requiredWorking || allWorking) {
				// If we're working, make a chack again later to see if it has stopped:
				if (this.updateWorkingStateTimeout) {
					clearTimeout(this.updateWorkingStateTimeout)
					this.updateWorkingStateTimeout = null
				}
				this.updateWorkingStateTimeout = setTimeout(() => {
					this.updateWorkingStateTimeout = null
					this.updateWorkingState()
				}, this.WORKING_TIMEOUT)
			}
		}
		getProgress(onlyRequired: boolean): number {
			let count = 0
			let progress = 0
			for (const status of this.props.statuses) {
				if (onlyRequired && !status.requiredForPlayout) {
					continue
				}
				count++
				if (status.status === 'fulfilled') {
					progress += 1
				} else if (status.status === 'working') {
					progress += status.progress || 0.1
				} else {
					progress += 0
				}
			}
			if (count) {
				return progress / count
			} else {
				return 1
			}
		}
		getModifiedHash(onlyRequired: boolean): number {
			let modifiedHash = 0
			for (const status of this.props.statuses) {
				if (onlyRequired && !status.requiredForPlayout) {
					continue
				}
				modifiedHash += status.statusChanged // it's dirty, but it's quick and it works well enough
			}
			return modifiedHash
		}
		getPackageStatus() {
			const { t } = this.props

			const labelRequiredProgress =
				this.requiredProgress < 1 ? `${Math.floor(this.requiredProgress * 100)}%` : t('Ready')
			const labelAllProgress = this.allProgress < 1 ? `${Math.floor(this.allProgress * 100)}%` : t('Done')

			return (
				<>
					<Tooltip overlay={t('The progress of steps required for playout')} placement="top">
						<span>
							<PackageStatusIcon
								progress={this.requiredProgress}
								label={labelRequiredProgress}
								isWorking={this.state.requiredWorking}
							/>
						</span>
					</Tooltip>
					<Tooltip overlay={t('The progress of all steps')} placement="top">
						<span>
							<PackageStatusIcon
								progress={this.allProgress}
								label={labelAllProgress}
								isWorking={this.state.allWorking}
							/>
						</span>
					</Tooltip>
				</>
			)
		}

		getPackageName(): string {
			const p2: ExpectedPackage.Any = this.props.package as any
			if (p2.type === ExpectedPackage.PackageType.MEDIA_FILE) {
				return p2.content.filePath || unprotectString(this.props.package._id)
			} else if (p2.type === ExpectedPackage.PackageType.QUANTEL_CLIP) {
				return p2.content.guid || p2.content.title || unprotectString(this.props.package._id)
			} else {
				assertNever(p2)
				return unprotectString(this.props.package._id)
			}
		}
		render() {
			const { t } = this.props
			const statuses = this.props.statuses.sort((a, b) => {
				if ((a.displayRank ?? 999) > (b.displayRank ?? 999)) return 1
				if ((a.displayRank ?? 999) < (b.displayRank ?? 999)) return -1

				return 0
			})

			return (
				<React.Fragment>
					<tr
						className={ClassNames('package')}
						onClick={(e) => {
							e.preventDefault()
							this.toggleOpen()
						}}
					>
						<td></td>
						<td>{this.getPackageStatus()}</td>
						<td>
							<span className="package__chevron">
								{this.state.isOpen ? (
									<FontAwesomeIcon icon={faChevronDown} />
								) : (
									<FontAwesomeIcon icon={faChevronRight} />
								)}
							</span>
							{this.getPackageName()}
						</td>
						<td>
							<DisplayFormattedTime displayTimestamp={this.props.package.created} t={t} />
						</td>
						<td></td>
					</tr>
					{this.state.isOpen
						? statuses.map((status) => {
								return (
									<PackageWorkStatus key={unprotectString(status._id)} status={status} package={this.props.package} />
								)
						  })
						: null}
				</React.Fragment>
			)
		}
	}
)

function PackageStatusIcon(props: { progress: number; label: string; isWorking: boolean }): JSX.Element {
	const svgCircleSector = (x: number, y: number, radius: number, v: number, color: string) => {
		if (v >= 1) {
			return <circle cx={x} cy={y} r={radius} fill={color}></circle>
		}
		if (v <= 0) return null

		const x0 = x + radius * Math.sin(v * Math.PI * 2)
		const y0 = y - radius * Math.cos(v * Math.PI * 2)

		const flags = v > 0.5 ? '1,1' : '0,1'
		return (
			<path
				d={`M${x},${y}
				L${x},${y - radius}
				A${radius},${radius} 0 ${flags} ${x0},${y0}
				z`}
				fill={color}
			></path>
		)
	}

	const svgCircleSegments = (
		cx: number,
		cy: number,
		radius0: number,
		radius1: number,
		segmentCount: number,
		color: string
	) => {
		const segmentAngle = 1 / segmentCount

		const segment = (key: string, v0: number, v1: number) => {
			const point0 = [cx + radius0 * Math.sin(v0 * Math.PI * 2), cy - radius0 * Math.cos(v0 * Math.PI * 2)]
			const point1 = [cx + radius0 * Math.sin(v1 * Math.PI * 2), cy - radius0 * Math.cos(v1 * Math.PI * 2)]
			const point2 = [cx + radius1 * Math.sin(v1 * Math.PI * 2), cy - radius1 * Math.cos(v1 * Math.PI * 2)]
			const point3 = [cx + radius1 * Math.sin(v0 * Math.PI * 2), cy - radius1 * Math.cos(v0 * Math.PI * 2)]

			return (
				<path
					key={key}
					d={`M${point0[0]},${point0[1]}
					A${radius0},${radius0} 0 0,1 ${point1[0]},${point1[1]}
					L${point2[0]},${point2[1]}
					A${radius1},${radius1} 0 0,1 ${point3[0]},${point3[1]}
					z`}
					fill={color}
				></path>
			)
		}
		const elements: JSX.Element[] = []

		for (let i = 0; i < segmentCount; i++) {
			elements.push(segment('k' + i, segmentAngle * i, segmentAngle * (i + 0.5)))
		}

		// return <div className="package-progress__segments">{elements}</div>
		return elements
	}

	return (
		<div className="package-progress">
			<svg width="100%" viewBox="-50 -50 100 100">
				{props.progress < 1 ? (
					<>
						<circle cx="0" cy="0" r="45" fill="#A2F8B0"></circle>
						{svgCircleSector(0, 0, 45, props.progress, '#00BA1E')}
						<circle cx="0" cy="0" r="30" fill="#fff"></circle>
					</>
				) : (
					<>
						<circle cx="0" cy="0" r="50" fill="#A2F8B0"></circle>
						<circle cx="0" cy="0" r="45" fill="#00BA1E"></circle>
					</>
				)}

				{props.isWorking ? (
					<g>
						{svgCircleSegments(0, 0, 50, 47, 10, '#00BA1E')}
						<animateTransform
							attributeName="transform"
							type="rotate"
							from="0 0 0"
							to="360 0 0"
							dur="6s"
							repeatCount="indefinite"
						/>
					</g>
				) : null}
			</svg>
			<div className={ClassNames('label', props.progress >= 1 ? 'label-done' : null)}>{props.label}</div>
		</div>
	)
}
