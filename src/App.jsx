import { useState, useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import LoginPage from './pages/LoginPage'
import MainPage from './pages/MainPage'
import './App.css'

function App() {
  const { user, loading, checkUser } = useAuthStore()

  useEffect(() => {
    checkUser()
  }, [checkUser])

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

  return user ? <MainPage /> : <LoginPage />
}

export default App
