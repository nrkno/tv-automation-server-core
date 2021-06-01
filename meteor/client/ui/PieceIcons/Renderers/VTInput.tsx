import * as React from 'react'

// @todo: use colours from the scss
export default class VTInputIcon extends React.Component<{ abbreviation?: string }> {
	render() {
		return (
			<svg className="piece_icon" version="1.1" viewBox="0 0 126.5 89" xmlns="http://www.w3.org/2000/svg">
				<rect width="126.5" height="89" className="vt" />
				<text
					x="5.25"
					y="71.513954"
					style={{
						fill: '#ffffff',
						fontFamily: 'open-sans',
						fontSize: '40px',
						letterSpacing: '0px',
						lineHeight: '1.25',
						wordSpacing: '0px',
						textShadow: '0 2px 9px rgba(0, 0, 0, 0.5)',
					}}
					xmlSpace="preserve"
				>
					<tspan
						x="5.25"
						y="71.513954"
						style={{ fill: '#ffffff', fontFamily: 'Roboto', fontSize: '75px', fontWeight: 100 }}
					>
						{this.props.abbreviation ? this.props.abbreviation : 'VT'}
					</tspan>
				</text>
			</svg>
		)
	}
}
