export function onElementResize(
	el: HTMLElement,
	clb: (entries: ResizeObserverEntry[], observer: ResizeObserver) => void
) {
	const resizeObserver = new ResizeObserver(clb)
	resizeObserver.observe(el)
	return resizeObserver
}

export function offElementResize(resizeObserver: ResizeObserver, el: HTMLElement) {
	resizeObserver.unobserve(el)
}
