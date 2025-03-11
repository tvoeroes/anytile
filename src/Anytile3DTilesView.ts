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
	#nextUrl: string | null = null
	#updating: boolean = false

	constructor()
	{
		super()

		const root = this

		this.#updating = true
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
			})
			.finally(() =>
			{
				this.#updating = false
				this.#tryLoad()
			})
	}

	#tryLoad()
	{
		if (this.#nextUrl === null || this.#updating)
			return

		const url = this.#nextUrl
		this.#nextUrl = null

		this.#updating = true
		this.#viewer.scene.primitives.removeAll()
		this.#Cesium.Cesium3DTileset.fromUrl(url)
			.then((tileset: any) =>
			{
				this.#viewer.scene.primitives.add(tileset)
				this.#viewer.zoomTo(tileset)
			})
			.finally(() =>
			{
				this.#updating = false
				this.#tryLoad()
			})
	}

	setUrl(url: string)
	{
		this.#nextUrl = url
		this.#tryLoad()
	}
}
