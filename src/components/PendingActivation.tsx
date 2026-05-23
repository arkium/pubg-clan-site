export default function PendingActivation() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center p-6">
      <section className="w-full rounded-2xl border border-amber-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-gray-900">Activation en attente</h1>
        <p className="mt-2 text-sm text-gray-600">
          Le clan a ete initialise. Activez le compte Owner via le lien d'activation recu par
          email avant de continuer.
        </p>
        <p className="mt-3 text-sm text-gray-600">
          Si vous n'avez pas recu l'email, verifiez les logs pour recuperer le lien
          <span className="font-medium"> activationUrl</span>.
        </p>
      </section>
    </main>
  )
}
