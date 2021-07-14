import moment from 'moment'
import i18n, { TFunction } from 'i18next'
import Backend from 'i18next-xhr-backend'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import { WithManagedTracker } from '../lib/reactiveData/reactiveDataHelper'
import { PubSub } from '../../lib/api/pubsub'
import {
	Translation,
	TranslationsBundle,
	TranslationsBundleId,
	TranslationsBundles,
} from '../../lib/collections/TranslationsBundles'
import { I18NextData } from '@sofie-automation/blueprints-integration'
import { MeteorCall } from '../../lib/api/methods'
import { ClientAPI } from '../../lib/api/client'
import { interpollateTranslation } from '../../lib/api/TranslatableMessage'

const i18nOptions = {
	fallbackLng: {
		nn: ['nb', 'en'],
		default: ['en'],
	},

	// have a common namespace used around the full app
	ns: ['translations'],
	defaultNS: 'translations',

	debug: false,
	joinArrays: '\n',

	whitelist: ['en', 'nb', 'nn', 'sv'],

	keySeparator: '→',
	nsSeparator: '⇒',
	pluralSeparator: '⥤',
	contextSeparator: '⥤',

	interpolation: {
		escapeValue: false, // not needed for react!!
	},

	react: {
		wait: true,
		useSuspense: false,
	},
}

function toI18NextData(translations: Translation[]): I18NextData {
	const data = {}
	for (const { original, translation } of translations) {
		data[original] = translation
	}

	return data
}

async function getAndCacheTranslationBundle(bundleId: TranslationsBundleId) {
	return new Promise<TranslationsBundle>((resolve, reject) => {
		MeteorCall.system.getTranslationBundle(bundleId).then(
			(response) => {
				if (ClientAPI.isClientResponseSuccess(response) && response.result) {
					localStorage.setItem(`i18n.translationBundles.${bundleId}`, JSON.stringify(response.result))
					resolve(response.result)
				} else {
					reject(response)
				}
			},
			(reason) => {
				reject(reason)
			}
		)
	})
}

class I18nContainer extends WithManagedTracker {
	i18nInstance: typeof i18n

	constructor() {
		super()

		this.i18nInstance = i18n.use(Backend).use(LanguageDetector).use(initReactI18next)

		this.i18nInstance
			.init(i18nOptions)
			.then((t: TFunction) => {
				this.i18nTranslator = t
				moment.locale(i18n.language)
				document.documentElement.lang = i18n.language
			})
			.catch((err: Error) => {
				console.error('Error initializing i18Next:', err)
			})

		this.subscribe(PubSub.translationsBundles, {})
		this.autorun(() => {
			const bundlesInfo = TranslationsBundles.find().fetch() as Omit<TranslationsBundle, 'data'>[]

			Promise.allSettled(
				bundlesInfo.map(async (bundleMetadata) =>
					new Promise<TranslationsBundle>((resolve) => {
						const bundleString = localStorage.getItem(`i18n.translationBundles.${bundleMetadata._id}`)
						if (bundleString) {
							// check hash
							try {
								const bundleObj = JSON.parse(bundleString) as TranslationsBundle
								if (bundleObj.hash === bundleMetadata.hash) {
									resolve(bundleObj) // the cached bundle is up-to-date
									return
								}
							} finally {
								// the cache seems to be corrupt, we re-fetch from backend
								resolve(getAndCacheTranslationBundle(bundleMetadata._id))
							}
						} else {
							resolve(getAndCacheTranslationBundle(bundleMetadata._id))
						}
					})
						.then((bundle) => {
							const i18NextData = toI18NextData(bundle.data)

							this.i18nInstance.addResourceBundle(
								bundle.language,
								bundle.namespace || i18nOptions.defaultNS,
								i18NextData,
								true,
								true
							)
						})
						.catch((reason) => {
							console.error(`Failed to fetch translations bundle "${bundleMetadata._id}": `, reason)
						})
				)
			).catch((reason) => {
				console.error(`One of the translation bundles failed to load: `, reason)
			})
		})
	}

	// return key until real translator comes online
	i18nTranslator(key: unknown, ...args: any[]): string {
		console.debug('i18nTranslator placeholder called', { key, args })
		return interpollateTranslation(key, ...args)
	}
}

const container = new I18nContainer()
const i18nTranslator: TFunction = (key, options) => {
	return container.i18nTranslator(key, options)
}

export { i18nTranslator }

/*
 Notes:
 * How to use i18n in React:
	export const MyReactClass = withTranslation()(class MyReactClass extends React.Component<IProps & WithTranslation, IState> {
		render () {
			const {t} = this.props
			t('My name is {{name}}', {name: 'foobar'})
		}
	})

 * How to use in script:
	import { i18nTranslator } from '../i18n'
	const t = i18nTranslator
	return t('My name is {{name}}', {name: 'foobar'})
 */
