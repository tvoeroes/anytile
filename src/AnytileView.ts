import { AnytileMenu } from "./AnytileMenu.ts"
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

export class AnytileView extends HTMLElement
{
	#canvas: HTMLCanvasElement
	#ctx: CanvasRenderingContext2D
	#activePointer: number | null

	#renderScheduled: boolean = false

	#tiles: Map<string, Tile> = new Map()

	#tileSetFlip: boolean

	#resizeObserver: ResizeObserver

	#menu: AnytileMenu

	constructor(menu: AnytileMenu) // TODO: "busy indicator" maybe spinner, maybe some red/green light
	{
		super()

		const root = this

		this.#canvas = document.createElement("canvas")
		this.#canvas.setAttribute("tabindex", "0") // NOTE: tabindex="0" makes key events work on canvas
		root.appendChild(this.#canvas)

		this.#menu = menu

		this.#tileSetFlip = false

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

		this.#menu.callback = () => { this.#update(); this.#scheduleRender() }

		this.#canvas.addEventListener("keydown", event =>
		{
			if (event.code === "KeyQ")
				this.#menu.z = this.#menu.z - 1
			else if (event.code === "KeyE")
				this.#menu.z = this.#menu.z + 1
		})

		this.#canvas.addEventListener("wheel", event =>
		{
			// NOTE: the specification makes this one difficult but lets try to come up with something reasonable:

			const delta = (() =>
			{

				if (event.deltaY < 0)
					return 1
				else if (event.deltaY > 0)
					return -1
				else
					return 0
			})()

			this.#menu.z += delta
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
				const d = this.#menu.s * TileId.size(this.#menu.z)

				// FIXME: looks like, especially on z=0 it looks like pointer grab can drift from initial position
				this.#menu.y = clamp(this.#menu.y - event.movementY / d, 0.0, 1.0) // TODO: clamp on read and on release, not on move
				this.#menu.x = clamp(this.#menu.x - event.movementX / d, 0.0, 1.0)

				this.#update() // TODO: maybe rate-limit this

				this.#scheduleRender()
			}
		})

		this.#update()
		this.#scheduleRender()
	}

	#url(tileId: TileId)
	{
		return this.#menu.url
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

		const [beginYScreen, beginXScreen] = [Math.floor(yo / this.#menu.s), Math.floor(xo / this.#menu.s)]
		const [endYScreen, endXScreen] = [Math.ceil(ye / this.#menu.s), Math.ceil(xe / this.#menu.s)]

		const [yc, xc] = [yo + this.#canvas.height / 2, xo + this.#canvas.width / 2] // TODO: make sure that this is evaluated after resize and before draw only
		const [centerY, centerX] = [Math.round(yc / this.#menu.s), Math.round(xc / this.#menu.s)]
		let [beginYr, beginXr] = [centerY - this.#menu.r, centerX - this.#menu.r]
		let [endYr, endXr] = [centerY + this.#menu.r, centerX + this.#menu.r]
		const s = TileId.size(this.#menu.z)
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

		const [beginY, beginX] = [Math.max(beginYScreen, beginYr), Math.max(beginXScreen, beginXr)]
		const [endY, endX] = [Math.min(endYScreen, endYr), Math.min(endXScreen, endXr)]

		const [beginCY, beginCX] = [clamp(beginY, 0, s), clamp(beginX, 0, s)]
		const [endCY, endCX] = [clamp(endY, 0, s), clamp(endX, 0, s)]

		const toBeRequested: Tile[] = []

		for (let y = beginCY; y < endCY; y++)
			for (let x = beginCX; x < endCX; x++)
			{
				const tileId = TileId.ZYX(this.#menu.z, y, x)
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
				this.#menu.requestsProgress.addDone(-1)
			}
			this.#menu.requestsProgress.addTotal(-1)
		}

		this.#tiles = map
	}

	#clear()
	{
		this.#ctx.fillStyle = "lightgrey"
		this.#ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height)
	}

	#drawTile(image: HTMLImageElement | string | null, tileId: TileId, yt: number, xt: number)
	{
		const yo = yt + this.#yOffset(tileId)
		const xo = xt + this.#xOffset(tileId)

		if (typeof image == "string")
		{
			this.#ctx.strokeStyle = image
			// TODO: assert size constraints
			this.#ctx.strokeRect(xo + 0.5, yo + 0.5, this.#menu.s - 1.0, this.#menu.s - 1.0)
		}
		else if (image === null) // TODO: copyable coordinates, quadkey string
		{
			this.#ctx.textBaseline = "top"
			this.#ctx.fillStyle = "black"
			this.#ctx.strokeStyle = "white"
			const lineHeight = 16
			this.#ctx.font = `${lineHeight}px sans-serif`

			const xto = xo + Math.round(lineHeight / 2)
			const yto = yo + Math.round(lineHeight / 2)

			const textZ = `z=${tileId.z}`
			const textY = `y=${tileId.y}`
			const textX = `x=${tileId.x}`
			this.#ctx.strokeText(textZ, xto, yto)
			this.#ctx.fillText(textZ, xto, yto)
			this.#ctx.strokeText(textY, xto, yto + lineHeight)
			this.#ctx.fillText(textY, xto, yto + lineHeight)
			this.#ctx.strokeText(textX, xto, yto + lineHeight * 2)
			this.#ctx.fillText(textX, xto, yto + lineHeight * 2)
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
		return this.#menu.s * tileId.x
	}

	#yOffset(tileId: TileId)
	{
		return this.#menu.s * tileId.y
	}

	#asyncAdd(tile: Tile)
	{
		this.#menu.requestsProgress.addTotal(1)

		const image = new Image()
		image.src = this.#url(tile.id)

		// TODO: rate-limit

		const failure = () =>
		{
			if (!tile.obsolete)
			{
				tile.error = true
				this.#menu.requestsProgress.addDone(1)
				this.#scheduleRender()
			}
		}

		const success = () =>
		{
			if (!tile.obsolete)
			{
				// TODO: implement non square support
				if (image.width !== image.height || image.width === 0)
				{
					failure()
					return
				}

				const s = image.width
				if (this.#menu.s !== s)
					// TODO: more robust way of determining the size
					// TODO: support tiles with overlap (e.g. corner sampled images)
					this.#menu.s = s

				tile.image = image
				this.#menu.requestsProgress.addDone(1)
				this.#scheduleRender()
			}
		}

		image.decode().then(success).catch(failure)
	}

	#keyFor(tileId: TileId)
	{
		// NOTE: this.#url(tileId) is not sufficient for the case where the url template doesn't have sufficient placeholders such as url template === ""
		return `${TileId.toString(tileId)}/${this.#menu.url}`
	}

	#getTranslation()
	{
		const d = this.#menu.s * TileId.size(this.#menu.z)
		return [
			Math.round(-this.#menu.y * d + this.#canvas.height / 2),
			Math.round(-this.#menu.x * d + this.#canvas.width / 2),
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
				if (this.#menu.bounds)
					this.#drawTile("grey", tile.id, yt, xt)
			}
			else if (!tile.error)
				this.#drawTile("yellow", tile.id, yt, xt)
			else
				this.#drawTile("red", tile.id, yt, xt)

			if (this.#menu.coords)
				this.#drawTile(null, tile.id, yt, xt)
		}
	}
}
