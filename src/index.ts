import { AnytileOptions } from "./AnytileOptions.ts"
import { throw_, clamp } from "./AnytileUtils.ts"

class TileId
{
	z: number = 0
	y: number = 0
	x: number = 0

	static readonly MAX_Z = 31

	static ZYX(z: number, y: number, x: number)
	{
		const tileId = new TileId()
		tileId.z = z
		tileId.y = y
		tileId.x = x
		return tileId
	}

	static fromNormalizedXYClamped(z: number, yn: number, xn: number)
	{
		const size = TileId.size(z)
		const y = clamp(Math.floor(yn * size), 0, size - 1)
		const x = clamp(Math.floor(xn * size), 0, size - 1)
		return TileId.ZYX(z, y, x)
	}

	static size(z: number): number
	{
		return Math.pow(2, z)
	}

	static inBounds(tileId: TileId): boolean
	{
		if (tileId.z < 0 || tileId.z > TileId.MAX_Z)
			return false
		const size = TileId.size(tileId.z)
		return tileId.y >= 0 && tileId.y < size && tileId.x >= 0 && tileId.x < size
	}

	static toString(tileId: TileId): string
	{
		return `${tileId.z}/${tileId.y}/${tileId.x}` // FIXME: can be scientific notation?
	}

	/**
	 * FIXME: This function is a bit fragile.
	 */
	static fromString(str: string): TileId
	{
		const t = str.split("/")
		if (t.length !== 3)
			throw_("Failed to convert string to TileId.")
		return TileId.ZYX(parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2]))
	}

	static toQuadkey(tileId: TileId): string
	{
		// TODO: assert valid tileId...

		let quadkey = ""

		let y = tileId.y
		let x = tileId.x

		for (let i = 0; i < tileId.z; i++)
		{
			const yy = y & 1
			const xx = x & 1
			y >>= 1
			x >>= 1

			quadkey = ((yy << 1) + xx).toString() + quadkey
		}

		return quadkey
	}
}

interface Tile
{
	readonly id: TileId
	image: HTMLImageElement | null
	obsolete: boolean
	error: boolean
}

class View // TODO: maybe custom element
{
	#canvas: HTMLCanvasElement
	#ctx: CanvasRenderingContext2D
	#activePointer: number | null

	#renderScheduled: boolean = false

	#tiles: Map<string, Tile> = new Map()

	#tileSetFlip: boolean

	#resizeObserver: ResizeObserver

	#options: AnytileOptions

	constructor(options: AnytileOptions) // TODO: "busy indicator" maybe spinner, maybe some red/green light
	{
		this.#options = options

		this.#tileSetFlip = false

		this.#canvas = document.querySelector("#view") ?? throw_("#view not found.")
		// TODO: handle window.devicePixelRatio !== 1 ???
		this.#resizeObserver = new ResizeObserver((entries, observer) =>
		{
			// FIXME: the window is white while resizing
			const c = this.#canvas
			const r = c.getBoundingClientRect()
			if (r.height !== c.height || r.width !== c.width)
			{
				c.height = r.height
				c.width = r.width
				this.#update()
				this.#scheduleRender()
			}
		})
		this.#resizeObserver.observe(this.#canvas)

		this.#ctx = this.#canvas.getContext("2d") ?? throw_("Failed to initialize 2d rendering context.")

		this.#options.callback = () => { this.#update(); this.#scheduleRender() }

		this.#canvas.addEventListener("keydown", event =>
		{
			if (event.code === "KeyQ")
				this.#options.z = this.#options.z - 1
			else if (event.code === "KeyE")
				this.#options.z = this.#options.z + 1
		})

		this.#activePointer = null

		this.#canvas.addEventListener("pointerdown", event =>
		{
			if (this.#activePointer === null)
			{
				this.#activePointer = event.pointerId
				this.#canvas.setPointerCapture(event.pointerId)
			}
		})


		this.#canvas.addEventListener("pointerup", event =>
		{
			if (this.#activePointer === event.pointerId)
			{
				this.#activePointer = null
			}
		})

		this.#canvas.addEventListener("pointermove", event =>
		{
			if (this.#activePointer === event.pointerId)
			{
				const d = this.#options.s * TileId.size(this.#options.z)

				// FIXME: looks like, especially on z=0 it looks like pointer grab can drift from initial position
				this.#options.y = clamp(this.#options.y - event.movementY / d, 0.0, 1.0) // TODO: clamp on read and on release, not on move
				this.#options.x = clamp(this.#options.x - event.movementX / d, 0.0, 1.0)

				this.#update() // TODO: maybe rate-limit this

				this.#scheduleRender()
			}
		})

		this.#update()
		this.#scheduleRender()
	}

	#url(tileId: TileId)
	{
		return this.#options.url
			.replaceAll("{z}", tileId.z.toString()) // FIXME: can create scientific notation
			.replaceAll("{y}", tileId.y.toString()) // FIXME: can convert to scientific notation
			.replaceAll("{x}", tileId.x.toString()) // FIXME: can convert to scientific notation
			.replaceAll("{q}", TileId.toQuadkey(tileId)) // FIXME: lazy evaluation to avoid quadkey calculation when not needed
	}

	#scheduleRender()
	{
		if (!this.#renderScheduled)
		{
			this.#renderScheduled = true
			window.requestAnimationFrame(() =>
			{
				this.#renderScheduled = false
				this.#render()
			})
		}
	}

	// FIXME: call ONLY ONCE after resize and before redraw?
	#update() // TODO: rate-limit calls to update, maybe use "invalidate" or something and maybe only update() in/before redraw
	{
		const map: Map<string, Tile> = new Map()

		// TODO: verify ALL math in this tool to be pixel-exact (not just this function)

		const [yt, xt] = this.#getTranslation()
		const [yo, xo] = [-yt, -xt]

		const [ye, xe] = [yo + this.#canvas.height, xo + this.#canvas.width] // TODO: make sure that this is evaluated after resize and before draw only

		const [beginYscreen, beginXscreen] = [Math.floor(yo / this.#options.s), Math.floor(xo / this.#options.s)]
		const [endYscreen, endXscreen] = [Math.ceil(ye / this.#options.s), Math.ceil(xe / this.#options.s)]

		const [yc, xc] = [yo + this.#canvas.height / 2, xo + this.#canvas.width / 2] // TODO: make sure that this is evaluated after resize and before draw only
		const [centerY, centerX] = [Math.round(yc / this.#options.s), Math.round(xc / this.#options.s)]
		let [beginYr, beginXr] = [centerY - this.#options.r, centerX - this.#options.r]
		let [endYr, endXr] = [centerY + this.#options.r, centerX + this.#options.r]
		const s = TileId.size(this.#options.z)
		// NOTE: not a problem if the values are still out of range after this adjustment
		if (beginYr < 0)
		{
			endYr -= beginYr
			beginYr -= beginYr
		}
		else if (endYr > s)
		{
			beginYr -= endYr - s
			endYr -= endYr - s
		}
		// NOTE: not a problem if the values are still out of range after this adjustment
		if (beginXr < 0)
		{
			endXr -= beginXr
			beginXr -= beginXr
		}
		else if (endXr > s)
		{
			beginXr -= endXr - s
			endXr -= endXr - s
		}

		const [beginY, beginX] = [Math.max(beginYscreen, beginYr), Math.max(beginXscreen, beginXr)]
		const [endY, endX] = [Math.min(endYscreen, endYr), Math.min(endXscreen, endXr)]

		const [beginCY, beginCX] = [clamp(beginY, 0, s), clamp(beginX, 0, s)]
		const [endCY, endCX] = [clamp(endY, 0, s), clamp(endX, 0, s)]

		const toBeRequested: Tile[] = []

		for (let y = beginCY; y < endCY; y++)
			for (let x = beginCX; x < endCX; x++)
			{
				const tileId = TileId.ZYX(this.#options.z, y, x)
				if (!TileId.inBounds(tileId))
					continue // NOTE: should never be triggered

				const key = this.#keyFor(tileId)
				const existing = this.#tiles.get(key)
				this.#tiles.delete(key) // TODO: maybe some more efficient algorithm than siphoning across maps
				if (existing !== undefined)
				{
					map.set(key, existing)
				}
				else
				{
					const tile = { id: tileId, image: null, obsolete: false, error: false }
					toBeRequested.push(tile)
					map.set(key, tile)
				}
			}

		// TODO: sort by distance to center
		for (const tile of toBeRequested)
			this.#asyncAdd(tile) // TODO: rate-limit a.k.a. delay concurrent requests

		for (const [_, tile] of this.#tiles)
		{
			tile.obsolete = true
			if (tile.image !== null || tile.error)
			{
				this.#options.requestsProgress.addDone(-1)
			}
			this.#options.requestsProgress.addTotal(-1)
		}

		this.#tiles = map
	}

	#clear()
	{
		this.#ctx.fillStyle = "lightgrey"
		this.#ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height)
	}

	#drawTile(image: HTMLImageElement | string, tileId: TileId, yt: number, xt: number)
	{
		const yo = yt + this.#yOffset(tileId)
		const xo = xt + this.#xOffset(tileId)

		if (typeof image == "string")
		{
			this.#ctx.strokeStyle = image
			// TODO: assert size constraints
			this.#ctx.strokeRect(xo + 0.5, yo + 0.5, this.#options.s - 1.0, this.#options.s - 1.0)
		}
		else if (this.#tileSetFlip)
		{
			this.#ctx.save()
			this.#ctx.setTransform(1, 0, 0, -1, xo, yo + image.height)
			this.#ctx.drawImage(image, 0, 0)
			this.#ctx.restore()
		}
		else
		{
			this.#ctx.drawImage(image, xo, yo)
		}
	}

	#xOffset(tileId: TileId)
	{
		return this.#options.s * tileId.x
	}

	#yOffset(tileId: TileId)
	{
		return this.#options.s * tileId.y
	}

	#asyncAdd(tile: Tile)
	{
		this.#options.requestsProgress.addTotal(1)

		const image = new Image()
		image.src = this.#url(tile.id)

		// TODO: rate-limit

		const success = () =>
		{
			if (!tile.obsolete)
			{
				tile.image = image
				this.#options.requestsProgress.addDone(1)
				this.#scheduleRender()
			}
		}

		const failure = () =>
		{
			if (!tile.obsolete)
			{
				tile.error = true
				this.#options.requestsProgress.addDone(1)
				this.#scheduleRender()
			}

		}

		image.decode().then(success).catch(failure)
	}

	#keyFor(tileId: TileId)
	{
		// NOTE: this.#url(tileId) is not sufficient for the case where the url template doesn't have sufficient placeholders such as url template === ""
		return `${TileId.toString(tileId)}/${this.#options.url}`
	}

	#getTranslation()
	{
		const d = this.#options.s * TileId.size(this.#options.z)
		return [
			Math.round(-this.#options.y * d + this.#canvas.height / 2),
			Math.round(-this.#options.x * d + this.#canvas.width / 2),
		]
	}

	#render()
	{
		this.#clear()

		const [yt, xt] = this.#getTranslation()

		for (const [_, tile] of this.#tiles)
		{
			if (tile.image !== null)
			{
				this.#drawTile(tile.image, tile.id, yt, xt)
				if (this.#options.bounds)
					this.#drawTile("grey", tile.id, yt, xt)
			}
			else if (!tile.error)
				this.#drawTile("yellow", tile.id, yt, xt)
			else
				this.#drawTile("red", tile.id, yt, xt)

		}
	}
}

document.addEventListener("DOMContentLoaded", () =>
{
	customElements.define("anytile-options", AnytileOptions)

	const view = new View(document.querySelector("anytile-options") ?? throw_("anytile-options not found"))
})
