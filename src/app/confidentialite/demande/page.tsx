import { EyeOff } from 'lucide-react'

import { LegalPageShell } from '@/components/legal/LegalLayout'
import PrivacyRequestForm from '@/components/legal/PrivacyRequestForm'
import { PRIVACY_REQUEST_PATH } from '@/lib/legal/legal-info'

/**
 * Retirer mes données, page publique — docs/features/pages-legales.md. Aucun outil de masquage ni de purge n'existe
 * encore : la demande est enregistrée (`PrivacyRequest`) et traitée à la main, d'où l'étape 2 sans promesse automatique.
 */


const STEPS = [
  'On vérifie que le compte t’appartient. On peut te demander une capture de ton profil en jeu.',
  'Un administrateur applique la demande à la main : profil masqué des pages publiques, historique supprimé de la base ou donnée corrigée.',
  'Tu reçois une réponse par e-mail, sous un mois au plus.',
]

export default function PrivacyRequestPage() {
  return (
    <LegalPageShell
      label="Retirer mes données"
      href={PRIVACY_REQUEST_PATH}
      parent={{ href: '/confidentialite', label: 'Confidentialité' }}
      image="/sauvetage.jpg"
      icon={EyeOff}
      title="Retirer mes données"
      subtitle="Masquer ton profil ou purger ton historique"
    >
      <div className="flex flex-col gap-3">
        <PrivacyRequestForm />

        <section aria-labelledby="privacy-request-next" className="app-panel-muted flex flex-col gap-3 p-4 sm:p-5">
          <h2 id="privacy-request-next" className="t-label m-0">
            Ce qui se passe ensuite
          </h2>
          <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
            {STEPS.map((step, index) => (
              <li key={step} className="t-body flex items-start gap-2.5 text-gray-900">
                <span className="t-num grid h-6 w-6 shrink-0 place-items-center rounded-[6px] bg-gray-100 text-xs font-bold text-gray-900" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          <p className="t-meta m-0 border-t border-gray-200 pt-3">
            Une purge ne touche que ce site. Tes données restent dans PUBG et dans l’API de KRAFTON.
          </p>
        </section>
      </div>
    </LegalPageShell>
  )
}
