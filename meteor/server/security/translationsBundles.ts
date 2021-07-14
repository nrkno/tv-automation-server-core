import { TranslationsBundles } from '../../lib/collections/TranslationsBundles'

export namespace TranslationsBundlesSecurity {
	export function allowReadAccess(_selector: object, _token: string, _context: any): boolean {
		return true
	}
	export function allowWriteAccess(): boolean {
		return false
	}
}

TranslationsBundles.allow({
	insert(): boolean {
		return false
	},
	update(): boolean {
		return false
	},
	remove(): boolean {
		return false
	},
})
