declare module 'meteor/meteorhacks:picker' {
	import { ServerResponse, IncomingMessage } from 'http'
	interface Params {
		[key: string]: string
	}
	type Route = (
		route: string,
		cb: (params: Params, req: IncomingMessage, res: ServerResponse, next: () => void) => void
	) => void
	class PickerClass {
		route: Route
		filter(cb: (req: IncomingMessage, res: ServerResponse) => boolean): Router
	}
	class Router {
		middleware(middleware: (req: IncomingMessage, res: http.ServerResponse, next: NextFunction) => void): void
		route: Route
	}
	const Picker: PickerClass
}

declare module 'http' {
	interface IncomingMessage {
		body?: object | string
	}
}
