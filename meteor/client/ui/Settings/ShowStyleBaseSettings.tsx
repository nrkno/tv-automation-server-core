import * as _ from 'underscore'
import * as React from 'react'
import ClassNames from 'classnames'
import Tooltip from 'rc-tooltip'
import { EditAttribute } from '../../lib/EditAttribute'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import { Spinner } from '../../lib/Spinner'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { Blueprints } from '../../../lib/collections/Blueprints'
import {
	ShowStyleBase,
	ShowStyleBases,
	HotkeyDefinition,
	ShowStyleBaseId,
} from '../../../lib/collections/ShowStyleBases'
import { doModalDialog } from '../../lib/ModalDialog'
import { faTrash, faPencilAlt, faCheck, faPlus, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { findHighestRank } from './StudioSettings'
import { literal, unprotectString, ProtectedString, assertNever } from '../../../lib/lib'
import { Random } from 'meteor/random'
import { withTranslation } from 'react-i18next'
import { mousetrapHelper } from '../../lib/mousetrapHelper'
import { ShowStyleVariants, ShowStyleVariant } from '../../../lib/collections/ShowStyleVariants'
import {
	ISourceLayer,
	SourceLayerType,
	IOutputLayer,
	BlueprintManifestType,
	ConfigManifestEntry,
} from '@sofie-automation/blueprints-integration'
import { ConfigManifestSettings } from './ConfigManifestSettings'
import { Studios, Studio, MappingsExt } from '../../../lib/collections/Studios'
import { Link } from 'react-router-dom'
import RundownLayoutEditor from './RundownLayoutEditor'
import { getHelpMode } from '../../lib/localStorage'
import { SettingsNavigation } from '../../lib/SettingsNavigation'
import { MeteorCall } from '../../../lib/api/methods'
import { Settings } from '../../../lib/Settings'
import { RundownLayoutType } from '../../../lib/collections/RundownLayouts'
import { RundownLayoutsAPI } from '../../../lib/api/rundownLayouts'

interface IProps {
	match: {
		params: {
			showStyleBaseId: ShowStyleBaseId
		}
	}
}
interface IState {
	uploadFileKey: number // Used to force clear the input after use
	showUploadConfirm: boolean
	uploadFileName?: string
	uploadFileContents?: string
}
interface ITrackedProps {
	showStyleBase?: ShowStyleBase
	showStyleVariants: Array<ShowStyleVariant>
	compatibleStudios: Array<Studio>
	blueprintConfigManifest: ConfigManifestEntry[]
}
export default translateWithTracker<IProps, IState, ITrackedProps>((props: IProps) => {
	const showStyleBase = ShowStyleBases.findOne(props.match.params.showStyleBaseId)
	const compatibleStudios = showStyleBase
		? Studios.find({
				supportedShowStyleBase: {
					$in: [showStyleBase._id],
				},
		  }).fetch()
		: []
	const blueprint = showStyleBase
		? Blueprints.findOne({
				_id: showStyleBase.blueprintId,
				blueprintType: BlueprintManifestType.SHOWSTYLE,
		  })
		: undefined

	return {
		showStyleBase: showStyleBase,
		showStyleVariants: showStyleBase
			? ShowStyleVariants.find({
					showStyleBaseId: showStyleBase._id,
			  }).fetch()
			: [],
		compatibleStudios: compatibleStudios,
		blueprintConfigManifest: blueprint ? blueprint.showStyleConfigManifest || [] : [],
	}
})(
	class ShowStyleBaseSettings extends MeteorReactComponent<Translated<IProps & ITrackedProps>, IState> {
		constructor(props: Translated<IProps & ITrackedProps>) {
			super(props)
			this.state = {
				uploadFileKey: Date.now(),
				showUploadConfirm: false,
			}
		}

		onUploadFile(e) {
			const file = e.target.files[0]
			if (!file) {
				return
			}

			const reader = new FileReader()
			reader.onload = (e2) => {
				this.setState({
					uploadFileKey: Date.now(),
					showUploadConfirm: true,
					uploadFileName: file.name,
					uploadFileContents: (e2.target as any).result,
				})
			}

			reader.readAsText(file)
		}

		getOptionBlueprints() {
			return _.map(Blueprints.find({ blueprintType: BlueprintManifestType.SHOWSTYLE }).fetch(), (blueprint) => {
				return {
					name: blueprint.name ? blueprint.name + ` (${blueprint._id})` : blueprint._id,
					value: blueprint._id,
				}
			})
		}

		getLayerMappingsFlat() {
			const mappings: { [key: string]: MappingsExt } = {}
			_.each(this.props.compatibleStudios, (studio) => {
				mappings[studio.name] = studio.mappings
			})
			return mappings
		}

		getSourceLayersFlat() {
			if (this.props.showStyleBase) {
				return _.map(this.props.showStyleBase.sourceLayers, (layer) => {
					return {
						value: layer._id,
						name: layer.name,
						type: layer.type,
					}
				})
			} else {
				return []
			}
		}

		renderEditForm(showStyleBase: ShowStyleBase) {
			const { t } = this.props

			const layerMappings = this.getLayerMappingsFlat()
			const sourceLayers = this.getSourceLayersFlat()

			return (
				<div className="studio-edit mod mhl mvn">
					<div>
						<label className="field">
							{t('Show Style Base Name')}
							{!(this.props.showStyleBase && this.props.showStyleBase.name) ? (
								<div className="error-notice inline">
									<FontAwesomeIcon icon={faExclamationTriangle} /> {t('No name set')}
								</div>
							) : null}
							<div className="mdi">
								<EditAttribute
									modifiedClassName="bghl"
									attribute="name"
									obj={showStyleBase}
									type="text"
									collection={ShowStyleBases}
									className="mdinput"
								></EditAttribute>
								<span className="mdfx"></span>
							</div>
						</label>
						<label className="field">
							{t('Blueprint')}
							{!(this.props.showStyleBase && this.props.showStyleBase.blueprintId) ? (
								<div className="error-notice inline">
									{t('Blueprint not set')} <FontAwesomeIcon icon={faExclamationTriangle} />
								</div>
							) : null}
							<div className="mdi">
								<EditAttribute
									modifiedClassName="bghl"
									attribute="blueprintId"
									obj={showStyleBase}
									type="dropdown"
									options={this.getOptionBlueprints()}
									collection={ShowStyleBases}
									className="mdinput"
								></EditAttribute>
								<SettingsNavigation
									attribute="blueprintId"
									obj={this.props.showStyleBase}
									type="blueprint"
								></SettingsNavigation>
								<span className="mdfx"></span>
							</div>
						</label>
					</div>
					<div>
						<p className="mod mhn mvs">{t('Compatible Studios:')}</p>
						<p className="mod mhn mvs">
							{this.props.compatibleStudios.length > 0
								? this.props.compatibleStudios.map((i) => (
										<span key={unprotectString(i._id)} className="pill">
											<Link className="pill-link" to={`/settings/studio/${i._id}`}>
												{i.name}
											</Link>
										</span>
								  ))
								: t('This Show Style is not compatible with any Studio')}
						</p>
					</div>
					<div className="row">
						<div className="col c12 rl-c6">
							<SourceLayerSettings showStyleBase={showStyleBase} />
						</div>
						<div className="col c12 rl-c6">
							<OutputSettings showStyleBase={showStyleBase} />
						</div>
					</div>
					<div className="row">
						<div className="col c12 r1-c12">
							<HotkeyLegendSettings showStyleBase={showStyleBase} />
						</div>
					</div>
					{RundownLayoutsAPI.GetSettingsManifest().map((region) => {
						return (
							<div className="row" key={region._id}>
								<div className="col c12 r1-c12">
									<RundownLayoutEditor
										showStyleBase={showStyleBase}
										studios={this.props.compatibleStudios}
										customRegion={region}
									/>
								</div>
							</div>
						)
					})}
					<div className="row">
						<div className="col c12 r1-c12">
							<ConfigManifestSettings
								t={this.props.t}
								i18n={this.props.i18n}
								tReady={this.props.tReady}
								manifest={this.props.blueprintConfigManifest}
								object={showStyleBase}
								collection={ShowStyleBases}
								layerMappings={layerMappings}
								sourceLayers={sourceLayers}
								configPath={'blueprintConfig'}
							/>
						</div>
					</div>
					<div className="row">
						<div className="col c12 r1-c12">
							<ShowStyleVariantsSettings
								showStyleVariants={this.props.showStyleVariants}
								blueprintConfigManifest={this.props.blueprintConfigManifest}
								showStyleBase={showStyleBase}
								layerMappings={layerMappings}
								sourceLayers={sourceLayers}
							/>
						</div>
					</div>
				</div>
			)
		}

		render() {
			if (this.props.showStyleBase) {
				return this.renderEditForm(this.props.showStyleBase)
			} else {
				return <Spinner />
			}
		}
	}
)

interface IStudioSourcesSettingsProps {
	showStyleBase: ShowStyleBase
}
interface IStudioSourcesSettingsState {
	editedSources: Array<string>
}

const SourceLayerSettings = withTranslation()(
	class SourceLayerSettings extends React.Component<
		Translated<IStudioSourcesSettingsProps>,
		IStudioSourcesSettingsState
	> {
		constructor(props: Translated<IStudioSourcesSettingsProps>) {
			super(props)

			this.state = {
				editedSources: [],
			}
		}

		isItemEdited = (item: ISourceLayer) => {
			return this.state.editedSources.indexOf(item._id) >= 0
		}

		finishEditItem = (item: ISourceLayer) => {
			const index = this.state.editedSources.indexOf(item._id)
			if (index >= 0) {
				this.state.editedSources.splice(index, 1)
				this.setState({
					editedSources: this.state.editedSources,
				})
			}
		}

		editItem = (item: ISourceLayer) => {
			if (this.state.editedSources.indexOf(item._id) < 0) {
				this.state.editedSources.push(item._id)
				this.setState({
					editedSources: this.state.editedSources,
				})
			} else {
				this.finishEditItem(item)
			}
		}

		sourceLayerString(type: SourceLayerType) {
			const { t } = this.props
			switch (type) {
				case SourceLayerType.CAMERA:
					return t('Camera')
				case SourceLayerType.GRAPHICS:
					return t('Graphics')
				case SourceLayerType.LIVE_SPEAK:
					return t('Live Speak')
				case SourceLayerType.LOWER_THIRD:
					return t('Lower Third')
				// case SourceLayerType.MIC:
				// 	return t('Studio Microphone')
				case SourceLayerType.REMOTE:
					return t('Remote Source')
				case SourceLayerType.SCRIPT:
					return t('Generic Script')
				case SourceLayerType.SPLITS:
					return t('Split Screen')
				case SourceLayerType.VT:
					return t('Clips')
				// case SourceLayerType.METADATA:
				// 	return t('Metadata')
				// case SourceLayerType.CAMERA_MOVEMENT:
				// 	return t('Camera Movement')
				case SourceLayerType.UNKNOWN:
					return t('Unknown Layer')
				case SourceLayerType.AUDIO:
					return t('Audio Mixing')
				case SourceLayerType.TRANSITION:
					return t('Transition')
				// case SourceLayerType.LIGHTS:
				// 	return t('Lights')
				case SourceLayerType.LOCAL:
					return t('Local')
				default:
					assertNever(type)
					return SourceLayerType[type]
			}
		}
		onAddSource = () => {
			const maxRank = findHighestRank(this.props.showStyleBase.sourceLayers)
			const { t } = this.props

			const newSource = literal<ISourceLayer>({
				_id: this.props.showStyleBase._id + '-' + Random.id(5),
				_rank: maxRank ? maxRank._rank + 10 : 0,
				name: t('New Source'),
				type: SourceLayerType.UNKNOWN,
			})

			ShowStyleBases.update(this.props.showStyleBase._id, {
				$push: {
					sourceLayers: newSource,
				},
			})
		}
		onDeleteSource = (item: ISourceLayer) => {
			if (this.props.showStyleBase) {
				ShowStyleBases.update(this.props.showStyleBase._id, {
					$pull: {
						sourceLayers: {
							_id: item._id,
						},
					},
				})
			}
		}
		confirmDelete = (item: ISourceLayer) => {
			const { t } = this.props
			doModalDialog({
				title: t('Delete this item?'),
				no: t('Cancel'),
				yes: t('Delete'),
				onAccept: () => {
					this.onDeleteSource(item)
				},
				message: (
					<React.Fragment>
						<p>
							{t('Are you sure you want to delete source layer "{{sourceLayerId}}"?', {
								sourceLayerId: item && item.name,
							})}
						</p>
						<p>{t('Please note: This action is irreversible!')}</p>
					</React.Fragment>
				),
			})
		}
		renderInputSources() {
			const { t } = this.props

			return _.map(this.props.showStyleBase.sourceLayers, (item, index) => {
				const newItem = _.clone(item) as ISourceLayer & { index: number }
				newItem.index = index
				return newItem
			})
				.sort((a, b) => {
					return a._rank - b._rank
				})
				.map((item) => {
					return (
						<React.Fragment key={item._id}>
							<tr
								className={ClassNames({
									hl: this.isItemEdited(item),
								})}
							>
								<th className="settings-studio-source-table__name c2">{item.name}</th>
								<td className="settings-studio-source-table__id c4">{item._id}</td>
								<td className="settings-studio-source-table__type c3">
									{this.sourceLayerString(Number.parseInt(item.type.toString(), 10) as SourceLayerType)}
								</td>
								<td className="settings-studio-source-table__actions table-item-actions c3">
									<button className="action-btn" onClick={() => this.editItem(item)}>
										<FontAwesomeIcon icon={faPencilAlt} />
									</button>
									<button className="action-btn" onClick={() => this.confirmDelete(item)}>
										<FontAwesomeIcon icon={faTrash} />
									</button>
								</td>
							</tr>
							{this.isItemEdited(item) && (
								<tr className="expando-details hl">
									<td colSpan={4}>
										<div>
											<div className="mod mvs mhs">
												<label className="field">
													{t('Source Name')}
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'sourceLayers.' + item.index + '.name'}
														obj={this.props.showStyleBase}
														type="text"
														collection={ShowStyleBases}
														className="input text-input input-l"
													></EditAttribute>
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													{t('Source Abbreviation')}
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'sourceLayers.' + item.index + '.abbreviation'}
														obj={this.props.showStyleBase}
														type="text"
														collection={ShowStyleBases}
														className="input text-input input-l"
													></EditAttribute>
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													{t('Internal ID')}
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'sourceLayers.' + item.index + '._id'}
														obj={this.props.showStyleBase}
														type="text"
														collection={ShowStyleBases}
														className="input text-input input-l"
													></EditAttribute>
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													{t('Source Type')}
													<div className="select focusable">
														<EditAttribute
															modifiedClassName="bghl"
															attribute={'sourceLayers.' + item.index + '.type'}
															obj={this.props.showStyleBase}
															type="dropdown"
															options={SourceLayerType}
															optionsAreNumbers
															collection={ShowStyleBases}
															className="focusable-main input-l"
														></EditAttribute>
													</div>
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'sourceLayers.' + item.index + '.isRemoteInput'}
														obj={this.props.showStyleBase}
														type="checkbox"
														collection={ShowStyleBases}
														className=""
													></EditAttribute>
													{t('Is a Live Remote Input')}
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'sourceLayers.' + item.index + '.isGuestInput'}
														obj={this.props.showStyleBase}
														type="checkbox"
														collection={ShowStyleBases}
														className=""
													></EditAttribute>
													{t('Is a Guest Input')}
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'sourceLayers.' + item.index + '.isHidden'}
														obj={this.props.showStyleBase}
														type="checkbox"
														collection={ShowStyleBases}
														className=""
													></EditAttribute>
													{t('Is hidden')}
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													{t('Display Rank')}
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'sourceLayers.' + item.index + '._rank'}
														obj={this.props.showStyleBase}
														type="int"
														collection={ShowStyleBases}
														className="input text-input input-l"
													></EditAttribute>
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'sourceLayers.' + item.index + '.onPresenterScreen'}
														obj={this.props.showStyleBase}
														type="checkbox"
														collection={ShowStyleBases}
														className=""
													></EditAttribute>
													{t("Display on Presenter's Screen")}
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													{t('Shortcut List')}
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'sourceLayers.' + item.index + '.activateKeyboardHotkeys'}
														obj={this.props.showStyleBase}
														type="text"
														collection={ShowStyleBases}
														className="input text-input input-l"
													></EditAttribute>
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													{t('Clear Shortcut')}
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'sourceLayers.' + item.index + '.clearKeyboardHotkey'}
														obj={this.props.showStyleBase}
														type="text"
														collection={ShowStyleBases}
														className="input text-input input-l"
													></EditAttribute>
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'sourceLayers.' + item.index + '.assignHotkeysToGlobalAdlibs'}
														obj={this.props.showStyleBase}
														type="checkbox"
														collection={ShowStyleBases}
														className=""
													></EditAttribute>
													{t('Assign Hotkeys to Global AdLibs')}
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'sourceLayers.' + item.index + '.isSticky'}
														obj={this.props.showStyleBase}
														type="checkbox"
														collection={ShowStyleBases}
														className=""
													></EditAttribute>
													{t('Pieces on this layer are sticky')}
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'sourceLayers.' + item.index + '.stickyOriginalOnly'}
														obj={this.props.showStyleBase}
														type="checkbox"
														collection={ShowStyleBases}
														className=""
													></EditAttribute>
													{t('Only Pieces present in rundown are sticky')}
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													{t('Activate Sticky Piece Shortcut')}
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'sourceLayers.' + item.index + '.activateStickyKeyboardHotkey'}
														obj={this.props.showStyleBase}
														type="text"
														collection={ShowStyleBases}
														className="input text-input input-l"
													></EditAttribute>
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'sourceLayers.' + item.index + '.allowDisable'}
														obj={this.props.showStyleBase}
														type="checkbox"
														collection={ShowStyleBases}
														className=""
													/>
													{t('Allow disabling of Pieces')}
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'sourceLayers.' + item.index + '.isQueueable'}
														obj={this.props.showStyleBase}
														type="checkbox"
														collection={ShowStyleBases}
														className=""
													></EditAttribute>
													{t('AdLibs on this layer can be queued')}
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													{t('Exclusivity group')}
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'sourceLayers.' + item.index + '.exclusiveGroup'}
														obj={this.props.showStyleBase}
														type="text"
														collection={ShowStyleBases}
														className="input text-input input-l"
													></EditAttribute>
												</label>
											</div>
										</div>
										<div className="mod alright">
											<button className="btn btn-primary" onClick={() => this.finishEditItem(item)}>
												<FontAwesomeIcon icon={faCheck} />
											</button>
										</div>
									</td>
								</tr>
							)}
						</React.Fragment>
					)
				})
		}

		render() {
			const { t } = this.props
			return (
				<div>
					<h2 className="mhn">
						<Tooltip
							overlay={t('Add some source layers (e.g. Graphics) for your data to appear in rundowns')}
							visible={getHelpMode() && !this.props.showStyleBase.sourceLayers.length}
							placement="bottom"
						>
							<span>{t('Source Layers')}</span>
						</Tooltip>
					</h2>
					{!this.props.showStyleBase ||
					!this.props.showStyleBase.sourceLayers ||
					!this.props.showStyleBase.sourceLayers.length ? (
						<div className="error-notice">
							<FontAwesomeIcon icon={faExclamationTriangle} /> {t('No source layers set')}
						</div>
					) : null}
					<table className="expando settings-studio-source-table">
						<tbody>{this.renderInputSources()}</tbody>
					</table>
					<div className="mod mhs">
						<button className="btn btn-primary" onClick={this.onAddSource}>
							<FontAwesomeIcon icon={faPlus} />
						</button>
					</div>
				</div>
			)
		}
	}
)

interface IOutputSettingsProps {
	showStyleBase: ShowStyleBase
}
interface IOutputSettingsState {
	editedOutputs: Array<string>
}

const OutputSettings = withTranslation()(
	class OutputSettings extends React.Component<Translated<IOutputSettingsProps>, IOutputSettingsState> {
		constructor(props: Translated<IOutputSettingsProps>) {
			super(props)

			this.state = {
				editedOutputs: [],
			}
		}

		isPGMChannelSet() {
			if (!this.props.showStyleBase.outputLayers) return false
			return this.props.showStyleBase.outputLayers.filter((layer) => layer.isPGM).length > 0
		}

		isItemEdited = (item: IOutputLayer) => {
			return this.state.editedOutputs.indexOf(item._id) >= 0
		}

		finishEditItem = (item: IOutputLayer) => {
			const index = this.state.editedOutputs.indexOf(item._id)
			if (index >= 0) {
				this.state.editedOutputs.splice(index, 1)
				this.setState({
					editedOutputs: this.state.editedOutputs,
				})
			}
		}

		editItem = (item: IOutputLayer) => {
			if (this.state.editedOutputs.indexOf(item._id) < 0) {
				this.state.editedOutputs.push(item._id)
				this.setState({
					editedOutputs: this.state.editedOutputs,
				})
			} else {
				this.finishEditItem(item)
			}
		}

		confirmDelete = (output: IOutputLayer) => {
			const { t } = this.props
			doModalDialog({
				title: t('Delete this output?'),
				no: t('Cancel'),
				yes: t('Delete'),
				onAccept: () => {
					this.onDeleteOutput(output)
				},
				message: (
					<React.Fragment>
						<p>
							{t('Are you sure you want to delete source layer "{{outputId}}"?', { outputId: output && output.name })}
						</p>
						<p>{t('Please note: This action is irreversible!')}</p>
					</React.Fragment>
				),
			})
		}
		onAddOutput = () => {
			const maxRank = findHighestRank(this.props.showStyleBase.outputLayers)
			const { t } = this.props

			const newOutput = literal<IOutputLayer>({
				_id: this.props.showStyleBase._id + '-' + Random.id(5),
				_rank: maxRank ? maxRank._rank + 10 : 0,
				name: t('New Output'),
				isPGM: false,
			})

			ShowStyleBases.update(this.props.showStyleBase._id, {
				$push: {
					outputLayers: newOutput,
				},
			})
		}
		onDeleteOutput = (item: IOutputLayer) => {
			if (this.props.showStyleBase) {
				ShowStyleBases.update(this.props.showStyleBase._id, {
					$pull: {
						outputLayers: {
							_id: item._id,
						},
					},
				})
			}
		}

		renderOutputs() {
			const { t } = this.props
			return _.map(this.props.showStyleBase.outputLayers, (item, index) => {
				const newItem = _.clone(item) as IOutputLayer & { index: number }
				newItem.index = index
				return newItem
			})
				.sort((a, b) => {
					return a._rank - b._rank
				})
				.map((item) => {
					return [
						<tr
							key={item._id}
							className={ClassNames({
								hl: this.isItemEdited(item),
							})}
						>
							<th className="settings-studio-output-table__name c2">{item.name}</th>
							<td className="settings-studio-output-table__id c4">{item._id}</td>
							<td className="settings-studio-output-table__isPGM c3">
								<div
									className={ClassNames('switch', 'switch-tight', {
										'switch-active': item.isPGM,
									})}
								>
									PGM
								</div>
							</td>
							<td className="settings-studio-output-table__actions table-item-actions c3">
								<button className="action-btn" onClick={() => this.editItem(item)}>
									<FontAwesomeIcon icon={faPencilAlt} />
								</button>
								<button className="action-btn" onClick={() => this.confirmDelete(item)}>
									<FontAwesomeIcon icon={faTrash} />
								</button>
							</td>
						</tr>,
						this.isItemEdited(item) ? (
							<tr className="expando-details hl" key={item._id + '-details'}>
								<td colSpan={4}>
									<div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Channel Name')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={'outputLayers.' + item.index + '.name'}
													obj={this.props.showStyleBase}
													type="text"
													collection={ShowStyleBases}
													className="input text-input input-l"
												></EditAttribute>
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Internal ID')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={'outputLayers.' + item.index + '._id'}
													obj={this.props.showStyleBase}
													type="text"
													collection={ShowStyleBases}
													className="input text-input input-l"
												></EditAttribute>
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												<EditAttribute
													modifiedClassName="bghl"
													attribute={'outputLayers.' + item.index + '.isPGM'}
													obj={this.props.showStyleBase}
													type="checkbox"
													collection={ShowStyleBases}
													className=""
												></EditAttribute>
												{t('Is PGM Output')}
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Display Rank')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={'outputLayers.' + item.index + '._rank'}
													obj={this.props.showStyleBase}
													type="int"
													collection={ShowStyleBases}
													className="input text-input input-l"
												></EditAttribute>
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												<EditAttribute
													modifiedClassName="bghl"
													attribute={'outputLayers.' + item.index + '.isDefaultCollapsed'}
													obj={this.props.showStyleBase}
													type="checkbox"
													collection={ShowStyleBases}
													className=""
												></EditAttribute>
												{t('Is collapsed by default')}
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												<EditAttribute
													modifiedClassName="bghl"
													attribute={'outputLayers.' + item.index + '.isFlattened'}
													obj={this.props.showStyleBase}
													type="checkbox"
													collection={ShowStyleBases}
													className=""
												></EditAttribute>
												{t('Is flattened')}
											</label>
										</div>
									</div>
									<div className="mod alright">
										<button className="btn btn-primary" onClick={() => this.finishEditItem(item)}>
											<FontAwesomeIcon icon={faCheck} />
										</button>
									</div>
								</td>
							</tr>
						) : null,
					]
				})
		}

		render() {
			const { t } = this.props
			return (
				<div>
					<h2 className="mhn">
						<Tooltip
							overlay={t('Output channels are required for your studio to work')}
							visible={getHelpMode() && !this.props.showStyleBase.outputLayers.length}
							placement="top"
						>
							<span>{t('Output channels')}</span>
						</Tooltip>
					</h2>
					{!this.props.showStyleBase ||
					!this.props.showStyleBase.outputLayers ||
					!this.props.showStyleBase.outputLayers.length ? (
						<div className="error-notice">
							<FontAwesomeIcon icon={faExclamationTriangle} /> {t('No output channels set')}
						</div>
					) : null}
					{!this.isPGMChannelSet() ? (
						<div className="error-notice">
							<FontAwesomeIcon icon={faExclamationTriangle} /> {t('No PGM output')}
						</div>
					) : null}
					<table className="expando settings-studio-output-table">
						<tbody>{this.renderOutputs()}</tbody>
					</table>
					<div className="mod mhs">
						<button className="btn btn-primary" onClick={this.onAddOutput}>
							<FontAwesomeIcon icon={faPlus} />
						</button>
					</div>
				</div>
			)
		}
	}
)

interface IHotkeyLegendSettingsProps {
	showStyleBase: ShowStyleBase
}
interface IHotkeyLegendSettingsState {
	editedItems: Array<string>
}

const HotkeyLegendSettings = withTranslation()(
	class HotkeyLegendSettings extends React.Component<
		Translated<IHotkeyLegendSettingsProps>,
		IHotkeyLegendSettingsState
	> {
		constructor(props: Translated<IHotkeyLegendSettingsProps>) {
			super(props)

			this.state = {
				editedItems: [],
			}
		}

		isItemEdited = (item: HotkeyDefinition) => {
			return this.state.editedItems.indexOf(item._id) >= 0
		}
		finishEditItem = (item: HotkeyDefinition) => {
			const index = this.state.editedItems.indexOf(item._id)
			if (index >= 0) {
				this.state.editedItems.splice(index, 1)
				this.setState({
					editedItems: this.state.editedItems,
				})
			}
		}

		editItem = (item: HotkeyDefinition) => {
			if (this.state.editedItems.indexOf(item._id) < 0) {
				this.state.editedItems.push(item._id)
				this.setState({
					editedItems: this.state.editedItems,
				})
			} else {
				this.finishEditItem(item)
			}
		}

		onDeleteHotkeyLegend = (item: HotkeyDefinition) => {
			if (this.props.showStyleBase) {
				ShowStyleBases.update(this.props.showStyleBase._id, {
					$pull: {
						hotkeyLegend: {
							_id: item._id,
						},
					},
				})
			}
		}
		onAddHotkeyLegend = () => {
			const newItem = literal<HotkeyDefinition>({
				_id: Random.id(),
				key: '',
				label: 'New hotkey',
			})

			ShowStyleBases.update(this.props.showStyleBase._id, {
				$push: {
					hotkeyLegend: newItem,
				},
			})
		}

		renderItems() {
			const { t } = this.props
			return (this.props.showStyleBase.hotkeyLegend || []).map((item, index) => {
				return (
					<React.Fragment key={item.key}>
						<tr
							className={ClassNames({
								hl: this.isItemEdited(item),
							})}
						>
							<th className="settings-studio-custom-config-table__name c2">
								{mousetrapHelper.shortcutLabel(item.key)}
							</th>
							<td className="settings-studio-custom-config-table__value c3">{item.label}</td>
							<td className="settings-studio-custom-config-table__actions table-item-actions c3">
								<button className="action-btn" onClick={() => this.editItem(item)}>
									<FontAwesomeIcon icon={faPencilAlt} />
								</button>
								<button
									className="action-btn"
									onClick={() => this.onDeleteHotkeyLegend && this.onDeleteHotkeyLegend(item)}
								>
									<FontAwesomeIcon icon={faTrash} />
								</button>
							</td>
						</tr>
						{this.isItemEdited(item) && (
							<tr className="expando-details hl">
								<td colSpan={4}>
									<div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Key')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={'hotkeyLegend.' + index + '.key'}
													obj={this.props.showStyleBase}
													type="text"
													collection={ShowStyleBases}
													className="input text-input input-l"
												></EditAttribute>
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Value')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={'hotkeyLegend.' + index + '.label'}
													obj={this.props.showStyleBase}
													type="text"
													collection={ShowStyleBases}
													className="input text-input input-l"
												></EditAttribute>
											</label>
										</div>
									</div>
									<div className="mod alright">
										<button className="btn btn-primary" onClick={() => this.finishEditItem(item)}>
											<FontAwesomeIcon icon={faCheck} />
										</button>
									</div>
								</td>
							</tr>
						)}
					</React.Fragment>
				)
			})
		}

		render() {
			const { t } = this.props
			return (
				<div>
					<h2 className="mhn">{t('Custom Hotkey Labels')}</h2>
					<table className="expando settings-studio-custom-config-table">
						<tbody>{this.renderItems()}</tbody>
					</table>
					<div className="mod mhs">
						<button className="btn btn-primary" onClick={this.onAddHotkeyLegend}>
							<FontAwesomeIcon icon={faPlus} />
						</button>
					</div>
				</div>
			)
		}
	}
)
interface IShowStyleVariantsProps {
	showStyleBase: ShowStyleBase
	showStyleVariants: Array<ShowStyleVariant>
	blueprintConfigManifest: ConfigManifestEntry[]

	layerMappings?: { [key: string]: MappingsExt }
	sourceLayers?: Array<{ name: string; value: string; type: SourceLayerType }>
}
interface IShowStyleVariantsSettingsState {
	editedMappings: ProtectedString<any>[]
}
const ShowStyleVariantsSettings = withTranslation()(
	class ShowStyleVariantsSettings extends React.Component<
		Translated<IShowStyleVariantsProps>,
		IShowStyleVariantsSettingsState
	> {
		constructor(props: Translated<IShowStyleVariantsProps>) {
			super(props)

			this.state = {
				editedMappings: [],
			}
		}
		isItemEdited = (layerId: ProtectedString<any>) => {
			return this.state.editedMappings.indexOf(layerId) >= 0
		}
		finishEditItem = (layerId: ProtectedString<any>) => {
			const index = this.state.editedMappings.indexOf(layerId)
			if (index >= 0) {
				this.state.editedMappings.splice(index, 1)
				this.setState({
					editedMappings: this.state.editedMappings,
				})
			}
		}
		editItem = (layerId: ProtectedString<any>) => {
			if (this.state.editedMappings.indexOf(layerId) < 0) {
				this.state.editedMappings.push(layerId)
				this.setState({
					editedMappings: this.state.editedMappings,
				})
			} else {
				this.finishEditItem(layerId)
			}
		}
		onAddShowStyleVariant = () => {
			MeteorCall.showstyles.insertShowStyleVariant(this.props.showStyleBase._id).catch(console.error)
		}
		confirmRemove = (showStyleVariant: ShowStyleVariant) => {
			const { t } = this.props
			doModalDialog({
				title: t('Remove this Variant?'),
				no: t('Cancel'),
				yes: t('Remove'),
				onAccept: () => {
					MeteorCall.showstyles.removeShowStyleVariant(showStyleVariant._id).catch(console.error)
				},
				message: (
					<React.Fragment>
						<p>
							{t('Are you sure you want to remove the variant "{{showStyleVariantId}}"?', {
								showStyleVariantId: showStyleVariant.name,
							})}
						</p>
					</React.Fragment>
				),
			})
		}

		renderShowStyleVariants() {
			const { t } = this.props

			return this.props.showStyleVariants.map((showStyleVariant) => {
				return (
					<React.Fragment key={unprotectString(showStyleVariant._id)}>
						<tr
							className={ClassNames({
								hl: this.isItemEdited(showStyleVariant._id),
							})}
						>
							<th className="settings-studio-showStyleVariant__name c3">
								{showStyleVariant.name || t('Unnamed variant')}
							</th>
							<td className="settings-studio-showStyleVariant__actions table-item-actions c3">
								<button className="action-btn" onClick={() => this.editItem(showStyleVariant._id)}>
									<FontAwesomeIcon icon={faPencilAlt} />
								</button>
								<button className="action-btn" onClick={() => this.confirmRemove(showStyleVariant)}>
									<FontAwesomeIcon icon={faTrash} />
								</button>
							</td>
						</tr>
						{this.isItemEdited(showStyleVariant._id) && (
							<tr className="expando-details hl">
								<td colSpan={5}>
									<div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Variant Name')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={'name'}
													obj={showStyleVariant}
													type="text"
													collection={ShowStyleVariants}
													className="input text-input input-l"
												></EditAttribute>
											</label>
										</div>
									</div>
									<div className="row">
										<div className="col c12 r1-c12 phs">
											<ConfigManifestSettings
												t={this.props.t}
												i18n={this.props.i18n}
												tReady={this.props.tReady}
												manifest={this.props.blueprintConfigManifest}
												collection={ShowStyleVariants}
												configPath={'blueprintConfig'}
												object={showStyleVariant}
												layerMappings={this.props.layerMappings}
												sourceLayers={this.props.sourceLayers}
												subPanel={true}
											/>
										</div>
									</div>
									<div className="mod alright">
										<button className="btn btn-primary" onClick={() => this.finishEditItem(showStyleVariant._id)}>
											<FontAwesomeIcon icon={faCheck} />
										</button>
									</div>
								</td>
							</tr>
						)}
					</React.Fragment>
				)
			})
		}

		render() {
			const { t } = this.props
			return (
				<div>
					<h2 className="mhn">{t('Variants')}</h2>
					<table className="table expando settings-studio-showStyleVariants-table">
						<tbody>{this.renderShowStyleVariants()}</tbody>
					</table>
					<div className="mod mhs">
						<button className="btn btn-primary" onClick={this.onAddShowStyleVariant}>
							<FontAwesomeIcon icon={faPlus} />
						</button>
					</div>
				</div>
			)
		}
	}
)
