import * as React from 'react'
import { translateWithTracker, Translated } from '../../lib/ReactMeteorData/ReactMeteorData'
import { ICoreSystem, CoreSystem } from '../../../lib/collections/CoreSystem'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { meteorSubscribe, PubSub } from '../../../lib/api/pubsub'
import { EditAttribute } from '../../lib/EditAttribute'
import { doModalDialog } from '../../lib/ModalDialog'
import { MeteorCall } from '../../../lib/api/methods'
import * as _ from 'underscore'
import { languageAnd } from '../../lib/language'

interface IProps {}

interface ITrackedProps {
	coreSystem: ICoreSystem | undefined
}

export default translateWithTracker<IProps, {}, ITrackedProps>((_props: IProps) => {
	return {
		coreSystem: CoreSystem.findOne(),
	}
})(
	class SystemManagement extends MeteorReactComponent<Translated<IProps & ITrackedProps>> {
		componentDidMount() {
			meteorSubscribe(PubSub.coreSystem, null)
		}
		cleanUpOldDatabaseIndexes(): void {
			const { t } = this.props
			MeteorCall.system
				.cleanupIndexes(false)
				.then((indexesToRemove) => {
					console.log(indexesToRemove)
					doModalDialog({
						title: t('Remove indexes'),
						message: t('This will remove {{indexCount}} old indexes, do you want to continue?', {
							indexCount: indexesToRemove.length,
						}),
						yes: t('Yes'),
						no: t('No'),
						onAccept: () => {
							MeteorCall.system
								.cleanupIndexes(true)
								.then((indexesRemoved) => {
									doModalDialog({
										title: t('Remove indexes'),
										message: t('{{indexCount}} indexes was removed.', {
											indexCount: indexesRemoved.length,
										}),
										acceptOnly: true,
										onAccept: () => {
											// nothing
										},
									})
								})
								.catch(console.error)
						},
					})
				})
				.catch(console.error)
		}
		cleanUpOldData(): void {
			const { t } = this.props
			MeteorCall.system
				.cleanupOldData(false)
				.then((results) => {
					console.log(results)
					if (_.isString(results)) {
						doModalDialog({
							title: t('Error'),
							message: results,
							acceptOnly: true,
							onAccept: () => {
								// nothing
							},
						})
					} else {
						let count = 0
						const affectedCollections: string[] = []
						_.each(results, (result) => {
							count += result.docsToRemove
							if (result.docsToRemove > 0) {
								affectedCollections.push(result.collectionName)
							}
						})
						doModalDialog({
							title: t('Remove old data'),
							message: t(
								'There are {{count}} documents in {{collections}} that can be removed, do you want to continue?',
								{
									count: count,
									collections: languageAnd(t, affectedCollections),
								}
							),
							yes: t('Yes'),
							no: t('No'),
							onAccept: () => {
								MeteorCall.system
									.cleanupOldData(true)
									.then((results) => {
										console.log(results)

										if (_.isString(results)) {
											doModalDialog({
												title: t('Error'),
												message: results,
												acceptOnly: true,
												onAccept: () => {
													// nothing
												},
											})
										} else {
											doModalDialog({
												title: t('Remove old data'),
												message: t('The old data was removed.'),
												acceptOnly: true,
												onAccept: () => {
													// nothing
												},
											})
										}
									})
									.catch(console.error)
							},
						})
					}
				})
				.catch(console.error)
		}
		render() {
			const { t } = this.props

			return this.props.coreSystem ? (
				<div className="studio-edit mod mhl mvn">
					<div>
						<h2 className="mhn mtn">{t('Installation name')}</h2>
						<label className="field">
							{t('This name will be shown in the title bar of the window')}
							<div className="mdi">
								<EditAttribute
									modifiedClassName="bghl"
									attribute="name"
									obj={this.props.coreSystem}
									type="text"
									collection={CoreSystem}
									className="mdinput"
								/>
								<span className="mdfx"></span>
							</div>
						</label>

						<h2 className="mhn mtn">{t('System-wide Notification Message')}</h2>
						<label className="field">
							{t('Message')}
							<div className="mdi">
								<EditAttribute
									modifiedClassName="bghl"
									attribute="systemInfo.message"
									obj={this.props.coreSystem}
									type="text"
									collection={CoreSystem}
									className="mdinput"
								/>
								<span className="mdfx"></span>
							</div>
						</label>
						<div className="field">
							{t('Enabled')}
							<div className="mdi">
								<EditAttribute
									attribute="systemInfo.enabled"
									obj={this.props.coreSystem}
									type="checkbox"
									collection={CoreSystem}
								></EditAttribute>
							</div>
						</div>

						<h2 className="mhn">{t('Edit Support Panel')}</h2>
						<label className="field">
							{t('HTML that will be shown in the Support Panel')}
							<div className="mdi">
								<EditAttribute
									modifiedClassName="bghl"
									attribute="support.message"
									obj={this.props.coreSystem}
									type="multiline"
									collection={CoreSystem}
									className="mdinput"
								/>
								<span className="mdfx"></span>
							</div>
						</label>

						<h2 className="mhn">{t('Application Performance Monitoring')}</h2>
						<div className="field">
							{t('APM Enabled')}
							<div className="mdi">
								<EditAttribute
									attribute="apm.enabled"
									obj={this.props.coreSystem}
									type="checkbox"
									collection={CoreSystem}
								></EditAttribute>
							</div>
						</div>
						<label className="field">
							{t('APM Transaction Sample Rate')}
							<div className="mdi">
								<EditAttribute
									modifiedClassName="bghl"
									attribute="apm.transactionSampleRate"
									obj={this.props.coreSystem}
									type="float"
									collection={CoreSystem}
									className="mdinput"
								/>
								<span className="mdfx"></span>
							</div>
							<div>
								(
								{t(
									'How many of the transactions to monitor. Set to -1 to log nothing (max performance), 0.5 to log 50% of the transactions, 1 to log all transactions'
								)}
								)
							</div>
							<div>{t('Note: Core needs to be restarted to apply these settings')}</div>
						</label>

						<h2 className="mhn">{t('Monitor blocked thread')}</h2>

						<label className="field">
							{t('Enable')}
							<div className="mdi">
								<EditAttribute
									modifiedClassName="bghl"
									attribute="enableMonitorBlockedThread"
									obj={this.props.coreSystem}
									type="checkbox"
									collection={CoreSystem}
									className="mdinput"
								/>
								<span className="mdfx"></span>
							</div>
							<div>
								(
								{t(
									'Enables internal monitoring of blocked main thread. Logs when there is an issue, but (unverified) might cause issues in itself.'
								)}
								)
							</div>
						</label>

						<div>{t('Note: Core needs to be restarted to apply these settings')}</div>

						<h2 className="mhn">{t('Cron jobs')}</h2>
						<div className="field">
							{t('Enable CasparCG restart job')}
							<div className="mdi">
								<EditAttribute
									attribute="cron.casparCGRestart.enabled"
									obj={this.props.coreSystem}
									type="checkbox"
									collection={CoreSystem}
								></EditAttribute>
							</div>
						</div>

						<h2 className="mhn">{t('Cleanup')}</h2>
						<div>
							<button className="btn btn-default" onClick={() => this.cleanUpOldDatabaseIndexes()}>
								{t('Cleanup old database indexes')}
							</button>
						</div>
						<div>
							<button className="btn btn-default" onClick={() => this.cleanUpOldData()}>
								{t('Cleanup old data')}
							</button>
						</div>
					</div>
				</div>
			) : null
		}
	}
)
