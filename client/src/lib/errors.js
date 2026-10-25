// API errors look like { error: { code, message } } (API.md). Surface `message`.

export function errorMessage(err, fallback = "Something went wrong. Try again.") {
  if (!err) return fallback
  const apiMessage = err.response?.data?.error?.message
  if (apiMessage) return apiMessage
  if (err.code === "ERR_NETWORK" || err.message === "Network Error") {
    return "Can't reach the TSwift server. Check your connection and try again."
  }
  if (err.response?.status === 404) return "Not found."
  if (err.response?.status >= 500) return "The server had a problem. Try again in a moment."
  return err.message || fallback
}

export function errorCode(err) {
  return err?.response?.data?.error?.code ?? null
}
