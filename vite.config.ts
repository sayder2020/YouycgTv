import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 确保打包后资源路径正确，防止部署后找不到 JS/CSS
  base: './', 
})
