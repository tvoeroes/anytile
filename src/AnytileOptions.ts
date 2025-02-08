import { throw_ } from "./AnytileUtils.ts"

class AnytileRequestsProgress
{
	constructor(element: HTMLProgressElement)
	{
		this.#progressBar = element
		this.#update()
	}

	addTotal(n: number) { this.#total += n; this.#update() }
	addDone(n: number) { this.#done += n; this.#update() }
	reset() { this.#total = 0; this.#done = 0; this.#update() }
	status() { return this.#total == 0 ? 1.0 : this.#done / this.#total }

	#total: number = 0
	#done: number = 0
	#progressBar: HTMLProgressElement

	#update()
	{
		if (this.#total < 0 || this.#done < 0 || this.#total < this.#done)
		{
			this.#progressBar.removeAttribute("value") // hmm, I guess
			throw_("Bad Progress state.")
		}
		this.#progressBar.value = this.status()
	}
}

export class AnytileOptions extends HTMLElement
{
	#requestsProgress: AnytileRequestsProgress
	#z: HTMLInputElement
	#s: HTMLInputElement
	#url: HTMLInputElement
	#callback: (() => void) | null = null
	#saveOps: (() => void)[] = []

	static #keyPrefix = "anytile-options-" // FIXME: handle multiple instances oy AnytileOotions correctly

	constructor()
	{
		super()

		const root = this

		const br = () =>
		{
			root.appendChild(document.createElement("br"))
		}

		const space = () =>
		{
			root.appendChild(document.createTextNode(" "))
		}

		const entry = (name: string, element: HTMLElement) =>
		{
			const label = root.appendChild(document.createElement("label"))
			label.appendChild(document.createTextNode(`${name} = `))
			label.appendChild(element)
			root.appendChild(label)
		}

		const tweakable = (name: string, element: HTMLInputElement) =>
		{
			element.addEventListener("input", () => this.#update())

			entry(name, element)

			const storeKey = AnytileOptions.#keyPrefix + name

			const value = localStorage.getItem(storeKey)
			if (value !== null)
				element.value = value

			this.#saveOps.push(() => localStorage.setItem(storeKey, element.value))
		}

		const bar = document.createElement("progress")
		bar.value = 0
		entry("requests", bar)
		this.#requestsProgress = new AnytileRequestsProgress(bar)

		br()

		this.#z = document.createElement("input")
		this.#z.type = "number"
		this.#z.value = "0"
		this.#z.step = "1"
		this.#z.min = "0"
		this.#z.max = "31"
		tweakable("z", this.#z)

		space()

		this.#s = document.createElement("input")
		this.#s.type = "number"
		this.#s.value = "256"
		this.#s.step = "1"
		this.#s.min = "1"
		this.#s.max = "2048"
		tweakable("s", this.#s)

		br()

		this.#url = document.createElement("input")
		this.#url.type = "text"
		this.#url.value = ""
		this.#url.size = 48
		tweakable("url", this.#url)

		window.addEventListener("beforeunload", () =>
		{
			for (const saveOp of this.#saveOps)
				saveOp()
		})
	}

	connectedCallback()
	{
	}

	disconnectedCallback()
	{
	}

	adoptedCallback()
	{
	}

	attributeChangedCallback(name, oldValue, newValue)
	{
	}

	#update()
	{
		if (this.#callback !== null)
			this.#callback()
	}

	get requestsProgress() { return this.#requestsProgress }
	get z() { return parseFloat(this.#z.value) }
	get s() { return parseFloat(this.#s.value) }
	get url() { return this.#url.value }

	set z(value: number) { this.#z.value = value.toString(); this.#update() }
	set callback(callback: (() => void) | null) { this.#callback = callback }
}
