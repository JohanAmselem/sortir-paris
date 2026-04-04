/**
 * Auto-generate rich keywords/tags from event data.
 * Used by both the tag generation script and the Meilisearch sync.
 */

// ─── Comprehensive French cultural keyword dictionary ───

const GENRE_MUSIC: Record<string, string[]> = {
  jazz: ['jazz', 'swing', 'bebop', 'bossa', 'manouche', 'free jazz', 'big band', 'blue note', 'improvisation jazz'],
  rock: ['rock', 'indie', 'garage', 'grunge', 'punk rock', 'rock alternatif', 'post-rock', 'stoner'],
  pop: ['pop', 'synth-pop', 'indie pop', 'electro-pop', 'dream pop', 'k-pop'],
  electro: ['electro', 'techno', 'house', 'deep house', 'drum and bass', 'dnb', 'trance', 'ambient', 'downtempo', 'dubstep', 'minimal', 'acid', 'idm'],
  'hip-hop': ['hip-hop', 'hip hop', 'rap', 'trap', 'drill', 'boom bap', 'freestyle', 'slam', 'spoken word'],
  classique: ['classique', 'orchestre', 'symphonique', 'symphonie', 'chambre', 'quatuor', 'trio', 'sonate', 'concerto', 'baroque', 'romantique', 'opera', 'opéra', 'lyrique', 'choeur', 'chorale'],
  metal: ['metal', 'heavy metal', 'death metal', 'black metal', 'doom', 'hardcore', 'metalcore', 'prog metal'],
  soul: ['soul', 'funk', 'r&b', 'rnb', 'neo-soul', 'motown', 'disco', 'groove'],
  reggae: ['reggae', 'dub', 'dancehall', 'ska', 'ragga'],
  blues: ['blues', 'delta blues', 'chicago blues'],
  folk: ['folk', 'acoustique', 'singer-songwriter', 'country', 'bluegrass', 'americana'],
  chanson: ['chanson', 'chanson française', 'variété', 'francophone', 'auteur-compositeur'],
  world: ['world', 'musique du monde', 'afrobeat', 'afro', 'salsa', 'cumbia', 'fado', 'flamenco', 'oriental', 'gnawa', 'mbalax', 'zouk', 'kompa', 'rumba', 'latin', 'cubain', 'brésilien'],
  gospel: ['gospel', 'spiritual', 'chant sacré'],
}

const GENRE_ART: Record<string, string[]> = {
  contemporain: ['art contemporain', 'contemporain', 'installation', 'art numérique', 'art digital', 'new media', 'performance'],
  moderne: ['art moderne', 'moderne', 'avant-garde', 'modernisme'],
  classique: ['art classique', 'beaux-arts', 'renaissance', 'néo-classique'],
  photo: ['photographie', 'photo', 'photographe', 'tirage', 'argentique', 'numérique'],
  peinture: ['peinture', 'tableau', 'toile', 'huile', 'aquarelle', 'acrylique', 'gouache'],
  sculpture: ['sculpture', 'sculpteur', 'modelage', 'bronze', 'marbre', 'céramique'],
  dessin: ['dessin', 'illustration', 'gravure', 'estampe', 'lithographie', 'sérigraphie'],
  'street-art': ['street art', 'graffiti', 'tag', 'fresque', 'mural', 'urbain'],
  impressionnisme: ['impressionnisme', 'impressionniste', 'monet', 'renoir', 'degas'],
  'art-deco': ['art déco', 'art nouveau'],
  video: ['vidéo', 'video art', 'court-métrage', 'documentaire', 'cinéma expérimental'],
}

const GENRE_THEATRE: Record<string, string[]> = {
  comedie: ['comédie', 'comique', 'humour', 'drôle', 'rire', 'hilarant', 'burlesque', 'vaudeville', 'farce'],
  drame: ['drame', 'dramatique', 'tragédie', 'tragique', 'shakespearien'],
  impro: ['improvisation', 'impro', 'match impro', 'théâtre impro'],
  'stand-up': ['stand-up', 'stand up', 'one man show', 'one woman show', 'seul en scène', 'solo', 'sketch'],
  marionnettes: ['marionnettes', 'marionnette', 'guignol', 'castelet', 'théâtre d\'ombres'],
  jeune: ['jeune public', 'enfants', 'familial', 'tout-petits', 'conte', 'conteur', 'conteuse'],
  musical: ['comédie musicale', 'musical', 'opérette', 'cabaret'],
  classique: ['molière', 'racine', 'corneille', 'classique', 'répertoire'],
}

const GENRE_DANSE: Record<string, string[]> = {
  contemporaine: ['danse contemporaine', 'contemporaine', 'modern dance'],
  classique: ['ballet', 'danse classique', 'pointes', 'tutu'],
  'hip-hop': ['hip-hop', 'breakdance', 'break', 'bboy', 'krump', 'popping', 'locking', 'voguing'],
  sociale: ['salsa', 'tango', 'bachata', 'kizomba', 'swing', 'lindy hop', 'rock acrobatique'],
  traditionnelle: ['flamenco', 'danse orientale', 'bollywood', 'danse africaine', 'capoeira'],
  moderne: ['danse moderne', 'modern jazz', 'jazz dance', 'lyrical'],
}

const AMBIANCE_KEYWORDS: Record<string, string[]> = {
  romantique: ['romantique', 'amoureux', 'couple', 'saint-valentin', 'tendre', 'intime'],
  festif: ['festif', 'fête', 'party', 'soirée', 'dansant', 'clubbing', 'nuit', 'nocturne', 'after'],
  chill: ['chill', 'détente', 'relaxant', 'zen', 'calme', 'apaisant', 'lounge'],
  familial: ['famille', 'enfants', 'kids', 'jeune public', 'tout public', 'ludique', 'jeux', 'animation'],
  underground: ['underground', 'alternatif', 'off', 'indé', 'indépendant', 'squat', 'friche'],
  chic: ['chic', 'élégant', 'gastronomie', 'vin', 'champagne', 'prestige', 'luxe'],
  culturel: ['culturel', 'intellectuel', 'littéraire', 'philosophie', 'débat', 'conférence'],
  sportif: ['sportif', 'sport', 'fitness', 'yoga', 'running', 'course', 'vélo', 'escalade'],
  pleinair: ['plein air', 'extérieur', 'jardin', 'parc', 'terrasse', 'rooftop', 'balade', 'promenade'],
  immersif: ['immersif', 'immersion', 'expérience', 'interactif', 'participatif', 'escape game', 'réalité virtuelle', 'VR'],
}

const VENUE_TYPE_KEYWORDS: Record<string, string[]> = {
  musee: ['musée', 'museum', 'galerie', 'fondation'],
  salle: ['salle', 'auditorium', 'amphithéâtre', 'arena', 'zénith', 'olympia', 'philharmonie'],
  theatre: ['théâtre', 'opéra'],
  bar: ['bar', 'café', 'bistrot', 'pub', 'brasserie'],
  club: ['club', 'boîte', 'discothèque', 'cabaret'],
  pleinair: ['parc', 'jardin', 'place', 'quai', 'berges', 'canal', 'esplanade', 'parvis'],
  cinema: ['cinéma', 'ciné', 'salle de projection'],
  bibliotheque: ['bibliothèque', 'médiathèque', 'librairie'],
  eglise: ['église', 'cathédrale', 'chapelle', 'temple', 'basilique'],
}

// French stop words to exclude
const STOP_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux', 'ce', 'ces', 'mon', 'ton', 'son',
  'ma', 'ta', 'sa', 'mes', 'tes', 'ses', 'notre', 'votre', 'leur', 'nos', 'vos', 'leurs',
  'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'on', 'qui', 'que', 'quoi', 'dont',
  'et', 'ou', 'mais', 'donc', 'car', 'ni', 'ne', 'pas', 'plus', 'moins', 'très', 'bien', 'mal',
  'est', 'sont', 'a', 'ont', 'fait', 'faire', 'dit', 'dire', 'peut', 'pour', 'par', 'sur', 'sous',
  'avec', 'sans', 'dans', 'entre', 'chez', 'vers', 'pendant', 'après', 'avant', 'depuis', 'jusqu',
  'cette', 'cet', 'tout', 'tous', 'toute', 'toutes', 'autre', 'autres', 'même', 'aussi',
  'encore', 'déjà', 'ici', 'là', 'où', 'quand', 'comment', 'pourquoi', 'combien',
  'être', 'avoir', 'aller', 'pouvoir', 'vouloir', 'devoir', 'falloir', 'savoir',
  'the', 'and', 'or', 'in', 'of', 'to', 'at', 'by', 'for', 'with', 'from', 'is', 'are', 'was',
  'paris', 'france', 'événement', 'event', 'http', 'https', 'www', 'com',
])

/**
 * Extract rich keywords from event data
 */
export function extractKeywords(event: {
  title: string
  description?: string | null
  shortDesc?: string | null
  categorySlug?: string | null
  categoryName?: string | null
  venueName?: string | null
  venueAddress?: string | null
}): string[] {
  const keywords = new Set<string>()
  const text = `${event.title} ${event.shortDesc ?? ''} ${event.description ?? ''}`.toLowerCase()
  const fullText = `${text} ${event.categoryName ?? ''} ${event.venueName ?? ''}`.toLowerCase()

  // 1. Extract genre-specific keywords based on content
  const allGenres = [
    ...Object.entries(GENRE_MUSIC),
    ...Object.entries(GENRE_ART),
    ...Object.entries(GENRE_THEATRE),
    ...Object.entries(GENRE_DANSE),
  ]

  for (const [genre, terms] of allGenres) {
    for (const term of terms) {
      if (fullText.includes(term.toLowerCase())) {
        keywords.add(genre)
        keywords.add(term)
        // Also add all related terms for the matching genre
        for (const relatedTerm of terms) {
          if (relatedTerm.length >= 3) {
            keywords.add(relatedTerm)
          }
        }
        break // found match in this genre group
      }
    }
  }

  // 2. Extract ambiance keywords
  for (const [ambiance, terms] of Object.entries(AMBIANCE_KEYWORDS)) {
    for (const term of terms) {
      if (fullText.includes(term.toLowerCase())) {
        keywords.add(ambiance)
        // Add all related ambiance terms
        for (const relatedTerm of terms) {
          keywords.add(relatedTerm)
        }
        break
      }
    }
  }

  // 3. Venue type keywords
  const venueText = `${event.venueName ?? ''} ${event.venueAddress ?? ''}`.toLowerCase()
  for (const [venueType, terms] of Object.entries(VENUE_TYPE_KEYWORDS)) {
    for (const term of terms) {
      if (venueText.includes(term.toLowerCase())) {
        keywords.add(venueType)
        for (const relatedTerm of terms) {
          keywords.add(relatedTerm)
        }
        break
      }
    }
  }

  // 4. Category-based enrichment
  if (event.categorySlug) {
    keywords.add(event.categorySlug)
    // Add category-specific common search terms
    const categoryEnrichment: Record<string, string[]> = {
      concerts: ['concert', 'musique', 'live', 'scène', 'artiste', 'musicien', 'groupe', 'chanteur', 'chanteuse', 'sortie musicale'],
      expos: ['exposition', 'expo', 'art', 'artiste', 'oeuvre', 'vernissage', 'galerie', 'musée', 'visite culturelle'],
      theatre: ['théâtre', 'pièce', 'spectacle', 'acteur', 'actrice', 'mise en scène', 'metteur en scène', 'représentation'],
      cinema: ['cinéma', 'film', 'projection', 'réalisateur', 'séance', 'salle obscure', 'ciné'],
      festivals: ['festival', 'programmation', 'lineup', 'affiche', 'journée', 'scène', 'plein air'],
      conferences: ['conférence', 'débat', 'rencontre', 'discussion', 'intervenant', 'table ronde', 'masterclass'],
      danse: ['danse', 'chorégraphie', 'chorégraphe', 'danseur', 'danseuse', 'mouvement', 'corps', 'ballet'],
      spectacles: ['spectacle', 'scène', 'artiste', 'performance', 'représentation', 'show'],
      ateliers: ['atelier', 'workshop', 'cours', 'stage', 'formation', 'apprendre', 'créatif', 'pratique', 'DIY'],
      visites: ['visite', 'guidée', 'balade', 'parcours', 'patrimoine', 'histoire', 'architecture', 'découverte', 'promenade'],
      sport: ['sport', 'activité physique', 'entraînement', 'exercice', 'bien-être', 'santé'],
    }
    const enrichment = categoryEnrichment[event.categorySlug]
    if (enrichment) {
      for (const term of enrichment) {
        keywords.add(term)
      }
    }
  }

  // 5. Extract significant words from title (longer than 3 chars, not stop words)
  const titleWords = event.title.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents for matching
    .replace(/[^a-z0-9àâäéèêëïîôùûüÿç\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w))

  for (const word of titleWords) {
    keywords.add(word)
  }

  // 6. Add specific artist/event names from title (capitalized words)
  const artistMatch = event.title.match(/[A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+)*/g)
  if (artistMatch) {
    for (const name of artistMatch) {
      if (name.length > 2 && !['Ce', 'Le', 'La', 'Les', 'Un', 'Une', 'Des', 'Du', 'Au'].includes(name)) {
        keywords.add(name.toLowerCase())
      }
    }
  }

  // 7. Price-related keywords
  if (event.shortDesc?.toLowerCase().includes('gratuit') || text.includes('gratuit') || text.includes('entrée libre')) {
    keywords.add('gratuit')
    keywords.add('entrée libre')
    keywords.add('free')
    keywords.add('bon plan')
    keywords.add('sortie gratuite')
  }

  // 8. Time-related keywords from description
  if (text.includes('nocturne') || text.includes('nuit')) {
    keywords.add('nocturne')
    keywords.add('soirée')
    keywords.add('nuit')
  }
  if (text.includes('brunch') || text.includes('matin')) {
    keywords.add('brunch')
    keywords.add('matinée')
    keywords.add('matin')
  }

  // Remove empty strings and very short terms
  return Array.from(keywords).filter(k => k.length >= 2).sort()
}

/**
 * Generate a flat searchable string from keywords (for Meilisearch)
 */
export function keywordsToSearchString(keywords: string[]): string {
  return keywords.join(' ')
}

/**
 * Get tag candidates (for the PostgreSQL tags table)
 * Returns a deduplicated list of clean tag names
 */
export function getTagCandidates(event: {
  title: string
  description?: string | null
  shortDesc?: string | null
  categorySlug?: string | null
  categoryName?: string | null
  venueName?: string | null
  venueAddress?: string | null
}): string[] {
  const keywords = extractKeywords(event)

  // Filter to only meaningful tags (not too generic, not too specific)
  return keywords.filter(k => {
    // Exclude single words that are too generic
    const generic = ['sortie', 'visite', 'art', 'show', 'live', 'scène', 'nuit', 'matin', 'free']
    if (generic.includes(k)) return false
    // Keep compound terms and specific genres
    return k.length >= 3
  }).slice(0, 30) // Max 30 tags per event
}
