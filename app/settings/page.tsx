'use client';

import { useState, useEffect } from 'react';
import { TIMING } from '@/lib/constants';
import AdminNavigation from '@/components/AdminNavigation';
import UpdateChecker from '@/components/UpdateChecker';
import BannerSettings from '@/components/admin/BannerSettings';
import GameSettings from '@/components/admin/GameSettings';
import DisplaySettings from '@/components/admin/DisplaySettings';
import { formatDateTime } from '@/lib/time-utils';
import { getModelWarning, getColorClasses, requiresConfirmation, getEstimatedResponseTime } from '@/lib/model-warnings';
import { 
  AdminH1, 
  AdminH2, 
  AdminH3,
  AdminH4,
  AdminText, 
  AdminTextMuted,
  AdminTextSmall,
  AdminLabel,
  AdminValue,
  AdminSuccess,
  AdminError,
  AdminInfo
} from '@/components/admin/Typography';
import Link from 'next/link';

type SettingSection = 'themes' | 'santa' | 'monitoring' | 'database' | 'updates' | 'youtube' | 'jukebox' | 'location' | 'games' | 'display';

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingSection>('themes');

  return (
    <div className="min-h-screen bg-linear-to-br from-purple-900 via-blue-900 to-indigo-900">
      <AdminNavigation />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <AdminH1>⚙️ Settings</AdminH1>
          <AdminText>
            Configure your light show system settings and preferences
          </AdminText>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Settings Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 space-y-2">
              <button
                onClick={() => setActiveSection('updates')}
                className={`w-full text-left px-4 py-3 rounded-lg transition-all font-semibold ${
                  activeSection === 'updates'
                    ? 'bg-white text-black shadow-lg'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                🔄 System Updates
              </button>
              <button
                onClick={() => setActiveSection('themes')}
                className={`w-full text-left px-4 py-3 rounded-lg transition-all font-semibold ${
                  activeSection === 'themes'
                    ? 'bg-white text-black shadow-lg'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                🎨 Themes
              </button>
              <button
                onClick={() => setActiveSection('santa')}
                className={`w-full text-left px-4 py-3 rounded-lg transition-all font-semibold ${
                  activeSection === 'santa'
                    ? 'bg-white text-black shadow-lg'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                🎅 Santa Letters
              </button>
              <button
                onClick={() => setActiveSection('monitoring')}
                className={`w-full text-left px-4 py-3 rounded-lg transition-all font-semibold ${
                  activeSection === 'monitoring'
                    ? 'bg-white text-black shadow-lg'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                📡 Device Monitoring
              </button>
              <button
                onClick={() => setActiveSection('database')}
                className={`w-full text-left px-4 py-3 rounded-lg transition-all font-semibold ${
                  activeSection === 'database'
                    ? 'bg-white text-black shadow-lg'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                💾 Database
              </button>
              <button
                onClick={() => setActiveSection('youtube')}
                className={`w-full text-left px-4 py-3 rounded-lg transition-all font-semibold ${
                  activeSection === 'youtube'
                    ? 'bg-white text-black shadow-lg'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                🎬 YouTube Videos
              </button>
              <button
                onClick={() => setActiveSection('jukebox')}
                className={`w-full text-left px-4 py-3 rounded-lg transition-all font-semibold ${
                  activeSection === 'jukebox'
                    ? 'bg-white text-black shadow-lg'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                🎵 Jukebox
              </button>
              <button
                onClick={() => setActiveSection('location')}
                className={`w-full text-left px-4 py-3 rounded-lg transition-all font-semibold ${
                  activeSection === 'location'
                    ? 'bg-white text-black shadow-lg'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                📍 Location
              </button>
              <button
                onClick={() => setActiveSection('games')}
                className={`w-full text-left px-4 py-3 rounded-lg transition-all font-semibold ${
                  activeSection === 'games'
                    ? 'bg-white text-black shadow-lg'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                🎮 Game Settings
              </button>
              <button
                onClick={() => setActiveSection('display')}
                className={`w-full text-left px-4 py-3 rounded-lg transition-all font-semibold ${
                  activeSection === 'display'
                    ? 'bg-white text-black shadow-lg'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                📺 Digital Sign
              </button>
            </div>
          </div>

          {/* Settings Content */}
          <div className="lg:col-span-3">
            {activeSection === 'updates' && <UpdateSettings />}
            {activeSection === 'themes' && <ThemeSettings />}
            {activeSection === 'santa' && <SantaLetterSettings />}
            {activeSection === 'monitoring' && <MonitoringSettings />}
            {activeSection === 'database' && <DatabaseSettings />}
            {activeSection === 'youtube' && <YouTubeVideoSettings />}
            {activeSection === 'jukebox' && <JukeboxSettings />}
            {activeSection === 'location' && <LocationRestrictions />}
            {activeSection === 'games' && <GameSettingsSection />}
            {activeSection === 'display' && <DisplaySettings />}
          </div>
        </div>
      </div>
    </div>
  );
}

function UpdateSettings() {
  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
      <UpdateChecker />
    </div>
  );
}

function ThemeSettings() {
  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
      <AdminH2>🎨 Theme Configuration</AdminH2>
      
      <AdminText className="mb-6">
        Customize the visual appearance of your jukebox page with different particle effects and color schemes.
      </AdminText>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="p-4 bg-white/5 rounded-lg border border-white/10">
          <div className="text-white font-semibold mb-2">🎄 Default Theme</div>
          <div className="text-white/60 text-sm">Standard particle effects</div>
        </div>
        
        <div className="p-4 bg-white/5 rounded-lg border border-white/10">
          <div className="text-white font-semibold mb-2">❄️ Snow Theme</div>
          <div className="text-white/60 text-sm">Falling snow particles</div>
        </div>
        
        <div className="p-4 bg-white/5 rounded-lg border border-white/10">
          <div className="text-white font-semibold mb-2">✨ Sparkle Theme</div>
          <div className="text-white/60 text-sm">Twinkling stars</div>
        </div>
        
        <div className="p-4 bg-white/5 rounded-lg border border-white/10">
          <div className="text-white font-semibold mb-2">🎨 Custom</div>
          <div className="text-white/60 text-sm">Create your own</div>
        </div>
      </div>

      <Link
        href="/theme-settings"
        className="inline-block px-6 py-3 bg-linear-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:from-purple-600 hover:to-pink-700 transition-all font-semibold"
      >
        Manage Themes →
      </Link>
    </div>
  );
}

function SantaLetterSettings() {
  const [santaEnabled, setSantaEnabled] = useState(true);
  const [dailyLimit, setDailyLimit] = useState(1);
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

        <div className="pt-4 border-t border-white/10">
          <Link
            href="/santa-letters"
            className="inline-block px-6 py-3 bg-linear-to-r from-red-500 to-green-600 text-white rounded-lg hover:from-red-600 hover:to-green-700 transition-all font-semibold"
          >
            View Santa Letters →
          </Link>
        </div>
      </div>
    </div>
  );
}

function MonitoringSettings() {
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);
  const [startHour, setStartHour] = useState(16); // 4 PM
  const [startMinute, setStartMinute] = useState(0);
  const [endHour, setEndHour] = useState(22); // 10 PM
  const [endMinute, setEndMinute] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/devices/schedule');
        const data = await response.json();
        
        if (data.success && data.schedule) {
          const schedule = data.schedule;
          setMonitoringEnabled(Boolean(schedule.enabled));
          
          // Parse start time (HH:MM format)
          if (schedule.start_time) {
            const [h, m] = schedule.start_time.split(':');
            setStartHour(parseInt(h, 10));
            setStartMinute(parseInt(m, 10));
          }
          
          // Parse end time (HH:MM format)
          if (schedule.end_time) {
            const [h, m] = schedule.end_time.split(':');
            setEndHour(parseInt(h, 10));
            setEndMinute(parseInt(m, 10));
          }
        }
      } catch (error) {
        console.error('Failed to load monitoring settings:', error);
        setMessage('❌ Failed to load settings');
      } finally {
        setLoading(false);
      }
    };
    
    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage('⏳ Saving settings...');
      
      // Format times as HH:MM
      const start_time = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`;
      const end_time = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
      
      const response = await fetch('/api/devices/schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: monitoringEnabled,
          start_time,
          end_time,
          timezone: 'America/Chicago'
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMessage('✅ Monitoring settings saved successfully! Changes are active now.');
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

  const formatTime = (hour: number, minute: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
  };

  if (loading) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <AdminH2>📡 Device Monitoring Settings</AdminH2>
        <p className="text-white/60 mt-4">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
      <AdminH2>📡 Device Monitoring Settings</AdminH2>
      
      {message && (
        <div className="mb-6 mt-4 p-4 bg-blue-500/20 rounded-lg border border-blue-500/30">
          <AdminInfo>{message}</AdminInfo>
        </div>
      )}
      
      <div className="space-y-6 mt-6">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="monitoring-enabled"
            checked={monitoringEnabled}
            onChange={(e) => setMonitoringEnabled(e.target.checked)}
            className="w-5 h-5 rounded mt-1"
          />
          <div>
            <AdminLabel htmlFor="monitoring-enabled" className="cursor-pointer mb-0">
              Enable Device Monitoring
            </AdminLabel>
            <AdminTextSmall className="mt-1">
              Automatically check device status and send email alerts when offline
            </AdminTextSmall>
          </div>
        </div>

        <div>
          <AdminLabel>Monitoring Schedule</AdminLabel>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <AdminTextSmall className="mb-2">Start Time</AdminTextSmall>
              <div className="flex gap-2">
                <select
                  value={startHour}
                  onChange={(e) => setStartHour(parseInt(e.target.value, 10))}
                  className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i} className="bg-gray-900 text-white">{formatTime(i, 0).split(':')[0]} {formatTime(i, 0).split(' ')[1]}</option>
                  ))}
                </select>
                <select
                  value={startMinute}
                  onChange={(e) => setStartMinute(parseInt(e.target.value, 10))}
                  className="w-20 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                >
                  <option value={0} className="bg-gray-900 text-white">:00</option>
                  <option value={15} className="bg-gray-900 text-white">:15</option>
                  <option value={30} className="bg-gray-900 text-white">:30</option>
                  <option value={45} className="bg-gray-900 text-white">:45</option>
                </select>
              </div>
            </div>
            
            <div>
              <AdminTextSmall className="mb-2">End Time</AdminTextSmall>
              <div className="flex gap-2">
                <select
                  value={endHour}
                  onChange={(e) => setEndHour(parseInt(e.target.value, 10))}
                  className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i} className="bg-gray-900 text-white">{formatTime(i, 0).split(':')[0]} {formatTime(i, 0).split(' ')[1]}</option>
                  ))}
                </select>
                <select
                  value={endMinute}
                  onChange={(e) => setEndMinute(parseInt(e.target.value, 10))}
                  className="w-20 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                >
                  <option value={0} className="bg-gray-900 text-white">:00</option>
                  <option value={15} className="bg-gray-900 text-white">:15</option>
                  <option value={30} className="bg-gray-900 text-white">:30</option>
                  <option value={45} className="bg-gray-900 text-white">:45</option>
                </select>
              </div>
            </div>
          </div>
          <AdminTextSmall className="mt-2">
            Current schedule: {formatTime(startHour, startMinute)} - {formatTime(endHour, endMinute)} CST
          </AdminTextSmall>
        </div>

        <div className="pt-4 border-t border-white/10">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-linear-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {saving ? '⏳ Saving...' : '💾 Save Monitoring Settings'}
          </button>
        </div>

        <div className="p-4 bg-blue-500/20 rounded-lg border border-blue-500/30">
          <AdminH4>ℹ️ How Device Monitoring Works</AdminH4>
          <ul className="space-y-1 mt-2">
            <li><AdminTextSmall>• Monitoring runs automatically during the scheduled time window</AdminTextSmall></li>
            <li><AdminTextSmall>• Devices are checked every 5 minutes when enabled</AdminTextSmall></li>
            <li><AdminTextSmall>• Email alerts are sent when devices go offline</AdminTextSmall></li>
            <li><AdminTextSmall>• Configure devices on the Device Status page</AdminTextSmall></li>
          </ul>
        </div>

        <div>
          <AdminLabel>Alert Email</AdminLabel>
          <input
            type="email"
            defaultValue="joeally5@gmail.com"
            disabled
            className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60"
          />
          <AdminTextSmall className="mt-1">
            Configure in .env.local as SMTP_USER
          </AdminTextSmall>
        </div>

        <div className="pt-4 border-t border-white/10">
          <Link
            href="/device-status"
            className="inline-block px-6 py-3 bg-linear-to-r from-blue-500 to-cyan-600 text-white rounded-lg hover:from-blue-600 hover:to-cyan-700 transition-all font-semibold"
          >
            View Device Monitor →
          </Link>
        </div>
      </div>
    </div>
  );
}

function DatabaseSettings() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/database/maintenance');
      const data = await response.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch database stats:', error);
      setMessage('❌ Failed to load database statistics');
    } finally {
      setLoading(false);
    }
  };

  const runMaintenance = async (action: string) => {
    try {
      setLoading(true);
      setMessage(`⏳ Running ${action} maintenance...`);
      
      const response = await fetch('/api/database/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Ensure session cookies are sent
        body: JSON.stringify({ action }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        // Handle authentication and other HTTP errors
        setMessage(`❌ Maintenance failed: ${data.error || 'Unknown error'}`);
        return;
      }
      
      if (data.success) {
        setMessage(`✅ ${action.charAt(0).toUpperCase() + action.slice(1)} maintenance completed successfully`);
        await fetchStats(); // Refresh stats
      } else {
        setMessage(`❌ Maintenance failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Maintenance error:', error);
      setMessage('❌ Maintenance operation failed');
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(''), 5000); // Clear message after 5 seconds
    }
  };

  // Load stats on component mount
  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
      <AdminH2>💾 Database Management</AdminH2>
      
      {message && (
        <div className="mb-6 p-4 bg-blue-500/20 rounded-lg border border-blue-500/30">
          <AdminInfo>{message}</AdminInfo>
        </div>
      )}

      <div className="space-y-6">
        {/* Database Statistics */}
        <div>
          <AdminH3>📊 Database Statistics</AdminH3>
          {loading && !stats ? (
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <AdminTextMuted>Loading statistics...</AdminTextMuted>
            </div>
          ) : stats ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <AdminTextSmall className="mb-1">Database Size</AdminTextSmall>
                <AdminValue>
                  {stats.approximateSizeMB?.toFixed(2) || '0'} MB
                </AdminValue>
              </div>
              
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <AdminTextSmall className="mb-1">Journal Mode</AdminTextSmall>
                <AdminValue>{stats.journalMode || 'Unknown'}</AdminValue>
              </div>
              
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <AdminTextSmall className="mb-1">Page Views</AdminTextSmall>
                <AdminValue>{stats.pageViews?.count?.toLocaleString() || '0'}</AdminValue>
              </div>
              
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <AdminTextSmall className="mb-1">Visitors</AdminTextSmall>
                <AdminValue>{stats.visitors?.count?.toLocaleString() || '0'}</AdminValue>
              </div>
              
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <AdminTextSmall className="mb-1">Song Requests</AdminTextSmall>
                <AdminValue>{stats.jukeboxQueue?.count?.toLocaleString() || '0'}</AdminValue>
              </div>
              
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <AdminTextSmall className="mb-1">Santa Letters</AdminTextSmall>
                <AdminValue>{stats.santaLetters?.count?.toLocaleString() || '0'}</AdminValue>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <AdminTextMuted>No statistics available</AdminTextMuted>
            </div>
          )}
        </div>

        {/* Maintenance Actions */}
        <div>
          <AdminH3>🔧 Maintenance Operations</AdminH3>
          <div className="space-y-3">
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <AdminH4>Quick Maintenance</AdminH4>
                  <AdminTextSmall>
                    Analyze database statistics for query optimization (fast, ~1 second)
                  </AdminTextSmall>
                </div>
                <button
                  onClick={() => runMaintenance('quick')}
                  disabled={loading}
                  className="ml-4 px-4 py-2 bg-blue-500/80 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Run Quick
                </button>
              </div>
            </div>

            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <AdminH4>Full Maintenance</AdminH4>
                  <AdminTextSmall>
                    ANALYZE, REINDEX, and VACUUM database (slow, ~30-60 seconds)
                  </AdminTextSmall>
                </div>
                <button
                  onClick={() => runMaintenance('full')}
                  disabled={loading}
                  className="ml-4 px-4 py-2 bg-purple-500/80 hover:bg-purple-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Run Full
                </button>
              </div>
            </div>

            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <AdminH4>Archive Old Data</AdminH4>
                  <AdminTextSmall>
                    Remove page views older than 1 year and device status older than 90 days
                  </AdminTextSmall>
                </div>
                <button
                  onClick={() => runMaintenance('archive')}
                  disabled={loading}
                  className="ml-4 px-4 py-2 bg-orange-500/80 hover:bg-orange-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Archive
                </button>
              </div>
            </div>

            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <AdminH4>Integrity Check</AdminH4>
                  <AdminTextSmall>
                    Verify database integrity and check for corruption
                  </AdminTextSmall>
                </div>
                <button
                  onClick={() => runMaintenance('integrity')}
                  disabled={loading}
                  className="ml-4 px-4 py-2 bg-green-500/80 hover:bg-green-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Check
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Automated Maintenance Info */}
        <div className="p-4 bg-green-500/20 rounded-lg border border-green-500/30">
          <AdminH4>✅ Automated Maintenance Active</AdminH4>
          <ul className="space-y-1">
            <li><AdminTextSmall>• Quick maintenance runs daily (every 24 hours)</AdminTextSmall></li>
            <li><AdminTextSmall>• Full maintenance runs weekly (every 7 days)</AdminTextSmall></li>
            <li><AdminTextSmall>• Data archival is MANUAL ONLY (use button above)</AdminTextSmall></li>
            <li><AdminTextSmall>• WAL mode enabled for better performance</AdminTextSmall></li>
            <li><AdminTextSmall>• 64MB cache size for faster queries</AdminTextSmall></li>
            <li><AdminTextSmall>• 30+ indexes created for optimal performance</AdminTextSmall></li>
          </ul>
        </div>

        <button
          onClick={fetchStats}
          disabled={loading}
          className="w-full px-6 py-3 bg-linear-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:from-cyan-600 hover:to-blue-700 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          🔄 Refresh Statistics
        </button>
      </div>
    </div>
  );
}

function YouTubeVideoSettings() {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVideo, setEditingVideo] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: '',
    youtubeUrl: '',
    description: '',
    theme: 'christmas' as 'christmas' | 'halloween'
  });

  // Load videos on mount
  useEffect(() => {
    loadVideos();
  }, []);

  const loadVideos = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/youtube-videos');
      const data = await response.json();
      
      if (data.success) {
        setVideos(data.videos || []);
      } else {
        setMessage(`❌ Failed to load videos: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to load videos:', error);
      setMessage('❌ Failed to load videos');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ title: '', youtubeUrl: '', description: '', theme: 'christmas' });
    setEditingVideo(null);
    setShowAddForm(false);
  };

  const handleAddVideo = async () => {
    if (!formData.youtubeUrl.trim()) {
      setMessage('❌ YouTube URL is required');
      return;
    }

    try {
      setSaving(true);
      setMessage('⏳ Adding video...');

      const response = await fetch('/api/admin/youtube-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          youtubeUrl: formData.youtubeUrl.trim(),
          title: formData.title.trim() || undefined,
          description: formData.description.trim() || undefined,
          theme: formData.theme,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage('✅ Video added successfully!');
        resetForm();
        await loadVideos();
      } else {
        setMessage(`❌ Failed to add video: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to add video:', error);
      setMessage('❌ Failed to add video');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const handleEditVideo = async () => {
    if (!editingVideo) return;

    try {
      setSaving(true);
      setMessage('⏳ Updating video...');

      const response = await fetch(`/api/admin/youtube-videos/${editingVideo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title.trim() || undefined,
          description: formData.description.trim() || undefined,
          theme: formData.theme,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage('✅ Video updated successfully!');
        resetForm();
        await loadVideos();
      } else {
        setMessage(`❌ Failed to update video: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to update video:', error);
      setMessage('❌ Failed to update video');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const handleDeleteVideo = async (videoId: number) => {
    if (!confirm('Are you sure you want to delete this video?')) return;

    try {
      setSaving(true);
      setMessage('⏳ Deleting video...');

      const response = await fetch(`/api/admin/youtube-videos/${videoId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setMessage('✅ Video deleted successfully!');
        await loadVideos();
      } else {
        setMessage(`❌ Failed to delete video: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to delete video:', error);
      setMessage('❌ Failed to delete video');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const startEdit = (video: any) => {
    setEditingVideo(video);
    setFormData({
      title: video.title || '',
      youtubeUrl: `https://www.youtube.com/watch?v=${video.youtube_id}`,
      description: video.description || '',
      theme: video.theme || 'christmas'
    });
    setShowAddForm(true);
  };

  if (loading) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <AdminH2>🎬 YouTube Video Management</AdminH2>
        <p className="text-white/60 mt-4">Loading videos...</p>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
      <AdminH2>🎬 YouTube Video Management</AdminH2>
      
      <AdminText className="mb-6">
        Manage YouTube videos available for playback on the jukebox page. Videos are publicly accessible for all visitors.
      </AdminText>

      {message && (
        <div className="mb-6 p-4 bg-blue-500/20 rounded-lg border border-blue-500/30">
          <AdminInfo>{message}</AdminInfo>
        </div>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="mb-6 p-6 bg-white/5 rounded-lg border border-white/10">
          <AdminH3>{editingVideo ? '✏️ Edit Video' : '➕ Add New Video'}</AdminH3>
          
          <div className="space-y-4 mt-4">
            <div>
              <AdminLabel>YouTube URL *</AdminLabel>
              <input
                type="url"
                value={formData.youtubeUrl}
                onChange={(e) => setFormData(prev => ({ ...prev, youtubeUrl: e.target.value }))}
                placeholder="https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID"
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50"
                disabled={editingVideo !== null} // Can't change URL when editing
              />
              <AdminTextSmall className="mt-1">
                {editingVideo ? 'URL cannot be changed when editing' : 'Paste the full YouTube URL'}
              </AdminTextSmall>
            </div>

            <div>
              <AdminLabel>Title (Optional)</AdminLabel>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Custom title (leave empty to use YouTube title)"
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50"
              />
              <AdminTextSmall className="mt-1">
                Leave empty to automatically use the YouTube video title
              </AdminTextSmall>
            </div>

            <div>
              <AdminLabel>Description (Optional)</AdminLabel>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description for this video"
                rows={3}
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 resize-vertical"
              />
            </div>

            <div>
              <AdminLabel>Theme *</AdminLabel>
              <select
                value={formData.theme}
                onChange={(e) => setFormData(prev => ({ ...prev, theme: e.target.value as 'christmas' | 'halloween' }))}
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
              >
                <option value="christmas" className="bg-gray-900 text-white">🎄 Christmas</option>
                <option value="halloween" className="bg-gray-900 text-white">🎃 Halloween</option>
              </select>
              <AdminTextSmall className="mt-1">
                Video will only show on the jukebox when this theme is active
              </AdminTextSmall>
            </div>

            <div className="flex gap-3">
              <button
                onClick={editingVideo ? handleEditVideo : handleAddVideo}
                disabled={saving}
                className="px-6 py-2 bg-linear-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? '⏳ Saving...' : (editingVideo ? '💾 Update Video' : '➕ Add Video')}
              </button>
              
              <button
                onClick={resetForm}
                className="px-6 py-2 bg-gray-500/80 hover:bg-gray-600 text-white rounded-lg transition-all font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Videos List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <AdminH3>📹 Available Videos ({videos.length})</AdminH3>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-linear-to-r from-blue-500 to-cyan-600 text-white rounded-lg hover:from-blue-600 hover:to-cyan-700 transition-all font-semibold"
            >
              ➕ Add Video
            </button>
          )}
        </div>

        {videos.length === 0 ? (
          <div className="p-8 bg-white/5 rounded-lg border border-white/10 text-center">
            <AdminTextMuted>No videos added yet</AdminTextMuted>
            <AdminTextSmall className="mt-2">
              Click "Add Video" to add your first YouTube video for the jukebox
            </AdminTextSmall>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {videos.map((video) => (
              <div key={video.id} className="p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-start gap-3">
                  {video.thumbnail_url && (
                    <img
                      src={video.thumbnail_url}
                      alt={video.title}
                      className="w-20 h-12 object-cover rounded"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <AdminH4 className="truncate">{video.title}</AdminH4>
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        video.theme === 'christmas' 
                          ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                          : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                      }`}>
                        {video.theme === 'christmas' ? '🎄 Christmas' : '🎃 Halloween'}
                      </span>
                    </div>
                    <AdminTextSmall className="text-white/60">
                      {video.youtube_id}
                    </AdminTextSmall>
                    {video.description && (
                      <AdminTextSmall className="mt-1 block">
                        {video.description}
                      </AdminTextSmall>
                    )}
                    <AdminTextSmall className="mt-1 text-white/40">
                      Added {formatDateTime(video.created_at, 'medium')}
                    </AdminTextSmall>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => startEdit(video)}
                    className="px-3 py-1 bg-yellow-500/80 hover:bg-yellow-600 text-white rounded text-sm font-semibold transition-all"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => handleDeleteVideo(video.id)}
                    disabled={saving}
                    className="px-3 py-1 bg-red-500/80 hover:bg-red-600 text-white rounded text-sm font-semibold transition-all disabled:opacity-50"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="mt-6 p-4 bg-blue-500/20 rounded-lg border border-blue-500/30">
        <AdminH4>ℹ️ How It Works</AdminH4>
        <ul className="space-y-1 mt-2">
          <li><AdminTextSmall>• Videos are filtered by the currently active theme</AdminTextSmall></li>
          <li><AdminTextSmall>• Christmas videos only show when Christmas theme is active</AdminTextSmall></li>
          <li><AdminTextSmall>• Halloween videos only show when Halloween theme is active</AdminTextSmall></li>
          <li><AdminTextSmall>• Visitors can select and watch any video for the active theme</AdminTextSmall></li>
          <li><AdminTextSmall>• YouTube handles all video streaming and playback</AdminTextSmall></li>
          <li><AdminTextSmall>• Titles and thumbnails are automatically fetched from YouTube</AdminTextSmall></li>
          <li><AdminTextSmall>• Only you (admin) can add, edit, or delete videos</AdminTextSmall></li>
        </ul>
      </div>
    </div>
  );
}

interface JukeboxUser {
  ip: string;
  name: string;
  requestCount: number;
  lastRequest: string;
  firstRequest: string;
}

function GameSettingsSection() {
  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
      <GameSettings />
    </div>
  );
}

function JukeboxSettings() {
  const [rateLimit, setRateLimit] = useState<number>(3);
  const [insertMode, setInsertMode] = useState<string>('after_current');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [jukeboxUsers, setJukeboxUsers] = useState<JukeboxUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [refreshingCache, setRefreshingCache] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<{ count: number; lastRefresh: string | null }>({ count: 0, lastRefresh: null });

  useEffect(() => {
    fetchSettings();
    fetchJukeboxUsers();
    fetchCacheInfo();
  }, []);

  async function fetchSettings() {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        setRateLimit(parseInt(data.settings.jukebox_rate_limit || '3', 10));
        setInsertMode(data.settings.jukebox_insert_mode || 'after_current');
      }
    } catch (err) {
      console.error('Error fetching jukebox settings:', err);
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function fetchJukeboxUsers() {
    setLoadingUsers(true);
    try {
      const response = await fetch('/api/jukebox/users');
      if (response.ok) {
        const data = await response.json();
        setJukeboxUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching jukebox users:', error);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function fetchCacheInfo() {
    try {
      const response = await fetch('/api/jukebox/sequences');
      if (response.ok) {
        const data = await response.json();
        setCacheInfo({
          count: data.sequences?.length || 0,
          lastRefresh: data.lastRefresh || null
        });
      }
    } catch (error) {
      console.error('Error fetching cache info:', error);
    }
  }

  async function handleRefreshCache() {
    setRefreshingCache(true);
    setSuccess('');
    setError('');

    try {
      const response = await fetch('/api/jukebox/refresh-cache', {
        method: 'POST'
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(`✅ Cache refreshed! ${data.sequencesCached} sequences loaded.`);
        await fetchCacheInfo();
      } else {
        const errorMsg = data.details || data.error || 'Failed to refresh cache';
        if (data.error === 'FPP is offline') {
          setError('⚠️ FPP is offline. Cannot refresh cache at this time.');
        } else if (data.error === 'FPP server timeout') {
          setError('⏱️ FPP server timeout. The server may be offline or busy.');
        } else {
          setError(`❌ ${errorMsg}`);
        }
      }
    } catch (err) {
      console.error('Error refreshing cache:', err);
      setError('❌ Network error while refreshing cache.');
    } finally {
      setRefreshingCache(false);
      setTimeout(() => {
        setSuccess('');
        setError('');
      }, 5000);
    }
  }

  async function handleClearUserRateLimit(userIp: string, userName: string) {
    if (!confirm(`Clear rate limit for ${userName}? This will allow them to make new requests immediately.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/jukebox/users?ip=${encodeURIComponent(userIp)}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message);
        setTimeout(() => setSuccess(''), 3000);
        fetchJukeboxUsers(); // Refresh the list
      } else {
        setError(data.error || 'Failed to clear rate limit');
        setTimeout(() => setError(''), 3000);
      }
    } catch (error) {
      console.error('Error clearing rate limit:', error);
      setError('Failed to clear rate limit');
      setTimeout(() => setError(''), 3000);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSuccess('');
    setError('');

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            jukebox_rate_limit: rateLimit.toString(),
            jukebox_insert_mode: insertMode
          }
        })
      });

      if (response.ok) {
        setSuccess('✅ Settings saved successfully!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save settings');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <AdminH2>🎵 Jukebox Settings</AdminH2>
        <AdminTextMuted>Loading...</AdminTextMuted>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <AdminH2>🎵 Jukebox Settings</AdminH2>
        <AdminTextMuted>
          Configure song request behavior and rate limiting
        </AdminTextMuted>

        {success && <AdminSuccess className="mt-4">{success}</AdminSuccess>}
        {error && <AdminError className="mt-4">{error}</AdminError>}

        {/* Rate Limit Section */}
        <div className="mt-6 space-y-4">
          <div>
            <AdminH3>⏱️ Rate Limit</AdminH3>
            <AdminTextMuted>
              Maximum number of song requests per hour per visitor
            </AdminTextMuted>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="1"
                max="10"
                value={rateLimit}
                onChange={(e) => setRateLimit(parseInt(e.target.value, 10))}
                className="flex-1 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, #10b981 0%, #10b981 ${((rateLimit - 1) / 9) * 100}%, rgba(255,255,255,0.2) ${((rateLimit - 1) / 9) * 100}%, rgba(255,255,255,0.2) 100%)`
                }}
              />
              <div className="text-white font-bold text-2xl w-16 text-center">
                {rateLimit}
              </div>
            </div>

            <div className="flex justify-between text-sm text-white/60">
              <span>1 (Strict)</span>
              <span>5 (Moderate)</span>
              <span>10 (Generous)</span>
            </div>

            <AdminInfo>
              Current setting: <strong>{rateLimit} requests per hour</strong>
            </AdminInfo>
          </div>
        </div>

        {/* Insert Mode Section */}
        <div className="mt-8 space-y-4">
          <div>
            <AdminH3>🎶 Queue Insertion Behavior</AdminH3>
            <AdminTextMuted>
              How requested songs are inserted into the playlist
            </AdminTextMuted>
          </div>

          <div className="space-y-3">
            <label className="flex items-start gap-3 p-4 bg-white/5 rounded-lg border border-white/20 cursor-pointer hover:bg-white/10 transition-all">
              <input
                type="radio"
                name="insertMode"
                value="after_current"
                checked={insertMode === 'after_current'}
                onChange={(e) => setInsertMode(e.target.value)}
                className="mt-1"
              />
              <div className="flex-1">
                <AdminLabel>🎵 After Current (Recommended)</AdminLabel>
                <AdminTextSmall className="text-white/60">
                  Request plays after the current song finishes. Provides smooth transitions without interruption.
                </AdminTextSmall>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 bg-white/5 rounded-lg border border-white/20 cursor-pointer hover:bg-white/10 transition-all">
              <input
                type="radio"
                name="insertMode"
                value="interrupt"
                checked={insertMode === 'interrupt'}
                onChange={(e) => setInsertMode(e.target.value)}
                className="mt-1"
              />
              <div className="flex-1">
                <AdminLabel>⚡ Interrupt</AdminLabel>
                <AdminTextSmall className="text-white/60">
                  Pauses current song, plays request, then resumes. Immediate but disruptive.
                </AdminTextSmall>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 bg-white/5 rounded-lg border border-white/20 cursor-pointer hover:bg-white/10 transition-all">
              <input
                type="radio"
                name="insertMode"
                value="end_of_playlist"
                checked={insertMode === 'end_of_playlist'}
                onChange={(e) => setInsertMode(e.target.value)}
                className="mt-1"
              />
              <div className="flex-1">
                <AdminLabel>📋 End of Playlist</AdminLabel>
                <AdminTextSmall className="text-white/60">
                  Adds request to the end of the queue. Longer wait time but no interruption.
                </AdminTextSmall>
              </div>
            </label>
          </div>

          <AdminInfo>
            Current mode: <strong>
              {insertMode === 'after_current' && '🎵 After Current'}
              {insertMode === 'interrupt' && '⚡ Interrupt'}
              {insertMode === 'end_of_playlist' && '📋 End of Playlist'}
            </strong>
          </AdminInfo>
        </div>

        {/* Save Button */}
        <div className="mt-8 flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '⏳ Saving...' : '💾 Save Settings'}
          </button>
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <AdminH3>ℹ️ How It Works</AdminH3>
        <ul className="space-y-2 mt-4">
          <li><AdminTextSmall>• <strong>Rate Limiting:</strong> Prevents spam by limiting requests per visitor (tracked by IP)</AdminTextSmall></li>
          <li><AdminTextSmall>• <strong>After Current:</strong> Best user experience - no interruption, smooth transitions</AdminTextSmall></li>
          <li><AdminTextSmall>• <strong>Interrupt:</strong> Fastest response - request plays immediately</AdminTextSmall></li>
          <li><AdminTextSmall>• <strong>End of Playlist:</strong> Traditional queue - maintains playlist order</AdminTextSmall></li>
          <li><AdminTextSmall>• Settings take effect immediately for all new requests</AdminTextSmall></li>
          <li><AdminTextSmall>• Visitors see the current rate limit and queue behavior on the request page</AdminTextSmall></li>
        </ul>
      </div>

      {/* Sequence Cache Management */}
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <AdminH3>🎵 Song Cache Management</AdminH3>
            <AdminTextMuted>
              Refresh the list of available songs from FPP
            </AdminTextMuted>
          </div>
        </div>

        {/* Cache Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <AdminTextSmall className="mb-1">Cached Songs</AdminTextSmall>
            <AdminValue>{cacheInfo.count}</AdminValue>
          </div>
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <AdminTextSmall className="mb-1">Cache Status</AdminTextSmall>
            <AdminValue>
              {cacheInfo.count > 0 ? (
                <span className="text-green-400">✅ Active</span>
              ) : (
                <span className="text-yellow-400">⚠️ Empty</span>
              )}
            </AdminValue>
          </div>
        </div>

        {/* Refresh Button */}
        <div className="space-y-4">
          <button
            onClick={handleRefreshCache}
            disabled={refreshingCache}
            className="w-full px-6 py-3 bg-linear-to-r from-blue-500 to-cyan-600 text-white rounded-lg hover:from-blue-600 hover:to-cyan-700 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {refreshingCache ? '🔄 Refreshing...' : '🔄 Refresh Song Cache from FPP'}
          </button>

          <AdminTextSmall className="text-white/60">
            This fetches the latest playlist from your FPP server and updates the available songs for visitors to request.
          </AdminTextSmall>
        </div>

        {/* Info Box */}
        <div className="mt-6 p-4 bg-blue-500/20 rounded-lg border border-blue-500/30">
          <AdminH4>ℹ️ When to Refresh</AdminH4>
          <ul className="space-y-1 mt-2">
            <li><AdminTextSmall>• After adding or removing songs from your FPP playlist</AdminTextSmall></li>
            <li><AdminTextSmall>• After reordering songs in FPP</AdminTextSmall></li>
            <li><AdminTextSmall>• If visitors report missing songs</AdminTextSmall></li>
            <li><AdminTextSmall>• The cache also refreshes automatically in the background when admins visit the jukebox page</AdminTextSmall></li>
          </ul>
        </div>
      </div>

      {/* Unified Banner Configuration */}
      <BannerSettings />

      {/* User Rate Limit Management */}
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <AdminH3>👥 User Rate Limits</AdminH3>
            <AdminTextMuted>
              View and manage users with active requests in the last hour
            </AdminTextMuted>
          </div>
          <button
            onClick={fetchJukeboxUsers}
            disabled={loadingUsers}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {loadingUsers ? '🔄 Loading...' : '🔄 Refresh'}
          </button>
        </div>

        {jukeboxUsers.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">👻</div>
            <AdminH4 className="text-white/80 mb-2">No Active Users</AdminH4>
            <AdminTextMuted>No song requests in the last hour</AdminTextMuted>
          </div>
        ) : (
          <div className="space-y-3">
            {jukeboxUsers.map((user) => {
              const percentage = Math.min(100, (user.requestCount / rateLimit) * 100);
              const isAtLimit = user.requestCount >= rateLimit;
              
              return (
                <div 
                  key={user.ip}
                  className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/20 hover:border-blue-400/50 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <AdminH4 className="text-white">{user.name}</AdminH4>
                        {isAtLimit && (
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-300 text-xs font-semibold rounded border border-red-500/30">
                            🚫 RATE LIMITED
                          </span>
                        )}
                      </div>
                      <AdminTextSmall className="text-white/50">
                        IP: {user.ip}
                      </AdminTextSmall>
                      <AdminTextSmall className="text-white/60">
                        Last request: {formatDateTime(user.lastRequest, 'relative')}
                      </AdminTextSmall>
                    </div>
                    
                    <button
                      onClick={() => handleClearUserRateLimit(user.ip, user.name)}
                      className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded transition-all shadow-md hover:shadow-lg"
                      title="Clear rate limit for this user"
                    >
                      🗑️ Clear
                    </button>
                  </div>

                  {/* Request count progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <AdminTextSmall className="text-white/70">
                        {user.requestCount} / {rateLimit} requests
                      </AdminTextSmall>
                      <AdminTextSmall className="text-white/70 font-semibold">
                        {Math.round(percentage)}%
                      </AdminTextSmall>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          percentage >= 100 ? 'bg-red-500' : 
                          percentage >= 80 ? 'bg-yellow-500' : 
                          'bg-green-500'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
          <div className="flex items-start gap-2">
            <span className="text-yellow-400 text-xl">💡</span>
            <div className="flex-1">
              <AdminTextSmall className="text-yellow-200">
                <strong>Tip:</strong> Clearing a user's rate limit removes their request history for the last hour, allowing them to make new requests immediately. Songs currently playing are preserved.
              </AdminTextSmall>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LocationRestrictions() {
  const [enabled, setEnabled] = useState(false);
  const [maxDistance, setMaxDistance] = useState(1);
  const [showLat, setShowLat] = useState('');
  const [showLng, setShowLng] = useState('');
  const [locationName, setLocationName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      const response = await fetch('/api/location-restrictions');
      if (!response.ok) throw new Error('Failed to fetch location restrictions');
      
      const data = await response.json();
      setEnabled(data.enabled);
      setMaxDistance(data.max_distance_miles || 1);
      setShowLat(data.show_latitude?.toString() || '');
      setShowLng(data.show_longitude?.toString() || '');
      setLocationName(data.location_name || '');
    } catch (err) {
      console.error('Error fetching location restrictions:', err);
      setError('Failed to load location settings');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSuccess('');
    setError('');
    setSaving(true);

    try {
      // Validate coordinates if enabled
      if (enabled && (!showLat || !showLng)) {
        throw new Error('Show location coordinates are required when restrictions are enabled');
      }

      const lat = parseFloat(showLat);
      const lng = parseFloat(showLng);

      if (enabled && (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
        throw new Error('Invalid coordinates. Latitude must be -90 to 90, Longitude must be -180 to 180');
      }

      const response = await fetch('/api/location-restrictions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          max_distance_miles: maxDistance,
          show_latitude: lat || null,
          show_longitude: lng || null,
          location_name: locationName || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save settings');
      }

      setSuccess('✅ Location restrictions updated successfully!');
      setTimeout(() => setSuccess(''), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setShowLat(position.coords.latitude.toFixed(6));
        setShowLng(position.coords.longitude.toFixed(6));
        setSuccess('📍 Location captured! Don\'t forget to save.');
        setTimeout(() => setSuccess(''), 3000);
      },
      (err) => {
        setError(`Failed to get location: ${err.message}`);
      }
    );
  }

  if (loading) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <AdminH2>📍 Location Restrictions</AdminH2>
        <AdminTextMuted>Loading...</AdminTextMuted>
      </div>
    );
  }

  const mapsUrl = showLat && showLng 
    ? `https://www.google.com/maps?q=${showLat},${showLng}` 
    : null;

  return (
    <div className="space-y-6">
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <AdminH2>📍 Location Restrictions</AdminH2>
        <AdminTextMuted>
          Prevent remote users from disrupting your light show by restricting song requests to on-site visitors
        </AdminTextMuted>

        {success && <AdminSuccess className="mt-4">{success}</AdminSuccess>}
        {error && <AdminError className="mt-4">{error}</AdminError>}

        {/* Enable/Disable Section */}
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-4 p-4 bg-white/5 rounded-lg border border-white/20">
            <input
              type="checkbox"
              id="locationEnabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-5 h-5 cursor-pointer"
            />
            <label htmlFor="locationEnabled" className="flex-1 cursor-pointer">
              <AdminLabel>Enable Location Restrictions</AdminLabel>
              <AdminTextSmall className="text-white/60">
                When enabled, only users within the specified distance can request songs
              </AdminTextSmall>
            </label>
          </div>

          {enabled && (
            <AdminInfo>
              ⚠️ Make sure to configure your show location below before enabling
            </AdminInfo>
          )}
        </div>

        {/* Show Location Section */}
        <div className="mt-8 space-y-4">
          <div>
            <AdminH3>📍 Show Location</AdminH3>
            <AdminTextMuted>
              Set the GPS coordinates of your light show
            </AdminTextMuted>
          </div>

          <div className="space-y-4">
            <div>
              <AdminLabel>Location Name (Optional)</AdminLabel>
              <input
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="e.g., 123 Main Street, Anytown USA"
                className="w-full mt-2 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-blue-400"
              />
              <AdminTextSmall className="text-white/60 mt-1">
                Friendly name to help you remember this location
              </AdminTextSmall>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <AdminLabel>Latitude *</AdminLabel>
                <input
                  type="number"
                  step="0.000001"
                  value={showLat}
                  onChange={(e) => setShowLat(e.target.value)}
                  placeholder="40.712776"
                  className="w-full mt-2 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-blue-400"
                />
              </div>

              <div>
                <AdminLabel>Longitude *</AdminLabel>
                <input
                  type="number"
                  step="0.000001"
                  value={showLng}
                  onChange={(e) => setShowLng(e.target.value)}
                  placeholder="-74.005974"
                  className="w-full mt-2 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleUseCurrentLocation}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-all shadow-lg"
              >
                📍 Use My Current Location
              </button>

              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-all shadow-lg"
                >
                  🗺️ View on Google Maps
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Distance Restriction Section */}
        <div className="mt-8 space-y-4">
          <div>
            <AdminH3>🎯 Maximum Distance</AdminH3>
            <AdminTextMuted>
              How far from the show location can users request songs
            </AdminTextMuted>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={maxDistance}
                onChange={(e) => setMaxDistance(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, #10b981 0%, #10b981 ${((maxDistance - 0.1) / 9.9) * 100}%, rgba(255,255,255,0.2) ${((maxDistance - 0.1) / 9.9) * 100}%, rgba(255,255,255,0.2) 100%)`
                }}
              />
              <div className="text-white font-bold text-2xl w-20 text-center">
                {maxDistance.toFixed(1)}
              </div>
            </div>

            <div className="flex justify-between text-sm text-white/60">
              <span>0.1 mi (Very Close)</span>
              <span>5 mi (Moderate)</span>
              <span>10 mi (Wide Area)</span>
            </div>

            <AdminInfo>
              Current setting: Users must be within <strong>{maxDistance.toFixed(1)} miles</strong> of the show location
            </AdminInfo>
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-8 flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '⏳ Saving...' : '💾 Save Settings'}
          </button>
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <AdminH3>ℹ️ How It Works</AdminH3>
        <ul className="space-y-2 mt-4">
          <li><AdminTextSmall>• <strong>Geolocation:</strong> User's location is determined from their IP address when they request a song</AdminTextSmall></li>
          <li><AdminTextSmall>• <strong>Distance Check:</strong> System calculates the distance between the user and your show location</AdminTextSmall></li>
          <li><AdminTextSmall>• <strong>Blocking:</strong> Requests from users outside the radius are blocked with a friendly message</AdminTextSmall></li>
          <li><AdminTextSmall>• <strong>Accuracy:</strong> IP-based geolocation is typically accurate to within 3-10 miles in urban areas</AdminTextSmall></li>
          <li><AdminTextSmall>• <strong>Graceful Degradation:</strong> If location lookup fails, the request is allowed (don't punish users for API issues)</AdminTextSmall></li>
          <li><AdminTextSmall>• <strong>Privacy:</strong> Location data is stored only for analytics and troubleshooting</AdminTextSmall></li>
        </ul>
      </div>

      {/* Security Notice */}
      <div className="bg-yellow-500/10 backdrop-blur-md rounded-xl p-6 border border-yellow-500/30">
        <div className="flex items-start gap-3">
          <span className="text-yellow-400 text-2xl">⚠️</span>
          <div className="flex-1">
            <AdminH4 className="text-yellow-200 mb-2">Important Notes</AdminH4>
            <ul className="space-y-2">
              <li><AdminTextSmall className="text-yellow-100">• <strong>VPN/Proxy Users:</strong> Users on VPNs or proxies may be blocked if their apparent location is outside the radius</AdminTextSmall></li>
              <li><AdminTextSmall className="text-yellow-100">• <strong>Mobile Data:</strong> Cell phone IP addresses may show locations near cell towers, not the actual user location</AdminTextSmall></li>
              <li><AdminTextSmall className="text-yellow-100">• <strong>Testing:</strong> Test with your own device first to ensure the radius is appropriate</AdminTextSmall></li>
              <li><AdminTextSmall className="text-yellow-100">• <strong>Local Networks:</strong> Users on the same local network (192.168.x.x, 10.x.x.x) are not subject to location checks</AdminTextSmall></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
