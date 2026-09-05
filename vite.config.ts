import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// เบราว์เซอร์ตั้ง header `Origin` เองไม่ได้ แต่ hosbase บังคับให้เป็น
// https://hosbase.com เท่านั้น เลยต้องเด้งผ่าน dev server ของ vite
// ซึ่งเป็นฝั่ง node จึงเขียน header ได้ตามใจ
const proxy = {
  '/hosbase': {
    target: 'wss://hosthai.zapto.org:2218',
    ws: true,
    changeOrigin: true,
    secure: false,
    rewrite: () => '/forevers/',
    headers: { Origin: 'https://hosbase.com' },
  },
}

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
})
