import { Anytile3DTilesView } from "./Anytile3DTilesView.ts"
import { Anytile3DTilesMenu } from "./Anytile3DTilesMenu.ts"
import { AnytileMenu } from "./AnytileMenu.ts"
import { unreachable_, throw_ } from "./AnytileUtils.ts"
import { AnytileXyzMenu } from "./AnytileXyzMenu.ts"
import { Anytile3DTilesNativeParams } from "./Anytile3DTilesView.ts"
import { AnytileXyzNativeParams, AnytileXyzView } from "./AnytileXyzView.ts"

namespace Anytile
{
	export type ViewType =
		| { kind: "none" }
		| { kind: "xyz", view: AnytileXyzView, menu: AnytileXyzMenu }
		| { kind: "3d-tiles", view: Anytile3DTilesView, menu: Anytile3DTilesMenu }

	export function getTypeFromUrl(url: string): string
	{
		if (url === "")
			// NOTE: it is convenient to have a way to show the grid
			return "xyz"

		// NOTE: avoid "new URL()" because placeholders like "{x}" may make it throw
		let path = url
		const hashIndex = path.indexOf("#")
		if (hashIndex !== -1)
			path = path.slice(0, hashIndex)
		const queryIndex = path.indexOf("?")
		if (queryIndex !== -1)
			path = path.slice(0, queryIndex)

		if (path === "")
			return "none"
		else if (path.endsWith(".json") || path.endsWith(".geojson"))
			return "3d-tiles"
		else
			return "xyz"
	}

	export function cleanup(app: HTMLDivElement, menu: HTMLDivElement, view: ViewType, doReset: boolean)
	{
		const kind = view.kind

		switch (kind)
		{
			case "none":
				return
			case "xyz":
				app.removeChild(view.view)
				view.menu.saveOptions(doReset)
				menu.removeChild(view.menu)
				break
			case "3d-tiles":
				app.removeChild(view.view)
				view.menu.saveOptions(doReset)
				menu.removeChild(view.menu)
				break
			default:
				unreachable_(kind)
		}

		view.kind = "none"
		view.view = undefined
		view.menu = undefined
	}

	// TODO: fix the variable naming mess
	export function create(app: HTMLDivElement, menu: HTMLDivElement, kind: string, view_2: ViewType)
	{
		if (view_2.kind !== "none")
			throw_("View already exists.")

		switch (kind)
		{
			case "none":
				return
			case "xyz": {
				const menu_2 = new AnytileXyzMenu("anytile-menu-xyz")
				const view = new AnytileXyzView(menu_2) // TODO: avoid the view first loading the "" url before the url is set
				menu.appendChild(menu_2)
				app.insertBefore(view, menu)
				view_2.view = view
				view_2.menu = menu_2
				break
			}
			case "3d-tiles": {
				const menu_2 = new Anytile3DTilesMenu("anytile-menu-3d-tiles")
				const view = new Anytile3DTilesView(menu_2) // TODO: avoid the view first loading the "" url before the url is set
				menu.appendChild(menu_2)
				app.insertBefore(view, menu)
				view_2.view = view
				view_2.menu = menu_2
				break
			}
			default:
				throw_("Unsupported kind.")
		}
		view_2.kind = kind
	}

	export function setUrl(view: ViewType, url: string)
	{
		switch (view.kind)
		{
			case "none":
				break
			case "xyz":
				view.view.setUrl(url)
				break
			case "3d-tiles":
				view.view.setUrl(url)
				break
			default:
				unreachable_(view)
		}
	}
}

document.addEventListener("DOMContentLoaded", () =>
{
	// TODO: function component() instead of es components
	customElements.define("anytile-menu", AnytileMenu)
	customElements.define("anytile-xyz-view", AnytileXyzView)
	customElements.define("anytile-xyz-menu", AnytileXyzMenu)
	customElements.define("anytile-3d-tiles-view", Anytile3DTilesView)
	customElements.define("anytile-3d-tiles-menu", Anytile3DTilesMenu)

	const app = document.createElement("div")
	app.classList.add("anytile-app-root")
	document.body.appendChild(app)

	const dropFeedback = document.createElement("div")
	dropFeedback.classList.add("anytile-drop-feedback")
	dropFeedback.innerText = "Drop a .json or .geojson file to load it."
	app.appendChild(dropFeedback)

	const menuContainer = document.createElement("div")
	menuContainer.classList.add("anytile-menu-container")
	app.appendChild(menuContainer)

	const menu = new AnytileMenu("anytile-menu-")
	menuContainer.appendChild(menu)

	const view: Anytile.ViewType = { kind: "none" }
	const dropHint = "Drop a .json or .geojson file to load it."
	let dragDepth = 0
	let dropErrorTimeout: number | null = null

	const isLoadableFile = (name: string) =>
	{
		const lower = name.toLowerCase()
		return lower.endsWith(".geojson") || lower.endsWith(".json")
	}

	const showDropFeedback = (message: string, isError: boolean) =>
	{
		if (dropErrorTimeout !== null)
		{
			window.clearTimeout(dropErrorTimeout)
			dropErrorTimeout = null
		}

		dropFeedback.innerText = message
		dropFeedback.classList.toggle("anytile-drop-feedback-error", isError)
		dropFeedback.classList.add("anytile-drop-feedback-visible")
	}

	const hideDropFeedback = () =>
	{
		dragDepth = 0
		dropFeedback.classList.remove("anytile-drop-feedback-error", "anytile-drop-feedback-visible")
	}

	const showDropError = (message: string) =>
	{
		showDropFeedback(message, true)
		dropErrorTimeout = window.setTimeout(hideDropFeedback, 2000)
	}

	const isFileDrag = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files")

	window.addEventListener("dragenter", event =>
	{
		if (!isFileDrag(event))
			return

		event.preventDefault()
		dragDepth += 1
		showDropFeedback(dropHint, false)
	})

	window.addEventListener("dragover", event =>
	{
		if (!isFileDrag(event))
			return

		event.preventDefault()
		event.dataTransfer!.dropEffect = "copy"
	})

	window.addEventListener("dragleave", event =>
	{
		if (!isFileDrag(event))
			return

		dragDepth = Math.max(0, dragDepth - 1)
		if (dragDepth === 0)
			hideDropFeedback()
	})

	window.addEventListener("drop", event =>
	{
		if (!isFileDrag(event))
			return

		event.preventDefault()
		hideDropFeedback()

		const files = Array.from(event.dataTransfer?.files ?? [])
		if (files.length > 1)
		{
			showDropError("Drop only one file at a time.")
			return
		}

		const file = files.find(file => isLoadableFile(file.name))
		if (file === undefined)
		{
			if (files.length > 0)
				showDropError("Only .json and .geojson files can be loaded here.")
			return
		}

		if (view.kind !== "3d-tiles")
		{
			Anytile.cleanup(app, menuContainer, view, false)
			Anytile.create(app, menuContainer, "3d-tiles", view)
		}
		if (view.kind === "3d-tiles")
			view.view.dispatchEvent(new CustomEvent("anytile-drop-geojson-file", { detail: file }))
	})

	app.addEventListener("anytile-geojson-load-error", event =>
		showDropError((event as CustomEvent<string>).detail))

	const urlUpdated = (url: string) =>
	{
		const kind = Anytile.getTypeFromUrl(menu.url)
		menu.nativeParams = kind === "xyz" ? AnytileXyzNativeParams : Anytile3DTilesNativeParams

		if (kind !== view.kind)
		{
			Anytile.cleanup(app, menuContainer, view, false)
			Anytile.create(app, menuContainer, kind, view)
		}

		let resolvedUrl = menu.url
		for (const [name, input] of menu.extraParams)
			resolvedUrl = resolvedUrl.replaceAll(`{${name}}`, input.value)
		Anytile.setUrl(view, resolvedUrl)
	}

	const update = () => urlUpdated(menu.url)

	menu.callback = update
	update()

	window.addEventListener("beforeunload", () =>
	{
		Anytile.cleanup(app, menuContainer, view, menu.doReset) // FIXME: also reset the inactive view's options
		menu.saveOptions(menu.doReset)
	})
})
