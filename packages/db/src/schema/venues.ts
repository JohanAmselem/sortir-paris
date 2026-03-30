import {
  pgTable,
  uuid,
  text,
  doublePrecision,
  timestamp,
  index,
} from 'drizzle-orm/pg-core'

export const venues = pgTable(
  'venues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').unique().notNull(),
    address: text('address'),
    city: text('city').default('Paris').notNull(),
    zipCode: text('zip_code'),
    arrondissement: text('arrondissement'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    website: text('website'),
    imageUrl: text('image_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_venues_slug').on(table.slug),
    index('idx_venues_arrondissement').on(table.arrondissement),
  ]
)
