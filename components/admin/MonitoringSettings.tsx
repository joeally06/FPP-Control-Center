'use client';

import { useState, useEffect } from 'react';
import {
  AdminH2,
  AdminH4,
  AdminTextSmall,
  AdminLabel,
  AdminInfo,
} from '@/components/admin/Typography';

// onSaved lets the host page refresh anything that shows the schedule
export default function MonitoringSettings({ onSaved }: { onSaved?: () => void }) {
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
        onSaved?.();
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

      </div>
    </div>
  );
}
