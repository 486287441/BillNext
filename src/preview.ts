import { createApp } from "vue"
import PreviewApp from "./app/PreviewApp.vue"
import "../tokens.css"
import "./styles/fonts.scss"
import "./styles/base.scss"
import "./styles/billnext-theme.scss"
import "./styles/home-layout.scss"

createApp(PreviewApp).mount("#app")

import "./styles/quiet-ui.scss"
import "./styles/motion.scss"
