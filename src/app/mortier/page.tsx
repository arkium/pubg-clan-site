'use client'

import { BookOpen, Crosshair } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useRef, useState, type KeyboardEvent } from 'react'

import MortarGuide from '@/components/mortar/MortarGuide'
import MortarTraining from '@/components/mortar/MortarTraining'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { MORTAR_TARGETS_PER_SERIES, type MortarDifficulty } from '@/lib/mortar/mortar-game'

/**
 * Mortier — entraînement et guide (docs/features/mortier.md ; maquette « Mortier : entraînement et guide »). Onglet
 * dans l'URL (`?tab=guide`) ; l'entraînement reste monté une fois ouvert, pour qu'un passage par le guide ne perde pas
 * la série en cours. Charte UI : docs/ui/index.html.
 */

type MortarTab = 'training' | 'guide'

const TABS: Array<{ value: MortarTab; label: string; icon: typeof Crosshair }> = [
  { value: 'training', label: 'Entraînement', icon: Crosshair },
  { value: 'guide', label: 'Guide', icon: BookOpen },
]

function MortarContent() {
  const searchParams = useSearchParams()
  const tab: MortarTab = searchParams.get('tab') === 'guide' ? 'guide' : 'training'
  // `round` change à chaque série demandée : changement de difficulté (en cours de série aussi) et « Rejouer ».
  const [training, setTraining] = useState<{ difficulty: MortarDifficulty; round: number }>({ difficulty: 'medium', round: 0 })
  // L'entraînement n'est monté (et sa première série demandée) qu'à sa première ouverture.
  const [trainingOpened, setTrainingOpened] = useState(false)
  if (tab === 'training' && !trainingOpened) setTrainingOpened(true)

  const tabsRef = useRef<HTMLDivElement>(null)
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([])

  // Même mécanique que la période (usePagePeriod) : `window.history.replaceState`, suivi par `useSearchParams`, sans
  // rendu serveur ni nouveau montage de la page — un `router.replace` la recréerait et perdrait la série en cours.
  const setTab = useCallback((next: MortarTab) => {
    const params = new URLSearchParams(window.location.search)
    if (next === 'guide') params.set('tab', 'guide')
    else params.delete('tab')
    const query = params.toString()
    // `null`, pas `window.history.state` : un état marqué par Next.js (`__NA`) court-circuite la synchronisation du routeur.
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
  }, [])

  const changeDifficulty = useCallback((difficulty: MortarDifficulty) => {
    setTraining((current) => (current.difficulty === difficulty ? current : { difficulty, round: current.round + 1 }))
  }, [])

  const replay = useCallback(() => setTraining((current) => ({ ...current, round: current.round + 1 })), [])

  // « S'entraîner → » d'une fiche du guide : entraînement à la difficulté de la fiche, onglets ramenés à l'écran.
  const train = useCallback(
    (difficulty: MortarDifficulty) => {
      changeDifficulty(difficulty)
      setTab('training')
      if ((tabsRef.current?.getBoundingClientRect().top ?? 0) < 0) tabsRef.current?.scrollIntoView({ block: 'start' })
    },
    [changeDifficulty, setTab]
  )

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length
    setTab(TABS[nextIndex].value)
    tabButtons.current[nextIndex]?.focus()
  }

  return (
    // `.charte` : page à la charte UI (accent jaune, Teko, classes de rôle) ; `.game-ui` : jetons de jeu (--game-*).
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter">
        {/* Invisible : inscrit la page dans la pile du fil d'Ariane (retour depuis une page suivante). */}
        <NavigationTrail currentLabel="Mortier" currentHref={tab === 'guide' ? '/mortier?tab=guide' : '/mortier'} fallbackParent={null} hidden />

        {/* Hauteur standard des bandeaux d'image (docs/ui/index.html#en-tetes), image de la cartographie tactique. */}
        <header
          className="app-on-photo bg-hero-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/cartographie-tactique.jpg')`, backgroundPosition: 'center 40%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent sm:bg-gradient-to-r sm:from-slate-950/90 sm:via-slate-950/35 sm:to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 px-3 py-2.5 sm:px-5 sm:py-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Crosshair className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="t-banner-title text-white drop-shadow-md">Mortier</h1>
            </div>
            <p className="text-[13px] text-white/80 drop-shadow-md sm:text-sm">
              Mesure à la grille, règle la distance, tire. {MORTAR_TARGETS_PER_SERIES} cibles par série.
            </p>
          </div>
        </header>

        <div ref={tabsRef} className="mt-4 flex">
          <div role="tablist" aria-label="Mortier" className="app-segmented-control inline-flex w-full border border-gray-200 sm:w-fit">
            {TABS.map((entry, index) => {
              const active = entry.value === tab
              const Icon = entry.icon
              return (
                <button
                  key={entry.value}
                  ref={(node) => {
                    tabButtons.current[index] = node
                  }}
                  type="button"
                  role="tab"
                  id={`mortar-tab-${entry.value}`}
                  aria-selected={active}
                  aria-controls={`mortar-panel-${entry.value}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setTab(entry.value)}
                  onKeyDown={(event) => handleTabKey(event, index)}
                  className={`app-segmented-control__item app-segmented-control__item--sm inline-flex flex-1 items-center justify-center gap-1.5 font-medium transition-colors sm:flex-none ${
                    active ? 'app-segmented-control__item--active' : ''
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {entry.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="app-container app-gutter mt-4 flex flex-col gap-4">
        {trainingOpened ? (
          <div role="tabpanel" id="mortar-panel-training" aria-labelledby="mortar-tab-training" hidden={tab !== 'training'}>
            <MortarTraining difficulty={training.difficulty} round={training.round} onDifficulty={changeDifficulty} onReplay={replay} />
          </div>
        ) : null}
        {tab === 'guide' ? (
          <div role="tabpanel" id="mortar-panel-guide" aria-labelledby="mortar-tab-guide">
            <MortarGuide onTrain={train} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function MortarPage() {
  // useSearchParams (onglet) : frontière Suspense obligatoire (CLAUDE.md, piège 5).
  return (
    <Suspense
      fallback={
        <div className="app-main-flush flex-1">
          <div className="app-container app-gutter">
            <CardSkeleton />
          </div>
        </div>
      }
    >
      <MortarContent />
    </Suspense>
  )
}
