import * as React from 'react'
import { withTranslation } from 'react-i18next'
import { Translated } from '../../lib/ReactMeteorData/react-meteor-data'
import { Route, Switch, NavLink } from 'react-router-dom'

import { TimelineView, TimelineStudioSelect } from './Timeline'
import { UserLogPlayerPage, UserLogRundownSelect } from './UserLogPlayer'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { PubSub } from '../../../lib/api/pubsub'

interface IStatusMenuProps {
	match?: any
}
type IStatusMenuState = {}
const StatusMenu = withTranslation()(
	class StatusMenu extends React.Component<Translated<IStatusMenuProps>, IStatusMenuState> {
		render() {
			const { t } = this.props

			return (
				<div className="tight-xs htight-xs text-s">
					<NavLink
						activeClassName="selectable-selected"
						className="testTools-menu__testTools-menu-item selectable clickable"
						to={'/testTools/timeline'}
					>
						<h3>{t('Timeline')}</h3>
					</NavLink>
					<NavLink
						activeClassName="selectable-selected"
						className="testTools-menu__testTools-menu-item selectable clickable"
						to={'/testTools/userlogplayer'}
					>
						<h3>{t('User Log Player')}</h3>
					</NavLink>
				</div>
			)
		}
	}
)

interface IStatusProps {
	match?: any
}
class Status extends MeteorReactComponent<Translated<IStatusProps>> {
	componentDidMount() {
		// Subscribe to data:

		this.subscribe(PubSub.studios, {})
		this.subscribe(PubSub.showStyleBases, {})
		this.subscribe(PubSub.showStyleVariants, {})
	}
	render() {
		return (
			<div className="mtl gutter has-statusbar">
				{/* <header className='mvs'>
					<h1>{t('Status')}</h1>
				</header> */}
				<div className="mod mvl mhs">
					<div className="flex-row hide-m-up">
						<div className="flex-col c12 rm-c1 status-menu">
							<StatusMenu match={this.props.match} />
						</div>
					</div>
					<div className="flex-row">
						<div className="flex-col c12 rm-c1 show-m-up status-menu">
							<StatusMenu match={this.props.match} />
						</div>
						<div className="flex-col c12 rm-c11 status-dialog">
							<Switch>
								<Route path="/testTools/timeline/:studioId" component={TimelineView} />
								<Route path="/testTools/timeline" component={TimelineStudioSelect} />
								<Route path="/testTools/userlogplayer/:rundownPlaylistId" component={UserLogPlayerPage} />
								<Route path="/testTools/userlogplayer" component={UserLogRundownSelect} />
							</Switch>
						</div>
					</div>
				</div>
			</div>
		)
	}
}

export default withTranslation()(Status)
