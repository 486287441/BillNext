const HISTORY_EVENT_NAME = "billnext-history-change"
const FETCH_REQUEST_EVENT = "billnext:fetch-request"
const FETCH_RESPONSE_EVENT = "billnext:fetch-response"

function injectFunction(origin, keys, callback) {
  const targets = Array.isArray(keys) ? keys : [keys]
  const originValues = targets.reduce((acc, key) => {
    acc[key] = origin[key]
    return acc
  }, {})

  targets.forEach((key) => {
    const wrapped = (...args) => {
      callback(...args)
      return originValues[key].apply(origin, args)
    }
    wrapped.toString = origin[key].toString.bind(origin[key])
    origin[key] = wrapped
  })
}

if (window.top === window && !window.__bewlyHistoryInjected) {
  injectFunction(window.history, ["pushState", "replaceState", "forward", "back"], () => {
    window.dispatchEvent(new CustomEvent(HISTORY_EVENT_NAME))
  })
  window.__bewlyHistoryInjected = true
}

if (window.top === window && !window.__bewlyFetchBridgeInjected) {
  document.addEventListener(FETCH_REQUEST_EVENT, (event) => {
    const detail = event.detail
    if (!detail || typeof detail.id !== "number" || typeof detail.url !== "string") {
      return
    }

    const init = detail.init && typeof detail.init === "object" ? detail.init : {}
    const headers = init.headers && typeof init.headers === "object" ? init.headers : {}

    void fetch(detail.url, {
      method: typeof init.method === "string" ? init.method : "GET",
      credentials: "include",
      headers,
    })
      .then(async (response) => {
        const bodyText = await response.text()
        document.dispatchEvent(
          new CustomEvent(FETCH_RESPONSE_EVENT, {
            bubbles: true,
            composed: true,
            detail: {
              id: detail.id,
              ok: response.ok,
              status: response.status,
              statusText: response.statusText,
              bodyText,
            },
          }),
        )
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "fetch failed"
        document.dispatchEvent(
          new CustomEvent(FETCH_RESPONSE_EVENT, {
            bubbles: true,
            composed: true,
            detail: {
              id: detail.id,
              ok: false,
              status: 0,
              statusText: message,
              bodyText: "",
              error: message,
            },
          }),
        )
      })
  })
  window.__bewlyFetchBridgeInjected = true
}
