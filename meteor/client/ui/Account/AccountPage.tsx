import * as React from 'react'
import { Accounts } from 'meteor/accounts-base'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import { RouteComponentProps } from 'react-router'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { NotificationCenter, Notification, NoticeLevel } from '../../lib/notifications/notifications'
import { MeteorCall } from '../../../lib/api/methods'
import { getUser, User, getUserRoles } from '../../../lib/collections/Users'
import { Organizations, DBOrganization, UserRoles } from '../../../lib/collections/Organization'
import { Spinner } from '../../lib/Spinner'
import { Link } from 'react-router-dom'
import { unprotectString } from '../../../lib/lib'
import { EditAttribute } from '../../lib/EditAttribute'

interface IAccountPageProps extends RouteComponentProps {
	user: User | null
	organization: DBOrganization | null
}

interface IAccountPageState {
	password: string
	oldPassword: string
	edit: boolean
}

export const AccountPage = translateWithTracker(() => {
	const user = getUser()
	const organization = user ? Organizations.findOne({ _id: user.organizationId }) : null
	return {
		user: user,
		organization: organization,
	}
})(
	class extends MeteorReactComponent<Translated<IAccountPageProps>, IAccountPageState> {
		constructor(props) {
			super(props)
		}

		state = {
			password: '',
			oldPassword: '',
			edit: false,
		}

		private handleChange(e: React.ChangeEvent<HTMLInputElement>) {
			this.setState({ ...this.state, [e.currentTarget.name]: e.currentTarget.value })
		}

		private handleChangePassword(e: React.MouseEvent<HTMLElement>) {
			e.preventDefault()
			if (!this.state.edit) return this.setState({ edit: true })
			try {
				if (!this.state.oldPassword || !this.state.password) throw { message: 'Missing requried password' }
				if (this.state.password.length < 5) throw { message: 'New password must be atleast 5 characters' }
				Accounts.changePassword(this.state.oldPassword, this.state.password, (error) => {
					if (error) {
						throw { message: error, lvl: NoticeLevel.CRITICAL }
					}
					this.handleNotif('Password Updated Successfully', NoticeLevel.NOTIFICATION)
					this.setState({ edit: false })
				})
			} catch (error) {
				console.log(error)
				this.handleNotif(error.message, error.lvl)
			}
		}

		private handleRemoveUser() {
			MeteorCall.user
				.removeUser()
				.then((error) => {
					if (error) {
						throw error
					}
					this.props.history.push('/')
				})
				.catch((error) => {
					console.log(error)
					this.handleNotif('Error deleting account', NoticeLevel.CRITICAL)
				})
		}

		private handleNotif(error: string, lvl?: NoticeLevel) {
			if (lvl === undefined) lvl = NoticeLevel.WARNING
			NotificationCenter.push(new Notification(undefined, lvl, error, 'Account Page'))
		}
		private renderUserRole(userRole: keyof UserRoles) {
			const user = this.props.user
			const organization = this.props.organization

			if (user && organization) {
				const roles: UserRoles = organization.userRoles[unprotectString(user._id)] || {}
				return getUserRoles(user, organization).admin ? (
					<EditAttribute
						attribute={`userRoles.${user._id}.${userRole}`}
						obj={organization}
						type="checkbox"
						collection={Organizations}
						className=""
					/>
				) : (
					<input type="checkbox" disabled={true} checked={roles[userRole]}></input>
				)
			} else return null
		}

		render() {
			const { t } = this.props

			const user = this.props.user
			const organization = this.props.organization
			return (
				<div className="center-page">
					<div className="mtl page">
						<h1>{t('Account Page')}</h1>
						{user ? (
							<form
								className="flex-col"
								onSubmit={(e: React.MouseEvent<HTMLFormElement>) => this.handleChangePassword(e)}
							>
								<p>{t('Name:')}</p>
								<input type="text" value={user.profile.name} disabled={true} />
								<p>{t('Email:')}</p>
								<input type="text" value={user.emails.map((e) => e.address).join(', ')} disabled={true} />
								{this.state.edit && (
									<React.Fragment>
										<p>{t('Old Password')}</p>
										<input
											type="password"
											name="oldPassword"
											value={this.state.oldPassword}
											onChange={(e: React.ChangeEvent<HTMLInputElement>) => this.handleChange(e)}
										/>
										<p>{t('New Password')}</p>
										<input
											type="password"
											name="password"
											value={this.state.password}
											onChange={(e: React.ChangeEvent<HTMLInputElement>) => this.handleChange(e)}
										/>
									</React.Fragment>
								)}
								<button className="btn btn-primary" type="submit">
									{this.state.edit ? t('Save Changes') : t('Edit Account')}
								</button>
								{this.state.edit && (
									<button
										className="btn"
										type="button"
										onClick={() => this.setState({ edit: false, password: '', oldPassword: '' })}
									>
										Cancel
									</button>
								)}
							</form>
						) : (
							<Spinner />
						)}
						<h3>{t('Organization')}</h3>
						{organization ? (
							<React.Fragment>
								<p>
									{t('Name:')} {organization.name}
								</p>
								{user && getUserRoles(user, organization).admin ? (
									<button className="btn btn-primary">
										<Link to="/organization">Edit Organization</Link>
									</button>
								) : null}
								{user ? (
									<div>
										<h4>{t('User roles in organization')}</h4>
										<table>
											<tbody>
												<tr>
													<td>{t('Studio')}</td>
													<td>{this.renderUserRole('studio')}</td>
												</tr>
												<tr>
													<td>{t('Configurator')}</td>
													<td>{this.renderUserRole('configurator')}</td>
												</tr>
												<tr>
													<td>{t('Developer')}</td>
													<td>{this.renderUserRole('developer')}</td>
												</tr>
												<tr>
													<td>{t('Admin')}</td>
													<td>{this.renderUserRole('admin')}</td>
												</tr>
											</tbody>
										</table>
									</div>
								) : null}
							</React.Fragment>
						) : (
							<Spinner />
						)}
						{this.state.edit && (
							<button className="btn" onClick={() => this.handleRemoveUser()}>
								{t('Remove Self')}
							</button>
						)}
					</div>
				</div>
			)
		}
	}
)
