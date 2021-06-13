import { Settings } from '../../lib/Settings'
import { getUserRoles } from '../../lib/collections/Users'

enum LocalStorageProperty {
	STUDIO = 'studioMode',
	CONFIGURE = 'configureMode',
	DEVELOPER = 'developerMode',
	TESTING = 'testingMode',
	SPEAKING = 'speakingMode',
	SERVICE = 'serviceMode',
}

export function setAllowStudio(studioMode: boolean) {
	localStorage.setItem(LocalStorageProperty.STUDIO, studioMode ? '1' : '0')
}
export function getAllowStudio(): boolean {
	if (Settings.enableUserAccounts) {
		return !!getUserRoles().studio
	}
	return localStorage.getItem(LocalStorageProperty.STUDIO) === '1'
}

export function setAllowConfigure(configureMode: boolean) {
	localStorage.setItem(LocalStorageProperty.CONFIGURE, configureMode ? '1' : '0')
}
export function getAllowConfigure(): boolean {
	if (Settings.enableUserAccounts) {
		return !!getUserRoles().configurator
	}
	return localStorage.getItem(LocalStorageProperty.CONFIGURE) === '1'
}

export function setAllowService(serviceMode: boolean) {
	localStorage.setItem(LocalStorageProperty.SERVICE, serviceMode ? '1' : '0')
}
export function getAllowService(): boolean {
	return localStorage.getItem(LocalStorageProperty.SERVICE) === '1'
}

export function setAllowDeveloper(developerMode: boolean) {
	localStorage.setItem(LocalStorageProperty.DEVELOPER, developerMode ? '1' : '0')
}
export function getAllowDeveloper(): boolean {
	if (Settings.enableUserAccounts) {
		return !!getUserRoles().developer
	}
	return localStorage.getItem(LocalStorageProperty.DEVELOPER) === '1'
}

export function setAllowTesting(testingMode: boolean) {
	localStorage.setItem(LocalStorageProperty.TESTING, testingMode ? '1' : '0')
}
export function getAllowTesting(): boolean {
	if (Settings.enableUserAccounts) {
		return !!getUserRoles().developer
	}
	return localStorage.getItem(LocalStorageProperty.TESTING) === '1'
}

// GUI features: ----------------------------------

export function setAllowSpeaking(speakingMode: boolean) {
	localStorage.setItem(LocalStorageProperty.SPEAKING, speakingMode ? '1' : '0')
}
export function getAllowSpeaking(): boolean {
	return localStorage.getItem(LocalStorageProperty.SPEAKING) === '1'
}

export function setHelpMode(helpMode: boolean) {
	localStorage.setItem('helpMode', helpMode ? '1' : '0')
}

export function getHelpMode(): boolean {
	return localStorage.getItem('helpMode') === '1'
}

export function setUIZoom(uiZoomLevel: number) {
	localStorage.setItem('uiZoomLevel', uiZoomLevel + '')
}

export function getUIZoom(): number {
	return parseFloat(localStorage.getItem('uiZoomLevel') || '1') || 1
}
