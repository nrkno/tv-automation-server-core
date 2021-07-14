import * as React from 'react'
import { Accounts } from 'meteor/accounts-base'
import { Translated, translateWithTracker } from '../../../lib/ReactMeteorData/react-meteor-data'
import { RouteComponentProps } from 'react-router'
import { MeteorReactComponent } from '../../../lib/MeteorReactComponent'
import { getUser } from '../../../../lib/collections/Users'
import { NotLoggedInContainer } from './lib'
import { Link } from 'react-router-dom'

type IResetPageProps = RouteComponentProps<{ token: string }>

interface IResetPageState {
	password: string
	error: string | React.ReactElement<HTMLElement>
}

export const ResetPasswordPage = translateWithTracker((props: IResetPageProps) => {
	const user = getUser()
	if (user) {
		props.history.push('/rundowns')
	}

	return {}
})(
	class extends MeteorReactComponent<Translated<IResetPageProps>, IResetPageState> {
		constructor(props) {
			super(props)

			this.state = {
				password: '',
				error: '',
			}
			this.handleChange = this.handleChange.bind(this)
			this.validateChange = this.validateChange.bind(this)
			this.handleReset = this.handleReset.bind(this)
		}

		private handleChange(e: React.ChangeEvent<HTMLInputElement>) {
			this.setState({ ...this.state, [e.currentTarget.name]: e.currentTarget.value })
		}

		private validateChange(): boolean {
			const errors: string[] = []
			const { t } = this.props

			if (this.state.password.length < 5) {
				errors.push(t('Password must be atleast 5 characters long'))
			}
			/** Add more password rules */
			if (errors.length) {
				this.handleError(
					<React.Fragment>
						{errors.map((e, i) => (
							<span key={i}>{e}</span>
						))}
					</React.Fragment>
				)
				return false
			}
			return true
		}

		private handleReset(e: React.MouseEvent<HTMLElement>) {
			e.preventDefault()
			if (!this.validateChange()) return
			const token = this.props.match.params.token
			if (!this.state.password || this.state.password.length < 5)
				return this.handleError('Please set a password with atleast 5 characters')
			Accounts.resetPassword(token, this.state.password, (err) => {
				if (err) {
					console.error(err)
					return this.handleError('Unable to reset password')
				}
			})
		}

		private handleError(msg: string | React.ReactElement<HTMLElement>) {
			this.setState({ error: msg })
		}

		render() {
			const { t } = this.props
			return (
				<NotLoggedInContainer>
					<form onSubmit={(e: React.MouseEvent<HTMLFormElement>) => this.handleReset(e)}>
						<label htmlFor="password-reset">{t('Enter your new password')}</label>
						<input
							id="password-reset"
							className="mdinput mas"
							type="password"
							name="password"
							value={this.state.password}
							onChange={this.handleChange}
							onBlur={this.validateChange}
							placeholder={t('Password')}
						/>
						<button type="submit" className="btn btn-primary" onClick={this.handleReset}>
							{t('Set new password')}
						</button>
						<Link className="selectable" to="/">
							<button className="btn">{t('Go back')}</button>
						</Link>
					</form>
					<div className={'error-msg ' + (this.state.error && 'error-msg-active')}>
						<p>{this.state.error ? this.state.error : ''}&nbsp;</p>
					</div>
				</NotLoggedInContainer>
			)
		}
	}
)
