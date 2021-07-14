import * as React from 'react'
import CoreIcons from '@nrk/core-icons/jsx'
import Escape from 'react-escape'
import ClassNames from 'classnames'
import * as VelocityReact from 'velocity-react'
import { mousetrapHelper } from './mousetrapHelper'
import { logger } from '../../lib/logging'
import * as _ from 'underscore'
import { withTranslation } from 'react-i18next'
import { Translated } from './ReactMeteorData/ReactMeteorData'
import { EditAttribute, EditAttributeType, EditAttributeBase } from './EditAttribute'

interface IModalDialogAttributes {
	show?: boolean
	title: string
	secondaryText?: string
	acceptText: string
	onAccept?: (e: SomeEvent, inputResult: ModalInputResult) => void
	onSecondary?: (e: SomeEvent, inputResult: ModalInputResult) => void
	onDiscard?: (e: SomeEvent, inputResult: ModalInputResult) => void
	inputs?: { [attribute: string]: ModalInput }
	warning?: boolean
	actions?: ModalAction[]
	className?: string
}
interface ModalInput {
	type: EditAttributeType
	label?: string
	options?: any
	text?: string
	defaultValue?: any
}
interface ModalAction {
	label: string
	on: OnAction
	classNames?: string
}
type OnAction = (e: SomeEvent, inputResult: ModalInputResult) => void
export type ModalInputResult = { [attribute: string]: any }
export type SomeEvent = Event | React.SyntheticEvent<object>
export class ModalDialog extends React.Component<IModalDialogAttributes> {
	boundKeys: Array<string> = []

	private inputResult: ModalInputResult = {}

	constructor(args: IModalDialogAttributes) {
		super(args)
	}

	componentDidMount() {
		this.bindKeys()
	}

	componentWillUnmount() {
		this.unbindKeys()
	}

	componentDidUpdate() {
		this.bindKeys()
	}

	bindKeys = () => {
		if (this.props.show) {
			if (this.boundKeys.indexOf('enter') < 0) {
				mousetrapHelper.bind('enter', this.preventDefault, 'keydown', undefined, true)
				mousetrapHelper.bind('enter', this.handleKey, 'keyup', undefined, true)
				this.boundKeys.push('enter')
			}
			if (this.boundKeys.indexOf('esc') < 0) {
				mousetrapHelper.bind('esc', this.preventDefault, 'keydown', undefined, true)
				mousetrapHelper.bind('esc', this.handleKey, 'keyup', undefined, true)
				this.boundKeys.push('esc')
			}
		} else {
			this.unbindKeys()
		}
	}

	unbindKeys = () => {
		this.boundKeys.forEach((key) => {
			mousetrapHelper.unbind(key, this.preventDefault, 'keydown')
			mousetrapHelper.unbind(key, this.handleKey, 'keyup')
		})
		this.boundKeys.length = 0
	}

	handleKey = (e: KeyboardEvent) => {
		if (this.props.show) {
			if (e.code === 'Enter') {
				if (!this.props.warning) this.handleAccept(e)
			} else if (e.code === 'Escape') {
				if (this.props.secondaryText) {
					this.handleSecondary(e)
				} else {
					this.handleDiscard(e)
				}
			}
		}
	}

	handleAccept = (e: SomeEvent) => {
		if (this.props.onAccept && typeof this.props.onAccept === 'function') {
			this.props.onAccept(e, this.inputResult)
		}
	}

	handleSecondary = (e: SomeEvent) => {
		if (this.props.onSecondary && typeof this.props.onSecondary === 'function') {
			this.props.onSecondary(e, this.inputResult)
		}
	}
	handleAction = (e: SomeEvent, on: OnAction) => {
		if (on && typeof on === 'function') {
			on(e, this.inputResult)
		}
	}

	handleDiscard = (e: SomeEvent) => {
		if (this.props.onDiscard && typeof this.props.onDiscard === 'function') {
			this.props.onDiscard(e, this.inputResult)
		} else {
			this.handleSecondary(e)
		}
	}
	updatedInput = (edit: EditAttributeBase, newValue: any) => {
		this.inputResult[edit.props.attribute || ''] = newValue
	}
	render() {
		return this.props.show ? (
			<Escape to="viewport">
				<VelocityReact.VelocityTransitionGroup
					enter={{ animation: 'fadeIn', easing: 'ease-out', duration: 250 }}
					runOnMount={true}
				>
					<div className="glass-pane">
						<div className="glass-pane-content">
							<VelocityReact.VelocityTransitionGroup
								enter={{
									animation: {
										translateY: [0, 100],
										opacity: [1, 0],
									},
									easing: 'spring',
									duration: 250,
								}}
								runOnMount={true}
							>
								<dialog open={true} className={'border-box overlay-m ' + this.props.className || ''}>
									<div
										className={'flex-row ' + (this.props.warning ? 'warn' : 'info') + ' vertical-align-stretch tight-s'}
									>
										<div className="flex-col c12">
											<h2>{this.props.title}</h2>
										</div>
										<div className="flex-col horizontal-align-right vertical-align-middle">
											<p>
												<button className="action-btn" onClick={this.handleDiscard}>
													<CoreIcons.NrkClose />
												</button>
											</p>
										</div>
									</div>
									<div className="title-box-content">{this.props.children}</div>
									{this.props.inputs ? (
										<div className="title-box-inputs">
											{_.map(this.props.inputs, (input: ModalInput, attribute: string) => {
												if (this.inputResult[attribute] === undefined) this.inputResult[attribute] = input.defaultValue

												return (
													<div className="title-box-input" key={attribute}>
														{input.text}
														<EditAttribute
															type={input.type}
															label={input.label}
															options={input.options}
															overrideDisplayValue={input.defaultValue}
															attribute={attribute}
															updateFunction={this.updatedInput}
														/>
													</div>
												)
											})}
										</div>
									) : null}
									<div
										className={ClassNames('mod', {
											alright: !this.props.secondaryText,
										})}
									>
										{this.props.secondaryText && (
											<button className="btn btn-secondary" onClick={this.handleSecondary}>
												{this.props.secondaryText}
											</button>
										)}
										{_.compact(
											_.map(this.props.actions || [], (action: ModalAction, i) => {
												if (action) {
													return (
														<button
															key={i}
															className={ClassNames(
																'btn right',
																{
																	'btn-secondary': !(action.classNames || '').match(/btn-/),
																},
																action.classNames
															)}
															onClick={(e) => this.handleAction(e, action.on)}
														>
															{action.label}
														</button>
													)
												}
												return undefined
											})
										)}
										<button
											className={ClassNames('btn btn-primary', {
												right: this.props.secondaryText !== undefined,
												'btn-warn': this.props.warning,
											})}
											onClick={this.handleAccept}
										>
											{this.props.acceptText}
										</button>
									</div>
								</dialog>
							</VelocityReact.VelocityTransitionGroup>
						</div>
					</div>
				</VelocityReact.VelocityTransitionGroup>
			</Escape>
		) : null
	}

	private preventDefault = (e: KeyboardEvent) => {
		e.preventDefault()
		e.stopPropagation()
	}
}

export interface ModalDialogQueueItem {
	/** The title of the dialog box  */
	title: string
	/** The message / body of the dialog box */
	message: string | JSX.Element | Array<JSX.Element>
	/** Label of the Yes/Accept button */
	yes?: string
	/** Label of the NO/Cancel button */
	no?: string
	/** Set to true if there's only one option/button */
	acceptOnly?: boolean
	/** Callback when user clicks Yes/Accept */
	onAccept: (e: SomeEvent, inputResult: ModalInputResult) => void
	/** Callback when user clicks No/Cancel */
	onDiscard?: (e: SomeEvent, inputResult: ModalInputResult) => void
	/** Callback when user does secondary action (for example hits escape) */
	onSecondary?: (e: SomeEvent, inputResult: ModalInputResult) => void
	/** Customomize input fields */
	inputs?: { [attribute: string]: ModalInput }
	actions?: ModalAction[]
	/** Is a critical decition/information */
	warning?: boolean
}
interface IModalDialogGlobalContainerProps {}
interface IModalDialogGlobalContainerState {
	queue: Array<ModalDialogQueueItem>
}

class ModalDialogGlobalContainer0 extends React.Component<
	Translated<IModalDialogGlobalContainerProps>,
	IModalDialogGlobalContainerState
> {
	constructor(props: Translated<IModalDialogGlobalContainerProps>) {
		super(props)
		if (modalDialogGlobalContainerSingleton) {
			logger.warn('modalDialogGlobalContainerSingleton called more than once!')
		}
		modalDialogGlobalContainerSingleton = this
		this.state = {
			queue: [],
		}
	}
	public addQueue(q: ModalDialogQueueItem) {
		const queue = this.state.queue
		queue.push(q)
		this.setState({
			queue,
		})
	}
	public queueHasItems(): boolean {
		return this.state.queue.length > 0
	}
	onAccept = (e: SomeEvent, inputResult: ModalInputResult) => {
		const queue = this.state.queue
		const onQueue = queue.pop()
		if (onQueue) {
			this.setState({ queue })
			onQueue.onAccept(e, inputResult)
		}
	}
	onDiscard = (e: SomeEvent, inputResult: ModalInputResult) => {
		const queue = this.state.queue
		const onQueue = queue.pop()
		if (onQueue) {
			this.setState({ queue })
			if (onQueue.onDiscard) {
				onQueue.onDiscard(e, inputResult)
			}
		}
	}
	onSecondary = (e: SomeEvent, inputResult: ModalInputResult) => {
		const queue = this.state.queue
		const onQueue = queue.pop()
		if (onQueue) {
			this.setState({ queue })
			if (onQueue.onSecondary) {
				onQueue.onSecondary(e, inputResult)
			}
		}
	}
	onAction = (e: SomeEvent, inputResult: ModalInputResult, on: OnAction) => {
		const queue = this.state.queue
		const onQueue = queue.pop()
		if (onQueue) {
			this.setState({ queue })
			on(e, inputResult)
		}
	}
	renderString = (str: string) => {
		const lines = (str || '').split('\n')

		return _.map(lines, (line: string, i) => {
			return <p key={i}>{line.trim()}</p>
		})
	}
	render() {
		const { t } = this.props
		const onQueue = _.first(this.state.queue)

		if (onQueue) {
			const actions: ModalAction[] = _.map(onQueue.actions || [], (action: ModalAction) => {
				return {
					...action,
					on: (e, inputResult) => this.onAction(e, inputResult, action.on),
				}
			})
			return (
				<ModalDialog
					key={this.state.queue.length}
					title={onQueue.title}
					acceptText={onQueue.yes || t('Yes')}
					secondaryText={onQueue.no || (!onQueue.acceptOnly ? t('No') : undefined)}
					onAccept={this.onAccept}
					onDiscard={this.onDiscard}
					onSecondary={this.onSecondary}
					inputs={onQueue.inputs}
					actions={actions}
					show={true}
					warning={onQueue.warning}
				>
					{_.isString(onQueue.message) ? this.renderString(onQueue.message) : onQueue.message}
				</ModalDialog>
			)
		} else return null
	}
}
export const ModalDialogGlobalContainer = withTranslation()(ModalDialogGlobalContainer0)
let modalDialogGlobalContainerSingleton: ModalDialogGlobalContainer0
/**
 * Display a ModalDialog, callback on user input
 * @param q ModalDialogQueueItem
 * Example:
 * 	doModalDialog({
 * 		title: t('Order 66?'),
 * 		message: t('Do you want to do this?'),
 * 		onAccept: (event: any) => {
 * 		// Execute order 66
 * 		},
 * 	})
 */
export function doModalDialog(q: ModalDialogQueueItem) {
	if (modalDialogGlobalContainerSingleton) {
		modalDialogGlobalContainerSingleton.addQueue(q)
	} else {
		logger.error('modalDialogGlobalContainerSingleton not set!')
	}
}
/**
 * Return true if there's any modal currently showing
 */
export function isModalShowing(): boolean {
	if (modalDialogGlobalContainerSingleton) {
		return modalDialogGlobalContainerSingleton.queueHasItems()
	}
	return false
}
