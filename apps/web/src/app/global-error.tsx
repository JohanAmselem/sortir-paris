'use client'

/**
 * Dernier recours (erreur dans la mise en page racine). Doit rendre <html>,
 * sans la feuille de style du site : les couleurs reprennent les jetons
 * « Nuit » de globals.css (--color-paper, --color-ink).
 */
const PAPER = '#0c0b11'
const INK = '#f6f4f0'

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: PAPER, color: INK, padding: '15vh 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800 }}>Paname Club fait une pause</h1>
        <p style={{ marginTop: 12, fontSize: 16 }}>Le site rencontre un problème passager. Réessaie dans un instant.</p>
        <button type="button" onClick={reset} style={{ marginTop: 24, height: 48, padding: '0 24px', borderRadius: 999, border: 0, background: INK, color: PAPER, fontSize: 16, fontWeight: 700 }}>
          Réessayer
        </button>
      </body>
    </html>
  )
}
