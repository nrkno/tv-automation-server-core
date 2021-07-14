import * as objectPath from 'object-path'
import ClassNames from 'classnames'
import * as React from 'react'
import * as _ from 'underscore'
import Tooltip from 'rc-tooltip'
import { MappingsExt } from '../../../lib/collections/Studios'
import { EditAttribute } from '../../lib/EditAttribute'
import { ModalDialog } from '../../lib/ModalDialog'
import { Translated } from '../../lib/ReactMeteorData/react-meteor-data'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
	ConfigManifestEntry,
	ConfigManifestEntryType,
	IBlueprintConfig,
	BasicConfigManifestEntry,
	ConfigItemValue,
	ConfigManifestEntryTable,
	TableConfigItemValue,
	ConfigManifestEntrySourceLayers,
	ConfigManifestEntryLayerMappings,
	SourceLayerType,
} from '@sofie-automation/blueprints-integration'
import { DBObj, ProtectedString, objectPathGet } from '../../../lib/lib'
import { MongoModifier, TransformedCollection } from '../../../lib/typings/meteor'
import { Meteor } from 'meteor/meteor'
import { getHelpMode } from '../../lib/localStorage'
import { Random } from 'meteor/random'
import {
	faDownload,
	faTrash,
	faPencilAlt,
	faCheck,
	faPlus,
	faUpload,
	faSortUp,
	faSortDown,
	faSort,
} from '@fortawesome/free-solid-svg-icons'
import { UploadButton } from '../../lib/uploadButton'
import { NotificationCenter, NoticeLevel, Notification } from '../../lib/notifications/notifications'

function filterSourceLayers(
	select: ConfigManifestEntrySourceLayers<true | false>,
	layers: Array<{ name: string; value: string; type: SourceLayerType }>
): Array<{ name: string; value: string; type: SourceLayerType }> {
	if (select.filters && select.filters.sourceLayerTypes) {
		const sourceLayerTypes = select.filters.sourceLayerTypes
		return _.filter(layers, (layer) => {
			return sourceLayerTypes.includes(layer.type)
		})
	} else {
		return layers
	}
}

function filterLayerMappings(
	select: ConfigManifestEntryLayerMappings<true | false>,
	mappings: { [key: string]: MappingsExt }
): Array<{ name: string; value: string }> {
	const deviceTypes = select.filters?.deviceTypes
	const result: Array<{ name: string; value: string }> = []

	for (const studioMappings of Object.values(mappings)) {
		for (const [layerId, mapping] of Object.entries(studioMappings)) {
			if (!deviceTypes || deviceTypes.includes(mapping.device)) {
				result.push({ name: mapping.layerName || layerId, value: layerId })
			}
		}
	}

	return result
}

function getEditAttribute<DBInterface extends { _id: ProtectedString<any> }, DocClass extends DBInterface>(
	collection: TransformedCollection<DocClass, DBInterface>,
	object: DBInterface,
	item: BasicConfigManifestEntry,
	attribute: string,
	layerMappings?: { [key: string]: MappingsExt },
	sourceLayers?: Array<{ name: string; value: string; type: SourceLayerType }>
) {
	switch (item.type) {
		case ConfigManifestEntryType.STRING:
			return (
				<EditAttribute
					modifiedClassName="bghl"
					attribute={attribute}
					obj={object}
					type="text"
					collection={collection}
					className="input text-input input-l"
				/>
			)
		case ConfigManifestEntryType.MULTILINE_STRING:
			return (
				<EditAttribute
					modifiedClassName="bghl"
					attribute={attribute}
					obj={object}
					type="multiline"
					collection={collection}
					className="input text-input input-l"
					mutateDisplayValue={(v) => (v === undefined || v.length === 0 ? undefined : v.join('\n'))}
					mutateUpdateValue={(v) =>
						v === undefined || v.length === 0 ? undefined : v.split('\n').map((i) => i.trimStart())
					}
				/>
			)
		case ConfigManifestEntryType.NUMBER:
		case ConfigManifestEntryType.INT:
			return (
				<EditAttribute
					modifiedClassName="bghl"
					attribute={attribute}
					obj={object}
					type="int"
					collection={collection}
					className="input text-input input-m"
					mutateDisplayValue={(v) => (item.zeroBased ? v + 1 : v)}
					mutateUpdateValue={(v) => (item.zeroBased ? v - 1 : v)}
				/>
			)
		case ConfigManifestEntryType.FLOAT:
			return (
				<EditAttribute
					modifiedClassName="bghl"
					attribute={attribute}
					obj={object}
					type="float"
					collection={collection}
					className="input text-input input-m"
				/>
			)
		case ConfigManifestEntryType.BOOLEAN:
			return (
				<EditAttribute
					modifiedClassName="bghl"
					attribute={attribute}
					obj={object}
					type="checkbox"
					collection={collection}
					className="input"
				/>
			)
		case ConfigManifestEntryType.ENUM:
			return (
				<EditAttribute
					modifiedClassName="bghl"
					attribute={attribute}
					obj={object}
					type="dropdown"
					options={item.options || []}
					collection={collection}
					className="input text-input input-l"
				/>
			)
		case ConfigManifestEntryType.JSON:
			return (
				<EditAttribute
					modifiedClassName="bghl"
					invalidClassName="warn"
					attribute={attribute}
					obj={object}
					type="json"
					collection={collection}
					className="input text-input input-l"
				/>
			)
		case ConfigManifestEntryType.SELECT:
			return (
				<EditAttribute
					modifiedClassName="bghl"
					attribute={attribute}
					obj={object}
					type={item.multiple ? 'multiselect' : 'dropdown'}
					options={item.options}
					collection={collection}
					className="input text-input dropdown input-l"
				/>
			)
		case ConfigManifestEntryType.SOURCE_LAYERS:
			if (sourceLayers) {
				return (
					<EditAttribute
						modifiedClassName="bghl"
						attribute={attribute}
						obj={object}
						type={item.multiple ? 'multiselect' : 'dropdown'}
						options={filterSourceLayers(item, sourceLayers)}
						collection={collection}
						className="input text-input dropdown input-l"
					/>
				)
			}
			break
		case ConfigManifestEntryType.LAYER_MAPPINGS:
			if (layerMappings) {
				return (
					<EditAttribute
						modifiedClassName="bghl"
						attribute={attribute}
						obj={object}
						type={item.multiple ? 'multiselect' : 'dropdown'}
						options={filterLayerMappings(item, layerMappings)}
						collection={collection}
						className="input text-input dropdown input-l"
					/>
				)
			}
			break
		default:
			return null
	}
}

interface IConfigManifestSettingsProps<
	TCol extends TransformedCollection<DocClass, DBInterface>,
	DBInterface extends { _id: ProtectedString<any> },
	DocClass extends DBInterface
> {
	manifest: ConfigManifestEntry[]

	collection: TCol
	object: DBInterface
	configPath: string

	layerMappings?: { [key: string]: MappingsExt }
	sourceLayers?: Array<{ name: string; value: string; type: SourceLayerType }>

	subPanel?: boolean
}
interface IConfigManifestSettingsState {
	showAddItem: boolean
	addItemId: string | undefined
	showDeleteConfirm: boolean
	deleteConfirmItem: ConfigManifestEntry | undefined
	editedItems: Array<string>
	uploadFileKey: number // Used to force clear the input after use
}

interface IConfigManifestTableProps<
	TCol extends TransformedCollection<DocClass, DBInterface>,
	DBInterface extends { _id: ProtectedString<any> },
	DocClass extends DBInterface
> {
	item: ConfigManifestEntryTable
	baseAttribute: string

	collection: TCol
	object: DBInterface

	layerMappings?: { [key: string]: MappingsExt }
	sourceLayers?: Array<{ name: string; value: string; type: SourceLayerType }>

	subPanel?: boolean
}
interface IConfigManifestTableState {
	uploadFileKey: number // Used to force clear the input after use
	sortColumn: number
	sortOrder: 'asc' | 'desc'
}

export class ConfigManifestTable<
	TCol extends TransformedCollection<DocClass, DBInterface>,
	DBInterface extends DBObj,
	DocClass extends DBInterface
> extends React.Component<
	Translated<IConfigManifestTableProps<TCol, DBInterface, DocClass>>,
	IConfigManifestTableState
> {
	constructor(props: Translated<IConfigManifestTableProps<TCol, DBInterface, DocClass>>) {
		super(props)

		this.state = {
			uploadFileKey: Date.now(),
			sortColumn: -1,
			sortOrder: 'asc',
		}
	}

	updateObject(obj: DBInterface, updateObj: MongoModifier<DBInterface>) {
		this.props.collection.update(obj._id, updateObj)
	}

	removeRow(id: string, baseAttribute: string) {
		const m: any = {}
		m[baseAttribute] = {
			_id: id,
		}
		this.updateObject(this.props.object, { $pull: m })
	}

	addRow(configEntry: ConfigManifestEntryTable, baseAttribute: string) {
		const rowDefault: any = {
			_id: Random.id(),
		}
		_.each(configEntry.columns, (col) => (rowDefault[col.id] = col.defaultVal))

		const m: any = {}
		m[baseAttribute] = rowDefault
		this.updateObject(this.props.object, { $push: m })
	}

	exportJSON(configEntry: ConfigManifestEntryTable, vals: any) {
		const jsonStr = JSON.stringify(vals, undefined, 4)

		const element = document.createElement('a')
		element.href = URL.createObjectURL(new Blob([jsonStr], { type: 'application/json' }))
		element.download = `${this.props.object._id}_config_${configEntry.id}.json`

		document.body.appendChild(element) // Required for this to work in FireFox
		element.click()
		document.body.removeChild(element) // Required for this to work in FireFox
	}

	importJSON(e: React.ChangeEvent<HTMLInputElement>, configEntry: ConfigManifestEntryTable, baseAttribute: string) {
		const { t } = this.props

		const file = e.target.files ? e.target.files[0] : null
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

			// Parse the config
			let newConfig: TableConfigItemValue = []
			try {
				newConfig = JSON.parse(uploadFileContents)
				if (!_.isArray(newConfig)) {
					throw new Error('Not an array')
				}
			} catch (err) {
				NotificationCenter.push(
					new Notification(
						undefined,
						NoticeLevel.WARNING,
						t('Failed to update config: {{errorMessage}}', { errorMessage: err + '' }),
						'ConfigManifestSettings'
					)
				)
				return
			}

			// Validate the config
			const conformedConfig: TableConfigItemValue = []
			_.forEach(newConfig, (entry) => {
				const newEntry: TableConfigItemValue[0] = {
					_id: entry._id || Random.id(),
				}

				// Ensure all fields are defined
				_.forEach(configEntry.columns, (col) => {
					newEntry[col.id] = entry[col.id] !== undefined ? entry[col.id] : col.defaultVal
				})
				conformedConfig.push(newEntry)
			})

			const m: any = {}
			m[baseAttribute] = conformedConfig
			this.updateObject(this.props.object, { $set: m })
		}
		reader.readAsText(file)
	}

	sort(columnNumber: number) {
		if (this.state.sortColumn === columnNumber) {
			if (this.state.sortOrder === 'asc') {
				this.setState({
					sortOrder: 'desc',
				})
			} else {
				this.setState({
					sortColumn: -1,
				})
			}
		} else {
			this.setState({
				sortColumn: columnNumber,
				sortOrder: 'asc',
			})
		}
	}

	render() {
		const { t } = this.props

		const baseAttribute = this.props.baseAttribute
		const vals: TableConfigItemValue = objectPath.get(this.props.object, baseAttribute) || []
		const configEntry = this.props.item
		let sortedIndices = _.range(vals.length)
		if (this.state.sortColumn >= 0) {
			sortedIndices = sortedIndices.sort((x, y) => {
				const col = configEntry.columns[this.state.sortColumn]
				let a
				let b
				if (this.state.sortOrder === 'asc') {
					a = vals[x][col.id]
					b = vals[y][col.id]
				} else {
					a = vals[y][col.id]
					b = vals[x][col.id]
				}
				switch (col.type) {
					case ConfigManifestEntryType.STRING:
						if (a === '') {
							return 1
						} else if (b === '') {
							return -1
						} else {
							return (a as string).localeCompare(b as string)
						}
					case ConfigManifestEntryType.NUMBER:
					case ConfigManifestEntryType.INT:
					case ConfigManifestEntryType.FLOAT:
						return (a as number) - (b as number)
					default:
						return 0
				}
			})
		}
		return (
			<div>
				<div className="settings-studio-sticky-scroller">
					<table className="table">
						<thead>
							<tr>
								{_.map(
									configEntry.columns.sort((a, b) => {
										if (a.rank > b.rank) return 1
										if (a.rank < b.rank) return -1

										return 0
									}),
									(col, i) => (
										<th key={col.id}>
											<span title={col.description}>{col.name} </span>
											{(col.type === ConfigManifestEntryType.STRING ||
												col.type === ConfigManifestEntryType.NUMBER ||
												col.type === ConfigManifestEntryType.INT ||
												col.type === ConfigManifestEntryType.FLOAT) && (
												<button
													className={ClassNames('action-btn', {
														disabled: this.state.sortColumn !== i,
													})}
													onClick={() => this.sort(i)}
												>
													<FontAwesomeIcon
														icon={
															this.state.sortColumn === i
																? this.state.sortOrder === 'asc'
																	? faSortUp
																	: faSortDown
																: faSort
														}
													/>
												</button>
											)}
										</th>
									)
								)}
								<th>&nbsp;</th>
							</tr>
						</thead>
						<tbody>
							{_.map(vals, (val, i) => (
								<tr key={sortedIndices[i]}>
									{_.map(configEntry.columns, (col) => (
										<td key={col.id}>
											{getEditAttribute(
												this.props.collection,
												this.props.object,
												col,
												`${baseAttribute}.${sortedIndices[i]}.${col.id}`,
												this.props.layerMappings,
												this.props.sourceLayers
											)}
										</td>
									))}
									<td>
										<button
											className={ClassNames('btn btn-danger', {
												'btn-tight': this.props.subPanel,
											})}
											onClick={() => this.removeRow(val._id, baseAttribute)}
										>
											<FontAwesomeIcon icon={faTrash} />
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<button
					className={ClassNames('btn btn-primary', {
						'btn-tight': this.props.subPanel,
					})}
					onClick={() => this.addRow(configEntry, baseAttribute)}
				>
					<FontAwesomeIcon icon={faPlus} />
				</button>
				<button
					className={ClassNames('btn mlm btn-secondary', {
						'btn-tight': this.props.subPanel,
					})}
					onClick={() => this.exportJSON(configEntry, vals)}
				>
					<FontAwesomeIcon icon={faDownload} />
					&nbsp;{t('Export')}
				</button>
				<UploadButton
					className={ClassNames('btn btn-secondary mls', {
						'btn-tight': this.props.subPanel,
					})}
					accept="application/json,.json"
					onChange={(e) => this.importJSON(e, configEntry, baseAttribute)}
					key={this.state.uploadFileKey}
				>
					<FontAwesomeIcon icon={faUpload} />
					&nbsp;{t('Import')}
				</UploadButton>
			</div>
		)
	}
}

export class ConfigManifestSettings<
	TCol extends TransformedCollection<DocClass, DBInterface>,
	DBInterface extends DBObj,
	DocClass extends DBInterface
> extends React.Component<
	Translated<IConfigManifestSettingsProps<TCol, DBInterface, DocClass>>,
	IConfigManifestSettingsState
> {
	constructor(props: Translated<IConfigManifestSettingsProps<TCol, DBInterface, DocClass>>) {
		super(props)

		this.state = {
			showAddItem: false,
			addItemId: undefined,
			showDeleteConfirm: false,
			deleteConfirmItem: undefined,
			editedItems: [],
			uploadFileKey: Date.now(),
		}
	}

	getObjectConfig(): IBlueprintConfig {
		return this.props.object[this.props.configPath]
	}

	updateObject(obj: DBInterface, updateObj: MongoModifier<DBInterface>) {
		this.props.collection.update(obj._id, updateObj)
	}

	isItemEdited = (item: ConfigManifestEntry) => {
		return this.state.editedItems.indexOf(item.id) >= 0
	}

	finishEditItem = (item: ConfigManifestEntry) => {
		const index = this.state.editedItems.indexOf(item.id)
		if (index >= 0) {
			this.state.editedItems.splice(index, 1)
			this.setState({
				editedItems: this.state.editedItems,
			})
		}
	}

	createItem = (item: ConfigManifestEntry) => {
		const m: any = {
			$set: {
				[`${this.props.configPath}.${item.id}`]: item.defaultVal,
			},
		}
		this.updateObject(this.props.object, m)
	}

	editItem = (item: ConfigManifestEntry) => {
		// Ensure the item exists, so edit by index works
		const val = objectPathGet(this.getObjectConfig(), item.id)

		if (val === undefined) throw new Meteor.Error(500, `Unable to edit an item that doesn't exist`)

		if (this.state.editedItems.indexOf(item.id) < 0) {
			this.state.editedItems.push(item.id)
			this.setState({
				editedItems: this.state.editedItems,
			})
		} else {
			this.finishEditItem(item)
		}
	}

	addConfigItem = () => {
		const options = this.getAddOptions()

		this.setState({
			showAddItem: true,
			showDeleteConfirm: false,
			addItemId: options.length > 0 ? options[0].value : undefined,
		})
	}

	handleConfirmAddItemCancel = () => {
		this.setState({
			addItemId: undefined,
			showAddItem: false,
		})
	}

	handleConfirmAddItemAccept = () => {
		if (this.state.addItemId) {
			const item = this.props.manifest.find((c) => c.id === this.state.addItemId)
			const m: any = {
				$set: {
					[`${this.props.configPath}.${this.state.addItemId}`]: item ? item.defaultVal : '',
				},
			}
			this.updateObject(this.props.object, m)
		}

		this.setState({
			addItemId: undefined,
			showAddItem: false,
		})
	}

	confirmDelete = (item: ConfigManifestEntry) => {
		this.setState({
			showAddItem: false,
			showDeleteConfirm: true,
			deleteConfirmItem: item,
		})
	}

	handleConfirmDeleteCancel = () => {
		this.setState({
			deleteConfirmItem: undefined,
			showDeleteConfirm: false,
		})
	}

	handleConfirmDeleteAccept = () => {
		if (this.state.deleteConfirmItem) {
			const m: any = {
				$unset: {
					[`${this.props.configPath}.${this.state.deleteConfirmItem.id}`]: '',
				},
			}
			this.updateObject(this.props.object, m)
		}

		this.setState({
			deleteConfirmItem: undefined,
			showDeleteConfirm: false,
		})
	}

	renderConfigValue(item: ConfigManifestEntry, rawValue: ConfigItemValue | undefined) {
		const { t } = this.props

		const value = rawValue === undefined ? item.defaultVal : rawValue

		const rawValueArr = rawValue as any[]

		switch (item.type) {
			case ConfigManifestEntryType.BOOLEAN:
				return value ? t('true') : t('false')
			case ConfigManifestEntryType.TABLE:
				return t('{{count}} rows', { count: (rawValueArr || []).length })
			case ConfigManifestEntryType.SELECT:
			case ConfigManifestEntryType.LAYER_MAPPINGS:
			case ConfigManifestEntryType.SOURCE_LAYERS:
				return _.isArray(value) ? (
					<React.Fragment>
						<ul className="table-values-list">
							{_.map((value as string[]) || [], (val) => (
								<li key={val}>{val}</li>
							))}
						</ul>
					</React.Fragment>
				) : (
					value.toString()
				)
			case ConfigManifestEntryType.NUMBER:
			case ConfigManifestEntryType.INT:
				return _.isNumber(value) && item.zeroBased ? (value + 1).toString() : value.toString()
			default:
				return value.toString()
		}
	}

	renderEditableArea(item: ConfigManifestEntry, valIndex: string) {
		const baseAttribute = `blueprintConfig.${valIndex}`
		const { t, collection, object, i18n, tReady } = this.props
		switch (item.type) {
			case ConfigManifestEntryType.TABLE:
				return (
					<ConfigManifestTable
						t={t}
						i18n={i18n}
						tReady={tReady}
						collection={collection}
						object={object}
						baseAttribute={baseAttribute}
						item={item}
						layerMappings={this.props.layerMappings}
						sourceLayers={this.props.sourceLayers}
					/>
				)
			case ConfigManifestEntryType.SELECT:
			case ConfigManifestEntryType.LAYER_MAPPINGS:
			case ConfigManifestEntryType.SOURCE_LAYERS:
				return (
					<div className="field">
						{t('Value')}
						{getEditAttribute(
							this.props.collection,
							this.props.object,
							item as BasicConfigManifestEntry,
							baseAttribute,
							this.props.layerMappings,
							this.props.sourceLayers
						)}
					</div>
				)
			default:
				return (
					<label className="field">
						{t('Value')}
						{getEditAttribute(
							this.props.collection,
							this.props.object,
							item as BasicConfigManifestEntry,
							baseAttribute,
							this.props.layerMappings,
							this.props.sourceLayers
						)}
					</label>
				)
		}
	}

	renderItems() {
		const { t } = this.props

		const values = this.getObjectConfig()
		return this.props.manifest.map((item) => {
			const configItem = objectPathGet(values, item.id)
			if (configItem === undefined && !item.required) return undefined

			return (
				<React.Fragment key={`${item.id}`}>
					<tr
						className={ClassNames({
							hl: this.isItemEdited(item),
						})}
					>
						<th className="settings-studio-custom-config-table__name c2">{item.name}</th>
						<td className="settings-studio-custom-config-table__value c3">
							{this.renderConfigValue(item, configItem)}
						</td>
						<td className="settings-studio-custom-config-table__actions table-item-actions c3">
							{configItem !== undefined ? (
								<React.Fragment>
									<button className="action-btn" onClick={() => this.editItem(item)}>
										<FontAwesomeIcon icon={faPencilAlt} />
									</button>
									{!item.required && (
										<button className="action-btn" onClick={() => this.confirmDelete(item)}>
											<FontAwesomeIcon icon={faTrash} />
										</button>
									)}
								</React.Fragment>
							) : (
								<button
									className={ClassNames('btn btn-primary', {
										'btn-tight': this.props.subPanel,
									})}
									onClick={() => this.createItem(item)}
								>
									<FontAwesomeIcon icon={faPlus} /> {t('Create')}
								</button>
							)}
						</td>
					</tr>
					{this.isItemEdited(item) && (
						<tr className="expando-details hl">
							<td colSpan={4}>
								<div>
									<div className="mod mvs mhs">
										<label className="field">{item.description}</label>
									</div>
									<div className="mod mvs mhs">{this.renderEditableArea(item, item.id)}</div>
								</div>
								<div className="mod alright">
									<button className={ClassNames('btn btn-primary')} onClick={() => this.finishEditItem(item)}>
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

	getAddOptions() {
		let addOptions: { value: string; name: string }[] = []
		const config = this.getObjectConfig()
		addOptions = this.props.manifest.map((c) => ({ value: c.id, name: c.name }))

		return addOptions.filter((o) => objectPathGet(config, o.value) === undefined)
	}

	render() {
		const { t } = this.props
		return (
			<div className="scroll-x">
				<ModalDialog
					title={t('Add config item')}
					acceptText={t('Add')}
					secondaryText={t('Cancel')}
					show={this.state.showAddItem}
					onAccept={() => this.handleConfirmAddItemAccept()}
					onSecondary={() => this.handleConfirmAddItemCancel()}
				>
					<div className="mod mvs mhs">
						<label className="field">
							{t('Item')}
							<div className="select focusable">
								<EditAttribute
									modifiedClassName="bghl"
									type="dropdown"
									options={this.getAddOptions()}
									updateFunction={(e, v) => this.setState({ addItemId: v })}
									overrideDisplayValue={this.state.addItemId}
								/>
							</div>
						</label>
					</div>
				</ModalDialog>
				<ModalDialog
					title={t('Delete this item?')}
					acceptText={t('Delete')}
					secondaryText={t('Cancel')}
					show={this.state.showDeleteConfirm}
					onAccept={() => this.handleConfirmDeleteAccept()}
					onSecondary={() => this.handleConfirmDeleteCancel()}
				>
					<p>
						{t('Are you sure you want to delete this config item "{{configId}}"?', {
							configId: this.state.deleteConfirmItem && this.state.deleteConfirmItem.name,
						})}
					</p>
					<p>{t('Please note: This action is irreversible!')}</p>
				</ModalDialog>
				{this.props.subPanel ? (
					<h3 className="mhn">{t('Blueprint Configuration')}</h3>
				) : (
					<h2 className="mhn">{t('Blueprint Configuration')}</h2>
				)}
				<table className="table expando settings-studio-custom-config-table">
					<tbody>{this.renderItems()}</tbody>
				</table>
				<div className="mod mhs">
					<button
						className={ClassNames('btn btn-primary', {
							'btn-tight': this.props.subPanel,
						})}
						onClick={this.addConfigItem}
					>
						<Tooltip
							overlay={t('More settings specific to this studio can be found here')}
							visible={getHelpMode()}
							placement="right"
						>
							<FontAwesomeIcon icon={faPlus} />
						</Tooltip>
					</button>
				</div>
			</div>
		)
	}
}
