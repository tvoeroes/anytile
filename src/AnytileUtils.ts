export function throw_(message: string): never
{
	throw new Error(message)
}

export function clamp(val: number, lo: number, hi: number)
{
	return Math.min(Math.max(val, lo), hi)
}

export function tryFindFreeId(prefix: string): string | null
{
	for (let i = 0; i < 1024 * 1024; i++)
	{
		const candidateId = prefix + Math.random() * Number.MAX_SAFE_INTEGER
		if (document.getElementById(candidateId) === null)
			return candidateId
	}
	return null
}

export function unreachable_(_: never): never
{
	throw_("Reached unreachable code.")
}
