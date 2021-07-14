import * as React from 'react'
import CoreIcons from '@nrk/core-icons/jsx'
import { faChevronDown, faChevronRight, faCheck, faStopCircle, faRedo, faFlag } from '@fortawesome/free-solid-svg-icons'
import * as VelocityReact from 'velocity-react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import ClassNames from 'classnames'
import { MomentFromNow } from '../../lib/Moment'
import { CircularProgressbar } from 'react-circular-progressbar'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import { MediaWorkFlow, MediaWorkFlows, MediaWorkFlowId } from '../../../lib/collections/MediaWorkFlows'
import { MediaWorkFlowStep, MediaWorkFlowSteps } from '../../../lib/collections/MediaWorkFlowSteps'
import * as i18next from 'react-i18next'
import { extendMandadory, unprotectString } from '../../../lib/lib'
import * as _ from 'underscore'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { PubSub } from '../../../lib/api/pubsub'
import { Spinner } from '../../lib/Spinner'
import { sofieWarningIcon as WarningIcon } from '../../lib/notifications/warningIcon'
import { doUserAction, UserAction } from '../../lib/userAction'
import { MeteorCall } from '../../../lib/api/methods'
import Tooltip from 'rc-tooltip'
import { MediaManagerAPI } from '../../../lib/api/mediaManager'
import { getAllowConfigure, getAllowStudio } from '../../lib/localStorage'

interface IMediaManagerStatusProps {}

interface MediaWorkFlowUi extends MediaWorkFlow {
	steps: MediaWorkFlowStep[]
}

interface IMediaManagerStatusTrackedProps {
	workFlows: MediaWorkFlowUi[]
}

interface IMediaManagerStatusState {
	expanded: {
		[mediaWorkFlowId: string]: boolean
	}
}

interface IItemProps {
	item: MediaWorkFlowUi
	expanded: _.Dictionary<boolean>
	toggleExpanded: (id: MediaWorkFlowId) => void
	actionRestart: (event: React.MouseEvent<HTMLElement>, workflow: MediaWorkFlowUi) => void
	actionAbort: (event: React.MouseEvent<HTMLElement>, workflow: MediaWorkFlowUi) => void
	actionPrioritize: (event: React.MouseEvent<HTMLElement>, workflow: MediaWorkFlowUi) => void
}

const iconEnterAnimation = {
	translateY: ['0%', '-100%'],
}

const iconLeaveAnimation = {
	translateY: ['100%', '0%'],
}

const subIconEnterAnimation = {
	translateY: ['0%', '100%'],
	opacity: [1, 1],
}

const subIconLeaveAnimation = {
	opacity: [0, 1],
}

type TFunc = (label: string, attrs?: object) => string

function actionLabel(t: TFunc, action: string): string {
	switch (action) {
		case MediaManagerAPI.WorkStepAction.COPY:
			return t('File Copy')
		case MediaManagerAPI.WorkStepAction.DELETE:
			return t('File Delete')
		case MediaManagerAPI.WorkStepAction.SCAN:
			return t('Check file size')
		case MediaManagerAPI.WorkStepAction.GENERATE_METADATA:
			return t('Scan File')
		case MediaManagerAPI.WorkStepAction.GENERATE_THUMBNAIL:
			return t('Generate Thumbnail')
		case MediaManagerAPI.WorkStepAction.GENERATE_PREVIEW:
			return t('Generate Preview')
		default:
			return t('Unknown action: {{action}}', { action })
	}
}

function workFlowStatusLabel(
	t: TFunc,
	success: boolean,
	finished: boolean,
	keyFinishedOk: boolean,
	currentTask: MediaWorkFlowStep | undefined
): React.ReactChild {
	if (success && finished) {
		return (
			<React.Fragment>
				<CoreIcons.NrkCheck />
				{t('Done')}
			</React.Fragment>
		)
	} else if (!success && finished) {
		return (
			<React.Fragment>
				<WarningIcon />
				{t('Failed')}
			</React.Fragment>
		)
	} else if (!finished && currentTask && currentTask.status === MediaManagerAPI.WorkStepStatus.WORKING) {
		return (
			<React.Fragment>
				<Spinner className="working-spinner" size="medium" />
				{keyFinishedOk ? t('Working, Media Available') : t('Working')}
			</React.Fragment>
		)
	} else if (!finished && !currentTask) {
		return t('Pending')
	} else {
		return t('Unknown')
	}
}

function workStepStatusLabel(t: TFunc, step: MediaWorkFlowStep): string {
	switch (step.status) {
		case MediaManagerAPI.WorkStepStatus.BLOCKED:
			return t('Blocked')
		case MediaManagerAPI.WorkStepStatus.CANCELED:
			return t('Canceled')
		case MediaManagerAPI.WorkStepStatus.DONE:
			return t('Done')
		case MediaManagerAPI.WorkStepStatus.ERROR:
			return t('Error')
		case MediaManagerAPI.WorkStepStatus.IDLE:
			return t('Idle')
		case MediaManagerAPI.WorkStepStatus.SKIPPED:
			return t('Skipped')
		case MediaManagerAPI.WorkStepStatus.WORKING:
			if (step.progress) {
				return t('Step progress: {{progress}}', { progress: Math.round(step.progress * 100) + '%' })
			} else {
				return t('Processing')
			}
		default:
			return t('Unknown: {{status}}', { state: step.status })
	}
}

const MediaManagerWorkFlowItem: React.FunctionComponent<IItemProps & i18next.WithTranslation> = (
	props: IItemProps & i18next.WithTranslation
) => {
	const mediaWorkflow = props.item
	const t = props.t

	const expanded = props.expanded[unprotectString(mediaWorkflow._id)] === true
	const finishedOK = mediaWorkflow.success && mediaWorkflow.finished
	const finishedError = !mediaWorkflow.success && mediaWorkflow.finished
	const criticalSteps = mediaWorkflow.steps.filter((j) => j.criticalStep)
	const keyFinishedOK =
		criticalSteps.length === 0
			? false
			: criticalSteps.reduce((memo, item) => {
					return memo && item.status === MediaManagerAPI.WorkStepStatus.DONE
			  }, true)
	const currentTask = mediaWorkflow.steps
		.sort((a, b) => b.priority - a.priority)
		.find(
			(i) => i.status === MediaManagerAPI.WorkStepStatus.WORKING || i.status === MediaManagerAPI.WorkStepStatus.ERROR
		)
	const progress =
		mediaWorkflow.steps
			.map((i) => {
				switch (i.status) {
					case MediaManagerAPI.WorkStepStatus.DONE:
						return 1
					case MediaManagerAPI.WorkStepStatus.WORKING:
						return i.progress || 0
					default:
						return 0
				}
			})
			.reduce((memo, i) => memo + i, 0) / mediaWorkflow.steps.length

	return (
		<div
			className={ClassNames('workflow mbs', {
				expanded: expanded,

				keyOk: keyFinishedOK,
				ok: finishedOK,
				error: finishedError,
			})}
		>
			<div className="workflow__header pas">
				<div className="workflow__header__progress">
					<VelocityReact.VelocityComponent
						animation={finishedOK ? iconEnterAnimation : iconLeaveAnimation}
						duration={300}
						easing="easeIn"
					>
						<div className="big-status ok">
							<FontAwesomeIcon icon={faCheck} />
						</div>
					</VelocityReact.VelocityComponent>
					<VelocityReact.VelocityComponent
						animation={finishedError ? iconEnterAnimation : iconLeaveAnimation}
						duration={300}
						easing="easeIn"
					>
						<div className="big-status error">
							<WarningIcon />
						</div>
					</VelocityReact.VelocityComponent>
					<VelocityReact.VelocityComponent
						animation={!finishedOK && !finishedError ? iconEnterAnimation : iconLeaveAnimation}
						duration={300}
						easing="easeIn"
					>
						<CircularProgressbar
							value={progress * 100} // TODO: initialAnimation={true} removed, make the animation other way if needed
							text={Math.round(progress * 100) + '%'}
							strokeWidth={10}
							styles={{
								path: { stroke: `#1769ff`, strokeLinecap: 'round' },
								trail: { stroke: '#E0E3E4' },
								text: { fill: '#252627', fontSize: '170%', transform: 'translate(0, 8%)', textAnchor: 'middle' },
							}}
						/>
					</VelocityReact.VelocityComponent>
					<VelocityReact.VelocityComponent
						animation={!finishedOK && !finishedError && keyFinishedOK ? subIconEnterAnimation : subIconLeaveAnimation}
						duration={300}
						easing="easeIn"
					>
						<div className="big-status sub-icon ok">
							<FontAwesomeIcon icon={faCheck} />
						</div>
					</VelocityReact.VelocityComponent>
				</div>
				<div className="workflow__header__summary">
					{mediaWorkflow.comment && mediaWorkflow.name !== mediaWorkflow.comment ? (
						<div className="workflow__header__name">
							<span className="workflow__header__name__name">{mediaWorkflow.name || 'Unnamed Workflow'}</span>
							<span className="workflow__header__name__comment">{mediaWorkflow.comment}</span>
						</div>
					) : (
						<div className="workflow__header__name">{mediaWorkflow.name || 'Unnamed Workflow'}</div>
					)}
					<div className="workflow__header__created">
						<MomentFromNow>{mediaWorkflow.created}</MomentFromNow>
					</div>
					<div className="workflow__header__expand" onClick={() => props.toggleExpanded(mediaWorkflow._id)}>
						{expanded ? t('Collapse') : t('Details')}
						{expanded ? <FontAwesomeIcon icon={faChevronDown} /> : <FontAwesomeIcon icon={faChevronRight} />}
					</div>
					<div className="workflow__header__status">
						{workFlowStatusLabel(t, mediaWorkflow.success, mediaWorkflow.finished, keyFinishedOK, currentTask)}
					</div>
					<div className="workflow__header__current-task workflow__step">
						{currentTask && (
							<React.Fragment>
								<div className="workflow__step__action pts">{actionLabel(t, currentTask.action)}</div>
								<div className="workflow__step__status pts">{workStepStatusLabel(t, currentTask)}</div>
							</React.Fragment>
						)}
					</div>
				</div>
				<div className="workflow__header__actions">
					<Tooltip overlay={t('Restart')} placement="top">
						<button className="action-btn" onClick={(e) => props.actionRestart(e, mediaWorkflow)}>
							<FontAwesomeIcon icon={faRedo} />
						</button>
					</Tooltip>
					<Tooltip overlay={t('Abort')} placement="top">
						<button
							className="action-btn"
							disabled={mediaWorkflow.finished}
							onClick={(e) => props.actionAbort(e, mediaWorkflow)}
						>
							<FontAwesomeIcon icon={faStopCircle} />
						</button>
					</Tooltip>
					<Tooltip overlay={t('Prioritize')} placement="top">
						<button
							className={ClassNames('action-btn', {
								prioritized: mediaWorkflow.priority > 1,
							})}
							disabled={mediaWorkflow.finished}
							onClick={(e) => props.actionPrioritize(e, mediaWorkflow)}
						>
							<FontAwesomeIcon icon={faFlag} />
						</button>
					</Tooltip>
				</div>
			</div>
			<VelocityReact.VelocityTransitionGroup
				enter={{
					animation: 'slideDown',
					easing: 'ease-out',
					duration: 150,
					maxHeight: 0,
					overflow: 'hidden',
				}}
				leave={{
					animation: 'slideUp',
					easing: 'ease-in',
					duration: 150,
					overflow: 'hidden',
				}}
			>
				{expanded && (
					<div>
						{mediaWorkflow.steps
							.sort((a, b) => b.priority - a.priority)
							.map((step) => (
								<div
									className={ClassNames('workflow__step', {
										ok: step.status === MediaManagerAPI.WorkStepStatus.DONE,
										error: step.status === MediaManagerAPI.WorkStepStatus.ERROR,
										working: step.status === MediaManagerAPI.WorkStepStatus.WORKING,
									})}
									key={unprotectString(step._id)}
								>
									<div className="workflow__step__action pas">{actionLabel(t, step.action)}</div>
									<div className="workflow__step__status pas">{workStepStatusLabel(t, step)}</div>
									<div className="workflow__step__progress progress-bar">
										<div
											className="pb-indicator"
											style={{
												width: (step.progress || 0) * 100 + '%',
											}}
										/>
									</div>
									{step.messages && step.messages.length > 0 && (
										<ul className="workflow__step__messages pas man">
											{step.messages.map((k, key) => (
												<li key={key}>{k}</li>
											))}
										</ul>
									)}
								</div>
							))}
					</div>
				)}
			</VelocityReact.VelocityTransitionGroup>
		</div>
	)
}

export const MediaManagerStatus = translateWithTracker<IMediaManagerStatusProps, {}, IMediaManagerStatusTrackedProps>(
	(_props: IMediaManagerStatusProps) => {
		return {
			workFlows: MediaWorkFlows.find({})
				.fetch()
				.map((i) =>
					extendMandadory<MediaWorkFlow, MediaWorkFlowUi>(i, {
						steps: MediaWorkFlowSteps.find({
							workFlowId: i._id,
						}).fetch(),
					})
				),
		}
	}
)(
	class MediaManagerStatus extends MeteorReactComponent<
		Translated<IMediaManagerStatusProps & IMediaManagerStatusTrackedProps>,
		IMediaManagerStatusState
	> {
		constructor(props) {
			super(props)

			this.state = {
				expanded: {},
			}
		}

		componentDidMount() {
			// Subscribe to data:
			this.subscribe(PubSub.mediaWorkFlows, {}) // TODO: add some limit
			this.subscribe(PubSub.mediaWorkFlowSteps, {})
		}

		toggleExpanded = (workFlowId: MediaWorkFlowId) => {
			this.state.expanded[unprotectString(workFlowId)] = !this.state.expanded[unprotectString(workFlowId)]
			this.setState({
				expanded: this.state.expanded,
			})
		}
		actionRestart = (event: React.MouseEvent<HTMLElement>, workflow: MediaWorkFlowUi) => {
			doUserAction(this.props.t, event, UserAction.RESTART_MEDIA_WORKFLOW, (e) =>
				MeteorCall.userAction.mediaRestartWorkflow(e, workflow._id)
			)
		}
		actionAbort = (event: React.MouseEvent<HTMLElement>, workflow: MediaWorkFlowUi) => {
			doUserAction(this.props.t, event, UserAction.ABORT_MEDIA_WORKFLOW, (e) =>
				MeteorCall.userAction.mediaAbortWorkflow(e, workflow._id)
			)
		}
		actionPrioritize = (event: React.MouseEvent<HTMLElement>, workflow: MediaWorkFlowUi) => {
			doUserAction(this.props.t, event, UserAction.PRIORITIZE_MEDIA_WORKFLOW, (e) =>
				MeteorCall.userAction.mediaPrioritizeWorkflow(e, workflow._id)
			)
		}
		actionRestartAll = (event: React.MouseEvent<HTMLElement>) => {
			doUserAction(this.props.t, event, UserAction.RESTART_MEDIA_WORKFLOW, (e) =>
				MeteorCall.userAction.mediaRestartAllWorkflows(e)
			)
		}
		actionAbortAll = (event: React.MouseEvent<HTMLElement>) => {
			doUserAction(this.props.t, event, UserAction.ABORT_ALL_MEDIA_WORKFLOWS, (e) =>
				MeteorCall.userAction.mediaAbortAllWorkflows(e)
			)
		}

		renderWorkFlows() {
			const { t, i18n, tReady } = this.props

			return this.props.workFlows
				.sort((a, b) => b.created - a.created)
				.sort((a, b) => b.priority - a.priority)
				.map((mediaWorkflow) => {
					return (
						<MediaManagerWorkFlowItem
							expanded={this.state.expanded}
							item={mediaWorkflow}
							key={unprotectString(mediaWorkflow._id)}
							t={t}
							i18n={i18n}
							tReady={tReady}
							toggleExpanded={this.toggleExpanded}
							actionRestart={this.actionRestart}
							actionAbort={this.actionAbort}
							actionPrioritize={this.actionPrioritize}
						/>
					)
				})
		}

		render() {
			const { t } = this.props

			return (
				<div className="mhl gutter media-manager-status">
					<header className="mbs">
						<h1>{t('Media Transfer Status')}</h1>
					</header>
					<div className="mod mvl alright">
						{getAllowStudio() || getAllowConfigure() ? (
							<React.Fragment>
								<button className="btn btn-secondary mls" onClick={this.actionAbortAll}>
									{t('Abort All')}
								</button>
								<button className="btn btn-secondary mls" onClick={this.actionRestartAll}>
									{t('Restart All')}
								</button>
							</React.Fragment>
						) : null}
					</div>
					<div className="mod mvl">{this.renderWorkFlows()}</div>
				</div>
			)
		}
	}
)
