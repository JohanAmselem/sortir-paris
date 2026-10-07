import 'server-only'
import sanitizeHtml from 'sanitize-html'

/** Article HTML (AI-generated from scraped text): strict allow-list, https links only. */
export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['h2', 'h3', 'p', 'strong', 'em', 'blockquote', 'ul', 'ol', 'li', 'a', 'br'],
    allowedAttributes: { a: ['href', 'rel', 'target'] },
    allowedSchemes: ['https'],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href ?? '#'
        const out: sanitizeHtml.Attributes = { href }
        if (!href.startsWith('https://www.panameclub.fr')) {
          out.rel = 'noopener noreferrer nofollow'
          out.target = '_blank'
        }
        return { tagName, attribs: out }
      },
    },
  })
}
