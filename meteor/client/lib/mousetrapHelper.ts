import * as mousetrap from 'mousetrap'
import 'mousetrap/plugins/global-bind/mousetrap-global-bind'
import { isEventInInputField } from './lib'
import { isModalShowing } from './ModalDialog'

interface IWrappedCallback {
	allowInModal: boolean
	isGlobal: boolean
	original: (e: mousetrap.ExtendedKeyboardEvent) => void
	tag?: string
}

export namespace mousetrapHelper {
	const _boundHotkeys: {
		[key: string]: IWrappedCallback[]
	} = {}

	function handleKey(keys: string, e: mousetrap.ExtendedKeyboardEvent) {
		if (_boundHotkeys[keys] === undefined) {
			return
		}
		_boundHotkeys[keys].forEach((handler) => {
			if (!handler.isGlobal && isEventInInputField(e)) return
			e.preventDefault()
			if (!handler.allowInModal && isModalShowing()) return
			handler.original(e)
		})
	}

	export function bindGlobal(
		keys: string,
		callback: (e: mousetrap.ExtendedKeyboardEvent) => void,
		action?: string,
		tag?: string,
		allowInModal?: boolean
	) {
		let index = keys
		if (action) index = keys + '_' + action
		if (
			// if not yet bound
			_boundHotkeys[index] === undefined ||
			// or bound so far were not globals
			_boundHotkeys[index].reduce((mem, i) => mem || i.isGlobal, false) === false
		) {
			if (_boundHotkeys[index] === undefined) _boundHotkeys[index] = []
			mousetrap.bindGlobal(
				keys,
				(e: mousetrap.ExtendedKeyboardEvent) => {
					handleKey(index, e)
				},
				action
			)
		}

		_boundHotkeys[index].push({
			isGlobal: true,
			allowInModal: !!allowInModal,
			original: callback,
			tag,
		})
	}

	export function bind(
		keys: string,
		callback: (e: mousetrap.ExtendedKeyboardEvent) => void,
		action?: string,
		tag?: string,
		allowInModal?: boolean
	) {
		let index = keys
		if (action) index = keys + '_' + action
		if (_boundHotkeys[index] === undefined) {
			_boundHotkeys[index] = []
			mousetrap.bind(
				keys,
				(e: mousetrap.ExtendedKeyboardEvent) => {
					handleKey(index, e)
				},
				action
			)
		}

		_boundHotkeys[index].push({
			isGlobal: false,
			allowInModal: !!allowInModal,
			original: callback,
			tag,
		})
	}

	export function unbindAll(keys: string[], action?: string, tag?: string) {
		keys.forEach((key) => {
			if (!tag) {
				let index = key
				if (action) index = key + '_' + action
				mousetrap.unbind(key, action)
				if (_boundHotkeys[index] === undefined) return
				delete _boundHotkeys[index]
			} else {
				unbind(key, tag, action)
			}
		})
	}

	export function unbind(
		keys: string,
		callbackOrTag: ((e: mousetrap.ExtendedKeyboardEvent) => void) | string,
		action?: string
	) {
		let index = keys
		if (action) index = keys + '_' + action

		const tag = typeof callbackOrTag === 'string' ? callbackOrTag : undefined
		const callback = typeof callbackOrTag === 'function' ? callbackOrTag : undefined

		if (!callback && !tag) {
			throw new Error(`Need to provide either a callback or a tag`)
		}

		if (_boundHotkeys[index] === undefined) return
		let callbackIndex = 0
		while (callbackIndex >= 0) {
			callbackIndex = _boundHotkeys[index].findIndex((i) => i.original === callback || i.tag === tag)
			if (callbackIndex >= 0) {
				_boundHotkeys[index].splice(callbackIndex, 1)
			}
		}
		if (_boundHotkeys[index].length === 0) {
			delete _boundHotkeys[index]
			mousetrap.unbind(keys, action)
		}
	}

	export function shortcutLabel(hotkey: string, isMacLike: boolean = false): string {
		if (isMacLike) {
			hotkey = hotkey.replace(/mod/i, '\u2318')
		} else {
			hotkey = hotkey.replace(/mod/i, 'Ctrl')
		}
		// capitalize first letter of each combo key
		hotkey = hotkey
			.replace(/(\w)\w*/gi, (substring: string) => {
				return substring.substr(0, 1).toUpperCase() + substring.substr(1).toLowerCase()
			})
			.replace(/(\s*,\s*)/g, () => {
				return ', '
			})

		return hotkey
	}
}

// Add mousetrap keycodes for special keys
mousetrap.addKeycodes({
	220: '§', // on US-based (ANSI) keyboards (single-row, Enter key), this is the key above Enter, usually with a backslash and the vertical pipe character

	// TODO: These keys have temporarly been prefixed by 9x so that thye don't actually register as hotkeys,
	// but can still be used, as they will generally map onto .which === 220
	90220: '\\', // on ANSI-based keyboards, this is the key with single quote
	91220: '|', // this key is not present on ANSI-based keyboards

	187: 'nbPlus', // this is also listed as 'add' below
	219: 'nbBackslash',
	221: 'å',
	186: '¨',
	192: 'ø',
	222: 'æ',
	191: "'",
	190: 'nbPeriod',
	189: 'nbMinus',

	96: 'num0',
	97: 'num1',
	98: 'num2',
	99: 'num3',
	100: 'num4',
	101: 'num5',
	102: 'num6',
	103: 'num7',
	104: 'num8',
	105: 'num9',
	106: 'numMul',
	107: 'numAdd',
	109: 'numSub',
	110: 'numDot',
	111: 'numDiv',
	// 187: 'add',
	188: 'comma',
})
