import {
	IBlueprintPiece,
	PartHoldMode,
	IBlueprintMutatablePart,
	PieceLifespan,
} from '@sofie-automation/blueprints-integration'

const IBlueprintPieceSample: Required<IBlueprintPiece> = {
	externalId: '',
	enable: { start: 0 },
	virtual: false,
	continuesRefId: '',
	isTransition: false,
	extendOnHold: false,
	name: '',
	metaData: {},
	sourceLayerId: '',
	outputLayerId: '',
	content: { timelineObjects: [] },
	transitions: {},
	lifespan: PieceLifespan.WithinPart,
	adlibPreroll: 0,
	toBeQueued: false,
	expectedPlayoutItems: [],
	adlibAutoNext: false,
	adlibAutoNextOverlap: 0,
	adlibDisableOutTransition: false,
	tags: [],
	expectedPackages: [],
	hasSideEffects: false,
}
// Compile a list of the keys which are allowed to be set
export const IBlueprintPieceSampleKeys = Object.keys(IBlueprintPieceSample) as Array<keyof IBlueprintPiece>

const IBlueprintMutatablePartSample: Required<IBlueprintMutatablePart> = {
	title: '',
	metaData: {},
	autoNext: false,
	autoNextOverlap: 0,
	prerollDuration: 0,
	transitionPrerollDuration: null,
	transitionKeepaliveDuration: null,
	transitionDuration: null,
	disableOutTransition: false,
	expectedDuration: 0,
	holdMode: PartHoldMode.NONE,
	shouldNotifyCurrentPlayingPart: false,
	classes: [],
	classesForNext: [],
	displayDurationGroup: '',
	displayDuration: 0,
	identifier: '',
}
// Compile a list of the keys which are allowed to be set
export const IBlueprintMutatablePartSampleKeys = Object.keys(IBlueprintMutatablePartSample) as Array<
	keyof IBlueprintMutatablePart
>
