import { AnytileMenu } from "./AnytileMenu.ts"
import { AnytileView } from "./AnytileView.ts"

document.addEventListener("DOMContentLoaded", () =>
{
	customElements.define("anytile-menu", AnytileMenu)

	const app = document.createElement("div")
	app.id = "app"
	document.body.appendChild(app)

	const canvas = document.createElement("canvas")
	canvas.setAttribute("tabindex", "0") // NOTE: tabindex="0" makes key events work on canvas
	canvas.id = "view" // TODO: custom attribute and use that for css instead?
	app.appendChild(canvas)

	const menu = new AnytileMenu("anytile-menu-")
	app.appendChild(menu)

	const view = new AnytileView(canvas, menu)
})
