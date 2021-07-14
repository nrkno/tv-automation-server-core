import { RundownPlaylist, RundownPlaylistId } from '../../lib/collections/RundownPlaylists'
import { ProtectedString, clone } from '../../lib/lib'
import { Meteor } from 'meteor/meteor'
import { Studio, Studios, StudioId } from '../../lib/collections/Studios'
import { ShowStyleBase, ShowStyleBases } from '../../lib/collections/ShowStyleBases'
import { ShowStyleCompound, ShowStyleVariant, ShowStyleVariants } from '../../lib/collections/ShowStyleVariants'
import { Rundown } from '../../lib/collections/Rundowns'
import { RundownBaselineObj, RundownBaselineObjs } from '../../lib/collections/RundownBaselineObjs'
import { PeripheralDevice, PeripheralDevices } from '../../lib/collections/PeripheralDevices'
import { ReadonlyDeep } from 'type-fest'
import { createShowStyleCompound } from '../api/showStyles'

export function getActivationCache(studioId: StudioId, playlistId: RundownPlaylistId): ActivationCache {
	let activationCache = activationCaches.get(studioId)
	if (activationCache && getValidActivationCache(studioId, playlistId)) {
		activationCache.touch()
	} else {
		if (activationCache) activationCache.destroy()

		activationCache = new ActivationCache(playlistId)
		activationCaches.set(studioId, activationCache)
	}

	return activationCache
}
/** Only return an activationCache if one is found */
export function getValidActivationCache(
	studioId: StudioId,
	playlistId?: RundownPlaylistId
): ActivationCache | undefined {
	const activationCache = activationCaches.get(studioId)
	if (
		activationCache &&
		!activationCache.expired &&
		activationCache.persistant &&
		(!playlistId || activationCache.playlistId === playlistId)
	) {
		return activationCache
	} else {
		return undefined
	}
}
export function clearActivationCache(studioId: StudioId): void {
	const activationCache = activationCaches.get(studioId)
	if (activationCache) {
		activationCache.destroy()
		activationCaches.delete(studioId)
	}
}
export function clearOldActivationCaches() {
	for (const [id, activationCache] of activationCaches) {
		if (activationCache.expired) clearActivationCache(id)
	}
}
export function forceClearAllActivationCaches() {
	for (const id of activationCaches.keys()) {
		clearActivationCache(id)
	}
}
const activationCaches = new Map<StudioId, ActivationCache>()

type InternalCache<T> = { modifiedHash: string; value: T }
/**
 * The ActivationCache is designed to be generated once (or very few times) during the playout of a rundown.
 * It is generated upon activation and preserves various documents in memory that should never change during playout of a rundown
 */
export class ActivationCache {
	private _expires: number
	private _initialized: boolean = false
	private _persistant: boolean = false

	private _playlist: RundownPlaylist | undefined
	private _studio: Studio | undefined
	private _showStyleBases: { [id: string]: InternalCache<ShowStyleBase> } = {}
	private _showStyleVariants: { [id: string]: InternalCache<ShowStyleVariant> } = {}
	private _rundownBaselineObjs: { [id: string]: InternalCache<RundownBaselineObj[]> } = {}
	private _peripheralDevices: { [id: string]: InternalCache<PeripheralDevice[]> } = {}

	constructor(private _playlistId: RundownPlaylistId) {
		this._updateExpires()
	}

	get expired(): boolean {
		return Date.now() > this._expires
	}
	get persistant(): boolean {
		return this._persistant
	}
	get playlistId(): RundownPlaylistId {
		return this._playlistId
	}
	touch() {
		this._updateExpires()
	}
	destroy() {
		// do something here?
	}
	private _uninitialize() {
		delete this._playlist
		delete this._studio
		this._showStyleBases = {}
		this._showStyleVariants = {}
		this._rundownBaselineObjs = {}
		this._peripheralDevices = {}

		this._initialized = false
		this._persistant = false
	}
	async initialize(playlist: ReadonlyDeep<RundownPlaylist>, rundownsInPlaylist: Rundown[]) {
		if (this._initialized && (!this._playlist || playlist.activationId !== this._playlist.activationId)) {
			// activationId has changed, we should clear out the data because it might not be valid anymore
			this._uninitialize()
		}

		if (this._initialized) return // already initialized

		if (playlist._id !== this._playlistId)
			throw new Error(
				`ActivationCache.initialize playlist._id "${playlist._id}" not equal to this.playlistId "${this.playlistId}"`
			)
		this._playlist = clone<RundownPlaylist>(playlist)

		const pStudio = Studios.findOneAsync(this._playlist.studioId)

		if (!playlist.activationId) {
			// If the playlist is not active we won't do the pre-loading now
			// we're also not calling ourselves "persistant", so we won't be living longer than
			this._persistant = false
		} else {
			this._persistant = true

			// As a convenience thing; if we're persistant, we should be the one stored in the cache:
			const existingInCache = activationCaches.get(this._playlist.studioId)
			if (existingInCache && existingInCache !== this) {
				existingInCache.destroy()
			}
			activationCaches.set(this._playlist.studioId, this)

			// Just a prefetch, to speed up things later:
			const ps: Promise<any>[] = []
			const ignoreError = () => {
				// ignore
			}
			for (const rundown of rundownsInPlaylist) {
				ps.push(this._getShowStyleBase(rundown).catch(ignoreError))
				ps.push(this._getShowStyleVariant(rundown).catch(ignoreError))
				ps.push(this._getRundownBaselineObjs(rundown))
			}
			ps.push(this._getPeripheralDevices())

			await Promise.all(ps)
		}
		const studio = await pStudio
		if (!studio) {
			throw new Meteor.Error(
				404,
				`Studio "${this._playlist.studioId}" of playlist "${this._playlist._id}" not found!`
			)
		}

		this._studio = studio
		this._initialized = true
	}
	/** This is indended to be used when there is no playlist active */
	async initializeForNoPlaylist(studio: Studio) {
		if (this._initialized) return // already initialized

		// see the note about this._persistant = false in this.initialize()
		this._persistant = false

		this._studio = studio
		this._initialized = true
	}
	getPlaylist(): RundownPlaylist {
		if (!this._initialized) throw new Meteor.Error(`ActivationCache is not initialized`)
		if (!this._playlist) throw new Meteor.Error(`ActivationCache is without playlist`)
		return this._playlist
	}
	getStudio(): Studio {
		if (!this._initialized || !this._studio) throw new Meteor.Error(`ActivationCache is not initialized`)
		return this._studio
	}
	async getShowStyleBase(rundown: Rundown): Promise<ShowStyleBase> {
		if (!this._initialized) throw new Meteor.Error(`ActivationCache is not initialized`)
		return this._getShowStyleBase(rundown)
	}
	async getShowStyleVariant(rundown: Rundown): Promise<ShowStyleVariant> {
		if (!this._initialized) throw new Meteor.Error(`ActivationCache is not initialized`)
		return this._getShowStyleVariant(rundown)
	}
	async getShowStyleCompound(rundown: Rundown): Promise<ShowStyleCompound> {
		const [base, variant] = await Promise.all([this.getShowStyleBase(rundown), this.getShowStyleVariant(rundown)])
		const compound = createShowStyleCompound(base, variant)
		if (!compound)
			throw new Meteor.Error(
				404,
				`Unable to compile ShowStyleCompound for variant "${rundown.showStyleVariantId}"`
			)
		return compound
	}
	async getRundownBaselineObjs(rundown: Rundown): Promise<RundownBaselineObj[]> {
		if (!this._initialized) throw new Meteor.Error(`ActivationCache is not initialized`)
		return this._getRundownBaselineObjs(rundown)
	}
	async getPeripheralDevices(): Promise<PeripheralDevice[]> {
		if (!this._initialized) throw new Meteor.Error(`ActivationCache is not initialized`)
		return this._getPeripheralDevices()
	}
	private async _getShowStyleBase(rundown: Rundown): Promise<ShowStyleBase> {
		if (!rundown.showStyleBaseId) throw new Meteor.Error(500, `Rundown.showStyleBaseId not set!`)
		return this._getFromCache(this._showStyleBases, rundown.showStyleBaseId, '', async (id) => {
			const showStyleBase = await ShowStyleBases.findOneAsync(id)
			if (!showStyleBase) throw new Meteor.Error(404, `ShowStyleBase "${id}" not found`)
			return showStyleBase
		})
	}
	private async _getShowStyleVariant(rundown: Rundown): Promise<ShowStyleVariant> {
		if (!rundown.showStyleVariantId) throw new Meteor.Error(500, `Rundown.showStyleVariantId not set!`)
		return this._getFromCache(this._showStyleVariants, rundown.showStyleVariantId, '', async (id) => {
			const showStyleVariant = await ShowStyleVariants.findOneAsync(id)
			if (!showStyleVariant) throw new Meteor.Error(404, `ShowStyleVariant "${id}" not found`)
			return showStyleVariant
		})
	}
	private async _getRundownBaselineObjs(rundown: Rundown): Promise<RundownBaselineObj[]> {
		return this._getFromCache(
			this._rundownBaselineObjs,
			rundown._id,
			rundown.baselineModifyHash || '',
			async (id) => {
				const rundownBaselineObjs = await RundownBaselineObjs.findFetchAsync({ rundownId: id })
				return rundownBaselineObjs
			}
		)
	}
	private async _getPeripheralDevices(): Promise<PeripheralDevice[]> {
		const studioId = this._playlist?.studioId ?? this._studio?._id
		if (!studioId) return []

		return this._getFromCache(this._peripheralDevices, studioId, '', async (id) => {
			const devices = await PeripheralDevices.findFetchAsync({
				studioId: id,
			})
			return devices
		})
	}
	private _updateExpires() {
		const TTL = 30 * 60 * 1000 // 30 minutes

		this._expires = Date.now() + TTL
	}
	private async _getFromCache<T, ID extends string | ProtectedString<any>>(
		cache: { [id: string]: InternalCache<T> },
		identifier: ID,
		modifiedHash: string,
		updateFcn: (identifier: ID) => Promise<T>
	): Promise<T> {
		const id = identifier as any as string
		let o = cache[id]
		if (!o || o.modifiedHash !== modifiedHash) {
			o = {
				modifiedHash: modifiedHash,
				value: await updateFcn(identifier),
			}
			cache[id] = o
		}
		return o.value
	}
}
