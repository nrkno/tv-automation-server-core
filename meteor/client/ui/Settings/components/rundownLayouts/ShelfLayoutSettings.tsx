import React from 'react'
import { withTranslation } from 'react-i18next'
import { RundownLayoutBase, RundownLayouts } from '../../../../../lib/collections/RundownLayouts'
import { EditAttribute } from '../../../../lib/EditAttribute'
import { MeteorReactComponent } from '../../../../lib/MeteorReactComponent'
import { Translated } from '../../../../lib/ReactMeteorData/ReactMeteorData'

interface IProps {
	item: RundownLayoutBase
}

interface IState {}

export default withTranslation()(
	class ShelfLayoutSettings extends MeteorReactComponent<Translated<IProps>, IState> {
		render() {
			const { t } = this.props

			return (
				<React.Fragment>
					<div className="mod mvs mhs">
						<label className="field">
							{t('Expose layout as a standalone page')}
							<EditAttribute
								modifiedClassName="bghl"
								attribute={'exposeAsStandalone'}
								obj={this.props.item}
								type="checkbox"
								collection={RundownLayouts}
								className="mod mas"
							></EditAttribute>
						</label>
					</div>
					<div className="mod mvs mhs">
						<label className="field">
							{t('Open shelf by default')}
							<EditAttribute
								modifiedClassName="bghl"
								attribute={'openByDefault'}
								obj={this.props.item}
								type="checkbox"
								collection={RundownLayouts}
								className="mod mas"
							></EditAttribute>
						</label>
					</div>
					<div className="mod mvs mhs">
						<label className="field">
							{t('Default shelf height')}
							<EditAttribute
								modifiedClassName="bghl"
								attribute={`startingHeight`}
								obj={this.props.item}
								type="int"
								collection={RundownLayouts}
								className="input text-input input-l"
							/>
						</label>
					</div>
				</React.Fragment>
			)
		}
	}
)
