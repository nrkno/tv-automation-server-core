import * as React from 'react'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import { doModalDialog } from '../../lib/ModalDialog'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import ClassNames from 'classnames'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faClipboardCheck, faDatabase, faCoffee, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
import { logger } from '../../../lib/logging'
import { GetMigrationStatusResult, RunMigrationResult, MigrationChunk } from '../../../lib/api/migration'
import { MigrationStepInput, MigrationStepInputResult } from '@sofie-automation/blueprints-integration'
import * as _ from 'underscore'
import { EditAttribute, EditAttributeBase } from '../../lib/EditAttribute'
import { MeteorCall } from '../../../lib/api/methods'

interface IProps {}
interface IState {
	errorMessage?: string
	// systemVersion: string
	// databaseVersion: string
	migrationNeeded: boolean
	databasePreviousVersion: string | null
	showAllSteps: boolean

	migration?: {
		canDoAutomaticMigration: boolean
		manualInputs: Array<MigrationStepInput>
		hash: string
		chunks: Array<MigrationChunk>
		automaticStepCount: number
		ignoredStepCount: number
		manualStepCount: number
		partialMigration: boolean
	}
	warnings: Array<string>
	migrationCompleted: boolean
	partialMigration: boolean

	haveRunMigration: boolean

	inputValues: {
		[stepId: string]: {
			[attribute: string]: any
		}
	}
}
interface ITrackedProps {}
export const MigrationView = translateWithTracker<IProps, IState, ITrackedProps>((_props: IProps) => {
	return {}
})(
	class MigrationView extends MeteorReactComponent<Translated<IProps & ITrackedProps>, IState> {
		private cancelRequests: boolean
		constructor(props: Translated<IProps & ITrackedProps>) {
			super(props)

			this.state = {
				databasePreviousVersion: null,
				showAllSteps: false,
				migrationNeeded: false,
				warnings: [],
				migrationCompleted: false,
				partialMigration: false,
				haveRunMigration: false,

				inputValues: {},
			}
		}
		componentDidMount() {
			this.updateVersions()
		}
		componentWillUnmount() {
			super.componentWillUnmount()
			this.cancelRequests = true
		}
		clickRefresh() {
			this.setState({
				warnings: [],
				migrationCompleted: false,
				haveRunMigration: false,
			})

			this.updateVersions()
		}
		setErrorMessage(err) {
			this.setState({
				errorMessage: _.isString(err) ? err : err.reason || err.toString() || err + '',
			})
		}
		updateVersions() {
			this.setState({
				errorMessage: '',
				databasePreviousVersion: '',
				migrationNeeded: false,
			})
			MeteorCall.migration
				.getMigrationStatus()
				.then((r: GetMigrationStatusResult) => {
					if (this.cancelRequests) return

					const inputValues = this.state.inputValues
					_.each(r.migration.manualInputs, (manualInput: MigrationStepInput) => {
						if (manualInput.stepId && manualInput.inputType && manualInput.attribute) {
							const stepId = manualInput.stepId

							if (!inputValues[stepId]) inputValues[stepId] = {}

							const value = inputValues[stepId][manualInput.attribute]
							if (_.isUndefined(value)) {
								inputValues[stepId][manualInput.attribute] = manualInput.defaultValue
							}
						}
					})

					this.setState({
						// systemVersion: r.systemVersion,
						// databaseVersion: r.databaseVersion,
						// databasePreviousVersion: r.databasePreviousVersion,
						migrationNeeded: r.migrationNeeded,
						migration: r.migration,
						inputValues: inputValues,
					})
				})
				.catch((err) => {
					logger.error(err)
					this.setErrorMessage(err)
				})
		}
		runMigration() {
			const inputResults: Array<MigrationStepInputResult> = []

			// _.each(this.state.inputValues, (iv, stepId: string) => {
			// 	_.each(iv, (value: any, attribute: string) => {
			// 		inputResults.push({
			// 			stepId: stepId,
			// 			attribute: attribute,
			// 			value: value
			// 		})
			// 	})
			// })
			if (this.state.migration) {
				_.each(this.state.migration.manualInputs, (manualInput) => {
					if (manualInput.stepId && manualInput.attribute) {
						let value: any
						const step = this.state.inputValues[manualInput.stepId]
						if (step) {
							value = step[manualInput.attribute]
						}
						inputResults.push({
							stepId: manualInput.stepId,
							attribute: manualInput.attribute,
							value: value,
						})
					}
				})
				this.setErrorMessage('')
				MeteorCall.migration
					.runMigration(
						this.state.migration.chunks,
						this.state.migration.hash, // hash
						inputResults // inputResults
					)
					.then((r: RunMigrationResult) => {
						if (this.cancelRequests) return
						this.setState({
							warnings: r.warnings,
							migrationCompleted: r.migrationCompleted,
							haveRunMigration: true,
						})

						this.updateVersions()
					})
					.catch((err) => {
						logger.error(err)
						this.setErrorMessage(err)
					})
			}
		}
		forceMigration() {
			this.setErrorMessage('')
			if (this.state.migration) {
				MeteorCall.migration
					.forceMigration(this.state.migration.chunks)
					.then(() => {
						if (this.cancelRequests) return
						this.setState({
							migrationCompleted: true,
							haveRunMigration: true,
						})

						this.updateVersions()
					})
					.catch((err) => {
						logger.error(err)
						this.setErrorMessage(err)
					})
			}
		}
		resetDatabaseVersions() {
			const { t } = this.props
			this.setErrorMessage('')
			doModalDialog({
				title: t('Reset Database Version'),
				message: t(
					'Are you sure you want to reset the database version?\nOnly do this if you plan on running the migration right after.'
				),
				onAccept: () => {
					MeteorCall.migration
						.resetDatabaseVersions()
						.then(() => {
							this.updateVersions()
						})
						.catch((err) => {
							logger.error(err)
							this.setErrorMessage(err)
						})
				},
			})
		}
		renderManualSteps() {
			if (this.state.migration) {
				let rank = 0
				return _.map(this.state.migration.manualInputs, (manualInput: MigrationStepInput) => {
					if (manualInput.stepId) {
						const stepId = manualInput.stepId
						let value
						if (manualInput.attribute) {
							value = (this.state.inputValues[stepId] || {})[manualInput.attribute]
						}
						return (
							<div key={rank++}>
								<h3 className="mhn mbsx mtl">{manualInput.label}</h3>
								<div>{manualInput.description}</div>
								<div>
									{manualInput.inputType && manualInput.attribute ? (
										<EditAttribute
											type={manualInput.inputType}
											className="input-full mtxs"
											options={manualInput.dropdownOptions}
											overrideDisplayValue={value}
											updateFunction={(edit: EditAttributeBase, newValue: any) => {
												if (manualInput.attribute) {
													const inputValues = this.state.inputValues
													if (!inputValues[stepId]) inputValues[stepId] = {}
													inputValues[stepId][manualInput.attribute] = newValue

													this.setState({
														inputValues: inputValues,
													})
												}
											}}
										/>
									) : null}
								</div>
							</div>
						)
					} else {
						return null
					}
				})
			}
		}
		render() {
			const { t } = this.props

			return (
				<div className="studio-edit mod mhl mvs">
					<div>
						<div>
							<div>
								{this.state.migration
									? _.map(this.state.migration.chunks, (chunk, i) => {
											const str = t('Version for {{name}}: From {{fromVersion}} to {{toVersion}}', {
												name: chunk.sourceName,
												fromVersion: chunk._dbVersion,
												toVersion: chunk._targetVersion,
											})
											return <div key={i}>{chunk._dbVersion === chunk._targetVersion ? <b>{str}</b> : str}</div>
									  })
									: null}
							</div>
							<div>{this.state.errorMessage ? <p>{this.state.errorMessage}</p> : null}</div>
							<div className="mod mhn mvm">
								<button
									className="btn mrm"
									onClick={() => {
										this.clickRefresh()
									}}
								>
									<FontAwesomeIcon icon={faClipboardCheck} />
									<span>{t('Re-check')}</span>
								</button>

								{/* {
								this.state.chunks &&
								this.state.databasePreviousVersion &&
								this.state.databasePreviousVersion !== '0.0.0' &&
								this.state.databaseVersion !== this.state.databasePreviousVersion ?
									<button className='btn mod mhm' onClick={() => {
										if (this.state.databasePreviousVersion) {
											this.setDatabaseVersion(this.state.databasePreviousVersion)
										}
									}}>
										<FontAwesomeIcon icon={faDatabase} />
										{t('Reset Version to') + ` ${this.state.databasePreviousVersion}`}
									</button>
								: null
							} */}
								{
									<button
										className="btn mrm"
										onClick={() => {
											this.resetDatabaseVersions()
										}}
									>
										<FontAwesomeIcon icon={faDatabase} />
										<span>{t('Reset All Versions')}</span>
									</button>
								}
							</div>
						</div>
						{this.state.migrationNeeded && this.state.migration ? (
							<div>
								<h2 className="mhn">{t('Migrate database')}</h2>

								<p className="mhn mvs">
									{t(
										`This migration consists of ${this.state.migration.automaticStepCount} automatic steps and  ${this.state.migration.manualStepCount} manual steps (${this.state.migration.ignoredStepCount} steps are ignored).`
									)}
								</p>

								<table className="table expando migration-steps-table">
									<tbody>
										<tr
											className={ClassNames({
												hl: this.state.showAllSteps,
											})}
										>
											<th className="c3">{t('All steps')}</th>
											<td className="table-item-actions c3">
												<button
													className="action-btn"
													onClick={() => this.setState({ showAllSteps: !this.state.showAllSteps })}
												>
													<FontAwesomeIcon icon={this.state.showAllSteps ? faEyeSlash : faEye} />
												</button>
											</td>
										</tr>
										{this.state.showAllSteps && (
											<tr className="expando-details hl">
												<td colSpan={2}>
													{this.state.migration.chunks.map((c) => (
														<div key={c.sourceName}>
															<h3 className="mhs">{c.sourceName}</h3>
															{_.map(c._steps, (s) => (
																<p className="mod mhs" key={s}>
																	{s}
																</p>
															))}
														</div>
													))}
												</td>
											</tr>
										)}
									</tbody>
								</table>

								{this.state.migration.partialMigration ? (
									<p className="mhn mvs">
										{t(
											"The migration consists of several phases, you will get more options after you've this migration"
										)}
									</p>
								) : null}
								{this.state.migration.canDoAutomaticMigration ? (
									<div>
										<p className="mhn mvs">{t('The migration can be completed automatically.')}</p>
										<button
											className="btn btn-primary"
											onClick={() => {
												this.runMigration()
											}}
										>
											<FontAwesomeIcon icon={faDatabase} />
											<span>{t('Run automatic migration procedure')}</span>
										</button>
									</div>
								) : (
									<div>
										<p className="mhn mvs">
											{t('The migration procedure needs some help from you in order to complete, see below:')}
										</p>
										<div>{this.renderManualSteps()}</div>
										<button
											className="btn btn-primary mtm"
											onClick={() => {
												doModalDialog({
													title: t('Double-check Values'),
													message: t('Are you sure the values you have entered are correct?'),
													onAccept: () => {
														this.runMigration()
													},
												})
											}}
										>
											<FontAwesomeIcon icon={faClipboardCheck} />
											<span>{t('Run Migration Procedure')}</span>
										</button>
									</div>
								)}

								{this.state.warnings.length ? (
									<div>
										<h2 className="mhn">{t('Warnings During Migration')}</h2>
										<ul>
											{_.map(this.state.warnings, (warning, key) => {
												return (
													<li className="mbm" key={key}>
														{warning}
													</li>
												)
											})}
										</ul>
									</div>
								) : null}

								{this.state.haveRunMigration && !this.state.migrationCompleted ? (
									<div>
										<div>
											<div>{t('Please check the database related to the warnings above. If neccessary, you can')}</div>
											<button
												className="btn btn-secondary mtm"
												onClick={() => {
													doModalDialog({
														title: t('Force Migration'),
														message: t(
															'Are you sure you want to force the migration? This will bypass the migration checks, so be sure to verify that the values in the settings are correct!'
														),
														onAccept: () => {
															this.forceMigration()
														},
													})
												}}
											>
												<FontAwesomeIcon icon={faDatabase} />
												<span>{t('Force Migration (unsafe)')}</span>
											</button>
										</div>
									</div>
								) : null}
							</div>
						) : null}

						{this.state.migrationCompleted ? <div>{t('The migration was completed successfully!')}</div> : null}

						{!this.state.migrationNeeded ? (
							<div>
								{t('All is well, go get a')}&nbsp;
								<FontAwesomeIcon icon={faCoffee} />
							</div>
						) : null}
					</div>
				</div>
			)
		}
	}
)
