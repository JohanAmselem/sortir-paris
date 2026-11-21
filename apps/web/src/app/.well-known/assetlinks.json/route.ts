import { NextResponse } from 'next/server'

/**
 * Liens d'appli Android : relie panameclub.fr à l'appli signée par Google Play.
 * ANDROID_SHA256_FINGERPRINTS : empreinte(s) SHA-256 du certificat de signature
 * de la Play Console (Intégrité de l'application), séparées par des virgules.
 * Sans variable, la liste est vide : les liens s'ouvrent dans le navigateur.
 */
export const dynamic = 'force-static'

export function GET() {
  const fingerprints = (process.env.ANDROID_SHA256_FINGERPRINTS || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s))
  const body = fingerprints.length
    ? [
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: { namespace: 'android_app', package_name: process.env.ANDROID_PACKAGE || 'fr.panameclub.app', sha256_cert_fingerprints: fingerprints },
        },
      ]
    : []
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
