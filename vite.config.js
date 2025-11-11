import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      // Dev proxy to avoid CORS when calling Xunfei RAASR endpoints
      '/xf/upload': {
        target: 'https://raasr.xfyun.cn',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/xf\/upload/, '/v2/api/upload'),
      },
      '/xf/getResult': {
        target: 'https://raasr.xfyun.cn',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/xf\/getResult/, '/v2/api/getResult'),
      },
    }
  }
})
