import { useState, useEffect } from 'react';
import { useTravelStore } from '../store/travelStore';
import { Calendar, DollarSign, Users, MapPin, Plus, Trash2, Clock, Hotel, Utensils, Navigation, Lightbulb, Car } from 'lucide-react';
import './PlanDetails.css';

function PlanDetails({ plan }) {
  const { fetchExpenses, addExpense } = useTravelStore();
  const [expenses, setExpenses] = useState([]);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [newExpense, setNewExpense] = useState({
    category: '交通',
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [activeTab, setActiveTab] = useState('itinerary');

  // Emit a driving route event with coordinates, robustly handling null/same points
  const triggerSegmentRoute = (startLoc, endLoc) => {
    if (!startLoc || !endLoc) return;
    const toNum = (v) => {
      const n = typeof v === 'string' ? parseFloat(v) : v;
      return Number.isFinite(n) ? n : null;
    };
    const slng = toNum(startLoc.longitude), slat = toNum(startLoc.latitude);
    const tlng = toNum(endLoc.longitude), tlat = toNum(endLoc.latitude);
    const valid = (lng, lat) => typeof lng === 'number' && typeof lat === 'number' && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
    if (!valid(slng, slat) || !valid(tlng, tlat)) return; // null/invalid -> keep original map
    if (slng === tlng && slat === tlat) return; // same start/end -> keep original map
    try {
      window.dispatchEvent(new CustomEvent('map:drivingRoute', { detail: { start: { lng: slng, lat: slat }, end: { lng: tlng, lat: tlat } } }));
    } catch (err) {
      console.error('Failed to dispatch driving route event:', err);
    }
  };

  const safeParseItinerary = (itinerary) => {
    if (typeof itinerary === 'object' && itinerary !== null) return itinerary;
    if (typeof itinerary === 'string') {
      try {
        return JSON.parse(itinerary);
      } catch (error) {
        console.error("Failed to parse itinerary:", error);
        return null;
      }
    }
    return null;
  };

  const itineraryData = plan ? safeParseItinerary(plan.itinerary) : null;

  const renderDailyItinerary = () => {
    if (!itineraryData?.days || itineraryData.days.length === 0) return <p>暂无详细行程安排。</p>;

    return itineraryData.days.map(day => (
      <div key={day.day} className="day-card">
        <h4>第 {day.day} 天: {day.theme}</h4>
        <div className="day-details">
          <div className="day-section">
            <h5><Utensils size={16} /> 餐食</h5>
            <p>早餐: {day.meals.breakfast}</p>
            <p>午餐: {day.meals.lunch}</p>
            <p>晚餐: {day.meals.dinner}</p>
          </div>
          <div className="day-section">
            <h5><Hotel size={16} /> 住宿</h5>
            <p>{day.accommodation.name} ({day.accommodation.area})</p>
            <p>价格: {day.accommodation.priceRange}</p>
          </div>
          <div className="day-section">
            <h5><Navigation size={16} /> 当日交通</h5>
            <p>{day.transportation.type} (约 ¥{day.transportation.estimatedCost})</p>
          </div>
        </div>
        <h5><MapPin size={16} /> 地点与活动</h5>
        <div className="timeline">
          {day.locations.map((loc, index) => (
            <div key={index} className="timeline-item">
              <div className="timeline-time"><Clock size={14} /> {loc.time}</div>
              <div className="timeline-content">
                <strong>{loc.name}</strong>
                <p>{loc.description}</p>
                {loc.tips && <p className="tips"><Lightbulb size={14} /> {loc.tips}</p>}
                {index < day.locations.length - 1 && (
                  <button
                    className="route-segment-btn"
                    title="导航至下一地点"
                    onClick={() => triggerSegmentRoute(loc, day.locations[index + 1])}
                  >
                    <Navigation size={14} /> 导航至下一地点
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    ));
  };

  const renderBudget = () => {
    if (!itineraryData?.budgetBreakdown) return <p>暂无预算分析。</p>;

    const totalBudget = Object.values(itineraryData.budgetBreakdown).reduce((sum, val) => sum + val, 0);

    return (
      <div className="budget-analysis-grid">
        {Object.entries(itineraryData.budgetBreakdown).map(([key, value]) => {
          const percentage = totalBudget > 0 ? ((value / totalBudget) * 100).toFixed(1) : 0;
          return (
            <div key={key} className="budget-item-card">
              <div className="budget-item-header">
                <span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                <strong>¥{value.toLocaleString()}</strong>
              </div>
              <div className="progress-bar">
                <div className="progress" style={{width: `${percentage}%`}}></div>
              </div>
              <span className="percentage">{percentage}%</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderTransport = () => {
    if (!itineraryData?.transportation) return <p>暂无交通安排。</p>;
    return (
      <div className="transport-grid">
        <div className="transport-card">
          <h5><Car size={18} /> 往返交通</h5>
          <p>{itineraryData.transportation.toDestination}</p>
        </div>
        <div className="transport-card">
          <h5><Navigation size={18} /> 当地交通</h5>
          <p>{itineraryData.transportation.local}</p>
        </div>
      </div>
    );
  };

  const renderTips = () => {
    if (!itineraryData?.tips || itineraryData.tips.length === 0) return <p>暂无旅行贴士。</p>;
    return (
      <ul className="tips-list">
        {itineraryData.tips.map((tip, index) => (
          <li key={index}><Lightbulb size={16} /> {tip}</li>
        ))}
      </ul>
    );
  };

  useEffect(() => {
    if (plan?.id) {
      loadExpenses();
    }
  }, [plan?.id]);

  const loadExpenses = async () => {
    const data = await fetchExpenses(plan.id);
    setExpenses(data);
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    try {
      await addExpense({
        plan_id: plan.id,
        category: newExpense.category,
        amount: parseFloat(newExpense.amount),
        description: newExpense.description,
        date: newExpense.date
      });
      setNewExpense({ category: '', amount: '', description: '', date: new Date().toISOString().split('T')[0] });
      setShowExpenseForm(false);
      loadExpenses();
    } catch (error) {
      console.error('Error adding expense:', error);
      alert('添加开销失败');
    }
  };

  const totalExpenses = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
  const remainingBudget = plan.budget - totalExpenses;

  const budgetCategories = [
    '交通', '住宿', '餐饮', '购物', '娱乐', '其他'
  ];

  if (!plan) {
    return (
      <div className="plan-details-placeholder">
        <p>请从左侧选择一个旅行计划以查看详情。</p>
      </div>
    );
  }

  return (
    <div className="plan-details">
      <div className="details-header">
        <h2>{plan.title}</h2>
      </div>

      <div className="details-content">
        <div className="info-section">
          <div className="info-item"><MapPin size={16} /> <span>{plan.destination}</span></div>
          <div className="info-item"><Calendar size={16} /> <span>{plan.start_date} to {plan.end_date}</span></div>
          <div className="info-item"><Users size={16} /> <span>{plan.travelers} 人</span></div>
          <div className="info-item"><DollarSign size={16} /> <span>预算: ¥{plan.budget?.toLocaleString()}</span></div>
        </div>

        {plan.preferences && (
          <div className="preferences-section">
            <h3>旅行偏好</h3>
            <p>{plan.preferences}</p>
          </div>
        )}

        <div className="tabs">
          <button className={`tab-button ${activeTab === 'itinerary' ? 'active' : ''}`} onClick={() => setActiveTab('itinerary')}>详细行程</button>
          <button className={`tab-button ${activeTab === 'budget' ? 'active' : ''}`} onClick={() => setActiveTab('budget')}>预算分析</button>
          <button className={`tab-button ${activeTab === 'transport' ? 'active' : ''}`} onClick={() => setActiveTab('transport')}>交通安排</button>
          <button className={`tab-button ${activeTab === 'tips' ? 'active' : ''}`} onClick={() => setActiveTab('tips')}>旅行贴士</button>
        </div>

        <div className="tab-content">
          {activeTab === 'itinerary' && <div className="itinerary-section">{renderDailyItinerary()}</div>}
          {activeTab === 'budget' && <div className="itinerary-section">{renderBudget()}</div>}
          {activeTab === 'transport' && <div className="itinerary-section">{renderTransport()}</div>}
          {activeTab === 'tips' && <div className="itinerary-section">{renderTips()}</div>}
        </div>

        <div className="expenses-section">
          <div className="section-header">
            <h3>费用记录</h3>
            <button className="add-expense-btn-small" onClick={() => setShowExpenseForm(!showExpenseForm)}><Plus size={16} /></button>
          </div>
          <div className="budget-summary">
            <div className="budget-item"><span>总预算</span><strong>¥{plan.budget?.toLocaleString()}</strong></div>
            <div className="budget-item"><span>已花费</span><strong className="spent">¥{totalExpenses.toLocaleString()}</strong></div>
            <div className="budget-item"><span>剩余</span><strong className={remainingBudget < 0 ? 'over-budget' : 'remaining'}>¥{remainingBudget.toLocaleString()}</strong></div>
          </div>
          {showExpenseForm && (
            <form className="expense-form" onSubmit={handleAddExpense}>
              <div className="form-group">
                <label htmlFor="category">类别</label>
                <select id="category" value={newExpense.category} onChange={(e) => setNewExpense({...newExpense, category: e.target.value})} required>
                  {budgetCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="amount">金额</label>
                <input id="amount" type="number" placeholder="金额" value={newExpense.amount} onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})} required />
              </div>
              <div className="form-group full-width">
                <label htmlFor="description">说明</label>
                <input id="description" type="text" placeholder="说明" value={newExpense.description} onChange={(e) => setNewExpense({...newExpense, description: e.target.value})} />
              </div>
              <div className="form-group full-width">
                <label htmlFor="date">日期</label>
                <input id="date" type="date" value={newExpense.date} onChange={(e) => setNewExpense({...newExpense, date: e.target.value})} required />
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowExpenseForm(false)}>取消</button>
                <button type="submit">保存</button>
              </div>
            </form>
          )}
          <div className="expenses-list">
            {expenses.length === 0 ? (
              <p className="no-expenses">暂无开销记录</p>
            ) : (
              expenses.map(expense => (
                <div key={expense.id} className="expense-item">
                  <div className="expense-info">
                    <strong>{expense.category}</strong>
                    <span>{expense.description}</span>
                  </div>
                  <div className="expense-amount">
                    <span>¥{parseFloat(expense.amount).toLocaleString()}</span>
                    <span className="expense-date">{expense.date}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlanDetails;
