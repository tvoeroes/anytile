import { AnytileMenu } from "./AnytileMenu.ts"
import { AnytileView } from "./AnytileView.ts"

document.addEventListener("DOMContentLoaded", () =>
{
	customElements.define("anytile-menu", AnytileMenu)
	customElements.define("anytile-view", AnytileView)

	const menu = new AnytileMenu("anytile-menu-")
	const view = new AnytileView(menu)
	const app = document.createElement("div")

	document.body.appendChild(app)
	app.appendChild(view)
	app.appendChild(menu)
})
