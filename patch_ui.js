const fs = require('fs')

let content = fs.readFileSync('src/app/settings/opponents/page.tsx', 'utf8')

// Add state for notifications
const stateInjection = `
  const [notifications, setNotifications] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([])

  function addNotification(message: string, type: 'success' | 'error' = 'success') {
    const id = Date.now()
    setNotifications((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    }, 4000)
  }

  function removeNotification(id: number) {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const [expandedOpponentId, setExpandedOpponentId] = useState<string | null>(null)
`

content = content.replace(
  "  const [expandedOpponentId, setExpandedOpponentId] = useState<string | null>(null)",
  stateInjection
)

// Replace alerts
content = content.replace("alert('Joueur suivi avec succès !')", "addNotification('Joueur suivi avec succès !', 'success')")
content = content.replace("alert(err.message)", "addNotification(err.message || 'Erreur inconnue', 'error')")
content = content.replace("alert('Erreur lors du suivi')", "addNotification('Erreur lors du suivi', 'error')")

// Inject the JSX for the notifications at the end of the return statement of OpponentsSettingsPage
const jsxInjection = `
      {/* Notifications Toast */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={\`flex min-w-[280px] items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-semibold shadow-xl transition-all \${
              n.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
            }\`}
          >
            <span>{n.message}</span>
            <button
              onClick={() => removeNotification(n.id)}
              className="ml-2 rounded-full p-1 opacity-70 hover:bg-white/20 hover:opacity-100 transition-colors"
              aria-label="Fermer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        ))}
      </div>
    </main>
  )
}
`

content = content.replace(
  "    </main>\n  )\n}\n\nfunction OpponentDetailPanel",
  jsxInjection + "\nfunction OpponentDetailPanel"
)

// Fallback if the above replace fails because of spacing
content = content.replace(
  "    </main>\r\n  )\r\n}\r\n\r\nfunction OpponentDetailPanel",
  jsxInjection + "\r\nfunction OpponentDetailPanel"
)

fs.writeFileSync('src/app/settings/opponents/page.tsx', content, 'utf8')
console.log('Fixed alerts to toasts')
