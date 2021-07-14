import PLazy from 'p-lazy'

/** Lazy initialise a value. */
export class LazyInitialise<T> {
	#value!: T
	#loading: PLazy<void> | undefined

	/** Create the lazy wrapper, and provide the init function to be called when first fetched */
	public constructor(init: () => Promise<T>) {
		this.#loading = new PLazy<void>((resolve, reject) => {
			try {
				init()
					.then((v) => {
						this.#value = v
						this.#loading = undefined
						resolve()
					})
					.catch((e) => reject(e))
			} catch (e) {
				reject()
			}
		})
	}

	/** Return the value, loading it if required */
	public async get(): Promise<T> {
		if (!this.isLoaded()) {
			await this.#loading
		}

		return this.#value
	}

	/** Get the value if it is already loaded */
	public getIfLoaded(): T | undefined {
		if (this.isLoaded()) {
			return this.#value
		} else {
			return undefined
		}
	}

	/** Check if the value has been loaded */
	public isLoaded(): boolean {
		return !this.#loading
	}
}
