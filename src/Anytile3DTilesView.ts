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
	#geoJsonDataSource: any = null /* Cesium.GeoJsonDataSource | null */
	#activeTileset: any = null /* Cesium.Cesium3DTileset | null */
	#pendingDroppedGeoJsonFile: File | null = null

	#menu: Anytile3DTilesMenu

	#reportLoadError(message: string)
	{
		console.error(message)
		this.dispatchEvent(new CustomEvent("anytile-geojson-load-error", {
			detail: message,
			bubbles: true,
			composed: true,
		}))
	}

	async #loadGeoJsonDataSource(geoJson: any, sourceUri?: string)
	{
		if (this.#geoJsonDataSource !== null)
			this.#geoJsonDataSource.show = true
		else
		{
			this.#geoJsonDataSource = new this.#Cesium.GeoJsonDataSource()
			await this.#viewer.dataSources.add(this.#geoJsonDataSource)
		}

		this.#clearActiveTileset()
		await this.#geoJsonDataSource.load(geoJson, sourceUri ? { sourceUri } : undefined)
		await this.#viewer.zoomTo(this.#geoJsonDataSource)
	}

	async #loadTileset(url: string, haveInspector: boolean)
	{
		const tileset = await this.#Cesium.Cesium3DTileset.fromUrl(url, { enableDebugWireframe: haveInspector })

		this.#clearGeoJsonDataSource()
		this.#clearActiveTileset()
		this.#activeTileset = tileset
		this.#viewer.scene.primitives.add(tileset)
		await this.#viewer.zoomTo(tileset)

		if (haveInspector)
			this.#viewer.cesium3DTilesInspector.viewModel.tileset = tileset
	}

	constructor(menu: Anytile3DTilesMenu)
	{
		super()

		const root = this

		this.#menu = menu
		this.#menu.callback = () => this.#onUpdate()
		this.addEventListener("anytile-drop-geojson-file", event =>
		{
			this.#pendingDroppedGeoJsonFile = (event as CustomEvent<File>).detail
			this.#tryLoad()
		})

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

	#clearScene(haveInspector: boolean)
	{
		if (haveInspector)
			this.#viewer.cesium3DTilesInspector.viewModel.tileset = undefined

		this.#clearActiveTileset()
		this.#clearGeoJsonDataSource()
	}

	#clearActiveTileset()
	{
		if (this.#activeTileset !== null)
		{
			this.#viewer.scene.primitives.remove(this.#activeTileset)
			this.#activeTileset.destroy()
			this.#activeTileset = null
		}
	}

	#clearGeoJsonDataSource()
	{
		if (this.#geoJsonDataSource !== null)
			this.#geoJsonDataSource.show = false
	}

	async #loadDroppedGeoJsonFile(file: File)
	{
		this.#updating = true

		try
		{
			await this.#loadGeoJsonDataSource(JSON.parse(await file.text()), file.name)
		}
		catch (error)
		{
			this.#reportLoadError("Could not load the dropped file.")
		}
		finally
		{
			this.#updating = false
			this.#tryLoad()
		}
	}

	async #loadUrl(url: string, haveInspector: boolean)
	{
		if (url.endsWith(".geojson"))
		{
			await this.#loadGeoJsonDataSource(url)
			return
		}

		// a ".json" url may contain GeoJSON or a 3D Tiles tileset
		const response = await fetch(url)
		if (!response.ok)
			throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)

		const json = await response.json()
		if (json?.type === "FeatureCollection")
			await this.#loadGeoJsonDataSource(json, url)
		else
			await this.#loadTileset(url, haveInspector)
	}

	#tryLoad()
	{
		if (this.#updating)
			return

		if (this.#pendingDroppedGeoJsonFile !== null)
		{
			const file = this.#pendingDroppedGeoJsonFile
			this.#pendingDroppedGeoJsonFile = null
			void this.#loadDroppedGeoJsonFile(file)
			return
		}

		if (!this.#dirty)
			return

		this.#dirty = false

		const haveInspector = this.#viewer.cesium3DTilesInspector !== undefined

		if (haveInspector !== this.#menu.with3dTilesInspector)
		{
			window.location.reload()
			return
		}

		this.#clearScene(haveInspector)
		this.#updating = true // FIXME: an exception will not set this to false

		this.#loadUrl(this.#url, haveInspector)
			.catch((error) => this.#reportLoadError("Could not load the URL."))
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
