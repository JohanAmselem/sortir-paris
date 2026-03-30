import Link from 'next/link'
import { SearchBar } from '@/components/search/search-bar'

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        {/* Logo */}
        <Link href="/" className="flex-shrink-0 text-xl font-bold text-primary">
          Sortir
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          <Link href="/ce-soir" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
            Ce soir
          </Link>
          <Link href="/ce-week-end" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
            Ce week-end
          </Link>
          <Link href="/categories/concerts" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
            Concerts
          </Link>
          <Link href="/categories/expos" className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
            Expos
          </Link>
        </nav>

        {/* Search — desktop */}
        <SearchBar className="ml-auto hidden w-80 md:block" />

        {/* Auth */}
        <Link
          href="/login"
          className="flex-shrink-0 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
        >
          Connexion
        </Link>
      </div>
    </header>
  )
}
