import { LegalFacts, LegalText } from '@/components/legal/LegalLayout'
import { pageScopeAnchor, pageScopeEntriesOf, pageScopeRows, type PageScopeArea } from '@/lib/page-scope'

const GROUPS: Array<{ area: PageScopeArea; title: string; intro: string }> = [
  {
    area: 'member',
    title: 'Pages d’un joueur',
    intro: 'Le profil d’un joueur (/members/…) : ses parties suivies par le site, avec ou sans coéquipier de son clan selon la page.',
  },
  {
    area: 'clan',
    title: 'Pages d’un clan',
    intro: 'Les pages d’un clan (/clans/…) : les parties de ses membres actifs ; un ancien membre n’y compte plus.',
  },
]

/**
 * Section « Pages d'un joueur, pages d'un clan » de la Méthodologie (docs/TODO/aide-des-pages.md, D7) : générée par le
 * registre `src/lib/page-scope.ts`, comme la barre « D'où viennent ces chiffres ? » de chaque page, qui renvoie à
 * l'ancre de sa page ici. Textes généraux, sans filtre ni date : les dates réelles sont dans la barre de la page.
 */
export default function PageScopeMethodology() {
  return (
    <>
      <LegalText>
        Chaque page d’un joueur ou d’un clan a, tout en bas, une barre « D’où viennent ces chiffres ? » : la période et
        les parties qu’elle compte d’après ses filtres, et depuis quand le site a les données. Voici ce que compte chaque
        page.
      </LegalText>
      {GROUPS.map((group) => (
        <div key={group.area} className="flex flex-col gap-3">
          <h3 className="t-card-title m-0">{group.title}</h3>
          <LegalText muted>{group.intro}</LegalText>
          {pageScopeEntriesOf(group.area).map((entry) => (
            <section key={entry.slug} id={pageScopeAnchor(entry)} aria-labelledby={`${pageScopeAnchor(entry)}-title`} className="flex scroll-mt-24 flex-col gap-1.5">
              <h4 id={`${pageScopeAnchor(entry)}-title`} className="t-body t-strong m-0 text-gray-900">
                {entry.title}
              </h4>
              <LegalFacts
                rows={pageScopeRows(entry).map((row) => ({
                  label: row.label,
                  value: row.items ? [row.text, ...row.items].filter(Boolean).join(' ') : (row.text ?? ''),
                }))}
              />
            </section>
          ))}
        </div>
      ))}
    </>
  )
}
