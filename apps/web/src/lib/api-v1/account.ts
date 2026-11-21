/**
 * Suppression définitive d'un compte membre (appli et page /suppression-compte).
 * Une transaction :
 * 1. les compteurs publics des sorties (gardées, « J'y vais ») sont décomptés,
 *    comme le feraient les routes saves / attendance ;
 * 2. l'inscription newsletter (par e-mail, sans lien) est effacée ;
 * 3. la ligne `users` part, et avec elle, en cascade : sauvegardes, J'y vais,
 *    swipes, Drop, quiz, ADN, avis, suivis, alertes, appareils ;
 * 4. le compte de connexion Supabase (`auth.users`, identités et sessions).
 */
import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { db, events, newsletterSubscribers, userAttendances, userSaves, users } from '@sortir/db'

export async function deleteAccount(userId: string, email: string | null | undefined): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(events)
      .set({ saveCount: sql`greatest(${events.saveCount} - 1, 0)` })
      .where(sql`${events.id} in (select ${userSaves.eventId} from ${userSaves} where ${userSaves.userId} = ${userId})`)
    await tx
      .update(events)
      .set({ attendanceCount: sql`greatest(${events.attendanceCount} - 1, 0)` })
      .where(sql`${events.id} in (select ${userAttendances.eventId} from ${userAttendances} where ${userAttendances.userId} = ${userId})`)
    if (email) await tx.delete(newsletterSubscribers).where(sql`lower(${newsletterSubscribers.email}) = ${email.toLowerCase()}`)
    await tx.delete(users).where(eq(users.id, userId))
    await tx.execute(sql`delete from auth.users where id = ${userId}::uuid`)
  })
}
