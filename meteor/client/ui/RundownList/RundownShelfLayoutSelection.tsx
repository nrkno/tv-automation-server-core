import * as React from 'react'
import { Translated } from '../../lib/ReactMeteorData/ReactMeteorData'
import { UIStateStorage } from '../../lib/UIStateStorage'
import { Link } from 'react-router-dom'
import { SplitDropdown } from '../../lib/SplitDropdown'
import { getRundownPlaylistLink, getRundownWithLayoutLink, getShelfLink } from './util'
import { Rundown } from '../../../lib/collections/Rundowns'
import { RundownLayoutBase } from '../../../lib/collections/RundownLayouts'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import classNames from 'classnames'
import { IconProp } from '@fortawesome/fontawesome-svg-core'
import { withTranslation } from 'react-i18next'
import { RundownPlaylistId } from '../../../lib/collections/RundownPlaylists'

interface IRundownShelfLayoutSelectionProps {
	playlistId: RundownPlaylistId
	rundowns: Rundown[]
	rundownLayouts: RundownLayoutBase[]
}

interface IRundownShelfLayoutSelectionState {
	selectedView: string
}

export const RundownShelfLayoutSelection = withTranslation()(
	class RundownShelfLayoutSelection extends React.Component<
		Translated<IRundownShelfLayoutSelectionProps>,
		IRundownShelfLayoutSelectionState
	> {
		constructor(props) {
			super(props)

			this.state = {
				selectedView: UIStateStorage.getItemString(`rundownList.${this.props.playlistId}`, 'defaultView', 'default'),
			}
		}

		private saveViewChoice(key: string) {
			UIStateStorage.setItem(`rundownList.${this.props.playlistId}`, 'defaultView', key)
		}

		private renderLinkItem(layout: RundownLayoutBase, link: string, key: string) {
			return {
				key,
				children: (
					<Link to={link} onClick={() => this.saveViewChoice(key)}>
						<div className="action-btn expco-item">
							<div
								className={classNames('action-btn layout-icon', { small: !layout.icon })}
								style={{ color: layout.iconColor || 'transparent' }}
							>
								<FontAwesomeIcon icon={(layout.icon as IconProp) || 'circle'} />
							</div>
							{layout.name}
						</div>
					</Link>
				),
			}
		}

		render() {
			const { t } = this.props

			const showstylesInPlaylist = this.props.rundowns.map((r) => r.showStyleBaseId)
			const layoutsInRundown = this.props.rundownLayouts.filter((layout) =>
				showstylesInPlaylist.includes(layout.showStyleBaseId)
			)

			const standaloneLayouts = layoutsInRundown
				.filter((layout) => layout.exposeAsStandalone)
				.map((layout) => {
					return this.renderLinkItem(layout, getShelfLink(this.props.playlistId, layout._id), `standalone${layout._id}`)
				})
			const shelfLayouts = layoutsInRundown
				.filter((layout) => layout.exposeAsShelf)
				.map((layout) => {
					return this.renderLinkItem(
						layout,
						getRundownWithLayoutLink(this.props.playlistId, layout._id),
						`shelf${layout._id}`
					)
				})

			return shelfLayouts.length > 0 || standaloneLayouts.length > 0 ? (
				<React.Fragment>
					<SplitDropdown
						selectedKey={this.state.selectedView}
						options={[
							{ node: <div className="expco-header">{t('Standalone Shelf')}</div> },
							...standaloneLayouts,
							{ node: <div className="expco-header">{t('Rundown & Shelf')}</div> },
							...shelfLayouts,
							{ node: <div className="expco-separator"></div> },
							{
								key: 'default',
								node: (
									<Link
										to={getRundownPlaylistLink(this.props.playlistId)}
										onClick={() => this.saveViewChoice('default')}
										key={'default'}
									>
										<div className="action-btn expco-item">{t('Default')}</div>
									</Link>
								),
							},
						]}
					/>
				</React.Fragment>
			) : (
				<span className="dimmed">{t('Default')}</span>
			)
		}
	}
)
