import * as React from 'react'
import CoreIcon from '@nrk/core-icons/jsx'
import ClassNames from 'classnames'
import * as VelocityReact from 'velocity-react'
import { translateWithTracker, Translated, withTracker } from '../ReactMeteorData/ReactMeteorData'
import { MeteorReactComponent } from '../MeteorReactComponent'
import { NotificationCenter, Notification, NoticeLevel, NotificationAction } from './notifications'
import { ContextMenuTrigger, ContextMenu, MenuItem } from '@jstarpl/react-contextmenu'
import * as _ from 'underscore'
import { RundownId } from '../../../lib/collections/Rundowns'
import { SegmentId } from '../../../lib/collections/Segments'
import { translateMessage, isTranslatableMessage } from '../../../lib/api/TranslatableMessage'
import { CriticalIcon, WarningIcon, CollapseChevrons, InformationIcon } from '../ui/icons/notifications'
import update from 'immutability-helper'
import { i18nTranslator } from '../../ui/i18n'

interface IPopUpProps {
	id?: string
	item: Notification
	showDismiss?: boolean
	isHighlighted?: boolean
	onDismiss?: (e: any) => void
	className?: string
	style?: React.CSSProperties
}

/**
 * The component that is used for both elements within the Notification Center as well as the Notification pop-ups as well
 * @class NotificationPopUp
 * @extends React.Component<IPopUpProps>
 */
class NotificationPopUp extends React.Component<IPopUpProps> {
	triggerEvent = (action: NotificationAction, e) => {
		if (action.action) {
			action.action()
		} else {
			if (this.props.item.actions && this.props.item.actions.find((i) => i.type === action.type)) {
				this.props.item.action(action.type, e)
			}
		}
	}

	render() {
		const { item } = this.props

		const allActions: NotificationAction[] = item.actions || []
		const defaultActions: NotificationAction[] = allActions.filter((action) => action.type === 'default')

		const defaultAction: NotificationAction | undefined =
			defaultActions.length === 1 && allActions.length === 1 ? defaultActions[0] : undefined

		const message = isTranslatableMessage(item.message) ? translateMessage(item.message, i18nTranslator) : item.message

		return (
			<div
				id={this.props.id}
				className={ClassNames(
					'notification-pop-up',
					{
						critical: item.status === NoticeLevel.CRITICAL,
						notice: item.status === NoticeLevel.NOTIFICATION,
						warning: item.status === NoticeLevel.WARNING,
						tip: item.status === NoticeLevel.TIP,
						persistent: item.persistent,

						'is-highlighted': this.props.isHighlighted,
					},
					this.props.className
				)}
				style={this.props.style}
			>
				<div className="notification-pop-up__header">
					{item.status === NoticeLevel.CRITICAL ? (
						<CriticalIcon />
					) : item.status === NoticeLevel.WARNING ? (
						<WarningIcon />
					) : (
						<InformationIcon />
					)}
				</div>
				<div className="notification-pop-up__contents">
					{message}
					{defaultAction || allActions.length ? (
						<div className="notification-pop-up__actions">
							{defaultAction ? (
								<div className="notification-pop-up__actions--default">
									<button
										disabled={defaultAction.disabled}
										className="btn btn-default notification-pop-up__actions--button"
										onClick={(e) => this.triggerEvent(defaultAction, e)}
									>
										<CoreIcon.NrkArrowLeft
											className="icon"
											width="1em"
											height="1em"
											style={{ verticalAlign: 'middle', marginTop: '-0.1em', marginRight: '-0.4em' }}
										/>
										<span className="label">{defaultAction.label}</span>
									</button>
								</div>
							) : !defaultAction && allActions.length ? (
								<div className="notification-pop-up__actions--other">
									{_.map(allActions, (action: NotificationAction, i: number) => {
										return (
											<button
												disabled={action.disabled}
												key={i}
												className={ClassNames(
													'btn',
													['default', 'primary'].indexOf(action.type) ? 'btn-primary' : 'btn-default'
												)}
												onClick={(e) => this.triggerEvent(action, e)}
											>
												{action.label}
											</button>
										)
									})}
								</div>
							) : null}
						</div>
					) : null}
				</div>
				{this.props.showDismiss && (
					<ContextMenuTrigger id="context-menu-dissmiss-all" attributes={{ className: 'notification-pop-up__dismiss' }}>
						<button
							className={
								'notification-pop-up__dismiss__button ' +
								(this.props.item.persistent ? '' : 'notification-pop-up__dismiss__button--close')
							}
							onClick={(e) => {
								e.stopPropagation()
								if (typeof this.props.onDismiss === 'function') this.props.onDismiss(e)
							}}
						>
							{this.props.item.persistent ? <CollapseChevrons /> : <CoreIcon.NrkClose id="nrk-close" />}
						</button>
					</ContextMenuTrigger>
				)}
			</div>
		)
	}
}

/**
 * NotificationCenterPopUps props.
 */
interface IProps {
	/** Should the list show a 'List empty' label, if the notification list is empty? Defaults to false */
	showEmptyListLabel?: boolean
	/** Should snoozed notifications be shown? Defaults to false */
	showSnoozed?: boolean
	/** Limit the amount of shown notifications */
	limitCount?: number

	filter?: NoticeLevel
}

interface IState {
	displayList: boolean
	dismissing: string[]
	dismissingTransform: string[]
}

interface ITrackedProps {
	notifications: Array<Notification>
	highlightedSource: RundownId | SegmentId | string | undefined
	highlightedLevel: NoticeLevel
}

/**
 * Presentational component that displays a list of notifications from the Notification Center.
 * @class NotificationCenterPopUps
 * @extends React.Component<IProps>
 */
export const NotificationCenterPopUps = translateWithTracker<IProps, IState, ITrackedProps>(() => {
	return {
		notifications: NotificationCenter.getNotifications(),
		highlightedSource: NotificationCenter.getHighlightedSource(),
		highlightedLevel: NotificationCenter.getHighlightedLevel(),
	}
})(
	class NotificationCenterPopUps extends MeteorReactComponent<Translated<IProps & ITrackedProps>, IState> {
		private readonly DISMISS_ANIMATION_DURATION = 500
		private readonly LEAVE_ANIMATION_DURATION = 150

		constructor(props: Translated<IProps & ITrackedProps>) {
			super(props)

			this.state = {
				displayList: props.notifications.length > 0,
				dismissing: [],
				dismissingTransform: [],
			}
		}

		private innerDismissNotification(item: Notification) {
			if (item.persistent) {
				item.snooze()
			} else {
				item.drop()
			}
		}

		dismissNotification(item: Notification, key: string) {
			if (!this.state.dismissing.includes(key)) {
				if (item.persistent) {
					this.setState({
						dismissing: update(this.state.dismissing, {
							$push: [key],
						}),
						dismissingTransform: update(this.state.dismissingTransform, {
							$push: [this.createDismissTransform(`notification-pop-up_${key}`) || ''],
						}),
					})

					setTimeout(() => {
						this.innerDismissNotification(item)
						setTimeout(() => {
							this.setState({
								dismissing: update(this.state.dismissing, {
									$splice: [[this.state.dismissing.indexOf(key), 1]],
								}),
								dismissingTransform: update(this.state.dismissingTransform, {
									$splice: [[this.state.dismissing.indexOf(key), 1]],
								}),
							})
						}, this.LEAVE_ANIMATION_DURATION + 10)
					}, this.DISMISS_ANIMATION_DURATION)
				} else {
					this.innerDismissNotification(item)
				}
			}
		}

		dismissAll() {
			const notificationsToDismiss: string[] = []

			for (const notification of this.props.notifications) {
				if (notification.persistent) {
					const key = this.notificationKey(notification)
					if (!this.state.dismissing.includes(key)) notificationsToDismiss.push(key)
				} else {
					this.innerDismissNotification(notification)
				}
			}

			this.setState({
				dismissing: update(this.state.dismissing, {
					$push: notificationsToDismiss,
				}),
				dismissingTransform: update(this.state.dismissingTransform, {
					$push: notificationsToDismiss.map((key) => this.createDismissTransform(`notification-pop-up_${key}`) || ''),
				}),
			})

			setTimeout(() => {
				const indexes = notificationsToDismiss
					.map((value) => this.state.dismissing.indexOf(value))
					.map((index) => [index, 1]) as [number, number][]

				setTimeout(() => {
					this.setState({
						dismissing: update(this.state.dismissing, {
							$splice: indexes,
						}),
						dismissingTransform: update(this.state.dismissingTransform, {
							$splice: indexes,
						}),
					})
				}, this.LEAVE_ANIMATION_DURATION + 10)

				for (const notification of this.props.notifications) {
					this.innerDismissNotification(notification)
				}
			}, this.DISMISS_ANIMATION_DURATION)
		}

		UNSAFE_componentWillUpdate() {
			Array.from(document.querySelectorAll('.notification-pop-up.is-highlighted')).forEach((element0: Element) => {
				const element = element0 as HTMLElement
				if ('style' in element) {
					element.style.animationName = ''
				}
			})
		}

		componentDidUpdate(prevProps, prevState, snapshot) {
			if (super.componentDidUpdate) super.componentDidUpdate(prevProps, prevState, snapshot)

			if (
				this.props.highlightedSource &&
				this.props.highlightedLevel &&
				(prevProps.highlightedSource !== this.props.highlightedSource ||
					prevProps.highlightedLevel !== this.props.highlightedLevel)
			) {
				const items: NodeListOf<HTMLElement> = document.querySelectorAll('.notification-pop-up.is-highlighted')
				if (items.length > 0) {
					// scroll to highlighted items
					const currentAnimationName = getComputedStyle(items[0]).getPropertyValue('animation-name')

					const container = document.querySelector('.notification-center-panel .notification-pop-ups')
					if (container) {
						const offsetTop = items[0].offsetTop || 0

						container.scrollTo({
							left: 0,
							top: offsetTop - 10,
							behavior: 'smooth',
						})
					}

					Array.from(items).forEach((item) => {
						item.style.animationName = 'none'
					})

					if (currentAnimationName !== 'none') {
						window.requestAnimationFrame(function () {
							Array.from(items).forEach((item) => {
								item.style.animationName = currentAnimationName
							})
						})
					}
				}
			}

			if (this.props.notifications.length > 0 && this.state.displayList !== true) {
				this.setState({
					displayList: true,
				})
			}
		}

		private createDismissTransform = (id: string, toggleButtonRect?: ClientRect) => {
			const notificationEl = document.getElementById(id)
			const toggleButtonEl = toggleButtonRect
				? null
				: document.getElementsByClassName('notifications__toggle-button')[0]

			if (notificationEl && (toggleButtonEl || toggleButtonRect)) {
				const notificationPosition = notificationEl.getClientRects()[0]
				const toggleButtonPosition = toggleButtonRect
					? toggleButtonRect
					: toggleButtonEl
					? toggleButtonEl.getClientRects()[0]
					: null
				if (toggleButtonPosition) {
					const style = `translate3d(${toggleButtonPosition.left - notificationPosition.left}px, ${
						toggleButtonPosition.top - notificationPosition.top
					}px, 0) scale(0)`
					return style
				}
			}
			return undefined
		}

		private getNotificationsToDisplay = () => {
			const filter = (i: Notification) =>
				(this.props.showSnoozed || !i.snoozed) &&
				(this.props.filter === undefined || (i.status & this.props.filter) !== 0)
			const sort = (a: Notification, b: Notification) => Notification.compare(a, b)
			if (this.props.limitCount !== undefined) {
				return this.props.notifications.filter(filter).sort(sort).slice(0, this.props.limitCount)
			} else {
				return this.props.notifications.filter(filter).sort(sort)
			}
		}

		private checkKeepDisplaying = () => {
			const notifications = this.getNotificationsToDisplay()
			if (notifications.length === 0) {
				this.setState({
					displayList: false,
				})
			}
		}

		private notificationKey = (item: Notification) => {
			if (item.id) {
				return item.id
			}

			if (item.message === null) {
				return `${item.created}null`
			}

			if (typeof item.message === 'string') {
				return `${item.created}${item.message}`
			}

			if (isTranslatableMessage(item.message)) {
				return `${item.created}${translateMessage(item.message, this.props.t)}`
			}

			return `${item.created}$jsx_${btoa(JSON.stringify(item.message))}`
		}

		render() {
			const { t, highlightedSource, highlightedLevel } = this.props

			const notifications = this.getNotificationsToDisplay()

			const displayList = notifications.map((item) => {
				const key = this.notificationKey(item)
				const index = this.state.dismissing.indexOf(key)
				return (
					<NotificationPopUp
						id={`notification-pop-up_${key}`}
						key={key}
						item={item}
						onDismiss={() => this.dismissNotification(item, key)}
						className={index >= 0 ? 'notification-pop-up--dismiss' : undefined}
						showDismiss={!item.persistent || !this.props.showSnoozed}
						isHighlighted={item.source === highlightedSource && item.status === highlightedLevel}
						style={index >= 0 ? { transform: this.state.dismissingTransform[index], opacity: 0 } : undefined}
					/>
				)
			})

			return this.state.displayList ? (
				<div className="notification-pop-ups">
					<VelocityReact.VelocityTransitionGroup
						enter={{
							animation: {
								translateX: ['0%', '150%'],
								translateZ: 0,
								opacity: [1, 0],
							},
							easing: 'ease-out',
							duration: 300,
							display: 'flex',
						}}
						leave={{
							animation: 'fadeOut',
							easing: 'ease-in',
							duration: this.LEAVE_ANIMATION_DURATION,
							display: 'flex',
							complete: () => this.checkKeepDisplaying(),
						}}
					>
						{displayList}
						{this.props.showEmptyListLabel && displayList.length === 0 && (
							<div className="notification-pop-ups__empty-list">{t('No notifications')}</div>
						)}
					</VelocityReact.VelocityTransitionGroup>

					<ContextMenu id="context-menu-dissmiss-all">
						<MenuItem onClick={() => this.dismissAll()}>{t('Dismiss all notifications')}</MenuItem>
					</ContextMenu>
				</div>
			) : null
		}
	}
)

/**
 * Presentational component that displays a panel containing the NotificationCenterPopUps list containing
 * the snoozed items and an 'Empty' label if no notifications are present.
 * @export
 * @class NotificationCenterPanel
 * @extends React.Component
 */
export const NotificationCenterPanel = (props: { limitCount?: number; filter?: NoticeLevel }) => (
	<div className="notification-center-panel">
		<NotificationCenterPopUps
			showEmptyListLabel={true}
			showSnoozed={true}
			limitCount={props.limitCount}
			filter={props.filter}
		/>
	</div>
)

/**
 * NotificationCenterPanelToggle props
 * @interface IToggleProps
 */
interface IToggleProps {
	/** Click event handler */
	onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
	/** Use 'open' class for the button to signify that the notification center is open */
	isOpen?: boolean
	filter?: NoticeLevel
	className?: string
}

interface ITrackedCountProps {
	count: number
}

/**
 * A button for with a count of notifications in the Notification Center
 * @export
 * @class NotificationCenterPanelToggle
 * @extends React.Component<IToggleProps>
 */
export const NotificationCenterPanelToggle = withTracker<IToggleProps, {}, ITrackedCountProps>(
	(props: IToggleProps) => {
		return {
			count: NotificationCenter.count(props.filter),
		}
	}
)(
	class NotificationCenterPanelToggle extends MeteorReactComponent<IToggleProps & ITrackedCountProps> {
		render() {
			return (
				<button
					className={ClassNames(
						'status-bar__controls__button',
						'notifications__toggle-button',
						{
							'status-bar__controls__button--open': this.props.isOpen,
							'has-items': this.props.count > 0,
						},
						this.props.className
					)}
					role="button"
					onClick={this.props.onClick}
					tabIndex={0}
				>
					<VelocityReact.VelocityTransitionGroup
						enter={{
							animation: {
								translateX: [0, '-3em'],
								opacity: [1, 0],
							},
							duration: 500,
						}}
						leave={{
							animation: {
								translateX: ['3em', 0],
								opacity: [0, 1],
							},
							duration: 500,
						}}
					>
						{!this.props.isOpen ? (
							<div className="notifications__toggle-button__icon notifications__toggle-button__icon--default">
								{((this.props.filter || 0) & NoticeLevel.CRITICAL) !== 0 ? (
									<CriticalIcon />
								) : ((this.props.filter || 0) & NoticeLevel.CRITICAL) !== 0 ? (
									<WarningIcon />
								) : ((this.props.filter || 0) & (NoticeLevel.NOTIFICATION | NoticeLevel.TIP)) !== 0 ? (
									<InformationIcon />
								) : (
									<WarningIcon />
								)}
								{this.props.count > 0 && (
									<span className="notifications__toggle-button__count">
										{this.props.count > 99 ? '99+' : this.props.count}
									</span>
								)}
							</div>
						) : undefined}
						{this.props.isOpen ? (
							<div className="notifications__toggle-button__icon notifications__toggle-button__icon--collapse">
								<CollapseChevrons />
							</div>
						) : undefined}
					</VelocityReact.VelocityTransitionGroup>
				</button>
			)
		}
	}
)
