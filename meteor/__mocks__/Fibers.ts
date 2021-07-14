let Fiber
try {
	Fiber = require('fibers-npm')
} catch (e) {
	if (e.toString().match(/Missing binary/)) {
		// Temporary workaround:
		throw Error(`
Note: When you get the "Missing binary"-error when running in Jest
be sure you have run npm install (so that the postInstall script has run)
and that you ran npm install with the correct Node version

Original error:
${e.toString()}`)
		// Head over to
		// 	meteor/node_modules/fibers/fibers.js
		// and add this line to line 13:
		// if (process.env.JEST_WORKER_ID !== undefined ) modPath += '.node'
	} else throw e
}
/**
 * Run function in a Fiber
 * Example Jest test:
 * test('tempTestAsync', async () => {
 *     await runInFiber(() => {
 *         // This code runs in a fiber
 *         const val = tempTestAsync(1,2,3)
 *         expect(val).toEqual(1 + 2 + 3)
 *     })
 * })
 */
export function isInFiber(): boolean {
	return !!Fiber.current
}
export function runInFiber<T>(fcn: () => T | Promise<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		Fiber(() => {
			try {
				// Run the function
				const out = fcn()
				if (out instanceof Promise) {
					out.then(resolve).catch((e) => {
						console.log('Error: ' + e)
						reject(e)
					})
				} else {
					// the function has finished
					resolve(out)
				}
			} catch (e) {
				console.log('Error: ' + e)
				if (e.stack) console.log(e.stack)
				reject(e)
			}
		}).run()
	})
}

export { Fiber }
