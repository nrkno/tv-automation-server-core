/**
 * vibrate is a nice feature, but doesn't seem to be a standard: https://caniuse.com/?search=vibrate
 */

if (typeof navigator.vibrate !== 'function') {
	navigator.vibrate = (_pattern: number | number[]): boolean => {
		return false
	}
}
