export namespace MenuBuilding
{
	export function br(root: HTMLElement)
	{
		root.appendChild(document.createElement("br"))
	}

	export function space(root: HTMLElement)
	{
		root.appendChild(document.createTextNode(" "))
	}

	export function entry(root: HTMLElement, name: string, element: HTMLElement) 
	{
		const label = root.appendChild(document.createElement("label"))
		label.appendChild(document.createTextNode(`${name} = `))
		label.appendChild(element)
		root.appendChild(label)
	}

	export function tweakable(
		root: HTMLElement, localStorageKeyPrefix: string,
		name: string, element: HTMLInputElement,
		updateCallback: () => void,
		saveOps: ((reset: boolean) => void)[]
	)
	{
		const storeKey = localStorageKeyPrefix + name
		const value = localStorage.getItem(storeKey)
		entry(root, name, element)

		// setup watch
		if (element.type === "checkbox")
			element.addEventListener("change", updateCallback)
		else
			element.addEventListener("input", updateCallback)

		// setup save
		if (element.type === "checkbox")
			saveOps.push((reset: boolean) =>
			{
				if (reset)
					localStorage.removeItem(storeKey)
				else
					localStorage.setItem(storeKey, element.checked.toString())
			})
		else
			saveOps.push((reset: boolean) =>
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
}
