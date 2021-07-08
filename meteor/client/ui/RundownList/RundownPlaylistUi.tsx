import React from 'react'
import Tooltip from 'rc-tooltip'
import ClassNames from 'classnames'
import { withTranslation } from 'react-i18next'
import { RundownLayoutBase } from '../../../lib/collections/RundownLayouts'
import { unprotectString } from '../../../lib/lib'
import { Translated } from '../../lib/ReactMeteorData/ReactMeteorData'
import { ActiveProgressBar } from './ActiveProgressBar'
import { RundownListItem } from './RundownListItem'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { Rundown, RundownId } from '../../../lib/collections/Rundowns'
import { ShowStyleBaseId } from '../../../lib/collections/ShowStyleBases'
import { UIStateStorage } from '../../lib/UIStateStorage'
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { IconName } from '@fortawesome/fontawesome-svg-core'
import { faFolderOpen } from '@fortawesome/free-solid-svg-icons'
import { LoopingIcon } from '../../lib/ui/icons/looping'
import { getRundownPlaylistLink } from './util'
import {
	DragElementWrapper,
	DropTarget,
	DropTargetCollector,
	DropTargetConnector,
	DropTargetMonitor,
	DropTargetSpec,
} from 'react-dnd'
import {
	IRundownPlaylistUiAction,
	isRundownDragObject,
	isRundownPlaylistUiAction,
	RundownListDragDropTypes,
	RundownPlaylistUiActionTypes,
} from './DragAndDropTypes'
import { MeteorCall } from '../../../lib/api/methods'
import { RundownUtils } from '../../lib/rundown'
import PlaylistRankMethodToggle from './PlaylistRankMethodToggle'
import { DisplayFormattedTime } from './DisplayFormattedTime'
import { getAllowStudio } from '../../lib/localStorage'
import { doUserAction, UserAction } from '../../lib/userAction'
import { RundownViewLayoutSelection } from './RundownViewLayoutSelection'
import { RundownLayoutsAPI } from '../../../lib/api/rundownLayouts'

export interface RundownPlaylistUi extends RundownPlaylist {
	rundowns: Rundown[]
	rundownStatus: string
	rundownAirStatus: string
	unsyncedRundowns: Rundown[]
	studioName: string
	showStyles: Array<{ id: ShowStyleBaseId; baseName?: string; variantName?: string }>
}

export interface IRundownPlaylistUiProps {
	playlist: RundownPlaylistUi
	rundownLayouts: RundownLayoutBase[]
}

interface IRundownPlaylistUiState {
	selectedView: string
	rundownOrder: RundownId[]
}

interface IRundownPlaylistDropTargetProps {
	connectDropTarget: DragElementWrapper<RundownPlaylistUi>
	isOver: boolean
	itemType: string | symbol | null
	action: IRundownPlaylistUiAction | undefined
	isActiveDropZone: boolean
}

const spec: DropTargetSpec<IRundownPlaylistUiProps> = {
	drop: (
		props: IRundownPlaylistUiProps,
		monitor: DropTargetMonitor,
		_component: any
	): IRundownPlaylistUiAction | undefined => {
		if (monitor.didDrop()) {
			return
		}

		const dropped = monitor.getItem()

		if (isRundownDragObject(dropped)) {
			return {
				type: 'HANDLE_RUNDOWN_DROP',
				rundownId: dropped.id,
				targetPlaylistId: props.playlist._id,
			}
		}
	},
}

const collect: DropTargetCollector<IRundownPlaylistDropTargetProps, IRundownPlaylistUiProps> = function (
	connect: DropTargetConnector,
	monitor: DropTargetMonitor,
	props: IRundownPlaylistUiProps
): IRundownPlaylistDropTargetProps {
	let action: IRundownPlaylistUiAction | undefined = undefined
	const draggingId = monitor.getItem()?.id
	const outsideRundownIsDragging =
		draggingId !== undefined && !props.playlist.rundowns.some(({ _id }) => draggingId === _id)

	const dropResult = monitor.getDropResult()
	if (isRundownPlaylistUiAction(dropResult)) {
		action = dropResult as IRundownPlaylistUiAction
	}

	return {
		connectDropTarget: connect.dropTarget(),
		isOver: monitor.isOver(),
		itemType: monitor.getItemType(),
		action,
		isActiveDropZone: outsideRundownIsDragging,
	}
}

export const RundownPlaylistUi = DropTarget(
	RundownListDragDropTypes.RUNDOWN,
	spec,
	collect
)(
	withTranslation()(
		class RundownPlaylistUi extends React.Component<
			Translated<IRundownPlaylistUiProps> & IRundownPlaylistDropTargetProps,
			IRundownPlaylistUiState
		> {
			// rundowns: Map<RundownId, Rundown> = new Map<RundownId, Rundown>()

			constructor(props: Translated<IRundownPlaylistUiProps> & IRundownPlaylistDropTargetProps) {
				super(props)

				this.state = {
					rundownOrder: props.playlist.rundowns.map((rundown) => rundown._id),
					selectedView: UIStateStorage.getItemString(
						`rundownList.${this.props.playlist.studioId}`,
						'defaultView',
						'default'
					),
				}
			}

			private handleRundownDrop(rundownId: RundownId): void {
				const { playlist, t } = this.props
				const playlistId = this.props.playlist._id
				const rundownOrder = this.state.rundownOrder.slice()

				if (playlist.rundowns.findIndex((rundown) => rundownId === rundown._id) > -1) {
					// finalize order from component state
					doUserAction(t, 'Drag and drop rundown playlist reorder', UserAction.RUNDOWN_ORDER_MOVE, (e) =>
						MeteorCall.userAction.moveRundown(e, rundownId, playlistId, rundownOrder)
					)
				} else {
					// add rundown to playlist
					rundownOrder.push(rundownId)

					doUserAction(t, 'Drag and drop add rundown to playlist', UserAction.RUNDOWN_ORDER_MOVE, (e) =>
						MeteorCall.userAction.moveRundown(e, rundownId, playlistId, rundownOrder)
					)
				}
			}

			private handleResetRundownOrderClick() {
				const { t } = this.props
				doUserAction(
					t,
					'User clicked the playlist rundown order toggle to reset',
					UserAction.RUNDOWN_ORDER_RESET,
					(e) => MeteorCall.userAction.restoreRundownOrder(e, this.props.playlist._id)
				)
			}

			private rundownsHaveChanged(prevProps: IRundownPlaylistUiProps): boolean {
				if (prevProps.playlist.rundowns.length !== this.props.playlist.rundowns.length) {
					return true
				}

				for (let i = 0; i < prevProps.playlist.rundowns.length; i++) {
					if (prevProps.playlist.rundowns[i]._id !== this.props.playlist.rundowns[i]._id) {
						return true
					}
				}

				return false
			}

			private resetLocalRundownOrder(): void {
				const rundownOrder = this.props.playlist.rundowns.map((rundown) => rundown._id)

				this.setState({ rundownOrder })
			}

			componentDidUpdate(prevProps: IRundownPlaylistUiProps) {
				const { action } = this.props
				if (action && action.targetPlaylistId === this.props.playlist._id) {
					const { type, rundownId } = action
					switch (type) {
						case RundownPlaylistUiActionTypes.HANDLE_RUNDOWN_DROP:
							this.handleRundownDrop(rundownId)
							break
						default:
							console.debug(`Unknown action type ${type}`, this.props.action)
					}
				}

				if (this.rundownsHaveChanged(prevProps)) {
					this.resetLocalRundownOrder()
				}
			}

			private saveViewChoice(key: string) {
				UIStateStorage.setItem(`rundownList.${this.props.playlist.studioId}`, 'defaultView', key)
			}

			private renderViewLinkItem(layout: RundownLayoutBase, link: string, key: string) {
				return (
					<Link to={link} onClick={() => this.saveViewChoice(key)} key={key}>
						<div className="action-btn expco-item">
							<div
								className={ClassNames('action-btn layout-icon', { small: !layout.icon })}
								style={{ color: layout.iconColor || 'transparent' }}
							>
								<FontAwesomeIcon icon={(layout.icon as IconName) || 'circle'} />
							</div>
							<span className="expco-text">{layout.name}</span>
						</div>
					</Link>
				)
			}

			private swapRundownOrder(a: RundownId, b: RundownId): void {
				const aPos = this.state.rundownOrder.indexOf(a)
				const bPos = this.state.rundownOrder.indexOf(b)

				if (aPos > -1 && bPos > -1) {
					const newOrder = this.state.rundownOrder.slice()
					newOrder[aPos] = b
					newOrder[bPos] = a
					this.setState({ rundownOrder: newOrder })
				}
			}

			render() {
				const { playlist, connectDropTarget, t, isActiveDropZone, rundownLayouts } = this.props

				if (playlist.rundowns.length === 0) {
					console.debug(`Playlist ${playlist._id} has no rundowns, aborting render`)
					return null
				}

				const playbackProgressBar = createProgressBarRow(playlist)
				const playlistViewURL = getRundownPlaylistLink(playlist._id)
				const handleRundownSwap = (a: RundownId, b: RundownId) => {
					this.swapRundownOrder(a, b)
				}

				if (playlist.rundowns.length === 1 && playlist.name === playlist.rundowns[0].name) {
					// For the time being, playlists with only one rundown aren't considered
					// playlists. Therefore they are rendered without playlist markup/styling
					// and also won't be connected as drop targets (preventing other rundowns
					// from being dropped onto them and being added to them)
					// An exception is made for named playlists (which come from ENPS/blueprints,
					// and therefore should be preserved)
					return (
						<>
							<RundownListItem
								isActive={!!playlist.activationId}
								key={unprotectString(playlist.rundowns[0]._id)}
								rundown={playlist.rundowns[0]}
								rundownViewUrl={playlistViewURL}
								rundownLayouts={rundownLayouts}
								swapRundownOrder={handleRundownSwap}
								playlistId={playlist._id}
								isOnlyRundownInPlaylist={true}
							/>
							{playbackProgressBar}
						</>
					)
				}

				const rundownComponents = this.state.rundownOrder.map((rundownId) => {
					const rundown = playlist.rundowns.find((r) => r._id === rundownId)

					return rundown ? (
						<RundownListItem
							isActive={!!playlist.activationId}
							key={unprotectString(rundown._id)}
							rundown={rundown}
							rundownLayouts={rundownLayouts}
							swapRundownOrder={handleRundownSwap}
							playlistId={playlist._id}
						/>
					) : null
				})

				const expectedDuration =
					playlist.expectedDuration !== undefined &&
					(playlist.loop ? (
						<Tooltip overlay={t('This rundown will loop indefinitely')} placement="top">
							<span>
								{t('({{timecode}})', {
									timecode: RundownUtils.formatDiffToTimecode(
										playlist.expectedDuration,
										false,
										true,
										true,
										false,
										true
									),
								})}
								&nbsp;
								<LoopingIcon />
							</span>
						</Tooltip>
					) : (
						RundownUtils.formatDiffToTimecode(playlist.expectedDuration, false, true, true, false, true)
					))

				const classNames = ClassNames(['rundown-playlist', { droptarget: isActiveDropZone }])

				return connectDropTarget(
					<li className={classNames}>
						<header className="rundown-playlist__header">
							<span>
								<h2 className="rundown-playlist__heading">
									<FontAwesomeIcon icon={faFolderOpen} />
									<span className="rundown-playlist__heading-text">
										<Link to={playlistViewURL}>
											{playlist.loop && <LoopingIcon />}
											{playlist.name}
										</Link>
									</span>
								</h2>
								{getAllowStudio() ? (
									<PlaylistRankMethodToggle
										manualSortingActive={playlist.rundownRanksAreSetInSofie === true}
										toggleCallbackHandler={() => {
											this.handleResetRundownOrderClick()
										}}
									/>
								) : null}
							</span>
							<span className="rundown-list-item__text">
								{playlist.expectedStart ? (
									<DisplayFormattedTime timestamp={playlist.expectedStart} t={t} />
								) : playlist.expectedEnd && playlist.expectedDuration ? (
									<DisplayFormattedTime timestamp={playlist.expectedEnd - playlist.expectedDuration} t={t} />
								) : (
									<span className="dimmed">{t('Not set')}</span>
								)}
							</span>
							<span className="rundown-list-item__text">
								{expectedDuration ? (
									expectedDuration
								) : playlist.loop ? (
									<Tooltip overlay={t('This rundown will loop indefinitely')} placement="top">
										<LoopingIcon />
									</Tooltip>
								) : (
									<span className="dimmed">{t('Not set')}</span>
								)}
							</span>
							<span className="rundown-list-item__text">
								{playlist.expectedEnd ? (
									<DisplayFormattedTime timestamp={playlist.expectedEnd} t={t} />
								) : playlist.expectedStart && playlist.expectedDuration ? (
									<DisplayFormattedTime timestamp={playlist.expectedStart + playlist.expectedDuration} t={t} />
								) : (
									<span className="dimmed">{t('Not set')}</span>
								)}
							</span>
							<span className="rundown-list-item__text">
								<DisplayFormattedTime timestamp={playlist.modified} t={t} />
							</span>
							{rundownLayouts.some(
								(l) =>
									(RundownLayoutsAPI.isLayoutForShelf(l) && l.exposeAsStandalone) ||
									(RundownLayoutsAPI.isLayoutForRundownView(l) && l.exposeAsSelectableLayout)
							) && (
								<span className="rundown-list-item__text">
									<RundownViewLayoutSelection
										rundowns={playlist.rundowns}
										rundownLayouts={rundownLayouts}
										playlistId={playlist._id}
									/>
								</span>
							)}
							<span className="rundown-list-item__actions"></span>
						</header>
						<ol className="rundown-playlist__rundowns">{rundownComponents}</ol>
						<footer>{playbackProgressBar ? playbackProgressBar : null}</footer>
					</li>
				)
			}
		}
	)
)

function createProgressBarRow(playlist: RundownPlaylistUi): React.ReactElement | null {
	if (playlist.activationId && playlist.expectedDuration !== undefined && playlist.startedPlayback) {
		return <ActiveProgressBar rundownPlaylist={playlist} />
	}

	return null
}
