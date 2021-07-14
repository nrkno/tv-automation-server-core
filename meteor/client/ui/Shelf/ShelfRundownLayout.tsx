import * as React from 'react'
import { RundownLayout } from '../../../lib/collections/RundownLayouts'
import { RundownLayoutsAPI } from '../../../lib/api/rundownLayouts'
import { ExternalFramePanel } from './ExternalFramePanel'
import { ShowStyleBase } from '../../../lib/collections/ShowStyleBases'
import { OverflowingContainer } from './OverflowingContainer'
import ClassNames from 'classnames'
import { ShelfTabs, DEFAULT_TAB as SHELF_DEFAULT_TAB } from './Shelf'
import { AdLibPanel, AdLibPieceUi } from './AdLibPanel'
import { GlobalAdLibPanel } from './GlobalAdLibPanel'
import { HotkeyHelpPanel } from './HotkeyHelpPanel'
import { Translated } from '../../lib/ReactMeteorData/ReactMeteorData'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { Studio } from '../../../lib/collections/Studios'
import { PieceUi } from '../SegmentTimeline/SegmentTimelineContainer'
import { withTranslation } from 'react-i18next'
import { BucketAdLibItem } from './RundownViewBuckets'
import { IAdLibListItem } from './AdLibListItem'

export interface IShelfRundownLayoutProps {
	rundownLayout: RundownLayout | undefined
	playlist: RundownPlaylist
	showStyleBase: ShowStyleBase
	studioMode: boolean
	studio: Studio
	selectedTab: string | undefined
	selectedPiece: BucketAdLibItem | IAdLibListItem | PieceUi | undefined

	onSwitchTab: (tab: string) => void
	onSelectPiece: (piece: AdLibPieceUi | PieceUi) => void

	hotkeys: Array<{
		key: string
		label: string
	}>
}

export const ShelfRundownLayout = withTranslation()(function ShelfRundownLayout(
	props: Translated<IShelfRundownLayoutProps>
) {
	const { t, rundownLayout, onSwitchTab } = props
	return (
		<React.Fragment>
			<div className="rundown-view__shelf__tabs">
				<OverflowingContainer className="rundown-view__shelf__tabs__tab-group">
					<div
						className={ClassNames('rundown-view__shelf__tabs__tab', {
							selected: (props.selectedTab || SHELF_DEFAULT_TAB) === ShelfTabs.ADLIB,
						})}
						onClick={() => onSwitchTab(ShelfTabs.ADLIB)}
						tabIndex={0}
					>
						{t('AdLib')}
					</div>
					{rundownLayout &&
						rundownLayout.filters
							.sort((a, b) => a.rank - b.rank)
							.map((panel) => (
								<div
									className={ClassNames('rundown-view__shelf__tabs__tab', {
										selected:
											(props.selectedTab || SHELF_DEFAULT_TAB) === `${ShelfTabs.ADLIB_LAYOUT_FILTER}_${panel._id}`,
									})}
									key={panel._id}
									onClick={() => onSwitchTab(`${ShelfTabs.ADLIB_LAYOUT_FILTER}_${panel._id}`)}
									tabIndex={0}
								>
									{panel.name}
								</div>
							))}
				</OverflowingContainer>
				<div
					className={ClassNames('rundown-view__shelf__tabs__tab', {
						selected: (props.selectedTab || SHELF_DEFAULT_TAB) === ShelfTabs.GLOBAL_ADLIB,
					})}
					onClick={() => onSwitchTab(ShelfTabs.GLOBAL_ADLIB)}
					tabIndex={0}
				>
					{t('Global AdLib')}
				</div>
				<div
					className={ClassNames('rundown-view__shelf__tabs__tab', {
						selected: (props.selectedTab || SHELF_DEFAULT_TAB) === ShelfTabs.SYSTEM_HOTKEYS,
					})}
					onClick={() => onSwitchTab(ShelfTabs.SYSTEM_HOTKEYS)}
					tabIndex={0}
				>
					{t('Shortcuts')}
				</div>
			</div>
			<div className="rundown-view__shelf__panel super-dark">
				<AdLibPanel
					visible={(props.selectedTab || SHELF_DEFAULT_TAB) === ShelfTabs.ADLIB}
					registerHotkeys={true}
					selectedPiece={props.selectedPiece}
					onSelectPiece={props.onSelectPiece}
					playlist={props.playlist}
					showStyleBase={props.showStyleBase}
					studioMode={props.studioMode}
					studio={props.studio}
					hotkeyGroup={props.playlist.name.replace(/\W/, '') + 'AdLibPanel'}
				></AdLibPanel>
				{rundownLayout &&
					rundownLayout.filters.map((panel) =>
						RundownLayoutsAPI.isFilter(panel) ? (
							<AdLibPanel
								key={panel._id}
								visible={(props.selectedTab || SHELF_DEFAULT_TAB) === `${ShelfTabs.ADLIB_LAYOUT_FILTER}_${panel._id}`}
								includeGlobalAdLibs={true}
								filter={panel}
								selectedPiece={props.selectedPiece}
								onSelectPiece={props.onSelectPiece}
								playlist={props.playlist}
								showStyleBase={props.showStyleBase}
								studioMode={props.studioMode}
								studio={props.studio}
								hotkeyGroup={panel.name.replace(/\W/, '_')}
							/>
						) : RundownLayoutsAPI.isExternalFrame(panel) ? (
							<ExternalFramePanel
								key={panel._id}
								panel={panel}
								layout={rundownLayout}
								visible={(props.selectedTab || SHELF_DEFAULT_TAB) === `${ShelfTabs.ADLIB_LAYOUT_FILTER}_${panel._id}`}
								playlist={props.playlist}
							/>
						) : undefined
					)}
				<GlobalAdLibPanel
					visible={(props.selectedTab || SHELF_DEFAULT_TAB) === ShelfTabs.GLOBAL_ADLIB}
					selectedPiece={props.selectedPiece}
					onSelectPiece={props.onSelectPiece}
					playlist={props.playlist}
					showStyleBase={props.showStyleBase}
					studioMode={props.studioMode}
					hotkeyGroup={props.playlist.name.replace(/\W/, '_') + 'GlobalAdLibPanel'}
					studio={props.studio}
				></GlobalAdLibPanel>
				<HotkeyHelpPanel
					visible={(props.selectedTab || SHELF_DEFAULT_TAB) === ShelfTabs.SYSTEM_HOTKEYS}
					showStyleBase={props.showStyleBase}
					hotkeys={props.hotkeys}
				></HotkeyHelpPanel>
			</div>
		</React.Fragment>
	)
})
