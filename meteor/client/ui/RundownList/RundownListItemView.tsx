import Tooltip from 'rc-tooltip'
import React, { ReactElement } from 'react'
import { withTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Rundown } from '../../../lib/collections/Rundowns'
import { getAllowStudio } from '../../lib/localStorage'
import { Translated } from '../../lib/ReactMeteorData/ReactMeteorData'
import { RundownUtils } from '../../lib/rundown'
import { iconDragHandle, iconRemove, iconResync } from './icons'
import { DisplayFormattedTime } from './DisplayFormattedTime'
import { EyeIcon } from '../../lib/ui/icons/rundownList'
import { LoopingIcon } from '../../lib/ui/icons/looping'
import { RundownShelfLayoutSelection } from './RundownShelfLayoutSelection'
import { RundownLayoutBase } from '../../../lib/collections/RundownLayouts'

interface IRundownListItemViewProps {
	isActive: boolean
	classNames: string[]
	htmlElementId: string
	connectDragSource: (content: ReactElement) => ReactElement | null
	rundownViewUrl?: string
	rundown: Rundown
	rundownLayouts: Array<RundownLayoutBase>
	showStyleBaseURL?: string
	showStyleName: string | undefined
	confirmReSyncRundownHandler?: () => void
	confirmDeleteRundownHandler?: () => void
	isDragLayer: boolean
	connectDropTarget: (content: ReactElement) => ReactElement | null
	renderTooltips: boolean
	isOnlyRundownInPlaylist?: boolean
}

export default withTranslation()(function RundownListItemView(props: Translated<IRundownListItemViewProps>) {
	const {
		isActive,
		t,
		connectDragSource,
		connectDropTarget,
		htmlElementId,
		rundownViewUrl,
		showStyleBaseURL,
		showStyleName,
		rundown,
		rundownLayouts,
		confirmReSyncRundownHandler,
		confirmDeleteRundownHandler,
		isOnlyRundownInPlaylist,
	} = props

	const playlist = rundown.getRundownPlaylist()

	const classNames = props.classNames.slice()
	classNames.push('rundown-list-item')
	if (props.isDragLayer) {
		classNames.push('dragging')
	}

	const rundownNameContent = rundownViewUrl ? (
		<Link to={rundownViewUrl}>
			{isOnlyRundownInPlaylist && playlist.loop && <LoopingIcon />}
			{props.rundown.name}
		</Link>
	) : (
		props.rundown.name
	)

	return connectDropTarget(
		<li id={htmlElementId} className={classNames.join(' ')}>
			<span className="rundown-list-item__name">
				{getAllowStudio()
					? connectDragSource(
							<span className="draghandle">
								<Tooltip
									overlay={t('Drag to reorder or move out of playlist')}
									placement="top"
									overlayStyle={{ display: props.renderTooltips ? undefined : 'none' }}
								>
									<button className="rundown-list-item__action">{iconDragHandle()}</button>
								</Tooltip>
							</span>
					  )
					: null}
				<b className="rundown-name">{rundownNameContent}</b>
				{props.rundown.description ? (
					<Tooltip overlay={props.rundown.description} trigger={['hover']} placement="right">
						<span className="rundown-list-description__icon">
							<EyeIcon />
						</span>
					</Tooltip>
				) : null}

				{isActive === true ? (
					<Tooltip overlay={t('This rundown is currently active')} placement="bottom">
						<div className="origo-pulse small right mrs">
							<div className="pulse-marker">
								<div className="pulse-rays"></div>
								<div className="pulse-rays delay"></div>
							</div>
						</div>
					</Tooltip>
				) : null}
			</span>
			{/* <RundownListItemProblems warnings={warnings} errors={errors} /> */}
			<span className="rundown-list-item__text">
				{showStyleBaseURL ? <Link to={showStyleBaseURL}>{showStyleName}</Link> : showStyleName || ''}
			</span>
			<span className="rundown-list-item__text">
				{rundown.expectedStart ? (
					<DisplayFormattedTime displayTimestamp={rundown.expectedStart} t={t} />
				) : (
					<span className="dimmed">{t('Not set')}</span>
				)}
			</span>
			<span className="rundown-list-item__text">
				{rundown.expectedDuration ? (
					isOnlyRundownInPlaylist && playlist.loop ? (
						<Tooltip overlay={t('This rundown will loop indefinitely')} placement="top">
							<span>
								{t('({{timecode}})', {
									timecode: RundownUtils.formatDiffToTimecode(rundown.expectedDuration, false, true, true, false, true),
								})}
								&nbsp;
								<LoopingIcon />
							</span>
						</Tooltip>
					) : (
						RundownUtils.formatDiffToTimecode(rundown.expectedDuration, false, true, true, false, true)
					)
				) : isOnlyRundownInPlaylist && playlist.loop ? (
					<Tooltip overlay={t('This rundown will loop indefinitely')} placement="top">
						<span>
							<LoopingIcon />
						</span>
					</Tooltip>
				) : (
					<span className="dimmed">{t('Not set')}</span>
				)}
			</span>
			<span className="rundown-list-item__text">
				<DisplayFormattedTime displayTimestamp={rundown.modified} t={t} />
			</span>
			{rundownLayouts.some((l) => l.exposeAsShelf || l.exposeAsStandalone) && (
				<span className="rundown-list-item__text">
					{isOnlyRundownInPlaylist && (
						<RundownShelfLayoutSelection
							rundowns={[rundown]}
							rundownLayouts={rundownLayouts}
							playlistId={rundown.playlistId}
						/>
					)}
				</span>
			)}
			<span className="rundown-list-item__actions">
				{confirmReSyncRundownHandler ? (
					<Tooltip
						overlay={t('Re-sync rundown data with {{nrcsName}}', { nrcsName: rundown.externalNRCSName || 'NRCS' })}
						placement="top"
					>
						<button className="rundown-list-item__action" onClick={() => confirmReSyncRundownHandler()}>
							{iconResync()}
						</button>
					</Tooltip>
				) : (
					<span className="rundown-list-item__action"></span>
				)}
				{confirmDeleteRundownHandler ? (
					<Tooltip overlay={t('Delete')} placement="top">
						<button className="rundown-list-item__action" onClick={() => confirmDeleteRundownHandler()}>
							{iconRemove()}
						</button>
					</Tooltip>
				) : null}
			</span>
		</li>
	)
})
