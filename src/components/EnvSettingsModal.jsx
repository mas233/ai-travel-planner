import React, { useEffect, useState } from 'react';
import { getDisplayKeys, getAllEnv, setEnv, hasReloadRequiredChange, ENV_PLACEHOLDERS } from '../utils/env';
import './EnvSettingsModal.css';
import { Eye, EyeOff } from 'lucide-react';

function EnvSettingsModal({ open, onClose, missingKeys = [] }) {
  const [values, setValues] = useState({});
  const [initial, setInitial] = useState({});
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState({});

  useEffect(() => {
    if (open) {
      const keys = getDisplayKeys();
      const current = getAllEnv(keys);
      setValues(current);
      setInitial(current);
      setSaved(false);
      setShowKey({});
    }
  }, [open]);

  const handleSave = (reload = false) => {
    getDisplayKeys().forEach(k => setEnv(k, values[k] || ''));
    setSaved(true);
    if (reload || hasReloadRequiredChange(initial, values)) {
      setTimeout(() => window.location.reload(), 300);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="env-settings-title">
      <div className="modal-content env-settings-modal">
        <div className="modal-header">
          <h2 id="env-settings-title">环境变量配置</h2>
          <button className="close-btn" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="modal-body">
          <p className="modal-desc">
            修改以下值将覆盖构建时的配置。涉及 AMap 或 Supabase 的更改需要刷新页面后生效。
          </p>

          {missingKeys?.length > 0 && (
            <div className="alert warn">检测到必需参数缺失：{missingKeys.join(', ')}。请补充后继续使用。</div>
          )}

          <div className="env-grid">
            {getDisplayKeys().map((key) => {
              const isSecret = key.includes('KEY');
              const type = isSecret && !showKey[key] ? 'password' : 'text';
              return (
                <div className="form-group-modal" key={key}>
                  <label htmlFor={key}>{key}</label>
                  <div className="input-with-voice">
                    <input
                      id={key}
                      value={values[key] || ''}
                      onChange={(e) => setValues(v => ({ ...v, [key]: e.target.value }))}
                      type={type}
                      placeholder={ENV_PLACEHOLDERS[key] || `请输入 ${key}`}
                    />
                    {isSecret && (
                      <button
                        type="button"
                        className="input-suffix-icon"
                        onClick={() => setShowKey(s => ({ ...s, [key]: !s[key] }))}
                        aria-label={showKey[key] ? '隐藏' : '显示'}
                        title={showKey[key] ? '隐藏' : '显示'}
                      >
                        {showKey[key] ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {saved && (
          <div className="alert success">保存成功{hasReloadRequiredChange(initial, values) ? '，已触发刷新' : ''}。</div>
        )}

        <div className="create-plan-modal-footer">
          <button className="cancel-btn" onClick={onClose}>关闭</button>
          <button className="submit-btn-modal" onClick={() => handleSave(false)}>保存</button>
          <button className="submit-btn-modal" onClick={() => handleSave(true)}>保存并刷新</button>
        </div>
      </div>
    </div>
  );
}

export default EnvSettingsModal;
