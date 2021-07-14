declare class ReactiveArray<T> extends Array<T> {
	constructor(source?: Array<T>)

	/**
	 * Return all elements as a plain Javascript array.
	 */
	array(): Array<T>

	/**
	 * Returns a reactive source of the array.
	 */
	list(): Array<T>

	/**
	 * An alias of list().
	 */
	depend(): Array<T>

	/**
	 * Remove all elements of the array.
	 */
	clear(): void
}

declare class ReactiveDict<T> {
	constructor(id?: string)
	set(key: string, value: T): void
	get(key: string): T
	equals(key: string, compareValue: T): boolean
}
