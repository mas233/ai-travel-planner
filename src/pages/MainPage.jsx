import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { useTravelStore } from '../store/travelStore'
import { Plane, LogOut, Plus } from 'lucide-react'
import MapView from '../components/MapView'
import PlanSelector from '../components/PlanSelector'
import CreatePlanModal from '../components/CreatePlanModal'
import PlanDetails from '../components/PlanDetails'
import './MainPage.css'

function MainPage() {
  const { user, signOut } = useAuthStore()
  const { plans, currentPlan, fetchPlans, setCurrentPlan } = useTravelStore()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  useEffect(() => {
    if (user) {
      fetchPlans(user.id)
    }
  }, [user, fetchPlans])

  const handleLogout = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  const getUserInitial = () => {
    return user?.email?.[0]?.toUpperCase() || 'U'
  }

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-left">
          <Plane className="logo" />
          <h1 className="app-title">AI 旅行规划师</h1>
        </div>
        <div className="header-right">
          <div className="user-menu-container">
            <div 
              className="user-avatar" 
              onClick={() => setShowUserMenu(!showUserMenu)}
            >
              {getUserInitial()}
            </div>
            {showUserMenu && (
              <div className="user-menu">
                <div className="user-email">{user?.email}</div>
                <button onClick={handleLogout} className="logout-btn">
                  <LogOut size={16} />
                  退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="controls-section">
          <PlanSelector 
            plans={plans}
            currentPlan={currentPlan}
            onSelectPlan={setCurrentPlan}
          />
          <button 
            className="create-plan-btn"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={20} />
            新建旅行计划
          </button>
        </div>

        <div className="content-section">
          <div className="map-container">
            <MapView plan={currentPlan} />
          </div>
          {currentPlan && (
            <div className="plan-details-container">
              <PlanDetails plan={currentPlan} />
            </div>
          )}
        </div>
      </main>

      <footer className="footer">
        <p>© 2025 AI 旅行规划师 - Powered by AI</p>
        <p>作者：AI Travel Team</p>
      </footer>

      {showCreateModal && (
        <CreatePlanModal 
          onClose={() => setShowCreateModal(false)}
          userId={user.id}
        />
      )}
    </div>
  )
}

export default MainPage