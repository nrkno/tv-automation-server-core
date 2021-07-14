import { Time, registerCollection, ProtectedString, TimeDuration } from '../lib'
import { createMongoCollection } from './lib'
import { UserId } from './Users'
import { OrganizationId } from './Organization'
import { registerIndex } from '../database'

/** A string, identifying a UserActionsLogItem */
export type UserActionsLogItemId = ProtectedString<'UserActionsLogItemId'>

export interface UserActionsLogItem {
	_id: UserActionsLogItemId

	organizationId: OrganizationId | null
	/** The user from which the action originated */
	userId: UserId | null
	/** The cliend address (IP-address) of the requester */
	clientAddress: string
	timestamp: Time
	method: string
	args: string
	context: string
	success?: boolean
	errorMessage?: string
	doneTime?: Time

	/** The time it took (within Core) to execute the action */
	executionTime?: TimeDuration
	/** The time it took for playout-gateway(s) to execute the timeline. */
	gatewayDuration?: TimeDuration[]
	/** The time playout-gateway(s) reported it took to resolve the timeline. */
	timelineResolveDuration?: TimeDuration[]
}

export const UserActionsLog = createMongoCollection<UserActionsLogItem, UserActionsLogItem>('userActionsLog')
registerCollection('UserActionsLog', UserActionsLog)

registerIndex(UserActionsLog, {
	organizationId: 1,
	timestamp: 1,
})
