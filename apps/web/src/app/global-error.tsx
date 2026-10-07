'use client'

/** Last-resort boundary (errors in the root layout). Must render <html>. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#f7f5ef', color: '#1c1730', padding: '15vh 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800 }}>Paname Club fait une pause</h1>
        <p style={{ marginTop: 12, fontSize: 16 }}>Le site rencontre un problème passager. Réessaie dans un instant.</p>
        <button type="button" onClick={reset} style={{ marginTop: 24, height: 48, padding: '0 24px', borderRadius: 999, border: 0, background: '#1c1730', color: '#f7f5ef', fontSize: 15, fontWeight: 600 }}>
          Réessayer
        </button>
      </body>
    </html>
  )
}
