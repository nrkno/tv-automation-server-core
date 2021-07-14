import { ReactiveVar } from 'meteor/reactive-var'
import * as _ from 'underscore'
import { Tracker } from 'meteor/tracker'
import { Meteor } from 'meteor/meteor'
import { Random } from 'meteor/random'
import { EventEmitter } from 'events'
import { Time, ProtectedString, unprotectString, isProtectedString, protectString } from '../../../lib/lib'
import { SegmentId } from '../../../lib/collections/Segments'
import { ITranslatableMessage } from '../../../lib/api/TranslatableMessage'
import { RundownAPI } from '../../../lib/api/rundown'
import { RundownId } from '../../../lib/collections/Rundowns'

/**
 * Priority level for Notifications.
 *
 * @export
 * @enum {number}
 */
export enum NoticeLevel {
	/** Highest priority notification. Subject matter will affect operations. */
	CRITICAL = 0b0001, // 1
	/** High priority notification. Operations will not be affected, but non-critical functions may be affected or the result may be undesirable. */
	WARNING = 0b0010, // 2
	/** Confirmation of a successful operation and general informations. */
	NOTIFICATION = 0b0100, // 3
	/** Tips to the user */
	TIP = 0b1000, // 4
}

/**
 * An action object interface defining actions that the user can take on an action
 *
 * @export
 * @interface NotificationAction
 */
export interface NotificationAction {
	/** User-presented string label on the action button */
	label: string
	/** Action type. If set to 'default', will attach this action to a click on the notification. */
	type: string // for a default, use 'default'
	/** Icon shown on the action button. */
	icon?: any
	/** The method that will be called when the user takes the aciton. */
	action?: Function
	/** If true, will disable the action (ie the button will show, but not clickable). */
	disabled?: boolean
}

/** A source of notifications */
export type Notifier = () => NotificationList

const notifiers: { [index: string]: NotifierHandle } = {}

const notifications: { [index: string]: Notification } = {}
const notificationsDep: Tracker.Dependency = new Tracker.Dependency()

interface NotificationHandle {
	id: string
	stop: () => void
}

/**
 * A reactive list of notifications, produced by a Notifier.
 *
 * @export
 * @class NotificationList
 * @extends {ReactiveVar<Notification[]>}
 */
export class NotificationList extends ReactiveVar<Notification[]> {}

/**
 * A handle object to a registered notifier.
 *
 * @export
 * @class NotifierObject
 */
export class NotifierHandle {
	id: string
	source: Notifier
	handle: Tracker.Computation
	result: Array<Notification> = []

	/**
	 * Creates an instance of NotifierHandle. Used internally by the Notification Center singleton.
	 * @param {string} notifierId
	 * @param {Notifier} source
	 * @memberof NotifierHandle
	 */
	constructor(notifierId: string, source: Notifier) {
		this.id = notifierId
		this.source = source
		this.handle = Tracker.nonreactive(() => {
			return Tracker.autorun(() => {
				this.result = source().get()
				notificationsDep.changed()
			})
		}) as any as Tracker.Computation

		notifiers[notifierId] = this
	}

	/**
	 * Stop notifications from this notifier.
	 *
	 * @memberof NotifierHandle
	 */
	stop(): void {
		this.handle.stop()

		delete notifiers[this.id]

		notificationsDep.changed()
	}
}

type NotificationsSource = RundownId | SegmentId | string | undefined
/**
 * Singleton handling all the notifications.
 *
 * @class NotificationCenter0
 */
class NotificationCenter0 {
	/** Default notification timeout for non-persistent notifications */
	private readonly NOTIFICATION_TIMEOUT = 5000
	/** The highlighted source of notifications */
	private highlightedSource: ReactiveVar<NotificationsSource>
	/** The highlighted level of highlighted level */
	private highlightedLevel: ReactiveVar<NoticeLevel>

	private _isOpen: boolean = false

	/** In concentration mode, non-Critical notifications will be snoozed automatically */
	private _isConcentrationMode: boolean = false

	constructor() {
		this.highlightedSource = new ReactiveVar<NotificationsSource>(undefined)
		this.highlightedLevel = new ReactiveVar<NoticeLevel>(NoticeLevel.TIP)
	}

	get isConcentrationMode(): boolean {
		return this._isConcentrationMode
	}

	set isConcentrationMode(value: boolean) {
		this._isConcentrationMode = value

		if (value)
			NotificationCenter.snoozeAll(
				{
					status: NoticeLevel.TIP,
				},
				{
					status: NoticeLevel.NOTIFICATION,
				},
				{
					status: NoticeLevel.WARNING,
				}
			)
	}

	get isOpen(): boolean {
		return this._isOpen
	}

	set isOpen(value: boolean) {
		this._isOpen = value

		if (value) NotificationCenter.snoozeAll()
	}

	/**
	 * Register a notifier in the Notification center.
	 *
	 * @param {Notifier} source The notifier to be registered.
	 * @returns {NotifierHandle} The handler than can be used to unregister a notifier.
	 * @memberof NotificationCenter0
	 */
	registerNotifier(source: Notifier): NotifierHandle {
		const notifierId = Random.id()

		return new NotifierHandle(notifierId, source)
	}

	/**
	 * Push a single-use notification into the Notification Center.
	 *
	 * @param {Notification} notice The notification to be added.
	 * @returns {NotificationHandle} The handler that can be used to drop the notification.
	 * @memberof NotificationCenter0
	 */
	push(notice: Notification): NotificationHandle {
		const id = notice.id || Random.id()
		notifications[id] = notice
		notice.id = id
		notificationsDep.changed()

		if (!notice.persistent) {
			this.timeout(notice)
		}

		if (!notice.snoozed && this._isOpen) {
			notice.snooze()
		}
		if (!notice.snoozed && this._isConcentrationMode) {
			if (notice.status !== NoticeLevel.CRITICAL && notice.timeout === undefined && notice.persistent === true) {
				notice.snooze()
			}
		}

		return {
			id,
			stop: () => {
				this.drop(id)
			},
		}
	}

	/**
	 * Remove a notification from the Notification Center
	 *
	 * @param {string} id The ID of a notification
	 * @memberof NotificationCenter0
	 */
	drop(id: string): void {
		if (notifications[id]) {
			notifications[id].emit('dropped')
			delete notifications[id]
			notificationsDep.changed()
		} else {
			throw new Meteor.Error(404, `Notification "${id}" could not be found in the Notification Center`)
		}
	}

	private willSnooze: { [k: string]: boolean } = {}

	/**
	 * Get a reactive array of notificaitons in the Notification Center
	 *
	 * @returns {Array<Notification>}
	 * @memberof NotificationCenter0
	 */
	getNotifications(): Array<Notification> {
		notificationsDep.depend()

		return _.flatten(
			Object.values(notifiers)
				.map((item) => {
					item.result.forEach((i) => {
						if (this._isOpen && !i.snoozed) i.snooze()
						if (
							this._isConcentrationMode &&
							!i.snoozed &&
							i.status !== NoticeLevel.CRITICAL &&
							i.timeout === undefined &&
							i.persistent === true
						) {
							i.snooze()
						}
					})
					return item.result
				})
				.concat(Object.values(notifications))
		)
	}

	/**
	 * Get a reactive number of notifications in the Notification Center
	 *
	 * @returns {number}
	 * @memberof NotificationCenter0
	 */
	count(filter?: NoticeLevel): number {
		notificationsDep.depend()

		// return (
		// 	Object.values(notifiers)
		// 		.map((item) => (item.result || []).length)
		// 		.reduce((a, b) => a + b, 0) + Object.values(notifications).length
		// )
		if (filter === undefined) {
			return (
				Object.values(notifiers).reduce<number>((a, b) => a + (b.result || []).length, 0) +
				Object.values(notifications).length
			)
		} else {
			return (
				Object.values(notifiers).reduce<number>(
					(a, b) => a + (b.result || []).filter((item) => (item.status & filter) !== 0).length,
					0
				) + Object.values(notifications).filter((item) => (item.status & filter) !== 0).length
			)
		}
	}

	/**
	 * Dismiss all notifications in the Notification Center
	 *
	 * @memberof NotificationCenter0
	 */
	snoozeAll(...filters: Partial<Notification>[]) {
		let n = this.getNotifications()
		if (filters && filters.length) {
			const matchers = filters.map((filter) => _.matches(filter))
			n = n.filter((v, _index, _array) =>
				_.reduce<boolean, boolean>(
					matchers.map((m) => m(v)),
					(value, memo) => value || memo,
					false
				)
			)
		}
		n.forEach((item) => item.snooze())
	}

	/**
	 * Highlight all notifications from a given source at a given notification level
	 *
	 * @param {(string | undefined)} source
	 * @param {NoticeLevel} level
	 * @memberof NotificationCenter0
	 */
	highlightSource(source: SegmentId | undefined, level: NoticeLevel) {
		this.highlightedSource.set(source)
		this.highlightedLevel.set(level)
	}

	/**
	 * Get the highlighted source ID
	 *
	 * @returns
	 * @memberof NotificationCenter0
	 */
	getHighlightedSource() {
		return this.highlightedSource.get()
	}

	/**
	 * Get the highlighted level
	 *
	 * @returns
	 * @memberof NotificationCenter0
	 */
	getHighlightedLevel() {
		return this.highlightedLevel.get()
	}

	/**
	 * Timeout the notification once the notification timeout elapses.
	 *
	 * @param {Notification} notice
	 * @memberof NotificationCenter0
	 */
	private timeout(notice: Notification): void {
		Meteor.setTimeout(() => {
			if (notice) {
				const id = notice.id
				if (id && notifications[id]) {
					this.drop(id)
				}
			}
		}, notice.timeout || this.NOTIFICATION_TIMEOUT)
	}
}

export const NotificationCenter = new NotificationCenter0()

/**
 * A Notification that can be presented to the user
 *
 * @export
 * @class Notification
 * @extends {EventEmitter}
 */
export class Notification extends EventEmitter {
	id: string | undefined
	status: NoticeLevel
	message: string | React.ReactElement<HTMLElement> | ITranslatableMessage | null
	source: NotificationsSource
	persistent?: boolean
	timeout?: number
	snoozed?: boolean
	actions?: Array<NotificationAction>
	created: Time
	rank: number

	constructor(
		id: string | ProtectedString<any> | undefined,
		status: NoticeLevel,
		message: string | React.ReactElement<HTMLElement> | ITranslatableMessage | null,
		source: NotificationsSource,
		created?: Time,
		persistent?: boolean,
		actions?: Array<NotificationAction>,
		rank?: number,
		timeout?: number
	) {
		super()

		this.id = isProtectedString(id) ? unprotectString(id) : id
		this.status = status
		this.message = message
		this.source = source
		this.persistent = persistent || false
		this.actions = actions || undefined
		this.created = created || Date.now()
		this.rank = rank || 0
		this.timeout = timeout
	}

	/**
	 * Check if two notifications are equal
	 *
	 * @static
	 * @param {(Notification | undefined)} a
	 * @param {(Notification | undefined)} b
	 * @returns {boolean}
	 * @memberof Notification
	 */
	static isEqual(a: Notification | undefined, b: Notification | undefined): boolean {
		if (typeof a !== typeof b) return false
		return _.isEqual(
			_.omit(a, ['created', 'snoozed', 'actions', '_events']),
			_.omit(b, ['created', 'snoozed', 'actions', '_events'])
		)
	}

	/**
	 * Compare two notifications, for use in sorting
	 *
	 * @static
	 * @param {Notification} a
	 * @param {Notification} b
	 * @returns {number}
	 * @memberof Notification
	 */
	static compare(a: Notification, b: Notification): number {
		return (
			(!!a.persistent === !!b.persistent ? 0 : a.persistent && !b.persistent ? 1 : -1) ||
			a.status - b.status ||
			a.rank - b.rank ||
			a.created - b.created
		)
	}

	/**
	 * Dismiss a notification (snooze it, but not remove it)
	 *
	 * @memberof Notification
	 */
	snooze() {
		this.snoozed = true
		notificationsDep.changed()
		this.emit('snoozed', this)
	}

	/**
	 * Remove notification from the Notification Center
	 *
	 * @memberof Notification
	 */
	drop() {
		if (this.id) {
			NotificationCenter.drop(this.id)
		}
	}

	/**
	 * Callback called by the Notifcation Center when a user takes an action
	 *
	 * @param {string} type
	 * @param {*} event
	 * @memberof Notification
	 */
	action(type: string, event: any) {
		this.emit('action', this, type, event)
	}
}

export function getNoticeLevelForPieceStatus(statusCode: RundownAPI.PieceStatusCode): NoticeLevel | null {
	return statusCode !== RundownAPI.PieceStatusCode.OK && statusCode !== RundownAPI.PieceStatusCode.UNKNOWN
		? statusCode === RundownAPI.PieceStatusCode.SOURCE_NOT_SET
			? NoticeLevel.CRITICAL
			: // : innerPiece.status === RundownAPI.PieceStatusCode.SOURCE_MISSING ||
			  // innerPiece.status === RundownAPI.PieceStatusCode.SOURCE_BROKEN
			  NoticeLevel.WARNING
		: null
}

window['testNotification'] = function (
	delay: number,
	level: NoticeLevel = NoticeLevel.CRITICAL,
	fakePersistent: boolean = false
) {
	NotificationCenter.push(
		new Notification(
			undefined,
			level,
			'Notification test',
			protectString('test'),
			undefined,
			fakePersistent,
			undefined,
			100000,
			delay || 10000
		)
	)
}
window['notificationCenter'] = NotificationCenter
