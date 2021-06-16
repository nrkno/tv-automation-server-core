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
							{t('End of Show Text')}
							<EditAttribute
								modifiedClassName="bghl"
								attribute={'expectedEndText'}
								obj={this.props.item}
								type="text"
								collection={RundownLayouts}
								className="input text-input input-l"
							></EditAttribute>
						</label>
					</div>
				</React.Fragment>
			)
		}
	}
)
