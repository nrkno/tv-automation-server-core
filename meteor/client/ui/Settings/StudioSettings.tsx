import ClassNames from 'classnames'
import * as React from 'react'
import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'
import Tooltip from 'rc-tooltip'
import {
	Studio,
	Studios,
	MappingExt,
	StudioId,
	DBStudio,
	StudioRouteSet,
	StudioRouteBehavior,
	RouteMapping,
	StudioRouteSetExclusivityGroup,
	getActiveRoutes,
	StudioPackageContainer,
} from '../../../lib/collections/Studios'
import { EditAttribute, EditAttributeBase } from '../../lib/EditAttribute'
import { doModalDialog } from '../../lib/ModalDialog'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import { Spinner } from '../../lib/Spinner'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faExclamationTriangle, faTrash, faPencilAlt, faCheck, faPlus } from '@fortawesome/free-solid-svg-icons'
import { PeripheralDevice, PeripheralDevices } from '../../../lib/collections/PeripheralDevices'

import { Link } from 'react-router-dom'
import { MomentFromNow } from '../../lib/Moment'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { ShowStyleVariants, ShowStyleVariant, ShowStyleVariantId } from '../../../lib/collections/ShowStyleVariants'
import { withTranslation } from 'react-i18next'
import { ShowStyleBases, ShowStyleBase, ShowStyleBaseId } from '../../../lib/collections/ShowStyleBases'
import {
	LookaheadMode,
	BlueprintManifestType,
	TSR,
	ConfigManifestEntry,
	Accessor,
} from '@sofie-automation/blueprints-integration'
import { ConfigManifestSettings } from './ConfigManifestSettings'
import { Blueprints, BlueprintId } from '../../../lib/collections/Blueprints'
import { PeripheralDeviceAPI } from '../../../lib/api/peripheralDevice'
import { getHelpMode } from '../../lib/localStorage'
import { SettingsNavigation } from '../../lib/SettingsNavigation'
import { unprotectString, protectString } from '../../../lib/lib'
import { MeteorCall } from '../../../lib/api/methods'
import { TransformedCollection } from '../../../lib/typings/meteor'
import { doUserAction, UserAction } from '../../lib/userAction'
import { PlayoutDeviceSettings } from '../../../lib/collections/PeripheralDeviceSettings/playoutDevice'
import { ConfigManifestEntryType, MappingManifestEntry, MappingsManifest } from '../../../lib/api/deviceConfig'
import { renderEditAttribute } from './components/ConfigManifestEntryComponent'
import { LOOKAHEAD_DEFAULT_SEARCH_DISTANCE } from '../../../lib/constants'

interface IStudioDevicesProps {
	studio: Studio
	studioDevices: Array<PeripheralDevice>
	availableDevices: Array<PeripheralDevice>
}
interface IStudioDevicesSettingsState {
	showAvailableDevices: boolean
}
const StudioDevices = withTranslation()(
	class StudioDevices extends React.Component<Translated<IStudioDevicesProps>, IStudioDevicesSettingsState> {
		constructor(props: Translated<IStudioDevicesProps>) {
			super(props)

			this.state = {
				showAvailableDevices: false,
			}
		}

		onRemoveDevice = (item: PeripheralDevice) => {
			PeripheralDevices.update(item._id, {
				$unset: {
					studioId: 1,
				},
			})
		}

		onAddDevice = (item: PeripheralDevice) => {
			PeripheralDevices.update(item._id, {
				$set: {
					studioId: this.props.studio._id,
				},
			})
		}
		confirmRemove = (device: PeripheralDevice) => {
			const { t } = this.props
			doModalDialog({
				title: t('Remove this device?'),
				yes: t('Remove'),
				no: t('Cancel'),
				onAccept: () => {
					this.onRemoveDevice(device)
				},
				message: (
					<p>
						{t('Are you sure you want to remove device "{{deviceId}}"?', {
							deviceId: device && (device.name || device._id),
						})}
					</p>
				),
			})
		}

		renderDevices() {
			return this.props.studioDevices.map((device) => {
				return (
					<tr key={unprotectString(device._id)}>
						<th className="settings-studio-device__name c3">
							<Link to={'/settings/peripheralDevice/' + device._id}>{device.name}</Link>
						</th>
						<td className="settings-studio-device__id c3">{device._id}</td>
						<td className="settings-studio-device__id c3">
							<MomentFromNow date={device.lastSeen} />
						</td>
						<td className="settings-studio-device__actions table-item-actions c3">
							<button className="action-btn" onClick={() => this.confirmRemove(device)}>
								<FontAwesomeIcon icon={faTrash} />
							</button>
						</td>
					</tr>
				)
			})
		}

		showAvailableDevices() {
			this.setState({
				showAvailableDevices: !this.state.showAvailableDevices,
			})
		}

		isPlayoutConnected() {
			let connected = false
			this.props.studioDevices.map((device) => {
				if (device.type === PeripheralDeviceAPI.DeviceType.PLAYOUT) connected = true
			})
			return connected
		}

		render() {
			const { t } = this.props
			return (
				<div>
					<h2 className="mhn">
						<Tooltip
							overlay={t('Devices are needed to control your studio hardware')}
							visible={getHelpMode() && !this.props.studioDevices.length}
							placement="right"
						>
							<span>{t('Attached Devices')}</span>
						</Tooltip>
					</h2>
					&nbsp;
					{!this.props.studioDevices.length ? (
						<div className="error-notice">
							<FontAwesomeIcon icon={faExclamationTriangle} /> {t('No devices connected')}
						</div>
					) : null}
					{!this.isPlayoutConnected() ? (
						<div className="error-notice">
							<FontAwesomeIcon icon={faExclamationTriangle} /> {t('Playout gateway not connected')}
						</div>
					) : null}
					<table className="expando settings-studio-device-table">
						<tbody>{this.renderDevices()}</tbody>
					</table>
					<div className="mod mhs">
						<button className="btn btn-primary" onClick={() => this.showAvailableDevices()}>
							<FontAwesomeIcon icon={faPlus} />
						</button>
						{this.state.showAvailableDevices && (
							<div className="border-box text-s studio-devices-dropdown">
								<div className="ctx-menu">
									{this.props.availableDevices.map((device) => {
										return (
											<div
												className="ctx-menu-item"
												key={unprotectString(device._id)}
												onClick={() => this.onAddDevice(device)}
											>
												<b>{device.name}</b> <MomentFromNow date={device.lastSeen} /> ({unprotectString(device._id)})
											</div>
										)
									})}
								</div>
							</div>
						)}
					</div>
				</div>
			)
		}
	}
)

interface IDeviceMappingSettingsProps {
	studio: Studio
	mapping: MappingExt
	attribute: string
	showOptional?: boolean
	manifest: MappingsManifest
}

const DeviceMappingSettings = withTranslation()(
	class DeviceMappingSettings extends React.Component<Translated<IDeviceMappingSettingsProps>> {
		renderOptionalInput(attribute: string, obj: any, collection: TransformedCollection<any, any>) {
			return (
				<EditAttribute
					modifiedClassName="bghl"
					attribute={attribute}
					obj={obj}
					type="checkbox"
					collection={collection}
					className="mod mvn mhs"
					mutateDisplayValue={(v) => (v === undefined ? false : true)}
					mutateUpdateValue={() => undefined}
				/>
			)
		}

		renderManifestEntry(attribute: string, manifest: MappingManifestEntry[], showOptional?: boolean) {
			return (
				<React.Fragment>
					{manifest.map((m) => (
						<div className="mod mvs mhs" key={m.id}>
							<label className="field">
								{m.name}
								{showOptional && this.renderOptionalInput(attribute + '.' + m.id, this.props.studio, Studios)}
								{renderEditAttribute(Studios, m as any, this.props.studio, attribute + '.')}
								{m.hint && <span className="text-s dimmed">{m.hint}</span>}
							</label>
						</div>
					))}
				</React.Fragment>
			)
		}

		render() {
			const { mapping, attribute, showOptional } = this.props
			const manifest = this.props.manifest[mapping.device]

			if (manifest) return this.renderManifestEntry(attribute, manifest, showOptional)

			return null
		}
	}
)

interface IStudioMappingsProps {
	studio: Studio
	manifest?: MappingsManifest
}
interface IStudioMappingsState {
	editedMappings: Array<string>
}

const StudioMappings = withTranslation()(
	class StudioMappings extends React.Component<Translated<IStudioMappingsProps>, IStudioMappingsState> {
		constructor(props: Translated<IStudioMappingsProps>) {
			super(props)

			this.state = {
				editedMappings: [],
			}
		}
		isItemEdited = (layerId: string) => {
			return this.state.editedMappings.indexOf(layerId) >= 0
		}
		finishEditItem = (layerId: string) => {
			const index = this.state.editedMappings.indexOf(layerId)
			if (index >= 0) {
				this.state.editedMappings.splice(index, 1)
				this.setState({
					editedMappings: this.state.editedMappings,
				})
			}
		}
		editItem = (layerId: string) => {
			if (this.state.editedMappings.indexOf(layerId) < 0) {
				this.state.editedMappings.push(layerId)
				this.setState({
					editedMappings: this.state.editedMappings,
				})
			} else {
				this.finishEditItem(layerId)
			}
		}
		confirmRemove = (mappingId: string) => {
			const { t } = this.props
			doModalDialog({
				title: t('Remove this mapping?'),
				yes: t('Remove'),
				no: t('Cancel'),
				onAccept: () => {
					this.removeLayer(mappingId)
				},
				message: (
					<React.Fragment>
						<p>{t('Are you sure you want to remove mapping for layer "{{mappingId}}"?', { mappingId: mappingId })}</p>
						<p>{t('Please note: This action is irreversible!')}</p>
					</React.Fragment>
				),
			})
		}
		removeLayer = (mappingId: string) => {
			const unsetObject = {}
			unsetObject['mappings.' + mappingId] = ''
			Studios.update(this.props.studio._id, {
				$unset: unsetObject,
			})
		}
		addNewLayer = () => {
			// find free key name
			const newLayerKeyName = 'newLayer'
			let iter = 0
			while ((this.props.studio.mappings || {})[newLayerKeyName + iter.toString()]) {
				iter++
			}
			const setObject = {}
			setObject['mappings.' + newLayerKeyName + iter.toString()] = {
				device: TSR.DeviceType.CASPARCG,
				deviceId: 'newDeviceId',
			}

			Studios.update(this.props.studio._id, {
				$set: setObject,
			})
		}
		updateLayerId = (edit: EditAttributeBase, newValue: string) => {
			const oldLayerId = edit.props.overrideDisplayValue
			const newLayerId = newValue + ''
			const layer = this.props.studio.mappings[oldLayerId]

			if (this.props.studio.mappings[newLayerId]) {
				throw new Meteor.Error(400, 'Layer "' + newLayerId + '" already exists')
			}

			const mSet = {}
			const mUnset = {}
			mSet['mappings.' + newLayerId] = layer
			mUnset['mappings.' + oldLayerId] = 1

			if (edit.props.collection) {
				edit.props.collection.update(this.props.studio._id, {
					$set: mSet,
					$unset: mUnset,
				})
			}

			this.finishEditItem(oldLayerId)
			this.editItem(newLayerId)
		}

		renderSummary(manifest: MappingsManifest, mapping: MappingExt) {
			const m = manifest[mapping.device]
			if (m) {
				return (
					<span>
						{m
							.filter((entry) => entry.includeInSummary)
							.map((entry) => {
								const summary = entry.name + ': '

								let mappingValue = entry.values && entry.values[mapping[entry.id]]
								if (!mappingValue) {
									mappingValue = mapping[entry.id]
								}

								if (entry.type === ConfigManifestEntryType.INT && entry.zeroBased && _.isNumber(mappingValue)) {
									mappingValue += 1
								}

								return summary + mappingValue
							})
							.join(' - ')}
					</span>
				)
			} else {
				return <span>-</span>
			}
		}

		renderMappings(manifest: MappingsManifest) {
			const { t } = this.props

			const activeRoutes = getActiveRoutes(this.props.studio)

			return _.map(this.props.studio.mappings, (mapping: MappingExt, layerId: string) => {
				return (
					<React.Fragment key={layerId}>
						<tr
							className={ClassNames({
								hl: this.isItemEdited(layerId),
							})}
						>
							<th className="settings-studio-device__name c3 notifications-s notifications-text">
								{mapping.layerName || layerId}
								{activeRoutes.existing[layerId] !== undefined ? (
									<Tooltip
										overlay={t('This layer is now rerouted by an active Route Set: {{routeSets}}', {
											routeSets: activeRoutes.existing[layerId].map((s) => s.outputMappedLayer).join(', '),
											count: activeRoutes.existing[layerId].length,
										})}
										placement="right"
									>
										<span className="notification">{activeRoutes.existing[layerId].length}</span>
									</Tooltip>
								) : null}
							</th>
							<td className="settings-studio-device__id c2">{TSR.DeviceType[mapping.device]}</td>
							<td className="settings-studio-device__id c2">{mapping.deviceId}</td>
							<td className="settings-studio-device__id c4">{this.renderSummary(manifest, mapping)}</td>

							<td className="settings-studio-device__actions table-item-actions c3">
								<button className="action-btn" onClick={() => this.editItem(layerId)}>
									<FontAwesomeIcon icon={faPencilAlt} />
								</button>
								<button className="action-btn" onClick={() => this.confirmRemove(layerId)}>
									<FontAwesomeIcon icon={faTrash} />
								</button>
							</td>
						</tr>
						{this.isItemEdited(layerId) && (
							<tr className="expando-details hl">
								<td colSpan={5}>
									<div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Layer ID')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={'mappings'}
													overrideDisplayValue={layerId}
													obj={this.props.studio}
													type="text"
													collection={Studios}
													updateFunction={this.updateLayerId}
													className="input text-input input-l"
												></EditAttribute>
												<span className="text-s dimmed">{t('ID of the timeline-layer to map to some output')}</span>
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Layer Name')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={'mappings.' + layerId + '.layerName'}
													obj={this.props.studio}
													type="text"
													collection={Studios}
													className="input text-input input-l"
												></EditAttribute>
												<span className="text-s dimmed">{t('Human-readable name of the layer')}</span>
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Device Type')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={'mappings.' + layerId + '.device'}
													obj={this.props.studio}
													type="dropdown"
													options={TSR.DeviceType}
													optionsAreNumbers={true}
													collection={Studios}
													className="input text-input input-l"
												></EditAttribute>
												<span className="text-s dimmed">{t('The type of device to use for the output')}</span>
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Device ID')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={'mappings.' + layerId + '.deviceId'}
													obj={this.props.studio}
													type="text"
													collection={Studios}
													className="input text-input input-l"
												></EditAttribute>
												<span className="text-s dimmed">
													{t('ID of the device (corresponds to the device ID in the peripheralDevice settings)')}
												</span>
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Lookahead Mode')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={'mappings.' + layerId + '.lookahead'}
													obj={this.props.studio}
													type="dropdown"
													options={LookaheadMode}
													optionsAreNumbers={true}
													collection={Studios}
													className="input text-input input-l"
												></EditAttribute>
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Lookahead Target Objects (Default = 1)')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={'mappings.' + layerId + '.lookaheadDepth'}
													obj={this.props.studio}
													type="int"
													collection={Studios}
													className="input text-input input-l"
												></EditAttribute>
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Lookahead Maximum Search Distance (Default = {{limit}})', {
													limit: LOOKAHEAD_DEFAULT_SEARCH_DISTANCE,
												})}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={'mappings.' + layerId + '.lookaheadMaxSearchDistance'}
													obj={this.props.studio}
													type="int"
													collection={Studios}
													className="input text-input input-l"
												></EditAttribute>
											</label>
										</div>
										<DeviceMappingSettings
											mapping={mapping}
											studio={this.props.studio}
											attribute={'mappings.' + layerId}
											manifest={manifest}
										/>
									</div>
									<div className="mod alright">
										<button className={ClassNames('btn btn-primary')} onClick={() => this.finishEditItem(layerId)}>
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
					<h2 className="mhn">{t('Layer Mappings')}</h2>
					{!this.props.manifest && (
						<span>{t('Add a playout device to the studio in order to edit the layer mappings')}</span>
					)}
					{this.props.manifest && (
						<React.Fragment>
							<table className="expando settings-studio-mappings-table">
								<tbody>{this.renderMappings(this.props.manifest)}</tbody>
							</table>
							<div className="mod mhs">
								<button className="btn btn-primary" onClick={() => this.addNewLayer()}>
									<FontAwesomeIcon icon={faPlus} />
								</button>
							</div>
						</React.Fragment>
					)}
				</div>
			)
		}
	}
)

interface IStudioRoutingsProps {
	studio: Studio
	manifest?: MappingsManifest
}
interface IStudioRoutingsState {
	editedItems: Array<string>
}

const StudioRoutings = withTranslation()(
	class StudioRoutings extends React.Component<Translated<IStudioRoutingsProps>, IStudioRoutingsState> {
		constructor(props: Translated<IStudioRoutingsProps>) {
			super(props)

			this.state = {
				editedItems: [],
			}
		}
		isItemEdited = (routeSetId: string) => {
			return this.state.editedItems.indexOf(routeSetId) >= 0
		}
		finishEditItem = (routeSetId: string) => {
			const index = this.state.editedItems.indexOf(routeSetId)
			if (index >= 0) {
				this.state.editedItems.splice(index, 1)
				this.setState({
					editedItems: this.state.editedItems,
				})
			}
		}
		editItem = (routeSetId: string) => {
			if (this.state.editedItems.indexOf(routeSetId) < 0) {
				this.state.editedItems.push(routeSetId)
				this.setState({
					editedItems: this.state.editedItems,
				})
			} else {
				this.finishEditItem(routeSetId)
			}
		}
		confirmRemoveEGroup = (eGroupId: string, exclusivityGroup: StudioRouteSetExclusivityGroup) => {
			const { t } = this.props
			doModalDialog({
				title: t('Remove this Exclusivity Group?'),
				yes: t('Remove'),
				no: t('Cancel'),
				onAccept: () => {
					this.removeExclusivityGroup(eGroupId)
				},
				message: (
					<React.Fragment>
						<p>
							{t(
								'Are you sure you want to remove exclusivity group "{{eGroupName}}"?\nRoute Sets assigned to this group will be reset to no group.',
								{
									eGroupName: exclusivityGroup.name,
								}
							)}
						</p>
						<p>{t('Please note: This action is irreversible!')}</p>
					</React.Fragment>
				),
			})
		}
		confirmRemoveRoute = (routeSetId: string, route: RouteMapping, index: number) => {
			const { t } = this.props
			doModalDialog({
				title: t('Remove this Route from this Route Set?'),
				yes: t('Remove'),
				no: t('Cancel'),
				onAccept: () => {
					this.removeRouteSetRoute(routeSetId, index)
				},
				message: (
					<React.Fragment>
						<p>
							{t('Are you sure you want to remove the Route from "{{sourceLayerId}}" to "{{newLayerId}}"?', {
								sourceLayerId: route.mappedLayer,
								newLayerId: route.outputMappedLayer,
							})}
						</p>
						<p>{t('Please note: This action is irreversible!')}</p>
					</React.Fragment>
				),
			})
		}
		confirmRemove = (routeSetId: string) => {
			const { t } = this.props
			doModalDialog({
				title: t('Remove this Route Set?'),
				yes: t('Remove'),
				no: t('Cancel'),
				onAccept: () => {
					this.removeRouteSet(routeSetId)
				},
				message: (
					<React.Fragment>
						<p>{t('Are you sure you want to remove the Route Set "{{routeId}}"?', { routeId: routeSetId })}</p>
						<p>{t('Please note: This action is irreversible!')}</p>
					</React.Fragment>
				),
			})
		}
		removeExclusivityGroup = (eGroupId: string) => {
			const unsetObject = {}
			_.forEach(this.props.studio.routeSets, (routeSet, routeSetId) => {
				if (routeSet.exclusivityGroup === eGroupId) {
					unsetObject['routeSets.' + routeSetId + '.exclusivityGroup'] = 1
				}
			})
			unsetObject['routeSetExclusivityGroups.' + eGroupId] = ''
			Studios.update(this.props.studio._id, {
				$unset: unsetObject,
			})
		}
		removeRouteSetRoute = (routeId: string, index: number) => {
			const unsetObject = {}
			const newRoutes = this.props.studio.routeSets[routeId].routes.slice()
			newRoutes.splice(index, 1)
			unsetObject['routeSets.' + routeId + '.routes'] = newRoutes
			Studios.update(this.props.studio._id, {
				$set: unsetObject,
			})
		}
		removeRouteSet = (routeId: string) => {
			const unsetObject = {}
			unsetObject['routeSets.' + routeId] = ''
			Studios.update(this.props.studio._id, {
				$unset: unsetObject,
			})
		}
		addNewRouteInSet = (routeId: string) => {
			const newRouteKeyName = 'newRouteSet'
			let iter: number = 0
			while ((this.props.studio.routeSets || {})[newRouteKeyName + iter]) {
				iter++
			}

			const newRoute: RouteMapping = {
				mappedLayer: '',
				outputMappedLayer: '',
				remapping: {},
			}
			const setObject = {}
			setObject['routeSets.' + routeId + '.routes'] = newRoute

			Studios.update(this.props.studio._id, {
				$push: setObject,
			})
		}
		addNewRouteSet = () => {
			// find free key name
			const newRouteKeyName = 'newRouteSet'
			let iter: number = 0
			while ((this.props.studio.routeSets || {})[newRouteKeyName + iter]) {
				iter++
			}

			const newRoute: StudioRouteSet = {
				name: 'New Route Set',
				active: false,
				routes: [],
				behavior: StudioRouteBehavior.TOGGLE,
			}
			const setObject: Partial<DBStudio> = {}
			setObject['routeSets.' + newRouteKeyName + iter] = newRoute

			Studios.update(this.props.studio._id, {
				$set: setObject,
			})
		}
		addNewExclusivityGroup = () => {
			const newEGroupKeyName = 'exclusivityGroup'
			let iter: number = 0
			while ((this.props.studio.routeSetExclusivityGroups || {})[newEGroupKeyName + iter]) {
				iter++
			}

			const newGroup: StudioRouteSetExclusivityGroup = {
				name: 'New Exclusivity Group',
			}
			const setObject: Partial<DBStudio> = {}
			setObject['routeSetExclusivityGroups.' + newEGroupKeyName + iter] = newGroup

			Studios.update(this.props.studio._id, {
				$set: setObject,
			})
		}
		updateRouteSetId = (edit: EditAttributeBase, newValue: string) => {
			const oldRouteId = edit.props.overrideDisplayValue
			const newRouteId = newValue + ''
			const route = this.props.studio.routeSets[oldRouteId]

			if (this.props.studio.routeSets[newRouteId]) {
				throw new Meteor.Error(400, 'Route Set "' + newRouteId + '" already exists')
			}

			const mSet = {}
			const mUnset = {}
			mSet['routeSets.' + newRouteId] = route
			mUnset['routeSets.' + oldRouteId] = 1

			if (edit.props.collection) {
				edit.props.collection.update(this.props.studio._id, {
					$set: mSet,
					$unset: mUnset,
				})
			}

			this.finishEditItem(oldRouteId)
			this.editItem(newRouteId)
		}
		updateExclusivityGroupId = (edit: EditAttributeBase, newValue: string) => {
			const oldRouteId = edit.props.overrideDisplayValue
			const newRouteId = newValue + ''
			const route = this.props.studio.routeSetExclusivityGroups[oldRouteId]

			if (this.props.studio.routeSetExclusivityGroups[newRouteId]) {
				throw new Meteor.Error(400, 'Exclusivity Group "' + newRouteId + '" already exists')
			}

			const mSet = {}
			const mUnset = {}
			mSet['routeSetExclusivityGroups.' + newRouteId] = route
			mUnset['routeSetExclusivityGroups.' + oldRouteId] = 1

			if (edit.props.collection) {
				edit.props.collection.update(this.props.studio._id, {
					$set: mSet,
					$unset: mUnset,
				})
			}

			this.finishEditItem(oldRouteId)
			this.editItem(newRouteId)
		}
		updateRouteSetActive = (routeSetId: string, value: boolean) => {
			const { t } = this.props
			doUserAction(t, 'StudioSettings', UserAction.SWITCH_ROUTE_SET, (e) =>
				MeteorCall.userAction.switchRouteSet(e, this.props.studio._id, routeSetId, value)
			)
		}

		renderRoutes(routeSet: StudioRouteSet, routeSetId: string, manifest: MappingsManifest) {
			const { t } = this.props

			return (
				<React.Fragment>
					<h4 className="mod mhs">{t('Routes')}</h4>
					{routeSet.routes.length === 0 ? (
						<p className="text-s dimmed mhs">{t('There are no routes set up yet')}</p>
					) : null}
					{routeSet.routes.map((route, index) => {
						const deviceTypeFromMappedLayer: TSR.DeviceType | undefined = route.mappedLayer
							? this.props.studio.mappings[route.mappedLayer]?.device
							: undefined
						const routeDeviceType: TSR.DeviceType | undefined = route.mappedLayer
							? deviceTypeFromMappedLayer
							: route.deviceType
						return (
							<div className="route-sets-editor mod pan mas" key={index}>
								<button
									className="action-btn right mod man pas"
									onClick={() => this.confirmRemoveRoute(routeSetId, route, index)}
								>
									<FontAwesomeIcon icon={faTrash} />
								</button>
								<div>
									<div className="mod mvs mhs">
										<label className="field">
											{t('Original Layer')}
											<EditAttribute
												modifiedClassName="bghl"
												attribute={`routeSets.${routeSetId}.routes.${index}.mappedLayer`}
												obj={this.props.studio}
												type="dropdowntext"
												options={Object.keys(this.props.studio.mappings)}
												label={t('None')}
												collection={Studios}
												className="input text-input input-l"
											></EditAttribute>
										</label>
									</div>
									<div className="mod mvs mhs">
										<label className="field">
											{t('New Layer')}
											<EditAttribute
												modifiedClassName="bghl"
												attribute={`routeSets.${routeSetId}.routes.${index}.outputMappedLayer`}
												obj={this.props.studio}
												type="text"
												collection={Studios}
												className="input text-input input-l"
											></EditAttribute>
										</label>
									</div>
									<div className="mod mvs mhs">
										{t('Device Type')}
										{route.mappedLayer ? (
											deviceTypeFromMappedLayer !== undefined ? (
												<span className="mls">{TSR.DeviceType[deviceTypeFromMappedLayer]}</span>
											) : (
												<span className="mls dimmed">{t('Source Layer not found')}</span>
											)
										) : (
											<EditAttribute
												modifiedClassName="bghl"
												attribute={`routeSets.${routeSetId}.routes.${index}.deviceType`}
												obj={this.props.studio}
												type="dropdown"
												options={TSR.DeviceType}
												optionsAreNumbers={true}
												collection={Studios}
												className="input text-input input-l"
											></EditAttribute>
										)}
									</div>
									{routeDeviceType !== undefined && route.remapping !== undefined ? (
										<>
											<div className="mod mvs mhs">
												<label className="field">
													{t('Device ID')}
													<EditAttribute
														modifiedClassName="bghl"
														attribute={`routeSets.${routeSetId}.routes.${index}.remapping.deviceId`}
														obj={this.props.studio}
														type="checkbox"
														collection={Studios}
														className="mod mvn mhs"
														mutateDisplayValue={(v) => (v === undefined ? false : true)}
														mutateUpdateValue={() => undefined}
													/>
													<EditAttribute
														modifiedClassName="bghl"
														attribute={`routeSets.${routeSetId}.routes.${index}.remapping.deviceId`}
														obj={this.props.studio}
														type="text"
														collection={Studios}
														className="input text-input input-l"
													></EditAttribute>
												</label>
											</div>
											<DeviceMappingSettings
												mapping={
													{
														device: routeDeviceType,
														...route.remapping,
													} as MappingExt
												}
												studio={this.props.studio}
												attribute={`routeSets.${routeSetId}.routes.${index}.remapping`}
												showOptional={true}
												manifest={manifest}
											/>
										</>
									) : null}
								</div>
							</div>
						)
					})}
				</React.Fragment>
			)
		}

		renderExclusivityGroups() {
			const { t } = this.props

			if (Object.keys(this.props.studio.routeSetExclusivityGroups).length === 0) {
				return (
					<tr>
						<td className="mhn dimmed">{t('There are no exclusivity groups set up.')}</td>
					</tr>
				)
			}

			return _.map(
				this.props.studio.routeSetExclusivityGroups,
				(exclusivityGroup: StudioRouteSetExclusivityGroup, exclusivityGroupId: string) => {
					return (
						<React.Fragment key={exclusivityGroupId}>
							<tr
								className={ClassNames({
									hl: this.isItemEdited(exclusivityGroupId),
								})}
							>
								<th className="settings-studio-device__name c3">{exclusivityGroupId}</th>
								<td className="settings-studio-device__id c5">{exclusivityGroup.name}</td>
								<td className="settings-studio-device__id c3">
									{
										_.filter(
											this.props.studio.routeSets,
											(routeSet) => routeSet.exclusivityGroup === exclusivityGroupId
										).length
									}
								</td>

								<td className="settings-studio-device__actions table-item-actions c3">
									<button className="action-btn" onClick={() => this.editItem(exclusivityGroupId)}>
										<FontAwesomeIcon icon={faPencilAlt} />
									</button>
									<button
										className="action-btn"
										onClick={() => this.confirmRemoveEGroup(exclusivityGroupId, exclusivityGroup)}
									>
										<FontAwesomeIcon icon={faTrash} />
									</button>
								</td>
							</tr>
							{this.isItemEdited(exclusivityGroupId) && (
								<tr className="expando-details hl">
									<td colSpan={6}>
										<div>
											<div className="mod mvs mhs">
												<label className="field">
													{t('Exclusivity Group ID')}
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'routeSetExclusivityGroups'}
														overrideDisplayValue={exclusivityGroupId}
														obj={this.props.studio}
														type="text"
														collection={Studios}
														updateFunction={this.updateExclusivityGroupId}
														className="input text-input input-l"
													></EditAttribute>
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													{t('Exclusivity Group Name')}
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'routeSetExclusivityGroups.' + exclusivityGroupId + '.name'}
														obj={this.props.studio}
														type="text"
														collection={Studios}
														className="input text-input input-l"
													></EditAttribute>
													<span className="text-s dimmed">{t('Display name of the Exclusivity Group')}</span>
												</label>
											</div>
										</div>
										<div className="mod alright">
											<button className="btn btn-primary" onClick={() => this.finishEditItem(exclusivityGroupId)}>
												<FontAwesomeIcon icon={faCheck} />
											</button>
										</div>
									</td>
								</tr>
							)}
						</React.Fragment>
					)
				}
			)
		}

		renderRouteSets(manifest: MappingsManifest) {
			const { t } = this.props

			const DEFAULT_ACTIVE_OPTIONS = {
				[t('Active')]: true,
				[t('Not Active')]: false,
				[t('Not defined')]: undefined,
			}

			if (Object.keys(this.props.studio.routeSets).length === 0) {
				return (
					<tr>
						<td className="mhn dimmed">{t('There are no Route Sets set up.')}</td>
					</tr>
				)
			}

			return _.map(this.props.studio.routeSets, (routeSet: StudioRouteSet, routeId: string) => {
				return (
					<React.Fragment key={routeId}>
						<tr
							className={ClassNames({
								hl: this.isItemEdited(routeId),
							})}
						>
							<th className="settings-studio-device__name c2">{routeId}</th>
							<td className="settings-studio-device__id c3">{routeSet.name}</td>
							<td className="settings-studio-device__id c4">{routeSet.exclusivityGroup}</td>
							<td className="settings-studio-device__id c2">{routeSet.routes.length}</td>
							<td className="settings-studio-device__id c2">
								{routeSet.active ? <span className="pill">{t('Active')}</span> : null}
							</td>

							<td className="settings-studio-device__actions table-item-actions c3">
								<button className="action-btn" onClick={() => this.editItem(routeId)}>
									<FontAwesomeIcon icon={faPencilAlt} />
								</button>
								<button className="action-btn" onClick={() => this.confirmRemove(routeId)}>
									<FontAwesomeIcon icon={faTrash} />
								</button>
							</td>
						</tr>
						{this.isItemEdited(routeId) && (
							<tr className="expando-details hl">
								<td colSpan={6}>
									<div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Route Set ID')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={'routeSets'}
													overrideDisplayValue={routeId}
													obj={this.props.studio}
													type="text"
													collection={Studios}
													updateFunction={this.updateRouteSetId}
													className="input text-input input-l"
												></EditAttribute>
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												<EditAttribute
													modifiedClassName="bghl"
													attribute={`routeSets.${routeId}.active`}
													obj={this.props.studio}
													type="checkbox"
													collection={Studios}
													updateFunction={(_ctx, value) => this.updateRouteSetActive(routeId, value)}
													disabled={routeSet.behavior === StudioRouteBehavior.ACTIVATE_ONLY && routeSet.active}
													className=""
												></EditAttribute>
												{t('Active')}
												<span className="mlm text-s dimmed">{t('Is this Route Set currently active')}</span>
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Default State')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={`routeSets.${routeId}.defaultActive`}
													obj={this.props.studio}
													type="dropdown"
													collection={Studios}
													options={DEFAULT_ACTIVE_OPTIONS}
													className="input text-input input-l"
												></EditAttribute>
												<span className="mlm text-s dimmed">{t('The default state of this Route Set')}</span>
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Route Set Name')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={`routeSets.${routeId}.name`}
													obj={this.props.studio}
													type="text"
													collection={Studios}
													className="input text-input input-l"
												></EditAttribute>
												<span className="text-s dimmed">{t('Display name of the Route Set')}</span>
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Exclusivity group')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={`routeSets.${routeId}.exclusivityGroup`}
													obj={this.props.studio}
													type="checkbox"
													collection={Studios}
													className="mod mas"
													mutateDisplayValue={(v) => (v === undefined ? false : true)}
													mutateUpdateValue={() => undefined}
												/>
												<EditAttribute
													modifiedClassName="bghl"
													attribute={`routeSets.${routeId}.exclusivityGroup`}
													obj={this.props.studio}
													type="dropdown"
													options={Object.keys(this.props.studio.routeSetExclusivityGroups)}
													mutateDisplayValue={(v) => (v === undefined ? 'None' : v)}
													collection={Studios}
													className="input text-input input-l"
												></EditAttribute>
												<span className="text-s dimmed">
													{t('If set, only one Route Set will be active per exclusivity group')}
												</span>
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Behavior')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={`routeSets.${routeId}.behavior`}
													obj={this.props.studio}
													type="dropdown"
													options={StudioRouteBehavior}
													optionsAreNumbers={true}
													collection={Studios}
													className="input text-input input-l"
												></EditAttribute>
												<span className="text-s dimmed">
													{t('The way this Route Set should behave towards the user')}
												</span>
											</label>
										</div>
									</div>
									{this.renderRoutes(routeSet, routeId, manifest)}
									<div className="mod">
										<button className="btn btn-primary right" onClick={() => this.finishEditItem(routeId)}>
											<FontAwesomeIcon icon={faCheck} />
										</button>
										<button className="btn btn-secondary" onClick={() => this.addNewRouteInSet(routeId)}>
											<FontAwesomeIcon icon={faPlus} />
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
					<h2 className="mhn mbs">{t('Route Sets')}</h2>
					{!this.props.manifest && (
						<span>{t('Add a playout device to the studio in order to configure the route sets')}</span>
					)}
					{this.props.manifest && (
						<React.Fragment>
							<p className="mhn mvs text-s dimmed">
								{t(
									'Controls for exposed Route Sets will be displayed to the producer within the Rundown View in the Switchboard.'
								)}
							</p>
							<h3 className="mhn">{t('Exclusivity Groups')}</h3>
							<table className="expando settings-studio-mappings-table">
								<tbody>{this.renderExclusivityGroups()}</tbody>
							</table>
							<div className="mod mhs">
								<button className="btn btn-primary" onClick={() => this.addNewExclusivityGroup()}>
									<FontAwesomeIcon icon={faPlus} />
								</button>
							</div>
							<h3 className="mhn">{t('Route Sets')}</h3>
							<table className="expando settings-studio-mappings-table">
								<tbody>{this.renderRouteSets(this.props.manifest)}</tbody>
							</table>
							<div className="mod mhs">
								<button className="btn btn-primary" onClick={() => this.addNewRouteSet()}>
									<FontAwesomeIcon icon={faPlus} />
								</button>
							</div>
						</React.Fragment>
					)}
				</div>
			)
		}
	}
)
interface IStudioPackageManagerSettingsProps {
	studio: Studio
}
interface IStudioPackageManagerSettingsState {
	editedPackageContainer: Array<string>
	editedAccessors: Array<string>
}

const StudioPackageManagerSettings = withTranslation()(
	class StudioPackageManagerSettings extends React.Component<
		Translated<IStudioPackageManagerSettingsProps>,
		IStudioPackageManagerSettingsState
	> {
		constructor(props: Translated<IStudioPackageManagerSettingsProps>) {
			super(props)

			this.state = {
				editedPackageContainer: [],
				editedAccessors: [],
			}
		}
		isPackageContainerEdited = (containerId: string) => {
			return this.state.editedPackageContainer.indexOf(containerId) >= 0
		}
		finishEditPackageContainer = (containerId: string) => {
			const index = this.state.editedPackageContainer.indexOf(containerId)
			if (index >= 0) {
				this.state.editedPackageContainer.splice(index, 1)
				this.setState({
					editedPackageContainer: this.state.editedPackageContainer,
				})
			}
		}
		editPackageContainer = (containerId: string) => {
			if (this.state.editedPackageContainer.indexOf(containerId) < 0) {
				this.state.editedPackageContainer.push(containerId)
				this.setState({
					editedPackageContainer: this.state.editedPackageContainer,
				})
			} else {
				this.finishEditPackageContainer(containerId)
			}
		}
		confirmRemovePackageContainer = (containerId: string) => {
			const { t } = this.props
			doModalDialog({
				title: t('Remove this Package Container?'),
				yes: t('Remove'),
				no: t('Cancel'),
				onAccept: () => {
					this.removePackageContainer(containerId)
				},
				message: (
					<React.Fragment>
						<p>
							{t('Are you sure you want to remove the Package Container "{{containerId}}"?', {
								containerId: containerId,
							})}
						</p>
						<p>{t('Please note: This action is irreversible!')}</p>
					</React.Fragment>
				),
			})
		}
		removePackageContainer = (containerId: string) => {
			const unsetObject = {}
			unsetObject['packageContainers.' + containerId] = ''
			Studios.update(this.props.studio._id, {
				$unset: unsetObject,
			})
		}
		addNewPackageContainer = () => {
			// find free key name
			const newKeyName = 'newContainer'
			let iter: number = 0
			while ((this.props.studio.packageContainers || {})[newKeyName + iter]) {
				iter++
			}

			const newPackageContainer: StudioPackageContainer = {
				deviceIds: [],
				container: {
					label: 'New Package Container',
					accessors: {},
				},
			}
			const setObject: Partial<DBStudio> = {}
			setObject['packageContainers.' + newKeyName + iter] = newPackageContainer

			Studios.update(this.props.studio._id, {
				$set: setObject,
			})
		}
		containerId = (edit: EditAttributeBase, newValue: string) => {
			const oldContainerId = edit.props.overrideDisplayValue
			const newContainerId = newValue + ''
			const packageContainer = this.props.studio.packageContainers[oldContainerId]

			if (this.props.studio.packageContainers[newContainerId]) {
				throw new Meteor.Error(400, 'PackageContainer "' + newContainerId + '" already exists')
			}

			const mSet = {}
			const mUnset = {}
			mSet['packageContainers.' + newContainerId] = packageContainer
			mUnset['packageContainers.' + oldContainerId] = 1

			if (edit.props.collection) {
				edit.props.collection.update(this.props.studio._id, {
					$set: mSet,
					$unset: mUnset,
				})
			}

			this.finishEditPackageContainer(oldContainerId)
			this.editPackageContainer(newContainerId)
		}
		getPlayoutDeviceIds() {
			const deviceIds: {
				name: string
				value: string
			}[] = []

			PeripheralDevices.find().forEach((device) => {
				if (
					device.category === PeripheralDeviceAPI.DeviceCategory.PLAYOUT &&
					device.type === PeripheralDeviceAPI.DeviceType.PLAYOUT &&
					device.settings
				) {
					const settings = device.settings as PlayoutDeviceSettings

					for (const deviceId of Object.keys(settings.devices || {})) {
						deviceIds.push({
							name: deviceId,
							value: deviceId,
						})
					}
				}
			})
			return deviceIds
		}
		renderPackageContainers() {
			const { t } = this.props

			if (Object.keys(this.props.studio.packageContainers).length === 0) {
				return (
					<tr>
						<td className="mhn dimmed">{t('There are no Package Containers set up.')}</td>
					</tr>
				)
			}

			return _.map(
				this.props.studio.packageContainers,
				(packageContainer: StudioPackageContainer, containerId: string) => {
					return (
						<React.Fragment key={containerId}>
							<tr
								className={ClassNames({
									hl: this.isPackageContainerEdited(containerId),
								})}
							>
								<th className="settings-studio-package-container__id c2">{containerId}</th>
								<td className="settings-studio-package-container__name c2">{packageContainer.container.label}</td>

								<td className="settings-studio-package-container__actions table-item-actions c3">
									<button className="action-btn" onClick={() => this.editPackageContainer(containerId)}>
										<FontAwesomeIcon icon={faPencilAlt} />
									</button>
									<button className="action-btn" onClick={() => this.confirmRemovePackageContainer(containerId)}>
										<FontAwesomeIcon icon={faTrash} />
									</button>
								</td>
							</tr>
							{this.isPackageContainerEdited(containerId) && (
								<tr className="expando-details hl">
									<td colSpan={6}>
										<div>
											<div className="mod mvs mhs">
												<label className="field">
													{t('Package Container ID')}
													<EditAttribute
														modifiedClassName="bghl"
														attribute={'packageContainers'}
														overrideDisplayValue={containerId}
														obj={this.props.studio}
														type="text"
														collection={Studios}
														updateFunction={this.containerId}
														className="input text-input input-l"
													></EditAttribute>
												</label>
											</div>
											<div className="mod mvs mhs">
												<label className="field">
													{t('Label')}
													<EditAttribute
														modifiedClassName="bghl"
														attribute={`packageContainers.${containerId}.container.label`}
														obj={this.props.studio}
														type="text"
														collection={Studios}
														className="input text-input input-l"
													></EditAttribute>
													<span className="text-s dimmed">{t('Display name/label of the Package Container')}</span>
												</label>
											</div>
											<div className="mod mvs mhs">
												<div className="field">
													<label>{t('Playout devices which uses this package container')}</label>
													<EditAttribute
														attribute={`packageContainers.${containerId}.deviceIds`}
														obj={this.props.studio}
														options={this.getPlayoutDeviceIds()}
														label={t('Select playout devices')}
														type="multiselect"
														collection={Studios}
													></EditAttribute>
													<span className="text-s dimmed">
														{t('Select which playout devices are using this package container')}
													</span>
												</div>
											</div>

											<div className="mdi"></div>
										</div>
										<div>
											<div className="settings-studio-accessors">
												<h3 className="mhn">{t('Accessors')}</h3>
												<table className="expando settings-studio-package-containers-accessors-table">
													<tbody>{this.renderAccessors(containerId, packageContainer)}</tbody>
												</table>
												<div className="mod mhs">
													<button className="btn btn-primary" onClick={() => this.addNewAccessor(containerId)}>
														<FontAwesomeIcon icon={faPlus} />
													</button>
												</div>
											</div>
										</div>
									</td>
								</tr>
							)}
						</React.Fragment>
					)
				}
			)
		}
		isAccessorEdited = (containerId: string, accessorId: string) => {
			return this.state.editedAccessors.indexOf(containerId + accessorId) >= 0
		}
		finishEditAccessor = (containerId: string, accessorId: string) => {
			const index = this.state.editedAccessors.indexOf(containerId + accessorId)
			if (index >= 0) {
				this.state.editedAccessors.splice(index, 1)
				this.setState({
					editedAccessors: this.state.editedAccessors,
				})
			}
		}
		editAccessor = (containerId: string, accessorId: string) => {
			if (this.state.editedAccessors.indexOf(containerId + accessorId) < 0) {
				this.state.editedAccessors.push(containerId + accessorId)
				this.setState({
					editedAccessors: this.state.editedAccessors,
				})
			} else {
				this.finishEditAccessor(containerId, accessorId)
			}
		}
		confirmRemoveAccessor = (containerId: string, accessorId: string) => {
			const { t } = this.props
			doModalDialog({
				title: t('Remove this Package Container Accessor?'),
				yes: t('Remove'),
				no: t('Cancel'),
				onAccept: () => {
					this.removeAccessor(containerId, accessorId)
				},
				message: (
					<React.Fragment>
						<p>
							{t('Are you sure you want to remove the Package Container Accessor "{{accessorId}}"?', {
								accessorId: accessorId,
							})}
						</p>
						<p>{t('Please note: This action is irreversible!')}</p>
					</React.Fragment>
				),
			})
		}
		removeAccessor = (containerId: string, accessorId: string) => {
			const unsetObject = {}
			unsetObject[`packageContainers.${containerId}.container.accessors.${accessorId}`] = ''
			Studios.update(this.props.studio._id, {
				$unset: unsetObject,
			})
		}
		addNewAccessor = (containerId: string) => {
			// find free key name
			const newKeyName = 'local'
			let iter: number = 0
			const packageContainer = this.props.studio.packageContainers[containerId]
			if (!packageContainer) throw new Error(`Can't add an accessor to nonexistant Package Container "${containerId}"`)

			while (packageContainer.container.accessors[newKeyName + iter]) {
				iter++
			}
			const accessorId = newKeyName + iter

			const newAccessor: Accessor.LocalFolder = {
				type: Accessor.AccessType.LOCAL_FOLDER,
				label: 'Local folder',
				allowRead: true,
				allowWrite: false,
				folderPath: '',
			}
			const setObject: Partial<DBStudio> = {}
			setObject[`packageContainers.${containerId}.container.accessors.${accessorId}`] = newAccessor

			Studios.update(this.props.studio._id, {
				$set: setObject,
			})
		}
		updateAccessorId = (edit: EditAttributeBase, newValue: string) => {
			const oldAccessorId = edit.props.overrideDisplayValue
			const newAccessorId = newValue + ''
			const containerId = edit.props.attribute
			if (!containerId) throw new Error(`containerId not set`)
			const packageContainer = this.props.studio.packageContainers[containerId]
			if (!packageContainer) throw new Error(`Can't edit an accessor to nonexistant Package Container "${containerId}"`)

			const accessor = this.props.studio.packageContainers[containerId].container.accessors[oldAccessorId]

			if (this.props.studio.packageContainers[containerId].container.accessors[newAccessorId]) {
				throw new Meteor.Error(400, 'Accessor "' + newAccessorId + '" already exists')
			}

			const mSet = {}
			const mUnset = {}
			mSet[`packageContainers.${containerId}.container.accessors.${newAccessorId}`] = accessor
			mUnset[`packageContainers.${containerId}.container.accessors.${oldAccessorId}`] = 1

			if (edit.props.collection) {
				edit.props.collection.update(this.props.studio._id, {
					$set: mSet,
					$unset: mUnset,
				})
			}

			this.finishEditAccessor(containerId, oldAccessorId)
			this.editAccessor(containerId, newAccessorId)
		}

		renderAccessors(containerId: string, packageContainer: StudioPackageContainer) {
			const { t } = this.props

			if (Object.keys(this.props.studio.packageContainers).length === 0) {
				return (
					<tr>
						<td className="mhn dimmed">{t('There are no Accessors set up.')}</td>
					</tr>
				)
			}

			return _.map(packageContainer.container.accessors, (accessor: Accessor.Any, accessorId: string) => {
				const accessorContent: string[] = []
				_.each(accessor as any, (value, key: string) => {
					if (key !== 'type' && value !== '') {
						let str = JSON.stringify(value)
						if (str.length > 20) str = str.slice(0, 17) + '...'
						accessorContent.push(`${key}: ${str}`)
					}
				})
				return (
					<React.Fragment key={accessorId}>
						<tr
							className={ClassNames({
								hl: this.isAccessorEdited(containerId, accessorId),
							})}
						>
							<th className="settings-studio-accessor__id c2">{accessorId}</th>
							{/* <td className="settings-studio-accessor__name c2">{accessor.name}</td> */}
							<td className="settings-studio-accessor__type c1">{accessor.type}</td>
							<td className="settings-studio-accessor__accessorContent c7">{accessorContent.join(', ')}</td>

							<td className="settings-studio-accessor__actions table-item-actions c3">
								<button className="action-btn" onClick={() => this.editAccessor(containerId, accessorId)}>
									<FontAwesomeIcon icon={faPencilAlt} />
								</button>
								<button className="action-btn" onClick={() => this.confirmRemoveAccessor(containerId, accessorId)}>
									<FontAwesomeIcon icon={faTrash} />
								</button>
							</td>
						</tr>
						{this.isAccessorEdited(containerId, accessorId) && (
							<tr className="expando-details hl">
								<td colSpan={6}>
									<div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Accessor ID')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={containerId}
													overrideDisplayValue={accessorId}
													obj={this.props.studio}
													type="text"
													collection={Studios}
													updateFunction={this.updateAccessorId}
													className="input text-input input-l"
												></EditAttribute>
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Label')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={`packageContainers.${containerId}.container.accessors.${accessorId}.label`}
													obj={this.props.studio}
													type="text"
													collection={Studios}
													className="input text-input input-l"
												></EditAttribute>
												<span className="text-s dimmed">{t('Display name of the Package Container')}</span>
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Accessor Type')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={`packageContainers.${containerId}.container.accessors.${accessorId}.type`}
													obj={this.props.studio}
													type="dropdown"
													options={Accessor.AccessType}
													collection={Studios}
													className="input text-input input-l"
												></EditAttribute>
											</label>
										</div>
										{accessor.type === Accessor.AccessType.LOCAL_FOLDER ? (
											<>
												<div className="mod mvs mhs">
													<label className="field">
														{t('Folder path')}
														<EditAttribute
															modifiedClassName="bghl"
															attribute={`packageContainers.${containerId}.container.accessors.${accessorId}.folderPath`}
															obj={this.props.studio}
															type="text"
															collection={Studios}
															className="input text-input input-l"
														></EditAttribute>
														<span className="text-s dimmed">{t('File path to the folder of the local folder')}</span>
													</label>
												</div>
												<div className="mod mvs mhs">
													<label className="field">
														{t('Resource Id')}
														<EditAttribute
															modifiedClassName="bghl"
															attribute={`packageContainers.${containerId}.container.accessors.${accessorId}.resourceId`}
															obj={this.props.studio}
															type="text"
															collection={Studios}
															className="input text-input input-l"
														></EditAttribute>
														<span className="text-s dimmed">
															{t('(Optional) This could be the name of the computer on which the local folder is on')}
														</span>
													</label>
												</div>
											</>
										) : accessor.type === Accessor.AccessType.HTTP ? (
											<>
												<div className="mod mvs mhs">
													<label className="field">
														{t('Base URL')}
														<EditAttribute
															modifiedClassName="bghl"
															attribute={`packageContainers.${containerId}.container.accessors.${accessorId}.baseUrl`}
															obj={this.props.studio}
															type="text"
															collection={Studios}
															className="input text-input input-l"
														></EditAttribute>
														<span className="text-s dimmed">
															{t('Base url to the resource (example: http://myserver/folder)')}
														</span>
													</label>
												</div>
												<div className="mod mvs mhs">
													<label className="field">
														{t('Network Id')}
														<EditAttribute
															modifiedClassName="bghl"
															attribute={`packageContainers.${containerId}.container.accessors.${accessorId}.networkId`}
															obj={this.props.studio}
															type="text"
															collection={Studios}
															className="input text-input input-l"
														></EditAttribute>
														<span className="text-s dimmed">
															{t(
																'(Optional) A name/identifier of the local network where the share is located, leave empty if globally accessible'
															)}
														</span>
													</label>
												</div>
											</>
										) : accessor.type === Accessor.AccessType.FILE_SHARE ? (
											<>
												<div className="mod mvs mhs">
													<label className="field">
														{t('Base URL')}
														<EditAttribute
															modifiedClassName="bghl"
															attribute={`packageContainers.${containerId}.container.accessors.${accessorId}.folderPath`}
															obj={this.props.studio}
															type="text"
															collection={Studios}
															className="input text-input input-l"
														></EditAttribute>
														<span className="text-s dimmed">{t('Folder path to shared folder')}</span>
													</label>
												</div>
												<div className="mod mvs mhs">
													<label className="field">
														{t('UserName')}
														<EditAttribute
															modifiedClassName="bghl"
															attribute={`packageContainers.${containerId}.container.accessors.${accessorId}.userName`}
															obj={this.props.studio}
															type="text"
															collection={Studios}
															className="input text-input input-l"
														></EditAttribute>
														<span className="text-s dimmed">{t('Username for athuentication')}</span>
													</label>
												</div>
												<div className="mod mvs mhs">
													<label className="field">
														{t('Password')}
														<EditAttribute
															modifiedClassName="bghl"
															attribute={`packageContainers.${containerId}.container.accessors.${accessorId}.password`}
															obj={this.props.studio}
															type="text"
															collection={Studios}
															className="input text-input input-l"
														></EditAttribute>
														<span className="text-s dimmed">{t('Password for authentication')}</span>
													</label>
												</div>
												<div className="mod mvs mhs">
													<label className="field">
														{t('Network Id')}
														<EditAttribute
															modifiedClassName="bghl"
															attribute={`packageContainers.${containerId}.container.accessors.${accessorId}.networkId`}
															obj={this.props.studio}
															type="text"
															collection={Studios}
															className="input text-input input-l"
														></EditAttribute>
														<span className="text-s dimmed">
															{t('(Optional) A name/identifier of the local network where the share is located')}
														</span>
													</label>
												</div>
											</>
										) : accessor.type === Accessor.AccessType.QUANTEL ? (
											<>
												<div className="mod mvs mhs">
													<label className="field">
														{t('Quantel gateway URL')}
														<EditAttribute
															modifiedClassName="bghl"
															attribute={`packageContainers.${containerId}.container.accessors.${accessorId}.quantelGatewayUrl`}
															obj={this.props.studio}
															type="text"
															collection={Studios}
															className="input text-input input-l"
														></EditAttribute>
														<span className="text-s dimmed">{t('URL to the Quantel Gateway')}</span>
													</label>
												</div>
												<div className="mod mvs mhs">
													<label className="field">
														{t('ISA URLs')}
														<EditAttribute
															modifiedClassName="bghl"
															attribute={`packageContainers.${containerId}.container.accessors.${accessorId}.ISAUrls`}
															obj={this.props.studio}
															type="array"
															arrayType="string"
															collection={Studios}
															className="input text-input input-l"
														></EditAttribute>
														<span className="text-s dimmed">{t('URLs to the ISAs (in order of importance)')}</span>
													</label>
												</div>
												<div className="mod mvs mhs">
													<label className="field">
														{t('Zone ID')}
														<EditAttribute
															modifiedClassName="bghl"
															attribute={`packageContainers.${containerId}.container.accessors.${accessorId}.zoneId`}
															obj={this.props.studio}
															type="text"
															collection={Studios}
															className="input text-input input-l"
														></EditAttribute>
														<span className="text-s dimmed">{t('Zone ID (default value: "default")')}</span>
													</label>
												</div>
												<div className="mod mvs mhs">
													<label className="field">
														{t('Server ID')}
														<EditAttribute
															modifiedClassName="bghl"
															attribute={`packageContainers.${containerId}.container.accessors.${accessorId}.serverId`}
															obj={this.props.studio}
															type="int"
															collection={Studios}
															className="input text-input input-l"
														></EditAttribute>
														<span className="text-s dimmed">
															{t('Server id (Can be omitted for sources, as clip-searches are zone-wide.)')}
														</span>
													</label>
												</div>
											</>
										) : null}

										<div className="mod mvs mhs">
											<label className="field">
												{t('Allow Read access')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={`packageContainers.${containerId}.container.accessors.${accessorId}.allowRead`}
													obj={this.props.studio}
													type="checkbox"
													collection={Studios}
													className="input"
												></EditAttribute>
												<span className="text-s dimmed">{t('')}</span>
											</label>
										</div>
										<div className="mod mvs mhs">
											<label className="field">
												{t('Allow Write access')}
												<EditAttribute
													modifiedClassName="bghl"
													attribute={`packageContainers.${containerId}.container.accessors.${accessorId}.allowWrite`}
													obj={this.props.studio}
													type="checkbox"
													collection={Studios}
													className="input"
												></EditAttribute>
												<span className="text-s dimmed">{t('')}</span>
											</label>
										</div>
									</div>
									<div className="mod">
										<button
											className="btn btn-primary right"
											onClick={() => this.finishEditAccessor(containerId, accessorId)}
										>
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
		getAvailablePackageContainers() {
			const arr: {
				name: string
				value: string
			}[] = []

			for (const [containerId, packageContainer] of Object.entries(this.props.studio.packageContainers)) {
				let hasHttpAccessor = false
				for (const accessor of Object.values(packageContainer.container.accessors)) {
					if (accessor.type === Accessor.AccessType.HTTP) {
						hasHttpAccessor = true
						break
					}
				}
				if (hasHttpAccessor) {
					arr.push({
						name: packageContainer.container.label,
						value: containerId,
					})
				}
			}
			return arr
		}

		render() {
			const { t } = this.props
			return (
				<div>
					<h2 className="mhn mbs">{t('Package Manager')}</h2>

					<div className="settings-studio-package-containers">
						<h3 className="mhn">{t('Studio Settings')}</h3>

						<div>
							<div className="field mvs">
								<label>{t('Package Containers to use for previews')}</label>
								<div className="mdi">
									<EditAttribute
										attribute="previewContainerIds"
										obj={this.props.studio}
										options={this.getAvailablePackageContainers()}
										label={t('Click to show available Package Containers')}
										type="multiselect"
										collection={Studios}
									></EditAttribute>
								</div>
							</div>
							<div className="field mvs">
								<label>{t('Package Containers to use for thumbnails')}</label>
								<div className="mdi">
									<EditAttribute
										attribute="thumbnailContainerIds"
										obj={this.props.studio}
										options={this.getAvailablePackageContainers()}
										label={t('Click to show available Package Containers')}
										type="multiselect"
										collection={Studios}
									></EditAttribute>
								</div>
							</div>
						</div>

						<h3 className="mhn">{t('Package Containers')}</h3>
						<table className="table expando settings-studio-package-containers-table">
							<tbody>{this.renderPackageContainers()}</tbody>
						</table>
						<div className="mod mhs">
							<button className="btn btn-primary" onClick={() => this.addNewPackageContainer()}>
								<FontAwesomeIcon icon={faPlus} />
							</button>
						</div>
					</div>
				</div>
			)
		}
	}
)

interface IStudioSettingsProps {
	match: {
		params: {
			studioId: StudioId
		}
	}
}
interface IStudioSettingsState {}
interface IStudioSettingsTrackedProps {
	studio?: Studio
	studioDevices: Array<PeripheralDevice>
	availableShowStyleVariants: Array<{
		name: string
		value: ShowStyleVariantId
		showStyleVariant: ShowStyleVariant
	}>
	availableShowStyleBases: Array<{
		name: string
		value: ShowStyleBaseId
		showStyleBase: ShowStyleBase
	}>
	availableDevices: Array<PeripheralDevice>
	blueprintConfigManifest: ConfigManifestEntry[]
	layerMappingsManifest: MappingsManifest | undefined
}

interface IStudioBaselineStatusProps {
	studio: Studio
}
interface IStudioBaselineStatusState {
	needsUpdate: boolean
}

class StudioBaselineStatus extends MeteorReactComponent<
	Translated<IStudioBaselineStatusProps>,
	IStudioBaselineStatusState
> {
	private updateInterval: number | undefined = undefined

	constructor(props: Translated<IStudioBaselineStatusProps>) {
		super(props)

		this.state = {
			needsUpdate: false,
		}
	}

	componentDidMount() {
		const updatePeriod = 30000 // every 30s
		this.updateInterval = Meteor.setInterval(() => this.updateStatus(), updatePeriod)
		this.updateStatus()
	}

	componentWillUnmount() {
		if (this.updateInterval) {
			Meteor.clearInterval(this.updateInterval)
			this.updateInterval = undefined
		}
	}

	updateStatus(props?: Translated<IStudioBaselineStatusProps>) {
		const studio = props ? props.studio : this.props.studio

		MeteorCall.playout
			.shouldUpdateStudioBaseline(studio._id)
			.then((result) => {
				if (this.updateInterval) this.setState({ needsUpdate: !!result })
			})
			.catch((err) => {
				console.error('Failed to update studio baseline status', err)
				if (this.updateInterval) this.setState({ needsUpdate: false })
			})
	}

	reloadBaseline() {
		MeteorCall.playout
			.updateStudioBaseline(this.props.studio._id)
			.then((result) => {
				if (this.updateInterval) this.setState({ needsUpdate: !!result })
			})
			.catch((err) => {
				console.error('Failed to update studio baseline', err)
				if (this.updateInterval) this.setState({ needsUpdate: false })
			})
	}

	render() {
		const { t } = this.props
		const { needsUpdate } = this.state

		return (
			<div>
				<p className="mhn">
					{t('Studio Baseline needs update: ')}&nbsp;
					{needsUpdate ? (
						<Tooltip
							overlay={t('Baseline needs reload, this studio may not work until reloaded')}
							visible={getHelpMode()}
							placement="right"
						>
							<span>{t('Yes')}</span>
						</Tooltip>
					) : (
						t('No')
					)}
					{needsUpdate ? (
						<span className="error-notice inline">
							{t('Reload Baseline')} <FontAwesomeIcon icon={faExclamationTriangle} />
						</span>
					) : null}
				</p>
				<p className="mhn">
					<button className="btn btn-primary" onClick={() => this.reloadBaseline()}>
						{t('Reload Baseline')}
					</button>
				</p>
			</div>
		)
	}
}

export default translateWithTracker<IStudioSettingsProps, IStudioSettingsState, IStudioSettingsTrackedProps>(
	(props: IStudioSettingsProps) => {
		const studio = Studios.findOne(props.match.params.studioId)
		const blueprint = studio
			? Blueprints.findOne({
					_id: studio.blueprintId,
					blueprintType: BlueprintManifestType.STUDIO,
			  })
			: undefined

		return {
			studio: studio,
			studioDevices: PeripheralDevices.find({
				studioId: props.match.params.studioId,
			}).fetch(),
			availableShowStyleVariants: ShowStyleVariants.find(
				studio
					? {
							showStyleBaseId: {
								$in: studio.supportedShowStyleBase || [],
							},
					  }
					: {}
			)
				.fetch()
				.map((variant) => {
					const baseStyle = ShowStyleBases.findOne(variant.showStyleBaseId)
					return {
						name: `${(baseStyle || { name: '' }).name}: ${variant.name} (${variant._id})`,
						value: variant._id,
						showStyleVariant: variant,
					}
				}),
			availableShowStyleBases: ShowStyleBases.find()
				.fetch()
				.map((showStyle) => {
					return {
						name: `${showStyle.name}`,
						value: showStyle._id,
						showStyleBase: showStyle,
					}
				}),
			availableDevices: PeripheralDevices.find(
				{
					studioId: {
						$not: {
							$eq: props.match.params.studioId,
						},
					},
					parentDeviceId: {
						$exists: false,
					},
				},
				{
					sort: {
						lastConnected: -1,
					},
				}
			).fetch(),
			blueprintConfigManifest: blueprint ? blueprint.studioConfigManifest || [] : [],
			// TODO - these should come from the device the mapping is targeting but for now this will catch 99% of expected use cases
			layerMappingsManifest: PeripheralDevices.findOne(
				{
					studioId: {
						$eq: props.match.params.studioId,
					},
					parentDeviceId: {
						$exists: false,
					},
					type: {
						$eq: PeripheralDeviceAPI.DeviceType.PLAYOUT,
					},
				},
				{
					sort: {
						lastConnected: -1,
					},
				}
			)?.configManifest?.layerMappings,
		}
	}
)(
	class StudioSettings extends MeteorReactComponent<
		Translated<IStudioSettingsProps & IStudioSettingsTrackedProps>,
		IStudioSettingsState
	> {
		getBlueprintOptions() {
			const { t } = this.props

			const options: { name: string; value: BlueprintId | null }[] = [
				{
					name: t('None'),
					value: protectString(''),
				},
			]

			options.push(
				..._.map(Blueprints.find({ blueprintType: BlueprintManifestType.STUDIO }).fetch(), (blueprint) => {
					return {
						name: blueprint.name ? blueprint.name + ` (${blueprint._id})` : unprotectString(blueprint._id),
						value: blueprint._id,
					}
				})
			)

			return options
		}

		renderShowStyleEditButtons() {
			const buttons: JSX.Element[] = []
			if (this.props.studio) {
				this.props.studio.supportedShowStyleBase.map((style) => {
					const base = this.props.availableShowStyleBases.find((base) => base.showStyleBase._id === style)
					if (base) {
						buttons.push(
							<SettingsNavigation
								key={'settings-nevigation-' + base.showStyleBase.name}
								attribute="name"
								obj={base.showStyleBase}
								type="showstyle"
							></SettingsNavigation>
						)
					}
				})
			}
			return buttons
		}

		getLayerMappingsFlat() {
			const mappings = {}
			if (this.props.studio) {
				mappings[this.props.studio.name] = this.props.studio.mappings
			}
			return mappings
		}

		renderEditForm() {
			const { t } = this.props

			return this.props.studio ? (
				<div className="studio-edit mod mhl mvn">
					<div>
						<h2 className="mhn mtn">{t('Generic Properties')}</h2>
						<label className="field">
							{t('Studio Name')}
							{!this.props.studio.name ? (
								<div className="error-notice inline">
									{t('No name set')} <FontAwesomeIcon icon={faExclamationTriangle} />
								</div>
							) : null}
							<div className="mdi">
								<EditAttribute
									modifiedClassName="bghl"
									attribute="name"
									obj={this.props.studio}
									type="text"
									collection={Studios}
									className="mdinput"
								></EditAttribute>
								<span className="mdfx"></span>
							</div>
						</label>
						<label className="field">
							{t('Blueprint')}
							{!this.props.studio.blueprintId ? (
								<div className="error-notice inline">
									{t('Blueprint not set')} <FontAwesomeIcon icon={faExclamationTriangle} />
								</div>
							) : null}
							<div className="mdi">
								<EditAttribute
									modifiedClassName="bghl"
									attribute="blueprintId"
									obj={this.props.studio}
									type="dropdown"
									options={this.getBlueprintOptions()}
									mutateDisplayValue={(v) => v || ''}
									mutateUpdateValue={(v) => (v === '' ? undefined : v)}
									collection={Studios}
									className="mdinput"
								></EditAttribute>
								<SettingsNavigation
									attribute="blueprintId"
									obj={this.props.studio}
									type="blueprint"
								></SettingsNavigation>
								<span className="mdfx"></span>
							</div>
						</label>
						<div className="field">
							{t('Select Compatible Show Styles')}
							{!this.props.studio.supportedShowStyleBase.length ? (
								<div className="error-notice inline">
									{t('Show style not set')} <FontAwesomeIcon icon={faExclamationTriangle} />
								</div>
							) : null}
							<div className="mdi">
								<EditAttribute
									attribute="supportedShowStyleBase"
									obj={this.props.studio}
									options={this.props.availableShowStyleBases}
									label={t('Click to show available Show Styles')}
									type="multiselect"
									collection={Studios}
								></EditAttribute>
								{this.renderShowStyleEditButtons()}
								<SettingsNavigation type="newshowstyle" />
							</div>
						</div>
						<div className="mod mtn mbm mhn">
							<label className="field">
								<EditAttribute
									modifiedClassName="bghl"
									attribute="settings.enablePlayFromAnywhere"
									obj={this.props.studio}
									type="checkbox"
									collection={Studios}
								></EditAttribute>
								{t('Enable "Play from Anywhere"')}
							</label>
						</div>
						<label className="field">
							{t('Media Preview URL')}
							<div className="mdi">
								<EditAttribute
									modifiedClassName="bghl"
									attribute="settings.mediaPreviewsUrl"
									obj={this.props.studio}
									type="text"
									collection={Studios}
									className="mdinput"
								></EditAttribute>
								<span className="mdfx"></span>
							</div>
						</label>
						<label className="field">
							{t('Sofie Host URL')}
							<div className="mdi">
								<EditAttribute
									modifiedClassName="bghl"
									attribute="settings.sofieUrl"
									obj={this.props.studio}
									type="text"
									collection={Studios}
									className="mdinput"
								></EditAttribute>
								<span className="mdfx"></span>
							</div>
						</label>
						<label className="field">
							{t('Slack Webhook URLs')}
							<div className="mdi">
								<EditAttribute
									modifiedClassName="bghl"
									attribute="settings.slackEvaluationUrls"
									obj={this.props.studio}
									type="text"
									collection={Studios}
									className="mdinput"
								></EditAttribute>
								<span className="mdfx"></span>
							</div>
						</label>
						<label className="field">
							{t('Supported Media Formats')}
							<div className="mdi">
								<EditAttribute
									modifiedClassName="bghl"
									attribute="settings.supportedMediaFormats"
									obj={this.props.studio}
									type="text"
									collection={Studios}
									className="mdinput"
								></EditAttribute>
								<span className="mdfx"></span>
							</div>
						</label>
						<label className="field">
							{t('Supported Audio Formats')}
							<div className="mdi">
								<EditAttribute
									modifiedClassName="bghl"
									attribute="settings.supportedAudioStreams"
									obj={this.props.studio}
									type="text"
									collection={Studios}
									className="mdinput"
								></EditAttribute>
								<span className="mdfx"></span>
							</div>
						</label>
						<div className="mod mtn mbm mhn">
							<label className="field">
								<EditAttribute
									modifiedClassName="bghl"
									attribute="settings.forceSettingNowTime"
									obj={this.props.studio}
									type="checkbox"
									collection={Studios}
								></EditAttribute>
								{t('Force the Multi-gateway-mode')}
							</label>
						</div>
						<div className="mod mtn mbm mhn">
							{t('Multi-gateway-mode delay time')}
							<label className="field">
								<EditAttribute
									modifiedClassName="bghl"
									attribute="settings.nowSafeLatency"
									obj={this.props.studio}
									type="int"
									collection={Studios}
									className="mdinput"
								></EditAttribute>
							</label>
						</div>
					</div>
					<div className="row">
						<div className="col c12 r1-c12">
							<StudioBaselineStatus
								studio={this.props.studio}
								t={t}
								i18n={this.props.i18n}
								tReady={this.props.tReady}
							/>
						</div>
					</div>
					<div className="row">
						<div className="col c12 r1-c12">
							<StudioDevices
								studio={this.props.studio}
								studioDevices={this.props.studioDevices}
								availableDevices={this.props.availableDevices}
							/>
						</div>
					</div>
					<div className="row">
						<div className="col c12 r1-c12">
							<ConfigManifestSettings
								t={this.props.t}
								i18n={this.props.i18n}
								tReady={this.props.tReady}
								manifest={this.props.blueprintConfigManifest}
								object={this.props.studio}
								layerMappings={this.getLayerMappingsFlat()}
								collection={Studios}
								configPath={'blueprintConfig'}
							/>
						</div>
					</div>
					<div className="row">
						<div className="col c12 r1-c12">
							<StudioMappings studio={this.props.studio} manifest={this.props.layerMappingsManifest} />
						</div>
					</div>
					<div className="row">
						<div className="col c12 r1-c12">
							<StudioRoutings studio={this.props.studio} manifest={this.props.layerMappingsManifest} />
						</div>
					</div>
					<div className="row">
						<div className="col c12 r1-c12">
							<StudioPackageManagerSettings studio={this.props.studio} />
						</div>
					</div>
				</div>
			) : (
				<Spinner />
			)
		}

		render() {
			if (this.props.studio) {
				return this.renderEditForm()
			} else {
				return <Spinner />
			}
		}
	}
)

export function findHighestRank(array: Array<{ _rank: number }>): { _rank: number } | null {
	if (!array) return null
	let max: { _rank: number } | null = null

	array.forEach((value) => {
		if (max === null || max._rank < value._rank) {
			max = value
		}
	})

	return max
}
