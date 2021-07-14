import * as React from 'react'
import * as _ from 'underscore'
import { Route, Switch } from 'react-router-dom'
import { translateWithTracker, Translated } from '../lib/ReactMeteorData/ReactMeteorData'
import { RundownPlaylist, RundownPlaylists } from '../../lib/collections/RundownPlaylists'
import { Studios, Studio, StudioId } from '../../lib/collections/Studios'

import { Spinner } from '../lib/Spinner'
import { RundownView } from './RundownView'
import { MeteorReactComponent } from '../lib/MeteorReactComponent'
import { objectPathGet } from '../../lib/lib'
import { PubSub } from '../../lib/api/pubsub'

interface IProps {
	match: {
		params?: {
			studioId: StudioId
		}
		path: string
	}
}
interface ITrackedProps {
	playlist?: RundownPlaylist
	studio?: Studio
	studioId?: StudioId
	// isReady: boolean
}
interface IState {
	subsReady: boolean
}
export const ActiveRundownView = translateWithTracker<IProps, {}, ITrackedProps>((props: IProps) => {
	const studioId = objectPathGet(props, 'match.params.studioId')
	let studio
	if (studioId) {
		studio = Studios.findOne(studioId)
	}
	const playlist = RundownPlaylists.findOne({
		activationId: { $exists: true },
		studioId: studioId,
	})

	return {
		playlist,
		studio,
		studioId,
	}
})(
	class ActiveRundownView extends MeteorReactComponent<Translated<IProps & ITrackedProps>, IState> {
		constructor(props) {
			super(props)
			this.state = {
				subsReady: false,
			}
		}

		componentDidMount() {
			this.subscribe(
				PubSub.rundownPlaylists,
				_.extend(
					{
						activationId: { $exists: true },
					},
					this.props.studioId
						? {
								studioId: this.props.studioId,
						  }
						: {}
				)
			)

			if (this.props.studioId) {
				this.subscribe(PubSub.studios, {
					_id: this.props.studioId,
				})
			}

			this.autorun(() => {
				if (this.props.playlist) {
					this.subscribe(PubSub.rundowns, {
						playlistId: this.props.playlist._id,
					})
				}

				const subsReady = this.subscriptionsReady()
				if (subsReady !== this.state.subsReady) {
					this.setState({
						subsReady: subsReady,
					})
				}
			})

			document.body.classList.add('dark', 'vertical-overflow-only')
		}

		componentWillUnmount() {
			super.componentWillUnmount()
			document.body.classList.remove('dark', 'vertical-overflow-only')
		}

		componentDidUpdate() {
			document.body.classList.add('dark', 'vertical-overflow-only')
		}

		renderMessage(message: string) {
			const { t } = this.props

			return (
				<div className="rundown-view rundown-view--unpublished">
					<div className="rundown-view__label">
						<p>{message}</p>
						<p>
							<Route
								render={({ history }) => (
									<button
										className="btn btn-primary"
										onClick={() => {
											history.push('/rundowns')
										}}
									>
										{t('Return to list')}
									</button>
								)}
							/>
						</p>
					</div>
				</div>
			)
		}

		render() {
			const { t } = this.props
			if (!this.state.subsReady) {
				return (
					<div className="rundown-view rundown-view--loading">
						<Spinner />
					</div>
				)
			} else {
				if (this.props.playlist) {
					return (
						<Switch>
							<Route path={this.props.match.path} exact>
								<RundownView playlistId={this.props.playlist._id} inActiveRundownView={true} />
							</Route>
							<Route path={`${this.props.match.path}/shelf`}>
								<RundownView playlistId={this.props.playlist._id} inActiveRundownView={true} onlyShelf={true} />
							</Route>
						</Switch>
					)
				} else if (this.props.studio) {
					return this.renderMessage(t('There is no rundown active in this studio.'))
				} else if (this.props.studioId) {
					return this.renderMessage(t("This studio doesn't exist."))
				} else {
					return this.renderMessage(t('There are no active rundowns.'))
				}
			}
		}
	}
)
