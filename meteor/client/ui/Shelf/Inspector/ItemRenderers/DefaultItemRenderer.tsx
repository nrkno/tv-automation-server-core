import * as React from 'react'
import { PieceUi } from '../../../SegmentTimeline/SegmentTimelineContainer'
import { IAdLibListItem } from '../../AdLibListItem'
import { AdLibPieceUi } from '../../AdLibPanel'
import { RundownUtils } from '../../../../lib/rundown'
import { Piece } from '../../../../../lib/collections/Pieces'
import { ShowStyleBase } from '../../../../../lib/collections/ShowStyleBases'
import InspectorTitle from './InspectorTitle'
import { Studio } from '../../../../../lib/collections/Studios'
import { MediaObject } from '../../../../../lib/collections/MediaObjects'
import { BucketAdLibUi } from '../../RundownViewBuckets'

export default function DefaultItemRenderer(props: {
	piece: PieceUi | IAdLibListItem | BucketAdLibUi
	showStyleBase: ShowStyleBase
	studio: Studio
}): JSX.Element {
	if (RundownUtils.isAdLibPiece(props.piece)) {
		const piece = props.piece as IAdLibListItem

		let packageName: string | null = null
		if (piece.contentPackageInfos) {
			packageName = piece.contentPackageInfos[0]?.packageName
		} else {
			// Fallback to media objects
			const metadata = piece.contentMetaData as MediaObject
			packageName = metadata && metadata.mediaId ? metadata.mediaId : null
		}

		return (
			<>
				<InspectorTitle piece={props.piece} showStyleBase={props.showStyleBase} studio={props.studio} />
				{packageName}
				<dl>
					<dd>name</dd>
					<dt>{piece.name}</dt>
					<dd>externalId</dd>
					<dt>{piece.externalId}</dt>
					{(piece as AdLibPieceUi).partId ? (
						<>
							<dd>partId</dd>
							<dt>{(piece as AdLibPieceUi).partId}</dt>
						</>
					) : null}
					<dd>sourceLayerId</dd>
					<dt>{piece.sourceLayerId}</dt>
					<dd>outputLayerId</dd>
					<dt>{piece.outputLayerId}</dt>
					<dd>metaData</dd>
					<dt>{JSON.stringify(piece.metaData || {})}</dt>
				</dl>
			</>
		)
	} else {
		const piece = props.piece.instance.piece as Piece

		let packageName: string | null = null
		if (props.piece.contentPackageInfos) {
			packageName = props.piece.contentPackageInfos[0]?.packageName
		} else {
			// Fallback to media objects
			const metadata = props.piece.contentMetaData as MediaObject
			packageName = metadata && metadata.mediaId ? metadata.mediaId : null
		}

		return (
			<>
				<InspectorTitle piece={props.piece} showStyleBase={props.showStyleBase} studio={props.studio} />
				{packageName}
				<dl>
					<dd>name</dd>
					<dt>{piece.name}</dt>
					<dd>externalId</dd>
					<dt>{piece.externalId}</dt>
					<dd>startPartId</dd>
					<dt>{piece.startPartId}</dt>
					<dd>sourceLayerId</dd>
					<dt>{piece.sourceLayerId}</dt>
					<dd>outputLayerId</dd>
					<dt>{piece.outputLayerId}</dt>
					<dd>metaData</dd>
					<dt>{JSON.stringify(piece.metaData || {})}</dt>
				</dl>
			</>
		)
	}
}
