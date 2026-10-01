import { useEffect } from 'react'
import { useRoute } from './lib/route'
import { Welcome } from './components/Welcome'
import { Join } from './components/Join'
import { Workspace } from './components/Workspace'
import { settings, applyTheme } from './lib/settings'

export default function App() {
  const route = useRoute()
  const theme = settings.use().theme
  useEffect(() => applyTheme(theme), [theme])

  if (route.name === 'join' && route.wsId) return <Join wsId={route.wsId} name={route.joinName} />
  if (route.name === 'workspace' && route.wsId) return <Workspace key={route.wsId} wsId={route.wsId} pageId={route.pageId} />
  return <Welcome />
}
