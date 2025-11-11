import React, { useState, useEffect } from 'react';
import { Modal, Button, CircularProgress } from '@mui/material';
import { Mic, MicOff, SmartToy, Close } from '@mui/icons-material';
import voiceService from '../services/voiceService';
import { parseVoiceInput, generateItinerary } from '../services/aiService';
import { useTravelStore } from '../store/travelStore';
import './CreatePlanModal.css';

function CreatePlanModal({ onClose, userId }) {
  const { createPlan } = useTravelStore();
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [formData, setFormData] = useState({
    destination: '',
    startDate: '',
    endDate: '',
    budget: '',
    travelers: 1,
    preferences: ''
  });

  useEffect(() => {
    voiceService.onResult = (text) => {
      setTranscribedText(text);
    };

    voiceService.onError = (error) => {
      console.error('Voice service error:', error);
      setIsRecording(false);
      setTranscribedText('（语音识别未启用或配置缺失，暂无法使用）');
    };

    return () => {
      voiceService.stop();
    };
  }, []);

  const handleVoiceInput = () => {
    // 未配置语音服务则直接提示并退出
    if (!voiceService.isConfigured()) {
      setTranscribedText('（语音识别未配置：请使用文本输入，或点击“智能填充”解析文本。）');
      setIsRecording(false);
      return;
    }
    if (isRecording) {
      voiceService.stop();
      setIsRecording(false);
      return;
    }

    voiceService.start(
      (text) => setTranscribedText(text),
      (error) => {
        console.error('Voice service error:', error);
        setIsRecording(false);
        setTranscribedText('（语音识别出现错误或配置缺失，请稍后重试，或使用文本输入 + 智能填充。）');
      },
      () => {}
    );
    setIsRecording(true);
  };

  const handleSmartFill = async () => {
    if (!transcribedText) return;

    setIsParsing(true);
    try {
      const parsedData = await parseVoiceInput(transcribedText);
      const updatedFormData = { ...formData };

      if (parsedData.destination) updatedFormData.destination = parsedData.destination;
      if (parsedData.startDate) updatedFormData.startDate = parsedData.startDate;
      if (parsedData.endDate) updatedFormData.endDate = parsedData.endDate;
      if (parsedData.budget) updatedFormData.budget = parsedData.budget;
      if (parsedData.travelers) updatedFormData.travelers = parsedData.travelers;
      if (parsedData.preferences) updatedFormData.preferences = parsedData.preferences;

      setFormData(updatedFormData);
    } catch (error) {
      console.error('Failed to parse and fill form:', error);
    } finally {
      setIsParsing(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const days = Math.ceil(
        (new Date(formData.endDate) - new Date(formData.startDate)) / (1000 * 60 * 60 * 24)
      ) + 1;

      const itinerary = await generateItinerary({
        destination: formData.destination,
        days,
        budget: parseFloat(formData.budget),
        travelers: parseInt(formData.travelers),
        preferences: formData.preferences
      });

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
      });

      alert('旅行计划创建成功!');
      onClose();
    } catch (error) {
      console.error('Error creating plan:', error);
      alert('创建计划失败：' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>新建旅行计划</h2>
          <button className="close-btn" onClick={onClose} disabled={loading}>
            <Close style={{ fontSize: 24 }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="plan-form">
          <div className="form-group-modal">
            <label htmlFor="destination">目的地</label>
            <input
              id="destination"
              name="destination"
              type="text"
              placeholder="例如：日本·横滨"
              value={formData.destination}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group-modal">
              <label htmlFor="startDate">开始日期</label>
              <input
                id="startDate"
                name="startDate"
                type="date"
                value={formData.startDate}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-group-modal">
              <label htmlFor="endDate">结束日期</label>
              <input
                id="endDate"
                name="endDate"
                type="date"
                value={formData.endDate}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group-modal">
              <label htmlFor="budget">预算（人民币）</label>
              <input
                id="budget"
                name="budget"
                type="number"
                min="0"
                placeholder="例如：5000"
                value={formData.budget}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-group-modal">
              <label htmlFor="travelers">同行人数</label>
              <input
                id="travelers"
                name="travelers"
                type="number"
                min="1"
                value={formData.travelers}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>

          <div className="form-group-modal">
            <label htmlFor="preferences">旅行偏好</label>
            <input
              id="preferences"
              name="preferences"
              type="text"
              placeholder="例如：游览景点、美食、购物"
              value={formData.preferences}
              onChange={handleInputChange}
            />
          </div>

          <div className="voice-input-area">
            <textarea
              className="voice-transcript-box"
              value={transcribedText}
              onChange={(e) => setTranscribedText(e.target.value)}
              placeholder={isRecording ? '正在聆听...' : '点击麦克风开始语音输入，或在此手动输入...'}
              rows={4}
            />
            <div className="voice-actions">
              <button
                type="button"
                className={`voice-btn-circle ${isRecording ? 'recording' : ''}`}
                onClick={handleVoiceInput}
                aria-label={isRecording ? '停止录音' : '开始录音'}
              >
                {isRecording ? <MicOff /> : <Mic />}
              </button>
              <Button
                variant="contained"
                className="smart-fill-btn"
                onClick={handleSmartFill}
                disabled={isParsing || !transcribedText}
                startIcon={isParsing ? <CircularProgress size={20} /> : <SmartToy />}
              >
                {isParsing ? '正在分析...' : '智能填写'}
              </Button>
            </div>
          </div>

          <div className="create-plan-modal-footer">
            <Button onClick={onClose} className="cancel-btn">取消</Button>
            <Button 
              type="submit" 
              variant="contained" 
              className="submit-btn-modal" 
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : '生成计划'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

export default CreatePlanModal;
