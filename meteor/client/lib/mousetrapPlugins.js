import Mousetrap from 'mousetrap'
;(function (Mousetrap) {
	var _globalCallbacks = {}
	var _originalStopCallback = Mousetrap.prototype.stopCallback

	Mousetrap.prototype.stopCallback = function (e, element, combo, sequence) {
		var self = this

		if (self.paused) {
			return true
		}

		if (_globalCallbacks[combo] || _globalCallbacks[sequence]) {
			return false
		}

		return _originalStopCallback.call(self, e, element, combo)
	}

	Mousetrap.prototype.bindGlobal = function (keys, callback, action) {
		var self = this
		self.bind(keys, callback, action)

		if (keys instanceof Array) {
			for (var i = 0; i < keys.length; i++) {
				_globalCallbacks[keys[i]] = true
			}
			return
		}

		_globalCallbacks[keys] = true
	}

	Mousetrap.init()
})(Mousetrap)
;(function (Mousetrap) {
	var _originalStopCallback = Mousetrap.prototype.stopCallback
	var _originalHandleKey = Mousetrap.prototype.handleKey

	let _shouldAbortNextCombo = false
	// let _isEscapePressed = false

	const _downKeys = []

	Mousetrap.prototype.handleKey = function (character, modifiers, e) {
		var self = this

		if (e.type === 'keydown' && !_downKeys.includes(character)) _downKeys.push(character)
		if (e.type === 'keyup') {
			const index = _downKeys.indexOf(character)
			if (index >= 0) {
				_downKeys.splice(_downKeys.indexOf(character), 1)
			}
		}

		return _originalHandleKey.apply(self, arguments)
	}

	Mousetrap.prototype.stopCallback = function (e, element, combo, _sequence) {
		var self = this

		if (self.paused) {
			return true
		}

		if (_shouldAbortNextCombo && combo !== 'esc' && e.type === 'keyup') {
			_shouldAbortNextCombo = false
			return true
		}

		return _originalStopCallback.call(self, e, element, combo)
	}

	// const escDown = function (e) {
	// 	_isEscapePressed = true

	// 	if (!e.repeat) {
	// 		_shouldAbortNextCombo = _downKeys.length > 1
	// 	}

	// 	e.preventDefault()
	// 	e.stopPropagation()
	// }

	// const escUp = function (e) {
	// 	_isEscapePressed = false

	// 	if (_downKeys.length === 0) {
	// 		_shouldAbortNextCombo = false
	// 	}
	// }

	Mousetrap.init()

	// 	mousetrapHelper.bind('esc', escDown, 'keydown', undefined, true);
	// 	mousetrapHelper.bind('esc', escUp, 'keyup', undefined, true);
})(Mousetrap)

// Disable default browser action for alt keys - focus window menu
;(function (Mousetrap) {
	Mousetrap.init()

	function preventDefault(e) {
		e.preventDefault()
	}

	Mousetrap.bind('alt', preventDefault, 'keydown')
	Mousetrap.bind('alt', preventDefault, 'keyup')
})(Mousetrap)
