import {
  pgTable,
  uuid,
  text,
  doublePrecision,
  smallint,
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
    normalizedName: text('normalized_name'),
    geocodeStatus: text('geocode_status', { enum: ['pending', 'ok', 'failed', 'manual'] })
      .default('pending')
      .notNull(),
    geocodeAttempts: smallint('geocode_attempts').default(0).notNull(),
    canonicalVenueId: uuid('canonical_venue_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_venues_arrondissement').on(table.arrondissement)]
)
