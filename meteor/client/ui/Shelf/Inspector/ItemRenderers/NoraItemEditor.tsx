import * as React from 'react'
import { createMosObjectXmlStringNoraBluePrintPiece } from '../../../../lib/data/nora/browser-plugin-data'
import { parseMosPluginMessageXml, MosPluginMessage } from '../../../../lib/parsers/mos/mosXml2Js'
import { PieceGeneric } from '../../../../../lib/collections/Pieces'
import { createMosAppInfoXmlString } from '../../../../lib/data/mos/plugin-support'

//TODO: figure out what the origin should be
const LOCAL_ORIGIN = `${window.location.protocol}//${window.location.host}`
const MODULE_BROWSER_URL = new URL(`https://nora.nrk.no/module/browser?origin=${LOCAL_ORIGIN}&logging=true&dev=true`)
export const MODULE_BROWSER_ORIGIN = `${MODULE_BROWSER_URL.protocol}//${MODULE_BROWSER_URL.host}`

export { NoraItemEditor }

interface INoraEditorProps {
	piece: PieceGeneric
}

class NoraItemEditor extends React.Component<INoraEditorProps> {
	iframe: HTMLIFrameElement

	componentDidMount() {
		this.setUpEventListeners(window)
	}

	componentDidUpdate(_prevProps: INoraEditorProps) {
		if (this.iframe && this.iframe.contentWindow) {
			this.setUpEventListeners(this.iframe.contentWindow)
		}
		this.setUpEventListeners(window)

		// if (JSON.stringify(prevProps.payload) !== JSON.stringify(this.props.payload)) {
		// 	this.postIframePayload()
		// }
	}

	shouldComponentUpdate() {
		return false
	}

	postPayload(target: Window | null) {
		if (target) {
			const payloadXmlString = createMosObjectXmlStringNoraBluePrintPiece(this.props.piece)
			target.postMessage(payloadXmlString, MODULE_BROWSER_ORIGIN)
		}
	}

	setUpEventListeners(target: Window) {
		target.addEventListener('message', (event) => {
			this.handleMessage(event)
		})
	}

	handleMessage(event: MessageEvent) {
		if (event.origin !== MODULE_BROWSER_ORIGIN) {
			console.warn(`Origin rejected (wanted ${MODULE_BROWSER_ORIGIN}, got ${event.origin})`)
			return
		}

		const data = event.data && parseMosPluginMessageXml(event.data)

		if (data) {
			return this.handleMosMessage(data)
		}

		console.error('Unknown message', data)
	}

	handleMosMessage(mos: MosPluginMessage) {
		if (mos.ncsReqAppInfo) {
			this.sendAppInfo(this.iframe.contentWindow)

			// delay to send in order
			setTimeout(() => {
				this.postPayload(this.iframe.contentWindow)
			}, 1)
		}
	}

	sendAppInfo(target: Window | null) {
		if (target) {
			// let uiMetrics: MOSUIMetric[] | undefined = undefined
			// if (this.iframe) {
			// 	const size = this.iframe.getClientRects().item(0)
			// 	if (size) {
			// 		uiMetrics = [
			// 			literal<MOSUIMetric>({
			// 				startx: size.left,
			// 				starty: size.top,
			// 				endx: size.left + size.width,
			// 				endy: size.top + size.height,
			// 				mode: MOSUIMetricMode.ModalDialog,
			// 				canClose: true,
			// 			}),
			// 		]
			// 	}
			// }

			const payloadXmlString = createMosAppInfoXmlString()
			target.postMessage(payloadXmlString, MODULE_BROWSER_ORIGIN)
		}
	}

	render() {
		return React.createElement('iframe', {
			ref: (element) => {
				this.iframe = element as HTMLIFrameElement
			},
			src: MODULE_BROWSER_URL.href,
			style: {
				border: 0,
				height: 720,
				width: 1280,
			},
		})
	}
}
