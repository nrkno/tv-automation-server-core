import React, { useState, ReactNode, useCallback } from 'react'
import ClassNames from 'classnames'

import { faChevronUp } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

interface IProps {
	selectedKey: string
	className?: string
	options?: SplitDropdownItemObj[]
}

interface SplitDropdownItemObj {
	key?: string
	node?: ReactNode
}

export function SplitDropdownItem(props: SplitDropdownItemObj): SplitDropdownItemObj {
	return {
		key: props.key,
		node: props.node,
	}
}

export function SplitDropdown(props: IProps) {
	const [expanded, setExpanded] = useState(false)
	const toggleExpco = useCallback(() => setExpanded((oldVal) => !oldVal), [])

	function getSelected() {
		const selectedChild =
			props.options &&
			Array.isArray(props.options) &&
			props.options.find((element) => element.key === props.selectedKey)?.node
		return selectedChild ? <>{selectedChild}</> : <div className="expco-item"></div>
	}

	return (
		<div
			className={ClassNames(
				'expco button focusable subtle split-dropdown',
				{
					'expco-expanded': expanded,
				},
				props.className
			)}
		>
			<div className="expco-title focusable-main">{getSelected()}</div>
			<div className="action-btn right expco-expand subtle" onClick={toggleExpco}>
				<FontAwesomeIcon icon={faChevronUp} />
			</div>
			<div className="expco-body bd">
				{props.options?.map((child, index) => (
					<React.Fragment key={child.key || index}>{child.node}</React.Fragment>
				))}
			</div>
		</div>
	)
}
