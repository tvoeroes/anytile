import { clamp, throw_, tryFindFreeId } from "./AnytileUtils.ts"

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

export class AnytileMenu extends HTMLElement
{
	#requestsProgress: AnytileRequestsProgress
	#y: HTMLInputElement
	#x: HTMLInputElement
	#z: HTMLInputElement
	#s: HTMLInputElement
	#r: HTMLInputElement
	#url: HTMLInputElement
	#bounds: HTMLInputElement
	#coords: HTMLInputElement
	#callback: (() => void) | null = null
	#saveOps: ((reset: boolean) => void)[] = []
	#resetButton: HTMLButtonElement
	#doReset: boolean = false

	constructor(localStorageKeyPrefix: string)
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
			const storeKey = localStorageKeyPrefix + name
			const value = localStorage.getItem(storeKey)
			entry(name, element)

			// setup watch
			if (element.type === "checkbox")
				element.addEventListener("change", () => this.#update())
			else
				element.addEventListener("input", () => this.#update())

			// setup save
			if (element.type === "checkbox")
				this.#saveOps.push((reset: boolean) =>
				{
					if (reset)
						localStorage.removeItem(storeKey)
					else
						localStorage.setItem(storeKey, element.checked.toString())
				})
			else
				this.#saveOps.push((reset: boolean) =>
				{
					if (reset)
						localStorage.removeItem(storeKey)
					else
						localStorage.setItem(storeKey, element.value)

				})

			// load
			if (value !== null)
			{
				if (element.type === "checkbox")
					element.checked = value === "true" ? true : false
				else
					element.value = value
			}
		}

		const bar = document.createElement("progress")
		bar.value = 0
		entry("requests", bar)
		this.#requestsProgress = new AnytileRequestsProgress(bar)

		br()

		this.#y = document.createElement("input")
		this.#y.type = "number"
		this.#y.value = "0.5"
		this.#y.step = (Math.pow(2, 31)).toString() // whatever, make sure that the box is wide
		this.#y.min = "0"
		this.#y.max = "1"
		this.#y.readOnly = true
		tweakable("y", this.#y)

		space()

		this.#x = document.createElement("input")
		this.#x.type = "number"
		this.#x.value = "0.5"
		this.#x.step = (Math.pow(2, 31)).toString() // whatever, make sure that the box is wide
		this.#x.min = "0"
		this.#x.max = "1"
		this.#x.readOnly = true
		tweakable("x", this.#x)

		space()

		this.#s = document.createElement("input")
		this.#s.type = "number"
		this.#s.value = "64"
		this.#s.step = "1"
		this.#s.readOnly = true
		tweakable("s", this.#s)

		space()

		this.#resetButton = document.createElement("button")
		this.#resetButton.type = "button"
		this.#resetButton.innerText = "Reset Menu"
		this.#resetButton.addEventListener("click", () =>
		{
			this.#doReset = true
			window.location.reload()
		})
		root.appendChild(this.#resetButton)

		br()

		this.#z = document.createElement("input")
		this.#z.type = "number"
		this.#z.value = "0"
		this.#z.step = "1"
		this.#z.min = "0"
		this.#z.max = "31"
		tweakable("z", this.#z)

		space()

		this.#r = document.createElement("input")
		this.#r.type = "number"
		this.#r.value = "4"
		this.#r.step = "1"
		this.#r.min = "1"
		this.#r.max = "20"
		tweakable("r", this.#r)

		space()

		this.#bounds = document.createElement("input")
		this.#bounds.type = "checkbox"
		this.#bounds.checked = false
		tweakable("bounds", this.#bounds)

		space()

		this.#coords = document.createElement("input")
		this.#coords.type = "checkbox"
		this.#coords.checked = false
		tweakable("coords", this.#coords)

		space()

		{
			const linkToSource = document.createElement("a")
			linkToSource.innerText = "Source"
			linkToSource.href = "https://github.com/tvoeroes/anytile"
			root.appendChild(linkToSource)
		}

		br()

		this.#url = document.createElement("input")
		this.#url.type = "text"
		this.#url.value = ""
		this.#url.size = 48
		tweakable("url", this.#url)

		const datalist = document.createElement("datalist")

		const addDatalistEntry = (value: string) =>
		{
			const option = document.createElement("option")
			option.value = value
			datalist.appendChild(option)
		}

		{
			const datalistId = tryFindFreeId("anytile-menu-url-list-")
			if (datalistId === null)
				throw_("Failed to generate a unique id for AnytileMenu.")

			this.#url.setAttribute("list", datalistId)

			datalist.id = datalistId

			{
				const storeKey = localStorageKeyPrefix + "url-datalist"
				const value = localStorage.getItem(storeKey) ?? "[]"

				const elements = JSON.parse(value)

				for (let i = 0; i < elements.length; i++)
					addDatalistEntry(elements[i])

				this.#saveOps.push((reset: boolean) =>
				{
					if (reset)
					{
						localStorage.removeItem(storeKey)
					}
					else
					{
						const list: string[] = []
						for (const option of datalist.options)
							list.push(option.value)
						localStorage.setItem(storeKey, JSON.stringify(list)) // TODO: maybe don't save if there were no changes?
					}

				})
			}

			root.appendChild(datalist)
		}

		space()

		this.#resetButton = document.createElement("button")
		this.#resetButton.type = "button"
		this.#resetButton.innerText = "Save"
		this.#resetButton.addEventListener("click", () =>
		{
			const value = this.#url.value
			if (value !== "")
				addDatalistEntry(value)
		})
		root.appendChild(this.#resetButton)

		window.addEventListener("beforeunload", () =>
		{
			for (const saveOp of this.#saveOps)
				saveOp(this.#doReset)
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
	get y() { return parseFloat(this.#y.value) }
	get x() { return parseFloat(this.#x.value) }
	get z() { return parseFloat(this.#z.value) }
	get s() { return parseFloat(this.#s.value) }
	get r() { return parseFloat(this.#r.value) }
	get url() { return this.#url.value }
	get bounds() { return this.#bounds.checked }
	get coords() { return this.#coords.checked }

	set y(value: number) { this.#y.value = value.toString(); this.#update() }
	set x(value: number) { this.#x.value = value.toString(); this.#update() }
	set z(value: number)
	{
		this.#z.value = clamp(value, parseFloat(this.#z.min), parseFloat(this.#z.max)).toString()
		this.#update()
	}
	set s(value: number) { this.#s.value = value.toString(); this.#update() }
	set callback(callback: (() => void) | null) { this.#callback = callback }
}
