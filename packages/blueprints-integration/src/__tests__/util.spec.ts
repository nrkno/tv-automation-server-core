import { iterateDeeply, iterateDeeplyAsync, iterateDeeplyEnum } from '../util'

describe('Util', () => {
	test('iterateDeeply', () => {
		expect(
			iterateDeeply(
				{
					attr0: {
						subattr0: {
							_txt: 'foo',
						},
						subattr1: 'world',
					},
					attr1: 'hello',
				},
				(val) => {
					if (typeof val === 'object') {
						if (val._txt) {
							return val._txt
						}
					}
					return iterateDeeplyEnum.CONTINUE
				}
			)
		).toEqual({
			attr0: {
				subattr0: 'foo',
				subattr1: 'world',
			},
			attr1: 'hello',
		})
	})

	test('iterateDeeplyAsync', async () => {
		expect(
			await iterateDeeplyAsync(
				{
					attr0: {
						subattr0: {
							_txt: 'foo',
						},
						subattr1: 'world',
					},
					attr1: 'hello',
				},
				(val) => {
					return new Promise((resolve) => {
						const f = () => {
							if (typeof val === 'object') {
								if (val._txt) {
									return val._txt
								}
							}
							return iterateDeeplyEnum.CONTINUE
						}
						setTimeout(() => {
							resolve(f())
						}, 10)
					})
				}
			)
		).toEqual({
			attr0: {
				subattr0: 'foo',
				subattr1: 'world',
			},
			attr1: 'hello',
		})
	})

	test('iterateDeeply nora', () => {
		const rawData = {
			funksjoner: [
				{
					funksjon: 'Redaktør:',
					navn: '',
					'@name': 'funksjoner',
					'@type': 'element',
				},
				{
					funksjon: 'Regi:',
					navn: '',
					'@name': 'funksjoner',
					'@type': 'element',
				},
			],
			sami: false,
			_valid: true,
		}

		const expected = {
			funksjoner: [
				{
					funksjon: 'Redaktør:',
					navn: '',
				},
				{
					funksjon: 'Regi:',
					navn: '',
				},
			],
			sami: false,
			_valid: true,
		}

		const content = iterateDeeply(rawData, (value, key) => {
			// Remove any special conversion keys
			if (key === '@name' || key === '@type') {
				return undefined
			}

			if (
				typeof key !== 'number' &&
				key &&
				typeof value === 'object' &&
				value['@type'] === 'element' &&
				!value.elements
			) {
				return ''
			}

			return iterateDeeplyEnum.CONTINUE
		})
		expect(content).toEqual(expected)
	})

	test('iterateDeeplyAsync nora', async () => {
		const rawData = {
			funksjoner: [
				{
					funksjon: 'Redaktør:',
					navn: '',
					'@name': 'funksjoner',
					'@type': 'element',
				},
				{
					funksjon: 'Regi:',
					navn: '',
					'@name': 'funksjoner',
					'@type': 'element',
				},
			],
			sami: false,
			_valid: true,
		}

		const expected = {
			funksjoner: [
				{
					funksjon: 'Redaktør:',
					navn: '',
				},
				{
					funksjon: 'Regi:',
					navn: '',
				},
			],
			sami: false,
			_valid: true,
		}

		const content = await iterateDeeplyAsync(rawData, async (value, key) => {
			// Remove any special conversion keys
			if (key === '@name' || key === '@type') {
				return undefined
			}

			if (
				typeof key !== 'number' &&
				key &&
				typeof value === 'object' &&
				value['@type'] === 'element' &&
				!value.elements
			) {
				return ''
			}

			return iterateDeeplyEnum.CONTINUE
		})
		expect(content).toEqual(expected)
	})
})
