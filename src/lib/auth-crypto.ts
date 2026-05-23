import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'

const PASSWORD_SALT_ROUNDS = 12

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export async function hashPassword(plainText: string) {
  return bcrypt.hash(plainText, PASSWORD_SALT_ROUNDS)
}

export async function verifyPassword(plainText: string, passwordHash: string) {
  return bcrypt.compare(plainText, passwordHash)
}

export function generateToken() {
  return randomBytes(32).toString('hex')
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}
