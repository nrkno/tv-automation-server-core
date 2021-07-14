import * as React from 'react'
import { EditAttribute } from '../../lib/EditAttribute'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import { Spinner } from '../../lib/Spinner'
import { doModalDialog } from '../../lib/ModalDialog'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { Blueprint, Blueprints, BlueprintId } from '../../../lib/collections/Blueprints'
import Moment from 'react-moment'
import { Link } from 'react-router-dom'
import { Studio, Studios } from '../../../lib/collections/Studios'
import { ShowStyleBases, ShowStyleBase } from '../../../lib/collections/ShowStyleBases'
import { ICoreSystem, CoreSystem } from '../../../lib/collections/CoreSystem'
import { BlueprintManifestType } from '@sofie-automation/blueprints-integration'
import { NotificationCenter, Notification, NoticeLevel } from '../../lib/notifications/notifications'
import { fetchFrom } from '../../lib/lib'
import { UploadButton } from '../../lib/uploadButton'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUpload, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons'
import { unprotectString } from '../../../lib/lib'
import { MeteorCall } from '../../../lib/api/methods'

interface IProps {
	match: {
		params: {
			blueprintId: BlueprintId
		}
	}
	userId?: string
}
interface IState {
	uploadFileKey: number // Used to force clear the input after use
}
interface ITrackedProps {
	userId?: string
	blueprint?: Blueprint
	assignedStudios: Studio[]
	assignedShowStyles: ShowStyleBase[]
	assignedSystem: ICoreSystem | undefined
}
export default translateWithTracker<IProps, IState, ITrackedProps>((props: IProps) => {
	const id = props.match.params.blueprintId

	return {
		userId: props.userId,
		blueprint: Blueprints.findOne(id),
		assignedStudios: Studios.find({ blueprintId: id }).fetch(),
		assignedShowStyles: ShowStyleBases.find({ blueprintId: id }).fetch(),
		assignedSystem: CoreSystem.findOne({ blueprintId: id }),
	}
})(
	class BlueprintSettings extends MeteorReactComponent<Translated<IProps & ITrackedProps>, IState> {
		constructor(props: Translated<IProps & ITrackedProps>) {
			super(props)
			this.state = {
				uploadFileKey: Date.now(),
			}
		}

		onUploadFile(e) {
			const { t } = this.props

			const file = e.target.files[0]
			if (!file) {
				return
			}

			const reader = new FileReader()
			reader.onload = (e2) => {
				// On file upload

				this.setState({
					uploadFileKey: Date.now(),
				})

				const uploadFileContents = (e2.target as any).result
				const blueprint = this.props.blueprint

				// First attempt
				doModalDialog({
					title: t('Update Blueprints?'),
					yes: t('Update'),
					no: t('Cancel'),
					message: (
						<React.Fragment>
							<p>
								{t('Are you sure you want to update the blueprints from the file "{{fileName}}"?', {
									fileName: file.name,
								})}
							</p>
							<p>{t('Please note: This action is irreversible!')}</p>
						</React.Fragment>
					),
					onAccept: () => {
						if (uploadFileContents && blueprint) {
							fetchFrom(`/blueprints/restore/${blueprint._id}`, {
								method: 'POST',
								body: uploadFileContents,
								headers: {
									'content-type': 'text/javascript',
									authorization: 'id ' + this.props.userId,
								},
							})
								.then(() => {
									NotificationCenter.push(
										new Notification(
											undefined,
											NoticeLevel.NOTIFICATION,
											t('Blueprints updated successfully.'),
											'BlueprintSettings'
										)
									)
								})
								.catch((err) => {
									if (err && err.toString().endsWith('[422]')) {
										// Needs a force flag

										// Try again as a replace
										doModalDialog({
											title: t('Replace Blueprints?'),
											yes: t('Replace'),
											no: t('Cancel'),
											warning: true,
											message: (
												<React.Fragment>
													<p>
														{t('Are you sure you want to replace the blueprints with the file "{{fileName}}"?', {
															fileName: file.name,
														})}
													</p>
													<p>{t('Please note: This action is irreversible!')}</p>
												</React.Fragment>
											),
											onAccept: () => {
												if (uploadFileContents && blueprint) {
													fetchFrom(`/blueprints/restore/${blueprint._id}?force=1`, {
														method: 'POST',
														body: uploadFileContents,
														headers: {
															'content-type': 'text/javascript',
															authorization: 'id ' + this.props.userId,
														},
													})
														.then(() => {
															NotificationCenter.push(
																new Notification(
																	undefined,
																	NoticeLevel.NOTIFICATION,
																	t('Blueprints updated successfully.'),
																	'BlueprintSettings'
																)
															)
														})
														.catch((err: string) => {
															// console.error('Blueprint restore failure: ', err)
															NotificationCenter.push(
																new Notification(
																	undefined,
																	NoticeLevel.WARNING,
																	t('Failed to update blueprints: {{errorMessage}}', { errorMessage: err + '' }),
																	'BlueprintSettings'
																)
															)
														})
												}
											},
											onSecondary: () => {
												this.setState({
													uploadFileKey: Date.now(),
												})
											},
										})
									} else {
										// console.error('Blueprint restore failure: ', err)
										NotificationCenter.push(
											new Notification(
												undefined,
												NoticeLevel.WARNING,
												t('Failed to update blueprints: {{errorMessage}}', { errorMessage: err + '' }),
												'BlueprintSettings'
											)
										)
									}
								})
						}
					},
					onSecondary: () => {
						this.setState({
							uploadFileKey: Date.now(),
						})
					},
				})
			}
			reader.readAsText(file)
		}

		assignSystemBlueprint(id: BlueprintId | undefined) {
			MeteorCall.blueprint.assignSystemBlueprint(id).catch(console.error)
		}

		renderAssignment(blueprint: Blueprint) {
			const { t } = this.props

			switch (blueprint.blueprintType) {
				case BlueprintManifestType.SHOWSTYLE:
					return (
						<div>
							<p className="mod mhn mvs">{t('Assigned Show Styles:')}</p>
							<p className="mod mhn mvs">
								{this.props.assignedShowStyles.length > 0
									? this.props.assignedShowStyles.map((showStyleBase) => (
											<span key={unprotectString(showStyleBase._id)} className="pill">
												<Link className="pill-link" to={`/settings/showStyleBase/${showStyleBase._id}`}>
													{showStyleBase.name}
												</Link>
											</span>
									  ))
									: t('This Blueprint is not being used by any Show Style')}
							</p>
						</div>
					)
				case BlueprintManifestType.STUDIO:
					return (
						<div>
							<p className="mod mhn mvs">{t('Assigned Studios:')}</p>
							<p className="mod mhn mvs">
								{this.props.assignedStudios.length > 0
									? this.props.assignedStudios.map((i) => (
											<span key={unprotectString(i._id)} className="pill">
												<Link className="pill-link" to={`/settings/studio/${i._id}`}>
													{i.name}
												</Link>
											</span>
									  ))
									: t('This Blueprint is not compatible with any Studio')}
							</p>
						</div>
					)
				case BlueprintManifestType.SYSTEM:
					return (
						<div>
							<p className="mod mhn mvs">
								<button
									className="btn btn-primary"
									onClick={() => this.assignSystemBlueprint(this.props.assignedSystem ? undefined : blueprint._id)}
								>
									{this.props.assignedSystem ? t('Unassign') : t('Assign')}
								</button>
							</p>
						</div>
					)
				default:
					return <div></div>
			}
		}

		renderEditForm(blueprint: Blueprint) {
			const { t } = this.props

			return (
				<div className="studio-edit mod mhl mvn">
					<div>
						<div className="mod mvs mhn">
							{t('Blueprint ID')}: <i>{blueprint._id}</i>
						</div>
						<label className="field">
							{t('Blueprint Name')}
							{!blueprint.name ? (
								<div className="error-notice inline">
									{t('No name set')} <FontAwesomeIcon icon={faExclamationTriangle} />
								</div>
							) : null}
							<div className="mdi">
								<EditAttribute
									modifiedClassName="bghl"
									attribute="name"
									obj={blueprint}
									type="text"
									collection={Blueprints}
									className="mdinput"
								></EditAttribute>
								<span className="mdfx"></span>
							</div>
						</label>
						<div className="mod mvs mhn">
							{t('Blueprint Type')}: <i>{(blueprint.blueprintType || '').toUpperCase()}</i>
							{!blueprint.blueprintType ? (
								<div className="error-notice inline">
									{t('Upload a new blueprint')} <FontAwesomeIcon icon={faExclamationTriangle} />
								</div>
							) : null}
						</div>
						{this.renderAssignment(blueprint)}
						<div className="mod mvs mhn">
							<p className="mhn">
								{t('Last modified')}: <Moment format="YYYY/MM/DD HH:mm:ss">{blueprint.modified}</Moment>
							</p>
						</div>
						{blueprint.blueprintId ? (
							<div className="mod mvs mhn">
								<p className="mhn">
									{t('Blueprint Id')}: {blueprint.blueprintId}
								</p>
							</div>
						) : null}
						{blueprint.blueprintVersion ? (
							<div className="mod mvs mhn">
								<p className="mhn">
									{t('Blueprint Version')}: {blueprint.blueprintVersion}
								</p>
							</div>
						) : null}
						<div className="mod mtn mbm mhn">
							<label className="field">
								{t('Disable version check')}
								<EditAttribute
									modifiedClassName="bghl"
									attribute="disableVersionChecks"
									obj={blueprint}
									type="checkbox"
									collection={Blueprints}
									className="input"
								/>
							</label>
						</div>

						<div className="mod mvs mhn">
							<UploadButton
								className="btn btn-primary"
								accept="text/javascript,.js"
								onChange={(e) => this.onUploadFile(e)}
								key={this.state.uploadFileKey}
							>
								<FontAwesomeIcon icon={faUpload} />
								<span>{t('Upload Blueprints')}</span>
							</UploadButton>
						</div>
					</div>
				</div>
			)
		}

		render() {
			if (this.props.blueprint) {
				return this.renderEditForm(this.props.blueprint)
			} else {
				return <Spinner />
			}
		}
	}
)
