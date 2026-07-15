import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves project sites from /<repo-name>/, so the build
  // needs to know its own base path. Matches the "lingotrace" repo name.
  base: '/lingotrace/',
})
