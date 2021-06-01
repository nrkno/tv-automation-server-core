import * as React from 'react'
import * as PropTypes from 'prop-types'
import * as _ from 'underscore'
import { PieceLifespan } from '@sofie-automation/blueprints-integration'
import { RundownPlaylist, RundownPlaylistId } from '../../../lib/collections/RundownPlaylists'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import { Segments, SegmentId } from '../../../lib/collections/Segments'
import { Studio } from '../../../lib/collections/Studios'
import { SegmentTimeline, SegmentTimelineClass } from './SegmentTimeline'
import { RundownTiming, computeSegmentDuration, TimingEvent } from '../RundownView/RundownTiming/RundownTiming'
import { UIStateStorage } from '../../lib/UIStateStorage'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import {
	IOutputLayerExtended,
	ISourceLayerExtended,
	PieceExtended,
	PartExtended,
	SegmentExtended,
} from '../../../lib/Rundown'
import { IContextMenuContext, MAGIC_TIME_SCALE_FACTOR } from '../RundownView'
import { ShowStyleBase } from '../../../lib/collections/ShowStyleBases'
import { SpeechSynthesiser } from '../../lib/speechSynthesis'
import { NoteType, SegmentNote } from '../../../lib/api/notes'
import { getElementWidth } from '../../utils/dimensions'
import { isMaintainingFocus, scrollToSegment, getHeaderHeight } from '../../lib/viewPort'
import { PubSub } from '../../../lib/api/pubsub'
import { unprotectString, equalSets, equivalentArrays } from '../../../lib/lib'
import { RundownUtils } from '../../lib/rundown'
import { Settings } from '../../../lib/Settings'
import { RundownId, Rundowns } from '../../../lib/collections/Rundowns'
import { PartInstanceId, PartInstances, PartInstance } from '../../../lib/collections/PartInstances'
import { PieceInstances } from '../../../lib/collections/PieceInstances'
import { Parts, PartId, Part } from '../../../lib/collections/Parts'
import { doUserAction, UserAction } from '../../lib/userAction'
import { MeteorCall } from '../../../lib/api/methods'
import { Tracker } from 'meteor/tracker'
import { Meteor } from 'meteor/meteor'
import RundownViewEventBus, {
	RundownViewEvents,
	GoToPartEvent,
	GoToPartInstanceEvent,
} from '../RundownView/RundownViewEventBus'
import { memoizedIsolatedAutorun, slowDownReactivity } from '../../lib/reactiveData/reactiveDataHelper'
import { ScanInfoForPackages } from '../../../lib/mediaObjects'
import { getBasicNotesForSegment } from '../../../lib/rundownNotifications'

export const SIMULATED_PLAYBACK_SOFT_MARGIN = 0
export const SIMULATED_PLAYBACK_HARD_MARGIN = 2500
const SIMULATED_PLAYBACK_CROSSFADE_STEP = 0.02

export const LIVE_LINE_TIME_PADDING = 150
const LIVELINE_HISTORY_SIZE = 100
const TIMELINE_RIGHT_PADDING = LIVELINE_HISTORY_SIZE + LIVE_LINE_TIME_PADDING

export interface SegmentUi extends SegmentExtended {
	/** Output layers available in the installation used by this segment */
	outputLayers: {
		[key: string]: IOutputLayerUi
	}
	/** Source layers used by this segment */
	sourceLayers: {
		[key: string]: ISourceLayerUi
	}
}
export interface PartUi extends PartExtended {}
export interface IOutputLayerUi extends IOutputLayerExtended {
	/** Is output layer group collapsed */
	collapsed?: boolean
}
export interface ISourceLayerUi extends ISourceLayerExtended {}
export interface PieceUi extends PieceExtended {
	/** This item has already been linked to the parent item of the spanning item group */
	linked?: boolean
	/** Metadata object */
	contentMetaData?: any
	contentPackageInfos?: ScanInfoForPackages
	message?: string | null
}
interface IProps {
	id: string
	rundownId: RundownId
	segmentId: SegmentId
	segmentsIdsBefore: Set<SegmentId>
	studio: Studio
	showStyleBase: ShowStyleBase
	playlist: RundownPlaylist
	timeScale: number
	onPieceDoubleClick?: (item: PieceUi, e: React.MouseEvent<HTMLDivElement>) => void
	onPieceClick?: (piece: PieceUi, e: React.MouseEvent<HTMLDivElement>) => void
	onContextMenu?: (contextMenuContext: IContextMenuContext) => void
	onSegmentScroll?: () => void
	onHeaderNoteClick?: (segmentId: SegmentId, level: NoteType) => void
	followLiveSegments: boolean
	segmentRef?: (el: React.ComponentClass, sId: string) => void
	isLastSegment: boolean
	ownCurrentPartInstance: PartInstance | undefined
	ownNextPartInstance: PartInstance | undefined
}
interface IState {
	scrollLeft: number
	collapsedOutputs: {
		[key: string]: boolean
	}
	followLiveLine: boolean
	livePosition: number
	displayTimecode: number
	isLiveSegment: boolean
	isNextSegment: boolean
	currentLivePart: PartUi | undefined
	currentNextPart: PartUi | undefined
	autoNextPart: boolean
	timeScale: number
	maxTimeScale: number
	showingAllSegment: boolean
}
interface ITrackedProps {
	segmentui: SegmentUi | undefined
	parts: Array<PartUi>
	segmentNotes: Array<SegmentNote>
	hasRemoteItems: boolean
	hasGuestItems: boolean
	hasAlreadyPlayed: boolean
	lastValidPartIndex: number | undefined
}
export const SegmentTimelineContainer = translateWithTracker<IProps, IState, ITrackedProps>(
	(props: IProps) => {
		const segment = Segments.findOne(props.segmentId) as SegmentUi | undefined

		// We need the segment to do anything
		if (!segment) {
			return {
				segmentui: undefined,
				parts: [],
				segmentNotes: [],
				hasRemoteItems: false,
				hasGuestItems: false,
				hasAlreadyPlayed: false,
				lastValidPartIndex: undefined,
			}
		}

		const rundownNrcsName = Rundowns.findOne(segment.rundownId, { fields: { externalNRCSName: 1 } })?.externalNRCSName

		// This registers a reactive dependency on infinites-capping pieces, so that the segment can be
		// re-evaluated when a piece like that appears.
		const infinitesEndingPieces = PieceInstances.find({
			rundownId: segment.rundownId,
			dynamicallyInserted: {
				$exists: true,
			},
			'infinite.fromPreviousPart': false,
			'piece.lifespan': {
				$in: [PieceLifespan.OutOnRundownEnd, PieceLifespan.OutOnRundownChange],
			},
			reset: {
				$ne: true,
			},
		}).fetch()

		const [orderedAllPartIds, { currentPartInstance, nextPartInstance }] = slowDownReactivity(
			() =>
				[
					memoizedIsolatedAutorun(
						(_playlistId: RundownPlaylistId) =>
							(props.playlist.getAllOrderedParts(undefined, {
								fields: {
									segmentId: 1,
									_rank: 1,
								},
							}) as Pick<Part, '_id' | 'segmentId' | '_rank'>[]).map((part) => part._id),
						'playlist.getAllOrderedParts',
						props.playlist._id
					),
					memoizedIsolatedAutorun(
						(_playlistId: RundownPlaylistId, _currentPartInstanceId, _nextPartInstanceId) =>
							props.playlist.getSelectedPartInstances(),
						'playlist.getSelectedPartInstances',
						props.playlist._id,
						props.playlist.currentPartInstanceId,
						props.playlist.nextPartInstanceId
					),
				] as [PartId[], { currentPartInstance: PartInstance | undefined; nextPartInstance: PartInstance | undefined }],
			// if the rundown isn't active, run the changes ASAP, we don't care if there's going to be jank
			// if this is the current or next segment (will have those two properties defined), run the changes ASAP,
			// otherwise, trigger the updates in a window of 500-2500 ms from change
			props.playlist.activationId === undefined || props.ownCurrentPartInstance || props.ownNextPartInstance
				? 0
				: Math.random() * 2000 + 500
		)

		let o = RundownUtils.getResolvedSegment(
			props.showStyleBase,
			props.playlist,
			segment,
			props.segmentsIdsBefore,
			orderedAllPartIds,
			currentPartInstance,
			nextPartInstance,
			true,
			true
		)
		const notes: Array<SegmentNote> = getBasicNotesForSegment(
			segment,
			rundownNrcsName ?? 'NRCS',
			o.parts.map((p) => p.instance.part),
			o.parts.map((p) => p.instance)
		)
		o.parts.forEach((part) => {
			notes.push(...part.instance.part.getMinimumReactiveNotes(props.studio, props.showStyleBase))
		})

		let lastValidPartIndex = o.parts.length - 1

		for (let i = lastValidPartIndex; i > 0; i--) {
			if (o.parts[i].instance.part.invalid) {
				lastValidPartIndex = i - 1
			} else {
				break
			}
		}

		return {
			segmentui: o.segmentExtended,
			parts: o.parts,
			segmentNotes: notes,
			hasAlreadyPlayed: o.hasAlreadyPlayed,
			hasRemoteItems: o.hasRemoteItems,
			hasGuestItems: o.hasGuestItems,
			lastValidPartIndex,
		}
	},
	(data: ITrackedProps, props: IProps, nextProps: IProps): boolean => {
		// This is a potentailly very dangerous hook into the React component lifecycle. Re-use with caution.
		// Check obvious primitive changes
		if (
			props.followLiveSegments !== nextProps.followLiveSegments ||
			props.onContextMenu !== nextProps.onContextMenu ||
			props.onSegmentScroll !== nextProps.onSegmentScroll ||
			props.segmentId !== nextProps.segmentId ||
			props.segmentRef !== nextProps.segmentRef ||
			props.timeScale !== nextProps.timeScale ||
			!equalSets(props.segmentsIdsBefore, nextProps.segmentsIdsBefore)
		) {
			return true
		}
		// Check rundown changes that are important to the segment
		if (
			typeof props.playlist !== typeof nextProps.playlist ||
			(props.playlist.nextSegmentId !== nextProps.playlist.nextSegmentId &&
				(props.playlist.nextSegmentId === props.segmentId || nextProps.playlist.nextSegmentId === props.segmentId)) ||
			((props.playlist.currentPartInstanceId !== nextProps.playlist.currentPartInstanceId ||
				props.playlist.nextPartInstanceId !== nextProps.playlist.nextPartInstanceId) &&
				data.parts &&
				(data.parts.find(
					(i) =>
						i.instance._id === props.playlist.currentPartInstanceId ||
						i.instance._id === nextProps.playlist.currentPartInstanceId
				) ||
					data.parts.find(
						(i) =>
							i.instance._id === props.playlist.nextPartInstanceId ||
							i.instance._id === nextProps.playlist.nextPartInstanceId
					))) ||
			props.playlist.holdState !== nextProps.playlist.holdState ||
			props.playlist.nextTimeOffset !== nextProps.playlist.nextTimeOffset
		) {
			return true
		}
		// Check studio installation changes that are important to the segment.
		// We also could investigate just skipping this and requiring a full reload if the studio installation is changed
		if (
			typeof props.studio !== typeof nextProps.studio ||
			!_.isEqual(props.studio.settings, nextProps.studio.settings) ||
			!_.isEqual(props.showStyleBase.sourceLayers, nextProps.showStyleBase.sourceLayers) ||
			!_.isEqual(props.showStyleBase.outputLayers, nextProps.showStyleBase.outputLayers)
		) {
			return true
		}

		return false
	},
	true
)(
	class SegmentTimelineContainer extends MeteorReactComponent<Translated<IProps> & ITrackedProps, IState> {
		static contextTypes = {
			durations: PropTypes.object.isRequired,
		}

		isLiveSegment: boolean
		isVisible: boolean
		rundownCurrentPartInstanceId: PartInstanceId | null
		timelineDiv: HTMLDivElement
		intersectionObserver: IntersectionObserver | undefined
		mountedTime: number
		playbackSimulationPercentage: number = 0
		nextPartDisplayStartsAt: number

		private pastInfinitesComp: Tracker.Computation | undefined

		constructor(props: IProps & ITrackedProps) {
			super(props)

			this.state = {
				collapsedOutputs: UIStateStorage.getItemBooleanMap(
					`rundownView.${this.props.playlist._id}`,
					`segment.${props.segmentId}.outputs`,
					{}
				),
				scrollLeft: 0,
				followLiveLine: false,
				livePosition: 0,
				displayTimecode: 0,
				isLiveSegment: false,
				isNextSegment: false,
				autoNextPart: false,
				currentLivePart: undefined,
				currentNextPart: undefined,
				timeScale: props.timeScale,
				maxTimeScale: props.timeScale,
				showingAllSegment: true,
			}

			this.isLiveSegment = false
			this.isVisible = false
		}

		shouldComponentUpdate(nextProps: IProps & ITrackedProps, nextState: IState) {
			return !_.isMatch(this.props, nextProps) || !_.isMatch(this.state, nextState)
		}

		componentDidMount() {
			this.autorun(() => {
				const partIds = Parts.find(
					{
						segmentId: this.props.segmentId,
					},
					{
						fields: {
							_id: 1,
						},
					}
				).map((part) => part._id)

				this.subscribe(PubSub.pieces, {
					startRundownId: this.props.rundownId,
					startPartId: {
						$in: partIds,
					},
				})
			})
			this.autorun(() => {
				const partInstanceIds = PartInstances.find(
					{
						segmentId: this.props.segmentId,
						reset: {
							$ne: true,
						},
					},
					{
						fields: {
							_id: 1,
							part: 1,
						},
					}
				).map((instance) => instance._id)
				this.subscribeToPieceInstances(partInstanceIds)
			})
			// past inifnites subscription
			this.pastInfinitesComp = this.autorun(() => {
				const segment = Segments.findOne(this.props.segmentId, {
					fields: {
						rundownId: 1,
						_rank: 1,
					},
				})
				segment &&
					this.subscribe(PubSub.pieces, {
						startRundownId: segment.rundownId,
						startSegmentId: { $in: Array.from(this.props.segmentsIdsBefore.values()) },
						invalid: {
							$ne: true,
						},
						// same rundown, and previous segment
						lifespan: { $in: [PieceLifespan.OutOnRundownEnd, PieceLifespan.OutOnRundownChange] },
					})
			})
			SpeechSynthesiser.init()

			this.rundownCurrentPartInstanceId = this.props.playlist.currentPartInstanceId
			if (this.isLiveSegment === true) {
				this.onFollowLiveLine(true, {})
				this.startLive()
			}
			RundownViewEventBus.on(RundownViewEvents.REWIND_SEGMENTS, this.onRewindSegment)
			RundownViewEventBus.on(RundownViewEvents.GO_TO_PART, this.onGoToPart)
			RundownViewEventBus.on(RundownViewEvents.GO_TO_PART_INSTANCE, this.onGoToPartInstance)
			window.requestAnimationFrame(() => {
				this.mountedTime = Date.now()
				if (this.isLiveSegment && this.props.followLiveSegments && !this.isVisible) {
					scrollToSegment(this.props.segmentId, true).catch((error) => {
						if (!error.toString().match(/another scroll/)) console.warn(error)
					})
				}
			})
			window.addEventListener('resize', this.onWindowResize)
		}

		componentDidUpdate(prevProps: IProps & ITrackedProps) {
			let isLiveSegment = false
			let isNextSegment = false
			let currentLivePart: PartExtended | undefined = undefined
			let currentNextPart: PartExtended | undefined = undefined

			let autoNextPart = false

			if (this.props.ownCurrentPartInstance && this.props.ownCurrentPartInstance.segmentId === this.props.segmentId) {
				isLiveSegment = true
				currentLivePart = this.props.parts.find((part) => part.instance._id === this.props.ownCurrentPartInstance?._id)
			}
			if (this.props.ownNextPartInstance) {
				isNextSegment = true
				currentNextPart = this.props.parts.find((part) => part.instance._id === this.props.ownNextPartInstance?._id)
			}
			autoNextPart = !!(
				currentLivePart &&
				currentLivePart.instance.part.autoNext &&
				currentLivePart.instance.part.expectedDuration
			)
			if (isNextSegment && !isLiveSegment && !autoNextPart && this.props.ownCurrentPartInstance) {
				if (
					this.props.ownCurrentPartInstance &&
					this.props.ownCurrentPartInstance.part.expectedDuration &&
					this.props.ownCurrentPartInstance.part.autoNext
				) {
					autoNextPart = true
				}
			}

			if (this.rundownCurrentPartInstanceId !== this.props.playlist.currentPartInstanceId) {
				this.playbackSimulationPercentage = 0
			}

			this.rundownCurrentPartInstanceId = this.props.playlist.currentPartInstanceId

			// segment is becoming live
			if (this.isLiveSegment === false && isLiveSegment === true) {
				this.isLiveSegment = true
				this.onFollowLiveLine(true, {})
				this.startLive()
			}
			// segment is stopping from being live
			if (this.isLiveSegment === true && isLiveSegment === false) {
				this.isLiveSegment = false
				this.stopLive()
				if (Settings.autoRewindLeavingSegment) {
					this.onRewindSegment()
					this.onShowEntireSegment('', true)
				}

				if (this.props.segmentui && this.props.segmentui.orphaned) {
					const { t } = this.props
					// TODO: This doesn't seem right? componentDidUpdate can be triggered in a lot of different ways.
					// What is this supposed to do?
					doUserAction(t, undefined, UserAction.RESYNC_SEGMENT, (e) =>
						MeteorCall.userAction.resyncSegment('', this.props.segmentui!.rundownId, this.props.segmentui!._id)
					)
				}
			}
			if (
				// the segment isn't live, is next, and the nextPartId has changed
				!isLiveSegment &&
				isNextSegment &&
				currentNextPart &&
				this.props.playlist.nextPartInstanceId &&
				(prevProps.playlist.nextPartInstanceId !== this.props.playlist.nextPartInstanceId ||
					this.nextPartDisplayStartsAt !==
						(this.context.durations?.partDisplayStartsAt &&
							this.context.durations.partDisplayStartsAt[unprotectString(currentNextPart.partId)])) &&
				!this.state.showingAllSegment
			) {
				const nextPartDisplayStartsAt =
					this.context.durations?.partDisplayStartsAt &&
					this.context.durations.partDisplayStartsAt[unprotectString(currentNextPart.partId)]
				const partOffset =
					nextPartDisplayStartsAt -
						this.context.durations.partDisplayStartsAt[unprotectString(this.props.parts[0].instance.part._id)] || 0

				if (this.state.scrollLeft > partOffset) {
					this.setState({
						scrollLeft: partOffset,
					})
				}
				this.nextPartDisplayStartsAt = nextPartDisplayStartsAt
			}

			// rewind all scrollLeft's to 0 on rundown activate
			if (
				this.props.playlist &&
				this.props.playlist.activationId &&
				prevProps.playlist &&
				!prevProps.playlist.activationId
			) {
				this.setState({
					scrollLeft: 0,
				})
			} else if (
				this.props.playlist &&
				!this.props.playlist.activationId &&
				prevProps.playlist &&
				prevProps.playlist.activationId
			) {
				this.setState({
					livePosition: 0,
				})
			}

			if (this.props.followLiveSegments && !prevProps.followLiveSegments) {
				this.onFollowLiveLine(true, {})
			}

			if (this.pastInfinitesComp && !equalSets(this.props.segmentsIdsBefore, prevProps.segmentsIdsBefore)) {
				this.pastInfinitesComp.invalidate()
			}

			if (!isLiveSegment && this.props.parts !== prevProps.parts) {
				this.updateMaxTimeScale().catch(console.error)
			}

			if (!isLiveSegment && this.props.parts !== prevProps.parts && this.state.showingAllSegment) {
				this.showEntireSegment()
			}

			this.setState({
				isLiveSegment,
				isNextSegment,
				currentLivePart,
				currentNextPart,
				autoNextPart,
			})
		}

		componentWillUnmount() {
			this._cleanUp()
			if (this.intersectionObserver && this.state.isLiveSegment && this.props.followLiveSegments) {
				if (typeof this.props.onSegmentScroll === 'function') this.props.onSegmentScroll()
			}
			if (this.partInstanceSub !== undefined) {
				const sub = this.partInstanceSub
				setTimeout(() => {
					sub.stop()
				}, 500)
			}
			this.stopLive()
			RundownViewEventBus.off(RundownViewEvents.REWIND_SEGMENTS, this.onRewindSegment)
			RundownViewEventBus.off(RundownViewEvents.GO_TO_PART, this.onGoToPart)
			RundownViewEventBus.off(RundownViewEvents.GO_TO_PART_INSTANCE, this.onGoToPartInstance)
			window.removeEventListener('resize', this.onWindowResize)
		}

		private partInstanceSub: Meteor.SubscriptionHandle | undefined
		private partInstanceSubPartInstanceIds: PartInstanceId[] | undefined
		private subscribeToPieceInstancesInner = (partInstanceIds: PartInstanceId[]) => {
			this.partInstanceSubDebounce = undefined
			if (
				this.partInstanceSubPartInstanceIds &&
				equivalentArrays(this.partInstanceSubPartInstanceIds, partInstanceIds)
			) {
				// old subscription is equivalent to the new one, don't do anything
				return
			}
			// avoid having the subscription automatically scrapped by a re-run of the autorun
			Tracker.nonreactive(() => {
				if (this.partInstanceSub !== undefined) {
					this.partInstanceSub.stop()
				}
				// we handle this subscription manually
				this.partInstanceSub = Meteor.subscribe(PubSub.pieceInstances, {
					rundownId: this.props.rundownId,
					partInstanceId: {
						$in: partInstanceIds,
					},
					reset: {
						$ne: true,
					},
				})
				this.partInstanceSubPartInstanceIds = partInstanceIds
			})
		}
		private partInstanceSubDebounce: NodeJS.Timeout | undefined
		private subscribeToPieceInstances(partInstanceIds: PartInstanceId[]) {
			// run the first subscribe immediately, to avoid unneccessary wait time during bootup
			if (this.partInstanceSub === undefined) {
				this.subscribeToPieceInstancesInner(partInstanceIds)
			} else {
				if (this.partInstanceSubDebounce !== undefined) {
					clearTimeout(this.partInstanceSubDebounce)
				}
				this.partInstanceSubDebounce = setTimeout(this.subscribeToPieceInstancesInner, 40, partInstanceIds)
			}
		}

		onWindowResize = _.throttle(() => {
			if (this.state.showingAllSegment) {
				this.updateMaxTimeScale()
					.then(() => this.showEntireSegment())
					.catch(console.error)
			}
		}, 250)

		onTimeScaleChange = (timeScaleVal: number) => {
			if (Number.isFinite(timeScaleVal) && timeScaleVal > 0) {
				this.setState((state) => ({
					timeScale: timeScaleVal,
					showingAllSegment: timeScaleVal === state.maxTimeScale,
				}))
			}
		}

		onCollapseOutputToggle = (outputLayer: IOutputLayerUi) => {
			let collapsedOutputs = { ...this.state.collapsedOutputs }
			collapsedOutputs[outputLayer._id] =
				outputLayer.isDefaultCollapsed && collapsedOutputs[outputLayer._id] === undefined
					? false
					: collapsedOutputs[outputLayer._id] !== true
			UIStateStorage.setItem(
				`rundownView.${this.props.playlist._id}`,
				`segment.${this.props.segmentId}.outputs`,
				collapsedOutputs
			)
			this.setState({ collapsedOutputs })
		}
		/** The user has scrolled scrollLeft seconds to the left in a child component */
		onScroll = (scrollLeft: number, event: any) => {
			this.setState({
				scrollLeft: scrollLeft,
				followLiveLine: false,
			})
			if (typeof this.props.onSegmentScroll === 'function') this.props.onSegmentScroll()
		}

		onRewindSegment = () => {
			if (!this.isLiveSegment) {
				this.updateMaxTimeScale()
					.then(() => {
						this.showEntireSegment()
						this.setState({
							scrollLeft: 0,
							livePosition: 0,
						})
					})
					.catch(console.error)
			}
		}

		onGoToPart = (e: GoToPartEvent) => {
			if (this.props.segmentId === e.segmentId) {
				const part = this.props.parts.find((part) => part.partId === e.partId)
				if (part) {
					this.setState({
						scrollLeft: part.startsAt,
					})
				}
			}
		}

		onGoToPartInstance = (e: GoToPartInstanceEvent) => {
			if (this.props.segmentId === e.segmentId) {
				for (const part of this.props.parts) {
					if (part.instance._id === e.partInstanceId) {
						this.setState({
							scrollLeft: part.startsAt,
						})
					}
				}
			}
		}

		onAirLineRefresh = (e: TimingEvent) => {
			if (this.state.isLiveSegment && this.state.currentLivePart) {
				const currentLivePartInstance = this.state.currentLivePart.instance
				const currentLivePart = currentLivePartInstance.part

				let simulationPercentage = this.playbackSimulationPercentage
				const partOffset =
					(this.context.durations &&
						this.context.durations.partDisplayStartsAt &&
						this.context.durations.partDisplayStartsAt[unprotectString(currentLivePart._id)] -
							this.context.durations.partDisplayStartsAt[unprotectString(this.props.parts[0].instance.part._id)]) ||
					0

				let isExpectedToPlay = !!currentLivePartInstance.timings?.startedPlayback
				const lastTake = currentLivePartInstance.timings?.take
				const lastStartedPlayback = currentLivePartInstance.timings?.startedPlayback
				const lastTakeOffset = currentLivePartInstance.timings?.playOffset || 0
				let virtualStartedPlayback =
					(lastTake || 0) > (lastStartedPlayback || -1)
						? lastTake
						: lastStartedPlayback
						? lastStartedPlayback - lastTakeOffset
						: undefined
				if (lastTake && lastTake + SIMULATED_PLAYBACK_HARD_MARGIN > e.detail.currentTime) {
					isExpectedToPlay = true

					// If we are between the SOFT_MARGIN and HARD_MARGIN and the take timing has already flowed through
					if (lastStartedPlayback && lastTake + SIMULATED_PLAYBACK_SOFT_MARGIN < e.detail.currentTime) {
						if (lastTake < lastStartedPlayback && simulationPercentage < 1) {
							virtualStartedPlayback =
								simulationPercentage * lastStartedPlayback + (1 - simulationPercentage) * lastTake
						}
					}
				}

				let newLivePosition =
					isExpectedToPlay && virtualStartedPlayback
						? partOffset + e.detail.currentTime - virtualStartedPlayback + lastTakeOffset
						: partOffset + lastTakeOffset

				if (lastStartedPlayback && simulationPercentage < 1) {
					this.playbackSimulationPercentage = Math.min(simulationPercentage + SIMULATED_PLAYBACK_CROSSFADE_STEP, 1)
				}

				this.setState({
					livePosition: newLivePosition,
					scrollLeft: this.state.followLiveLine
						? Math.max(newLivePosition - LIVELINE_HISTORY_SIZE / this.state.timeScale, 0)
						: this.state.scrollLeft,
				})
			}
		}

		visibleChanged = (entries: IntersectionObserverEntry[]) => {
			if (entries[0].intersectionRatio < 0.99 && !isMaintainingFocus() && Date.now() - this.mountedTime > 2000) {
				if (typeof this.props.onSegmentScroll === 'function') this.props.onSegmentScroll()
				this.isVisible = false
			} else {
				this.isVisible = true
			}
		}

		startLive = () => {
			window.addEventListener(RundownTiming.Events.timeupdateHR, this.onAirLineRefresh)
			// As of Chrome 76, IntersectionObserver rootMargin works in screen pixels when root
			// is viewport. This seems like an implementation bug and IntersectionObserver is
			// an Experimental Feature in Chrome, so this might change in the future.
			// Additionally, it seems that the screen scale factor needs to be taken into account as well
			const zoomFactor = window.outerWidth / window.innerWidth / window.devicePixelRatio
			this.intersectionObserver = new IntersectionObserver(this.visibleChanged, {
				rootMargin: `-${getHeaderHeight() * zoomFactor}px 0px -${20 * zoomFactor}px 0px`,
				threshold: [0, 0.25, 0.5, 0.75, 0.98],
			})
			this.intersectionObserver.observe(this.timelineDiv.parentElement!.parentElement!)
		}

		stopLive = () => {
			window.removeEventListener(RundownTiming.Events.timeupdateHR, this.onAirLineRefresh)
			if (this.intersectionObserver) {
				this.intersectionObserver.disconnect()
				this.intersectionObserver = undefined
			}
		}

		onFollowLiveLine = (state: boolean, event: any) => {
			this.setState({
				followLiveLine: state,
				scrollLeft: Math.max(this.state.livePosition - LIVELINE_HISTORY_SIZE / this.state.timeScale, 0),
			})
		}

		segmentRef = (el: SegmentTimelineClass, segmentId: SegmentId) => {
			this.timelineDiv = el.timeline
		}

		getShowAllTimeScale = () => {
			let newScale =
				(getElementWidth(this.timelineDiv) - TIMELINE_RIGHT_PADDING || 1) /
				(computeSegmentDuration(
					this.context.durations,
					this.props.parts.map((i) => i.instance.part._id),
					true
				) || 1)
			newScale = Math.min(MAGIC_TIME_SCALE_FACTOR * Settings.defaultTimeScale, newScale)
			return newScale
		}

		updateMaxTimeScale = () => {
			const maxTimeScale = this.getShowAllTimeScale()
			return new Promise<number>((resolve) =>
				this.setState(
					{
						maxTimeScale,
					},
					() => resolve(maxTimeScale)
				)
			)
		}

		showEntireSegment = () => {
			this.onTimeScaleChange(this.getShowAllTimeScale())
		}

		onShowEntireSegment = (event: any, limitScale?: boolean) => {
			this.setState({
				scrollLeft: 0,
				followLiveLine: this.state.isLiveSegment ? true : this.state.followLiveLine,
			})
			this.showEntireSegment()
		}

		onZoomChange = (newScale: number, e: any) => {
			this.onTimeScaleChange(newScale)
		}

		render() {
			return (
				(this.props.segmentui && (
					<SegmentTimeline
						id={this.props.id}
						segmentRef={this.segmentRef}
						key={unprotectString(this.props.segmentui._id)}
						segment={this.props.segmentui}
						studio={this.props.studio}
						parts={this.props.parts}
						segmentNotes={this.props.segmentNotes}
						timeScale={this.state.timeScale}
						maxTimeScale={this.state.maxTimeScale}
						onRecalculateMaxTimeScale={this.updateMaxTimeScale}
						showingAllSegment={this.state.showingAllSegment}
						onItemClick={this.props.onPieceClick}
						onItemDoubleClick={this.props.onPieceDoubleClick}
						onCollapseOutputToggle={this.onCollapseOutputToggle}
						collapsedOutputs={this.state.collapsedOutputs}
						scrollLeft={this.state.scrollLeft}
						playlist={this.props.playlist}
						followLiveSegments={this.props.followLiveSegments}
						isLiveSegment={this.state.isLiveSegment}
						isNextSegment={this.state.isNextSegment}
						isQueuedSegment={this.props.playlist.nextSegmentId === this.props.segmentId}
						hasRemoteItems={this.props.hasRemoteItems}
						hasGuestItems={this.props.hasGuestItems}
						autoNextPart={this.state.autoNextPart}
						hasAlreadyPlayed={this.props.hasAlreadyPlayed}
						followLiveLine={this.state.followLiveLine}
						liveLineHistorySize={LIVELINE_HISTORY_SIZE}
						livePosition={this.state.livePosition}
						onContextMenu={this.props.onContextMenu}
						onFollowLiveLine={this.onFollowLiveLine}
						onShowEntireSegment={this.onShowEntireSegment}
						onZoomChange={this.onZoomChange}
						onScroll={this.onScroll}
						isLastSegment={this.props.isLastSegment}
						lastValidPartIndex={this.props.lastValidPartIndex}
						onHeaderNoteClick={this.props.onHeaderNoteClick}
					/>
				)) ||
				null
			)
		}
	}
)
