import { useState } from 'react'
import { useTravelStore } from '../store/travelStore'
import { X, Mic } from 'lucide-react'
import { generateItinerary } from '../services/aiService'
import './CreatePlanModal.css'

function CreatePlanModal({ onClose, userId }) {
  const { createPlan } = useTravelStore()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    destination: '',
    startDate: '',
    endDate: '',
    budget: '',
    travelers: 1,
    preferences: ''
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleVoiceInput = async (field) => {
    // Placeholder for voice input using Xunfei API
    alert('语音输入功能需要配置科大讯飞 API。当前为演示版本。')
    // In production, implement Xunfei voice recognition here
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Calculate days
      const days = Math.ceil(
        (new Date(formData.endDate) - new Date(formData.startDate)) / (1000 * 60 * 60 * 24)
      ) + 1

      // Generate itinerary using AI
      const itinerary = await generateItinerary({
        destination: formData.destination,
        days,
        budget: parseFloat(formData.budget),
        travelers: parseInt(formData.travelers),
        preferences: formData.preferences
      })

      // Create plan in database
      await createPlan({
        user_id: userId,
        title: `${formData.destination}之旅`,
        destination: formData.destination,
        start_date: formData.startDate,
        end_date: formData.endDate,
        budget: parseFloat(formData.budget),
        travelers: parseInt(formData.travelers),
        preferences: formData.preferences,
        itinerary
      })

      alert('旅行计划创建成功!')
      onClose()
    } catch (error) {
      console.error('Error creating plan:', error)
      alert('创建计划失败：' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>新建旅行计划</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="plan-form">
          <div className="form-row">
            <div className="form-group-modal">
              <label>目的地 *</label>
              <div className="input-with-voice">
                <input
                  type="text"
                  name="destination"
                  value={formData.destination}
                  onChange={handleChange}
                  required
                  placeholder="例如：日本东京"
                />
                <button 
                  type="button" 
                  className="voice-btn"
                  onClick={() => handleVoiceInput('destination')}
                >
                  <Mic size={18} />
                </button>
              </div>
            </div>

            <div className="form-group-modal">
              <label>旅行偏好</label>
              <div className="input-with-voice">
                <input
                  type="text"
                  name="preferences"
                  value={formData.preferences}
                  onChange={handleChange}
                  placeholder="例如：美食、动漫、购物"
                />
                <button 
                  type="button" 
                  className="voice-btn"
                  onClick={() => handleVoiceInput('preferences')}
                >
                  <Mic size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group-modal">
              <label>开始日期 *</label>
              <input
                type="date"
                name="startDate"
                value={formData.startDate}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group-modal">
              <label>结束日期 *</label>
              <input
                type="date"
                name="endDate"
                value={formData.endDate}
                onChange={handleChange}
                required
                min={formData.startDate}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group-modal">
              <label>预算 (元) *</label>
              <input
                type="number"
                name="budget"
                value={formData.budget}
                onChange={handleChange}
                required
                min="0"
                step="100"
                placeholder="10000"
              />
            </div>

            <div className="form-group-modal">
              <label>同行人数 *</label>
              <input
                type="number"
                name="travelers"
                value={formData.travelers}
                onChange={handleChange}
                required
                min="1"
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="cancel-btn" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="submit-btn-modal" disabled={loading}>
              {loading ? '生成中...' : '生成计划'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreatePlanModal