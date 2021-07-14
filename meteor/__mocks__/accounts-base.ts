import { RandomMock } from './random'
import { MeteorMock } from './meteor'

export class AccountsBaseMock {
	static mockUsers: any = {}

	// From https://docs.meteor.com/api/passwords.html

	static createUser(options, cb: (err: any | undefined, result?: any) => void): void {
		const user = {
			_id: RandomMock.id(),
			...options,
		}
		AccountsBaseMock.mockUsers[user._id] = user
		MeteorMock.setTimeout(() => {
			cb(undefined, user._id)
		}, 1)
		throw new Error('Mocked function not implemented')
	}
	static setUsername(userId, newUsername): void {
		AccountsBaseMock.mockUsers[userId].username = newUsername
		throw new Error('Mocked function not implemented')
	}
	static removeEmail(_userId, _email): void {
		throw new Error('Mocked function not implemented')
	}
	static verifyEmail(_token, _cb: (err: any | undefined, result?: any) => void): void {
		throw new Error('Mocked function not implemented')
	}
	static findUserByUsername(_username): void {
		throw new Error('Mocked function not implemented')
	}
	static findUserByEmail(_email): void {
		throw new Error('Mocked function not implemented')
	}
	static changePassword(_oldPassword, _newPassword, _cb: (err: any | undefined, result?: any) => void): void {
		throw new Error('Mocked function not implemented')
	}
	static forgotPassword(_options, _cb: (err: any | undefined, result?: any) => void): void {
		throw new Error('Mocked function not implemented')
	}
	static resetPassword(_token, _newPassword, _cb: (err: any | undefined, result?: any) => void): void {
		throw new Error('Mocked function not implemented')
	}
	static setPassword(_userId, _newPassword, _options): void {
		throw new Error('Mocked function not implemented')
	}
	static sendResetPasswordEmail(_userId, _email): void {
		throw new Error('Mocked function not implemented')
	}
	static sendEnrollmentEmail(_userId, _email): void {
		throw new Error('Mocked function not implemented')
	}
	static sendVerificationEmail(_userId, _email): void {
		throw new Error('Mocked function not implemented')
	}
	static onResetPasswordLink?: () => void
	static onEnrollmentLink?: () => void
	static onEmailVerificationLink?: () => void
	static emailTemplates?: () => void

	// loginServicesConfigured()
	// loginServiceConfiguration.find();
}
export function setup() {
	return {
		Accounts: AccountsBaseMock,
	}
}
