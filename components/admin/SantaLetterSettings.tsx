'use client';

import { useState, useEffect } from 'react';
import { getModelWarning, getColorClasses, requiresConfirmation, getEstimatedResponseTime } from '@/lib/model-warnings';
import {
  AdminH2,
  AdminH3,
  AdminText,
  AdminTextSmall,
  AdminLabel,
  AdminSuccess,
  AdminInfo,
} from '@/components/admin/Typography';

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
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <AdminH2>🎅 Santa Letter Configuration</AdminH2>
        <p className="text-white/60 mt-4">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
      <AdminH2>🎅 Santa Letter Configuration</AdminH2>
      
      {message && (
        <div className="mb-6 mt-4 p-4 bg-blue-500/20 rounded-lg border border-blue-500/30">
          <AdminInfo>{message}</AdminInfo>
        </div>
      )}
      
      <div className="space-y-6 mt-6">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="santa-enabled"
            checked={santaEnabled}
            onChange={(e) => setSantaEnabled(e.target.checked)}
            className="w-5 h-5 rounded mt-1"
          />
          <div>
            <AdminLabel htmlFor="santa-enabled" className="cursor-pointer mb-0">
              Enable Santa Letter Submissions
            </AdminLabel>
            <AdminTextSmall className="mt-1">
              Allow visitors to submit letters to Santa via your website
            </AdminTextSmall>
          </div>
        </div>

        <div>
          <AdminLabel>Daily Letter Limit (per IP)</AdminLabel>
          <div className="flex items-center gap-4">
            <input
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
              className="w-32 px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
            />
            <AdminTextSmall>letters per day</AdminTextSmall>
          </div>
          <AdminTextSmall className="mt-1">
            Prevent spam while allowing genuine submissions
          </AdminTextSmall>
        </div>

        <div>
          <AdminLabel>Daily Letter Cap (all visitors)</AdminLabel>
          <div className="flex items-center gap-4">
            <input
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
              className="w-32 px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
            />
            <AdminTextSmall>letters per day</AdminTextSmall>
          </div>
          <AdminTextSmall className="mt-1">
            Once this many letters arrive in a day (UTC), new ones are turned away until tomorrow. Each letter sends one confirmation email and, after the parent confirms, one reply.
          </AdminTextSmall>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <AdminLabel>Ollama AI Model</AdminLabel>
            <button
              onClick={handleRefreshModels}
              disabled={loadingModels}
              className="px-3 py-1 text-sm bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded border border-blue-500/30 transition-all disabled:opacity-50"
            >
              {loadingModels ? '⏳ Loading...' : '🔄 Refresh Models'}
            </button>
          </div>
          <select
            value={ollamaModel}
            onChange={(e) => handleModelChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
          >
            {availableModels.length > 0 ? (
              availableModels.map((model) => (
                <option key={model.name} value={model.name} className="bg-gray-900 text-white">
                  {model.name} ({model.sizeFormatted})
                </option>
              ))
            ) : (
              <>
                <option value="llama3.2:latest" className="bg-gray-900 text-white">Llama 3.2 (Latest) - Fast & Efficient ⭐</option>
                <option value="llama3.1:latest" className="bg-gray-900 text-white">Llama 3.1 - Balanced</option>
                <option value="mistral:latest" className="bg-gray-900 text-white">Mistral - General Purpose</option>
                <option value="phi3:latest" className="bg-gray-900 text-white">Phi-3 - Lightweight</option>
                <option value="gemma2:latest" className="bg-gray-900 text-white">Gemma 2 - Google's Model</option>
                <option value="qwen2.5:latest" className="bg-gray-900 text-white">Qwen 2.5 - Multilingual</option>
                <option value="deepseek-r1:latest" className="bg-gray-900 text-white">DeepSeek R1 - Advanced Reasoning (Large)</option>
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
              <div className={`mt-4 p-4 rounded-lg border ${colors.bg} ${colors.border}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${colors.badge}`}>
                        {warning.badge}
                      </span>
                      <span className={`font-semibold ${colors.text}`}>{warning.title}</span>
                    </div>
                    <AdminTextSmall className="text-white/80">
                      {warning.message}
                    </AdminTextSmall>
                    {warning.recommendation && (
                      <AdminTextSmall className={`mt-2 ${colors.text}`}>
                        💡 {warning.recommendation}
                      </AdminTextSmall>
                    )}
                    <div className="mt-2 text-xs text-white/60">
                      Size: {selectedModel.sizeFormatted} • Est. Response Time: {getEstimatedResponseTime(sizeGB)} • Min RAM: {warning.minRAM}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
        
        {/* Model Installation Section */}
        <div className="pt-4 border-t border-white/10">
          <AdminLabel>Install New Model</AdminLabel>
          <div className="mt-2 mb-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <AdminTextSmall className="text-blue-300 mb-2">
              📚 <strong>Browse Available Models:</strong>
            </AdminTextSmall>
            <AdminTextSmall className="text-white/70">
              Visit <a href="https://ollama.com/library" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline font-semibold">ollama.com/library</a> to explore hundreds of AI models.
              Copy the model name (e.g., "llama3.2:latest") and paste it below to install.
            </AdminTextSmall>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={pullModelName}
              onChange={(e) => setPullModelName(e.target.value)}
              placeholder="e.g., llama3.2:latest"
              disabled={pullingModel}
              className="flex-1 px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 disabled:opacity-50"
            />
            <button
              onClick={handlePullModel}
              disabled={pullingModel || !pullModelName.trim()}
              className="px-6 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg border border-blue-500/30 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pullingModel ? '⏳ Installing...' : '📥 Pull Model'}
            </button>
          </div>
          {pullProgress && (
            <AdminTextSmall className="mt-2 text-blue-300">
              {pullProgress}
            </AdminTextSmall>
          )}
          <AdminTextSmall className="mt-2 text-white/50">
            ⚠️ Large models like deepseek-r1 may take several minutes to download
          </AdminTextSmall>
        </div>
        
        {/* Model Warning Modal */}
        {showWarning && (() => {
          const modelData = availableModels.find(m => m.name === pendingModel);
          if (!modelData) return null;
          
          const sizeGB = parseFloat(modelData.sizeGB);
          const warning = getModelWarning(sizeGB, modelData.name);
          const colors = getColorClasses(warning.color);
          
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="bg-gray-900 rounded-xl p-6 max-w-2xl mx-4 border-2 border-yellow-500/50">
                <div className="flex items-start gap-4 mb-4">
                  <span className="text-4xl">⚠️</span>
                  <div>
                    <AdminH3 className="mb-2">{warning.title}</AdminH3>
                    <AdminText className="text-white/80 mb-3">
                      You're about to select <strong>{pendingModel}</strong> ({modelData.sizeFormatted})
                    </AdminText>
                    <AdminText className="text-white/80 mb-3">
                      {warning.message}
                    </AdminText>
                    {warning.recommendation && (
                      <div className={`p-3 rounded-lg ${colors.bg} ${colors.border} border mb-3`}>
                        <AdminText className={colors.text}>
                          💡 {warning.recommendation}
                        </AdminText>
                      </div>
                    )}
                    <AdminTextSmall className="text-white/60">
                      <strong>System Requirements:</strong><br />
                      • Minimum RAM: {warning.minRAM}<br />
                      • Estimated response time: {getEstimatedResponseTime(sizeGB)}<br />
                      • Model size: {modelData.sizeFormatted}
                    </AdminTextSmall>
                  </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={cancelModelSelection}
                    className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmModelSelection}
                    className="px-6 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 rounded-lg border border-yellow-500/30 transition-all font-semibold"
                  >
                    Use This Model Anyway
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        <div className="pt-4 border-t border-white/10">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-linear-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {saving ? '⏳ Saving...' : '💾 Save Santa Settings'}
          </button>
        </div>

        <div>
          <AdminLabel>Queue Processing Status</AdminLabel>
          <div className="p-4 bg-green-500/20 rounded-lg border border-green-500/30">
            <div className="flex items-center gap-2">
              <span className="text-green-400 text-2xl">✅</span>
              <AdminSuccess className="text-base">Queue processor active - checking every 90 seconds</AdminSuccess>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
