import * as React from 'react'
import { Meteor } from 'meteor/meteor'
import { Accounts } from 'meteor/accounts-base'
import { Translated, translateWithTracker } from '../../../lib/ReactMeteorData/react-meteor-data'
import { Link } from 'react-router-dom'
import { RouteComponentProps } from 'react-router'
import { MeteorReactComponent } from '../../../lib/MeteorReactComponent'
import { StatusResponse } from '../../../../lib/api/systemStatus'
import { getUser, User } from '../../../../lib/collections/Users'
import { NotLoggedInContainer } from './lib'

interface ILoginProps extends RouteComponentProps<{ token: string }> {
	requestedRoute: string
}

interface ILoginPageProps extends ILoginProps {
	user: User | null
}

interface ILoginPageState {
	systemStatus?: StatusResponse
	email: string
	password: string
	error: string
}

export const LoginPage = translateWithTracker((_props: ILoginProps) => {
	const user = getUser()
	return { user: user ? user : null }
})(
	class extends MeteorReactComponent<Translated<ILoginPageProps>, ILoginPageState> {
		// private _subscriptions: Array<Meteor.SubscriptionHandle> = []

		constructor(props) {
			super(props)

			this.state = {
				email: '',
				password: '',
				error: '',
			}

			this.handleChange = this.handleChange.bind(this)
			this.attempLogin = this.attempLogin.bind(this)
			this.handleLoginAttempt = this.handleLoginAttempt.bind(this)
		}

		private handleChange(e: React.ChangeEvent<HTMLInputElement>) {
			if (this.state[e.currentTarget.name] === undefined) return
			return this.setState({ ...this.state, [e.currentTarget.name]: e.currentTarget.value })
		}

		private attempLogin(e: React.MouseEvent<HTMLFormElement>): void {
			e.preventDefault()
			try {
				if (!this.state.email.length) throw new Error('Please enter an email address')
				if (!this.state.password.length) throw new Error('Please enter an password')
			} catch (error) {
				this.HandleError(error.message)
				return
			}
			Meteor.loginWithPassword(this.state.email, this.state.password, this.handleLoginAttempt)
		}

		private handleLoginAttempt(error: Error | undefined) {
			if (error) {
				this.HandleError('Incorrect email or password')
			}
		}

		private HandleError(msg: string) {
			this.setState({ error: msg })
		}

		componentDidMount() {
			const token = this.props.match.params.token
			const user = this.props.user
			if (token && (!user || (user && !user.emails[0].verified))) {
				Accounts.verifyEmail(token, (e) => {
					if (e) return this.setState({ error: e.message })
				})
			} else if (user) {
				this.props.requestedRoute
					? this.props.history.push(this.props.requestedRoute)
					: this.props.history.push('/rundowns')
			}
		}

		render() {
			const { t } = this.props

			return (
				<NotLoggedInContainer>
					<form onSubmit={(e: React.MouseEvent<HTMLFormElement>) => this.attempLogin(e)}>
						<input
							className="mdinput mas"
							type="text"
							value={this.state.email}
							onChange={this.handleChange}
							placeholder={t('Email Address')}
							name="email"
						/>
						<input
							className="mdinput mas"
							type="password"
							value={this.state.password}
							onChange={this.handleChange}
							placeholder={t('Password')}
							name="password"
						/>
						<button type="submit" className="btn btn-primary">
							{t('Sign in')}
						</button>
					</form>
					<div className="mas">
						<Link className="selectable" to="/signup">
							<button className="btn">{t('Create New Account')}</button>
						</Link>
						<Link className="selectable" to="/reset">
							{t('Lost password?')}
						</Link>
					</div>
					<div className={'error-msg ' + (this.state.error && 'error-msg-active')}>
						<p>{this.state.error.length ? this.state.error : ''}&nbsp;</p>
					</div>
				</NotLoggedInContainer>
			)
		}
	}
)
