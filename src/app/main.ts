import { createApp, type App as VueApp } from "vue"
import { createPinia } from "pinia"

import App from "./App.vue"
import HomeApp from "./HomeApp.vue"
import "../../tokens.css"
import "../styles/fonts.scss"
import "../styles/base.scss"
import "../styles/billnext-theme.scss"
import "../styles/home-layout.scss"

const appInstances = new WeakMap<HTMLElement, VueApp>()

export function mountInboxApp(container: HTMLElement): VueApp {
  const existingApp = appInstances.get(container)
  if (existingApp) {
    return existingApp
  }

  const app = createApp(window.location.hostname === "www.bilibili.com" ? HomeApp : App)
  app.use(createPinia())
  app.mount(container)
  appInstances.set(container, app)
  return app
}

export function unmountInboxApp(container: HTMLElement): void {
  const app = appInstances.get(container)
  if (app) {
    app.unmount()
    appInstances.delete(container)
  }
}

import "../styles/quiet-ui.scss"
import "../styles/motion.scss"
