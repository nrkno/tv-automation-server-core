import * as React from 'react'
import * as _ from 'underscore'
import { PieceUi } from '../../../SegmentTimeline/SegmentTimelineContainer'
import { AdLibPieceUi } from '../../AdLibPanel'
import { RundownUtils } from '../../../../lib/rundown'
import { Piece } from '../../../../../lib/collections/Pieces'
import {
	ConfigManifestEntry as BlueprintConfigManifestEntry,
	IBlueprintActionTriggerMode,
} from '@sofie-automation/blueprints-integration'
import { MeteorReactComponent } from '../../../../lib/MeteorReactComponent'
import { translateWithTracker, Translated } from '../../../../lib/ReactMeteorData/ReactMeteorData'
import { AdLibActionCommon } from '../../../../../lib/collections/AdLibActions'
import { createMongoCollection } from '../../../../../lib/collections/lib'
import { TransformedCollection } from '../../../../../lib/typings/meteor'
import { ConfigManifestEntryComponent } from '../../../Settings/components/ConfigManifestEntryComponent'
import { ConfigManifestEntry, ConfigManifestEntryType } from '../../../../../lib/api/deviceConfig'
import { Spinner } from '../../../../lib/Spinner'
import { ShowStyleBase } from '../../../../../lib/collections/ShowStyleBases'
import InspectorTitle from './InspectorTitle'
import { ProtectedString } from '../../../../../lib/lib'
import { PartId } from '../../../../../lib/collections/Parts'
import { Studio } from '../../../../../lib/collections/Studios'
import { doUserAction, UserAction } from '../../../../lib/userAction'
import { MeteorCall } from '../../../../../lib/api/methods'
import { BucketId, Buckets } from '../../../../../lib/collections/Buckets'
import { BucketAdLibItem, BucketAdLibActionUi } from '../../RundownViewBuckets'
import { RundownPlaylist } from '../../../../../lib/collections/RundownPlaylists'
import { actionToAdLibPieceUi } from '../../BucketPanel'
import RundownViewEventBus, { RundownViewEvents } from '../../../RundownView/RundownViewEventBus'
import { IAdLibListItem } from '../../AdLibListItem'
import { translateMessage } from '../../../../../lib/api/TranslatableMessage'

export { isActionItem }

export interface IProps {
	piece: PieceUi | IAdLibListItem | BucketAdLibActionUi
	showStyleBase: ShowStyleBase
	studio: Studio
	rundownPlaylist: RundownPlaylist
	onSelectPiece: (piece: BucketAdLibItem | AdLibPieceUi | PieceUi | undefined) => void
}

export interface ITrackedProps {
	targetAction: TransformedAdLibAction | undefined
	bucketIds: BucketId[]
}

export interface TransformedAdLibAction extends AdLibActionCommon {
	_id: ProtectedString<any>
	partId?: PartId | undefined
	transformedUserData: {
		[key: string]: any
	}
}

function transformedAdLibActionToAction(transformed: TransformedAdLibAction): AdLibActionCommon {
	return {
		...(_.omit(transformed, ['transformedUserData']) as Omit<TransformedAdLibAction, 'transformedUserData'>),
		userData: transformed.transformedUserData,
	}
}

// create a temporary collection to store changes to the AdLib Actions
const LocalActionItems: TransformedCollection<TransformedAdLibAction, TransformedAdLibAction> =
	createMongoCollection(null)

export default translateWithTracker<IProps, {}, ITrackedProps>((props: IProps) => {
	const piece = RundownUtils.isPieceInstance(props.piece)
		? (props.piece.instance.piece as Piece)
		: (props.piece as AdLibPieceUi)

	const action = (piece as AdLibPieceUi).adlibAction

	return {
		targetAction: action ? LocalActionItems.findOne(action._id) : undefined,
		bucketIds: Buckets.find(
			{
				studioId: props.studio._id,
			},
			{
				sort: {
					_rank: 1,
				},
				fields: {
					_id: 1,
					_rank: 1,
				},
			}
		)
			.fetch()
			.map((bucket) => bucket._id),
	}
})(
	class ActionItemRenderer extends MeteorReactComponent<Translated<IProps & ITrackedProps>> {
		componentDidMount() {
			const action = this.getActionItem()

			if (action) {
				LocalActionItems.insert({
					...action,
					transformedUserData: {
						...action.userData,
					},
				})
			}
		}

		componentDidUpdate(prevProps: IProps & ITrackedProps) {
			const action = this.getActionItem()

			if (prevProps.targetAction && ((action && action._id !== prevProps.targetAction._id) || !action)) {
				LocalActionItems.remove(prevProps.targetAction._id)
			}

			if (action && prevProps.targetAction && prevProps.targetAction._id === action._id) {
				LocalActionItems.upsert(action._id, {
					$set: {
						actionId: action.actionId,
						partId: action.partId,
						rundownId: action.rundownId,
						display: {
							...action.display,
						},
						userDataManifest: {
							...action.userDataManifest,
						},
					},
				})
			} else if (action && prevProps.targetAction && prevProps.targetAction._id !== action._id) {
				LocalActionItems.insert({
					...action,
					transformedUserData: {
						...action.userData,
					},
				})
			} else if (prevProps.targetAction) {
				LocalActionItems.remove(prevProps.targetAction._id)
			}
		}

		componentWillUnmount() {
			super.componentWillUnmount()

			if (this.props.targetAction) {
				LocalActionItems.remove(this.props.targetAction._id)
			}
		}

		getActionItem() {
			const piece = RundownUtils.isPieceInstance(this.props.piece)
				? (this.props.piece.instance.piece as Piece)
				: (this.props.piece as AdLibPieceUi)

			const action = (piece as AdLibPieceUi).adlibAction

			return action
		}

		renderConfigFields(
			configManifest: Array<ConfigManifestEntry | BlueprintConfigManifestEntry>,
			obj: any,
			prefix?: string
		) {
			const { t } = this.props

			return configManifest.length ? (
				<div>
					{configManifest.map((configField) =>
						configField.type === ConfigManifestEntryType.TABLE ? null : (
							<ConfigManifestEntryComponent
								key={configField.id}
								collection={LocalActionItems}
								configField={configField}
								obj={obj}
								prefix={prefix}
								className=""
							></ConfigManifestEntryComponent>
						)
					)}
				</div>
			) : (
				<span>{t('AdLib does not provide any options')}</span>
			)
		}

		onRevealSelectedItem = () => {
			const piece = RundownUtils.isPieceInstance(this.props.piece)
				? (this.props.piece.instance.piece as Piece)
				: (this.props.piece as AdLibPieceUi)

			RundownViewEventBus.emit(RundownViewEvents.REVEAL_IN_SHELF, {
				pieceId: piece._id,
			})
		}

		onTrigger = (e: any, mode?: IBlueprintActionTriggerMode) => {
			const { t, targetAction } = this.props

			if (targetAction) {
				doUserAction(t, e, UserAction.START_ADLIB, (e) =>
					MeteorCall.userAction.executeAction(
						e,
						this.props.rundownPlaylist._id,
						targetAction._id,
						targetAction.actionId,
						targetAction.transformedUserData,
						mode?.data
					)
				)
			}
		}

		onSaveToBucket = (e: any) => {
			const { t, onSelectPiece } = this.props

			if (this.props.bucketIds[0] && this.props.targetAction) {
				const { targetAction } = this.props
				doUserAction(
					t,
					e,
					UserAction.SAVE_TO_BUCKET,
					(e) =>
						MeteorCall.userAction.bucketsSaveActionIntoBucket(
							e,
							this.props.studio._id,
							transformedAdLibActionToAction(targetAction),
							this.props.bucketIds[0]
						),
					(err, res) => {
						if (err) return

						if (res) {
							onSelectPiece(
								actionToAdLibPieceUi(
									res,
									_.indexBy(this.props.showStyleBase.sourceLayers, '_id'),
									_.indexBy(this.props.showStyleBase.outputLayers, '_id')
								)
							)
						}
					}
				)
			}
		}

		render() {
			const { t, targetAction } = this.props
			const action = this.getActionItem()

			const modes = targetAction?.triggerModes?.sort(
				(a, b) =>
					a.display._rank - b.display._rank ||
					translateMessage(a.display.label, t).localeCompare(translateMessage(b.display.label, t))
			)

			if (!action || !targetAction) {
				return <Spinner />
			}

			return (
				<>
					<InspectorTitle
						piece={this.props.piece}
						showStyleBase={this.props.showStyleBase}
						studio={this.props.studio}
					/>
					<div className="shelf-inspector__action-editor">
						<div className="shelf-inspector__action-editor__panel">
							{action.userDataManifest && action.userDataManifest.editableFields && !targetAction ? (
								<Spinner />
							) : action.userDataManifest && action.userDataManifest.editableFields && targetAction ? (
								<>
									{this.renderConfigFields(
										action.userDataManifest.editableFields,
										targetAction,
										'transformedUserData.'
									)}
								</>
							) : null}
						</div>
						<div className="shelf-inspector__action-editor__actions">
							{modes?.length ? (
								<button className="btn" onClick={(e) => this.onTrigger(e, modes[0])}>
									{translateMessage(modes[0].display.label, t)}
								</button>
							) : (
								<button className="btn" onClick={this.onTrigger}>
									{targetAction?.display.triggerLabel
										? translateMessage(targetAction?.display.triggerLabel, t)
										: t('Execute')}
								</button>
							)}
							<button className="btn" onClick={this.onSaveToBucket}>
								{t('Save to Bucket')}
							</button>
							<button className="btn" onClick={this.onRevealSelectedItem}>
								{t('Reveal in Shelf')}
							</button>
						</div>
					</div>
				</>
			)
		}
	}
)

function isActionItem(item: BucketAdLibItem | IAdLibListItem | PieceUi): item is BucketAdLibActionUi | IAdLibListItem {
	const content = RundownUtils.isAdLibPieceOrAdLibListItem(item)
		? (item as AdLibPieceUi)
		: RundownUtils.isPieceInstance(item)
		? (item.instance.piece as Piece)
		: (item as AdLibPieceUi)

	if (content && (content as AdLibPieceUi).isAction) {
		return true
	}

	return false
}
