import * as React from 'react'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import { PeripheralDevice, PeripheralDevices } from '../../../lib/collections/PeripheralDevices'
import * as reacti18next from 'react-i18next'
import * as i18next from 'i18next'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import Moment from 'react-moment'
import { getCurrentTime, getHash, unprotectString } from '../../../lib/lib'
import { Link } from 'react-router-dom'
import Tooltip from 'rc-tooltip'
import { faTrash, faEye } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import * as _ from 'underscore'
import { doModalDialog } from '../../lib/ModalDialog'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { callPeripheralDeviceFunction, PeripheralDevicesAPI } from '../../lib/clientAPI'
import { NotificationCenter, NoticeLevel, Notification } from '../../lib/notifications/notifications'
import { getAllowConfigure, getAllowDeveloper, getAllowStudio, getHelpMode } from '../../lib/localStorage'
import { PubSub } from '../../../lib/api/pubsub'
import ClassNames from 'classnames'
import { TSR } from '@sofie-automation/blueprints-integration'
import { CoreSystem, ICoreSystem } from '../../../lib/collections/CoreSystem'
import { StatusResponse } from '../../../lib/api/systemStatus'
import { doUserAction, UserAction } from '../../lib/userAction'
import { MeteorCall } from '../../../lib/api/methods'
import { RESTART_SALT } from '../../../lib/api/userActions'
import { CASPARCG_RESTART_TIME } from '../../../lib/constants'

interface IDeviceItemProps {
	// key: string,
	device: PeripheralDevice
	showRemoveButtons?: boolean
	toplevel?: boolean
	hasChildren?: boolean
}
interface IDeviceItemState {}

export function statusCodeToString(t: i18next.TFunction, statusCode: PeripheralDeviceAPI.StatusCode) {
	return statusCode === PeripheralDeviceAPI.StatusCode.UNKNOWN
		? t('Unknown')
		: statusCode === PeripheralDeviceAPI.StatusCode.GOOD
		? t('Good')
		: statusCode === PeripheralDeviceAPI.StatusCode.WARNING_MINOR
		? t('Minor Warning')
		: statusCode === PeripheralDeviceAPI.StatusCode.WARNING_MAJOR
		? t('Warning')
		: statusCode === PeripheralDeviceAPI.StatusCode.BAD
		? t('Bad')
		: statusCode === PeripheralDeviceAPI.StatusCode.FATAL
		? t('Fatal')
		: t('Unknown')
}

export const DeviceItem = reacti18next.withTranslation()(
	class DeviceItem extends React.Component<Translated<IDeviceItemProps>, IDeviceItemState> {
		constructor(props: Translated<IDeviceItemProps>) {
			super(props)
			this.state = {
				showDeleteDeviceConfirm: null,
				showKillDeviceConfirm: null,
			}
		}
		deviceTypeString() {
			let t = this.props.t

			switch (this.props.device.type) {
				case PeripheralDeviceAPI.DeviceType.MOS:
					return t('MOS Gateway')
				case PeripheralDeviceAPI.DeviceType.PLAYOUT:
					return t('Play-out Gateway')
				case PeripheralDeviceAPI.DeviceType.MEDIA_MANAGER:
					return t('Media Manager')
				default:
					return t('Unknown Device')
			}
		}
		deviceVersions() {
			let versions = this.props.device.versions
			if (versions) {
				return _.map(versions, (version, packageName) => {
					return packageName + ': ' + version
				}).join('\n')
			}
		}
		onToggleIgnore(device: PeripheralDevice) {
			PeripheralDevices.update(device._id, {
				$set: {
					ignore: !device.ignore,
				},
			})
		}
		onRestartCasparCG(device: PeripheralDevice) {
			const { t } = this.props

			doModalDialog({
				title: t('Restart CasparCG Server'),
				message: t('Do you want to restart CasparCG Server?'),
				onAccept: (event: any) => {
					callPeripheralDeviceFunction(event, device._id, CASPARCG_RESTART_TIME, 'restartCasparCG')
						.then(() => {
							NotificationCenter.push(
								new Notification(
									undefined,
									NoticeLevel.NOTIFICATION,
									t('CasparCG on device "{{deviceName}}" restarting...', { deviceName: device.name }),
									'SystemStatus'
								)
							)
						})
						.catch((err) => {
							NotificationCenter.push(
								new Notification(
									undefined,
									NoticeLevel.WARNING,
									t('Failed to restart CasparCG on device: "{{deviceName}}": {{errorMessage}}', {
										deviceName: device.name,
										errorMessage: err + '',
									}),
									'SystemStatus'
								)
							)
						})
				},
			})
		}

		onRestartQuantel(device: PeripheralDevice) {
			const { t } = this.props

			doModalDialog({
				title: t('Restart Quantel Gateway'),
				message: t('Do you want to restart Quantel Gateway?'),
				onAccept: (event: any) => {
					callPeripheralDeviceFunction(event, device._id, undefined, 'restartQuantel')
						.then(() => {
							NotificationCenter.push(
								new Notification(
									undefined,
									NoticeLevel.NOTIFICATION,
									t('Quantel Gateway restarting...'),
									'SystemStatus'
								)
							)
						})
						.catch((err) => {
							NotificationCenter.push(
								new Notification(
									undefined,
									NoticeLevel.WARNING,
									t('Failed to restart Quantel Gateway: {{errorMessage}}', { errorMessage: err + '' }),
									'SystemStatus'
								)
							)
						})
				},
			})
		}

		onFormatHyperdeck(device: PeripheralDevice) {
			const { t } = this.props

			doModalDialog({
				title: t('Format HyperDeck disks'),
				message: t('Do you want to format the HyperDeck disks? This is a destructive action and cannot be undone.'),
				onAccept: (event: any) => {
					callPeripheralDeviceFunction(event, device._id, undefined, 'formatHyperdeck')
						.then(() => {
							NotificationCenter.push(
								new Notification(
									undefined,
									NoticeLevel.NOTIFICATION,
									t('Formatting HyperDeck disks on device "{{deviceName}}"...', { deviceName: device.name }),
									'SystemStatus'
								)
							)
						})
						.catch((err) => {
							NotificationCenter.push(
								new Notification(
									undefined,
									NoticeLevel.WARNING,
									t('Failed to format HyperDecks on device: "{{deviceName}}": {{errorMessage}}', {
										deviceName: device.name,
										errorMessage: err + '',
									}),
									'SystemStatus'
								)
							)
						})
				},
			})
		}

		render() {
			const { t } = this.props

			return (
				<div key={unprotectString(this.props.device._id)} className="device-item">
					<div className="status-container">
						<PeripheralDeviceStatus device={this.props.device} />

						<div className="device-item__last-seen">
							<label>{t('Last seen')}: </label>
							<div className="value">
								<Moment from={getCurrentTime()} date={this.props.device.lastSeen} />
							</div>
						</div>
					</div>
					<div className="device-item__id">
						<Tooltip
							overlay={t('Connect some devices to the playout gateway')}
							visible={
								getHelpMode() &&
								this.props.device.type === PeripheralDeviceAPI.DeviceType.PLAYOUT &&
								this.props.toplevel === true &&
								!this.props.hasChildren &&
								this.props.hasChildren !== undefined
							}
							placement="right"
						>
							{getAllowConfigure() ? (
								<div className="value">
									<Link to={'/settings/peripheralDevice/' + this.props.device._id}>{this.props.device.name}</Link>
								</div>
							) : (
								<div className="value">{this.props.device.name}</div>
							)}
						</Tooltip>
					</div>
					{this.props.device.versions ? (
						<div className="device-item__version">
							<label>{t('Version')}: </label>
							<div className="value">
								<a title={this.deviceVersions()} href="#">
									{this.props.device.versions._process || 'N/A'}
								</a>
							</div>
						</div>
					) : null}

					<div className="actions-container">
						<div className="device-item__actions">
							{getAllowStudio() &&
							this.props.device.type === PeripheralDeviceAPI.DeviceType.PLAYOUT &&
							this.props.device.subType === TSR.DeviceType.CASPARCG ? (
								<React.Fragment>
									<button
										className="btn btn-secondary"
										onClick={(e) => {
											e.preventDefault()
											e.stopPropagation()
											this.onRestartCasparCG(this.props.device)
										}}
									>
										{t('Restart')}
										{/** IDK what this does, but it doesn't seem to make a lot of sense: JSON.stringify(this.props.device.settings) */}
									</button>
								</React.Fragment>
							) : null}
							{getAllowStudio() &&
							this.props.device.type === PeripheralDeviceAPI.DeviceType.PLAYOUT &&
							this.props.device.subType === TSR.DeviceType.HYPERDECK ? (
								<React.Fragment>
									<button
										className="btn btn-secondary"
										onClick={(e) => {
											e.preventDefault()
											e.stopPropagation()
											this.onFormatHyperdeck(this.props.device)
										}}
									>
										{t('Format disks')}
									</button>
								</React.Fragment>
							) : null}
							{getAllowStudio() &&
							this.props.device.type === PeripheralDeviceAPI.DeviceType.PLAYOUT &&
							this.props.device.subType === TSR.DeviceType.QUANTEL ? (
								<React.Fragment>
									<button
										className="btn btn-secondary"
										onClick={(e) => {
											e.preventDefault()
											e.stopPropagation()
											this.onRestartQuantel(this.props.device)
										}}
									>
										{t('Restart Quantel Gateway')}
									</button>
								</React.Fragment>
							) : null}
							{getAllowDeveloper() ? (
								<button
									key="button-ignore"
									className={ClassNames('btn btn-secondary', {
										warn: this.props.device.ignore,
									})}
									onClick={(e) => {
										e.preventDefault()
										e.stopPropagation()
										this.onToggleIgnore(this.props.device)
									}}
								>
									<FontAwesomeIcon icon={faEye} />
								</button>
							) : null}
							{this.props.showRemoveButtons ? (
								<button
									key="button-device"
									className="btn btn-primary"
									onClick={(e) => {
										e.preventDefault()
										e.stopPropagation()

										doModalDialog({
											title: t('Delete'),
											message: (
												<p>
													{t('Are you sure you want to delete this device: "{{deviceId}}"?', {
														deviceId: this.props.device.name || this.props.device._id,
													})}
												</p>
											),
											onAccept: () => {
												MeteorCall.peripheralDevice.removePeripheralDevice(this.props.device._id).catch(console.error)
											},
										})
									}}
								>
									<FontAwesomeIcon icon={faTrash} />
								</button>
							) : null}
							{getAllowStudio() && this.props.device.subType === PeripheralDeviceAPI.SUBTYPE_PROCESS ? (
								<React.Fragment>
									<button
										className="btn btn-secondary"
										onClick={(e) => {
											e.preventDefault()
											e.stopPropagation()

											doModalDialog({
												title: t('Delete'),
												message: <p>{t('Are you sure you want to restart this device?')}</p>,
												onAccept: () => {
													const { t } = this.props
													PeripheralDevicesAPI.restartDevice(this.props.device, e)
														.then(() => {
															NotificationCenter.push(
																new Notification(
																	undefined,
																	NoticeLevel.NOTIFICATION,
																	t('Device "{{deviceName}}" restarting...', {
																		deviceName: this.props.device.name,
																	}),
																	'SystemStatus'
																)
															)
														})
														.catch((err) => {
															NotificationCenter.push(
																new Notification(
																	undefined,
																	NoticeLevel.WARNING,
																	t('Failed to restart device: "{{deviceName}}": {{errorMessage}}', {
																		deviceName: this.props.device.name,
																		errorMessage: err + '',
																	}),
																	'SystemStatus'
																)
															)
														})
												},
											})
										}}
									>
										{t('Restart')}
									</button>
								</React.Fragment>
							) : null}
						</div>
					</div>

					<div className="clear"></div>
				</div>
			)
		}
	}
)

interface ICoreItemProps {
	systemStatus: StatusResponse | undefined
	coreSystem: ICoreSystem
}

interface ICoreItemState {}

const PackageInfo = require('../../../package.json')

export const CoreItem = reacti18next.withTranslation()(
	class CoreItem extends React.Component<Translated<ICoreItemProps>, ICoreItemState> {
		constructor(props: Translated<ICoreItemProps>) {
			super(props)
			this.state = {}
		}

		render() {
			const { t } = this.props

			return (
				<div key={unprotectString(this.props.coreSystem._id)} className="device-item">
					<div className="status-container">
						<div
							className={ClassNames(
								'device-status',
								this.props.systemStatus &&
									this.props.systemStatus.status && {
										'device-status--unknown': this.props.systemStatus.status === 'UNDEFINED',
										'device-status--good': this.props.systemStatus.status === 'OK',
										'device-status--warning': this.props.systemStatus.status === 'WARNING',
										'device-status--fatal': this.props.systemStatus.status === 'FAIL',
									}
							)}
						>
							<div className="value">
								<span className="pill device-status__label">
									<a
										href="#"
										title={
											this.props.systemStatus && this.props.systemStatus._internal.messages
												? this.props.systemStatus._internal.messages.join('\n')
												: undefined
										}
									>
										{this.props.systemStatus && this.props.systemStatus.status}
									</a>
								</span>
							</div>
						</div>
					</div>
					<div className="device-item__id">
						<div className="value">
							{t('Sofie Automation Server Core: {{name}}', { name: this.props.coreSystem.name || 'unnamed' })}
						</div>
					</div>
					<div className="device-item__version">
						<label>{t('Version')}: </label>
						<div className="value">{PackageInfo.version || 'UNSTABLE'}</div>
					</div>

					{(getAllowConfigure() || getAllowDeveloper()) && (
						<div className="actions-container">
							<div className="device-item__actions">
								<button
									className="btn btn-secondary"
									onClick={(e) => {
										e.preventDefault()
										e.stopPropagation()

										doModalDialog({
											title: t('Restart this system?'),
											yes: t('Restart'),
											no: t('Cancel'),
											message: (
												<p>
													{t('Are you sure you want to restart this Sofie Automation Server Core: {{name}}?', {
														name: this.props.coreSystem.name || 'unnamed',
													})}
												</p>
											),
											onAccept: (e) => {
												doUserAction(
													t,
													e,
													UserAction.GENERATE_RESTART_TOKEN,
													(e) => MeteorCall.userAction.generateRestartToken(e),
													(err, token) => {
														if (err || !token) {
															NotificationCenter.push(
																new Notification(
																	undefined,
																	NoticeLevel.CRITICAL,
																	t('Could not generate restart token!'),
																	'SystemStatus'
																)
															)
															return
														}
														const restartToken = getHash(RESTART_SALT + token)
														doUserAction(
															t,
															{},
															UserAction.RESTART_CORE,
															(e) => MeteorCall.userAction.restartCore(e, restartToken),
															(err, token) => {
																if (err || !token) {
																	NotificationCenter.push(
																		new Notification(
																			undefined,
																			NoticeLevel.CRITICAL,
																			t('Could not generate restart core: {{err}}', { err }),
																			'SystemStatus'
																		)
																	)
																	return
																}
																let time = 'unknown'
																const match = token.match(/([\d\.]+)s/)
																if (match) {
																	time = match[1]
																}
																NotificationCenter.push(
																	new Notification(
																		undefined,
																		NoticeLevel.WARNING,
																		t('Sofie Automation Server Core will restart in {{time}}s...', { time }),
																		'SystemStatus'
																	)
																)
															}
														)
													}
												)
											},
										})
									}}
								>
									{t('Restart')}
								</button>
							</div>
						</div>
					)}

					<div className="clear"></div>
				</div>
			)
		}
	}
)

interface ISystemStatusProps {}
interface ISystemStatusState {
	systemStatus: StatusResponse | undefined
}
interface ISystemStatusTrackedProps {
	coreSystem: ICoreSystem | undefined
	devices: Array<PeripheralDevice>
}

interface DeviceInHierarchy {
	device: PeripheralDevice
	children: Array<DeviceInHierarchy>
}

export default translateWithTracker<ISystemStatusProps, ISystemStatusState, ISystemStatusTrackedProps>(() => {
	return {
		coreSystem: CoreSystem.findOne(),
		devices: PeripheralDevices.find({}, { sort: { lastConnected: -1 } }).fetch(),
	}
})(
	class SystemStatus extends MeteorReactComponent<
		Translated<ISystemStatusProps & ISystemStatusTrackedProps>,
		ISystemStatusState
	> {
		private refreshInterval: NodeJS.Timer | undefined = undefined
		private destroyed: boolean = false

		constructor(props) {
			super(props)

			this.state = {
				systemStatus: undefined,
			}
		}

		componentDidMount() {
			this.refreshSystemStatus()
			this.refreshInterval = setInterval(this.refreshSystemStatus, 5000)

			// Subscribe to data:
			this.subscribe(PubSub.peripheralDevices, {})
		}

		componentWillUnmount() {
			if (this.refreshInterval) clearInterval(this.refreshInterval)
			this.destroyed = true
		}

		refreshSystemStatus = () => {
			const { t } = this.props
			MeteorCall.systemStatus
				.getSystemStatus()
				.then((systemStatus: StatusResponse) => {
					if (this.destroyed) return

					this.setState({
						systemStatus: systemStatus,
					})
				})
				.catch(() => {
					if (this.destroyed) return
					// console.error(err)
					NotificationCenter.push(
						new Notification(
							'systemStatus_failed',
							NoticeLevel.CRITICAL,
							t('Could not get system status. Please consult system administrator.'),
							'RundownList'
						)
					)
					return
				})
		}

		renderPeripheralDevices() {
			let devices: Array<DeviceInHierarchy> = []
			let refs = {}
			let devicesToAdd = {}
			// First, add all as references:
			_.each(this.props.devices, (device) => {
				let d: DeviceInHierarchy = {
					device: device,
					children: [],
				}
				refs[unprotectString(device._id)] = d
				devicesToAdd[unprotectString(device._id)] = d
			})
			// Then, map and add devices:
			_.each(devicesToAdd, (d: DeviceInHierarchy) => {
				if (d.device.parentDeviceId) {
					let parent: DeviceInHierarchy = refs[unprotectString(d.device.parentDeviceId)]
					if (parent) {
						parent.children.push(d)
					} else {
						// not found, add on top level then:
						devices.push(d)
					}
				} else {
					devices.push(d)
				}
			})

			const getDeviceContent = (d: DeviceInHierarchy, toplevel: boolean): JSX.Element => {
				let content: JSX.Element[] = [
					<DeviceItem
						key={'device' + d.device._id}
						device={d.device}
						toplevel={toplevel}
						hasChildren={d.children.length !== 0}
					/>,
				]
				if (d.children.length) {
					let children: JSX.Element[] = []
					_.each(d.children, (child: DeviceInHierarchy) =>
						children.push(
							<li key={'childdevice' + child.device._id} className="child-device-li">
								{getDeviceContent(child, false)}
							</li>
						)
					)
					content.push(
						<div key={d.device._id + '_children'} className="children">
							<ul className="childlist">{children}</ul>
						</div>
					)
				}
				return (
					<div key={d.device._id + '_parent'} className="device-item-container">
						{content}
					</div>
				)
			}

			return (
				<React.Fragment>
					{this.props.coreSystem && (
						<CoreItem coreSystem={this.props.coreSystem} systemStatus={this.state.systemStatus} />
					)}
					{_.map(devices, (d) => getDeviceContent(d, true))}
				</React.Fragment>
			)
		}

		render() {
			const { t } = this.props

			return (
				<div className="mhl gutter system-status">
					<header className="mbs">
						<h1>{t('System Status')}</h1>
					</header>
					<div className="mod mvl">{this.renderPeripheralDevices()}</div>
				</div>
			)
		}
	}
)

interface PeripheralDeviceStatusProps {
	device: PeripheralDevice
}
interface PeripheralDeviceStatusState {}
export const PeripheralDeviceStatus = reacti18next.withTranslation()(
	class PeripheralDeviceStatus extends React.Component<
		PeripheralDeviceStatusProps & reacti18next.WithTranslation,
		PeripheralDeviceStatusState
	> {
		constructor(props: PeripheralDeviceStatusProps & reacti18next.WithTranslation) {
			super(props)
		}
		statusCodeString() {
			const { t } = this.props

			return this.props.device.connected
				? statusCodeToString(t, this.props.device.status.statusCode)
				: t('Not Connected')
		}
		statusMessages() {
			let messages = ((this.props.device || {}).status || {}).messages || []
			return messages.length ? '"' + messages.join(', ') + '"' : ''
		}
		render() {
			const statusClassNames = [
				'device-status',
				this.props.device.status.statusCode === PeripheralDeviceAPI.StatusCode.UNKNOWN || !this.props.device.connected
					? 'device-status--unknown'
					: this.props.device.status.statusCode === PeripheralDeviceAPI.StatusCode.GOOD
					? 'device-status--good'
					: this.props.device.status.statusCode === PeripheralDeviceAPI.StatusCode.WARNING_MINOR
					? 'device-status--minor-warning'
					: this.props.device.status.statusCode === PeripheralDeviceAPI.StatusCode.WARNING_MAJOR
					? 'device-status--warning'
					: this.props.device.status.statusCode === PeripheralDeviceAPI.StatusCode.BAD
					? 'device-status--bad'
					: this.props.device.status.statusCode === PeripheralDeviceAPI.StatusCode.FATAL
					? 'device-status--fatal'
					: '',
			].join(' ')
			return (
				<div className={statusClassNames}>
					<div className="value">
						<span className="pill device-status__label">{this.statusCodeString()}</span>
					</div>
					<div className="device-item__device-status-message">
						<span className="text-s dimmed">{this.statusMessages()}</span>
					</div>
				</div>
			)
		}
	}
)
