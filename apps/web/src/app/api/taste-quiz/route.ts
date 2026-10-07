import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { desc, eq } from 'drizzle-orm'
import { db, tasteProfiles, tasteQuizAnswers } from '@sortir/db'
import { isKnownQuestion, MIN_ANSWERS, scoreQuiz, type QuizAnswers } from '@/lib/taste-quiz-data'
import { ensureUserRow, errors, getSessionUser, limit, parseBody } from '@/app/club/_lib/api'
import { syncGamification } from '@/app/club/_lib/member'

export const dynamic = 'force-dynamic'

const answersSchema = z
  .record(z.string().max(8), z.enum(['a', 'b'], { message: 'Réponse invalide.' }))
  .refine((a) => Object.keys(a).every(isKnownQuestion), { message: 'Question inconnue.' })

const bodySchema = z.object({
  answers: answersSchema,
  /** « Recommencer »: don't merge with the previous answers. */
  replace: z.boolean().optional(),
})

function asAnswers(raw: unknown): QuizAnswers {
  const parsed = answersSchema.safeParse(raw)
  return parsed.success ? parsed.data : {}
}

// GET /api/taste-quiz — the member's profile and answers (to continue the quiz).
export async function GET() {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  try {
    const [[profile], [latest]] = await Promise.all([
      db.select().from(tasteProfiles).where(eq(tasteProfiles.userId, user.id)).limit(1),
      db
        .select({ answers: tasteQuizAnswers.answers, completedAt: tasteQuizAnswers.completedAt })
        .from(tasteQuizAnswers)
        .where(eq(tasteQuizAnswers.userId, user.id))
        .orderBy(desc(tasteQuizAnswers.completedAt))
        .limit(1),
    ])
    return NextResponse.json(
      {
        completed: Boolean(profile),
        profile: profile
          ? {
              archetype: profile.archetype,
              summary: profile.aiSummary,
              scores: {
                exploration: profile.exploration,
                energy: profile.energy,
                social: profile.social,
                budget: profile.budget,
                planning: profile.planning,
                mainstream: profile.mainstream,
                visual: profile.visual,
                depth: profile.depth,
              },
            }
          : null,
        answers: asAnswers(latest?.answers),
        completedAt: latest?.completedAt ?? null,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (err) {
    console.error('[api/taste-quiz] GET failed', err)
    return errors.server()
  }
}

// POST /api/taste-quiz — save answers (merged with previous ones), recompute the profile.
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return errors.unauthorized()
  const limited = limit(request, 'taste-quiz', 10, 60 * 60_000, user.id)
  if (limited) return limited
  const body = await parseBody(request, bodySchema)
  if (!body.ok) return body.response

  try {
    const [latest] = await db
      .select({ answers: tasteQuizAnswers.answers })
      .from(tasteQuizAnswers)
      .where(eq(tasteQuizAnswers.userId, user.id))
      .orderBy(desc(tasteQuizAnswers.completedAt))
      .limit(1)
    const answers: QuizAnswers = body.data.replace
      ? body.data.answers
      : { ...asAnswers(latest?.answers), ...body.data.answers }
    const result = scoreQuiz(answers)
    if (result.answered < MIN_ANSWERS) {
      return errors.badRequest(`Réponds à au moins ${MIN_ANSWERS} questions pour obtenir ton profil.`)
    }

    await ensureUserRow(user)
    const profile = {
      ...result.scores,
      archetype: result.archetype,
      aiSummary: result.summary,
      updatedAt: new Date(),
    }
    await db
      .insert(tasteProfiles)
      .values({ userId: user.id, ...profile })
      .onConflictDoUpdate({ target: tasteProfiles.userId, set: profile })
    await db.insert(tasteQuizAnswers).values({ userId: user.id, answers })

    const g = await syncGamification(user.id)
    return NextResponse.json({
      success: true,
      profile: { archetype: result.archetype, summary: result.summary, scores: result.scores },
      answered: result.answered,
      xp: g?.xp ?? null,
      newBadges: g?.newBadges ?? [],
    })
  } catch (err) {
    console.error('[api/taste-quiz] POST failed', err)
    return errors.server()
  }
}
