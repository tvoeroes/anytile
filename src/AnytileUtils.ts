export function throw_(message: string): never
{
	throw new Error(message)
}

export function clamp(val: number, lo: number, hi: number)
{
	return Math.min(Math.max(val, lo), hi)
}
