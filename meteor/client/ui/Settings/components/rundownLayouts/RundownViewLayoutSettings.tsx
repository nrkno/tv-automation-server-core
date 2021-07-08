import React from 'react'
import { withTranslation } from 'react-i18next'
import { RundownLayoutsAPI } from '../../../../../lib/api/rundownLayouts'
import { RundownLayoutBase, RundownLayouts } from '../../../../../lib/collections/RundownLayouts'
import { unprotectString } from '../../../../../lib/lib'
import { EditAttribute } from '../../../../lib/EditAttribute'
import { MeteorReactComponent } from '../../../../lib/MeteorReactComponent'
import { Translated } from '../../../../lib/ReactMeteorData/ReactMeteorData'

function filterLayouts(
	rundownLayouts: RundownLayoutBase[],
	testFunc: (l: RundownLayoutBase) => boolean
): Array<{ name: string; value: string }> {
	return rundownLayouts.filter(testFunc).map((l) => ({ name: l.name, value: unprotectString(l._id) }))
}

interface IProps {
	item: RundownLayoutBase
	layouts: RundownLayoutBase[]
}

interface IState {}

export default withTranslation()(
	class RundownViewLayoutSettings extends MeteorReactComponent<Translated<IProps>, IState> {
		render() {
			const { t } = this.props

			return (
				<React.Fragment>
					<div className="mod mvs mhs">
						<label className="field">
							{t('Expose as user selectable layout')}
							<EditAttribute
								modifiedClassName="bghl"
								attribute={'exposeAsSelectableLayout'}
								obj={this.props.item}
								type="checkbox"
								collection={RundownLayouts}
								className="mod mas"
							></EditAttribute>
						</label>
					</div>
					<div className="mod mvs mhs">
						<label className="field">
							{t('Shelf Layout')}
							<EditAttribute
								modifiedClassName="bghl"
								attribute={'shelfLayout'}
								obj={this.props.item}
								options={filterLayouts(this.props.layouts, RundownLayoutsAPI.isLayoutForShelf)}
								type="dropdown"
								collection={RundownLayouts}
								className="input text-input input-l dropdown"
							></EditAttribute>
						</label>
					</div>
					<div className="mod mvs mhs">
						<label className="field">
							{t('Rundown Header Layout')}
							<EditAttribute
								modifiedClassName="bghl"
								attribute={'rundownHeaderLayout'}
								obj={this.props.item}
								options={filterLayouts(this.props.layouts, RundownLayoutsAPI.isLayoutForRundownHeader)}
								type="dropdown"
								collection={RundownLayouts}
								className="input text-input input-l dropdown"
							></EditAttribute>
						</label>
					</div>
				</React.Fragment>
			)
		}
	}
)
