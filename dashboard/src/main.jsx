import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider, useAuth } from './AuthContext'
import AuthPage from './AuthPage'

function Gate() {
  const { session, loading } = useAuth()
  if (loading) return null // session check ho rahi hai
  return session ? <App /> : <AuthPage />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <Gate />
    </AuthProvider>
  </StrictMode>,
)