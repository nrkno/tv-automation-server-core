import Agent from 'meteor/kschingiz:meteor-elastic-apm'

class Profiler {
	private active: boolean = false

	startSpan(_name: string) {
		if (!this.active) return
		return Agent.startSpan(_name)
	}

	startTransaction(description: string, name: string) {
		if (!this.active) return
		return Agent.startTransaction(description, name)
	}

	setActive(active: boolean) {
		this.active = active
	}

	setLabel(name: string, value: string) {
		if (!this.active) return

		Agent.setLabel(name, value)
	}

	hasTransaction(): boolean {
		if (!this.active) return false

		return !!Agent.currentTransaction
	}
}

const profiler = new Profiler()

export { profiler }
