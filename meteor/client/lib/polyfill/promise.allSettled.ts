/**
 * CasparCG HTML renderer in 2.1.12 uses an old version of Chromium that doesn't support Promise.allSettled and as a
 * result causes views rendered using it to crash. Promise.allSettled is used as a part of the i18next integration.
 * This polyfill can be removed once CasparCG HTML renderer is updated to Chromium >= 76.
 * 	   -- Jan Starzak, 2021/02/22
 */
import allSettled from 'promise.allsettled'

// will be a no-op if not needed
allSettled.shim()
