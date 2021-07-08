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
	class RundownHeaderLayoutSettings extends MeteorReactComponent<Translated<IProps>, IState> {
		render() {
			const { t } = this.props

			return (
				<React.Fragment>
					<div className="mod mvs mhs">
						<label className="field">
							{t('Expected End text')}
							<EditAttribute
								modifiedClassName="bghl"
								attribute={'expectedEndText'}
								obj={this.props.item}
								type="text"
								collection={RundownLayouts}
								className="input text-input input-l"
							></EditAttribute>
							<span className="text-s dimmed">{t('Text to show above countdown to end of show')}</span>
						</label>
					</div>
					<div className="mod mvs mhs">
						<label className="field">
							{t('Hide Expected End timing when a break is next')}
							<EditAttribute
								modifiedClassName="bghl"
								attribute={'hideExpectedEndBeforeBreak'}
								obj={this.props.item}
								type="checkbox"
								collection={RundownLayouts}
								className="input"
							></EditAttribute>
							<span className="text-s dimmed">
								{t('While there are still breaks coming up in the show, hide the Expected End timers')}
							</span>
						</label>
					</div>
					<div className="mod mvs mhs">
						<label className="field">
							{t('Show next break timing')}
							<EditAttribute
								modifiedClassName="bghl"
								attribute={'showNextBreakTiming'}
								obj={this.props.item}
								type="checkbox"
								collection={RundownLayouts}
								className="input"
							></EditAttribute>
							<span className="text-s dimmed">{t('Whether to show countdown to next break')}</span>
						</label>
					</div>
					<div className="mod mvs mhs">
						<label className="field">
							{t('Last rundown is not break')}
							<EditAttribute
								modifiedClassName="bghl"
								attribute={'lastRundownIsNotBreak'}
								obj={this.props.item}
								type="checkbox"
								collection={RundownLayouts}
								className="input"
							></EditAttribute>
							<span className="text-s dimmed">
								{t("Don't treat the end of the last rundown in a playlist as a break")}
							</span>
						</label>
					</div>
					<div className="mod mvs mhs">
						<label className="field">
							{t('Next Break text')}
							<EditAttribute
								modifiedClassName="bghl"
								attribute={'nextBreakText'}
								obj={this.props.item}
								type="text"
								collection={RundownLayouts}
								className="input text-input input-l"
							></EditAttribute>
							<span className="text-s dimmed">{t('Text to show above countdown to next break')}</span>
						</label>
					</div>
				</React.Fragment>
			)
		}
	}
)
