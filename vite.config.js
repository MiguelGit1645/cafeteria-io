import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// Configuración mínima: Vercel detecta Vite automáticamente
// (Build Command: npm run build · Output Directory: dist)
export default defineConfig({
  plugins: [vue(), tailwindcss()],
})
