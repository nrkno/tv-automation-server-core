import * as React from 'react'
import * as _ from 'underscore'
import Velocity from 'velocity-animate'
import ClassNames from 'classnames'
import { Meteor } from 'meteor/meteor'
import { Route } from 'react-router-dom'
import { translateWithTracker, Translated } from '../../lib/ReactMeteorData/ReactMeteorData'
import { RundownPlaylist, RundownPlaylists, RundownPlaylistId } from '../../../lib/collections/RundownPlaylists'
import { Studios, Studio, StudioId } from '../../../lib/collections/Studios'
import { parse as queryStringParse } from 'query-string'

import { Spinner } from '../../lib/Spinner'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { objectPathGet, firstIfArray, literal, protectString } from '../../../lib/lib'
import { PrompterData, PrompterAPI, PrompterDataPart } from '../../../lib/api/prompter'
import { PrompterControlManager } from './controller/manager'
import { PubSub } from '../../../lib/api/pubsub'
import { PartInstanceId } from '../../../lib/collections/PartInstances'
import { documentTitle } from '../../lib/DocumentTitleProvider'
import { StudioScreenSaver } from '../StudioScreenSaver/StudioScreenSaver'
import { RundownTimingProvider } from '../RundownView/RundownTiming/RundownTimingProvider'
import { OverUnderTimer } from './OverUnderTimer'
import { Rundowns } from '../../../lib/collections/Rundowns'

interface PrompterConfig {
	mirror?: boolean
	mirrorv?: boolean
	mode?: Array<PrompterConfigMode | string | undefined>
	controlMode?: string
	followTake?: boolean
	fontSize?: number
	margin?: number
	joycon_invertJoystick: boolean
	joycon_speedMap?: number[]
	joycon_reverseSpeedMap?: number[]
	joycon_rangeRevMin?: number
	joycon_rangeNeutralMin?: number
	joycon_rangeNeutralMax?: number
	joycon_rangeFwdMax?: number
	pedal_speedMap?: number[]
	pedal_reverseSpeedMap?: number[]
	pedal_rangeRevMin?: number
	pedal_rangeNeutralMin?: number
	pedal_rangeNeutralMax?: number
	pedal_rangeFwdMax?: number
	shuttle_speedMap?: number[]
	marker?: 'center' | 'top' | 'bottom' | 'hide'
	showMarker: boolean
	showScroll: boolean
	debug: boolean
	showOverUnder: boolean
	addBlankLine: boolean
}

export enum PrompterConfigMode {
	MOUSE = 'mouse',
	KEYBOARD = 'keyboard',
	SHUTTLEKEYBOARD = 'shuttlekeyboard',
	JOYCON = 'joycon',
	PEDAL = 'pedal',
}

export interface IPrompterControllerState {
	source: PrompterConfigMode
	lastEvent: string
	lastSpeed: number
}

interface IProps {
	match?: {
		params?: {
			studioId: StudioId
		}
	}
}

interface ITrackedProps {
	rundownPlaylist?: RundownPlaylist
	studio?: Studio
	studioId?: StudioId
	// isReady: boolean
}

interface IState {
	subsReady: boolean
}

function asArray<T>(value: T | T[] | null): T[] {
	if (Array.isArray(value)) {
		return value
	} else if (value) {
		return [value]
	} else {
		return []
	}
}

export class PrompterViewInner extends MeteorReactComponent<Translated<IProps & ITrackedProps>, IState> {
	usedHotkeys: Array<string> = []

	autoScrollPreviousPartInstanceId: PartInstanceId | null = null

	configOptions: PrompterConfig

	private _controller: PrompterControlManager

	private checkWindowScroll: number | null = null

	constructor(props) {
		super(props)
		this.state = {
			subsReady: false,
		}
		// Disable the context menu:
		document.addEventListener('contextmenu', (e) => {
			e.preventDefault()
		})

		const queryParams = queryStringParse(location.search, {
			arrayFormat: 'comma',
		})

		this.configOptions = {
			mirror: firstIfArray(queryParams['mirror']) === '1',
			mirrorv: firstIfArray(queryParams['mirrorv']) === '1',
			mode: asArray(queryParams['mode']),
			controlMode: firstIfArray(queryParams['controlmode']) || undefined,
			followTake: queryParams['followtake'] === undefined ? true : queryParams['followtake'] === '1',
			fontSize: parseInt(firstIfArray(queryParams['fontsize']) as string, 10) || undefined,
			margin: parseInt(firstIfArray(queryParams['margin']) as string, 10) || undefined,
			joycon_invertJoystick:
				queryParams['joycon_invertJoystick'] === undefined ? true : queryParams['joycon_invertJoystick'] === '1',
			joycon_speedMap:
				queryParams['joycon_speedMap'] === undefined
					? undefined
					: asArray(queryParams['joycon_speedMap']).map((value) => parseInt(value, 10)),
			joycon_reverseSpeedMap:
				queryParams['joycon_reverseSpeedMap'] === undefined
					? undefined
					: asArray(queryParams['joycon_reverseSpeedMap']).map((value) => parseInt(value, 10)),
			joycon_rangeRevMin: parseInt(firstIfArray(queryParams['joycon_rangeRevMin']) as string, 10) || undefined,
			joycon_rangeNeutralMin: parseInt(firstIfArray(queryParams['joycon_rangeNeutralMin']) as string, 10) || undefined,
			joycon_rangeNeutralMax: parseInt(firstIfArray(queryParams['joycon_rangeNeutralMax']) as string, 10) || undefined,
			joycon_rangeFwdMax: parseInt(firstIfArray(queryParams['joycon_rangeFwdMax']) as string, 10) || undefined,
			pedal_speedMap:
				queryParams['pedal_speedMap'] === undefined
					? undefined
					: asArray(queryParams['pedal_speedMap']).map((value) => parseInt(value, 10)),
			pedal_reverseSpeedMap:
				queryParams['pedal_reverseSpeedMap'] === undefined
					? undefined
					: asArray(queryParams['pedal_reverseSpeedMap']).map((value) => parseInt(value, 10)),
			pedal_rangeRevMin: parseInt(firstIfArray(queryParams['pedal_rangeRevMin']) as string, 10) || undefined,
			pedal_rangeNeutralMin: parseInt(firstIfArray(queryParams['pedal_rangeNeutralMin']) as string, 10) || undefined,
			pedal_rangeNeutralMax: parseInt(firstIfArray(queryParams['pedal_rangeNeutralMax']) as string, 10) || undefined,
			pedal_rangeFwdMax: parseInt(firstIfArray(queryParams['pedal_rangeFwdMax']) as string, 10) || undefined,
			marker: (firstIfArray(queryParams['marker']) as any) || undefined,
			showMarker: queryParams['showmarker'] === undefined ? true : queryParams['showmarker'] === '1',
			showScroll: queryParams['showscroll'] === undefined ? true : queryParams['showscroll'] === '1',
			debug: queryParams['debug'] === undefined ? false : queryParams['debug'] === '1',
			showOverUnder: queryParams['showoverunder'] === undefined ? true : queryParams['showoverunder'] === '1',
			addBlankLine: queryParams['addblanklinke'] === undefined ? true : queryParams['adblankline'] === '1',
		}

		this._controller = new PrompterControlManager(this)
	}

	DEBUG_controllerSpeed(speed: number) {
		const speedEl = document.getElementById('prompter-debug-speed')
		if (speedEl) {
			speedEl.textContent = speed + ''
		}
	}

	DEBUG_controllerState(state: IPrompterControllerState) {
		const debug = document.getElementById('prompter-debug')
		if (debug) {
			debug.textContent = ''

			const debugInfo = document.createElement('div')

			const source = document.createElement('h2')
			source.textContent = state.source

			const lastEvent = document.createElement('div')
			lastEvent.classList.add('lastEvent')
			lastEvent.textContent = state.lastEvent

			const lastSpeed = document.createElement('div')
			lastSpeed.id = 'prompter-debug-speed'
			lastSpeed.classList.add('lastSpeed')
			lastSpeed.textContent = state.lastSpeed + ''

			debugInfo.appendChild(source)
			debugInfo.appendChild(lastEvent)
			debugInfo.appendChild(lastSpeed)
			debug.appendChild(debugInfo)
		}
	}

	componentDidMount() {
		if (this.props.studioId) {
			this.subscribe(PubSub.studios, {
				_id: this.props.studioId,
			})

			this.subscribe(PubSub.rundownPlaylists, {
				activationId: { $exists: true },
				studioId: this.props.studioId,
			})
		}

		this.autorun(() => {
			const playlist = RundownPlaylists.findOne(
				{
					studioId: this.props.studioId,
					activationId: { $exists: true },
				},
				{
					fields: {
						_id: 1,
					},
				}
			) as Pick<RundownPlaylist, '_id'> | undefined
			if (playlist?._id) {
				this.subscribe(PubSub.rundowns, {
					playlistId: playlist._id,
				})
			}
		})

		this.autorun(() => {
			const subsReady = this.subscriptionsReady()
			if (subsReady !== this.state.subsReady) {
				this.setState({
					subsReady: subsReady,
				})
			}
		})

		const themeColor = document.head.querySelector('meta[name="theme-color"]')
		if (themeColor) {
			themeColor.setAttribute('data-content', themeColor.getAttribute('content') || '')
			themeColor.setAttribute('content', '#000000')
		}

		document.body.classList.add(
			'dark',
			'xdark',
			'prompter-scrollbar',
			this.configOptions.showScroll ? 'vertical-overflow-only' : 'no-overflow'
		)
		window.addEventListener('scroll', this.onWindowScroll)

		this.triggerCheckCurrentTakeMarkers()
		this.checkScrollToCurrent()

		this.setDocumentTitle()
	}

	componentWillUnmount() {
		super.componentWillUnmount()

		documentTitle.set(null)

		const themeColor = document.head.querySelector('meta[name="theme-color"]')
		if (themeColor) {
			themeColor.setAttribute('content', themeColor.getAttribute('data-content') || '#ffffff')
		}

		document.body.classList.remove(
			'dark',
			'xdark',
			'prompter-scrollbar',
			this.configOptions.showScroll ? 'vertical-overflow-only' : 'no-overflow'
		)
		window.removeEventListener('scroll', this.onWindowScroll)
	}

	componentDidUpdate() {
		this.triggerCheckCurrentTakeMarkers()
		this.checkScrollToCurrent()
	}

	private setDocumentTitle() {
		const { t } = this.props

		documentTitle.set(t('Prompter'))
	}

	checkScrollToCurrent() {
		const playlistId: RundownPlaylistId =
			(this.props.rundownPlaylist && this.props.rundownPlaylist._id) || protectString('')
		const playlist = RundownPlaylists.findOne(playlistId)

		if (this.configOptions.followTake) {
			if (playlist) {
				if (playlist.currentPartInstanceId !== this.autoScrollPreviousPartInstanceId) {
					this.autoScrollPreviousPartInstanceId = playlist.currentPartInstanceId

					this.scrollToLive()
				}
			}
		}
	}
	calculateScrollPosition() {
		let pixelMargin = this.calculateMarginPosition()
		switch (this.configOptions.marker) {
			case 'top':
			case 'hide':
				pixelMargin += 0
				break
			case 'center':
				pixelMargin = window.innerHeight / 2
				break
			case 'bottom':
				pixelMargin = window.innerHeight - pixelMargin
				break
		}
		return pixelMargin
	}
	calculateMarginPosition() {
		const pixelMargin = ((this.configOptions.margin || 0) * window.innerHeight) / 100
		return pixelMargin
	}
	scrollToLive() {
		const scrollMargin = this.calculateScrollPosition()
		const current = document.querySelector('.prompter .live') || document.querySelector('.prompter .next')

		if (current) {
			Velocity(document.body, 'finish')
			Velocity(current, 'scroll', { offset: -1 * scrollMargin, duration: 400, easing: 'ease-out' })
		}
	}
	scrollToNext() {
		const scrollMargin = this.calculateScrollPosition()
		const next = document.querySelector('.prompter .next')

		if (next) {
			Velocity(document.body, 'finish')
			Velocity(next, 'scroll', { offset: -1 * scrollMargin, duration: 400, easing: 'ease-out' })
		}
	}
	scrollToPrevious() {
		const scrollMargin = this.calculateScrollPosition()
		const anchors = this.listAnchorPositions(-1, 10 + scrollMargin)

		const target = anchors[anchors.length - 2] || anchors[0]
		if (!target) return

		Velocity(document.body, 'finish')
		Velocity(document.body, 'scroll', {
			offset: window.scrollY - scrollMargin + target[0],
			duration: 200,
			easing: 'ease-out',
		})
	}
	scrollToFollowing() {
		const scrollMargin = this.calculateScrollPosition()
		const anchors = this.listAnchorPositions(40 + scrollMargin, -1)

		const target = anchors[0]
		if (!target) return

		Velocity(document.body, 'finish')
		Velocity(document.body, 'scroll', {
			offset: window.scrollY - scrollMargin + target[0],
			duration: 200,
			easing: 'ease-out',
		})
	}
	listAnchorPositions(startY: number, endY: number, sortDirection: number = 1): [number, Element][] {
		let foundPositions: [number, Element][] = []
		// const anchors = document.querySelectorAll('.prompter .scroll-anchor')

		Array.from(document.querySelectorAll('.prompter .scroll-anchor')).forEach((anchor) => {
			const { top } = anchor.getBoundingClientRect()
			if ((startY === -1 || top > startY) && (endY === -1 || top <= endY)) {
				foundPositions.push([top, anchor])
			}
		})

		foundPositions = _.sortBy(foundPositions, (v) => sortDirection * v[0])

		return foundPositions
	}
	findAnchorPosition(startY: number, endY: number, sortDirection: number = 1): number | null {
		return (this.listAnchorPositions(startY, endY, sortDirection)[0] || [])[0] || null
	}
	onWindowScroll = () => {
		this.triggerCheckCurrentTakeMarkers()
	}
	triggerCheckCurrentTakeMarkers = () => {
		// Rate limit:
		if (!this.checkWindowScroll) {
			this.checkWindowScroll = Meteor.setTimeout(() => {
				this.checkWindowScroll = null

				this.checkCurrentTakeMarkers()
			}, 500)
		}
	}
	checkCurrentTakeMarkers = () => {
		const playlist = this.props.rundownPlaylist

		if (playlist !== undefined) {
			const positionTop = window.scrollY
			const positionBottom = positionTop + window.innerHeight

			let currentPartElement: Element | null = null
			let currentPartElementAfter: Element | null = null
			let nextPartElementAfter: Element | null = null

			const anchors: Array<Element> = Array.from(document.querySelectorAll('.scroll-anchor'))

			for (let index = 0; index < anchors.length; index++) {
				const current = anchors[index]
				const next = index + 1 < anchors.length ? anchors[index + 1] : null

				if (playlist.currentPartInstanceId && current.classList.contains(`live`)) {
					currentPartElement = current
					currentPartElementAfter = next
				}
				if (playlist.nextPartInstanceId && current.classList.contains(`next`)) {
					nextPartElementAfter = next
				}
			}

			const currentPositionStart = currentPartElement
				? currentPartElement.getBoundingClientRect().top + positionTop
				: null
			const currentPositionEnd = currentPartElementAfter
				? currentPartElementAfter.getBoundingClientRect().top + positionTop
				: null

			const nextPositionEnd = nextPartElementAfter
				? nextPartElementAfter.getBoundingClientRect().top + positionTop
				: null

			const takeIndicator = document.querySelector('.take-indicator')
			if (takeIndicator) {
				if (currentPositionEnd && currentPositionEnd < positionTop) {
					// Display take "^" indicator
					takeIndicator.classList.remove('hidden')
					takeIndicator.classList.add('top')
				} else if (currentPositionStart && currentPositionStart > positionBottom) {
					// Display take "v" indicator
					takeIndicator.classList.remove('hidden', 'top')
				} else {
					takeIndicator.classList.add('hidden')
				}
			}

			const nextIndicator = document.querySelector('.next-indicator')
			if (nextIndicator) {
				if (nextPositionEnd && nextPositionEnd < positionTop) {
					// Display next "^" indicator
					nextIndicator.classList.remove('hidden')
					nextIndicator.classList.add('top')
				} else {
					nextIndicator.classList.add('hidden')
				}
			}
		}
	}

	renderMessage(message: string) {
		const { t } = this.props

		return (
			<div className="rundown-view rundown-view--unpublished">
				<div className="rundown-view__label">
					<p>{message}</p>
					<p>
						<Route
							render={({ history }) => (
								<button
									className="btn btn-primary"
									onClick={() => {
										history.push('/rundowns')
									}}
								>
									{t('Return to list')}
								</button>
							)}
						/>
					</p>
				</div>
			</div>
		)
	}

	render() {
		const { t } = this.props

		const overUnderStyle: React.CSSProperties = {
			marginTop: this.configOptions.margin ? `${this.configOptions.margin}vh` : undefined,
			marginBottom: this.configOptions.margin ? `${this.configOptions.margin}vh` : undefined,
			marginRight: this.configOptions.margin ? `${this.configOptions.margin}vw` : undefined,
			marginLeft: this.configOptions.margin ? `${this.configOptions.margin}vw` : undefined,
			fontSize: (this.configOptions.fontSize ?? 0) > 12 ? `12vmin` : undefined,
		}

		return (
			<React.Fragment>
				{!this.state.subsReady ? (
					<div className="rundown-view rundown-view--loading">
						<Spinner />
					</div>
				) : this.props.rundownPlaylist ? (
					<>
						<RundownTimingProvider playlist={this.props.rundownPlaylist}>
							<Prompter rundownPlaylistId={this.props.rundownPlaylist._id} config={this.configOptions}>
								{this.configOptions.showOverUnder && (
									<OverUnderTimer rundownPlaylist={this.props.rundownPlaylist} style={overUnderStyle} />
								)}
							</Prompter>
						</RundownTimingProvider>
						{this.configOptions.debug ? (
							<div
								id="prompter-debug"
								style={{
									marginTop: this.configOptions.margin ? this.configOptions.margin + 'vh' : undefined,
									marginBottom: this.configOptions.margin ? this.configOptions.margin + 'vh' : undefined,
									marginLeft: this.configOptions.margin ? this.configOptions.margin + 'vw' : undefined,
									marginRight: this.configOptions.margin ? this.configOptions.margin + 'vw' : undefined,
								}}
							></div>
						) : null}
					</>
				) : this.props.studio ? (
					<StudioScreenSaver studioId={this.props.studio._id} />
				) : this.props.studioId ? (
					this.renderMessage(t("This studio doesn't exist."))
				) : (
					this.renderMessage(t('There are no active rundowns.'))
				)}
			</React.Fragment>
		)
	}
}
export const PrompterView = translateWithTracker<IProps, {}, ITrackedProps>((props: IProps) => {
	const studioId = objectPathGet(props, 'match.params.studioId')
	const studio = studioId ? Studios.findOne(studioId) : undefined

	const rundownPlaylist = RundownPlaylists.findOne({
		activationId: { $exists: true },
		studioId: studioId,
	})

	return literal<ITrackedProps>({
		rundownPlaylist,
		studio,
		studioId,
		// isReady: rundownSubscription.ready() && (studioSubscription ? studioSubscription.ready() : true)
	})
})(PrompterViewInner)

interface IPrompterProps {
	rundownPlaylistId: RundownPlaylistId
	config: PrompterConfig
}
interface IPrompterTrackedProps {
	prompterData: PrompterData | undefined
}

type ScrollAnchor = [number, string] | null

export const Prompter = translateWithTracker<IPrompterProps, {}, IPrompterTrackedProps>((props: IPrompterProps) => {
	const playlist = RundownPlaylists.findOne(props.rundownPlaylistId)

	if (playlist) {
		const prompterData = PrompterAPI.getPrompterData(props.rundownPlaylistId)
		return {
			prompterData,
		}
	} else {
		return {
			prompterData: undefined,
		}
	}
})(
	class Prompter extends MeteorReactComponent<Translated<IPrompterProps & IPrompterTrackedProps>, {}> {
		private _debounceUpdate: NodeJS.Timer

		constructor(props) {
			super(props)
			this.state = {
				subsReady: false,
			}
		}

		componentDidMount() {
			this.subscribe(PubSub.rundowns, { playlistId: this.props.rundownPlaylistId })

			this.autorun(() => {
				const playlist = RundownPlaylists.findOne(this.props.rundownPlaylistId)
				if (playlist) {
					const rundownIDs = playlist.getRundownIDs()
					this.subscribe(PubSub.segments, {
						rundownId: { $in: rundownIDs },
					})
					this.subscribe(PubSub.parts, {
						rundownId: { $in: rundownIDs },
					})
					this.subscribe(PubSub.partInstancesSimple, {
						rundownId: { $in: rundownIDs },
						reset: { $ne: true },
					})
					this.subscribe(PubSub.pieces, {
						startRundownId: { $in: rundownIDs },
					})
					this.subscribe(PubSub.pieceInstancesSimple, {
						rundownId: { $in: rundownIDs },
						reset: { $ne: true },
					})
				}
			})

			this.autorun(() => {
				const rundowns = Rundowns.find({ playlistId: this.props.rundownPlaylistId }).fetch()
				this.subscribe(PubSub.showStyleBases, {
					_id: {
						$in: rundowns.map((rundown) => rundown.showStyleBaseId),
					},
				})
			})
		}

		getScrollAnchor = () => {
			let readPosition = ((this.props.config.margin || 0) * window.innerHeight) / 100
			switch (this.props.config.marker) {
				case 'top':
				case 'hide':
					break
				case 'center':
					readPosition = window.innerHeight / 2
					break
				case 'bottom':
					readPosition = window.innerHeight - readPosition
					break
			}

			let foundPositions: [number, string][] = []
			// const anchors = document.querySelectorAll('.prompter .scroll-anchor')

			Array.from(document.querySelectorAll('.prompter .scroll-anchor')).forEach((anchor) => {
				const { top } = anchor.getBoundingClientRect()
				if (top + readPosition <= 10) foundPositions.push([top, '.' + anchor.className.replace(/\s/g, '.')])
			})

			foundPositions = _.sortBy(foundPositions, (v) => 1 * v[0])

			if (foundPositions.length > 0) {
				return foundPositions[foundPositions.length - 1]
			}
			return null
		}

		restoreScrollAnchor = (scrollAnchor: ScrollAnchor) => {
			if (scrollAnchor === null) return
			const anchor = document.querySelector(scrollAnchor[1])
			if (anchor) {
				const { top } = anchor.getBoundingClientRect()

				window.scrollBy({
					top: top - scrollAnchor[0],
				})
			} else {
				console.warn('Read anchor could not be found: ' + scrollAnchor[1])
			}
		}

		shouldComponentUpdate(_nextProps, _nextState): boolean {
			clearTimeout(this._debounceUpdate)
			this._debounceUpdate = setTimeout(() => this.forceUpdate(), 250)
			return false
		}

		getSnapshotBeforeUpdate() {
			return this.getScrollAnchor() as any
		}

		componentDidUpdate(prevProps, prevState, snapshot) {
			this.restoreScrollAnchor(snapshot)
		}

		renderPrompterData(prompterData: PrompterData) {
			const getPartStatus = (part: PrompterDataPart) => {
				if (prompterData.currentPartInstanceId === part.id) {
					return 'live'
				} else if (prompterData.nextPartInstanceId === part.id) {
					return 'next'
				} else {
					return null
				}
			}

			const lines: React.ReactNode[] = []

			prompterData.segments.forEach((segment) => {
				if (segment.parts.length === 0) {
					return
				}

				const firstPart = segment.parts[0]
				const firstPartStatus = getPartStatus(firstPart)

				lines.push(
					<div
						data-obj-id={segment.id}
						key={'segment_' + segment.id}
						className={ClassNames(
							'prompter-segment',
							'scroll-anchor',
							'segment-' + segment.id,
							'part-' + firstPart.id,
							firstPartStatus
						)}
					>
						{segment.title || 'N/A'}
					</div>
				)

				segment.parts.forEach((part) => {
					lines.push(
						<div
							data-obj-id={segment.id + '_' + part.id}
							key={'part_' + part.id}
							className={ClassNames('prompter-part', 'scroll-anchor', 'part-' + part.id, getPartStatus(part))}
						>
							{part.title || 'N/A'}
						</div>
					)

					part.pieces.forEach((line) => {
						lines.push(
							<div
								data-obj-id={segment.id + '_' + part.id + '_' + line.id}
								key={'line_' + part.id + '_' + segment.id + '_' + line.id}
								className={ClassNames(
									'prompter-line',
									this.props.config.addBlankLine ? 'add-blank' : undefined,
									!line.text ? 'empty' : undefined
								)}
							>
								{line.text || ''}
							</div>
						)
					})
				})
			})

			return lines
		}
		render() {
			const { t } = this.props

			if (this.props.prompterData) {
				return (
					<div
						className={ClassNames(
							'prompter',
							this.props.config.mirror ? 'mirror' : undefined,
							this.props.config.mirrorv ? 'mirrorv' : undefined
						)}
						style={{
							fontSize: this.props.config.fontSize ? this.props.config.fontSize + 'vh' : undefined,
						}}
					>
						{this.props.children}

						<div className="overlay-fix">
							<div
								className={
									'read-marker ' + (!this.props.config.showMarker ? 'hide' : this.props.config.marker || 'hide')
								}
							></div>

							<div
								className="indicators"
								style={{
									marginTop: this.props.config.margin ? `${this.props.config.margin}vh` : undefined,
									marginLeft: this.props.config.margin ? `${this.props.config.margin}vw` : undefined,
									marginRight: this.props.config.margin ? `${this.props.config.margin}vw` : undefined,
									fontSize: (this.props.config.fontSize ?? 0) > 12 ? `12vmin` : undefined,
								}}
							>
								<div className="take-indicator hidden"></div>
								<div className="next-indicator hidden"></div>
							</div>
						</div>

						<div
							className="prompter-display"
							style={{
								paddingLeft: this.props.config.margin ? this.props.config.margin + 'vw' : undefined,
								paddingRight: this.props.config.margin ? this.props.config.margin + 'vw' : undefined,
								paddingTop:
									this.props.config.marker === 'center'
										? '50vh'
										: this.props.config.marker === 'bottom'
										? '100vh'
										: this.props.config.margin
										? this.props.config.margin + 'vh'
										: undefined,
								paddingBottom:
									this.props.config.marker === 'center'
										? '50vh'
										: this.props.config.marker === 'top'
										? '100vh'
										: this.props.config.margin
										? this.props.config.margin + 'vh'
										: undefined,
							}}
						>
							<div className="prompter-break begin">{this.props.prompterData.title}</div>

							{this.renderPrompterData(this.props.prompterData)}

							{this.props.prompterData.segments.length ? (
								<div className="prompter-break end">—{t('End of script')}—</div>
							) : null}
						</div>
					</div>
				)
			} else {
				return (
					<div className="prompter prompter--loading">
						<Spinner />
					</div>
				)
			}
		}
	}
)
