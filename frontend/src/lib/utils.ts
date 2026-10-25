import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getLocalISODate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Generate 16 digit NIK dummy sementara untuk pasien tanpa identitas/KTP.
 * Format: 320101 + DDMMYY (hari ini) + 4 digit acak unik (Total 16 digit numerik).
 */
export function generateDummyNik(): string {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, "0")
  const mm = String(now.getMonth() + 1).padStart(2, "0")
  const yy = String(now.getFullYear()).slice(-2)
  const random4 = Math.floor(1000 + Math.random() * 9000)
  return `320101${dd}${mm}${yy}${random4}`
}

