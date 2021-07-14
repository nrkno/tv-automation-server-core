import * as _ from 'underscore'
import {
	VTContent,
	GraphicsContent,
	SourceLayerType,
	ISourceLayer,
	IBlueprintPieceGeneric,
	ExpectedPackageStatusAPI,
	PackageInfo,
} from '@sofie-automation/blueprints-integration'
import { RundownAPI } from './api/rundown'
import { MediaObjects, MediaInfo, MediaObject, MediaStream } from './collections/MediaObjects'
import * as i18next from 'i18next'
import { IStudioSettings, routeExpectedPackages, Studio } from './collections/Studios'
import { NoteType } from './api/notes'
import { PackageInfos } from './collections/PackageInfos'
import { protectString, unprotectString } from './lib'
import { getPackageContainerPackageStatus } from './globalStores'

/**d
 * Take properties from the mediainfo / medistream and transform into a
 * formatted string
 */
export function buildFormatString(mediainfo: MediaInfo, stream: MediaStream): string {
	let format = `${stream.width || 0}x${stream.height || 0}`
	switch (mediainfo.field_order) {
		case PackageInfo.FieldOrder.Progressive:
			format += 'p'
			break
		case PackageInfo.FieldOrder.Unknown:
			format += '?'
			break
		default:
			format += 'i'
			break
	}
	if (stream.codec.time_base) {
		const formattedTimebase = /(\d+)\/(\d+)/.exec(stream.codec.time_base) as RegExpExecArray
		let fps = Number(formattedTimebase[2]) / Number(formattedTimebase[1])
		fps = Math.floor(fps * 100 * 100) / 100
		format += fps
	}
	switch (mediainfo.field_order) {
		case PackageInfo.FieldOrder.BFF:
			format += 'bff'
			break
		case PackageInfo.FieldOrder.TFF:
			format += 'tff'
			break
		default:
			break
	}

	return format
}
export function buildPackageFormatString(
	deepScan: PackageInfo.FFProbeDeepScan,
	stream: PackageInfo.FFProbeScanStream
): string {
	let format = `${stream.width || 0}x${stream.height || 0}`
	switch (deepScan.field_order) {
		case PackageInfo.FieldOrder.Progressive:
			format += 'p'
			break
		case PackageInfo.FieldOrder.Unknown:
			format += '?'
			break
		default:
			format += 'i'
			break
	}
	if (stream.codec_time_base) {
		const formattedTimebase = /(\d+)\/(\d+)/.exec(stream.codec_time_base) as RegExpExecArray
		let fps = Number(formattedTimebase[2]) / Number(formattedTimebase[1])
		fps = Math.floor(fps * 100 * 100) / 100
		format += fps
	}
	switch (deepScan.field_order) {
		case PackageInfo.FieldOrder.BFF:
			format += 'bff'
			break
		case PackageInfo.FieldOrder.TFF:
			format += 'tff'
			break
		default:
			break
	}

	return format
}

/**
 * Checks if a source format is an accepted format by doing:
 * For every accepted format, check every parameter (w, h, p/i, fps) against the
 * parameter in the source format. If any of them are not the same: fail for that
 * accepted resolution and move to the next accepted resolution.
 */
export function acceptFormat(format: string, formats: Array<Array<string>>): boolean {
	const match = /((\d+)x(\d+))?((i|p|\?)(\d+))?((tff)|(bff))?/.exec(format)
	if (!match) return false // ingested format string is invalid

	const mediaFormat = match.filter((o, i) => new Set([2, 3, 5, 6, 7]).has(i))
	for (const candidateFormat of formats) {
		let failed = false
		for (const param in candidateFormat) {
			if (candidateFormat[param] && candidateFormat[param] !== mediaFormat[param]) {
				failed = true
				break
			}
		}
		if (!failed) return true
	}
	return false
}

/**
 * Convert config field "1920x1080i5000, 1280x720, i5000, i5000tff" into:
 * [
 * 	[1920, 1080, i, 5000, undefined],
 * 	[1280, 720, undefined, undefined, undefined],
 * 	[undefined, undefined, i, 5000, undefined],
 * 	[undefined, undefined, i, 5000, tff]
 * ]
 */
export function getAcceptedFormats(settings: IStudioSettings | undefined): Array<Array<string>> {
	const formatsConfigField = settings ? settings.supportedMediaFormats : ''
	const formatsString: string =
		(formatsConfigField && formatsConfigField !== '' ? formatsConfigField : '1920x1080i5000') + ''
	return _.compact(
		formatsString.split(',').map((res) => {
			const match = /((\d+)x(\d+))?((i|p|\?)(\d+))?((tff)|(bff))?/.exec(res.trim())
			if (match) {
				return match.filter((o, i) => new Set([2, 3, 5, 6, 7]).has(i))
			} else {
				// specified format string was invalid
				return false
			}
		})
	)
}

export function getMediaObjectMediaId(piece: Pick<IBlueprintPieceGeneric, 'content'>, sourceLayer: ISourceLayer) {
	switch (sourceLayer.type) {
		case SourceLayerType.VT:
		case SourceLayerType.LIVE_SPEAK:
		case SourceLayerType.TRANSITION:
			return (piece.content as VTContent)?.fileName?.toUpperCase()
		case SourceLayerType.GRAPHICS:
			return (piece.content as GraphicsContent)?.fileName?.toUpperCase()
	}
	return undefined
}

export interface ScanInfoForPackages {
	[packageId: string]: ScanInfoForPackage
}
export interface ScanInfoForPackage {
	/** Display name of the package  */
	packageName: string
	scan?: PackageInfo.FFProbeScan['payload']
	deepScan?: PackageInfo.FFProbeDeepScan['payload']
	timebase?: number // derived from scan
}

export function checkPieceContentStatus(
	piece: Pick<IBlueprintPieceGeneric, 'name' | 'content' | 'expectedPackages'>,
	sourceLayer: ISourceLayer | undefined,
	studio: Studio | undefined,
	t?: i18next.TFunction
) {
	t =
		t ||
		((s: string, options?: _.Dictionary<any> | string) => _.template(s, { interpolate: /\{\{(.+?)\}\}/g })(options)) // kz: TODO not sure if this is ok - the second param can be a defaultValue
	let newStatus: RundownAPI.PieceStatusCode = RundownAPI.PieceStatusCode.UNKNOWN
	let metadata: MediaObject | null = null
	let packageInfoToForward: ScanInfoForPackages | undefined = undefined
	let message: string | null = null
	const contentDuration: number | undefined = undefined
	const settings: IStudioSettings | undefined = studio?.settings

	const ignoreMediaStatus = piece.content && piece.content.ignoreMediaObjectStatus
	if (!ignoreMediaStatus && sourceLayer && studio) {
		if (piece.expectedPackages) {
			// Using Expected Packages:

			const messages: Array<string> = []
			const packageInfos: ScanInfoForPackages = {}

			if (piece.expectedPackages.length) {
				// Route the mappings
				const routedMappingsWithPackages = routeExpectedPackages(studio, piece.expectedPackages)

				const checkedPackageContainers: { [containerId: string]: true } = {}

				for (const mapping of Object.values(routedMappingsWithPackages)) {
					const mappingDeviceId = unprotectString(mapping.deviceId)
					let packageContainerId: string | undefined
					for (const [containerId, packageContainer] of Object.entries(studio.packageContainers)) {
						if (packageContainer.deviceIds.includes(mappingDeviceId)) {
							// TODO: how to handle if a device has multiple containers?
							packageContainerId = containerId
							break // just picking the first one found, for now
						}
					}

					if (!packageContainerId) {
						continue
					}
					if (checkedPackageContainers[packageContainerId]) {
						// we have already checked this package container for this expected package
						continue
					}

					checkedPackageContainers[packageContainerId] = true

					for (const expectedPackage of mapping.expectedPackages) {
						const packageOnPackageContainer = getPackageContainerPackageStatus(
							studio._id,
							packageContainerId,
							expectedPackage._id
						)
						const packageName =
							// @ts-expect-error hack
							expectedPackage.content.filePath ||
							// @ts-expect-error hack
							expectedPackage.content.guid ||
							expectedPackage._id

						if (!packageOnPackageContainer) {
							newStatus = RundownAPI.PieceStatusCode.SOURCE_MISSING
							messages.push(
								t(
									`Clip "{{fileName}}" can't be played because it isn't present on the playout system`,
									{
										fileName: packageName,
									}
								)
							)
						} else if (
							packageOnPackageContainer.status.status ===
							ExpectedPackageStatusAPI.PackageContainerPackageStatusStatus.NOT_READY
						) {
							newStatus = RundownAPI.PieceStatusCode.SOURCE_MISSING
							messages.push(
								t('{{sourceLayer}} is not yet ready on the playout system', {
									sourceLayer: sourceLayer.name,
								})
							)
						} else if (
							packageOnPackageContainer.status.status ===
							ExpectedPackageStatusAPI.PackageContainerPackageStatusStatus.TRANSFERRING_READY
						) {
							newStatus = RundownAPI.PieceStatusCode.OK
							messages.push(
								t('{{sourceLayer}} is transferring to the the playout system', {
									sourceLayer: sourceLayer.name,
								})
							)
						} else if (
							packageOnPackageContainer.status.status ===
							ExpectedPackageStatusAPI.PackageContainerPackageStatusStatus.TRANSFERRING_NOT_READY
						) {
							newStatus = RundownAPI.PieceStatusCode.SOURCE_MISSING
							messages.push(
								t(
									'{{sourceLayer}} is transferring to the the playout system and cannot be played yet',
									{
										sourceLayer: sourceLayer.name,
									}
								)
							)
						} else {
							packageInfos[expectedPackage._id] = {
								packageName,
							}
							// ok:
							PackageInfos.find({
								studio: studio._id,
								packageId: protectString(expectedPackage._id),
								type: {
									$in: [PackageInfo.Type.SCAN, PackageInfo.Type.DEEPSCAN] as any,
								},
							}).forEach((packageInfo) => {
								if (packageInfo.type === PackageInfo.Type.SCAN) {
									packageInfos[expectedPackage._id].scan = packageInfo.payload
								} else if (packageInfo.type === PackageInfo.Type.DEEPSCAN) {
									packageInfos[expectedPackage._id].deepScan = packageInfo.payload
								}
							})
						}
					}
				}
			}
			if (Object.keys(packageInfos).length) {
				newStatus = RundownAPI.PieceStatusCode.OK
				for (const [_packageId, packageInfo] of Object.entries(packageInfos)) {
					const { scan, deepScan } = packageInfo

					if (scan && scan.streams) {
						if (scan.streams.length < 2) {
							newStatus = RundownAPI.PieceStatusCode.SOURCE_BROKEN
							messages.push(
								t("{{sourceLayer}} doesn't have both audio & video", {
									sourceLayer: sourceLayer.name,
								})
							)
						}
						const formats = getAcceptedFormats(settings)
						const audioConfig = settings ? settings.supportedAudioStreams : ''
						const expectedAudioStreams = audioConfig
							? new Set<string>(audioConfig.split(',').map((v) => v.trim()))
							: new Set<string>()

						let timebase: number = 0
						let audioStreams: number = 0
						let isStereo: boolean = false

						// check the streams for resolution info
						for (const stream of scan.streams) {
							if (stream.width && stream.height) {
								if (stream.codec_time_base) {
									const formattedTimebase = /(\d+)\/(\d+)/.exec(
										stream.codec_time_base
									) as RegExpExecArray
									timebase = (1000 * Number(formattedTimebase[1])) / Number(formattedTimebase[2])
								}

								if (deepScan) {
									const format = buildPackageFormatString(deepScan, stream)
									if (!acceptFormat(format, formats)) {
										messages.push(
											t('{{sourceLayer}} has the wrong format: {{format}}', {
												sourceLayer: sourceLayer.name,
												format,
											})
										)
									}
								}
							} else if (stream.codec_type === 'audio') {
								// this is the first (and hopefully last) track of audio, and has 2 channels
								if (audioStreams === 0 && stream.channels === 2) {
									isStereo = true
								}
								audioStreams++
							}
						}
						if (timebase) {
							packageInfo.timebase = timebase // what todo?
						}
						if (
							audioConfig &&
							(!expectedAudioStreams.has(audioStreams.toString()) ||
								(isStereo && !expectedAudioStreams.has('stereo')))
						) {
							messages.push(
								t('{{sourceLayer}} has {{audioStreams}} audio streams', {
									sourceLayer: sourceLayer.name,
									audioStreams,
								})
							)
						}
						if (timebase) {
							// check for black/freeze frames
							const addFrameWarning = (
								anomalies: Array<PackageInfo.Anomaly>,
								type: string,
								t: i18next.TFunction
							) => {
								if (anomalies.length === 1) {
									const frames = Math.round((anomalies[0].duration * 1000) / timebase)
									if (anomalies[0].start === 0) {
										messages.push(
											t('Clip starts with {{frames}} {{type}} frame', {
												frames,
												type,
												count: frames,
											})
										)
									} else if (scan.format && anomalies[0].end === Number(scan.format.duration)) {
										const freezeStartsAt = Math.round(anomalies[0].start)
										messages.push(
											t('This clip ends with {{type}} frames after {{count}} second', {
												frames,
												type,
												count: freezeStartsAt,
											})
										)
									} else {
										messages.push(
											t('{{frames}} {{type}} frame detected within the clip', {
												frames,
												type,
												count: frames,
											})
										)
									}
								} else if (anomalies.length > 0) {
									const dur = anomalies.map((b) => b.duration).reduce((a, b) => a + b, 0)
									const frames = Math.round((dur * 1000) / timebase)
									messages.push(
										t('{{frames}} {{type}} frame detected in clip', {
											frames,
											type,
											count: frames,
										})
									)
								}
							}
							if (deepScan?.blacks) {
								addFrameWarning(deepScan.blacks, 'black', t)
							}
							if (deepScan?.freezes) {
								addFrameWarning(deepScan.freezes, 'freeze', t)
							}
						}
					}
				}

				if (messages.length) {
					if (newStatus === RundownAPI.PieceStatusCode.OK) {
						newStatus = RundownAPI.PieceStatusCode.SOURCE_BROKEN
					}
					message = messages.join('; ') + '.'
				}

				packageInfoToForward = packageInfos
			}
		} else {
			// Fallback to MediaObject statuses:
			const messages: Array<string> = []
			const fileName = getMediaObjectMediaId(piece, sourceLayer)
			const displayName = piece.name
			switch (sourceLayer.type) {
				case SourceLayerType.VT:
				case SourceLayerType.LIVE_SPEAK:
					// If the fileName is not set...
					if (!fileName) {
						newStatus = RundownAPI.PieceStatusCode.SOURCE_NOT_SET
						messages.push(t('{{sourceLayer}} is missing a file path', { sourceLayer: sourceLayer.name }))
					} else {
						const mediaObject = MediaObjects.findOne({
							mediaId: fileName,
						})
						// If media object not found, then...
						if (!mediaObject) {
							newStatus = RundownAPI.PieceStatusCode.SOURCE_MISSING
							messages.push(
								t('{{sourceLayer}} is not yet ready on the playout system', {
									sourceLayer: sourceLayer.name,
								})
							)
							// All VT content should have at least two streams
						} else {
							newStatus = RundownAPI.PieceStatusCode.OK

							// Do a format check:
							if (mediaObject.mediainfo) {
								if (mediaObject.mediainfo.streams) {
									if (mediaObject.mediainfo.streams.length < 2) {
										newStatus = RundownAPI.PieceStatusCode.SOURCE_BROKEN
										messages.push(t("Clip doesn't have audio & video", { fileName: displayName }))
									}
									const formats = getAcceptedFormats(settings)
									const audioConfig = settings ? settings.supportedAudioStreams : ''
									const expectedAudioStreams = audioConfig
										? new Set<string>(audioConfig.split(',').map((v) => v.trim()))
										: new Set<string>()

									let timebase: number = 0
									let audioStreams: number = 0
									let isStereo: boolean = false

									// check the streams for resolution info
									for (const stream of mediaObject.mediainfo.streams) {
										if (stream.width && stream.height) {
											if (stream.codec.time_base) {
												const formattedTimebase = /(\d+)\/(\d+)/.exec(
													stream.codec.time_base
												) as RegExpExecArray
												timebase =
													(1000 * Number(formattedTimebase[1])) / Number(formattedTimebase[2])
											}

											const format = buildFormatString(mediaObject.mediainfo, stream)
											if (!acceptFormat(format, formats)) {
												messages.push(
													t('{{sourceLayer}} has the wrong format: {{format}}', {
														sourceLayer: sourceLayer.name,
														format,
													})
												)
											}
										} else if (stream.codec.type === 'audio') {
											// this is the first (and hopefully last) track of audio, and has 2 channels
											if (audioStreams === 0 && stream.channels === 2) {
												isStereo = true
											}
											audioStreams++
										}
									}
									if (timebase) {
										mediaObject.mediainfo.timebase = timebase
									}
									if (
										audioConfig &&
										(!expectedAudioStreams.has(audioStreams.toString()) ||
											(isStereo && !expectedAudioStreams.has('stereo')))
									) {
										messages.push(
											t('{{sourceLayer}} has {{audioStreams}} audio streams', {
												sourceLayer: sourceLayer.name,
												audioStreams,
											})
										)
									}
									if (timebase) {
										// check for black/freeze frames
										const addFrameWarning = (
											arr: Array<PackageInfo.Anomaly>,
											type: string,
											t: i18next.TFunction
										) => {
											if (arr.length === 1) {
												const frames = Math.ceil((arr[0].duration * 1000) / timebase)
												if (arr[0].start === 0) {
													messages.push(
														t('Clip starts with {{frames}} {{type}} frame', {
															frames,
															type,
															count: frames,
														})
													)
												} else if (
													mediaObject.mediainfo &&
													mediaObject.mediainfo.format &&
													arr[0].end === Number(mediaObject.mediainfo.format.duration)
												) {
													const freezeStartsAt = Math.round(arr[0].start)
													messages.push(
														t(
															'This clip ends with {{type}} frames after {{count}} second',
															{
																frames,
																type,
																count: freezeStartsAt,
															}
														)
													)
												} else {
													messages.push(
														t('{{frames}} {{type}} frame detected within the clip', {
															frames,
															type,
															count: frames,
														})
													)
												}
											} else if (arr.length > 0) {
												const dur = arr.map((b) => b.duration).reduce((a, b) => a + b, 0)
												const frames = Math.ceil((dur * 1000) / timebase)
												messages.push(
													t('{{frames}} {{type}} frame detected in clip', {
														frames,
														type,
														count: frames,
													})
												)
											}
										}
										if (mediaObject.mediainfo.blacks) {
											addFrameWarning(mediaObject.mediainfo.blacks, t('black'), t)
										}
										if (mediaObject.mediainfo.freezes) {
											addFrameWarning(mediaObject.mediainfo.freezes, t('freeze'), t)
										}
									}
								}
							} else {
								messages.push(
									t('{{sourceLayer}} is being ingested', {
										sourceLayer: sourceLayer.name,
									})
								)
								newStatus = RundownAPI.PieceStatusCode.SOURCE_MISSING
							}

							metadata = mediaObject
						}
					}

					if (messages.length) {
						if (newStatus === RundownAPI.PieceStatusCode.OK) {
							newStatus = RundownAPI.PieceStatusCode.SOURCE_BROKEN
						}
						message = messages.join('; ') + '.'
					}
					break
				case SourceLayerType.GRAPHICS:
					if (fileName) {
						const mediaObject = MediaObjects.findOne({
							mediaId: fileName,
						})
						if (!mediaObject) {
							newStatus = RundownAPI.PieceStatusCode.SOURCE_MISSING
							messages.push(t('Source is missing', { fileName: displayName }))
						} else {
							newStatus = RundownAPI.PieceStatusCode.OK
							metadata = mediaObject
						}
					}
					break
			}
		}
	}

	return {
		status: newStatus,
		metadata: metadata,
		packageInfos: packageInfoToForward,
		message: message,
		contentDuration: contentDuration,
	}
}

export function getNoteTypeForPieceStatus(statusCode: RundownAPI.PieceStatusCode): NoteType | null {
	return statusCode !== RundownAPI.PieceStatusCode.OK && statusCode !== RundownAPI.PieceStatusCode.UNKNOWN
		? statusCode === RundownAPI.PieceStatusCode.SOURCE_NOT_SET
			? NoteType.ERROR
			: // : innerPiece.status === RundownAPI.PieceStatusCode.SOURCE_MISSING ||
			  // innerPiece.status === RundownAPI.PieceStatusCode.SOURCE_BROKEN
			  NoteType.WARNING
		: null
}
