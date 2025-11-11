import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useTravelStore } from '../store/travelStore';
import { LogOut, ChevronLeft, Menu } from 'lucide-react';
import PlanSelector from '../components/PlanSelector';
import PlanDetails from '../components/PlanDetails';
import CreatePlanModal from '../components/CreatePlanModal';
import MapView from '../components/MapView';
import './MainPage.css';

function MainPage() {
  const { user, signOut } = useAuthStore();
  const { plans, currentPlan, fetchPlans, setCurrentPlan } = useTravelStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (user) {
      fetchPlans(user.id);
    }
  }, [user, fetchPlans]);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className={`main-page-container ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <button className="sidebar-toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
        {sidebarOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
      </button>
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="user-info">
            <div className="user-avatar">{user?.email?.[0]?.toUpperCase() || 'U'}</div>
            <span className="user-email">{user?.email}</span>
          </div>
          <button onClick={handleLogout} className="logout-button" title="退出登录">
            <LogOut size={20} />
          </button>
        </div>
        <div className="sidebar-content">
          <div className="plan-selection-section">
            <PlanSelector
              plans={plans}
              currentPlan={currentPlan}
              onSelectPlan={setCurrentPlan}
              onNewPlan={() => setShowCreateModal(true)}
            />
          </div>
          <div className="plan-details-section">
            {currentPlan ? (
              <PlanDetails plan={currentPlan} />
            ) : (
              <div className="no-plan-selected">
                <p>请选择一个旅行计划或创建一个新的计划</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="main-content">
        <MapView plan={currentPlan} />
      </div>
      {showCreateModal && (
        <CreatePlanModal
          onClose={() => setShowCreateModal(false)}
          userId={user.id}
        />
      )}
    </div>
  );
}

export default MainPage;
