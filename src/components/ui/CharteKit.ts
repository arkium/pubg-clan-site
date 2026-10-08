/**
 * Boîte à outils de la charte UI (docs/ui/index.html) pour les pages d'administration : tuiles d'icône, pastilles,
 * états vide / erreur / chargement, encadrés, interrupteur, menu de choix, modale de confirmation. Née avec le cycle de
 * vie des clans (`src/components/clan-lifecycle/LifecycleShared.tsx`), elle sert telle quelle aux autres pages : ne pas
 * recomposer ces éléments à la main.
 */
export {
  ButtonSpinner,
  Callout,
  ChoiceMenu,
  ConfirmDialog,
  CountPill,
  EmptyState,
  ErrorState,
  IconTile,
  LifecycleCard as SectionCard,
  ListSkeleton,
  Switch,
  Tag,
  ToastStack,
  toneStyle,
  type ChoiceOption,
  type Toast,
  type Tone,
} from '@/components/clan-lifecycle/LifecycleShared'
