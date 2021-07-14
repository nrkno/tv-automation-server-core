import { IMOSItem, MosString128, MosTime, MosDuration, MosModel, Utils as MosUtils } from 'mos-connection'
import * as XMLBuilder from 'xmlbuilder'
import * as _ from 'underscore'

/**
 * Client side MOS XML to JavaScript object conversion. Not exhaustive, might cut
 * corners to fit specific use cases.
 * Originally developed for use by the Nora editor in the shelf inspector.
 */

/** Copied from mos-gateway */
export function fixMosData(o: any): any {
	if (_.isObject(o) && (o instanceof MosTime || o instanceof MosDuration || o instanceof MosString128)) {
		return o.toString()
	}
	if (_.isArray(o)) {
		return _.map(o, (val) => {
			return fixMosData(val)
		})
	} else if (_.isObject(o)) {
		const o2: any = {}
		_.each(o, (val, key) => {
			o2[key] = fixMosData(val)
		})
		return o2
	} else {
		return o
	}
}

export interface MosPluginMessage {
	ncsReqAppInfo?: boolean
	item?: IMOSItem
}

export function parseMosPluginMessageXml(xmlString: string): MosPluginMessage | undefined {
	const doc: any = MosUtils.xml2js(xmlString)

	if (doc && doc.mos) {
		const res: MosPluginMessage = {}
		if (doc.mos.ncsReqAppInfo) {
			res.ncsReqAppInfo = true
		}

		if (doc.mos.ncsItem && doc.mos.ncsItem.item) {
			res.item = MosModel.XMLMosItem.fromXML(doc.mos.ncsItem.item)
		}

		return res
	} else {
		return undefined
	}
}

export function generateMosPluginItemXml(item: IMOSItem): string {
	const builder = XMLBuilder.create('ncsItem')
	MosModel.XMLMosItem.toXML(builder, item)
	return `<mos>${builder.toString()}</mos>`
}
