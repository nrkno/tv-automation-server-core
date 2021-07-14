import React from 'react'
import Moment from 'react-moment'
import { RundownPlaylistId } from '../../../lib/collections/RundownPlaylists'
import { withTranslation, WithTranslation } from 'react-i18next'
import { withTiming } from '../RundownView/RundownTiming/withTiming'
import { withTracker } from '../../lib/ReactMeteorData/ReactMeteorData'
import { PieceIconContainer } from '../PieceIcons/PieceIcon'
import { PieceNameContainer } from '../PieceIcons/PieceName'
import { Timediff } from './Timediff'
import { getPresenterScreenReactive, PresenterScreenBase, RundownOverviewTrackedProps } from './PresenterScreen'

interface TimeMap {
	[key: string]: number
}

interface RundownOverviewProps {
	playlistId: RundownPlaylistId
	segmentLiveDurations?: TimeMap
}
interface RundownOverviewState {}

/**
 * This component renders a Countdown screen for a given playlist
 */
export const OverlayScreen = withTranslation()(
	withTracker<RundownOverviewProps & WithTranslation, RundownOverviewState, RundownOverviewTrackedProps>(
		getPresenterScreenReactive
	)(
		withTiming<RundownOverviewProps & RundownOverviewTrackedProps & WithTranslation, RundownOverviewState>()(
			class OverlayScreen extends PresenterScreenBase {
				protected bodyClassList: string[] = ['transparent']

				render() {
					const { playlist, segments, nextShowStyleBaseId, t, playlistId, currentPartInstance, nextPartInstance } =
						this.props

					if (playlist && playlistId && segments) {
						const currentPart = currentPartInstance

						let currentPartCountdown: number | null = null
						if (currentPart) {
							currentPartCountdown = -1 * (this.props.timingDurations.remainingTimeOnCurrentPart || 0)
						}

						const nextPart = nextPartInstance

						// The over-under counter is something we may want to introduce into the screen at some point,
						// So I'm leaving these as a reference -- Jan Starzak, 2020/12/16
						// const overUnderClock = playlist.expectedDuration
						// 	? (this.props.timingDurations.asPlayedRundownDuration || 0) - playlist.expectedDuration
						// 	: (this.props.timingDurations.asPlayedRundownDuration || 0) -
						// 	  (this.props.timingDurations.totalRundownDuration || 0)

						const currentTime = this.props.timingDurations.currentTime || 0

						return (
							<div className="clocks-overlay">
								<div className="clocks-lower-third bottom">
									<div className="clocks-current-segment-countdown clocks-segment-countdown">
										{currentPartCountdown !== null ? (
											<Timediff time={currentPartCountdown} />
										) : (
											<span className="clock-segment-countdown-next">{t('Next')}</span>
										)}
									</div>
									{/*
									// An Auto-Next is something we may want to introduce in this view after we have
									// some feedback from the users and they say it may be useful.
									// -- Jan Starzak, 2020/12/16

									{currentPart && currentPart.instance.part.autoNext ? (
										<div style={{ display: 'inline-block', height: '0.5em' }}>
											<img style={{ height: '0.5em', verticalAlign: 'top' }} src="/icons/auto-presenter-screen.svg" />
										</div>
									) : null} */}
									<div className="clocks-part-icon">
										{nextPart && nextShowStyleBaseId ? (
											<PieceIconContainer
												partInstanceId={nextPart.instance._id}
												showStyleBaseId={nextShowStyleBaseId}
												rundownIds={this.props.rundownIds}
											/>
										) : null}
									</div>
									<div className="clocks-part-title clocks-part-title">
										{nextPart && nextShowStyleBaseId && nextPart.instance.part.title ? (
											<PieceNameContainer
												partName={nextPart.instance.part.title}
												partInstanceId={nextPart.instance._id}
												showStyleBaseId={nextShowStyleBaseId}
												rundownIds={this.props.rundownIds}
											/>
										) : (
											'_'
										)}
									</div>
									<span className="clocks-time-now">
										<Moment interval={0} format="HH:mm:ss" date={currentTime} />
									</span>
								</div>
							</div>
						)
					}
					return (
						<div className="clocks-overlay">
							<div className="clocks-lower-third bottom"></div>
						</div>
					)
				}
			}
		)
	)
)
