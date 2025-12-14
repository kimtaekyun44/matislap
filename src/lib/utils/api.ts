// API fetch utility with basePath support

const getBasePath = () => {
  if (typeof window !== 'undefined') {
    // Client-side: use the basePath from next.config.js
    return process.env.NEXT_PUBLIC_BASE_PATH || ''
  }
  return ''
}

export const apiUrl = (path: string) => {
  const basePath = getBasePath()
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${basePath}${normalizedPath}`
}

// Fetch wrapper with basePath
export const apiFetch = async (path: string, options?: RequestInit) => {
  const url = apiUrl(path)
  return fetch(url, options)
}
