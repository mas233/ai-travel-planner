import { useState, useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import LoginPage from './pages/LoginPage'
import MainPage from './pages/MainPage'
import EnvSettingsModal from './components/EnvSettingsModal'
import { getEnv } from './utils/env'
import './App.css'

function App() {
  const { user, loading, checkUser } = useAuthStore()
  const [envOpen, setEnvOpen] = useState(false)
  const [missing, setMissing] = useState([])

  useEffect(() => {
    // Pre-login Supabase configuration check
    const url = getEnv('VITE_SUPABASE_URL')
    const key = getEnv('VITE_SUPABASE_ANON_KEY')
    if (!url || !key) {
      setMissing(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'])
      setEnvOpen(true)
    }
    checkUser()
  }, [checkUser])

  useEffect(() => {
    const onRequire = (e) => {
      try {
        const missingKeys = Array.isArray(e?.detail?.missing) ? e.detail.missing : []
        setMissing(missingKeys)
      } catch (_) { setMissing([]) }
      setEnvOpen(true)
    }
    window.addEventListener('env:config-required', onRequire)
    return () => window.removeEventListener('env:config-required', onRequire)
  }, [])

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: '#666'
      }}>
        加载中...
      </div>
    )
  }

  return (
    <>
      {user ? <MainPage onOpenEnvModal={() => setEnvOpen(true)} /> : <LoginPage />}
      <EnvSettingsModal open={envOpen} onClose={() => setEnvOpen(false)} missingKeys={missing} />
    </>
  )
}

export default App
