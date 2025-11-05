import { useState, useEffect } from 'react'
import { useTravelStore } from '../store/travelStore'
import { Calendar, DollarSign, Users, MapPin, Plus, Trash2 } from 'lucide-react'
import './PlanDetails.css'

function PlanDetails({ plan }) {
  const { fetchExpenses, addExpense } = useTravelStore()
  const [expenses, setExpenses] = useState([])
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [newExpense, setNewExpense] = useState({
    category: '',
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  })

  useEffect(() => {
    if (plan?.id) {
      loadExpenses()
    }
  }, [plan?.id])

  const loadExpenses = async () => {
    const data = await fetchExpenses(plan.id)
    setExpenses(data)
  }

  const handleAddExpense = async (e) => {
    e.preventDefault()
    try {
      await addExpense({
        plan_id: plan.id,
        category: newExpense.category,
        amount: parseFloat(newExpense.amount),
        description: newExpense.description,
        date: newExpense.date
      })
      setNewExpense({
        category: '',
        amount: '',
        description: '',
        date: new Date().toISOString().split('T')[0]
      })
      setShowExpenseForm(false)
      loadExpenses()
    } catch (error) {
      console.error('Error adding expense:', error)
      alert('添加开销失败')
    }
  }

  const totalExpenses = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0)
  const remainingBudget = plan.budget - totalExpenses

  return (
    <div className="plan-details">
      <div className="details-header">
        <h2>{plan.title}</h2>
      </div>

      <div className="details-content">
        <div className="info-section">
          <div className="info-item">
            <MapPin size={18} />
            <span>{plan.destination}</span>
          </div>
          <div className="info-item">
            <Calendar size={18} />
            <span>{plan.start_date} 至 {plan.end_date}</span>
          </div>
          <div className="info-item">
            <Users size={18} />
            <span>{plan.travelers} 人</span>
          </div>
          <div className="info-item">
            <DollarSign size={18} />
            <span>预算: ¥{plan.budget?.toLocaleString()}</span>
          </div>
        </div>

        {plan.preferences && (
          <div className="preferences-section">
            <h3>旅行偏好</h3>
            <p>{plan.preferences}</p>
          </div>
        )}

        {plan.itinerary?.days && (
          <div className="itinerary-section">
            <h3>行程安排</h3>
            <div className="days-list">
              {plan.itinerary.days.map((day, index) => (
                <div key={index} className="day-item">
                  <div className="day-header">
                    <strong>第 {day.day} 天</strong>
                    {day.theme && <span className="day-theme">{day.theme}</span>}
                  </div>
                  {day.locations && (
                    <ul className="locations-list">
                      {day.locations.map((loc, locIndex) => (
                        <li key={locIndex}>
                          <strong>{loc.name || loc.place}</strong>
                          {loc.description && (
                            <p className="location-desc">{loc.description}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="expenses-section">
          <div className="section-header">
            <h3>费用记录</h3>
            <button 
              className="add-expense-btn"
              onClick={() => setShowExpenseForm(!showExpenseForm)}
            >
              <Plus size={16} />
              添加开销
            </button>
          </div>

          <div className="budget-summary">
            <div className="budget-item">
              <span>总预算</span>
              <strong>¥{plan.budget?.toLocaleString()}</strong>
            </div>
            <div className="budget-item">
              <span>已花费</span>
              <strong className="spent">¥{totalExpenses.toLocaleString()}</strong>
            </div>
            <div className="budget-item">
              <span>剩余</span>
              <strong className={remainingBudget < 0 ? 'over-budget' : 'remaining'}>
                ¥{remainingBudget.toLocaleString()}
              </strong>
            </div>
          </div>

          {showExpenseForm && (
            <form className="expense-form" onSubmit={handleAddExpense}>
              <input
                type="text"
                placeholder="类别（如：餐饮、交通）"
                value={newExpense.category}
                onChange={(e) => setNewExpense({...newExpense, category: e.target.value})}
                required
              />
              <input
                type="number"
                placeholder="金额"
                value={newExpense.amount}
                onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                required
                step="0.01"
                min="0"
              />
              <input
                type="text"
                placeholder="说明"
                value={newExpense.description}
                onChange={(e) => setNewExpense({...newExpense, description: e.target.value})}
              />
              <input
                type="date"
                value={newExpense.date}
                onChange={(e) => setNewExpense({...newExpense, date: e.target.value})}
                required
              />
              <div className="form-actions">
                <button type="button" onClick={() => setShowExpenseForm(false)}>
                  取消
                </button>
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
                    <span className="expense-desc">{expense.description}</span>
                    <span className="expense-date">{expense.date}</span>
                  </div>
                  <div className="expense-amount">¥{parseFloat(expense.amount).toLocaleString()}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PlanDetails