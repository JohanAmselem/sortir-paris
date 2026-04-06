import { db, events, venues, categories, eventTags, tags, eventAmbiances, ambiances } from '@sortir/db'
import { eq, and, gte, desc, asc, sql, inArray, ilike, or } from 'drizzle-orm'

export interface Collection {
  slug: string
  title: string
  subtitle: string
  emoji: string
  gradient: string
  description: string
  query: () => Promise<Array<{
    event: typeof events.$inferSelect
    venue: typeof venues.$inferSelect | null
    category: typeof categories.$inferSelect | null
  }>>
}

const now = () => new Date()

export const COLLECTIONS: Collection[] = [
  {
    slug: 'expos-printemps',
    title: 'Les expos du moment',
    subtitle: 'Les expositions incontournables à Paris',
    emoji: '🖼️',
    gradient: 'from-amber-500/20 to-orange-500/20',
    description: 'Notre sélection des meilleures expositions à voir à Paris en ce moment. Art contemporain, photographie, peinture classique — il y en a pour tous les goûts.',
    query: async () => {
      const cat = await db.query.categories?.findFirst({ where: eq(categories.slug, 'expos') })
      if (!cat) return []
      return db
        .select({ event: events, venue: venues, category: categories })
        .from(events)
        .leftJoin(venues, eq(events.venueId, venues.id))
        .leftJoin(categories, eq(events.categoryId, categories.id))
        .where(and(eq(events.status, 'active'), eq(events.categoryId, cat.id), gte(events.startDate, now())))
        .orderBy(desc(events.qualityScore))
        .limit(24)
    },
  },
  {
    slug: 'sorties-gratuites',
    title: 'Bons plans gratuits',
    subtitle: 'Sorties culturelles à 0€',
    emoji: '🆓',
    gradient: 'from-emerald-500/20 to-teal-500/20',
    description: 'Pas besoin de casser sa tirelire pour profiter de Paris. Voici les meilleurs événements gratuits du moment.',
    query: async () => {
      return db
        .select({ event: events, venue: venues, category: categories })
        .from(events)
        .leftJoin(venues, eq(events.venueId, venues.id))
        .leftJoin(categories, eq(events.categoryId, categories.id))
        .where(and(eq(events.status, 'active'), eq(events.isFree, true), gte(events.startDate, now())))
        .orderBy(desc(events.qualityScore))
        .limit(24)
    },
  },
  {
    slug: 'concerts-jazz',
    title: 'Jazz à Paris',
    subtitle: 'Les meilleurs clubs et concerts jazz',
    emoji: '🎷',
    gradient: 'from-indigo-500/20 to-purple-500/20',
    description: 'Paris, capitale du jazz. Des caves historiques aux grandes salles, découvrez les concerts jazz à venir.',
    query: async () => {
      return db
        .select({ event: events, venue: venues, category: categories })
        .from(events)
        .leftJoin(venues, eq(events.venueId, venues.id))
        .leftJoin(categories, eq(events.categoryId, categories.id))
        .where(and(
          eq(events.status, 'active'),
          gte(events.startDate, now()),
          or(
            ilike(events.title, '%jazz%'),
            ilike(events.keywords, '%jazz%'),
          ),
        ))
        .orderBy(desc(events.qualityScore))
        .limit(24)
    },
  },
  {
    slug: 'theatre-comedie',
    title: 'Théâtre & Comédie',
    subtitle: 'Rire et émotions sur les planches',
    emoji: '🎭',
    gradient: 'from-red-500/20 to-pink-500/20',
    description: 'Comédies, drames, one-man-shows — les meilleurs spectacles vivants à Paris.',
    query: async () => {
      const cat = await db.query.categories?.findFirst({ where: eq(categories.slug, 'theatre') })
      const specCat = await db.query.categories?.findFirst({ where: eq(categories.slug, 'spectacles') })
      const catIds = [cat?.id, specCat?.id].filter(Boolean) as string[]
      if (catIds.length === 0) return []
      return db
        .select({ event: events, venue: venues, category: categories })
        .from(events)
        .leftJoin(venues, eq(events.venueId, venues.id))
        .leftJoin(categories, eq(events.categoryId, categories.id))
        .where(and(eq(events.status, 'active'), inArray(events.categoryId, catIds), gte(events.startDate, now())))
        .orderBy(desc(events.qualityScore))
        .limit(24)
    },
  },
  {
    slug: 'sorties-en-famille',
    title: 'Sorties en famille',
    subtitle: 'Activités pour petits et grands',
    emoji: '👨‍👩‍👧‍👦',
    gradient: 'from-sky-500/20 to-cyan-500/20',
    description: 'Ateliers créatifs, spectacles jeune public, visites ludiques — de quoi occuper toute la famille.',
    query: async () => {
      const atelierCat = await db.query.categories?.findFirst({ where: eq(categories.slug, 'ateliers') })
      const visiteCat = await db.query.categories?.findFirst({ where: eq(categories.slug, 'visites') })
      const catIds = [atelierCat?.id, visiteCat?.id].filter(Boolean) as string[]
      if (catIds.length === 0) return []
      return db
        .select({ event: events, venue: venues, category: categories })
        .from(events)
        .leftJoin(venues, eq(events.venueId, venues.id))
        .leftJoin(categories, eq(events.categoryId, categories.id))
        .where(and(
          eq(events.status, 'active'),
          gte(events.startDate, now()),
          or(
            inArray(events.categoryId, catIds),
            ilike(events.keywords, '%enfant%'),
            ilike(events.keywords, '%famille%'),
            ilike(events.title, '%enfant%'),
          ),
        ))
        .orderBy(desc(events.qualityScore))
        .limit(24)
    },
  },
  {
    slug: 'soirees-dansantes',
    title: 'On danse ce soir',
    subtitle: 'Soirées dansantes et clubs',
    emoji: '💃',
    gradient: 'from-fuchsia-500/20 to-violet-500/20',
    description: 'Salsa, électro, swing, afro — toutes les soirées dansantes à Paris.',
    query: async () => {
      const cat = await db.query.categories?.findFirst({ where: eq(categories.slug, 'danse') })
      return db
        .select({ event: events, venue: venues, category: categories })
        .from(events)
        .leftJoin(venues, eq(events.venueId, venues.id))
        .leftJoin(categories, eq(events.categoryId, categories.id))
        .where(and(
          eq(events.status, 'active'),
          gte(events.startDate, now()),
          or(
            cat ? eq(events.categoryId, cat.id) : sql`false`,
            ilike(events.keywords, '%danse%'),
            ilike(events.keywords, '%dj%'),
            ilike(events.title, '%dj%'),
          ),
        ))
        .orderBy(desc(events.qualityScore))
        .limit(24)
    },
  },
]

export function getCollection(slug: string): Collection | undefined {
  return COLLECTIONS.find((c) => c.slug === slug)
}
