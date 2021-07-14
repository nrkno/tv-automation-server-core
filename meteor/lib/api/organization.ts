import { OrganizationId } from '../../lib/collections/Organization'

export interface NewOrganizationAPI {
	removeOrganization(organizationId: OrganizationId): Promise<void>
}

export enum OrganizationAPIMethods {
	'removeOrganization' = 'organization.removeOrganization',
}
