// ═══════════════════════════════════════════════════════════
// 🎯 TASTE QUIZ — "Tu préfères" — Question Data
// ═══════════════════════════════════════════════════════════
// 40 questions couvrant 8 dimensions, organisées en 8 catégories

export interface QuizQuestion {
  id: string
  category: string
  categoryIcon: string
  optionA: { emoji: string; text: string; subtext?: string }
  optionB: { emoji: string; text: string; subtext?: string }
  /** Dimensions affected: 'a' pushes low, 'b' pushes high */
  dimensions: { dimension: string; weight: number }[]
}

export interface QuizCategory {
  id: string
  title: string
  icon: string
  subtitle: string
  color: string
}

export const QUIZ_CATEGORIES: QuizCategory[] = [
  { id: 'sortie', title: 'Tes sorties', icon: '🎭', subtitle: 'Quel type de sortie te fait vibrer ?', color: '#7C3AED' },
  { id: 'ambiance', title: 'Ton ambiance', icon: '✨', subtitle: 'Quelle énergie recherches-tu ?', color: '#E94560' },
  { id: 'decouverte', title: 'Ton rapport à la découverte', icon: '🧭', subtitle: 'Explorateur ou fidèle ?', color: '#10B981' },
  { id: 'social', title: 'Ta dimension sociale', icon: '👥', subtitle: 'Seul·e ou accompagné·e ?', color: '#F59E0B' },
  { id: 'budget', title: 'Ton budget', icon: '💸', subtitle: 'Free spirit ou all-in ?', color: '#22C55E' },
  { id: 'horaires', title: 'Tes horaires', icon: '🌙', subtitle: 'Lève-tôt ou couche-tard ?', color: '#6366F1' },
  { id: 'sensibilite', title: 'Ta sensibilité artistique', icon: '🎨', subtitle: 'Ton rapport à l\'art', color: '#EC4899' },
  { id: 'personnalite', title: 'Ta personnalité culturelle', icon: '🧠', subtitle: 'Ce qui te définit vraiment', color: '#F97316' },
]

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  // ═══════ CATÉGORIE 1: Tes sorties ═══════
  {
    id: 'q1',
    category: 'sortie',
    categoryIcon: '🎭',
    optionA: { emoji: '🎵', text: 'Un concert intimiste dans une cave', subtext: '30 personnes, artiste à 2 mètres' },
    optionB: { emoji: '🏟️', text: 'Un festival en plein air', subtext: '10 000 personnes, 3 scènes' },
    dimensions: [{ dimension: 'energy', weight: 1 }, { dimension: 'social', weight: 0.5 }],
  },
  {
    id: 'q2',
    category: 'sortie',
    categoryIcon: '🎭',
    optionA: { emoji: '🖼️', text: 'Flâner dans une expo photo', subtext: 'Prendre le temps de contempler' },
    optionB: { emoji: '🎪', text: 'Vivre une expérience immersive', subtext: 'Lumières, sons, sensations' },
    dimensions: [{ dimension: 'energy', weight: 0.5 }, { dimension: 'visual', weight: 1 }],
  },
  {
    id: 'q3',
    category: 'sortie',
    categoryIcon: '🎭',
    optionA: { emoji: '🎬', text: 'Un film d\'auteur en VO au MK2', subtext: 'Salle quasi vide, c\'est parfait' },
    optionB: { emoji: '🍿', text: 'L\'avant-première événement du moment', subtext: 'Tapis rouge et pop-corn' },
    dimensions: [{ dimension: 'mainstream', weight: 1 }, { dimension: 'social', weight: 0.5 }],
  },
  {
    id: 'q4',
    category: 'sortie',
    categoryIcon: '🎭',
    optionA: { emoji: '🎭', text: 'Une pièce expérimentale à La Colline', subtext: 'Tu ne sais pas trop ce qui t\'attend' },
    optionB: { emoji: '😂', text: 'Un one-man-show au Marais', subtext: 'Rire garanti, ambiance bon enfant' },
    dimensions: [{ dimension: 'exploration', weight: 1 }, { dimension: 'depth', weight: 0.5 }],
  },
  {
    id: 'q5',
    category: 'sortie',
    categoryIcon: '🎭',
    optionA: { emoji: '🏛️', text: 'La nouvelle expo au Palais de Tokyo', subtext: 'Art contemporain, tu adores ou détestes' },
    optionB: { emoji: '🎠', text: 'La Fête des Vendanges à Montmartre', subtext: 'Vin, folklore et bonne humeur' },
    dimensions: [{ dimension: 'depth', weight: 0.7 }, { dimension: 'mainstream', weight: 0.7 }],
  },

  // ═══════ CATÉGORIE 2: Ton ambiance ═══════
  {
    id: 'q6',
    category: 'ambiance',
    categoryIcon: '✨',
    optionA: { emoji: '🕯️', text: 'Ambiance tamisée, bougies, jazz', subtext: 'Le temps s\'arrête' },
    optionB: { emoji: '🔊', text: 'Lumières stroboscopiques, basses qui vibrent', subtext: 'Tu sens la musique dans ton corps' },
    dimensions: [{ dimension: 'energy', weight: 1 }],
  },
  {
    id: 'q7',
    category: 'ambiance',
    categoryIcon: '✨',
    optionA: { emoji: '🌿', text: 'Un jardin secret avec DJ set', subtext: 'Chill, verdure, cocktail maison' },
    optionB: { emoji: '🏗️', text: 'Un rooftop avec vue sur tout Paris', subtext: 'Instagrammable, trendy, bondé' },
    dimensions: [{ dimension: 'mainstream', weight: 0.7 }, { dimension: 'social', weight: 0.5 }],
  },
  {
    id: 'q8',
    category: 'ambiance',
    categoryIcon: '✨',
    optionA: { emoji: '📖', text: 'Lecture poétique dans une librairie', subtext: 'Silence, mots, émotion' },
    optionB: { emoji: '🎤', text: 'Slam/open mic dans un bar', subtext: 'Énergie brute, applaudissements' },
    dimensions: [{ dimension: 'energy', weight: 0.7 }, { dimension: 'depth', weight: 0.5 }],
  },
  {
    id: 'q9',
    category: 'ambiance',
    categoryIcon: '✨',
    optionA: { emoji: '🍵', text: 'Vernissage confidentiel avec l\'artiste', subtext: 'Tu es 1 sur 20 invités' },
    optionB: { emoji: '🥂', text: 'La soirée d\'ouverture que tout Paris attend', subtext: 'Foule, champagne, célébrités' },
    dimensions: [{ dimension: 'social', weight: 0.7 }, { dimension: 'mainstream', weight: 0.7 }],
  },
  {
    id: 'q10',
    category: 'ambiance',
    categoryIcon: '✨',
    optionA: { emoji: '🌧️', text: 'Spectacle sous la pluie, peu importe', subtext: 'L\'art n\'attend pas le beau temps' },
    optionB: { emoji: '☀️', text: 'Terrasse ensoleillée avec live music', subtext: 'Apéro + musique = bonheur simple' },
    dimensions: [{ dimension: 'exploration', weight: 0.5 }, { dimension: 'planning', weight: 0.5 }],
  },

  // ═══════ CATÉGORIE 3: Ton rapport à la découverte ═══════
  {
    id: 'q11',
    category: 'decouverte',
    categoryIcon: '🧭',
    optionA: { emoji: '🗺️', text: 'Un lieu dont tu n\'as jamais entendu parler', subtext: 'Dans une ruelle, porte cochère' },
    optionB: { emoji: '⭐', text: 'Un lieu mythique que tu adores', subtext: 'Tu y retournerais les yeux fermés' },
    dimensions: [{ dimension: 'exploration', weight: 1 }],
  },
  {
    id: 'q12',
    category: 'decouverte',
    categoryIcon: '🧭',
    optionA: { emoji: '🎲', text: 'Tirer au sort ta sortie du soir', subtext: 'Le hasard fait bien les choses' },
    optionB: { emoji: '📋', text: 'Avoir tout planifié une semaine avant', subtext: 'Billets, resto, trajet' },
    dimensions: [{ dimension: 'planning', weight: 1 }],
  },
  {
    id: 'q13',
    category: 'decouverte',
    categoryIcon: '🧭',
    optionA: { emoji: '🔮', text: 'Un artiste inconnu qui pourrait être génial', subtext: '...ou pas du tout' },
    optionB: { emoji: '👑', text: 'Une valeur sûre, tête d\'affiche', subtext: 'Tu sais que tu vas kiffer' },
    dimensions: [{ dimension: 'exploration', weight: 1 }, { dimension: 'mainstream', weight: 0.5 }],
  },
  {
    id: 'q14',
    category: 'decouverte',
    categoryIcon: '🧭',
    optionA: { emoji: '🚇', text: 'Traverser Paris pour un truc dingue', subtext: 'Métro, bus, marche, ça vaut le coup' },
    optionB: { emoji: '🏘️', text: 'Rester dans ton quartier', subtext: 'Tu connais les bonnes adresses' },
    dimensions: [{ dimension: 'exploration', weight: 0.7 }, { dimension: 'planning', weight: 0.5 }],
  },
  {
    id: 'q15',
    category: 'decouverte',
    categoryIcon: '🧭',
    optionA: { emoji: '📱', text: 'Suivre un compte obscur qui déniche des perles', subtext: 'Les vrais savent' },
    optionB: { emoji: '📰', text: 'Suivre les recommandations du Monde ou Télérama', subtext: 'Si c\'est noté, c\'est bien' },
    dimensions: [{ dimension: 'mainstream', weight: 1 }],
  },

  // ═══════ CATÉGORIE 4: Ta dimension sociale ═══════
  {
    id: 'q16',
    category: 'social',
    categoryIcon: '👥',
    optionA: { emoji: '🎧', text: 'Musée seul·e avec ton audioguide', subtext: 'Ta bulle, ton rythme' },
    optionB: { emoji: '🗣️', text: 'Visite guidée en groupe', subtext: 'Échanges, anecdotes, rencontres' },
    dimensions: [{ dimension: 'social', weight: 1 }],
  },
  {
    id: 'q17',
    category: 'social',
    categoryIcon: '👥',
    optionA: { emoji: '💑', text: 'Concert en duo, main dans la main', subtext: 'Moment intime à deux' },
    optionB: { emoji: '🎉', text: 'Soirée à 8 avec ta bande', subtext: 'Plus on est de fous...' },
    dimensions: [{ dimension: 'social', weight: 1 }, { dimension: 'energy', weight: 0.3 }],
  },
  {
    id: 'q18',
    category: 'social',
    categoryIcon: '👥',
    optionA: { emoji: '🤫', text: 'Garder tes bonnes adresses secrètes', subtext: 'C\'est TON spot' },
    optionB: { emoji: '📢', text: 'Partager direct sur Insta', subtext: '"Vous devez ABSOLUMENT y aller"' },
    dimensions: [{ dimension: 'social', weight: 0.5 }, { dimension: 'mainstream', weight: 0.5 }],
  },
  {
    id: 'q19',
    category: 'social',
    categoryIcon: '👥',
    optionA: { emoji: '🪑', text: 'Place assise numérotée, tranquille', subtext: 'Personne ne te bouscule' },
    optionB: { emoji: '🕺', text: 'Fosse debout, première rangée', subtext: 'L\'énergie du public autour de toi' },
    dimensions: [{ dimension: 'energy', weight: 0.7 }, { dimension: 'social', weight: 0.5 }],
  },
  {
    id: 'q20',
    category: 'social',
    categoryIcon: '👥',
    optionA: { emoji: '😌', text: 'Parler de l\'événement pendant des jours', subtext: 'Analyser, décortiquer, ressentir' },
    optionB: { emoji: '📸', text: 'En profiter à fond sur le moment', subtext: 'Vivre l\'instant, danser, kiffer' },
    dimensions: [{ dimension: 'depth', weight: 0.7 }, { dimension: 'energy', weight: 0.5 }],
  },

  // ═══════ CATÉGORIE 5: Ton budget ═══════
  {
    id: 'q21',
    category: 'budget',
    categoryIcon: '💸',
    optionA: { emoji: '🆓', text: 'Expo gratuite au musée de la Ville', subtext: 'La culture n\'a pas de prix' },
    optionB: { emoji: '💎', text: 'Spectacle à 80€ au Théâtre du Châtelet', subtext: 'On se fait plaisir, on mérite ça' },
    dimensions: [{ dimension: 'budget', weight: 1 }],
  },
  {
    id: 'q22',
    category: 'budget',
    categoryIcon: '💸',
    optionA: { emoji: '🎫', text: '3 petites sorties dans la semaine', subtext: 'Variété, pas de routine' },
    optionB: { emoji: '🌟', text: '1 grosse sortie exceptionnelle par mois', subtext: 'Tout miser sur un moment fort' },
    dimensions: [{ dimension: 'budget', weight: 0.7 }, { dimension: 'exploration', weight: 0.3 }],
  },
  {
    id: 'q23',
    category: 'budget',
    categoryIcon: '💸',
    optionA: { emoji: '🎒', text: 'Pique-nique maison + concert en plein air', subtext: 'DIY et débrouille' },
    optionB: { emoji: '🍷', text: 'Dîner-spectacle dans un lieu d\'exception', subtext: 'L\'expérience totale' },
    dimensions: [{ dimension: 'budget', weight: 1 }, { dimension: 'mainstream', weight: 0.3 }],
  },
  {
    id: 'q24',
    category: 'budget',
    categoryIcon: '💸',
    optionA: { emoji: '🕐', text: 'Faire la queue 2h pour un truc gratuit', subtext: 'Patience = récompense' },
    optionB: { emoji: '⚡', text: 'Payer plus pour un coupe-file', subtext: 'La vie est trop courte' },
    dimensions: [{ dimension: 'budget', weight: 0.7 }, { dimension: 'planning', weight: 0.5 }],
  },
  {
    id: 'q25',
    category: 'budget',
    categoryIcon: '💸',
    optionA: { emoji: '🎪', text: 'Festival off, scène émergente', subtext: 'Moins cher, plus authentique' },
    optionB: { emoji: '🎶', text: 'Festival mainstream, line-up de ouf', subtext: 'Le prix n\'est pas le sujet' },
    dimensions: [{ dimension: 'budget', weight: 0.5 }, { dimension: 'mainstream', weight: 1 }],
  },

  // ═══════ CATÉGORIE 6: Tes horaires ═══════
  {
    id: 'q26',
    category: 'horaires',
    categoryIcon: '🌙',
    optionA: { emoji: '☀️', text: 'Brunch + expo le dimanche matin', subtext: 'Frais, dispo, l\'esprit clair' },
    optionB: { emoji: '🌙', text: 'Vernissage + after le jeudi soir', subtext: 'La nuit porte conseil... et culture' },
    dimensions: [{ dimension: 'energy', weight: 0.5 }, { dimension: 'planning', weight: 0.5 }],
  },
  {
    id: 'q27',
    category: 'horaires',
    categoryIcon: '🌙',
    optionA: { emoji: '📅', text: 'Sortir en semaine quand c\'est calme', subtext: 'Mardi soir, la ville est à toi' },
    optionB: { emoji: '🎆', text: 'Le week-end quand tout est animé', subtext: 'Vendredi-samedi, la vraie vie' },
    dimensions: [{ dimension: 'social', weight: 0.5 }, { dimension: 'mainstream', weight: 0.5 }],
  },
  {
    id: 'q28',
    category: 'horaires',
    categoryIcon: '🌙',
    optionA: { emoji: '🌅', text: 'Séance de ciné à 14h', subtext: 'Salle vide, place au milieu' },
    optionB: { emoji: '🍸', text: 'Before + spectacle + after', subtext: 'Une soirée complète, rentrée à 3h' },
    dimensions: [{ dimension: 'energy', weight: 1 }, { dimension: 'planning', weight: 0.3 }],
  },
  {
    id: 'q29',
    category: 'horaires',
    categoryIcon: '🌙',
    optionA: { emoji: '⏰', text: 'La Nuit Blanche, arpenter Paris jusqu\'à l\'aube', subtext: 'Nuit entière dédiée à l\'art' },
    optionB: { emoji: '🛋️', text: 'Journées du patrimoine le dimanche', subtext: 'Découvrir des lieux secrets en journée' },
    dimensions: [{ dimension: 'energy', weight: 0.7 }, { dimension: 'exploration', weight: 0.5 }],
  },
  {
    id: 'q30',
    category: 'horaires',
    categoryIcon: '🌙',
    optionA: { emoji: '⚡', text: 'Décider à 19h ce qu\'on fait à 20h', subtext: 'L\'instant, l\'impulsion' },
    optionB: { emoji: '📆', text: 'Réserver 3 semaines à l\'avance', subtext: 'Les meilleures places, zéro stress' },
    dimensions: [{ dimension: 'planning', weight: 1 }],
  },

  // ═══════ CATÉGORIE 7: Ta sensibilité artistique ═══════
  {
    id: 'q31',
    category: 'sensibilite',
    categoryIcon: '🎨',
    optionA: { emoji: '🎻', text: 'Musique classique à la Philharmonie', subtext: 'Frissons, silence, standing ovation' },
    optionB: { emoji: '🎹', text: 'Set électro expérimental à La Station', subtext: 'Fréquences, beats, transe' },
    dimensions: [{ dimension: 'mainstream', weight: 0.5 }, { dimension: 'exploration', weight: 0.7 }],
  },
  {
    id: 'q32',
    category: 'sensibilite',
    categoryIcon: '🎨',
    optionA: { emoji: '🏛️', text: 'L\'art doit te faire réfléchir', subtext: 'Questionner, déranger, provoquer' },
    optionB: { emoji: '😍', text: 'L\'art doit te faire ressentir', subtext: 'Beauté, émotion, émerveillement' },
    dimensions: [{ dimension: 'depth', weight: 1 }],
  },
  {
    id: 'q33',
    category: 'sensibilite',
    categoryIcon: '🎨',
    optionA: { emoji: '📷', text: 'Photo noir & blanc, minimaliste', subtext: 'Moins c\'est plus' },
    optionB: { emoji: '🌈', text: 'Installation monumentale et colorée', subtext: 'Le wow effect, tu adores' },
    dimensions: [{ dimension: 'visual', weight: 1 }, { dimension: 'energy', weight: 0.3 }],
  },
  {
    id: 'q34',
    category: 'sensibilite',
    categoryIcon: '🎨',
    optionA: { emoji: '📚', text: 'Lire le cartel avant de regarder l\'œuvre', subtext: 'Contexte, intention, technique' },
    optionB: { emoji: '👁️', text: 'Se laisser porter sans explication', subtext: 'L\'œuvre parle d\'elle-même' },
    dimensions: [{ dimension: 'depth', weight: 0.7 }, { dimension: 'planning', weight: 0.3 }],
  },
  {
    id: 'q35',
    category: 'sensibilite',
    categoryIcon: '🎨',
    optionA: { emoji: '🎥', text: 'Documentaire engagé sur un sujet fort', subtext: 'Apprendre, comprendre le monde' },
    optionB: { emoji: '🎭', text: 'Spectacle de danse contemporaine', subtext: 'Le corps comme langage' },
    dimensions: [{ dimension: 'visual', weight: 0.7 }, { dimension: 'depth', weight: 0.5 }],
  },

  // ═══════ CATÉGORIE 8: Ta personnalité culturelle ═══════
  {
    id: 'q36',
    category: 'personnalite',
    categoryIcon: '🧠',
    optionA: { emoji: '🔥', text: 'Être dans les premiers à découvrir un lieu', subtext: 'Avant que ce soit sur TikTok' },
    optionB: { emoji: '✅', text: 'Y aller quand les avis sont unanimes', subtext: 'Fiable, testé, approuvé' },
    dimensions: [{ dimension: 'exploration', weight: 1 }, { dimension: 'mainstream', weight: 0.5 }],
  },
  {
    id: 'q37',
    category: 'personnalite',
    categoryIcon: '🧠',
    optionA: { emoji: '🎯', text: 'Approfondir un style que tu adores', subtext: 'Devenir expert jazz, théâtre, photo...' },
    optionB: { emoji: '🌀', text: 'Toucher à tout, ne rien s\'interdire', subtext: 'Opéra lundi, street art mardi' },
    dimensions: [{ dimension: 'exploration', weight: 0.7 }, { dimension: 'depth', weight: 0.5 }],
  },
  {
    id: 'q38',
    category: 'personnalite',
    categoryIcon: '🧠',
    optionA: { emoji: '🧘', text: 'L\'art comme refuge du quotidien', subtext: 'Se ressourcer, s\'évader' },
    optionB: { emoji: '💥', text: 'L\'art comme adrénaline', subtext: 'Surprises, sensations fortes, énergie' },
    dimensions: [{ dimension: 'energy', weight: 0.7 }, { dimension: 'depth', weight: 0.5 }],
  },
  {
    id: 'q39',
    category: 'personnalite',
    categoryIcon: '🧠',
    optionA: { emoji: '🌍', text: 'Privilégier les artistes locaux / émergents', subtext: 'Soutenir la scène parisienne' },
    optionB: { emoji: '✈️', text: 'Courir voir les stars internationales', subtext: 'Beyoncé, Banksy, Robert Wilson' },
    dimensions: [{ dimension: 'mainstream', weight: 1 }, { dimension: 'budget', weight: 0.3 }],
  },
  {
    id: 'q40',
    category: 'personnalite',
    categoryIcon: '🧠',
    optionA: { emoji: '🤔', text: 'Repartir avec plus de questions que de réponses', subtext: 'Le doute est un signe de qualité' },
    optionB: { emoji: '😊', text: 'Repartir le sourire aux lèvres', subtext: 'Moment de bonheur pur et simple' },
    dimensions: [{ dimension: 'depth', weight: 1 }],
  },
]

// ═══════ Archetype definitions ═══════

export interface Archetype {
  slug: string
  name: string
  emoji: string
  tagline: string
  description: string
  color: string
  traits: string[]
  recommendations: string[]
}

export const ARCHETYPES: Record<string, Archetype> = {
  'explorateur-nocturne': {
    slug: 'explorateur-nocturne',
    name: 'Explorateur nocturne',
    emoji: '🦉',
    tagline: 'La nuit est ton terrain de jeu',
    description: 'Tu vis pour les découvertes après minuit. Vernissages secrets, concerts dans des lieux improbables, afters culturels — tu es toujours là où personne ne t\'attend.',
    color: '#7C3AED',
    traits: ['Aventurier·ère', 'Noctambule', 'Curieux·se', 'Impulsif·ve'],
    recommendations: ['Concerts en cave', 'Nuit Blanche', 'Soirées vernissage', 'Clubbing culturel'],
  },
  'esthete-confidentiel': {
    slug: 'esthete-confidentiel',
    name: 'Esthète confidentiel',
    emoji: '🎩',
    tagline: 'Tu cultives le rare et le beau',
    description: 'Tu préfères la perle cachée au blockbuster. Galeries intimistes, performances avant-garde, lieux que seuls les initiés connaissent — ton Instagram est un cabinet de curiosités.',
    color: '#E94560',
    traits: ['Exigeant·e', 'Raffiné·e', 'Underground', 'Sélectif·ve'],
    recommendations: ['Galeries émergentes', 'Théâtre expérimental', 'Art contemporain', 'Photographie'],
  },
  'epicurien-social': {
    slug: 'epicurien-social',
    name: 'Épicurien social',
    emoji: '🥂',
    tagline: 'La culture se partage et se savoure',
    description: 'Pour toi, une sortie réussie c\'est un bon spectacle + un bon dîner + une bonne bande. Tu aimes les grands événements, les lieux tendance et les moments mémorables en groupe.',
    color: '#F59E0B',
    traits: ['Sociable', 'Généreux·se', 'Festif·ve', 'Bon vivant·e'],
    recommendations: ['Festivals populaires', 'Comédies musicales', 'Dîners-spectacles', 'Grands concerts'],
  },
  'flaneur-curieux': {
    slug: 'flaneur-curieux',
    name: 'Flâneur curieux',
    emoji: '🚶',
    tagline: 'Tu laisses Paris te surprendre',
    description: 'Pas de plan, pas de pression. Tu te promènes et tu t\'arrêtes quand quelque chose attire ton œil. Une expo gratuite, un musicien de rue, un marché vintage — tu vis au rythme de la ville.',
    color: '#10B981',
    traits: ['Zen', 'Ouvert·e', 'Spontané·e', 'Contemplatif·ve'],
    recommendations: ['Expos gratuites', 'Balades culturelles', 'Marchés artisanaux', 'Street art'],
  },
  'fetard-culturel': {
    slug: 'fetard-culturel',
    name: 'Fêtard culturel',
    emoji: '🎉',
    tagline: 'Quand la fête rencontre l\'art',
    description: 'Tu danses au musée, tu chantes au théâtre. Pour toi, la culture est une énergie collective. Tu es toujours le premier informé des événements et le dernier à partir.',
    color: '#EC4899',
    traits: ['Énergique', 'Enthousiaste', 'Social·e', 'Passionné·e'],
    recommendations: ['Soirées musée', 'Festivals urbains', 'Concerts live', 'Événements participatifs'],
  },
  'intellectuel-engage': {
    slug: 'intellectuel-engage',
    name: 'Intellectuel engagé',
    emoji: '📖',
    tagline: 'L\'art est une arme de réflexion massive',
    description: 'Tu cherches le sens derrière l\'œuvre. Conférences, documentaires engagés, théâtre politique — tu veux que la culture te fasse réfléchir et t\'ouvre les yeux sur le monde.',
    color: '#6366F1',
    traits: ['Analytique', 'Engagé·e', 'Profond·e', 'Critique'],
    recommendations: ['Théâtre politique', 'Documentaires', 'Conférences', 'Débats culturels'],
  },
  'romantique-parisien': {
    slug: 'romantique-parisien',
    name: 'Romantique parisien',
    emoji: '🌹',
    tagline: 'Paris est ton poème',
    description: 'Concerts aux chandelles, promenades sur les quais, expositions le dimanche en amoureux. Tu vis Paris comme un film et chaque sortie est un moment de grâce.',
    color: '#F43F5E',
    traits: ['Sensible', 'Contemplatif·ve', 'Élégant·e', 'Rêveur·se'],
    recommendations: ['Concerts classiques', 'Jardins de musées', 'Cinéma d\'auteur', 'Ballets'],
  },
  'aventurier-creatif': {
    slug: 'aventurier-creatif',
    name: 'Aventurier créatif',
    emoji: '🎨',
    tagline: 'Tu crées ta propre carte culturelle',
    description: 'Tu ne suis aucune tendance, tu les crées. Ateliers de création, performances interactives, lieux éphémères — tu es acteur de ta culture, jamais simple spectateur.',
    color: '#F97316',
    traits: ['Créatif·ve', 'Indépendant·e', 'Visionnaire', 'Audacieux·se'],
    recommendations: ['Ateliers créatifs', 'Lieux éphémères', 'Art interactif', 'Résidences d\'artistes'],
  },
}

// ═══════ Dimension labels ═══════

export const DIMENSION_LABELS: Record<string, { low: string; high: string; label: string; icon: string }> = {
  exploration: { low: 'Valeurs sûres', high: 'Aventurier·ère', label: 'Découverte', icon: '🧭' },
  energy: { low: 'Contemplatif·ve', high: 'Festif·ve', label: 'Énergie', icon: '⚡' },
  social: { low: 'Solo', high: 'En bande', label: 'Social', icon: '👥' },
  budget: { low: 'Free spirit', high: 'All-in', label: 'Budget', icon: '💸' },
  planning: { low: 'Spontané·e', high: 'Organisé·e', label: 'Planning', icon: '📅' },
  mainstream: { low: 'Underground', high: 'Populaire', label: 'Mainstream', icon: '📡' },
  visual: { low: 'Sonore', high: 'Visuel·le', label: 'Sens', icon: '👁️' },
  depth: { low: 'Léger', high: 'Intellectuel·le', label: 'Profondeur', icon: '🧠' },
}
