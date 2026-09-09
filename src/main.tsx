import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { normalizeCategoryLabelsToHiragana } from './game/categoryDisplay'

normalizeCategoryLabelsToHiragana()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
