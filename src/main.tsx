import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'
import { ThemeProvider } from './contexts/ThemeContext'

// Click effect: a gold ring pops on any .btn-fx / .cls-fx / .chip-fx when it is pressed.
document.addEventListener('pointerdown', (e) => {
  const el = (e.target as HTMLElement).closest?.('.btn-fx, .cls-fx, .chip-fx') as HTMLElement | null
  if (!el || (el as HTMLButtonElement).disabled || (e.target as HTMLElement).closest('.chip-fx-x')) return
  el.classList.remove('fx-pop')
  void el.offsetWidth
  el.classList.add('fx-pop')
  window.setTimeout(() => el.classList.remove('fx-pop'), 550)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
