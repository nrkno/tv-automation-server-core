import { ExpectedPackage } from '@sofie-automation/blueprints-integration'
import { registerCollection, ProtectedString, hashObj, assertNever, Time } from '../lib'
import { createMongoCollection } from './lib'
import { RundownId } from './Rundowns'
import { StudioId } from './Studios'
import { PieceId } from './Pieces'
import { registerIndex } from '../database'
import { AdLibActionId } from './AdLibActions'
import { BucketAdLibId } from './BucketAdlibs'
import { BucketAdLibActionId } from './BucketAdlibActions'
import { RundownBaselineAdLibActionId } from './RundownBaselineAdLibActions'
import { SegmentId } from './Segments'
/*
 Expected Packages are created from Pieces in the rundown.
 A "Package" is a generic term for a "thing that can be played", such as media files, audio, graphics etc..
 The blueprints generate Pieces with expectedPackages on them.
 These are then picked up by a Package Manager who then tries to fullfill the expectations.
 Example: An ExpectedPackage could be a "Media file to be present on the location used by a playout device".
   The Package Manager will then copy the file to the right place.
*/

export type ExpectedPackageId = ProtectedString<'ExpectedPackageId'>

export type ExpectedPackageFromRundown =
	| ExpectedPackageDBFromPiece
	| ExpectedPackageDBFromAdLibAction
	| ExpectedPackageDBFromBaselineAdLibAction
	| ExpectedPackageDBFromBaselineAdLibPiece

export type ExpectedPackageDB =
	| ExpectedPackageFromRundown
	| ExpectedPackageDBFromBucketAdLib
	| ExpectedPackageDBFromBucketAdLibAction
	| ExpectedPackageDBFromRundownBaselineObjects
	| ExpectedPackageDBFromStudioBaselineObjects

export enum ExpectedPackageDBType {
	PIECE = 'piece',
	ADLIB_PIECE = 'adlib_piece',
	ADLIB_ACTION = 'adlib_action',
	BASELINE_ADLIB_PIECE = 'baseline_adlib_piece',
	BASELINE_ADLIB_ACTION = 'baseline_adlib_action',
	BUCKET_ADLIB = 'bucket_adlib',
	BUCKET_ADLIB_ACTION = 'bucket_adlib_action',
	RUNDOWN_BASELINE_OBJECTS = 'rundown_baseline_objects',
	STUDIO_BASELINE_OBJECTS = 'studio_baseline_objects',
}
export interface ExpectedPackageDBBase extends Omit<ExpectedPackage.Base, '_id'> {
	_id: ExpectedPackageId
	/** The local package id - as given by the blueprints */
	blueprintPackageId: string

	/** The studio of the Rundown of the Piece this package belongs to */
	studioId: StudioId

	/** Hash that changes whenever the content or version changes. See getContentVersionHash() */
	contentVersionHash: string

	// pieceId: ProtectedString<any> | null
	fromPieceType: ExpectedPackageDBType

	created: Time
}
export interface ExpectedPackageDBFromPiece extends ExpectedPackageDBBase {
	fromPieceType: ExpectedPackageDBType.PIECE | ExpectedPackageDBType.ADLIB_PIECE
	/** The Piece this package belongs to */
	pieceId: PieceId
	/** The Segment this package belongs to */
	segmentId: SegmentId
	/** The rundown of the Piece this package belongs to */
	rundownId: RundownId
}

export interface ExpectedPackageDBFromBaselineAdLibPiece extends ExpectedPackageDBBase {
	fromPieceType: ExpectedPackageDBType.BASELINE_ADLIB_PIECE
	/** The Piece this package belongs to */
	pieceId: PieceId
	/** The rundown of the Piece this package belongs to */
	rundownId: RundownId
}

export interface ExpectedPackageDBFromAdLibAction extends ExpectedPackageDBBase {
	fromPieceType: ExpectedPackageDBType.ADLIB_ACTION
	/** The Adlib Action this package belongs to */
	pieceId: AdLibActionId
	/** The Segment this package belongs to */
	segmentId: SegmentId
	/** The rundown of the Piece this package belongs to */
	rundownId: RundownId
}
export interface ExpectedPackageDBFromBaselineAdLibAction extends ExpectedPackageDBBase {
	fromPieceType: ExpectedPackageDBType.BASELINE_ADLIB_ACTION
	/** The Piece this package belongs to */
	pieceId: RundownBaselineAdLibActionId
	/** The rundown of the Piece this package belongs to */
	rundownId: RundownId
}

export interface ExpectedPackageDBFromRundownBaselineObjects extends ExpectedPackageDBBase {
	fromPieceType: ExpectedPackageDBType.RUNDOWN_BASELINE_OBJECTS
	/** The rundown of the Piece this package belongs to */
	rundownId: RundownId
	pieceId: null
}
export interface ExpectedPackageDBFromStudioBaselineObjects extends ExpectedPackageDBBase {
	fromPieceType: ExpectedPackageDBType.STUDIO_BASELINE_OBJECTS
	pieceId: null
}

export interface ExpectedPackageDBFromBucketAdLib extends ExpectedPackageDBBase {
	fromPieceType: ExpectedPackageDBType.BUCKET_ADLIB
	/** The Bucket adlib this package belongs to */
	pieceId: BucketAdLibId
}
export interface ExpectedPackageDBFromBucketAdLibAction extends ExpectedPackageDBBase {
	fromPieceType: ExpectedPackageDBType.BUCKET_ADLIB_ACTION
	/** The Bucket adlib-action this package belongs to */
	pieceId: BucketAdLibActionId
}
export const ExpectedPackages = createMongoCollection<ExpectedPackageDB, ExpectedPackageDB>('expectedPackages')
registerCollection('ExpectedPackages', ExpectedPackages)

registerIndex(ExpectedPackages, {
	studioId: 1,
	fromPieceType: 1,
})
registerIndex(ExpectedPackages, {
	studioId: 1,
	pieceId: 1,
})
registerIndex(ExpectedPackages, {
	rundownId: 1,
	pieceId: 1,
})
export function getContentVersionHash(expectedPackage: Omit<ExpectedPackage.Any, '_id'>): string {
	return hashObj({
		content: expectedPackage.content,
		version: expectedPackage.version,
		// todo: should expectedPackage.sources.containerId be here as well?
	})
}
export function getPreviewPackageSettings(
	expectedPackage: ExpectedPackage.Any
): ExpectedPackage.SideEffectPreviewSettings | undefined {
	let packagePath: string | undefined

	if (expectedPackage.type === ExpectedPackage.PackageType.MEDIA_FILE) {
		packagePath = expectedPackage.content.filePath
	} else if (expectedPackage.type === ExpectedPackage.PackageType.QUANTEL_CLIP) {
		packagePath = expectedPackage.content.guid || expectedPackage.content.title
	} else {
		assertNever(expectedPackage)
	}
	if (packagePath) {
		return {
			path: packagePath + '_preview.webm',
		}
	}
	return undefined
}
export function getThumbnailPackageSettings(
	expectedPackage: ExpectedPackage.Any
): ExpectedPackage.SideEffectThumbnailSettings | undefined {
	let packagePath: string | undefined

	if (expectedPackage.type === ExpectedPackage.PackageType.MEDIA_FILE) {
		packagePath = expectedPackage.content.filePath
	} else if (expectedPackage.type === ExpectedPackage.PackageType.QUANTEL_CLIP) {
		packagePath = expectedPackage.content.guid || expectedPackage.content.title
	} else {
		assertNever(expectedPackage)
	}
	if (packagePath) {
		return {
			path: packagePath + '_thumbnail.png',
		}
	}
	return undefined
}
