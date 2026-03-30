import { NextResponse } from 'next/server'
import { db, categories } from '@sortir/db'
import { asc } from 'drizzle-orm'

// GET /api/categories — All categories ordered by position
export async function GET() {
  const result = await db.select().from(categories).orderBy(asc(categories.position))
  return NextResponse.json(result)
}
