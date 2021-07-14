import * as React from 'react'
import ClassNames from 'classnames'

import { DashboardLayoutActionButton } from '../../../lib/collections/RundownLayouts'

export interface IDashboardButtonProps {
	button: DashboardLayoutActionButton

	onButtonDown: (button: DashboardLayoutActionButton, e: React.SyntheticEvent<HTMLElement>) => void
	onButtonUp: (button: DashboardLayoutActionButton, e: React.SyntheticEvent<HTMLElement>) => void
}

export class DashboardActionButton extends React.Component<IDashboardButtonProps> {
	private objId: string

	constructor(props: IDashboardButtonProps) {
		super(props)
	}

	render() {
		const { button } = this.props

		return (
			<div
				className="dashboard-panel dashboard-panel--actions"
				style={{
					width:
						button.width >= 0
							? `calc((${button.width} * var(--dashboard-button-grid-width)) + var(--dashboard-panel-margin-width))`
							: undefined,
					height:
						button.height >= 0
							? `calc((${button.height} * var(--dashboard-button-grid-height)) + var(--dashboard-panel-margin-height))`
							: undefined,
					left:
						button.x >= 0
							? `calc(${button.x} * var(--dashboard-button-grid-width))`
							: button.width < 0
							? `calc(${-1 * button.width - 1} * var(--dashboard-button-grid-width))`
							: undefined,
					top:
						button.y >= 0
							? `calc(${button.y} * var(--dashboard-button-grid-height) * 1.022)`
							: button.height < 0
							? `calc(${-1 * button.height - 1} * var(--dashboard-button-grid-height)) * 1.022`
							: undefined,
					right:
						button.x < 0
							? `calc(${-1 * button.x - 1} * var(--dashboard-button-grid-width))`
							: button.width < 0
							? `calc(${-1 * button.width - 1} * var(--dashboard-button-grid-width))`
							: undefined,
					bottom:
						button.y < 0
							? `calc(${-1 * button.y - 1} * var(--dashboard-button-grid-height))`
							: button.height < 0
							? `calc(${-1 * button.height - 1} * var(--dashboard-button-grid-height))`
							: undefined,
				}}
			>
				<div className="dashboard-panel__panel">
					<div
						className={ClassNames(
							'dashboard-panel__panel__button',
							'dashboard-panel__panel__button--standalone',
							`type--${button.type}`
						)}
						onMouseDown={(e) => this.props.onButtonDown(button, e)}
						onMouseUp={(e) => this.props.onButtonUp(button, e)}
						data-obj-id={button.type}
					>
						<span className="dashboard-panel__panel__button__label">{button.label}</span>
					</div>
				</div>
			</div>
		)
	}
}
