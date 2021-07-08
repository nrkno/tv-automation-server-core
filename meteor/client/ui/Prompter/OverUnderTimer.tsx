import * as React from 'react'
import { withTiming, WithTiming } from '../RundownView/RundownTiming/withTiming'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { RundownUtils } from '../../lib/rundown'
import ClassNames from 'classnames'
import { getCurrentTime } from '../../../lib/lib'

interface IProps {
	rundownPlaylist: RundownPlaylist
	style?: React.CSSProperties | undefined
}

/**
 * Shows an over/under timer for the rundownPlaylist. Requires a RundownTimingContext from the RundownTimingProvider
 */
export const OverUnderTimer = withTiming<IProps, {}>()(
	class OverUnderTimer extends React.Component<WithTiming<IProps>> {
		render() {
			const target =
				this.props.rundownPlaylist.expectedDuration ||
				(this.props.rundownPlaylist.expectedEnd ? this.props.rundownPlaylist.expectedEnd - getCurrentTime() : null) ||
				this.props.timingDurations.totalPlaylistDuration ||
				0
			return target ? (
				<span
					style={this.props.style}
					className={ClassNames('prompter-timing-clock heavy-light', {
						heavy: (this.props.timingDurations.totalPlaylistDuration || 0) <= target,
						light: (this.props.timingDurations.totalPlaylistDuration || 0) > target,
					})}
				>
					{RundownUtils.formatDiffToTimecode(
						(this.props.timingDurations.totalPlaylistDuration || 0) - target,
						true,
						false,
						true,
						true,
						true,
						undefined,
						true
					)}
				</span>
			) : null
		}
	}
)
