import { mountInboxApp, unmountInboxApp } from "../app/main"
import { isTargetMomentsPage, isTargetPage, waitForDocumentReady } from "./host-detect"
import {
  ensureAppContainer,
  clearPageReplacement,
  isContainerMounted,
  markContainerMounted,
} from "./page-replace"

const HISTORY_EVENT_NAME = "billnext-history-change"

let lastUrl = window.location.href
let observerStarted = false
let bootstrapPending = false
let bodyObserver: MutationObserver | null = null

function scheduleBootstrap(): void {
  window.setTimeout(() => {
    void bootstrap()
  }, 0)
}

async function bootstrap(): Promise<void> {
  if (bootstrapPending) {
    return
  }
  bootstrapPending = true

  if (isTargetMomentsPage()) {
    window.location.replace("https://www.bilibili.com/?billnext=following")
    bootstrapPending = false
    return
  }

  if (!isTargetPage()) {
    const container = clearPageReplacement()
    if (container) {
      unmountInboxApp(container)
      container.remove()
    }
    bootstrapPending = false
    return
  }

  try {
    await waitForDocumentReady()

    const container = ensureAppContainer()
    if (isContainerMounted(container)) {
      return
    }

    mountInboxApp(container)
    markContainerMounted(container)
  } finally {
    bootstrapPending = false
  }
}

function startUrlObserver(): void {
  if (observerStarted) {
    return
  }

  observerStarted = true
  const checkAppContainer = (): void => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href
      scheduleBootstrap()
      return
    }

    if (!isTargetPage()) {
      return
    }

    const container = document.getElementById("billnext-inbox-root")
    if (!(container instanceof HTMLElement) || !isContainerMounted(container)) {
      scheduleBootstrap()
    }
  }

  const observeBody = (): void => {
    bodyObserver?.disconnect()
    if (!document.body) return
    bodyObserver = new MutationObserver(checkAppContainer)
    bodyObserver.observe(document.body, { childList: true })
  }

  const documentObserver = new MutationObserver(() => {
    observeBody()
    checkAppContainer()
  })

  documentObserver.observe(document.documentElement, { childList: true })
  if (document.body) observeBody()
  else document.addEventListener("DOMContentLoaded", observeBody, { once: true })
}

function startRuntime(): void {
  window.addEventListener(HISTORY_EVENT_NAME, () => {
    if (window.location.href !== lastUrl) lastUrl = window.location.href
    scheduleBootstrap()
  })
  window.addEventListener("popstate", () => {
    lastUrl = window.location.href
    scheduleBootstrap()
  })
  window.addEventListener("hashchange", () => {
    lastUrl = window.location.href
    scheduleBootstrap()
  })
  window.addEventListener("pageshow", scheduleBootstrap)

  window.setInterval(() => {
    if (!isTargetPage()) return
    const container = document.getElementById("billnext-inbox-root")
    if (!(container instanceof HTMLElement) || !isContainerMounted(container)) scheduleBootstrap()
  }, 1500)

  scheduleBootstrap()
  startUrlObserver()
}

// The replacement UI belongs to the top-level Bilibili page. Mounting it in
// embedded/about:blank frames duplicates observers, stores, requests and timers.
if (window.top === window) startRuntime()
