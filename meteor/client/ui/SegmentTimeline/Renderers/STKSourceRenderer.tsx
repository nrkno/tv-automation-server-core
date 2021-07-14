import { VTSourceRendererBase } from './VTSourceRenderer'
import { withTranslation } from 'react-i18next'

export const STKSourceRenderer = withTranslation()(
	class STKSourceRenderer extends VTSourceRendererBase {
		constructor(props) {
			super(props)
		}

		render() {
			return super.render()
		}
	}
)
