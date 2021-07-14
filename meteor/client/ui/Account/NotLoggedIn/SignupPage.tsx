import * as React from 'react'
import { Translated, translateWithTracker } from '../../../lib/ReactMeteorData/react-meteor-data'
import { RouteComponentProps } from 'react-router'
import { MeteorReactComponent } from '../../../lib/MeteorReactComponent'
import { getUser } from '../../../../lib/collections/Users'
import { NotLoggedInContainer } from './lib'
import { Link } from 'react-router-dom'
import { createUser } from '../../../../lib/api/user'

type ISignupPageProps = RouteComponentProps

interface ISignupPageState {
	email: string
	password: string
	name: string
	organization: string
	applications: string[]
	broadcastMediums: string[]
	error: string
}

export const SignupPage = translateWithTracker((props: ISignupPageProps) => {
	const user = getUser()
	if (user) props.history.push('/rundowns')
	return {}
})(
	class SignupPage extends MeteorReactComponent<Translated<ISignupPageProps>, ISignupPageState> {
		private applications: string[] = [
			'Doing TV shows from a studio',
			'Doing streaming on the web from a studio',
			'Doing OB productions',
			'Installers / Integrators',
		]
		private broadcastMediums: string[] = ['News', 'Sports', 'E-Sports', 'Entertainment']

		constructor(props) {
			super(props)

			this.state = {
				email: '',
				password: '',
				name: '',
				organization: '',
				applications: [],
				broadcastMediums: [],
				error: '',
			}

			this.handleChange = this.handleChange.bind(this)
		}

		private handleChange(e: React.ChangeEvent<HTMLInputElement>) {
			if (Array.isArray(this.state[e.currentTarget.name])) {
				const item = this.state[e.currentTarget.name]
				if (e.currentTarget.type === 'checkbox') {
					if (e.currentTarget.checked) {
						item.push(e.currentTarget.value)
					} else {
						const found = item.findIndex((i) => i === e.currentTarget.value)
						item.splice(found, 1)
					}
				} else {
					const found = item.findIndex((i) => !this[e.currentTarget.name].includes(i))
					found !== -1 ? item.splice(found, 1, e.currentTarget.value) : item.push(e.currentTarget.value)
				}
				this.setState({ ...this.state, [e.currentTarget.name]: item.filter((i) => i.length) })
			} else {
				this.setState({ ...this.state, [e.currentTarget.name]: e.currentTarget.value })
			}
		}

		private handleError(msg: string) {
			this.setState({ error: msg })
		}

		private createAccount(e: React.MouseEvent<HTMLElement>) {
			e.preventDefault()
			try {
				if (!this.state.name.length) throw new Error('Please enter a name for the account')
				if (!this.state.email.length) throw new Error('Please enter an email address')
				// if(!validEmailRegex.test(this.state.email)) throw new Error('Invalid email address')
				if (!this.state.password.length) throw new Error('Please enter an password')
				if (!this.state.name.length) throw new Error('Please enter your full name')
				if (!this.state.organization.length) throw new Error('Please enter an orgainzation name')
				if (!this.state.applications.length) throw new Error('Please tell us what you mainly do')
				if (!this.state.broadcastMediums.length) throw new Error('Please select a broadcast medium')
			} catch (error) {
				this.handleError(error.message)
				return
			}
			createUser({
				email: this.state.email,
				password: this.state.password,
				profile: { name: this.state.name },
				createOrganization: {
					name: this.state.organization,
					applications: this.state.applications,
					broadcastMediums: this.state.broadcastMediums,
				},
			}).catch((error) => {
				console.error('Error creating new User', error)
				this.handleError(`Error creating new user: ${error.reason || error.toString()}`)
			})
		}
		render() {
			const { t } = this.props
			return (
				<NotLoggedInContainer>
					<form className="frow content-left">
						<div className="mtl flex-col page">
							<p>{t('Your Account')}</p>
							<input
								className="mdinput mas"
								type="text"
								name="name"
								value={this.state.name}
								onChange={this.handleChange}
								placeholder="Full Name"
							/>
							<input
								className="mdinput mas"
								type="email"
								name="email"
								value={this.state.email}
								onChange={this.handleChange}
								placeholder="Email Address"
							/>
							<input
								className="mdinput mas"
								type="password"
								name="password"
								value={this.state.password}
								onChange={this.handleChange}
								placeholder="Password"
							/>
						</div>
						<div className="mtl flex-col page">
							<p>{t('About Your Organization')}</p>
							<input
								className="mdinput mas"
								type="text"
								name="organization"
								value={this.state.organization}
								onChange={this.handleChange}
								placeholder="Company / Organization name"
							/>
							<p>{t('We are mainly')}</p>
							<ul>
								{this.applications.map((a, i) => (
									<div key={i}>
										<input
											id={`applications-${i}`}
											type="checkbox"
											name="applications"
											checked={this.state.applications.indexOf(a) !== -1}
											value={a}
											onChange={this.handleChange}
										/>
										<label htmlFor={`applications-${i}`}>{a}</label>
									</div>
								))}
								<div>
									<input type="text" name="applications" placeholder="Other" onChange={this.handleChange} />
								</div>
							</ul>
							<p>{t('Areas')}</p>
							<ul>
								{this.broadcastMediums.map((a, i) => (
									<div key={i}>
										<input
											id={`mediums-${i}`}
											type="checkbox"
											name="broadcastMediums"
											checked={this.state.broadcastMediums.indexOf(a) !== -1}
											value={a}
											onChange={this.handleChange}
										/>
										<label htmlFor={`mediums-${i}`}>{a}</label>
									</div>
								))}
								<div>
									<input type="text" name="broadcastMediums" placeholder="Other" onChange={this.handleChange} />
								</div>
							</ul>
						</div>
					</form>
					<div className="flex-row-center container pills">
						<Link className="selectable" to="/">
							<button className="btn">{t('Go back')}</button>
						</Link>
						<button
							className="btn btn-primary"
							onClick={(e: React.MouseEvent<HTMLButtonElement>) => this.createAccount(e)}
						>
							{t('Create New Account')}
						</button>
					</div>
					<div className={'error-msg ' + (this.state.error && 'error-msg-active')}>
						<p>{this.state.error ? this.state.error : ''}&nbsp;</p>
					</div>
				</NotLoggedInContainer>
			)
		}
	}
)
