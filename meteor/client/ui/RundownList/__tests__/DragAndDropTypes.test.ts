import { protectString } from '../../../../lib/lib'
import { isRundownDragObject, isRundownPlaylistUiAction, RundownPlaylistUiActionTypes } from '../DragAndDropTypes'

describe('ui/RundownList/DragAndDropTypes', () => {
	describe('isRundownDragObject', () => {
		it('should return true for object with valid id', () => {
			const valid = { id: protectString('somethingsomething') }

			expect(isRundownDragObject(valid)).toBe(true)
		})

		it('should return false for null', () => {
			expect(isRundownDragObject(null)).toBe(false)
		})

		it('should return false for empty object', () => {
			expect(isRundownDragObject({})).toBe(false)
		})

		it('should return false for string', () => {
			expect(isRundownDragObject('lol')).toBe(false)
		})
	})

	// interface IRundownPlaylistUiAction {
	// 	type: string
	// 	rundownId: RundownId
	// 	targetPlaylistId?: RundownPlaylistId
	// }
	describe('isRundownPlaylistUiAction', () => {
		it('should return true for valid object with playlist id', () => {
			const valid = {
				type: RundownPlaylistUiActionTypes.HANDLE_RUNDOWN_DROP,
				rundownId: protectString('_Zdde0124650o12378459'),
				targetPlaylistId: protectString('rwjosietr34785585'),
			}

			expect(isRundownPlaylistUiAction(valid)).toBe(true)
		})

		it('should return true for valid object without playlist id', () => {
			const valid = {
				type: RundownPlaylistUiActionTypes.HANDLE_RUNDOWN_DROP,
				rundownId: protectString('_Zdde0124650o12378459'),
			}

			expect(isRundownPlaylistUiAction(valid)).toBe(true)
		})

		it('should return false for object with missing type', () => {
			const invalid = {
				rundownId: protectString('_Zdde0124650o12378459'),
			}

			expect(isRundownPlaylistUiAction(invalid)).toBe(false)
		})

		it('should return false for object with invalid type', () => {
			const invalid = {
				type: 'this is not from the correct enum',
				rundownId: protectString('_Zdde0124650o12378459'),
			}

			expect(isRundownPlaylistUiAction(invalid)).toBe(false)
		})

		it('should return false for object with missing rundown id', () => {
			const invalid = {
				type: RundownPlaylistUiActionTypes.HANDLE_RUNDOWN_DROP,
			}

			expect(isRundownPlaylistUiAction(invalid)).toBe(false)
		})

		// note that the RundownId type is a protected string, and runtime that will just be a regular string
		it('should return false for object with invalid rundownId', () => {
			const invalid = {
				type: RundownPlaylistUiActionTypes.NOOP,
				rundownId: 4,
			}

			expect(isRundownPlaylistUiAction(invalid)).toBe(false)
		})

		// note that the RundownPlaylistId type is a protected string, and runtime that will just be a regular string
		it('should return false for object with invalid targetPlaylistId', () => {
			const invalid = {
				type: RundownPlaylistUiActionTypes.NOOP,
				rundownId: protectString('_Zdde0124650o12378459'),
				targetPlaylistId: 47,
			}

			expect(isRundownPlaylistUiAction(invalid)).toBe(false)
		})
	})
})
