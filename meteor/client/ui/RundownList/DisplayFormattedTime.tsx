import React from 'react'
import { TFunction } from 'i18next'
import { DisplayFormattedTimeInner } from './DisplayFormattedTimeInner'

interface IDisplayFormattedTimeProps {
	t: TFunction
	/** Timestamp to display */
	displayTimestamp: number
	/** Timestamp of "now", if omitted, defaults to "now" */
	nowTimestamp?: number
}

export function DisplayFormattedTime(props: IDisplayFormattedTimeProps) {
	return <span>{DisplayFormattedTimeInner(props.t, props.displayTimestamp, props.nowTimestamp)}</span>
}
