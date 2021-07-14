import { Tracker } from 'meteor/tracker'

export class ReactiveMap<T> {
	private baseMap = new Map<string, T>()
	private dependencyMap = new Map<string, Tracker.Dependency>()
	private globalDependency = new Tracker.Dependency()

	set(key: string, value: T) {
		const prevVal = this.baseMap.get(key)
		this.baseMap.set(key, value)
		if (this.dependencyMap.has(key) && prevVal !== value) {
			this.dependencyMap.get(key)?.changed()
		} else {
			this.dependencyMap.set(key, new Tracker.Dependency())
		}
		if (prevVal !== value) this.globalDependency.changed()
	}

	get(key: string): T | undefined {
		if (this.dependencyMap.has(key)) {
			this.dependencyMap.get(key)?.depend()
		} else {
			const dependency = new Tracker.Dependency()
			dependency?.depend()
			this.dependencyMap.set(key, dependency)
		}
		return this.baseMap.get(key)
	}

	getAll(): { [key: string]: T } {
		const result: { [key: string]: T } = {}
		for (const [key, value] of this.baseMap.entries()) {
			result[key] = value
		}
		this.globalDependency.depend()
		return result
	}
}
