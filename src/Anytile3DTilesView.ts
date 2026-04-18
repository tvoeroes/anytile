import { Anytile3DTilesMenu } from "./Anytile3DTilesMenu.ts"

export const Anytile3DTilesNativeParams: readonly string[] = []

class CesiumModuleLoader
{
	static #module: typeof import("cesium") | null = null

	// deferred loading in order to avoid loading large files when they are not needed
	static async get()
	{
		if (CesiumModuleLoader.#module === null)
		{
			(window as any).CESIUM_BASE_URL = "./cesium"

			const moduleAndCss = await Promise.all([import("cesium"), import("cesium/Build/Cesium/Widgets/widgets.css")])

			CesiumModuleLoader.#module = moduleAndCss[0]

			CesiumModuleLoader.#module.Ion.defaultAccessToken = ""
			CesiumModuleLoader.#module.Ion.defaultServer = ""
		}

		return CesiumModuleLoader.#module
	}
}

export class Anytile3DTilesView extends HTMLElement
{
	#viewer: any /* Cesium.Viewer */
	#Cesium: any = null /* Cesium | null */
	#url: string = ""
	#updating: boolean = false
	#dirty: boolean = false

	#menu: Anytile3DTilesMenu

	constructor(menu: Anytile3DTilesMenu)
	{
		super()

		const root = this

		this.#menu = menu
		this.#menu.callback = () => this.#onUpdate()

		this.#updating = true // FIXME: an exception in get() will not set this to false
		CesiumModuleLoader.get()
			.then(Cesium =>
			{
				this.#Cesium = Cesium
				const naturalEarthII = true

				this.#viewer = new Cesium.Viewer(root, {
					baseLayerPicker: false,
					geocoder: false,
					baseLayer: naturalEarthII ? Cesium.ImageryLayer.fromProviderAsync(
						Cesium.TileMapServiceImageryProvider.fromUrl(
							Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"),
						),
					) : false,
				})

				// this application is not using cesium ion services
				const cesiumIonCreditContainer = this.#viewer.cesiumWidget.creditContainer
				cesiumIonCreditContainer.parentElement?.removeChild(cesiumIonCreditContainer)

				if (this.#menu.with3dTilesInspector)
				{
					this.#viewer.extend(this.#Cesium.viewerCesium3DTilesInspectorMixin);
					this.#viewer.cesium3DTilesInspector.viewModel.picking = false;
				}
			})
			.finally(() =>
			{
				this.#updating = false
				this.#tryLoad()
			})
	}

	#tryLoad()
	{
		if (!this.#dirty || this.#updating)
			return

		this.#dirty = false

		const haveInspector = this.#viewer.cesium3DTilesInspector !== undefined


		if (haveInspector !== this.#menu.with3dTilesInspector)
		{
			window.location.reload()
			return
		}

		if (haveInspector)
			this.#viewer.cesium3DTilesInspector.viewModel.tileset = undefined

		this.#viewer.scene.primitives.removeAll()
		this.#updating = true // FIXME: an exception in fromUrl() will not set this to false
		this.#Cesium.Cesium3DTileset.fromUrl(
				this.#url,
			{ enableDebugWireframe: haveInspector }
		)
			.then((tileset: any) =>
			{
				this.#viewer.scene.primitives.add(tileset)
				this.#viewer.zoomTo(tileset)

				if (haveInspector)
					this.#viewer.cesium3DTilesInspector.viewModel.tileset = tileset
			})
			.finally(() =>
			{
				this.#updating = false
				this.#tryLoad()
			})
	}

	setUrl(url: string)
	{
		this.#url = url
		this.#dirty = true
		this.#tryLoad()
	}

	#onUpdate()
	{
		this.#dirty = true
		this.#tryLoad()
	}
}
