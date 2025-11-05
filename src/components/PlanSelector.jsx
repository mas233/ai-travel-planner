import { ChevronDown } from 'lucide-react'
import './PlanSelector.css'

function PlanSelector({ plans, currentPlan, onSelectPlan }) {
  return (
    <div className="plan-selector">
      <select 
        className="plan-select"
        value={currentPlan?.id || ''}
        onChange={(e) => {
          const plan = plans.find(p => p.id === e.target.value)
          onSelectPlan(plan)
        }}
      >
        <option value="">
          {plans.length === 0 ? '尚无旅行计划' : '选择旅行计划'}
        </option>
        {plans.map(plan => (
          <option key={plan.id} value={plan.id}>
            {plan.title} - {plan.destination}
          </option>
        ))}
      </select>
      <ChevronDown className="select-icon" size={20} />
    </div>
  )
}

export default PlanSelector