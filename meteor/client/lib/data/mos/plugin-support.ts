const PackageInfo = require('../../../../package.json')

export enum AckStatus {
	ACK = 'ACK',
	Error = 'ERROR',
}

export enum UIMetricMode {
	Contained = 'CONTAINED',
	NonModal = 'NONMODAL',
	Toolbar = 'TOOLBAR',
	ModalDialog = 'MODALDIALOG',
}

export enum Events {
	/** Event is emitted every now-and-then, generally to be used for simple displays */
	'dragenter' = 'sofie:dragEnter',
	/** event is emitted with a very high frequency (60 Hz), to be used sparingly as
	 * hooking up Components to it will cause a lot of renders
	 */
	'dragleave' = 'sofie:dragLeave',
}

export interface UIMetric {
	startx: number
	starty: number
	endx: number
	endy: number
	mode: UIMetricMode
	canClose?: boolean
}

export function createMosItemRequest() {
	const doc = objectToXML(
		{
			ncsItemRequest: {},
		},
		'mos'
	)

	return new XMLSerializer().serializeToString(doc)
}

export function createMosAckString(status?: AckStatus, statusDescription?: string): string {
	const doc = objectToXML(
		{
			ncsAck: {
				status,
				statusDescription,
			},
		},
		'mos'
	)

	return new XMLSerializer().serializeToString(doc)
}

export function createMosAppInfoXmlString(uiMetrics?: UIMetric[]): string {
	const doc = objectToXML(
		{
			ncsID: 'sofie-core',
			ncsAppInfo: {
				ncsInformation: {
					userID: 'sofie system',
					runContext: 'BROWSE',
					software: {
						manufacturer: 'Sofie Project',
						product: 'Sofie TV Automation',
						version: PackageInfo.version || 'UNSTABLE',
					},
					uiMetric: uiMetrics
						? uiMetrics.map((metric, index) => {
								return Object.assign({}, metric, {
									_attributes: {
										num: index.toString(),
									},
								})
						  })
						: undefined,
				},
			},
		},
		'mos'
	)

	return new XMLSerializer().serializeToString(doc)
}

export function objectToXML(obj: object, rootName: string): Document {
	const doc = new Document()
	const root = doc.createElement(rootName)

	addNodes(obj, root)

	doc.appendChild(root)
	return doc
}

function addNodes(obj: object, rootNode: Node): void {
	const doc = rootNode.ownerDocument
	if (doc) {
		for (const name of Object.keys(obj)) {
			const value = obj[name]

			if (typeof value === 'object' && name === '_attributes') {
				for (const attrName of Object.keys(value)) {
					rootNode.appendChild(createAttribute(attrName, value[attrName], doc))
				}
			} else if (Array.isArray(value)) {
				value.forEach((element) => {
					rootNode.appendChild(createNode(name, element, doc))
				})
			} else if (value !== undefined) {
				rootNode.appendChild(createNode(name, value, doc))
			}
		}
	}
}

function createAttribute(name: string, value: any, doc: Document) {
	const attr = doc.createAttribute(name)
	attr.textContent = value

	return attr
}

function createNode(name: string, value: any, doc: Document) {
	const node = doc.createElement(name)

	if (typeof value === 'object' && value !== null) {
		addNodes(value, node)
	} else {
		node.textContent = value
	}

	return node
}
