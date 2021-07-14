import { ExpectedPackage } from './package'
import { ConfigManifestEntry } from './config'
import { SomeContent } from './content'
import { ITranslatableMessage } from './translations'
import { ExpectedPlayoutItemGeneric } from './rundown'

export interface ActionUserData {
	[key: string]: any
}

export enum ActionExecuteAfterChanged {
	/** Do not execute the action after userData has changed, unless specifically triggered by the user */
	none = 'none',
	/** Execute the action immediately after userData has changed */
	immediately = 'immediately',
	/** Execute the action after userData has changed and there was an identifiable period of calm in the changes */
	debounce = 'debounce',
}

export interface IBlueprintActionManifestDisplay {
	/** A label to be displayed to the user */
	label: ITranslatableMessage
	/** An optional, longer description that will not be immediately visible to the user */
	description?: ITranslatableMessage
	_rank?: number

	/** This is the label to be shown in the inspector for "Execute Action" */
	triggerLabel?: ITranslatableMessage

	tags?: string[]
	/** Piece tags to use to determine if action is currently active */
	currentPieceTags?: string[]
	/** Piece tags to use to determine if action is set as next */
	nextPieceTags?: string[]
	/** String that can be used to identify adlibs that are equivalent to each other */
	uniquenessId?: string
}

export interface IBlueprintActionManifestDisplayContent extends IBlueprintActionManifestDisplay {
	/** Source layer the timeline item belongs to */
	sourceLayerId: string
	/** Layer output this piece belongs to */
	outputLayerId: string
	/** Description used to produce the thumbnail, sourceDuration, etc. information for the adlib */
	content: SomeContent
}

export interface IBlueprintActionTriggerMode {
	/** Data sent to action when executing */
	data: string

	display: {
		_rank: number
		/** A label to be displayed to the user */
		label: ITranslatableMessage
		/** An optional, longer description that will not be immediately visible to the user */
		description?: ITranslatableMessage
	}
}

export interface IBlueprintActionManifest {
	/** Id of the action */
	actionId: string
	/** Properties defining the action behaviour */
	userData: ActionUserData

	/** Set if ad-lib action should be limited in context to the current part/segment */
	partId?: string

	userDataManifest: {
		/** List of editable fields in userData, to allow for customising */
		editableFields?: ConfigManifestEntry[]
		/** Execute the action after userData is changed. If not present ActionExecuteAfterChanged.none is assumed. */
		executeOnUserDataChanged?: ActionExecuteAfterChanged
		// Potential future properties:
		// asloDisplayACtionButton: boolean
	}

	display: IBlueprintActionManifestDisplay | IBlueprintActionManifestDisplayContent

	/** Optional ways of executing this action. The default option is computed from the display properties */
	triggerModes?: IBlueprintActionTriggerMode[]

	/** Array of items expected to be played out. This is used by playout-devices to preload stuff.
	 * @deprecated replaced by .expectedPackages
	 */
	expectedPlayoutItems?: ExpectedPlayoutItemGeneric[]
	/**
	 * An array of which Packages this Action uses. This is used by a Package Manager to ensure that the Package is in place for playout.
	 */
	expectedPackages?: ExpectedPackage.Any[]
}
