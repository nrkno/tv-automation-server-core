import * as React from 'react'
import Escape from 'react-escape'
import { withTranslation } from 'react-i18next'
import { ContextMenu, MenuItem } from 'react-contextmenu'
import { Part } from '../../../lib/collections/Parts'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { Translated } from '../../lib/ReactMeteorData/ReactMeteorData'
import { RundownUtils } from '../../lib/rundown'
import { IContextMenuContext } from '../RundownView'
import { PartUi, SegmentUi } from './SegmentTimelineContainer'
import { SegmentId, Segment } from '../../../lib/collections/Segments'
import { Settings } from '../../../lib/Settings'

interface IProps {
	onSetNext: (part: Part | undefined, e: any, offset?: number, take?: boolean) => void
	onSetNextSegment: (segmentId: SegmentId | null, e: any) => void
	onResyncSegment: (segmentId: SegmentId, e: any) => void
	playlist?: RundownPlaylist
	studioMode: boolean
	contextMenuContext: IContextMenuContext | null
	enablePlayFromAnywhere: boolean
}
interface IState {}

export const SegmentContextMenu = withTranslation()(
	class SegmentContextMenu extends React.Component<Translated<IProps>, IState> {
		constructor(props: Translated<IProps>) {
			super(props)
		}

		render() {
			const { t } = this.props

			const segment = this.getSegmentFromContext()
			const part = this.getPartFromContext()
			const timecode = this.getTimePosition()
			const startsAt = this.getPartStartsAt()

			const isCurrentPart =
				(part && this.props.playlist && part.instance._id === this.props.playlist.currentPartInstanceId) || undefined

			return this.props.studioMode && this.props.playlist && this.props.playlist.active ? (
				<Escape to="document">
					<ContextMenu id="segment-timeline-context-menu">
						{part && !part.instance.part.invalid && timecode !== null && (
							<React.Fragment>
								{startsAt !== null && (
									<MenuItem onClick={(e) => this.props.onSetNext(part.instance.part, e)} disabled={isCurrentPart}>
										<span dangerouslySetInnerHTML={{ __html: t('Set this part as <strong>Next</strong>') }}></span> (
										{RundownUtils.formatTimeToShortTime(Math.floor(startsAt / 1000) * 1000)})
									</MenuItem>
								)}
								{startsAt !== null && part && this.props.enablePlayFromAnywhere ? (
									<React.Fragment>
										<MenuItem onClick={(e) => this.onSetAsNextFromHere(part.instance.part, e)} disabled={isCurrentPart}>
											<span dangerouslySetInnerHTML={{ __html: t('Set <strong>Next</strong> Here') }}></span> (
											{RundownUtils.formatTimeToShortTime(Math.floor((startsAt + timecode) / 1000) * 1000)})
										</MenuItem>
										<MenuItem onClick={(e) => this.onPlayFromHere(part.instance.part, e)} disabled={isCurrentPart}>
											<span dangerouslySetInnerHTML={{ __html: t('Play from Here') }}></span> (
											{RundownUtils.formatTimeToShortTime(Math.floor((startsAt + timecode) / 1000) * 1000)})
										</MenuItem>
									</React.Fragment>
								) : null}
							</React.Fragment>
						)}
						{part && timecode === null && (
							<React.Fragment>
								<MenuItem onClick={(e) => this.props.onSetNext(part.instance.part, e)} disabled={isCurrentPart}>
									<span dangerouslySetInnerHTML={{ __html: t('Set segment as <strong>Next</strong>') }}></span>
								</MenuItem>
								{part.instance.segmentId !== this.props.playlist.nextSegmentId ? (
									<MenuItem onClick={(e) => this.props.onSetNextSegment(part.instance.segmentId, e)}>
										<span>{t('Queue segment')}</span>
									</MenuItem>
								) : (
									<MenuItem onClick={(e) => this.props.onSetNextSegment(null, e)}>
										<span>{t('Clear queued segment')}</span>
									</MenuItem>
								)}
								{Settings.allowUnsyncedSegments && this.menuItemResyncSegment(t, segment)}
							</React.Fragment>
						)}
					</ContextMenu>
				</Escape>
			) : Settings.allowUnsyncedSegments && segment && segment.unsynced ? (
				<Escape to="document">
					<ContextMenu id="segment-timeline-context-menu">
						<React.Fragment>{this.menuItemResyncSegment(t, segment)}</React.Fragment>
					</ContextMenu>
				</Escape>
			) : null
		}

		menuItemResyncSegment = (
			t: (key: string | string[], options?: unknown | undefined) => any,
			segment: SegmentUi | null
		) => {
			if (segment && segment.unsynced) {
				return (
					<MenuItem onClick={(e) => this.props.onResyncSegment(segment._id, e)}>
						<span>{t('Resync Segment')}</span>
					</MenuItem>
				)
			}
		}

		getSegmentFromContext = (): SegmentUi | null => {
			if (this.props.contextMenuContext && this.props.contextMenuContext.segment) {
				return this.props.contextMenuContext.segment
			}

			return null
		}

		getPartFromContext = (): PartUi | null => {
			if (this.props.contextMenuContext && this.props.contextMenuContext.part) {
				return this.props.contextMenuContext.part
			} else {
				return null
			}
		}

		onSetAsNextFromHere = (part: Part, e) => {
			let offset = this.getTimePosition()
			this.props.onSetNext(part, e, offset || 0)
		}

		onPlayFromHere = (part: Part, e) => {
			let offset = this.getTimePosition()
			this.props.onSetNext(part, e, offset || 0, true)
		}

		private getPartStartsAt = (): number | null => {
			if (this.props.contextMenuContext && this.props.contextMenuContext.partStartsAt !== undefined) {
				return this.props.contextMenuContext.partStartsAt
			}
			return null
		}

		private getTimePosition = (): number | null => {
			let offset = 0
			if (this.props.contextMenuContext && this.props.contextMenuContext.partDocumentOffset) {
				const left = this.props.contextMenuContext.partDocumentOffset.left || 0
				const timeScale = this.props.contextMenuContext.timeScale || 1
				const menuPosition = this.props.contextMenuContext.mousePosition || { left }
				offset = (menuPosition.left - left) / timeScale
				return offset
			}
			return null
		}
	}
)
