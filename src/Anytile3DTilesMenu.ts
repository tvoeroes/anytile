import { MenuBuilding } from "./MenuBuilding.ts"

export class Anytile3DTilesMenu extends HTMLElement
{
	#saveOps: ((reset: boolean) => void)[] = []

	#with3dTilesInspector: HTMLInputElement

	#callback: (() => void) | null = null

	constructor(localStorageKeyPrefix: string)
	{
		super()

		const root = this

		const updateCallback = () => this.#update()

		this.#with3dTilesInspector = document.createElement("input")
		this.#with3dTilesInspector.type = "checkbox"
		this.#with3dTilesInspector.checked = false
		MenuBuilding.tweakable(root, localStorageKeyPrefix, "with 3d-tiles inspector", this.#with3dTilesInspector, updateCallback, this.#saveOps)

		this.classList.add("anytile-sub-menu")
	}

	saveOptions(reset: boolean)
	{
		for (const saveOp of this.#saveOps)
			saveOp(reset)
	}

	#update()
	{
		if (this.#callback !== null)
			this.#callback()
	}

	set callback(callback: (() => void) | null) { this.#callback = callback }

	get with3dTilesInspector() { return this.#with3dTilesInspector.checked }
}