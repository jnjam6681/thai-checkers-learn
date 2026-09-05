import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// ตั้งใจไม่ใส่ StrictMode — มันรัน effect ซ้ำสองรอบ ซึ่งจะเปิดเกมกับ hosbase
// เกินจำเป็นและเปลืองโควตา
createRoot(document.getElementById('root')!).render(<App />)
