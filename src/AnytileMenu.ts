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
	#extraParamsContainer: HTMLElement
	#extraParams: Map<string, HTMLInputElement> = new Map()
	#nativeParams: Set<string> = new Set()
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
		MenuBuilding.tweakable(root, localStorageKeyPrefix, "url", this.#url, updateCallback, this.#saveOps, "commit")

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

		this.#extraParamsContainer = root.appendChild(document.createElement("span"))
		this.#extraParamsContainer.style.display = "none"
		this.#setExtraParams(this.#url.value)
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
		this.#setExtraParams(this.#url.value)
		if (this.#callback !== null)
			this.#callback()
	}

	#setExtraParams(url: string)
	{
		const newExtraParamNames = [...new Set(
			[...url.matchAll(/\{(\w+)\}/g)].map(m => m[1]).filter(n => !this.#nativeParams.has(n))
		)]

		// Save current values for params that may persist across URL changes
		const existingValues = new Map<string, string>()
		for (const [name, input] of this.#extraParams)
			existingValues.set(name, input.value)

		this.#extraParamsContainer.replaceChildren()
		this.#extraParams.clear()

		if (newExtraParamNames.length > 0)
		{
			this.#extraParamsContainer.appendChild(document.createElement("hr"))

			// NOTE: caching extra params to localStorage is not supported to avoid
			// accidentally sending an old saved value to a new server.
			for (const name of newExtraParamNames)
			{
				if (this.#extraParams.size > 0)
					MenuBuilding.br(this.#extraParamsContainer)

				const input = document.createElement("input")
				input.type = "text"
				input.value = existingValues.get(name) ?? ""

				MenuBuilding.entry(this.#extraParamsContainer, name, input)
				input.addEventListener("input", () => this.#updateCallbackOnly())

				this.#extraParams.set(name, input)
			}

			this.#extraParamsContainer.appendChild(document.createElement("hr"))
		}

		this.#extraParamsContainer.style.display = newExtraParamNames.length > 0 ? "" : "none"
	}

	#updateCallbackOnly()
	{
		if (this.#callback !== null)
			this.#callback()
	}

	get url() { return this.#url.value }
	set url(url: string) { this.#url.value = url }
	get extraParams(): ReadonlyMap<string, HTMLInputElement> { return this.#extraParams }
	set nativeParams(nativeParams: Iterable<string>)
	{
		const newNativeParams = new Set(nativeParams)
		if (this.#nativeParams.size === newNativeParams.size)
		{
			let changed = false
			for (const nativeParam of this.#nativeParams)
				if (!newNativeParams.has(nativeParam))
				{
					changed = true
					break
				}
			if (!changed)
				return
		}

		this.#nativeParams = newNativeParams
		this.#setExtraParams(this.#url.value)
	}
	set callback(callback: (() => void) | null) { this.#callback = callback }
	get doReset() { return this.#doReset }
}
