import { throw_, tryFindFreeId } from "./AnytileUtils.ts"

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

		const resetButton = document.createElement("button")
		resetButton.type = "button"
		resetButton.innerText = "Reset Menu"
		resetButton.addEventListener("click", () =>
		{
			this.#doReset = true
			window.location.reload()
		})
		root.appendChild(resetButton)

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

	get url() { return this.#url.value }
	set callback(callback: (() => void) | null) { this.#callback = callback }
}
