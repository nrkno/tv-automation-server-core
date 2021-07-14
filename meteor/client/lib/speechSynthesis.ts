const speechSynthesis = window.speechSynthesis

const VOICE_PREFERENCE = [
	// ordered in preferred order (best first)
	'Google uk English Female',
	'Google uk English Male',
	'en-gb',
	'en-us',
	'-default',
]
const VOICE_PITCH = 0.9
const VOICE_RATE = 1 // speed

interface TextCommand {
	text: string
	category: string
}
class SpeechSynthesisClass {
	private _isInitialized: boolean = false
	private _voice: SpeechSynthesisVoice | undefined

	private _queue: Array<TextCommand> = []
	init() {
		if (!this._isInitialized) {
			this._isInitialized = true

			if (speechSynthesis) {
				this._voice = this.selectVoice()
			} else {
				console.warn('Speech synthesis not available')
			}
		}
	}
	speak(textToSpeak: string, category?: string) {
		return this._speak({
			text: textToSpeak,
			category: category || '',
		})
	}
	_speak(textCommand: TextCommand, fromQueue?: boolean) {
		if (!this._isInitialized) {
			console.warn('Speech synthesis not initialized')
			return
		}
		if (!this._voice) {
			console.warn('SpeechSynthesis: No voice found')
			return
		}
		if (!textCommand.text) {
			// do nothing
			return
		}
		if (speechSynthesis.speaking) {
			// Put on queue
			if (fromQueue) {
				// it came from the queue, put it back there
				this._queue.unshift(textCommand)
			} else {
				if (this._queue.length && textCommand.category) {
					// filter out queued ones of the same category:
					this._queue = this._queue.filter((c) => c.category !== textCommand.category)
				}
				this._queue.push(textCommand)
			}
			return
		}

		const utterThis = new SpeechSynthesisUtterance(textCommand.text)
		utterThis.onend = () => {
			this._checkQueue()
		}
		utterThis.onerror = (event) => {
			this._checkQueue()
			console.warn('SpeechSynthesisUtterance.onerror', event)
		}
		utterThis.voice = this._voice
		utterThis.pitch = VOICE_PITCH
		utterThis.rate = VOICE_RATE
		speechSynthesis.speak(utterThis)
	}
	private _checkQueue() {
		const textCommand = this._queue.shift()
		if (textCommand) {
			this._speak(textCommand)
		}
	}
	private selectVoice(): SpeechSynthesisVoice | undefined {
		const voices = speechSynthesis
			.getVoices()
			.map((voice) => {
				const voiceName = voice.name + ` (${voice.lang})` + (voice.default ? ' -default' : '')

				let weight = 999
				VOICE_PREFERENCE.forEach((n, i) => {
					if (voiceName.match(new RegExp(n, 'i'))) weight = i
				})
				return { weight, voice }
			})
			.sort((a, b) => {
				return a.weight - b.weight
			})
		return (voices[0] || {}).voice
	}
}

// Singleton:
export const SpeechSynthesiser = new SpeechSynthesisClass()
