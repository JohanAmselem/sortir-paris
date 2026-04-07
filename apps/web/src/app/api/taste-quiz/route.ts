import { NextRequest, NextResponse } from 'next/server'
import { db, tasteProfiles, tasteQuizAnswers, users } from '@sortir/db'
import { eq, sql } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { QUIZ_QUESTIONS } from '@/lib/taste-quiz-data'

// =========================================
// "Tu préfères" — Cultural Taste Quiz API
// =========================================

// Build question → dimension mappings from quiz data
const QUESTION_DIMENSIONS: Record<string, { dimension: string; weight: number }[]> = {}
for (const q of QUIZ_QUESTIONS) {
  QUESTION_DIMENSIONS[q.id] = q.dimensions
}

const ALL_DIMENSIONS = ['exploration', 'energy', 'social', 'budget', 'planning', 'mainstream', 'visual', 'depth'] as const
type Dimension = typeof ALL_DIMENSIONS[number]

// Archetype definitions with ideal dimension profiles
const ARCHETYPES: Record<string, Record<Dimension, number>> = {
  'explorateur-nocturne':  { exploration: 90, energy: 85, social: 60, budget: 40, planning: 20, mainstream: 30, visual: 50, depth: 50 },
  'esthete-confidentiel':  { exploration: 85, energy: 40, social: 40, budget: 60, planning: 60, mainstream: 15, visual: 70, depth: 80 },
  'epicurien-social':      { exploration: 50, energy: 60, social: 85, budget: 80, planning: 60, mainstream: 80, visual: 50, depth: 40 },
  'flaneur-curieux':       { exploration: 75, energy: 30, social: 50, budget: 30, planning: 30, mainstream: 40, visual: 60, depth: 60 },
  'fetard-culturel':       { exploration: 50, energy: 90, social: 85, budget: 50, planning: 40, mainstream: 75, visual: 50, depth: 30 },
  'intellectuel-engage':   { exploration: 60, energy: 20, social: 50, budget: 40, planning: 70, mainstream: 20, visual: 30, depth: 95 },
  'romantique-parisien':   { exploration: 50, energy: 25, social: 25, budget: 60, planning: 50, mainstream: 50, visual: 75, depth: 60 },
  'aventurier-creatif':    { exploration: 90, energy: 60, social: 50, budget: 40, planning: 25, mainstream: 20, visual: 85, depth: 55 },
}

const ARCHETYPE_LABELS: Record<string, string> = {
  'explorateur-nocturne': 'Explorateur nocturne',
  'esthete-confidentiel': 'Esthète confidentiel',
  'epicurien-social':     'Épicurien social',
  'flaneur-curieux':      'Flâneur curieux',
  'fetard-culturel':      'Fêtard culturel',
  'intellectuel-engage':  'Intellectuel engagé',
  'romantique-parisien':  'Romantique parisien',
  'aventurier-creatif':   'Aventurier créatif',
}

// XP reward for completing the taste quiz
const XP_TASTE_QUIZ = 50

// --------------- Scoring Logic ---------------

function computeScores(answers: Record<string, 'a' | 'b'>): Record<Dimension, number> {
  // Accumulate weighted scores per dimension
  const totals: Record<string, number> = {}
  const weights: Record<string, number> = {}

  for (const dim of ALL_DIMENSIONS) {
    totals[dim] = 0
    weights[dim] = 0
  }

  for (const [questionId, answer] of Object.entries(answers)) {
    const mappings = QUESTION_DIMENSIONS[questionId]
    if (!mappings) continue

    const value = answer === 'b' ? 1 : 0

    for (const { dimension, weight } of mappings) {
      totals[dimension] += value * weight
      weights[dimension] += weight
    }
  }

  // Normalize to 0-100
  const scores = {} as Record<Dimension, number>
  for (const dim of ALL_DIMENSIONS) {
    if (weights[dim] > 0) {
      scores[dim] = Math.round((totals[dim] / weights[dim]) * 100)
    } else {
      scores[dim] = 50 // default neutral
    }
  }

  return scores
}

function findArchetype(scores: Record<Dimension, number>): string {
  let bestArchetype = 'flaneur-curieux'
  let bestDistance = Infinity

  for (const [slug, ideal] of Object.entries(ARCHETYPES)) {
    let distance = 0
    for (const dim of ALL_DIMENSIONS) {
      distance += (scores[dim] - ideal[dim]) ** 2
    }
    if (distance < bestDistance) {
      bestDistance = distance
      bestArchetype = slug
    }
  }

  return bestArchetype
}

function generateAiSummary(scores: Record<Dimension, number>, archetype: string): string {
  const label = ARCHETYPE_LABELS[archetype] || archetype
  const parts: string[] = []

  parts.push(`Profil "${label}".`)

  // Exploration
  if (scores.exploration >= 70) parts.push('Toujours en quête de nouveautés et de découvertes inattendues.')
  else if (scores.exploration <= 30) parts.push('Préfère les valeurs sûres et les lieux familiers.')

  // Energy
  if (scores.energy >= 70) parts.push('Aime l\'ambiance festive et les événements à haute énergie.')
  else if (scores.energy <= 30) parts.push('Recherche le calme, les moments contemplatifs.')

  // Social
  if (scores.social >= 70) parts.push('Adore sortir en groupe et partager des expériences.')
  else if (scores.social <= 30) parts.push('Apprécie les sorties en solo ou en petit comité.')

  // Budget
  if (scores.budget >= 70) parts.push('Prêt·e à investir pour une expérience premium.')
  else if (scores.budget <= 30) parts.push('Privilégie les bons plans et les événements gratuits.')

  // Mainstream
  if (scores.mainstream <= 30) parts.push('Attiré·e par la scène underground et les lieux confidentiels.')
  else if (scores.mainstream >= 70) parts.push('Aime les grands événements populaires et les incontournables.')

  // Depth
  if (scores.depth >= 70) parts.push('Cherche la profondeur intellectuelle et les expériences enrichissantes.')
  else if (scores.depth <= 30) parts.push('Privilégie le divertissement léger et la bonne humeur.')

  return parts.join(' ')
}

// --------------- GET ---------------

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user has a taste profile
    const profile = await db
      .select()
      .from(tasteProfiles)
      .where(eq(tasteProfiles.userId, user.id))
      .limit(1)

    // Get latest quiz answers
    const latestAnswers = await db
      .select()
      .from(tasteQuizAnswers)
      .where(eq(tasteQuizAnswers.userId, user.id))
      .orderBy(sql`${tasteQuizAnswers.completedAt} DESC`)
      .limit(1)

    return NextResponse.json({
      completed: profile.length > 0,
      profile: profile[0] ?? null,
      lastAnswers: latestAnswers[0]?.answers ?? null,
      lastCompletedAt: latestAnswers[0]?.completedAt ?? null,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// --------------- POST ---------------

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const answers: Record<string, 'a' | 'b'> = body.answers

    if (!answers || typeof answers !== 'object') {
      return NextResponse.json({ error: 'answers object required' }, { status: 400 })
    }

    // Validate answers
    for (const [key, val] of Object.entries(answers)) {
      if (val !== 'a' && val !== 'b') {
        return NextResponse.json({ error: `Invalid answer for ${key}: must be "a" or "b"` }, { status: 400 })
      }
    }

    // Compute scores
    const scores = computeScores(answers)
    const archetype = findArchetype(scores)
    const aiSummary = generateAiSummary(scores, archetype)

    // Upsert taste profile
    const existing = await db
      .select()
      .from(tasteProfiles)
      .where(eq(tasteProfiles.userId, user.id))
      .limit(1)

    const profileData = {
      exploration: scores.exploration,
      energy: scores.energy,
      social: scores.social,
      budget: scores.budget,
      planning: scores.planning,
      mainstream: scores.mainstream,
      visual: scores.visual,
      depth: scores.depth,
      archetype,
      aiSummary,
      updatedAt: new Date(),
    }

    if (existing.length > 0) {
      await db
        .update(tasteProfiles)
        .set(profileData)
        .where(eq(tasteProfiles.userId, user.id))
    } else {
      await db.insert(tasteProfiles).values({
        userId: user.id,
        ...profileData,
      })

      // Award XP only for first-time completion
      await db
        .update(users)
        .set({ xp: sql`${users.xp} + ${XP_TASTE_QUIZ}` })
        .where(eq(users.id, user.id))
    }

    // Always save the quiz answers for history
    await db.insert(tasteQuizAnswers).values({
      userId: user.id,
      answers,
    })

    const profile = {
      userId: user.id,
      ...profileData,
      archetypeLabel: ARCHETYPE_LABELS[archetype] || archetype,
    }

    return NextResponse.json({
      success: true,
      profile,
      xpAwarded: existing.length === 0 ? XP_TASTE_QUIZ : 0,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
