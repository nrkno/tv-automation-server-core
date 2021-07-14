import React from 'react'
import * as _ from 'underscore'
import { useTranslation } from 'react-i18next'

import { RundownUtils } from '../../lib/rundown'
import Moment from 'react-moment'

import { PieceLifespan, NoraContent } from '@sofie-automation/blueprints-integration'

import { NoraFloatingInspector } from './NoraFloatingInspector'
import { FloatingInspector } from '../FloatingInspector'
import { Time } from '../../../lib/lib'
import { PieceInstancePiece } from '../../../lib/collections/PieceInstances'

interface IProps {
	piece: PieceInstancePiece
	pieceRenderedDuration: number | null
	pieceRenderedIn: number | null
	showMiniInspector: boolean
	itemElement: HTMLDivElement | null
	content: NoraContent | undefined
	floatingInspectorStyle: React.CSSProperties
	typeClass?: string
	displayOn?: 'document' | 'viewport'
}

type KeyValue = { key: string; value: string }

export const L3rdFloatingInspector: React.FunctionComponent<IProps> = ({
	content: noraContent,
	floatingInspectorStyle,
	showMiniInspector,
	itemElement,
	piece,
	pieceRenderedIn,
	pieceRenderedDuration,
	typeClass,
	displayOn,
}) => {
	const { t } = useTranslation()
	const innerPiece = piece

	let properties: Array<KeyValue> = []
	if (noraContent && noraContent.payload && noraContent.payload.content) {
		properties = _.compact(
			_.map(
				noraContent.payload.content,
				(
					value,
					key: string
				):
					| {
							key: string
							value: string
					  }
					| undefined => {
					let str: string
					if (key.startsWith('_') || key.startsWith('@') || value === '') {
						return undefined
					} else {
						if (_.isObject(value)) {
							// @ts-ignore
							str = JSON.stringify(value, '', 2)
						} else {
							str = value + ''
						}
						return {
							key: key,
							value: str,
						}
					}
				}
			)
		) as Array<KeyValue>
	}

	const changed: Time | undefined = noraContent?.payload?.changed ?? undefined

	const templateName = noraContent?.payload?.metadata?.templateName
	const templateVariant = noraContent?.payload?.metadata?.templateVariant

	return noraContent && noraContent.payload && noraContent.previewRenderer ? (
		showMiniInspector && !!itemElement ? (
			<NoraFloatingInspector noraContent={noraContent} style={floatingInspectorStyle} displayOn={displayOn} />
		) : null
	) : (
		<FloatingInspector shown={showMiniInspector && !!itemElement} displayOn={displayOn}>
			<div className={'segment-timeline__mini-inspector ' + typeClass} style={floatingInspectorStyle}>
				{templateName && (
					<div className="mini-inspector__header">
						{templateName}
						{templateVariant && <span className="mini-inspector__sub-header">{templateVariant}</span>}
					</div>
				)}
				<table>
					<tbody>
						{properties.map((item) => (
							<tr key={item.key}>
								<td className="mini-inspector__label">{item.key}</td>
								<td className="mini-inspector__value">{item.value}</td>
							</tr>
						))}
						<tr>
							<td className="mini-inspector__row--timing"></td>
							<td className="mini-inspector__row--timing">
								<span className="mini-inspector__in-point">
									{RundownUtils.formatTimeToShortTime(pieceRenderedIn || 0)}
								</span>
								{!pieceRenderedDuration && !innerPiece.enable.duration ? (
									(innerPiece.lifespan === PieceLifespan.WithinPart && (
										<span className="mini-inspector__duration">{t('Until next take')}</span>
									)) ||
									(innerPiece.lifespan === PieceLifespan.OutOnSegmentChange && (
										<span className="mini-inspector__duration">{t('Until next segment')}</span>
									)) ||
									(innerPiece.lifespan === PieceLifespan.OutOnSegmentEnd && (
										<span className="mini-inspector__duration">{t('Until end of segment')}</span>
									)) ||
									(innerPiece.lifespan === PieceLifespan.OutOnRundownChange && (
										<span className="mini-inspector__duration">{t('Until next rundown')}</span>
									)) ||
									(innerPiece.lifespan === PieceLifespan.OutOnRundownEnd && (
										<span className="mini-inspector__duration">{t('Until end of rundown')}</span>
									)) ||
									(innerPiece.lifespan === PieceLifespan.OutOnShowStyleEnd && (
										<span className="mini-inspector__duration">{t('Until end of showstyle')}</span>
									))
								) : (
									<span className="mini-inspector__duration">
										{RundownUtils.formatTimeToShortTime(
											pieceRenderedDuration ||
												(_.isNumber(innerPiece.enable.duration)
													? parseFloat(innerPiece.enable.duration as any as string)
													: 0)
										)}
									</span>
								)}
								{changed && (
									<span className="mini-inspector__changed">
										<Moment date={changed} calendar={true} />
									</span>
								)}
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</FloatingInspector>
	)
}
