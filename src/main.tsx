import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { reloadOnceForStaleChunk } from './components/PageErrorBoundary'

// A tab left open across a deploy asks for page files the deploy removed.
// Vite reports it here; reload once to pick up the new build (audit 22 Oct
// 2026, S-02). The flag clears on a successful load, below.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceForStaleChunk()) event.preventDefault()
})
window.addEventListener('load', () => {
  setTimeout(() => {
    try { sessionStorage.removeItem('fs-chunk-reload') } catch { /* storage blocked */ }
  }, 10000)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
