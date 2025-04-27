import { clamp, throw_, tryFindFreeId } from "./AnytileUtils.ts"
import { MenuBuilding } from "./MenuBuilding.ts"

class AnytileRequestsProgress
{
	constructor(element: HTMLProgressElement)
	{
		this.#progressBar = element
		this.#update()
	}

	addTotal(n: number) { this.#total += n; this.#update() }
	addDone(n: number) { this.#done += n; this.#update() }
	status() { return this.#total == 0 ? 1.0 : this.#done / this.#total }
	remaining() { return this.#total - this.#done; }

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

export class AnytileXyzMenu extends HTMLElement
{
	#requestsProgress: AnytileRequestsProgress
	#y: HTMLInputElement
	#x: HTMLInputElement
	#z: HTMLInputElement
	#s: HTMLInputElement
	#r: HTMLInputElement
	#bounds: HTMLInputElement
	#coords: HTMLInputElement
	#callback: (() => void) | null = null
	#saveOps: ((reset: boolean) => void)[] = []
	#resetButton: HTMLButtonElement

	constructor(localStorageKeyPrefix: string)
	{
		super()

		const root = this

		const updateCallback = () => this.#update()

		const bar = document.createElement("progress")
		bar.value = 0
		MenuBuilding.entry(root, "requests", bar)
		this.#requestsProgress = new AnytileRequestsProgress(bar)

		MenuBuilding.br(root)

		this.#y = document.createElement("input")
		this.#y.type = "number"
		this.#y.value = "0.5"
		this.#y.step = (Math.pow(2, 31)).toString() // whatever, make sure that the box is wide
		this.#y.min = "0"
		this.#y.max = "1"
		this.#y.readOnly = true
		MenuBuilding.tweakable(root, localStorageKeyPrefix, "y", this.#y, updateCallback, this.#saveOps)

		MenuBuilding.space(root)

		this.#x = document.createElement("input")
		this.#x.type = "number"
		this.#x.value = "0.5"
		this.#x.step = (Math.pow(2, 31)).toString() // whatever, make sure that the box is wide
		this.#x.min = "0"
		this.#x.max = "1"
		this.#x.readOnly = true
		MenuBuilding.tweakable(root, localStorageKeyPrefix, "x", this.#x, updateCallback, this.#saveOps)

		MenuBuilding.space(root)

		this.#s = document.createElement("input")
		this.#s.type = "number"
		this.#s.value = "64"
		this.#s.step = "1"
		this.#s.readOnly = true
		MenuBuilding.tweakable(root, localStorageKeyPrefix, "s", this.#s, updateCallback, this.#saveOps)

		MenuBuilding.br(root)

		this.#z = document.createElement("input")
		this.#z.type = "number"
		this.#z.value = "0"
		this.#z.step = "1"
		this.#z.min = "0"
		this.#z.max = "31"
		MenuBuilding.tweakable(root, localStorageKeyPrefix, "z", this.#z, updateCallback, this.#saveOps)

		MenuBuilding.space(root)

		this.#r = document.createElement("input")
		this.#r.type = "number"
		this.#r.value = "4"
		this.#r.step = "1"
		this.#r.min = "1"
		this.#r.max = "20"
		MenuBuilding.tweakable(root, localStorageKeyPrefix, "r", this.#r, updateCallback, this.#saveOps)

		MenuBuilding.space(root)

		this.#bounds = document.createElement("input")
		this.#bounds.type = "checkbox"
		this.#bounds.checked = false
		MenuBuilding.tweakable(root, localStorageKeyPrefix, "bounds", this.#bounds, updateCallback, this.#saveOps)

		MenuBuilding.space(root)

		this.#coords = document.createElement("input")
		this.#coords.type = "checkbox"
		this.#coords.checked = false
		MenuBuilding.tweakable(root, localStorageKeyPrefix, "coords", this.#coords, updateCallback, this.#saveOps)

		MenuBuilding.br(root)

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

		this.classList.add("anytile-sub-menu")
	}

	saveOptions(reset: boolean)
	{
		for (const saveOp of this.#saveOps)
			saveOp(reset)
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
