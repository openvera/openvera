let baseUrl = ''

export function configure(options: { baseUrl: string }) {
  baseUrl = options.baseUrl
}

export function getBaseUrl() {
  return baseUrl
}
