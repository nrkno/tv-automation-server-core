import * as React from 'react'
import * as _ from 'underscore'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import ClassNames from 'classnames'

import { Spinner } from '../../lib/Spinner'
import { DashboardLayoutFilter, PieceDisplayStyle } from '../../../lib/collections/RundownLayouts'
import {
	IAdLibPanelProps,
	AdLibFetchAndFilterProps,
	fetchAndFilter,
	AdLibPieceUi,
	matchFilter,
	AdLibPanelToolbar,
} from './AdLibPanel'
import { DashboardPieceButton } from './DashboardPieceButton'
import { ensureHasTrailingSlash } from '../../lib/lib'
import {
	DashboardPanelInner,
	dashboardElementPosition,
	IDashboardPanelTrackedProps,
	IDashboardPanelProps,
	getUnfinishedPieceInstancesGrouped,
	getNextPieceInstancesGrouped,
} from './DashboardPanel'
import { unprotectString } from '../../../lib/lib'
import { RundownUtils } from '../../lib/rundown'

export const TimelineDashboardPanel = translateWithTracker<
	Translated<IAdLibPanelProps & IDashboardPanelProps>,
	DashboardPanelInner['state'],
	AdLibFetchAndFilterProps & IDashboardPanelTrackedProps
>(
	(props: Translated<IAdLibPanelProps & IDashboardPanelProps>) => {
		const { unfinishedAdLibIds, unfinishedTags } = getUnfinishedPieceInstancesGrouped(
			props.playlist.currentPartInstanceId
		)
		const { nextAdLibIds, nextTags } = getNextPieceInstancesGrouped(props.playlist.nextPartInstanceId)
		return {
			...fetchAndFilter(props),
			studio: props.playlist.getStudio(),
			unfinishedAdLibIds,
			unfinishedTags,
			nextAdLibIds,
			nextTags,
		}
	},
	(data, props: IAdLibPanelProps, nextProps: IAdLibPanelProps) => {
		return !_.isEqual(props, nextProps)
	}
)(
	class TimelineDashboardPanel extends DashboardPanelInner {
		liveLine: HTMLDivElement
		scrollIntoViewTimeout: NodeJS.Timer | undefined = undefined
		setRef = (el: HTMLDivElement) => {
			this.liveLine = el
			super.setRef(el)
			this.ensureLiveLineVisible()
		}
		componentDidUpdate(prevProps, prevState) {
			super.componentDidUpdate(prevProps, prevState)
			this.ensureLiveLineVisible()
		}
		componentDidMount() {
			super.componentDidMount()
			this.ensureLiveLineVisible()
		}
		ensureLiveLineVisible = _.debounce(() => {
			if (this.liveLine) {
				this.liveLine.scrollIntoView({
					behavior: 'smooth',
					block: 'start',
					inline: 'start',
				})
			}
		}, 250)
		render() {
			if (this.props.visible && this.props.showStyleBase && this.props.filter) {
				const filter = this.props.filter as DashboardLayoutFilter
				const uniquenessIds = new Set<string>()
				if (!this.props.uiSegments || !this.props.playlist) {
					return <Spinner />
				} else {
					const filteredRudownBaselineAdLibs = this.props.rundownBaselineAdLibs.filter((item) =>
						matchFilter(
							item,
							this.props.showStyleBase,
							this.props.uiSegments,
							this.props.filter,
							this.state.searchFilter,
							uniquenessIds
						)
					)

					return (
						<div className="dashboard-panel dashboard-panel--timeline-style" style={dashboardElementPosition(filter)}>
							<h4 className="dashboard-panel__header">{this.props.filter.name}</h4>
							{filter.enableSearch && (
								<AdLibPanelToolbar onFilterChange={this.onFilterChange} searchFilter={this.state.searchFilter} />
							)}
							<div
								className={ClassNames('dashboard-panel__panel', {
									'dashboard-panel__panel--horizontal': filter.overflowHorizontally,
								})}
							>
								{filteredRudownBaselineAdLibs.length > 0 && (
									<div className="dashboard-panel__panel__group">
										{filteredRudownBaselineAdLibs.map((adLibListItem: AdLibPieceUi) => {
											return (
												<DashboardPieceButton
													key={unprotectString(adLibListItem._id)}
													piece={adLibListItem}
													studio={this.props.studio}
													layer={this.state.sourceLayers[adLibListItem.sourceLayerId]}
													outputLayer={this.state.outputLayers[adLibListItem.outputLayerId]}
													onToggleAdLib={this.onToggleOrSelectAdLib}
													onSelectAdLib={this.onSelectAdLib}
													isSelected={
														(this.props.selectedPiece &&
															RundownUtils.isAdLibPiece(this.props.selectedPiece) &&
															this.props.selectedPiece._id === adLibListItem._id) ||
														false
													}
													playlist={this.props.playlist}
													isOnAir={this.isAdLibOnAir(adLibListItem)}
													mediaPreviewUrl={
														this.props.studio
															? ensureHasTrailingSlash(this.props.studio.settings.mediaPreviewsUrl + '' || '') || ''
															: ''
													}
													widthScale={filter.buttonWidthScale}
													heightScale={filter.buttonHeightScale}
													displayStyle={PieceDisplayStyle.BUTTONS}
													showThumbnailsInList={filter.showThumbnailsInList}
													toggleOnSingleClick={this.state.singleClickMode}
												>
													{adLibListItem.name}
												</DashboardPieceButton>
											)
										})}
									</div>
								)}
								{this.props.uiSegments.map((seg) => {
									const filteredPieces = seg.pieces
										? seg.pieces.filter((item) =>
												matchFilter(
													item,
													this.props.showStyleBase,
													this.props.uiSegments,
													this.props.filter,
													this.state.searchFilter,
													uniquenessIds
												)
										  )
										: []
									return filteredPieces.length > 0 ||
										seg.isLive ||
										(seg.isNext && !this.props.playlist.currentPartInstanceId) ? (
										<div
											key={unprotectString(seg._id)}
											id={'dashboard-panel__panel__group__' + seg._id}
											className={ClassNames('dashboard-panel__panel__group', {
												live: seg.isLive,
												next: seg.isNext && !this.props.playlist.currentPartInstanceId,
											})}
										>
											{(seg.isLive || (seg.isNext && !this.props.playlist.currentPartInstanceId)) && (
												<div className="dashboard-panel__panel__group__liveline" ref={this.setRef}></div>
											)}
											{filteredPieces.map((adLibListItem: AdLibPieceUi) => {
												return (
													<DashboardPieceButton
														key={unprotectString(adLibListItem._id)}
														piece={adLibListItem}
														layer={this.state.sourceLayers[adLibListItem.sourceLayerId]}
														outputLayer={this.state.outputLayers[adLibListItem.outputLayerId]}
														onToggleAdLib={this.onToggleOrSelectAdLib}
														onSelectAdLib={this.onSelectAdLib}
														isSelected={
															(this.props.selectedPiece &&
																RundownUtils.isAdLibPiece(this.props.selectedPiece) &&
																this.props.selectedPiece._id === adLibListItem._id) ||
															false
														}
														playlist={this.props.playlist}
														studio={this.props.studio}
														isOnAir={this.isAdLibOnAir(adLibListItem)}
														mediaPreviewUrl={
															this.props.studio
																? ensureHasTrailingSlash(this.props.studio.settings.mediaPreviewsUrl + '' || '') || ''
																: ''
														}
														displayStyle={PieceDisplayStyle.BUTTONS}
														widthScale={filter.buttonWidthScale}
														heightScale={filter.buttonHeightScale}
														showThumbnailsInList={filter.showThumbnailsInList}
													>
														{adLibListItem.name}
													</DashboardPieceButton>
												)
											})}
										</div>
									) : undefined
								})}
							</div>
						</div>
					)
				}
			}
			return null
		}
	}
)
