import * as React from 'react'
import { Translated, translateWithTracker, withTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import * as _ from 'underscore'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { TimelineObjGeneric, Timeline } from '../../../lib/collections/Timeline'
import { getCurrentTime, Time, applyToArray, clone } from '../../../lib/lib'
import { loadScript } from '../../lib/lib'
import { PubSub } from '../../../lib/api/pubsub'
import { TimelineState, Resolver, ResolvedStates } from 'superfly-timeline'
import { transformTimeline } from '../../../lib/timeline'
import { getCurrentTimeReactive } from '../../lib/currentTimeReactive'
import { makeTableOfObject } from '../../lib/utilComponents'
import { StudioSelect } from './StudioSelect'
import { StudioId } from '../../../lib/collections/Studios'

interface ITimelineViewProps {
	match?: {
		params?: {
			studioId: StudioId
		}
	}
}
interface ITimelineViewState {}
const TimelineView = translateWithTracker<ITimelineViewProps, ITimelineViewState, {}>((_props: ITimelineViewProps) => {
	return {}
})(
	class TimelineView extends MeteorReactComponent<Translated<ITimelineViewProps>, ITimelineViewState> {
		constructor(props: Translated<ITimelineViewProps>) {
			super(props)
		}

		render() {
			const { t } = this.props

			return (
				<div className="mtl gutter">
					<header className="mvs">
						<h1>{t('Timeline')}</h1>
					</header>
					<div className="mod mvl">
						{this.props.match && this.props.match.params && (
							<div>
								<TimelineVisualizerInStudio studioId={this.props.match.params.studioId} />
								<ComponentTimelineSimulate studioId={this.props.match.params.studioId} />
							</div>
						)}
					</div>
				</div>
			)
		}
	}
)

interface ITimelineVisualizerInStudioProps {
	studioId: StudioId
}
interface ITimelineVisualizerInStudioState {
	scriptLoaded?: boolean
	scriptError?: boolean
	showDetails: any
	errorMsg?: string
}
interface ITimelineVisualizerInStudioTrackedProps {
	timeline: Array<TimelineObjGeneric>
}
export const TimelineVisualizerInStudio = translateWithTracker<
	ITimelineVisualizerInStudioProps,
	ITimelineVisualizerInStudioState,
	ITimelineVisualizerInStudioTrackedProps
>((props: ITimelineVisualizerInStudioProps) => {
	const findMeATimeline = Timeline.findOne({
		_id: props.studioId,
	})
	return {
		timeline: (findMeATimeline && findMeATimeline.timeline) || [],
	}
})(
	class TimelineVisualizerInStudio extends MeteorReactComponent<
		Translated<ITimelineVisualizerInStudioProps & ITimelineVisualizerInStudioTrackedProps>,
		ITimelineVisualizerInStudioState
	> {
		private startVisualizer: boolean = false
		private newTimeline: TimelineObjGeneric[] | null = null
		private visualizer: any = null

		constructor(props) {
			super(props)
			this.state = {
				scriptLoaded: false,
				scriptError: false,
				showDetails: null,
			}
		}
		componentDidMount() {
			this.subscribe(PubSub.timeline, {
				_id: this.props.studioId,
			})

			this.triggerLoadScript()
		}
		componentDidUpdate() {
			if (this.startVisualizer) {
				// @ts-ignore temporary implementation
				const TimelineVisualizer: any = window.TimelineVisualizer
				if (!this.visualizer) {
					// initialize
					this.visualizer = new TimelineVisualizer.TimelineVisualizer('timeline-visualizer', {
						drawPlayhead: true,
					})
					this.visualizer.on('timeline:mouseDown', (event) => {
						if (event.detail) {
							this.setState({
								showDetails: event.detail,
							})
						}
					})

					// @ts-ignore
					window.visualizer = this.visualizer
					this.visualizer.setViewPort({
						playSpeed: 1000,

						playViewPort: true,
						playPlayhead: true,
						playheadTime: getCurrentTime(),
						timestamp: getCurrentTime(),
						zoom: 10 * 1000,
					})
				}
				if (this.newTimeline) {
					try {
						this.visualizer.updateTimeline(this.newTimeline, {})
						this.newTimeline = null
						if (this.state.errorMsg) {
							this.setState({
								errorMsg: undefined,
							})
						}
					} catch (e) {
						const msg = `Failed to update timeline:\n${e}`
						this.newTimeline = null
						if (msg !== this.state.errorMsg) {
							this.setState({
								errorMsg: msg,
							})
						}
					}
				}
			}
		}
		triggerLoadScript() {
			loadScript('/scripts/timeline-visualizer.js', (err) => {
				this.setState({
					scriptLoaded: !err,
					scriptError: !!err,
				})
			})
		}
		closeDetails() {
			this.setState({
				showDetails: null,
			})
		}
		renderTimeline() {
			this.startVisualizer = true

			const timeline = this.props.timeline.map((o) => {
				const obj = clone(o)
				applyToArray(o.enable, (enable) => {
					if (enable.start === 'now') {
						enable.start = getCurrentTime()
					}
				})
				return obj
			})

			this.newTimeline = timeline

			return (
				<div>
					<canvas width="1280" height="3000" id="timeline-visualizer"></canvas>
				</div>
			)
		}
		render() {
			return (
				<div className="timeline-visualizer">
					{/* <script src='/script/timeline-visualizer.js'></script> */}
					<div>Studio: {this.props.studioId}</div>
					<div>Timeline objects: {this.props.timeline.length}</div>
					{this.state.errorMsg ? <div>{this.state.errorMsg}</div> : ''}
					<div className="timeline">
						{this.state.scriptLoaded ? (
							this.renderTimeline()
						) : this.state.scriptError ? (
							<div>Unable to load script</div>
						) : null}
					</div>
					<div className="details">
						{this.state.showDetails ? (
							<div className="content">
								<button className="btn btn-secondary btn-tight" onClick={() => this.closeDetails()}>
									Close
								</button>
								<pre>{JSON.stringify(this.state.showDetails, null, 2)}</pre>
							</div>
						) : null}
					</div>
				</div>
			)
		}
	}
)

interface ITimelineSimulateProps {
	studioId: StudioId
}
interface ITimelineSimulateTrackedProps {
	errorMsg?: string
	allStates?: ResolvedStates
	now: Time
}
interface ITimelineSimulateState {
	time: Time | null
}
export const ComponentTimelineSimulate = withTracker<
	ITimelineSimulateProps,
	ITimelineSimulateState,
	ITimelineSimulateTrackedProps
>((props: ITimelineSimulateProps) => {
	const now = getCurrentTimeReactive()

	try {
		// These properties will be exposed under this.props
		// Note that these properties are reactively recalculated
		const tlComplete = Timeline.findOne(props.studioId)
		const timeline =
			(tlComplete &&
				tlComplete.timeline
					.map((o) => {
						const obj = clone(o)
						applyToArray(o.enable, (enable) => {
							if (enable.start === 'now') {
								enable.start = getCurrentTime()
							}
						})
						return obj
					})
					.sort((a, b) => {
						if (a.id > b.id) {
							return 1
						}
						if (a.id < b.id) {
							return -1
						}
						return 0
					})) ||
			[]
		const transformed = transformTimeline(timeline)

		// TODO - dont repeat unless changed
		const tl = Resolver.resolveTimeline(transformed, { time: tlComplete?.generated || now })
		const allStates = Resolver.resolveAllStates(tl)

		return {
			now: now,
			allStates: allStates,
			timelineUpdated: tlComplete?.generated || null,
		}
	} catch (e) {
		return {
			now: now,
			errorMsg: `Failed to update timeline:\n${e}`,
			timelineUpdated: null,
		}
	}
})(
	class ComponentTimelineSimulate extends MeteorReactComponent<
		ITimelineSimulateProps & ITimelineSimulateTrackedProps,
		ITimelineSimulateState
	> {
		constructor(props: ITimelineSimulateProps & ITimelineSimulateTrackedProps) {
			super(props)

			this.state = {
				time: null,
			}
		}
		renderTimelineState(state: TimelineState) {
			return _.map(
				_.sortBy(_.values(state.layers), (o) => o.layer),
				(o) => (
					<tr key={o.layer}>
						<td>{o.layer}</td>
						<td style={{ maxWidth: '25vw', minWidth: '10vw', overflowWrap: 'anywhere' }}>{o.id}</td>
						<td>{makeTableOfObject(o.enable)}</td>
						<td>
							Start: {o.instance.start}
							<br />
							End: {o.instance.end}
						</td>
						<td>{o.content.type}</td>
						<td>{(o.classes || []).join('<br />')}</td>
						<td style={{ whiteSpace: 'pre' }}>{JSON.stringify(o.content, undefined, '\t')}</td>
					</tr>
				)
			)
		}
		render() {
			const state = this.props.allStates
				? Resolver.getState(this.props.allStates, this.state.time ?? this.props.now)
				: undefined

			const times = _.uniq((this.props.allStates?.nextEvents ?? []).map((e) => e.time))

			return (
				<div>
					<h2>Timeline state</h2>
					<p>
						Time:{' '}
						<select
							onChange={(e) => {
								const val = Number(e.target.value)
								this.setState({ time: isNaN(val) ? null : val })
							}}
							value={this.state.time ?? 'now'}
						>
							<option id="now">Now: {this.props.now}</option>
							{times.map((e) => (
								<option id={e + ''} key={e}>
									{e}
								</option>
							))}
						</select>
					</p>

					<div>
						{this.props.errorMsg ? (
							<p>{this.props.errorMsg}</p>
						) : (
							<div>
								<table className="testtools-timelinetable">
									<tbody>
										<tr>
											<th>Layer</th>
											<th>id</th>
											<th>Enable</th>
											<th>Instance Times</th>
											<th>type</th>
											<th>classes</th>
											<th>content</th>
										</tr>
										{state ? this.renderTimelineState(state) : ''}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</div>
			)
		}
	}
)

class TimelineStudioSelect extends React.Component<{}, {}> {
	render() {
		return <StudioSelect path="timeline" title="Timeline" />
	}
}

export { TimelineView, TimelineStudioSelect }
