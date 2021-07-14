import * as React from 'react'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import { doModalDialog } from '../../lib/ModalDialog'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { SnapshotItem, Snapshots, SnapshotId } from '../../../lib/collections/Snapshots'
import { getCurrentTime, unprotectString } from '../../../lib/lib'
import * as _ from 'underscore'
import { logger } from '../../../lib/logging'
import { EditAttribute } from '../../lib/EditAttribute'
import { faWindowClose, faUpload } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Studio, Studios, StudioId } from '../../../lib/collections/Studios'
import { multilineText, fetchFrom } from '../../lib/lib'
import { NotificationCenter, Notification, NoticeLevel } from '../../lib/notifications/notifications'
import { UploadButton } from '../../lib/uploadButton'
import { PubSub } from '../../../lib/api/pubsub'
import { MeteorCall } from '../../../lib/api/methods'

interface IProps {
	match: {
		params: {
			showStyleId: string
		}
	}
}
interface IState {
	uploadFileKey: number // Used to force clear the input after use
	editSnapshotId: SnapshotId | null
	removeSnapshots: boolean
}
interface ITrackedProps {
	snapshots: Array<SnapshotItem>
	studios: Array<Studio>
}
export default translateWithTracker<IProps, IState, ITrackedProps>(() => {
	return {
		snapshots: Snapshots.find(
			{},
			{
				sort: {
					created: -1,
				},
			}
		).fetch(),
		studios: Studios.find({}, {}).fetch(),
	}
})(
	class SnapshotsView extends MeteorReactComponent<Translated<IProps & ITrackedProps>, IState> {
		constructor(props: Translated<IProps & ITrackedProps>) {
			super(props)
			this.state = {
				uploadFileKey: Date.now(),
				editSnapshotId: null,
				removeSnapshots: false,
			}
		}
		componentDidMount() {
			this.subscribe(PubSub.snapshots, {
				created: {
					$gt: getCurrentTime() - 30 * 24 * 3600 * 1000, // last 30 days
				},
			})
			this.subscribe(PubSub.studios, {})
		}

		onUploadFile(e) {
			const { t } = this.props

			const file = e.target.files[0]
			if (!file) {
				return
			}

			const reader = new FileReader()
			reader.onload = (e2) => {
				this.setState({
					uploadFileKey: Date.now(),
				})
				const uploadFileContents = ((e2.target as any) || {}).result

				doModalDialog({
					title: t('Restore from this Snapshot file?'),
					message: t('Are you sure you want to restore the system from the snapshot file "{{fileName}}"?', {
						fileName: file.name,
					}),
					onAccept: () => {
						fetchFrom('/snapshot/restore', {
							method: 'POST',
							body: uploadFileContents,
							headers: {
								'content-type': 'application/json',
							},
						})
							.then(() => {
								NotificationCenter.push(
									new Notification(
										undefined,
										NoticeLevel.NOTIFICATION,
										t('Successfully restored snapshot'),
										'RestoreSnapshot'
									)
								)
							})
							.catch((err) => {
								// console.error('Snapshot restore failure: ', err)
								NotificationCenter.push(
									new Notification(
										undefined,
										NoticeLevel.WARNING,
										t('Snapshot restore failed: {{errorMessage}}', { errorMessage: err + '' }),
										'RestoreSnapshot'
									)
								)
							})
					},
					onDiscard: () => {
						this.setState({
							uploadFileKey: Date.now(), // to clear input field
						})
					},
				})
			}

			reader.readAsText(file)
		}
		restoreStoredSnapshot = (snapshotId) => {
			const snapshot = Snapshots.findOne(snapshotId)
			if (snapshot) {
				doModalDialog({
					title: 'Restore Snapshot',
					message: `Do you really want to restore the snapshot ${snapshot.name}?`,
					onAccept: () => {
						MeteorCall.snapshot
							.restoreSnapshot(snapshotId)
							.then(() => {
								// todo: replace this with something else
								doModalDialog({
									title: 'Restore Snapshot',
									message: `Snapshot restored!`,
									acceptOnly: true,
									onAccept: () => {
										// nothing
									},
								})
							})
							.catch((err) => {
								logger.error(err)
								doModalDialog({
									title: 'Restore Snapshot',
									message: `Error: ${err.toString()}`,
									acceptOnly: true,
									onAccept: () => {
										// nothing
									},
								})
							})
					},
				})
			}
		}
		takeSystemSnapshot = (studioId: StudioId | null) => {
			MeteorCall.snapshot.storeSystemSnapshot(studioId, `Requested by user`).catch((err) => {
				logger.error(err)
				doModalDialog({
					title: 'Restore Snapshot',
					message: `Error: ${err.toString()}`,
					acceptOnly: true,
					onAccept: () => {
						// nothing
					},
				})
			})
		}
		takeDebugSnapshot = (studioId: StudioId) => {
			MeteorCall.snapshot.storeDebugSnapshot(studioId, `Requested by user`).catch((err) => {
				logger.error(err)
				doModalDialog({
					title: 'Restore Snapshot',
					message: `Error: ${err.toString()}`,
					acceptOnly: true,
					onAccept: () => {
						// nothing
					},
				})
			})
		}
		editSnapshot = (snapshotId) => {
			if (this.state.editSnapshotId === snapshotId) {
				this.setState({
					editSnapshotId: null,
				})
			} else {
				this.setState({
					editSnapshotId: snapshotId,
				})
			}
		}
		toggleRemoveView = () => {
			this.setState({
				removeSnapshots: !this.state.removeSnapshots,
			})
		}
		removeStoredSnapshot = (snapshotId: SnapshotId) => {
			const snapshot = Snapshots.findOne(snapshotId)
			if (snapshot) {
				doModalDialog({
					title: 'Remove Snapshot',
					message: `Are you sure, do you really want to REMOVE the Snapshot ${snapshot.name}?\r\nThis cannot be undone!!`,
					onAccept: () => {
						MeteorCall.snapshot.removeSnapshot(snapshotId).catch((err) => {
							logger.error(err)
							doModalDialog({
								title: 'Remove Snapshot',
								message: `Error: ${err.toString()}`,
								acceptOnly: true,
								onAccept: () => {
									// nothing
								},
							})
						})
					},
				})
			}
		}
		render() {
			const { t } = this.props

			return (
				<div className="studio-edit mod mhl mvn">
					<div>
						<div>
							<h2 className="mhn mtn">{t('Take a Snapshot')}</h2>
							<div>
								<h3 className="mhn">{t('Full System Snapshot')}</h3>
								<p className="mhn">
									<span className="text-s vsubtle">
										{t(
											'A Full System Snapshot contains all system settings (studios, showstyles, blueprints, devices, etc.)'
										)}
									</span>
								</p>
								<div>
									<button
										className="btn btn-primary"
										onClick={() => {
											this.takeSystemSnapshot(null)
										}}
									>
										{t('Take a Full System Snapshot')}
									</button>
								</div>
								{this.props.studios.length > 1 ? (
									<div>
										<h3 className="mhn">{t('Studio Snapshot')}</h3>
										<p className="mhn text-s dimmed">
											{t('A Studio Snapshot contains all system settings related to that studio')}
										</p>
										{_.map(this.props.studios, (studio) => {
											return (
												<div key={unprotectString(studio._id)}>
													<button
														className="btn btn-primary"
														onClick={() => {
															this.takeSystemSnapshot(studio._id)
														}}
													>
														{t('Take a Snapshot for studio "{{studioName}}" only', { studioName: studio.name })}
													</button>
												</div>
											)
										})}
									</div>
								) : null}
							</div>
						</div>
						<h2 className="mhn">{t('Restore from Snapshot File')}</h2>
						<div className="mdi">
							<UploadButton
								accept="application/json,.json"
								className="btn btn-secondary"
								onChange={(e) => this.onUploadFile(e)}
								key={this.state.uploadFileKey}
							>
								<FontAwesomeIcon icon={faUpload} />
								<span>{t('Upload Snapshot')}</span>
							</UploadButton>
						</div>
						<h2 className="mhn">{t('Restore from Stored Snapshots')}</h2>
						<div>
							<table className="table">
								<tbody>
									<tr>
										<th></th>
										<th>Type</th>
										<th>Name</th>
										<th>Comment</th>
										{this.state.removeSnapshots ? <th></th> : null}
									</tr>
									{_.map(this.props.snapshots, (snapshot) => {
										return (
											<tr key={unprotectString(snapshot._id)}>
												<td>
													<button
														className="btn mod mhm"
														onClick={() => {
															this.restoreStoredSnapshot(snapshot._id)
														}}
													>
														{t('Restore')}
													</button>
												</td>
												<td>{snapshot.type}</td>
												<td>
													<a href={`/snapshot/retrieve/${snapshot._id}`} target="_blank" rel="noreferrer">
														{snapshot.name}
													</a>
												</td>
												<td>
													{this.state.editSnapshotId === snapshot._id ? (
														[
															<EditAttribute
																key={0}
																collection={Snapshots}
																obj={snapshot}
																attribute="comment"
																type="multiline"
															/>,
															<button key={1} className="action-btn" onClick={() => this.editSnapshot(snapshot._id)}>
																<FontAwesomeIcon icon={faWindowClose} />
															</button>,
														]
													) : (
														<a
															href="#"
															onClick={(e) => {
																e.preventDefault()
																this.editSnapshot(snapshot._id)
															}}
														>
															<span className="text-s vsubtle">{multilineText(snapshot.comment)}</span>
														</a>
													)}
												</td>
												{this.state.removeSnapshots ? (
													<td>
														<button
															className="btn mod mhm btn-secondary"
															onClick={() => {
																this.removeStoredSnapshot(snapshot._id)
															}}
														>
															{t('Remove')}
														</button>
													</td>
												) : null}
											</tr>
										)
									})}
								</tbody>
							</table>
							<div>
								<a
									href="#"
									onClick={(e) => {
										e.preventDefault()
										this.toggleRemoveView()
									}}
								>
									{t('Show "Remove snapshots"-buttons')}
								</a>
							</div>
						</div>
					</div>
				</div>
			)
		}
	}
)
