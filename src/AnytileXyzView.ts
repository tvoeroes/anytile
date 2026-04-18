import { throw_, clamp } from "./AnytileUtils.ts"
import { AnytileXyzMenu } from "./AnytileXyzMenu.ts"

export const AnytileXyzNativeParams = ["z", "y", "x", "q"] as const

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

	static squaredDistanceToPoint(normalizedPoint: [number, number], tileId: TileId)
	{
		const s = TileId.size(tileId.z)

		const yx = [
			(tileId.y + 0.5) / s,
			(tileId.x + 0.5) / s,
		]

		const diff = [
			yx[0] - normalizedPoint[0],
			yx[1] - normalizedPoint[1],
		]

		return diff[0] * diff[0] + diff[1] * diff[1]
	}
}

interface Tile
{
	readonly id: TileId
	image: HTMLImageElement | null
	obsolete: boolean
	error: boolean
	requested: boolean
}

export class AnytileXyzView extends HTMLElement
{
	#canvas: HTMLCanvasElement
	#ctx: CanvasRenderingContext2D
	#activePointer: number | null

	#renderScheduled: boolean = false

	#tiles: Map<string, Tile> = new Map()

	#tileSetFlip: boolean

	#resizeObserver: ResizeObserver

	#url_: string = ""
	#menu: AnytileXyzMenu

	#pointerY: number = 0
	#pointerX: number = 0

	#toBeRequested: Tile[] = []
	#inFlight: number = 0

	constructor(menu: AnytileXyzMenu) // TODO: "busy indicator" maybe spinner, maybe some red/green light
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

		this.#menu.callback = () => this.#onUpdate()

		this.#canvas.addEventListener("keydown", event =>
		{
			const delta = (() =>
			{
				if (event.code === "KeyE")
					return 1
				else if (event.code === "KeyQ")
					return -1
				else
					return 0
			})()

			if (delta === 0)
				return

			this.#updateZoom(delta)
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

			if (delta === 0)
				return

			this.#updateZoom(delta)
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
			this.#pointerY = event.offsetY
			this.#pointerX = event.offsetX

			if (this.#activePointer === event.pointerId)
			{
				const d = this.#menu.s * TileId.size(this.#menu.z)

				// FIXME: looks like pointer grab can drift from initial position, especially on z=0
				this.#menu.y = clamp(this.#menu.y - event.movementY / d, 0.0, 1.0) // TODO: clamp on read and on release, not on move
				this.#menu.x = clamp(this.#menu.x - event.movementX / d, 0.0, 1.0)

				this.#update() // TODO: maybe rate-limit this

				this.#scheduleRender()
			}
		})

		this.#update()
		this.#scheduleRender()
	}

	#onUpdate()
	{
		this.#update()
		this.#scheduleRender()
	}

	setUrl(url: string)
	{
		this.#url_ = url
		this.#onUpdate()
	}

	#updateZoom(delta: number)
	{
		if (delta === 0)
			return

		// TODO: verify ALL math in this tool to be pixel-exact (not just this function)
		// TODO: check that the formula is correct for abs(delta) !== 1

		const d = this.#menu.s * TileId.size(this.#menu.z)
		const translation = this.#getTranslation()

		const pointerNormalized = [
			(this.#pointerY - translation[0]) / d,
			(this.#pointerX - translation[1]) / d,
		]

		const pointerRelative = [
			pointerNormalized[0] - this.#menu.y,
			pointerNormalized[1] - this.#menu.x,
		]

		const scale = Math.pow(2, -delta);

		const pointerRelativeZoomed = [
			pointerRelative[0] / Math.pow(2, delta),
			pointerRelative[1] / Math.pow(2, delta),
		]

		this.#menu.z += delta
		this.#menu.y -= pointerRelativeZoomed[0] - pointerRelative[0]
		this.#menu.x -= pointerRelativeZoomed[1] - pointerRelative[1]

		this.#menu.y = clamp(this.#menu.y, 0.0, 1.0)
		this.#menu.x = clamp(this.#menu.x, 0.0, 1.0)
	}

	#url(tileId: TileId)
	{
		// NOTE: keep in sync with AnytileXyzNativeParams
		return this.#url_
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
					const tile = { id: tileId, image: null, obsolete: false, error: false, requested: false }
					toBeRequested.push(tile)
					map.set(key, tile)
				}
			}

		for (const [_, tile] of this.#tiles)
		{
			tile.obsolete = true
			if (tile.requested)
			{
				if (tile.image !== null || tile.error)
					this.#menu.requestsProgress.addDone(-1)
				this.#menu.requestsProgress.addTotal(-1)
			}
		}

		this.#tiles = map

		this.#toBeRequested = this.#toBeRequested.filter(tile => !tile.obsolete)

		this.#toBeRequested = toBeRequested.concat(this.#toBeRequested)

		const center: [number, number] = [
			this.#menu.y,
			this.#menu.x,
		]

		this.#toBeRequested.sort((a, b) =>
		{
			return TileId.squaredDistanceToPoint(center, b.id) - TileId.squaredDistanceToPoint(center, a.id)
		})

		this.#tryAddAsyncNext()
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

	#tryAddAsyncNext()
	{
		// The value is guessed as being a good trade-off. Having pending
		// requests allows for convenient obsolete request cancellation and
		// browsers limit the number of concurrent requests per domain anyway.
		const concurrency = 6

		while (this.#inFlight < concurrency)
		{
			const tile = this.#toBeRequested.pop()
			if (tile === undefined)
				return

			console.assert(!tile.obsolete)
			if (tile.obsolete)
				continue

			this.#asyncAddNext(tile)
		}
	}

	#asyncAddNext(tile: Tile)
	{
		this.#inFlight += 1
		tile.requested = true

		// FIXME: requestsProgress should always represent the progress of all visible tiles
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
					return failure()

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

		const done = () =>
		{
			this.#inFlight -= 1
			this.#tryAddAsyncNext()
		}

		image.decode().then(success).catch(failure).finally(done)
	}

	#keyFor(tileId: TileId)
	{
		// NOTE: this.#url(tileId) is not sufficient for the case where the url template doesn't have sufficient placeholders such as url template === ""
		return `${TileId.toString(tileId)}/${this.#url_}`
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

		if (this.#menu.minimap)
			this.#drawMinimap()
	}

	#drawMinimap()
	{
		const size = 128
		const margin = 8
		const mx = this.#canvas.width - size - margin
		const my = margin

		this.#ctx.fillStyle = "white"
		this.#ctx.fillRect(mx, my, size, size)

		this.#ctx.strokeStyle = "black"
		this.#ctx.lineWidth = 1
		this.#ctx.strokeRect(mx + 0.5, my + 0.5, size - 1, size - 1)

		const cx = Math.round(mx + this.#menu.x * (size - 1)) + 0.5
		const cy = Math.round(my + this.#menu.y * (size - 1)) + 0.5
		const armLen = 4

		this.#ctx.beginPath()
		this.#ctx.moveTo(cx - armLen, cy)
		this.#ctx.lineTo(cx + armLen, cy)
		this.#ctx.moveTo(cx, cy - armLen)
		this.#ctx.lineTo(cx, cy + armLen)
		this.#ctx.stroke()
	}
}
