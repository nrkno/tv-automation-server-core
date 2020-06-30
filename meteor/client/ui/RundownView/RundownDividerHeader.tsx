import * as React from 'react'
import { Rundown } from '../../../lib/collections/Rundowns'

interface IProps {
	rundown: Rundown
}

export const RundownDividerHeader: React.SFC<IProps> = (props: IProps) => (
	<div className="rundown-divider-timeline">
		<h2 className="rundown-divider-timeline__title">{props.rundown.name}</h2>
	</div>
)
