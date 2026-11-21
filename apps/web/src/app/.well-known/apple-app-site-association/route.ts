import { NextResponse } from 'next/server'

/**
 * Liens universels iOS : les liens panameclub.fr de ces pages s'ouvrent dans
 * l'appli quand elle est installée (sinon, le site s'ouvre normalement).
 * APPLE_TEAM_ID : équipe Apple de JUNO (542CN5886Z) ; IOS_BUNDLE_ID : fr.panameclub.app.
 */
export const dynamic = 'force-static'

export function GET() {
  const appId = `${process.env.APPLE_TEAM_ID || '542CN5886Z'}.${process.env.IOS_BUNDLE_ID || 'fr.panameclub.app'}`
  const paths = ['/evenements/*', '/lieux/*', '/oeuvres/*', '/films/*', '/drop', '/club', '/match', '/quiz', '/compte/artistes', '/ce-soir', '/carte']
  return NextResponse.json(
    {
      applinks: { details: [{ appIDs: [appId], components: paths.map((p) => ({ '/': p })) }] },
      webcredentials: { apps: [appId] },
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } }
  )
}
