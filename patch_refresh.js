const fs = require('fs')

let content = fs.readFileSync('src/app/settings/opponents/page.tsx', 'utf8')

// Add state
content = content.replace(
  "  const [error, setError] = useState('')",
  "  const [error, setError] = useState('')\n  const [refreshKey, setRefreshKey] = useState(0)"
)

// Add to dependencies
content = content.replace(
  "    opponentsQuery,\n  ])",
  "    opponentsQuery,\n    refreshKey,\n  ])"
)

// Add to handleTrackMember success block
const oldTrackSuccess = `      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Erreur lors du suivi')
      addNotification('Joueur suivi avec succès !', 'success')
    } catch (err: any) {`
const newTrackSuccess = `      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Erreur lors du suivi')
      addNotification('Joueur suivi avec succès !', 'success')
      
      // Auto-refresh the UI
      setExpandedClanId(null)
      setExpandedOpponentId(null)
      setClanDetails({})
      setOpponentDetails({})
      setRefreshKey((k) => k + 1)
    } catch (err: any) {`

content = content.replace(oldTrackSuccess, newTrackSuccess)

fs.writeFileSync('src/app/settings/opponents/page.tsx', content, 'utf8')
console.log('Added refreshKey')
