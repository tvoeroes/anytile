export function throw_(message: string): never
{
	throw new Error(message)
}

export function clamp(val: number, lo: number, hi: number)
{
	return Math.min(Math.max(val, lo), hi)
}

/**
 * Returns the url without the query and the fragment.
 */
export function urlPath(url: string): string
{
	// NOTE: avoid "new URL()" because placeholders like "{x}" may make it throw
	let path = url
	const hashIndex = path.indexOf("#")
	if (hashIndex !== -1)
		path = path.slice(0, hashIndex)
	const queryIndex = path.indexOf("?")
	if (queryIndex !== -1)
		path = path.slice(0, queryIndex)
	return path
}

export function tryFindFreeId(prefix: string): string | null
{
	for (let i = 0; i < 1024 * 1024; i++)
	{
		const candidateId = prefix + Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
		if (document.getElementById(candidateId) === null)
			return candidateId
	}
	return null
}

export function unreachable_(_: never): never
{
	throw_("Reached unreachable code.")
}
