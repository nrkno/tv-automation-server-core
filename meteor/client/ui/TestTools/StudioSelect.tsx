import * as React from 'react'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import * as _ from 'underscore'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { Studio, Studios } from '../../../lib/collections/Studios'
import { Link } from 'react-router-dom'
import { unprotectString } from '../../../lib/lib'

interface IStudioSelectProps {
	title: string
	path: string
}
interface IStudioSelectState {}
interface IStudioSelectTrackedProps {
	studios: Studio[]
}
const StudioSelect = translateWithTracker<IStudioSelectProps, IStudioSelectState, IStudioSelectTrackedProps>(
	(_props: IStudioSelectProps) => {
		return {
			studios: Studios.find(
				{},
				{
					sort: {
						_id: 1,
					},
				}
			).fetch(),
		}
	}
)(
	class StudioSelection extends MeteorReactComponent<
		Translated<IStudioSelectProps & IStudioSelectTrackedProps>,
		IStudioSelectState
	> {
		render() {
			const { t, title, path } = this.props

			return (
				<div className="mhl gutter recordings-studio-select">
					<header className="mbs">
						<h1>{t(title)}</h1>
					</header>
					<div className="mod mvl">
						<strong>Studio</strong>
						<ul>
							{_.map(this.props.studios, (studio) => {
								return (
									<li key={unprotectString(studio._id)}>
										<Link to={`${path}/${studio._id}`}>{studio.name}</Link>
									</li>
								)
							})}
						</ul>
					</div>
				</div>
			)
		}
	}
)

export { StudioSelect }
