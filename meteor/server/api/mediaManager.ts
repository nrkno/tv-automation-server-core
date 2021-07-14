import { Meteor } from 'meteor/meteor'
import { check } from '../../lib/check'
import * as _ from 'underscore'
import { MediaWorkFlows, MediaWorkFlowId } from '../../lib/collections/MediaWorkFlows'
import { waitForPromise } from '../../lib/lib'
import { PeripheralDeviceAPI } from '../../lib/api/peripheralDevice'
import { PeripheralDeviceId, PeripheralDevices } from '../../lib/collections/PeripheralDevices'
import { OrganizationId } from '../../lib/collections/Organization'
import { MethodContext } from '../../lib/api/methods'
import { PeripheralDeviceContentWriteAccess } from '../security/peripheralDevice'
import { OrganizationContentWriteAccess } from '../security/organization'
import { Settings } from '../../lib/Settings'
import { triggerWriteAccessBecauseNoCheckNecessary } from '../security/lib/securityVerify'

export namespace MediaManagerAPI {
	export function restartAllWorkflows(context: MethodContext, organizationId: OrganizationId | null) {
		if (Settings.enableUserAccounts) {
			if (!organizationId) throw new Meteor.Error(400, `parameter organizationId is not set`)
			OrganizationContentWriteAccess.mediaWorkFlows(context, organizationId)
		} else {
			triggerWriteAccessBecauseNoCheckNecessary()
		}

		const devices = PeripheralDevices.find(organizationId ? { organizationId: organizationId } : {}).fetch()
		const workflows = MediaWorkFlows.find({
			deviceId: { $in: _.uniq(_.map(devices, (d) => d._id)) },
		}).fetch()
		const deviceIds = workflows.reduce((memo, workflow) => {
			if (memo.indexOf(workflow.deviceId) < 0) {
				memo.push(workflow.deviceId)
			}
			return memo
		}, [] as PeripheralDeviceId[])
		waitForPromise(
			Promise.all(
				deviceIds.map(async (deviceId) => {
					return new Promise<void>((resolve, reject) => {
						PeripheralDeviceAPI.executeFunction(
							deviceId,
							(err, _res) => {
								if (err) reject(err)
								else resolve()
							},
							'restartAllWorkflows'
						)
					})
				})
			)
		)
	}
	export function abortAllWorkflows(context: MethodContext, organizationId: OrganizationId | null) {
		if (Settings.enableUserAccounts) {
			if (!organizationId) throw new Meteor.Error(400, `parameter organizationId is not set`)
			OrganizationContentWriteAccess.mediaWorkFlows(context, organizationId)
		} else {
			triggerWriteAccessBecauseNoCheckNecessary()
		}

		const devices = PeripheralDevices.find(organizationId ? { organizationId: organizationId } : {}).fetch()
		const workflows = MediaWorkFlows.find({
			deviceId: { $in: _.uniq(_.map(devices, (d) => d._id)) },
		}).fetch()

		const deviceIds = workflows.reduce((memo, workflow) => {
			if (memo.indexOf(workflow.deviceId) < 0) {
				memo.push(workflow.deviceId)
			}
			return memo
		}, [] as PeripheralDeviceId[])
		waitForPromise(
			Promise.all(
				deviceIds.map(async (deviceId) => {
					return new Promise<void>((resolve, reject) => {
						PeripheralDeviceAPI.executeFunction(
							deviceId,
							(err, _res) => {
								if (err) reject(err)
								else resolve()
							},
							'abortAllWorkflows'
						)
					})
				})
			)
		)
	}

	export function restartWorkflow(context: MethodContext, workflowId: MediaWorkFlowId): any {
		check(workflowId, String)

		const access = PeripheralDeviceContentWriteAccess.mediaWorkFlow(context, workflowId)
		const workflow = access.mediaWorkFlow
		if (!workflow) throw new Meteor.Error(404, `MediaWorkFlow "${workflowId}" not found`)

		waitForPromise(
			new Promise<void>((resolve, reject) => {
				PeripheralDeviceAPI.executeFunction(
					workflow.deviceId,
					(err, _res) => {
						if (err) reject(err)
						else resolve()
					},
					'restartWorkflow',
					workflow._id
				)
			})
		)
	}
	export function abortWorkflow(context: MethodContext, workflowId: MediaWorkFlowId): any {
		check(workflowId, String)

		const access = PeripheralDeviceContentWriteAccess.mediaWorkFlow(context, workflowId)
		const workflow = access.mediaWorkFlow
		if (!workflow) throw new Meteor.Error(404, `MediaWorkFlow "${workflowId}" not found`)

		waitForPromise(
			new Promise<void>((resolve, reject) => {
				PeripheralDeviceAPI.executeFunction(
					workflow.deviceId,
					(err, _res) => {
						if (err) reject(err)
						else resolve()
					},
					'abortWorkflow',
					workflow._id
				)
			})
		)
	}
	export function prioritizeWorkflow(context: MethodContext, workflowId: MediaWorkFlowId): any {
		check(workflowId, String)

		const access = PeripheralDeviceContentWriteAccess.mediaWorkFlow(context, workflowId)
		const workflow = access.mediaWorkFlow
		if (!workflow) throw new Meteor.Error(404, `MediaWorkFlow "${workflowId}" not found`)

		waitForPromise(
			new Promise<void>((resolve, reject) => {
				PeripheralDeviceAPI.executeFunction(
					workflow.deviceId,
					(err, _res) => {
						if (err) reject(err)
						else resolve()
					},
					'prioritizeWorkflow',
					workflow._id
				)
			})
		)
	}
}
