import * as React from 'react'
import * as _ from 'underscore'
import ClassNames from 'classnames'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheckSquare, faSquare, faChevronUp } from '@fortawesome/free-solid-svg-icons'
import { Manager, Reference, Popper } from 'react-popper'

export interface MultiSelectEvent {
	selectedValues: Array<string>
}

interface IProps {
	/**
	 * A value of type string results in a checkbox with the key becoming the label.
	 * A value of type string[] results in a group of checkboxes with the key becoming the header of the group.
	 */
	availableOptions: _.Dictionary<string | string[]>
	placeholder?: string
	className?: string
	value?: Array<string>
	onChange?: (event: MultiSelectEvent) => void
}

interface IState {
	checkedValues: _.Dictionary<boolean>
	expanded: boolean
}

export class MultiSelect extends React.Component<IProps, IState> {
	private _titleRef: HTMLElement
	private _popperRef: HTMLElement
	private _popperUpdate: () => Promise<any>

	constructor(props: IProps) {
		super(props)

		this.state = {
			checkedValues: {},
			expanded: false,
		}
	}

	componentDidMount() {
		this.refreshChecked()
	}

	async componentDidUpdate(prevProps: IProps) {
		if (this.props.value !== prevProps.value) {
			this.refreshChecked()
		}

		if (this.state.expanded && typeof this._popperUpdate === 'function') {
			await this._popperUpdate()
		}
	}

	refreshChecked() {
		if (this.props.value && _.isArray(this.props.value)) {
			const checkedValues: _.Dictionary<boolean> = {}
			_.forEach(this.props.value, (value) => {
				checkedValues[value] = true
			})

			this.setState({
				checkedValues,
			})
		} else {
			this.setState({
				checkedValues: {},
			})
		}
	}

	handleChange = (item) => {
		const obj = {}
		obj[item] = !this.state.checkedValues[item]
		const valueUpdate = _.extend(this.state.checkedValues, obj)

		this.setState({
			checkedValues: valueUpdate,
		})

		if (this.props.onChange && typeof this.props.onChange === 'function') {
			this.props.onChange({
				selectedValues: _.compact(
					_.values(
						_.mapObject(valueUpdate, (value, key) => {
							return value ? key : null
						})
					)
				),
			})
		}
	}

	isChecked = (key: string): boolean => {
		return !!this.state.checkedValues[key]
	}

	generateSummary = () => {
		return _.compact(
			_.values(
				_.mapObject(this.state.checkedValues, (value, key) => {
					return value ? this.props.availableOptions[key] || key : null
				})
			)
		).join(', ')
	}

	onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
		if (
			!(
				event.relatedTarget &&
				event.relatedTarget instanceof HTMLElement &&
				(this._popperRef === event.relatedTarget ||
					this._popperRef.contains(event.relatedTarget) ||
					this._titleRef === event.relatedTarget)
			)
		) {
			this.setState({
				expanded: false,
			})
		}
	}

	toggleExpco = async () => {
		await this._popperUpdate()
		this.setState({
			expanded: !this.state.expanded,
		})
	}

	setTitleRef = (ref, popperRef) => {
		this._titleRef = ref
		if (typeof popperRef === 'function') {
			popperRef(ref)
		}
	}

	setPopperRef = (ref, popperRef) => {
		this._popperRef = ref
		if (typeof popperRef === 'function') {
			popperRef(ref)
		}
	}

	setUpdate = (update) => {
		this._popperUpdate = update
	}

	renderOption = (value: string, key: string) => {
		return (
			<p className="expco-item" key={key}>
				<label className="action-btn">
					<span className="checkbox">
						<input
							type="checkbox"
							className="form-control"
							checked={this.isChecked(key)}
							onChange={() => this.handleChange(key)}
						/>
						<span className="checkbox-checked">
							<FontAwesomeIcon icon={faCheckSquare} />
						</span>
						<span className="checkbox-unchecked">
							<FontAwesomeIcon icon={faSquare} />
						</span>
					</span>
					{value}
				</label>
			</p>
		)
	}

	render() {
		const summary = this.generateSummary()
		return (
			<Manager>
				<Reference>
					{({ ref }) => (
						<div
							ref={(r) => this.setTitleRef(r, ref)}
							className={ClassNames(
								'expco subtle',
								{
									'expco-expanded': this.state.expanded,
								},
								this.props.className
							)}
							tabIndex={-1}
							onBlur={this.onBlur}
						>
							<div
								className={ClassNames('expco-title', {
									placeholder: !summary,
								})}
								onClick={this.toggleExpco}
								title={summary || this.props.placeholder || ''}
							>
								{summary || this.props.placeholder || ''}
							</div>
							<a className="action-btn right expco-expand subtle" onClick={this.toggleExpco}>
								<FontAwesomeIcon icon={faChevronUp} />
							</a>
						</div>
					)}
				</Reference>
				<Popper
					placement="bottom-start"
					modifiers={[
						{ name: 'flip', enabled: false },
						{ name: 'offset', enabled: true, options: { offset: [0, -1] } },
						{
							name: 'eventListeners',
							enabled: true,
							options: {
								scroll: this.state.expanded,
								resize: this.state.expanded,
							},
						},
					]}
				>
					{({ ref, style, placement, update }) => {
						this.setUpdate(update)
						return (
							<div
								ref={(r) => this.setPopperRef(r, ref)}
								style={style}
								data-placement={placement}
								className={ClassNames(
									'expco subtle expco-popper',
									{
										'expco-expanded': this.state.expanded,
									},
									this.props.className
								)}
								tabIndex={-1}
								onBlur={this.onBlur}
							>
								{this.state.expanded && (
									<div className="expco-body bd">
										{_.values(
											_.mapObject(this.props.availableOptions, (value, key) => {
												return Array.isArray(value) ? (
													<React.Fragment key={key}>
														<p className="expco-item" key={key}>
															{key}
														</p>
														{_.map(value, (v) => {
															return this.renderOption(v, v)
														})}
													</React.Fragment>
												) : (
													this.renderOption(value, key)
												)
											})
										)}
									</div>
								)}
							</div>
						)
					}}
				</Popper>
			</Manager>
		)
	}
}
