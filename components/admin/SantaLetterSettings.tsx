'use client';

import { useState, useEffect } from 'react';
import { getModelWarning, getColorClasses, requiresConfirmation, getEstimatedResponseTime } from '@/lib/model-warnings';
import { CircleCheck, RefreshCw, TriangleAlert } from 'lucide-react';
import {
  AdminH2,
  AdminText,
  AdminTextSmall,
  AdminLabel,
} from '@/components/admin/Typography';
import {
  accentButton, button, card, checkInput, choiceCard, field, notice, sizedField, smallButton,
} from '@/components/admin/ui-classes';

export default function SantaLetterSettings() {
  const [santaEnabled, setSantaEnabled] = useState(true);
  const [dailyLimit, setDailyLimit] = useState(1);
  const [dailyCap, setDailyCap] = useState(50);
  const [ollamaModel, setOllamaModel] = useState('llama3.2:latest');
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  
  // Model installation state
  const [pullModelName, setPullModelName] = useState('');
  const [pullingModel, setPullingModel] = useState(false);
  const [pullProgress, setPullProgress] = useState('');
  
  // Model warning state
  const [showWarning, setShowWarning] = useState(false);
  const [pendingModel, setPendingModel] = useState('');

  // Fetch available Ollama models
  const fetchAvailableModels = async () => {
    try {
      setLoadingModels(true);
      const response = await fetch('/api/ollama/models');
      const data = await response.json();
      
      if (data.models && Array.isArray(data.models)) {
        setAvailableModels(data.models);
        // Don't show message on initial load, only on manual refresh
      } else {
        // Silently fail on initial load
        console.log('Could not fetch models from Ollama server');
      }
    } catch (error) {
      console.error('Failed to fetch Ollama models:', error);
      // Silently fail on initial load
    } finally {
      setLoadingModels(false);
    }
  };

  // Manual refresh with user feedback
  const handleRefreshModels = async () => {
    try {
      setLoadingModels(true);
      const response = await fetch('/api/ollama/models');
      const data = await response.json();
      
      if (data.models && Array.isArray(data.models)) {
        setAvailableModels(data.models);
        setMessage(`✅ Found ${data.models.length} installed models`);
      } else {
        setMessage('⚠️ Could not fetch models from Ollama server');
      }
    } catch (error) {
      console.error('Failed to fetch Ollama models:', error);
      setMessage('❌ Failed to connect to Ollama server');
    } finally {
      setLoadingModels(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };
  
  // Pull (install) a new model
  const handlePullModel = async () => {
    if (!pullModelName.trim()) {
      setMessage('❌ Please enter a model name');
      setTimeout(() => setMessage(''), 3000);
      return;
    }
    
    try {
      setPullingModel(true);
      setPullProgress('Starting download...');
      
      const response = await fetch('/api/ollama/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: pullModelName.trim(), stream: false }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMessage(`✅ Successfully installed ${pullModelName}`);
        setPullModelName('');
        // Refresh models list
        await fetchAvailableModels();
      } else {
        setMessage(`❌ Failed to install: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to pull model:', error);
      setMessage('❌ Failed to install model');
    } finally {
      setPullingModel(false);
      setPullProgress('');
      setTimeout(() => setMessage(''), 5000);
    }
  };
  
  // Handle model selection with warning check
  const handleModelChange = (newModel: string) => {
    const modelData = availableModels.find(m => m.name === newModel);
    const sizeGB = modelData ? parseFloat(modelData.sizeGB) : 0;
    
    if (requiresConfirmation(sizeGB)) {
      setPendingModel(newModel);
      setShowWarning(true);
    } else {
      setOllamaModel(newModel);
    }
  };
  
  // Confirm large model selection
  const confirmModelSelection = () => {
    setOllamaModel(pendingModel);
    setShowWarning(false);
    setPendingModel('');
  };
  
  // Cancel large model selection
  const cancelModelSelection = () => {
    setShowWarning(false);
    setPendingModel('');
  };

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/settings?category=santa');
        const data = await response.json();
        
        if (data.settings) {
          setSantaEnabled(data.settings.santa_letters_enabled === 'true');
          setDailyLimit(parseInt(data.settings.santa_daily_limit || '1', 10));
          setDailyCap(parseInt(data.settings.santa_daily_cap || '50', 10));
          setOllamaModel(data.settings.ollama_model || 'llama3.2:latest');
        }
      } catch (error) {
        console.error('Failed to load Santa settings:', error);
        setMessage('❌ Failed to load settings');
      } finally {
        setLoading(false);
      }
    };
    
    loadSettings();
    // Also fetch available models on mount
    fetchAvailableModels();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage('⏳ Saving settings...');
      
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            santa_letters_enabled: santaEnabled.toString(),
            santa_daily_limit: dailyLimit.toString(),
            santa_daily_cap: dailyCap.toString(),
            ollama_model: ollamaModel,
          },
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMessage('✅ Settings saved successfully!');
      } else {
        setMessage(`❌ Failed to save: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      setMessage('❌ Failed to save settings');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  if (loading) {
    return (
      <div className={card}>
        <AdminH2>Santa Letter Configuration</AdminH2>
        <p className="mt-4 text-sm text-adm-muted">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className={`${card} max-w-3xl`}>
      <AdminH2>Santa Letter Configuration</AdminH2>

      {message && (
        <p className={`${notice.info} mb-6 mt-4`}>{message}</p>
      )}

      <div className="space-y-6 mt-6">
        <label className={choiceCard}>
          <input
            type="checkbox"
            id="santa-enabled"
            checked={santaEnabled}
            onChange={(e) => setSantaEnabled(e.target.checked)}
            className={checkInput}
          />
          <div>
            <p className="text-sm font-medium text-adm-text">Enable Santa Letter Submissions</p>
            <p className="mt-0.5 text-[13px] text-adm-muted">
              Allow visitors to submit letters to Santa via your website
            </p>
          </div>
        </label>

        <div>
          <AdminLabel htmlFor="santa-daily-limit">Daily Letter Limit (per IP)</AdminLabel>
          <div className="flex items-center gap-4">
            <input
              id="santa-daily-limit"
              type="number"
              value={dailyLimit}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  setDailyLimit(1);
                } else {
                  const num = parseInt(val, 10);
                  if (!isNaN(num) && num >= 1) {
                    setDailyLimit(num);
                  }
                }
              }}
              min={1}
              max={10}
              className={`${sizedField} w-32`}
            />
            <p className="text-sm text-adm-muted">letters per day</p>
          </div>
          <AdminTextSmall className="mt-1">
            Prevent spam while allowing genuine submissions
          </AdminTextSmall>
        </div>

        <div>
          <AdminLabel htmlFor="santa-daily-cap">Daily Letter Cap (all visitors)</AdminLabel>
          <div className="flex items-center gap-4">
            <input
              id="santa-daily-cap"
              type="number"
              value={dailyCap}
              onChange={(e) => {
                const num = parseInt(e.target.value, 10);
                if (!isNaN(num) && num >= 1 && num <= 1000) {
                  setDailyCap(num);
                }
              }}
              min={1}
              max={1000}
              className={`${sizedField} w-32`}
            />
            <p className="text-sm text-adm-muted">letters per day</p>
          </div>
          <AdminTextSmall className="mt-1">
            Once this many letters arrive in a day (UTC), new ones are turned away until tomorrow. Each letter sends one confirmation email and, after the parent confirms, one reply.
          </AdminTextSmall>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <AdminLabel htmlFor="santa-model" className="mb-0">Ollama AI Model</AdminLabel>
            <button
              onClick={handleRefreshModels}
              disabled={loadingModels}
              className={smallButton}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingModels ? 'animate-spin' : ''}`} aria-hidden="true" />
              {loadingModels ? 'Loading...' : 'Refresh Models'}
            </button>
          </div>
          <select
            id="santa-model"
            value={ollamaModel}
            onChange={(e) => handleModelChange(e.target.value)}
            className={field}
          >
            {availableModels.length > 0 ? (
              availableModels.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name} ({model.sizeFormatted})
                </option>
              ))
            ) : (
              <>
                <option value="llama3.2:latest">Llama 3.2 (Latest) - Fast & Efficient</option>
                <option value="llama3.1:latest">Llama 3.1 - Balanced</option>
                <option value="mistral:latest">Mistral - General Purpose</option>
                <option value="phi3:latest">Phi-3 - Lightweight</option>
                <option value="gemma2:latest">Gemma 2 - Google&apos;s Model</option>
                <option value="qwen2.5:latest">Qwen 2.5 - Multilingual</option>
                <option value="deepseek-r1:latest">DeepSeek R1 - Advanced Reasoning (Large)</option>
              </>
            )}
          </select>
          <AdminTextSmall className="mt-1">
            {availableModels.length > 0
              ? `Showing ${availableModels.length} installed models from your Ollama server`
              : 'Click "Refresh Models" to fetch installed models, or select from common models'
            }
          </AdminTextSmall>

          {/* Model Performance Warning */}
          {availableModels.length > 0 && (() => {
            const selectedModel = availableModels.find(m => m.name === ollamaModel);
            if (!selectedModel) return null;

            const sizeGB = parseFloat(selectedModel.sizeGB);
            const warning = getModelWarning(sizeGB, selectedModel.name);
            const colors = getColorClasses(warning.color);

            return (
              <div className={`mt-4 p-4 rounded-xl border ${colors.bg} ${colors.border}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${colors.badge}`}>
                    {warning.badge}
                  </span>
                  <span className={`text-sm font-semibold ${colors.text}`}>{warning.title}</span>
                </div>
                <p className="text-sm text-adm-soft">
                  {warning.message}
                </p>
                {warning.recommendation && (
                  <p className={`mt-2 text-sm ${colors.text}`}>
                    {warning.recommendation}
                  </p>
                )}
                <p className="mt-2 text-xs text-adm-muted">
                  Size: {selectedModel.sizeFormatted} • Est. Response Time: {getEstimatedResponseTime(sizeGB)} • Min RAM: {warning.minRAM}
                </p>
              </div>
            );
          })()}
        </div>

        {/* Model Installation Section */}
        <div className="pt-5 border-t border-adm-line">
          <AdminLabel htmlFor="santa-pull-model">Install New Model</AdminLabel>
          <div className={`${notice.info} mt-2 mb-3`}>
            <p className="mb-1 font-medium text-adm-info">Browse Available Models</p>
            <p className="text-adm-soft">
              Visit <a href="https://ollama.com/library" target="_blank" rel="noopener noreferrer" className="font-semibold text-adm-info underline hover:no-underline">ollama.com/library</a> to explore hundreds of AI models.
              Copy the model name (e.g., &quot;llama3.2:latest&quot;) and paste it below to install.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="santa-pull-model"
              type="text"
              value={pullModelName}
              onChange={(e) => setPullModelName(e.target.value)}
              placeholder="e.g., llama3.2:latest"
              disabled={pullingModel}
              className={`${field} sm:flex-1`}
            />
            <button
              onClick={handlePullModel}
              disabled={pullingModel || !pullModelName.trim()}
              className={button}
            >
              {pullingModel ? 'Installing...' : 'Pull Model'}
            </button>
          </div>
          {pullProgress && (
            <p className="mt-2 text-sm text-adm-info">
              {pullProgress}
            </p>
          )}
          <p className="mt-2 text-[13px] text-adm-muted">
            Large models like deepseek-r1 may take several minutes to download
          </p>
        </div>

        {/* Model Warning Modal */}
        {showWarning && (() => {
          const modelData = availableModels.find(m => m.name === pendingModel);
          if (!modelData) return null;

          const sizeGB = parseFloat(modelData.sizeGB);
          const warning = getModelWarning(sizeGB, modelData.name);
          const colors = getColorClasses(warning.color);

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="model-warning-title"
                className="w-full max-w-2xl rounded-2xl border border-adm-warn-line bg-adm-surface p-5.5"
              >
                <div className="mb-4 flex items-start gap-4">
                  <TriangleAlert className="mt-0.5 h-6 w-6 shrink-0 text-adm-warn" aria-hidden="true" />
                  <div>
                    <h3 id="model-warning-title" className="mb-2 text-lg font-semibold text-adm-text">{warning.title}</h3>
                    <AdminText className="mb-3">
                      You&apos;re about to select <strong>{pendingModel}</strong> ({modelData.sizeFormatted})
                    </AdminText>
                    <AdminText className="mb-3">
                      {warning.message}
                    </AdminText>
                    {warning.recommendation && (
                      <div className={`p-3 rounded-xl ${colors.bg} ${colors.border} border mb-3`}>
                        <p className={`text-sm ${colors.text}`}>
                          {warning.recommendation}
                        </p>
                      </div>
                    )}
                    <AdminTextSmall>
                      <strong>System Requirements:</strong><br />
                      • Minimum RAM: {warning.minRAM}<br />
                      • Estimated response time: {getEstimatedResponseTime(sizeGB)}<br />
                      • Model size: {modelData.sizeFormatted}
                    </AdminTextSmall>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2.5">
                  <button onClick={cancelModelSelection} className={button}>
                    Cancel
                  </button>
                  <button onClick={confirmModelSelection} className={accentButton}>
                    Use This Model Anyway
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        <div className="pt-5 border-t border-adm-line">
          <button
            onClick={handleSave}
            disabled={saving}
            className={accentButton}
          >
            {saving ? 'Saving...' : 'Save Santa Settings'}
          </button>
        </div>

        <div>
          <AdminLabel>Queue Processing Status</AdminLabel>
          <p className={`${notice.ok} flex items-center gap-2`}>
            <CircleCheck className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
            Queue processor active - checking every 90 seconds
          </p>
        </div>

      </div>
    </div>
  );
}
