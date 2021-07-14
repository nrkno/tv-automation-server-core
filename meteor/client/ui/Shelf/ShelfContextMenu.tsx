import React from 'react'
import { useTranslation } from 'react-i18next'
import { useTracker } from '../../lib/ReactMeteorData/ReactMeteorData'
import Escape from 'react-escape'
import { ContextMenu, MenuItem } from '@jstarpl/react-contextmenu'
import { ReactiveVar } from 'meteor/reactive-var'
import { Bucket } from '../../../lib/collections/Buckets'
import { BucketAdLibItem, BucketAdLibActionUi } from './RundownViewBuckets'
import RundownViewEventBus, { RundownViewEvents } from '../RundownView/RundownViewEventBus'
import { IAdLibListItem } from './AdLibListItem'
import { isActionItem } from './Inspector/ItemRenderers/ActionItemRenderer'
import { AdLibPieceUi } from './AdLibPanel'
import { IBlueprintActionTriggerMode } from '@sofie-automation/blueprints-integration'
import { translateMessage } from '../../../lib/api/TranslatableMessage'

export enum ContextType {
	BUCKET = 'bucket',
	BUCKET_ADLIB = 'bucket_adlib',
	ADLIB = 'adlib',
}

interface ShelfContextMenuContextBase {
	type: ContextType
	details?: object
}

export interface ShelfContextMenuContextBucket extends ShelfContextMenuContextBase {
	type: ContextType.BUCKET
	details: {
		bucket: Bucket
	}
}

export interface ShelfContextMenuContextBucketAdLib extends ShelfContextMenuContextBase {
	type: ContextType.BUCKET_ADLIB
	details: {
		bucket: Bucket
		adLib: BucketAdLibItem
		canQueue?: boolean
		onToggle: (aSLine: BucketAdLibItem, queue: boolean, context: any, mode?: IBlueprintActionTriggerMode) => void
	}
}

export interface ShelfContextMenuContextAdLib extends ShelfContextMenuContextBase {
	type: ContextType.ADLIB
	details: {
		adLib: IAdLibListItem
		canQueue?: boolean
		onToggle: (aSLine: IAdLibListItem, queue: boolean, context: any, mode?: IBlueprintActionTriggerMode) => void
	}
}

type ShelfContextMenuContext =
	| ShelfContextMenuContextBucket
	| ShelfContextMenuContextBucketAdLib
	| ShelfContextMenuContextAdLib

const shelfContextMenuContext: ReactiveVar<ShelfContextMenuContext | undefined> = new ReactiveVar(undefined)

export function setShelfContextMenuContext(context: ShelfContextMenuContext | undefined) {
	shelfContextMenuContext.set(context)
}

export default function ShelfContextMenu() {
	const { t } = useTranslation()

	const context = useTracker(() => {
		return shelfContextMenuContext.get()
	})

	const clearContext = () => {
		shelfContextMenuContext.set(undefined)
	}

	const getActionItem = (piece: IAdLibListItem | BucketAdLibActionUi) => {
		return (piece as AdLibPieceUi).adlibAction
	}

	const renderStartExecuteAdLib = function renderStartExecuteAdLib<T extends IAdLibListItem | BucketAdLibItem>(item: {
		adLib: T
		onToggle: (adLib: T, queue: boolean, e: any, mode?: IBlueprintActionTriggerMode) => void
	}) {
		if (isActionItem(item.adLib)) {
			const adLibAction = getActionItem(item.adLib)
			const triggerModes = adLibAction?.triggerModes
				?.sort(
					(a, b) =>
						a.display._rank - b.display._rank ||
						translateMessage(a.display.label, t).localeCompare(translateMessage(b.display.label, t))
				)
				.map((mode) => (
					<MenuItem
						key={mode.data}
						onClick={(e) => {
							e.persist()
							item.onToggle(item.adLib, false, e, mode)
						}}
					>
						{translateMessage(mode.display.label, t)}
					</MenuItem>
				))
			return (
				(triggerModes !== undefined && triggerModes.length > 0 && triggerModes) || (
					<MenuItem
						onClick={(e) => {
							e.persist()
							item.onToggle(item.adLib, false, e)
						}}
					>
						{(adLibAction?.display.triggerLabel && translateMessage(adLibAction?.display.triggerLabel, t)) ??
							t('Execute')}
					</MenuItem>
				)
			)
		} else {
			return (
				<>
					<MenuItem
						onClick={(e) => {
							e.persist()
							item.onToggle(item.adLib, false, e)
						}}
					>
						{t('Start this AdLib')}
					</MenuItem>
					{item.adLib.sourceLayer && item.adLib.sourceLayer?.isQueueable && (
						<MenuItem
							onClick={(e) => {
								e.persist()
								item.onToggle(item.adLib, true, e)
							}}
						>
							{t('Queue this AdLib')}
						</MenuItem>
					)}
				</>
			)
		}
	}

	return (
		<Escape to="viewport">
			<ContextMenu id="shelf-context-menu" onHide={clearContext}>
				{context && context.type === ContextType.BUCKET && (
					<div className="react-contextmenu-label">{context.details.bucket.name}</div>
				)}
				{context && (context.type === ContextType.BUCKET_ADLIB || context.type === ContextType.ADLIB) && (
					<>
						<div className="react-contextmenu-label">{context.details.adLib.name}</div>
						{context.type === ContextType.ADLIB
							? renderStartExecuteAdLib(context.details)
							: context.type === ContextType.BUCKET_ADLIB
							? renderStartExecuteAdLib(context.details)
							: null}
						<hr />
						<MenuItem
							onClick={(e) => {
								e.persist()
								RundownViewEventBus.emit(RundownViewEvents.SELECT_PIECE, {
									piece: context.details.adLib,
									context: e,
								})
							}}
						>
							{t('Inspect this AdLib')}
						</MenuItem>
					</>
				)}
				{context && context.type === ContextType.BUCKET_ADLIB && (
					<>
						<MenuItem
							onClick={(e) => {
								e.persist()
								RundownViewEventBus.emit(RundownViewEvents.RENAME_BUCKET_ADLIB, {
									piece: context.details.adLib,
									bucket: context.details.bucket,
									context: e,
								})
							}}
						>
							{t('Rename this AdLib')}
						</MenuItem>
						<MenuItem
							onClick={(e) => {
								e.persist()
								RundownViewEventBus.emit(RundownViewEvents.DELETE_BUCKET_ADLIB, {
									piece: context.details.adLib,
									bucket: context.details.bucket,
									context: e,
								})
							}}
						>
							{t('Delete this AdLib')}
						</MenuItem>
						<hr />
					</>
				)}
				{context && (context.type === ContextType.BUCKET || context.type === ContextType.BUCKET_ADLIB) && (
					<>
						<MenuItem
							onClick={(e) => {
								e.persist()
								RundownViewEventBus.emit(RundownViewEvents.EMPTY_BUCKET, {
									bucket: context.details.bucket,
									context: e,
								})
							}}
						>
							{t('Empty this Bucket')}
						</MenuItem>
						<MenuItem
							onClick={(e) => {
								e.persist()
								RundownViewEventBus.emit(RundownViewEvents.RENAME_BUCKET, {
									bucket: context.details.bucket,
									context: e,
								})
							}}
						>
							{t('Rename this Bucket')}
						</MenuItem>
						<MenuItem
							onClick={(e) => {
								e.persist()
								RundownViewEventBus.emit(RundownViewEvents.DELETE_BUCKET, {
									bucket: context.details.bucket,
									context: e,
								})
							}}
						>
							{t('Delete this Bucket')}
						</MenuItem>
						<hr />
					</>
				)}
				<MenuItem
					onClick={(e) => {
						e.persist()
						RundownViewEventBus.emit(RundownViewEvents.CREATE_BUCKET, {
							context: e,
						})
					}}
				>
					{t('Create new Bucket')}
				</MenuItem>
			</ContextMenu>
		</Escape>
	)
}
