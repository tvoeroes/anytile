import { throw_, tryFindFreeId } from "./AnytileUtils.ts"
import { MenuBuilding } from "./MenuBuilding.ts"

export class AnytileMenu extends HTMLElement
{
	#url: HTMLInputElement
	#callback: (() => void) | null = null
	#saveOps: ((reset: boolean) => void)[] = []
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

		MenuBuilding.space(root)

		const saveButton = document.createElement("button")
		saveButton.type = "button"
		saveButton.innerText = "Save"
		saveButton.addEventListener("click", () =>
		{
			const value = this.#url.value
			if (value !== "")
				addDatalistEntry(value)
		})
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
