import { throw_, tryFindFreeId } from "./AnytileUtils.ts"
import { MenuBuilding } from "./MenuBuilding.ts"

function setupDatalistSync(storeKey: string, datalist: HTMLDataListElement): { addEntry: (value: string) => void; cleanup: () => void }
{
	const channel = new BroadcastChannel(storeKey)

	const reload = () => {
		const elements: string[] = JSON.parse(localStorage.getItem(storeKey) ?? "[]")
		while (datalist.options.length > 0)
			datalist.options[0].remove()
		for (const value of elements) {
			const option = document.createElement("option")
			option.value = value
			datalist.appendChild(option)
		}
	}

	channel.onmessage = reload

	reload()

	const addEntry = (value: string) => {
		if (value === "")
			return
		navigator.locks.request(storeKey, () => {
			reload()
			for (let i = datalist.options.length - 1; i >= 0; i--)
				if (datalist.options[i].value === value)
					datalist.options[i].remove()
			const option = document.createElement("option")
			option.value = value
			datalist.insertBefore(option, datalist.firstChild)
			const list = Array.from(datalist.options, o => o.value)
			localStorage.setItem(storeKey, JSON.stringify(list))
			channel.postMessage(null)
		})
	}

	return { addEntry, cleanup: () => channel.close() }
}

export class AnytileMenu extends HTMLElement
{
	#url: HTMLInputElement
	#callback: (() => void) | null = null
	#saveOps: ((reset: boolean) => void)[] = []
	#cleanupOps: (() => void)[] = []
	#doReset: boolean = false

	constructor(localStorageKeyPrefix: string)
	{
		super()

		const root = this

		const updateCallback = () => this.#update()

		const resetButton = document.createElement("button")
		resetButton.type = "button"
		resetButton.innerText = "Reset Menu"
		resetButton.addEventListener("click", () =>
		{
			this.#doReset = true
			window.location.reload()
		})
		root.appendChild(resetButton)

		MenuBuilding.space(root)

		{
			const linkToSource = document.createElement("a")
			linkToSource.innerText = "Source"
			linkToSource.href = "https://github.com/tvoeroes/anytile"
			root.appendChild(linkToSource)
		}

		MenuBuilding.br(root)

		this.#url = document.createElement("input")
		this.#url.type = "text"
		this.#url.value = ""
		this.#url.size = 48
		MenuBuilding.tweakable(root, localStorageKeyPrefix, "url", this.#url, updateCallback, this.#saveOps)

		const datalist = document.createElement("datalist")

		{
			const datalistId = tryFindFreeId("anytile-menu-url-list-")
			if (datalistId === null)
				throw_("Failed to generate a unique id for AnytileMenu.")

			this.#url.setAttribute("list", datalistId)
			datalist.id = datalistId
			root.appendChild(datalist)
		}

		const storeKey = localStorageKeyPrefix + "url-datalist"
		const { addEntry, cleanup } = setupDatalistSync(storeKey, datalist)
		this.#cleanupOps.push(cleanup)

		this.#saveOps.push((reset: boolean) => {
			if (reset)
				localStorage.removeItem(storeKey)
		})

		MenuBuilding.space(root)

		const saveButton = document.createElement("button")
		saveButton.type = "button"
		saveButton.innerText = "Save"
		saveButton.addEventListener("click", () => addEntry(this.#url.value))
		root.appendChild(saveButton)
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
		for (const cleanup of this.#cleanupOps)
			cleanup()
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

	get url() { return this.#url.value }
	set callback(callback: (() => void) | null) { this.#callback = callback }
	get doReset() { return this.#doReset }
}
