import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { recordsServer } from './records-server'

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

// บันทึกเกมเป็นไฟล์ เกมละไฟล์ ในโฟลเดอร์นี้ (ดู records-server.ts)
const RECORDS_DIR = fileURLToPath(new URL('./records', import.meta.url))

export default defineConfig({
  plugins: [react(), recordsServer(RECORDS_DIR)],
  // ไฟล์บันทึกถูกเขียนทุกตา ไม่ต้องให้ vite เฝ้าดู
  server: { proxy, watch: { ignored: ['**/records/**'] } },
  preview: { proxy },
})
