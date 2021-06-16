import Tooltip from 'rc-tooltip'
import * as React from 'react'
import {
	DragElementWrapper,
	DropTarget,
	DropTargetCollector,
	DropTargetConnector,
	DropTargetMonitor,
	DropTargetSpec,
} from 'react-dnd'
import { MeteorCall } from '../../lib/api/methods'
import { PubSub } from '../../lib/api/pubsub'
import { StatusResponse } from '../../lib/api/systemStatus'
import { GENESIS_SYSTEM_VERSION, getCoreSystem, ICoreSystem } from '../../lib/collections/CoreSystem'
import { RundownLayoutBase, RundownLayouts } from '../../lib/collections/RundownLayouts'
import { RundownPlaylist, RundownPlaylists } from '../../lib/collections/RundownPlaylists'
import { Rundown, RundownId, Rundowns } from '../../lib/collections/Rundowns'
import { getAllowConfigure, getHelpMode } from '../lib/localStorage'
import { NotificationCenter, Notification, NoticeLevel } from '../lib/notifications/notifications'
import { Studios } from '../../lib/collections/Studios'
import { ShowStyleBases } from '../../lib/collections/ShowStyleBases'
import { ShowStyleVariants } from '../../lib/collections/ShowStyleVariants'
import { extendMandadory, literal, unprotectString } from '../../lib/lib'
import { MeteorReactComponent } from '../lib/MeteorReactComponent'
import { Translated, translateWithTracker } from '../lib/ReactMeteorData/react-meteor-data'
import { Spinner } from '../lib/Spinner'
import { isRundownDragObject, RundownListDragDropTypes } from './RundownList/DragAndDropTypes'
import { GettingStarted } from './RundownList/GettingStarted'
import { RegisterHelp } from './RundownList/RegisterHelp'
import { RundownDropZone } from './RundownList/RundownDropZone'
import { RundownListFooter } from './RundownList/RundownListFooter'
import RundownPlaylistDragLayer from './RundownList/RundownPlaylistDragLayer'
import { RundownPlaylistUi } from './RundownList/RundownPlaylistUi'
import { doUserAction, UserAction } from '../lib/userAction'
import { RundownLayoutsAPI } from '../../lib/api/rundownLayouts'

export enum ToolTipStep {
	TOOLTIP_START_HERE = 'TOOLTIP_START_HERE',
	TOOLTIP_RUN_MIGRATIONS = 'TOOLTIP_RUN_MIGRATIONS',
	TOOLTIP_EXTRAS = 'TOOLTIP_EXTRAS',
}

interface IRundownsListProps {
	coreSystem: ICoreSystem | undefined
	rundownPlaylists: Array<RundownPlaylistUi>
	rundownLayouts: Array<RundownLayoutBase>
}

interface IRundownsListState {
	systemStatus?: StatusResponse
	subsReady: boolean
}

interface IRundownsListDropTargetProps {
	connectDropTarget: DragElementWrapper<RundownPlaylistUi>
	activateDropZone: boolean
}

const dropTargetSpec: DropTargetSpec<IRundownsListProps> = {
	canDrop: (props: IRundownsListProps, monitor: DropTargetMonitor) => {
		/* We only accept rundowns from playlists with more than one rundown,
			since there's no point in replacing a single rundown playlist with a new
			single rundown playlist
			*/
		const item = monitor.getItem()
		if (isRundownDragObject(item)) {
			const { id } = item
			const playlist = props.rundownPlaylists.find(
				(playlist) => playlist.rundowns.findIndex((rundown) => rundown._id === id) > -1
			)
			return playlist?.rundowns !== undefined && playlist.rundowns.length > 1
		}

		console.debug('RundownList Not accepting drop of ', item)
		return false
	},
	// hover: (props, monitor) => {
	// 	console.debug('Rundown list hover', monitor.getItem())
	// }
}

const dropTargetCollector: DropTargetCollector<IRundownsListDropTargetProps, IRundownsListProps> = function (
	connect: DropTargetConnector,
	monitor: DropTargetMonitor,
	props: IRundownsListProps
): IRundownsListDropTargetProps {
	const activateDropZone = monitor.canDrop() && monitor.isOver()

	return {
		connectDropTarget: connect.dropTarget(),
		activateDropZone,
	}
}

export const RundownList = translateWithTracker((): IRundownsListProps => {
	const studios = Studios.find().fetch()
	const showStyleBases = ShowStyleBases.find().fetch()
	const showStyleVariants = ShowStyleVariants.find().fetch()
	const rundownLayouts = RundownLayouts.find({
		$or: [{ exposeAsSelectableLayout: true }, { exposeAsShelf: true }],
	}).fetch()

	return {
		coreSystem: getCoreSystem(),
		rundownPlaylists: RundownPlaylists.find({}, { sort: { created: -1 } })
			.fetch()
			.map((playlist: RundownPlaylist) => {
				const rundowns = playlist.getRundowns()

				const airStatuses: string[] = []
				const statuses: string[] = []
				const unsyncedRundowns: Rundown[] = []
				const showStyles: RundownPlaylistUi['showStyles'] = []

				for (const rundown of rundowns) {
					airStatuses.push(String(rundown.airStatus))
					statuses.push(String(rundown.status))

					if (rundown.orphaned) {
						unsyncedRundowns.push(rundown)
					}

					const showStyleBase = showStyleBases.find((style) => style._id === rundown.showStyleBaseId)
					if (showStyleBase) {
						const showStyleVariant = showStyleVariants.find((variant) => variant._id === rundown.showStyleVariantId)

						showStyles.push({
							id: showStyleBase._id,
							baseName: showStyleBase.name || undefined,
							variantName: (showStyleVariant && showStyleVariant.name) || undefined,
						})
					}
				}

				return extendMandadory<RundownPlaylist, RundownPlaylistUi>(playlist, {
					rundowns,
					unsyncedRundowns,
					showStyles,
					rundownAirStatus: airStatuses.join(', '),
					rundownStatus: statuses.join(', '),
					studioName: studios.find((s) => s._id === playlist.studioId)?.name || '',
				})
			}),
		rundownLayouts,
	}
})(
	DropTarget(
		RundownListDragDropTypes.RUNDOWN,
		dropTargetSpec,
		dropTargetCollector
	)(
		class RundownList extends MeteorReactComponent<
			Translated<IRundownsListProps> & IRundownsListDropTargetProps,
			IRundownsListState
		> {
			// private _subscriptions: Array<Meteor.SubscriptionHandle> = []
			constructor(props: Translated<IRundownsListProps> & IRundownsListDropTargetProps) {
				super(props)

				this.state = {
					subsReady: false,
				}
			}

			tooltipStep() {
				let gotPlaylists = false

				for (const playlist of this.props.rundownPlaylists) {
					if (playlist.unsyncedRundowns.length > -1) {
						gotPlaylists = true
						break
					}
				}

				if (this.props.coreSystem?.version === GENESIS_SYSTEM_VERSION && gotPlaylists === true) {
					return getAllowConfigure() ? ToolTipStep.TOOLTIP_RUN_MIGRATIONS : ToolTipStep.TOOLTIP_START_HERE
				} else {
					return ToolTipStep.TOOLTIP_EXTRAS
				}
			}

			componentDidMount() {
				const { t } = this.props

				// Subscribe to data:
				this.subscribe(PubSub.rundownPlaylists, {})
				this.subscribe(PubSub.studios, {})
				this.subscribe(PubSub.rundownLayouts, {})

				this.autorun(() => {
					const showStyleBaseIds: Set<string> = new Set()
					const showStyleVariantIds: Set<string> = new Set()
					const playlistIds: Set<string> = new Set(
						RundownPlaylists.find()
							.fetch()
							.map((i) => unprotectString(i._id))
					)

					for (const rundown of Rundowns.find().fetch()) {
						showStyleBaseIds.add(unprotectString(rundown.showStyleBaseId))
						showStyleVariantIds.add(unprotectString(rundown.showStyleVariantId))
					}

					this.subscribe(PubSub.showStyleBases, {
						_id: { $in: Array.from(showStyleBaseIds) },
					})
					this.subscribe(PubSub.showStyleVariants, {
						_id: { $in: Array.from(showStyleVariantIds) },
					})
					this.subscribe(PubSub.rundowns, {
						playlistId: { $in: Array.from(playlistIds) },
					})
				})

				this.autorun(() => {
					const subsReady = this.subscriptionsReady()
					if (subsReady !== this.state.subsReady && !this.state.subsReady) {
						this.setState({
							subsReady: subsReady,
						})
					}
				})

				MeteorCall.systemStatus
					.getSystemStatus()
					.then((systemStatus: StatusResponse) => {
						this.setState({ systemStatus })
					})
					.catch(() => {
						NotificationCenter.push(
							new Notification(
								'systemStatus_failed',
								NoticeLevel.CRITICAL,
								t('Could not get system status. Please consult system administrator.'),
								'RundownList'
							)
						)
					})
			}

			private handleRundownDrop(rundownId: RundownId) {
				const { t } = this.props
				doUserAction(t, 'drag&drop in dropzone', UserAction.RUNDOWN_ORDER_MOVE, (e) =>
					MeteorCall.userAction.moveRundown(e, rundownId, null, [rundownId])
				)
			}

			renderRundownPlaylists(list: RundownPlaylistUi[]) {
				const { t, rundownLayouts } = this.props

				if (list.length < 1) {
					return <p>{t('There are no rundowns ingested into Sofie.')}</p>
				}

				return (
					<ul className="rundown-playlists">
						{list.map((playlist) => (
							<RundownPlaylistUi
								key={unprotectString(playlist._id)}
								playlist={playlist}
								rundownLayouts={rundownLayouts}
							/>
						))}
					</ul>
				)
			}

			render() {
				const { t, rundownPlaylists, activateDropZone, connectDropTarget } = this.props

				const step = this.tooltipStep()

				const showGettingStarted =
					this.props.coreSystem?.version === GENESIS_SYSTEM_VERSION && rundownPlaylists.length === 0

				const handleDropZoneDrop = (id: RundownId) => {
					this.handleRundownDrop(id)
				}

				return (
					<React.Fragment>
						{this.props.coreSystem ? <RegisterHelp step={step} /> : null}

						{showGettingStarted === true ? <GettingStarted step={step} /> : null}

						{connectDropTarget(
							<section className="mtl gutter has-statusbar">
								<header className="mvs">
									<h1>{t('Rundowns')}</h1>
								</header>
								{this.state.subsReady ? (
									<section className="mod mvl rundown-list">
										<header className="rundown-list__header">
											<span className="rundown-list-item__name">
												<Tooltip
													overlay={t('Click on a rundown to control your studio')}
													visible={getHelpMode()}
													placement="top"
												>
													<span>{t('Rundown')}</span>
												</Tooltip>
											</span>
											{/* <span className="rundown-list-item__problems">{t('Problems')}</span> */}
											<span>{t('Show Style')}</span>
											<span>{t('On Air Start Time')}</span>
											<span>{t('Duration')}</span>
											<span>{t('Last updated')}</span>
											{this.props.rundownLayouts.some(
												(l) =>
													(RundownLayoutsAPI.IsLayoutForShelf(l) && l.exposeAsStandalone) ||
													(RundownLayoutsAPI.IsLayoutForRundownView(l) && l.exposeAsSelectableLayout)
											) && <span>{t('View Layout')}</span>}
											<span>&nbsp;</span>
										</header>
										{this.renderRundownPlaylists(rundownPlaylists)}
										<footer>
											{<RundownDropZone activated={activateDropZone} rundownDropHandler={handleDropZoneDrop} />}
										</footer>
										<RundownPlaylistDragLayer />
									</section>
								) : (
									<Spinner />
								)}
							</section>
						)}

						{this.state.systemStatus ? <RundownListFooter systemStatus={this.state.systemStatus} /> : null}
					</React.Fragment>
				)
			}
		}
	)
)
