import * as _ from 'underscore'
import { PeripheralDeviceAPI } from '@sofie-automation/server-core-integration'
import { MeteorPromiseCall, ProtectedStringProperties } from '../lib'
import { NewBlueprintAPI, BlueprintAPIMethods } from './blueprint'
import { NewClientAPI, ClientAPIMethods } from './client'
import { NewExternalMessageQueueAPI, ExternalMessageQueueAPIMethods } from './ExternalMessageQueue'
import { NewMigrationAPI, MigrationAPIMethods } from './migration'
import { NewPeripheralDeviceAPI } from './peripheralDevice'
import { NewPlayoutAPI, PlayoutAPIMethods } from './playout'
import { NewRundownAPI, RundownAPIMethods } from './rundown'
import { NewRundownLayoutsAPI, RundownLayoutsAPIMethods } from './rundownLayouts'
import { NewShowStylesAPI, ShowStylesAPIMethods } from './showStyles'
import { NewSnapshotAPI, SnapshotAPIMethods } from './shapshot'
import { NewSystemStatusAPI, SystemStatusAPIMethods } from './systemStatus'
import { NewUserActionAPI, UserActionAPIMethods } from './userActions'
import { StudiosAPIMethods, NewStudiosAPI } from './studios'
import { NewOrganizationAPI, OrganizationAPIMethods } from './organization'
import { NewUserAPI, UserAPIMethods } from './user'
import { SystemAPIMethods, SystemAPI } from './system'
import { UserId } from '../typings/meteor'
import { RundownNotificationsAPI, RundownNotificationsAPIMethods } from './rundownNotifications'
import { Meteor } from 'meteor/meteor'
import { PeripheralDeviceAPIInternal, PeripheralDeviceAPIInternalMethods } from './peripheralDeviceInternal'

/** All methods typings are defined here, the actual implementation is defined in other places */
export type MethodsBase = {
	[key: string]: (...args: any[]) => Promise<any>
}
interface IMeteorCall {
	blueprint: NewBlueprintAPI
	client: NewClientAPI
	externalMessages: NewExternalMessageQueueAPI
	migration: NewMigrationAPI
	peripheralDevice: PeripheralDeviceAPIInternal
	playout: NewPlayoutAPI
	rundown: NewRundownAPI
	rundownLayout: NewRundownLayoutsAPI
	snapshot: NewSnapshotAPI
	showstyles: NewShowStylesAPI
	studio: NewStudiosAPI
	systemStatus: NewSystemStatusAPI
	user: NewUserAPI
	userAction: NewUserActionAPI
	organization: NewOrganizationAPI
	rundownNotifications: RundownNotificationsAPI
	system: SystemAPI
}
export const MeteorCall: IMeteorCall = {
	blueprint: makeMethods(BlueprintAPIMethods),
	client: makeMethods(ClientAPIMethods),
	externalMessages: makeMethods(ExternalMessageQueueAPIMethods),
	migration: makeMethods(MigrationAPIMethods),
	peripheralDevice: makeMethods(PeripheralDeviceAPIInternalMethods),
	playout: makeMethods(PlayoutAPIMethods),
	rundown: makeMethods(RundownAPIMethods),
	rundownLayout: makeMethods(RundownLayoutsAPIMethods),
	snapshot: makeMethods(SnapshotAPIMethods),
	showstyles: makeMethods(ShowStylesAPIMethods),
	studio: makeMethods(StudiosAPIMethods),
	systemStatus: makeMethods(SystemStatusAPIMethods),
	user: makeMethods(UserAPIMethods),
	userAction: makeMethods(UserActionAPIMethods),
	organization: makeMethods(OrganizationAPIMethods),
	rundownNotifications: makeMethods(RundownNotificationsAPIMethods),
	system: makeMethods(SystemAPIMethods),
}
interface IMeteorCallExternal {
	peripheralDevice: NewPeripheralDeviceAPI
}
/**
 * These methods are not really intended to be called from within Sofie, but defined here for easy of use in tests.
 */
export const MeteorCallExternal: IMeteorCallExternal = {
	peripheralDevice: makeMethods(PeripheralDeviceAPI.methods),
}
function makeMethods(methods: object): any {
	const o = {}
	_.each(methods, (value: any, methodName: string) => {
		o[methodName] = (...args) => MeteorPromiseCall(value, ...args)
	})
	return o
}
export interface MethodContext extends Omit<Meteor.MethodThisType, 'userId'> {
	userId: UserId | null
}

/** Abstarct class to be used when defining Mehod-classes */
export abstract class MethodContextAPI implements MethodContext {
	public userId: UserId | null
	public isSimulation: boolean
	public setUserId(userId: string): void {
		throw new Meteor.Error(
			500,
			`This shoulc never be called, there's something wrong in with 'this' in the calling method`
		)
	}
	public unblock(): void {
		throw new Meteor.Error(
			500,
			`This shoulc never be called, there's something wrong in with 'this' in the calling method`
		)
	}
	public connection: Meteor.Connection | null
}
/** Convenience-method to call a userAction method old-Meteor.call-style */
export function CallUserActionAPIMethod(method: UserActionAPIMethods, ...args: any[]) {
	const m: string = method
	const fcn = MeteorCall[m.replace(/^userAction\./, '')]
	return fcn(...args)
}
