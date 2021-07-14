import * as React from 'react'
import { WithTranslation } from 'react-i18next'
import { Meteor } from 'meteor/meteor'
import { NavLink, Link } from 'react-router-dom'
import { NotificationCenterPanelToggle, NotificationCenterPanel } from '../lib/notifications/NotificationCenterPanel'
import { NotificationCenter, Notification, NoticeLevel } from '../lib/notifications/notifications'
import { ErrorBoundary } from '../lib/ErrorBoundary'
import { SupportPopUpToggle, SupportPopUp } from './SupportPopUp'
import * as VelocityReact from 'velocity-react'
import { MeteorReactComponent } from '../lib/MeteorReactComponent'
import { translateWithTracker, Translated } from '../lib/ReactMeteorData/ReactMeteorData'
import { CoreSystem } from '../../lib/collections/CoreSystem'
import { Settings } from '../../lib/Settings'

interface IPropsHeader {
	user: boolean
	allowConfigure?: boolean
	allowTesting?: boolean
	allowDeveloper?: boolean
}

interface ITrackedPropsHeader {
	name: string
}

interface IStateHeader {
	isNotificationCenterOpen: NoticeLevel | undefined
	isSupportPanelOpen: boolean
}

class Header extends MeteorReactComponent<Translated<IPropsHeader & ITrackedPropsHeader>, IStateHeader> {
	constructor(props: IPropsHeader & WithTranslation) {
		super(props)

		this.state = {
			isNotificationCenterOpen: undefined,
			isSupportPanelOpen: false,
		}
	}

	private handleLogout(e: React.MouseEvent<HTMLAnchorElement>) {
		e.preventDefault()
		Meteor.logout((error) => {
			if (error) {
				NotificationCenter.push(
					new Notification(
						undefined,
						NoticeLevel.WARNING,
						`Error when trying to log out: ${error.toString()}`,
						'Page Header'
					)
				)
			}
		})
	}

	onToggleNotifications = (e: React.MouseEvent<HTMLButtonElement>, filter: NoticeLevel | undefined) => {
		if (this.state.isNotificationCenterOpen === filter) {
			filter = undefined
		}
		NotificationCenter.isOpen = filter !== undefined ? true : false

		this.setState({
			isNotificationCenterOpen: filter,
		})
	}

	onToggleSupportPanel = () => {
		this.setState({
			isSupportPanelOpen: !this.state.isSupportPanelOpen,
		})
	}

	render() {
		const { t } = this.props

		return (
			<React.Fragment>
				<ErrorBoundary>
					<VelocityReact.VelocityTransitionGroup
						enter={{
							animation: {
								translateX: ['0%', '100%'],
							},
							easing: 'ease-out',
							duration: 300,
						}}
						leave={{
							animation: {
								translateX: ['100%', '0%'],
							},
							easing: 'ease-in',
							duration: 500,
						}}
					>
						{this.state.isNotificationCenterOpen !== undefined && (
							<NotificationCenterPanel limitCount={15} filter={this.state.isNotificationCenterOpen} />
						)}
					</VelocityReact.VelocityTransitionGroup>
					<VelocityReact.VelocityTransitionGroup
						enter={{
							animation: {
								translateX: ['0%', '100%'],
							},
							easing: 'ease-out',
							duration: 300,
						}}
						leave={{
							animation: {
								translateX: ['100%', '0%'],
							},
							easing: 'ease-in',
							duration: 500,
						}}
					>
						{this.state.isSupportPanelOpen && <SupportPopUp />}
					</VelocityReact.VelocityTransitionGroup>
				</ErrorBoundary>
				<ErrorBoundary>
					<div className="status-bar">
						<NotificationCenterPanelToggle
							onClick={(e) => this.onToggleNotifications(e, NoticeLevel.CRITICAL)}
							isOpen={this.state.isNotificationCenterOpen === NoticeLevel.CRITICAL}
							filter={NoticeLevel.CRITICAL}
							className="type-critical"
						/>
						<NotificationCenterPanelToggle
							onClick={(e) => this.onToggleNotifications(e, NoticeLevel.WARNING)}
							isOpen={this.state.isNotificationCenterOpen === NoticeLevel.WARNING}
							filter={NoticeLevel.WARNING}
							className="type-warning"
						/>
						<NotificationCenterPanelToggle
							onClick={(e) => this.onToggleNotifications(e, NoticeLevel.NOTIFICATION | NoticeLevel.TIP)}
							isOpen={this.state.isNotificationCenterOpen === (NoticeLevel.NOTIFICATION | NoticeLevel.TIP)}
							filter={NoticeLevel.NOTIFICATION | NoticeLevel.TIP}
							className="type-notification"
						/>
						<SupportPopUpToggle onClick={this.onToggleSupportPanel} isOpen={this.state.isSupportPanelOpen} />
					</div>
				</ErrorBoundary>
				<div className="header dark">
					<div className="gutter frow va-middle ha-between phm">
						<div className="fcol">
							<div className="frow">
								<Link className="badge" to="/">
									<div>
										<div className="media-elem mrs sofie-logo" />
										<div className="bd mls">
											<span className="logo-text">Sofie {this.props.name ? ' - ' + this.props.name : null}</span>
										</div>
									</div>
								</Link>
							</div>
						</div>
						<div className="fcol">
							<div className="frow ha-right">
								<nav className="links mod">
									{/* <NavLink to='/' activeClassName='active'>{t('Home')}</NavLink> */}
									<NavLink to="/rundowns" activeClassName="active">
										{t('Rundowns')}
									</NavLink>
									{this.props.allowTesting && (
										<NavLink to="/testTools" activeClassName="active">
											{t('Test Tools')}
										</NavLink>
									)}
									<NavLink to="/status" activeClassName="active">
										{t('Status')}
									</NavLink>
									{this.props.allowConfigure && (
										<NavLink to="/settings" activeClassName="active">
											{t('Settings')}
										</NavLink>
									)}
									{Settings.enableUserAccounts && this.props.user && (
										<NavLink to="/account" activeClassName="active">
											{t('Account')}
										</NavLink>
									)}
									{Settings.enableUserAccounts && this.props.user && (
										<NavLink to="/" activeClassName="active" onClick={this.handleLogout}>
											{t('Logout')}
										</NavLink>
									)}
								</nav>
							</div>
						</div>
					</div>
				</div>
			</React.Fragment>
		)
	}
}

export default translateWithTracker((_props: IPropsHeader & WithTranslation) => {
	const coreSystem = CoreSystem.findOne()
	let name: string | undefined = undefined

	if (coreSystem) {
		name = coreSystem.name
	}

	return {
		name,
	}
})(Header)
