import * as React from 'react'
import ClassNames from 'classnames'
import { EditAttribute } from '../../lib/EditAttribute'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import { ShowStyleBase } from '../../../lib/collections/ShowStyleBases'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { faUpload, faPlus, faCheck, faPencilAlt, faDownload, faTrash } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
	RundownLayouts,
	RundownLayoutType,
	RundownLayoutBase,
	RundownLayoutFilter,
	PieceDisplayStyle,
	DashboardLayout,
	ActionButtonType,
	DashboardLayoutActionButton,
	RundownLayoutElementType,
	RundownLayoutId,
} from '../../../lib/collections/RundownLayouts'
import {
	CustomizableRegionLayout,
	CustomizableRegionSettingsManifest,
	RundownLayoutsAPI,
} from '../../../lib/api/rundownLayouts'
import { PubSub } from '../../../lib/api/pubsub'
import { literal, unprotectString } from '../../../lib/lib'
import { Random } from 'meteor/random'
import { UploadButton } from '../../lib/uploadButton'
import { doModalDialog } from '../../lib/ModalDialog'
import { NotificationCenter, Notification, NoticeLevel } from '../../lib/notifications/notifications'
import { fetchFrom } from '../../lib/lib'
import { Studio } from '../../../lib/collections/Studios'
import { Link } from 'react-router-dom'
import { MeteorCall } from '../../../lib/api/methods'
import { defaultColorPickerPalette } from '../../lib/colorPicker'
import FilterEditor from './components/FilterEditor'
import ShelfLayoutSettings from './components/rundownLayouts/ShelfLayoutSettings'
import RundownHeaderLayoutSettings from './components/rundownLayouts/RundownHeaderLayoutSettings'
import RundownViewLayoutSettings from './components/rundownLayouts/RundownViewLayoutSettings'

export interface IProps {
	showStyleBase: ShowStyleBase
	studios: Studio[]
	customRegion: CustomizableRegionSettingsManifest
}

interface IState {
	editedItems: RundownLayoutId[]
	uploadFileKey: number
}

interface ITrackedProps {
	rundownLayouts: RundownLayoutBase[]
	layoutTypes: RundownLayoutType[]
}

export default translateWithTracker<IProps, IState, ITrackedProps>((props: IProps) => {
	const layoutTypes = props.customRegion.layouts.map((l) => l.type)

	const rundownLayouts = RundownLayouts.find({
		showStyleBaseId: props.showStyleBase._id,
		userId: { $exists: false },
	}).fetch()

	return {
		rundownLayouts,
		layoutTypes,
	}
})(
	class RundownLayoutEditor extends MeteorReactComponent<Translated<IProps & ITrackedProps>, IState> {
		constructor(props: Translated<IProps & ITrackedProps>) {
			super(props)

			this.state = {
				editedItems: [],
				uploadFileKey: Date.now(),
			}
		}

		componentDidMount() {
			super.componentDidMount && super.componentDidMount()

			this.subscribe(PubSub.rundownLayouts, {})
		}

		onAddLayout = () => {
			const { t, showStyleBase } = this.props
			MeteorCall.rundownLayout
				.createRundownLayout(t('New Layout'), this.props.layoutTypes[0], showStyleBase._id, this.props.customRegion._id)
				.catch(console.error)
		}

		onAddButton = (item: RundownLayoutBase) => {
			const { t } = this.props

			RundownLayouts.update(item._id, {
				$push: {
					actionButtons: literal<DashboardLayoutActionButton>({
						_id: Random.id(),
						label: t('Button'),
						type: ActionButtonType.TAKE,
						x: 0,
						y: 0,
						width: 3,
						height: 3,
					}),
				},
			})
		}

		onAddElement = (item: RundownLayoutBase) => {
			const { t } = this.props

			const layout = this.props.customRegion.layouts.find((l) => l.type === item.type)
			const filtersTitle = layout?.filtersTitle ? t(layout.filtersTitle) : t('New Filter')

			if (!layout?.supportedFilters?.length) {
				return
			}

			RundownLayouts.update(item._id, {
				$push: {
					filters: literal<RundownLayoutFilter>({
						_id: Random.id(),
						type: RundownLayoutElementType.FILTER,
						name: filtersTitle,
						currentSegment: false,
						displayStyle: PieceDisplayStyle.BUTTONS,
						label: undefined,
						sourceLayerIds: undefined,
						outputLayerIds: undefined,
						sourceLayerTypes: undefined,
						tags: undefined,
						rank: 0,
						rundownBaseline: false,
						showThumbnailsInList: false,
						hideDuplicates: false,
						default: false,
						nextInCurrentPart: false,
						oneNextPerSourceLayer: false,
					}),
				},
			})
		}

		onRemoveButton = (item: RundownLayoutBase, button: DashboardLayoutActionButton) => {
			RundownLayouts.update(item._id, {
				$pull: {
					actionButtons: {
						_id: button._id,
					},
				},
			})
		}

		isItemEdited = (layoutBase: RundownLayoutBase) => {
			return this.state.editedItems.indexOf(layoutBase._id) >= 0
		}

		editItem = (layoutBase: RundownLayoutBase) => {
			if (!this.isItemEdited(layoutBase)) {
				this.state.editedItems.push(layoutBase._id)

				this.setState({
					editedItems: this.state.editedItems,
				})
			} else {
				this.finishEditItem(layoutBase)
			}
		}

		downloadItem = (item: RundownLayoutBase) => {
			window.location.replace(`/shelfLayouts/download/${item._id}`)
		}

		finishEditItem = (item: RundownLayoutBase) => {
			if (this.isItemEdited(item)) {
				const idx = this.state.editedItems.indexOf(item._id)
				this.state.editedItems.splice(idx, 1)

				this.setState({
					editedItems: this.state.editedItems,
				})
			}
		}

		onDeleteLayout = (e: any, item: RundownLayoutBase) => {
			const { t } = this.props

			doModalDialog({
				title: t('Delete layout?'),
				yes: t('Delete'),
				no: t('Cancel'),
				message: t('Are you sure you want to delete the shelf layout "{{name}}"?', { name: item.name }),
				onAccept: () => {
					MeteorCall.rundownLayout.removeRundownLayout(item._id).catch(console.error)
				},
			})
		}

		renderActionButtons(item: DashboardLayout) {
			const { t } = this.props

			return (
				<React.Fragment>
					<h4 className="mod mhs">{t('Action Buttons')}</h4>
					{item.actionButtons &&
						item.actionButtons.map((button, index) => (
							<div className="rundown-layout-editor-filter mod pan mas" key={button._id}>
								<button className="action-btn right mod man pas" onClick={() => this.onRemoveButton(item, button)}>
									<FontAwesomeIcon icon={faTrash} />
								</button>
								<div className="mod mvs mhs">
									<label className="field">
										{t('Label')}
										<EditAttribute
											modifiedClassName="bghl"
											attribute={`actionButtons.${index}.label`}
											obj={item}
											type="text"
											collection={RundownLayouts}
											className="input text-input input-l"
										/>
									</label>
								</div>
								<div className="mod mvs mhs">
									<label className="field">
										{t('Type')}
										<EditAttribute
											modifiedClassName="bghl"
											attribute={`actionButtons.${index}.type`}
											obj={item}
											type="dropdown"
											options={ActionButtonType}
											collection={RundownLayouts}
											className="input text-input input-l"
										/>
									</label>
								</div>
								<div className="mod mvs mhs">
									<label className="field">
										{t('X')}
										<EditAttribute
											modifiedClassName="bghl"
											attribute={`actionButtons.${index}.x`}
											obj={item}
											type="int"
											collection={RundownLayouts}
											className="input text-input input-l"
										/>
									</label>
								</div>
								<div className="mod mvs mhs">
									<label className="field">
										{t('Y')}
										<EditAttribute
											modifiedClassName="bghl"
											attribute={`actionButtons.${index}.y`}
											obj={item}
											type="int"
											collection={RundownLayouts}
											className="input text-input input-l"
										/>
									</label>
								</div>
								<div className="mod mvs mhs">
									<label className="field">
										{t('Width')}
										<EditAttribute
											modifiedClassName="bghl"
											attribute={`actionButtons.${index}.width`}
											obj={item}
											type="float"
											collection={RundownLayouts}
											className="input text-input input-l"
										/>
									</label>
								</div>
								<div className="mod mvs mhs">
									<label className="field">
										{t('Height')}
										<EditAttribute
											modifiedClassName="bghl"
											attribute={`actionButtons.${index}.height`}
											obj={item}
											type="float"
											collection={RundownLayouts}
											className="input text-input input-l"
										/>
									</label>
								</div>
							</div>
						))}
				</React.Fragment>
			)
		}

		renderElements(item: RundownLayoutBase, layout: CustomizableRegionLayout | undefined) {
			const { t } = this.props

			const isShelfLayout = RundownLayoutsAPI.isLayoutForShelf(item)
			const isRundownViewLayout = RundownLayoutsAPI.isLayoutForRundownView(item)
			const isRundownHeaderLayout = RundownLayoutsAPI.isLayoutForRundownHeader(item)

			return (
				<React.Fragment>
					<div className="mod mvs mhs">
						<label className="field">
							{t('Icon')}
							<EditAttribute
								modifiedClassName="bghl"
								attribute={'icon'}
								obj={item}
								type="iconpicker"
								collection={RundownLayouts}
								className="input text-input input-s"
							></EditAttribute>
						</label>
					</div>
					<div className="mod mvs mhs">
						<label className="field">
							{t('Icon color')}
							<EditAttribute
								modifiedClassName="bghl"
								attribute={'iconColor'}
								obj={item}
								options={defaultColorPickerPalette}
								type="colorpicker"
								collection={RundownLayouts}
								className="input text-input input-s"
							></EditAttribute>
						</label>
					</div>
					{isShelfLayout && <ShelfLayoutSettings item={item} />}
					{isRundownHeaderLayout && <RundownHeaderLayoutSettings item={item} />}
					{isRundownViewLayout && <RundownViewLayoutSettings item={item} layouts={this.props.rundownLayouts} />}
					{layout?.supportedFilters?.length && RundownLayoutsAPI.isLayoutWithFilters(item) ? (
						<React.Fragment>
							<h4 className="mod mhs">{layout?.filtersTitle ? t(`${layout?.filtersTitle}`) : t('Filters')}</h4>
							{item.filters.length === 0 ? (
								<p className="text-s dimmed mhs">{t('There are no filters set up yet')}</p>
							) : null}
						</React.Fragment>
					) : null}
					{RundownLayoutsAPI.isLayoutWithFilters(item) &&
						item.filters.map((tab, index) => (
							<FilterEditor
								key={tab._id}
								item={item}
								filter={tab}
								index={index}
								showStyleBase={this.props.showStyleBase}
								supportedFilters={layout?.supportedFilters ?? []}
							/>
						))}
				</React.Fragment>
			)
		}

		renderItems() {
			const { t } = this.props
			return (this.props.rundownLayouts || [])
				.filter((l) => l.regionId === this.props.customRegion._id && this.props.layoutTypes.includes(l.type))
				.map((item) => {
					const layout = this.props.customRegion.layouts.find((l) => l.type === item.type)
					return (
						<React.Fragment key={unprotectString(item._id)}>
							<tr
								className={ClassNames({
									hl: this.isItemEdited(item),
								})}
							>
								<th className="settings-studio-rundown-layouts-table__name c3">{item.name || t('Default Layout')}</th>
								<td className="settings-studio-rundown-layouts-table__value c2">{item.type}</td>
								<td className="settings-studio-rundown-layouts-table__value c1">
									{this.props.studios.map((studio) => (
										<span className="pill" key={unprotectString(studio._id)}>
											<Link
												target="_blank"
												className="pill-link"
												to={`/activeRundown/${studio._id}/shelf?layout=${item._id}`}
											>
												{studio.name}
											</Link>
										</span>
									))}
								</td>
								<td className="settings-studio-rundown-layouts-table__actions table-item-actions c3">
									<button className="action-btn" onClick={(_e) => this.downloadItem(item)}>
										<FontAwesomeIcon icon={faDownload} />
									</button>
									<button className="action-btn" onClick={(_e) => this.editItem(item)}>
										<FontAwesomeIcon icon={faPencilAlt} />
									</button>
									<button className="action-btn" onClick={(e) => this.onDeleteLayout(e, item)}>
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
													{t('Name')}
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'name'}
														obj={item}
														type="text"
														collection={RundownLayouts}
														className="input text-input input-l"
													></EditAttribute>
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													{t('Type')}
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'type'}
														obj={item}
														options={this.props.layoutTypes}
														type="dropdown"
														collection={RundownLayouts}
														className="input text-input input-l"
													></EditAttribute>
												</label>
											</div>
										</div>
										<div>{this.renderElements(item, layout)}</div>
										{layout?.supportedFilters?.length ? (
											<div className="mod mls">
												<button className="btn btn-secondary" onClick={(_e) => this.onAddElement(item)}>
													<FontAwesomeIcon icon={faPlus} />
													&nbsp;
													{layout?.filtersTitle ?? t(`Add filter`)}
												</button>
											</div>
										) : null}
										{item.type === RundownLayoutType.DASHBOARD_LAYOUT ? (
											<>
												<div>{RundownLayoutsAPI.isDashboardLayout(item) ? this.renderActionButtons(item) : null}</div>
												<div className="mod mls">
													<button className="btn btn-primary right" onClick={(_e) => this.finishEditItem(item)}>
														<FontAwesomeIcon icon={faCheck} />
													</button>
													<button className="btn btn-secondary" onClick={(_e) => this.onAddButton(item)}>
														<FontAwesomeIcon icon={faPlus} />
														&nbsp;
														{t('Add button')}
													</button>
												</div>
											</>
										) : (
											<>
												<div className="mod mls">
													<button className="btn btn-primary right" onClick={(_e) => this.finishEditItem(item)}>
														<FontAwesomeIcon icon={faCheck} />
													</button>
												</div>
											</>
										)}
									</td>
								</tr>
							)}
						</React.Fragment>
					)
				})
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

				doModalDialog({
					title: t('Upload Layout?'),
					yes: t('Upload'),
					no: t('Cancel'),
					message: (
						<React.Fragment>
							<p>
								{t('Are you sure you want to upload the shelf layout from the file "{{fileName}}"?', {
									fileName: file.name,
								})}
							</p>
							,
						</React.Fragment>
					),
					onAccept: () => {
						if (uploadFileContents) {
							fetchFrom(`/shelfLayouts/upload/${this.props.showStyleBase._id}`, {
								method: 'POST',
								body: uploadFileContents,
								headers: {
									'content-type': 'text/javascript',
								},
							})
								.then(() => {
									NotificationCenter.push(
										new Notification(
											undefined,
											NoticeLevel.NOTIFICATION,
											t('Shelf layout uploaded successfully.'),
											'RundownLayouts'
										)
									)
								})
								.catch((err) => {
									NotificationCenter.push(
										new Notification(
											undefined,
											NoticeLevel.WARNING,
											t('Failed to upload shelf layout: {{errorMessage}}', { errorMessage: err + '' }),
											'RundownLayouts'
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
			}
			reader.readAsText(file)
		}

		render() {
			return (
				<div className="studio-edit rundown-layout-editor">
					<h2 className="mhn">{this.props.customRegion.title}</h2>
					<table className="expando settings-studio-rundown-layouts-table">
						<tbody>{this.renderItems()}</tbody>
					</table>
					<div className="mod mhs">
						<button className="btn btn-primary" onClick={this.onAddLayout}>
							<FontAwesomeIcon icon={faPlus} />
						</button>
						<UploadButton
							className="btn btn-secondary mls"
							onChange={(e) => this.onUploadFile(e)}
							accept="application/json,.json"
						>
							<FontAwesomeIcon icon={faUpload} />
						</UploadButton>
					</div>
				</div>
			)
		}
	}
)
