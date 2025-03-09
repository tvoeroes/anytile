import { Anytile3DTilesView } from "./Anytile3DTilesView.ts"
import { AnytileMenu } from "./AnytileMenu.ts"
import { unreachable_, throw_ } from "./AnytileUtils.ts"
import { AnytileXyzMenu } from "./AnytileXyzMenu.ts"
import { AnytileXyzView } from "./AnytileXyzView.ts"

namespace Anytile
{
	export type ViewType =
		| { kind: "none" }
		| { kind: "xyz", view: AnytileXyzView, menu: AnytileXyzMenu }
		| { kind: "3d-tiles", view: Anytile3DTilesView }

	export function getTypeFromUrl(url: string): string
	{
		if (url === "")
			// NOTE: it is convenient to have a way to show the grid
			return "xyz"

		try
		{
			const u = new URL(url)
			if (u.pathname.endsWith(".json"))
				return "3d-tiles"
			else
				return "xyz"
		}
		catch (e)
		{
			return "none"
		}
	}

	export function cleanup(app: HTMLDivElement, menu: HTMLDivElement, view: ViewType)
	{
		const kind = view.kind

		switch (kind)
		{
			case "none":
				return
			case "xyz":
				app.removeChild(view.view)
				menu.removeChild(view.menu)
				break
			case "3d-tiles":
				app.removeChild(view.view)
				break
			default:
				unreachable_(kind)
		}

		view.kind = "none"
		view.view = undefined
		view.menu = undefined
	}

	// TODO: fix the variable naming mess
	export function create(app: HTMLDivElement, menu: HTMLDivElement, menu_: AnytileMenu, kind: string, view_2: ViewType)
	{
		if (view_2.kind !== "none")
			throw_("View already exists.")

		switch (kind)
		{
			case "none":
				return
			case "xyz":
				// FIXME: don't use two places where save is managed (AnytileMenu)
				const menu_2 = new AnytileXyzMenu("anytile-menu-xyz")
				const view = new AnytileXyzView(menu_2) // TODO: avoid the view first loading the "" url before the url is set
				menu.appendChild(menu_2)
				app.insertBefore(view, menu)
				view_2.view = view
				view_2.menu = menu_2
				break
			case "3d-tiles":
				const view_ = new Anytile3DTilesView(menu_) // TODO: avoid the view first loading the "" url before the url is set
				app.appendChild(view_)
				app.insertBefore(view_, menu)
				view_2.view = view_
				break
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

	const app = document.createElement("div")
	document.body.appendChild(app)

	const menuContainer = document.createElement("div")
	menuContainer.className = "anytile-menu-container"
	app.appendChild(menuContainer)

	const menu = new AnytileMenu("anytile-menu-")
	menuContainer.appendChild(menu)

	const view: Anytile.ViewType = { kind: "none" }

	const urlUpdated = (url: string) =>
	{
		const kind = Anytile.getTypeFromUrl(menu.url)

		if (kind !== view.kind)
		{
			Anytile.cleanup(app, menuContainer, view)
			Anytile.create(app, menuContainer, menu, kind, view)
		}
		Anytile.setUrl(view, menu.url)
	}

	const update = () => urlUpdated(menu.url)

	menu.callback = update
	update()
})
