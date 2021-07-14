const noFocusedTestRule = require('./noFocusedTestRule')

module.exports = {
	rules: {
		'no-focused-test': noFocusedTestRule.default,
	},
	configs: {
		all: {
			plugins: ['custom-rules'],
			rules: {
				'custom-rules/no-focused-test': 'error',
			}
		}
	}
}
