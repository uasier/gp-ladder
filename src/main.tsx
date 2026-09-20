import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { applyMobileClass } from "./platform"
import "./ladder.css"
import "./styles.css"

function syncMobileClass() {
  applyMobileClass(document.documentElement, navigator.userAgent, window.innerWidth)
}

syncMobileClass()
window.addEventListener("resize", syncMobileClass)

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
