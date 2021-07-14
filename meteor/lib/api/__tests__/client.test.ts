import { ClientAPI } from '../client'
import { Meteor } from 'meteor/meteor'

describe('ClientAPI', () => {
	it('Creates a responseSuccess object', () => {
		const mockSuccessValue = {
			someData: 'someValue',
		}
		const response = ClientAPI.responseSuccess(mockSuccessValue)
		expect(response).toMatchObject({
			success: 200,
			result: mockSuccessValue,
		})
	})
	it('Creates a responseError object', () => {
		const mockErrorDetail = {
			someData: 'someValue',
		}
		const mockErrorMessage = 'Some error'

		{
			const error = ClientAPI.responseError(420, mockErrorMessage, mockErrorDetail)
			expect(error).toMatchObject({
				error: 420,
				message: mockErrorMessage,
				details: mockErrorDetail,
			})
		}

		{
			const error = ClientAPI.responseError(mockErrorMessage)
			expect(error).toMatchObject({
				error: 500,
				message: mockErrorMessage,
				details: undefined,
			})
		}
	})
	describe('isClientResponseSuccess', () => {
		it('Correctly recognizes a responseSuccess object', () => {
			const response = ClientAPI.responseSuccess(undefined)
			expect(ClientAPI.isClientResponseSuccess(response)).toBe(true)
		})
		it('Correctly recognizes a not-success object', () => {
			const response = ClientAPI.responseError('Some error')
			expect(ClientAPI.isClientResponseSuccess(response)).toBe(false)
		})
		it('Correctly recognizes that a Meteor.Error is not a success object', () => {
			expect(ClientAPI.isClientResponseSuccess(new Meteor.Error(404))).toBe(false)
		})
	})
	describe('isClientResponseError', () => {
		it('Correctly recognizes a responseError object', () => {
			const response = ClientAPI.responseError('Some error')
			expect(ClientAPI.isClientResponseError(response)).toBe(true)
		})
		it('Correctly regognizes a not-error object', () => {
			const response = ClientAPI.responseSuccess(undefined)
			expect(ClientAPI.isClientResponseError(response)).toBe(false)
		})
		it('Correctly recognizes that a Meteor.Error is not an error object', () => {
			expect(ClientAPI.isClientResponseError(new Meteor.Error(404))).toBe(false)
		})
	})
})
