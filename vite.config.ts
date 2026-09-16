import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: true,   // écoute sur 0.0.0.0 : accessible depuis un téléphone sur le même Wi-Fi, pas seulement localhost
    port: 5173,
  },
  preview: {
    host: true,
    port: 5173,
  },
})
