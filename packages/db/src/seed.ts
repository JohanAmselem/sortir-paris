import { db, categories, ambiances, tags } from './index'

async function seed() {
  console.log('Seeding database...')

  // Categories
  await db
    .insert(categories)
    .values([
      { name: 'Concert', slug: 'concerts', icon: '🎵', color: '#7C3AED', position: 1 },
      { name: 'Exposition', slug: 'expos', icon: '🎨', color: '#2563EB', position: 2 },
      { name: 'Théâtre', slug: 'theatre', icon: '🎭', color: '#DC2626', position: 3 },
      { name: 'Cinéma', slug: 'cinema', icon: '🎬', color: '#059669', position: 4 },
      { name: 'Festival', slug: 'festivals', icon: '🎪', color: '#D97706', position: 5 },
      { name: 'Conférence', slug: 'conferences', icon: '🎤', color: '#4F46E5', position: 6 },
      { name: 'Danse', slug: 'danse', icon: '💃', color: '#EC4899', position: 7 },
      { name: 'Spectacle', slug: 'spectacles', icon: '🎪', color: '#F59E0B', position: 8 },
      { name: 'Atelier', slug: 'ateliers', icon: '🛠️', color: '#10B981', position: 9 },
      { name: 'Visite', slug: 'visites', icon: '🏛️', color: '#6366F1', position: 10 },
    ])
    .onConflictDoNothing()

  console.log('✓ Categories seeded')

  // Ambiances
  await db
    .insert(ambiances)
    .values([
      { name: 'Chill', slug: 'chill', emoji: '😌' },
      { name: 'Festif', slug: 'festif', emoji: '🎉' },
      { name: 'Intellectuel', slug: 'intellectuel', emoji: '🧠' },
      { name: 'Romantique', slug: 'romantique', emoji: '❤️' },
      { name: 'En famille', slug: 'en-famille', emoji: '👨‍👩‍👧' },
      { name: 'Entre amis', slug: 'entre-amis', emoji: '👫' },
      { name: 'Solo', slug: 'solo', emoji: '🎧' },
      { name: 'Insolite', slug: 'insolite', emoji: '🤯' },
      { name: 'Plein air', slug: 'plein-air', emoji: '☀️' },
    ])
    .onConflictDoNothing()

  console.log('✓ Ambiances seeded')

  // Tags (sample)
  await db
    .insert(tags)
    .values([
      { name: 'Hip-hop', slug: 'hip-hop' },
      { name: 'Électro', slug: 'electro' },
      { name: 'Jazz', slug: 'jazz' },
      { name: 'Classique', slug: 'classique' },
      { name: 'Rock', slug: 'rock' },
      { name: 'Art contemporain', slug: 'art-contemporain' },
      { name: 'Impressionnisme', slug: 'impressionnisme' },
      { name: 'Photo', slug: 'photo' },
      { name: 'Stand-up', slug: 'stand-up' },
      { name: 'Jeune public', slug: 'jeune-public' },
      { name: 'Gratuit', slug: 'gratuit' },
      { name: 'Nocturne', slug: 'nocturne' },
      { name: 'Street art', slug: 'street-art' },
      { name: 'Design', slug: 'design' },
      { name: 'Cinéma indépendant', slug: 'cinema-independant' },
    ])
    .onConflictDoNothing()

  console.log('✓ Tags seeded')
  console.log('Seed complete!')
  process.exit(0)
}

seed().catch((e) => {
  console.error('Seed failed:', e)
  process.exit(1)
})
