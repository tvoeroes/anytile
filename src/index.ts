"use strict"

document.addEventListener("DOMContentLoaded", main)

function throw_(message: string): never
{
	throw new Error(message)
}

function clamp(val: number, lo: number, hi: number)
{
	return Math.min(Math.max(val, lo), hi)
}

function WTF_JAVASCRIPT_imageDataToImageURL(imageData: ImageData)
{
	const canvas = document.createElement("canvas")
	const ctx = canvas.getContext("2d") ?? throw_("Failed to initialize 2d rendering context.")
	canvas.width = imageData.width
	canvas.height = imageData.height
	ctx.putImageData(imageData, 0, 0)
	return canvas.toDataURL()
}

function TMP_procedural(tileId: TileId, s: number)
{
	const sample = (y, x) =>
	{
		const f = 0.125
		return [(Math.sin(y * 2 * Math.PI * f) * 0.5 + 0.5) * 255, (Math.cos(x * 2 * Math.PI * f) * 0.5 + 0.5) * 255, 0, 255]
	}

	const ss = TileId.size(tileId.z)

	const buffer = new Uint8ClampedArray(s * s * 4)
	for (let yy = 0; yy < s; yy++)
		for (let xx = 0; xx < s; xx++)
		{
			const p = sample((yy + tileId.y * s) / ss, (xx + tileId.x * s) / ss)
			for (let cc = 0; cc < 4; cc++)
				buffer[yy * s * 4 + xx * 4 + cc] = p[cc]
		}

	return new ImageData(buffer, s, s)
}

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

// TODO: UI PROGRESS BAR
class Progress
{
	constructor()
	{
		if (Progress.#constructed)
			throw_("Only one instance of Progress allowed.")
		Progress.#constructed = true
		this.#progressBar = document.querySelector("#requests") ?? throw_("#requests not found.")
		this.#update()
	}

	addTotal(n: number) { this.#total += n; this.#update() }
	addDone(n: number) { this.#done += n; this.#update() }
	reset() { this.#total = 0; this.#done = 0; this.#update() }
	status() { return this.#total == 0 ? 1.0 : this.#done / this.#total }

	static #constructed = false
	#total: number = 0
	#done: number = 0
	#progressBar: HTMLProgressElement

	#update()
	{
		if (this.#total < 0 || this.#done < 0 || this.#total < this.#done)
		{
			this.#progressBar.removeAttribute("value") // hmm, I guess
			throw_("Bad Progress state.")
		}
		this.#progressBar.value = this.status()
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
	#progress: Progress
	#z: number
	#y: number = 0.5 // TODO: remember center location from last session
	#x: number = 0.5 // TODO: remember center location from last session
	#r: number // TODO: make configurable and use to limit the loaded area on large screen when desired (overrides screen bounds)
	#activePointer: number | null

	#renderScheduled: boolean = false

	#tiles: Map<string, Tile> = new Map()

	#tileSetTemplate: string = ""
	#tileSetSize: number = 256
	#tileSetFlip: boolean

	#resizeObserver: ResizeObserver

	constructor(options: Options) // TODO: "busy indicator" maybe spinner, maybe some red/green light
	{
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
		this.#progress = new Progress()

		// WARNING: callback called, immediately and accessing #canvas
		options.register("url", (value: string) =>
		{
			this.#tileSetTemplate = value
			this.#update()
		})
		// WARNING: callback called, immediately and accessing #canvas
		options.register("s", (value: string) =>
		{
			this.#tileSetSize = parseFloat(value)
			this.#update()
		})

		// TODO: scroll-zoom at the mouse pointer location
		const zSetter = options.register("z", (value: string) =>
		{
			this.#z = parseFloat(value)
			this.#update() // TODO: maybe rate-limit this
		})

		this.#canvas.addEventListener("keydown", event =>
		{
			if (event.code === "KeyQ")
				zSetter((this.#z - 1).toString())
			else if (event.code === "KeyE")
				zSetter((this.#z + 1).toString())
		})

		this.#r = 2 // TODO: configurable and use min(r_, screen bounds)

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
				const d = this.#tileSetSize * TileId.size(this.#z)

				// FIXME: looks like, especially on z=0 it looks like pointer grab can drift from initial position
				this.#y = clamp(this.#y - event.movementY / d, 0.0, 1.0) // TODO: clamp on read and on release, not on move
				this.#x = clamp(this.#x - event.movementX / d, 0.0, 1.0)

				this.#update() // TODO: maybe rate-limit this

				this.#scheduleRender()
			}
		})

		this.#update()
		this.#scheduleRender()
	}

	#url(tileId: TileId)
	{
		if (this.#tileSetTemplate === "")
			return WTF_JAVASCRIPT_imageDataToImageURL(TMP_procedural(tileId, this.#tileSetSize))
		else
			return this.#tileSetTemplate
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

		const [beginY, beginX] = [Math.floor(yo / this.#tileSetSize), Math.floor(xo / this.#tileSetSize)]
		const [endY, endX] = [Math.ceil(ye / this.#tileSetSize), Math.ceil(xe / this.#tileSetSize)]

		const s = TileId.size(this.#z)
		const [beginCY, beginCX] = [clamp(beginY, 0, s), clamp(beginX, 0, s)]
		const [endCY, endCX] = [clamp(endY, 0, s), clamp(endX, 0, s)]

		console.log(`y: [${beginY}, ${endY})|${endY - beginY}, x: [${beginX}, ${endX})|${endX - beginX}`)

		const toBeRequested: Tile[] = []

		for (let y = beginY; y < endY; y++)
			for (let x = beginX; x < endX; x++)
			{
				const tileId = TileId.ZYX(this.#z, y, x)
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
				this.#progress.addDone(-1)
			}
			this.#progress.addTotal(-1)
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
			this.#ctx.strokeRect(xo + 0.5, yo + 0.5, this.#tileSetSize - 1.0, this.#tileSetSize - 1.0)
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
		return this.#tileSetSize * tileId.x
	}

	#yOffset(tileId: TileId)
	{
		return this.#tileSetSize * tileId.y
	}

	#asyncAdd(tile: Tile)
	{
		this.#progress.addTotal(1)
		const image = new Image()
		image.src = this.#url(tile.id)
		image.addEventListener("load", () =>
		{
			// TODO: rate-limit, de-duplicate requests (ABA problem)
			// const key = this.#keyFor(tileId)
			// const existing = this.tiles.get(key)
			// if (!tile.obsolete)
			// {

			// }
			if (!tile.obsolete)
			{
				tile.image = image
				// if (existing !== undefined)
				// {
				// 	existing.image = image
				this.#progress.addDone(1)
				this.#scheduleRender()
			}
			// }
		})
		image.addEventListener("error", () =>
		{
			// TODO: rate-limit, de-duplicate requests (ABA problem)
			// const key = this.#keyFor(tileId)
			// const existing = this.tiles.get(key)
			// if (existing !== undefined)
			// {
			// TODO: mark as failed
			if (!tile.obsolete)
			{
				tile.error = true
				this.#progress.addDone(1)
				this.#scheduleRender()
			}
			// }
		})
	}

	#keyFor(tileId: TileId)
	{
		return this.#url(tileId)
	}

	#getTranslation()
	{
		const d = this.#tileSetSize * TileId.size(this.#z)
		return [
			Math.round(-this.#y * d + this.#canvas.height / 2),
			Math.round(-this.#x * d + this.#canvas.width / 2),
		]
	}

	#render()
	{
		this.#clear()

		const [yt, xt] = this.#getTranslation()

		for (const [_, tile] of this.#tiles)
		{
			if (tile.image !== null)
				this.#drawTile(tile.image, tile.id, yt, xt)
			else if (!tile.error)
				this.#drawTile("green", tile.id, yt, xt)
			else
				this.#drawTile("red", tile.id, yt, xt)

		}
	}
}

class Options // TODO: maybe custom element instead of singleton
{
	#saveOps: (() => void)[] = []
	static #constructed = false

	constructor()
	{
		if (Options.#constructed)
			throw_("Only one instance of Options allowed.")
		Options.#constructed = true
		window.addEventListener("beforeunload", () =>
		{
			for (const saveOp of this.#saveOps)
				saveOp()
		})
	}

	/**
	 * @returns Setter that can be used to set the value from outside.
	 */
	// WARNING: multiple registrations for same option are possible and will cause multiple save calls
	register(option: string, callback: (value: string) => void): (value: string) => void
	{
		const input: HTMLInputElement = document.querySelector(`#${option}`) ?? throw_(`#${option} not found.`)
		const value = localStorage.getItem(option)
		if (value !== null)
			input.value = value
		callback(input.value)
		input.addEventListener("input", () => { callback(input.value) })
		this.#saveOps.push(() => localStorage.setItem(option, input.value))
		return (value: string) => { input.value = value; callback(input.value) }
	}
}

function main()
{
	const options = new Options()
	const view = new View(options)
}
