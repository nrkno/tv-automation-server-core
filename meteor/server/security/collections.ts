import { CoreSystem } from '../../lib/collections/CoreSystem'
import {
	allowAccessToCoreSystem,
	allowAccessToStudio,
	allowAccessToShowStyleBase,
	allowAccessToOrganization,
} from './lib/security'
import { logNotAllowed, allowOnlyFields, rejectFields } from './lib/lib'
import { Users } from '../../lib/collections/Users'
import { Organizations } from '../../lib/collections/Organization'
import { UserActionsLog } from '../../lib/collections/UserActionsLog'
import { Evaluations } from '../../lib/collections/Evaluations'
import { Snapshots } from '../../lib/collections/Snapshots'
import { Blueprints } from '../../lib/collections/Blueprints'
import { RundownPlaylists, DBRundownPlaylist } from '../../lib/collections/RundownPlaylists'
import { Studios, Studio } from '../../lib/collections/Studios'
import { ExternalMessageQueue } from '../../lib/collections/ExternalMessageQueue'
import { MediaObjects } from '../../lib/collections/MediaObjects'
import { ShowStyleBases } from '../../lib/collections/ShowStyleBases'
import { ShowStyleVariants } from '../../lib/collections/ShowStyleVariants'
import { RundownLayouts } from '../../lib/collections/RundownLayouts'
import { PeripheralDevices, PeripheralDevice } from '../../lib/collections/PeripheralDevices'
import { PeripheralDeviceCommands, PeripheralDeviceCommand } from '../../lib/collections/PeripheralDeviceCommands'
import { MediaWorkFlowSteps, MediaWorkFlowStep } from '../../lib/collections/MediaWorkFlowSteps'
import { MediaWorkFlows, MediaWorkFlow } from '../../lib/collections/MediaWorkFlows'
import { Rundowns } from '../../lib/collections/Rundowns'
import { Segments } from '../../lib/collections/Segments'
import { Parts } from '../../lib/collections/Parts'
import { PartInstances } from '../../lib/collections/PartInstances'
import { Pieces } from '../../lib/collections/Pieces'
import { PieceInstances, PieceInstance } from '../../lib/collections/PieceInstances'
import { AdLibPieces } from '../../lib/collections/AdLibPieces'
import { RundownBaselineAdLibPieces, RundownBaselineAdLibItem } from '../../lib/collections/RundownBaselineAdLibPieces'
import { IngestDataCache, IngestDataCacheObj } from '../../lib/collections/IngestDataCache'
import { ExpectedMediaItems } from '../../lib/collections/ExpectedMediaItems'
import { ExpectedPlayoutItems } from '../../lib/collections/ExpectedPlayoutItems'
import { Timeline } from '../../lib/collections/Timeline'
import { rundownContentAllowWrite, pieceContentAllowWrite } from './rundown'
import { SystemWriteAccess } from './system'
import { Buckets } from '../../lib/collections/Buckets'
import { studioContentAllowWrite } from './studio'

// Set up direct collection write access

// Owned by System:
CoreSystem.allow({
	insert(): boolean {
		return false
	},
	update(userId, doc, fields, _modifier) {
		const access = allowAccessToCoreSystem({ userId: userId })
		if (!access.update) return logNotAllowed('CoreSystem', access.reason)
		return allowOnlyFields(doc, fields, ['support', 'systemInfo', 'name', 'apm', 'cron'])
	},
	remove() {
		return false
	},
})
Users.allow({
	insert(_userId, _doc) {
		return false
	},
	update(userId, doc, fields, _modifier) {
		const access = SystemWriteAccess.currentUser(userId, { userId })
		if (!access) return logNotAllowed('CurrentUser', '')
		return rejectFields(doc, fields, [
			'_id',
			'createdAt',
			'services',
			'emails',
			'profile',
			'organizationId',
			'superAdmin',
		])
	},
	remove(_userId, _doc) {
		return false
	},
})

// Owned by Organization:
Organizations.allow({
	insert(_userId, _doc): boolean {
		return false
	},
	update(userId, doc, fields, _modifier) {
		const access = allowAccessToOrganization({ userId: userId }, doc._id)
		if (!access.update) return logNotAllowed('Organization', access.reason)
		return allowOnlyFields(doc, fields, ['userRoles'])
	},
	remove(_userId, _doc) {
		return false
	},
})

UserActionsLog.allow({
	insert(_userId, _doc): boolean {
		return false
	},
	update(_userId, _doc, _fields, _modifier) {
		return false
	},
	remove(_userId, _doc) {
		return false
	},
})
Evaluations.allow({
	insert(_userId, _doc): boolean {
		return true
	},
	update(_userId, _doc, _fields, _modifier) {
		return false
	},
	remove(_userId, _doc) {
		return false
	},
})
Snapshots.allow({
	insert(_userId, _doc): boolean {
		return false
	},
	update(userId, doc, fields, _modifier) {
		return allowOnlyFields(doc, fields, ['comment'])
	},
	remove(_userId, _doc) {
		return false
	},
})
Blueprints.allow({
	insert(_userId, _doc): boolean {
		return false
	},
	update(userId, doc, fields, _modifier) {
		return allowOnlyFields(doc, fields, ['name', 'disableVersionChecks'])
	},
	remove(_userId, _doc) {
		return false
	},
})
// Owned by Studio:
RundownPlaylists.allow({
	insert(_userId, _doc: DBRundownPlaylist): boolean {
		return false
	},
	update(_userId, _doc, _fields, _modifier) {
		// return true // tmp!
		return false
	},
	remove(_userId, _doc) {
		return false
	},
})
Studios.allow({
	insert(userId, doc: Studio): boolean {
		const access = allowAccessToStudio({ userId: userId }, doc._id)
		if (!access.insert) return logNotAllowed('Studio', access.reason)
		return true
	},
	update(userId, doc, fields, _modifier) {
		const access = allowAccessToStudio({ userId: userId }, doc._id)
		if (!access.update) return logNotAllowed('Studio', access.reason)
		return rejectFields(doc, fields, ['_id'])
	},
	remove(userId, doc) {
		const access = allowAccessToStudio({ userId: userId }, doc._id)
		if (!access.remove) return logNotAllowed('Studio', access.reason)
		return true
	},
})

ExternalMessageQueue.allow({
	insert(_userId, _doc): boolean {
		return false
	},
	update(_userId, _doc, _fields, _modifier) {
		return false
	},
	remove(_userId, _doc) {
		return false
	},
})

MediaObjects.allow({
	insert(_userId, _doc): boolean {
		return false
	},
	update(_userId, _doc, _fields, _modifier) {
		// return true // tmp!
		return false
	},
	remove(_userId, _doc) {
		return false
	},
})
Timeline.allow({
	insert(_userId, _doc): boolean {
		return false
	},
	update(_userId, _doc, _fields, _modifier) {
		return false
	},
	remove(_userId, _doc) {
		return false
	},
})
Buckets.allow({
	insert(_userId, _doc): boolean {
		return false
	},
	update(userId, doc, fields, _modifier) {
		return studioContentAllowWrite(userId, doc) && rejectFields(doc, fields, ['_id'])
	},
	remove(_userId, _doc) {
		return false
	},
})

// Owned by showStyle:
ShowStyleBases.allow({
	insert(): boolean {
		return false
	},
	update(userId, doc, fields) {
		const access = allowAccessToShowStyleBase({ userId: userId }, doc._id)
		if (!access.update) return logNotAllowed('ShowStyleBase', access.reason)
		return rejectFields(doc, fields, ['_id'])
	},
	remove() {
		return false
	},
})
ShowStyleVariants.allow({
	insert(): boolean {
		return false
	},
	update(userId, doc, fields) {
		const access = allowAccessToShowStyleBase({ userId: userId }, doc.showStyleBaseId)
		if (!access.update) return logNotAllowed('ShowStyleBase', access.reason)

		return rejectFields(doc, fields, ['showStyleBaseId'])
	},
	remove() {
		return false
	},
})
RundownLayouts.allow({
	insert(): boolean {
		return false
	},
	update(userId, doc, fields) {
		const access = allowAccessToShowStyleBase({ userId: userId }, doc.showStyleBaseId)
		if (!access.update) return logNotAllowed('ShowStyleBase', access.reason)
		return rejectFields(doc, fields, ['_id', 'showStyleBaseId'])
	},
	remove() {
		return false
	},
})

// Owned by PeripheralDevice
PeripheralDevices.allow({
	insert(_userId, _doc: PeripheralDevice): boolean {
		return true
	},
	update(userId, doc, fields, _modifier) {
		return rejectFields(doc, fields, [
			'type',
			'parentDeviceId',
			'versions',
			'created',
			'status',
			'lastSeen',
			'lastConnected',
			'connected',
			'connectionId',
			'token',
			// 'settings' is allowed
		])
	},

	remove(_userId, _doc) {
		return false
	},
})

PeripheralDeviceCommands.allow({
	insert(_userId, _doc: PeripheralDeviceCommand): boolean {
		return true // TODO
	},
	update(_userId, _doc, _fields, _modifier) {
		return false
	},
	remove(_userId, _doc) {
		return true // TODO
	},
})

// Media work flows:
MediaWorkFlowSteps.allow({
	insert(_userId, _doc: MediaWorkFlowStep): boolean {
		return false
	},
	update(_userId, _doc, _fields, _modifier) {
		return false
	},
	remove(_userId, _doc) {
		return false
	},
})
MediaWorkFlows.allow({
	insert(_userId, _doc: MediaWorkFlow): boolean {
		return false
	},
	update(_userId, _doc, _fields, _modifier) {
		return false
	},
	remove(_userId, _doc) {
		return false
	},
})

// Owned By Rundown:
Rundowns.allow({
	insert(): boolean {
		return false
	},
	update() {
		// return true // tmp!
		return false
	},
	remove() {
		return false
	},
})

// ----------------------------------------------------------------------------
// Rundown content:
// ----------------------------------------------------------------------------

// Collections security set up:

Segments.allow({
	insert(userId, doc): boolean {
		return rundownContentAllowWrite(userId, doc)
	},
	update(userId, doc) {
		return rundownContentAllowWrite(userId, doc)
	},
	remove(userId, doc) {
		return rundownContentAllowWrite(userId, doc)
	},
})

Parts.allow({
	insert(userId, doc): boolean {
		return rundownContentAllowWrite(userId, doc)
	},
	update(userId, doc) {
		return rundownContentAllowWrite(userId, doc)
	},
	remove(userId, doc) {
		return rundownContentAllowWrite(userId, doc)
	},
})
PartInstances.allow({
	insert(userId, doc): boolean {
		return rundownContentAllowWrite(userId, doc)
	},
	update(userId, doc) {
		return rundownContentAllowWrite(userId, doc)
	},
	remove(userId, doc) {
		return rundownContentAllowWrite(userId, doc)
	},
})
Pieces.allow({
	insert(userId, doc): boolean {
		return pieceContentAllowWrite(userId, doc)
	},
	update(userId, doc) {
		return pieceContentAllowWrite(userId, doc)
	},
	remove(userId, doc) {
		return pieceContentAllowWrite(userId, doc)
	},
})
PieceInstances.allow({
	insert(userId, doc: PieceInstance): boolean {
		return rundownContentAllowWrite(userId, doc)
	},
	update(userId, doc) {
		return rundownContentAllowWrite(userId, doc)
	},
	remove(userId, doc) {
		return rundownContentAllowWrite(userId, doc)
	},
})
AdLibPieces.allow({
	insert(userId, doc): boolean {
		return rundownContentAllowWrite(userId, doc)
	},
	update(userId, doc) {
		return rundownContentAllowWrite(userId, doc)
	},
	remove(userId, doc) {
		return rundownContentAllowWrite(userId, doc)
	},
})
RundownBaselineAdLibPieces.allow({
	insert(userId, doc: RundownBaselineAdLibItem): boolean {
		return rundownContentAllowWrite(userId, doc)
	},
	update(userId, doc) {
		return rundownContentAllowWrite(userId, doc)
	},
	remove(userId, doc) {
		return rundownContentAllowWrite(userId, doc)
	},
})
IngestDataCache.allow({
	insert(userId, doc: IngestDataCacheObj): boolean {
		return rundownContentAllowWrite(userId, doc)
	},
	update(userId, doc) {
		return rundownContentAllowWrite(userId, doc)
	},
	remove(userId, doc) {
		return rundownContentAllowWrite(userId, doc)
	},
})

ExpectedMediaItems.allow({
	insert(): boolean {
		return false
	},

	update() {
		return false
	},

	remove() {
		return false
	},
})

ExpectedPlayoutItems.allow({
	insert(): boolean {
		return false
	},

	update() {
		return false
	},

	remove() {
		return false
	},
})
