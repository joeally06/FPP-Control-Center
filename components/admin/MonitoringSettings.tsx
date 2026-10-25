'use client';

import { useState, useEffect } from 'react';
import {
  AdminH2,
  AdminTextMuted,
  AdminTextSmall,
  AdminLabel,
} from '@/components/admin/Typography';
import { card, field, sizedField, accentButton, choiceCard, checkInput, notice } from '@/components/admin/ui-classes';

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
      <div className={card}>
        <AdminH2>Device Monitoring Settings</AdminH2>
        <AdminTextMuted>Loading settings...</AdminTextMuted>
      </div>
    );
  }

  return (
    <div className={`${card} max-w-3xl`}>
      <AdminH2 className="mb-1">Device Monitoring Settings</AdminH2>
      <AdminTextMuted>
        During the scheduled window, enabled devices are checked every 5 minutes and an email alert goes out when one goes offline.
      </AdminTextMuted>

      {message && (
        <p className={`${notice.info} mt-4`}>{message}</p>
      )}

      <div className="mt-6 space-y-6">
        <label className={choiceCard}>
          <input
            type="checkbox"
            checked={monitoringEnabled}
            onChange={(e) => setMonitoringEnabled(e.target.checked)}
            className={checkInput}
          />
          <div>
            <p className="text-sm font-medium text-adm-text">Enable Device Monitoring</p>
            <p className="mt-0.5 text-[13px] text-adm-muted">
              Automatically check device status and send email alerts when offline
            </p>
          </div>
        </label>

        <fieldset>
          <legend className="admin-label">Monitoring Schedule</legend>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <AdminLabel htmlFor="monitoring-start-hour">Start Time</AdminLabel>
              <div className="flex gap-2">
                <select
                  id="monitoring-start-hour"
                  value={startHour}
                  onChange={(e) => setStartHour(parseInt(e.target.value, 10))}
                  className={`${field} flex-1`}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{formatTime(i, 0).split(':')[0]} {formatTime(i, 0).split(' ')[1]}</option>
                  ))}
                </select>
                <select
                  value={startMinute}
                  onChange={(e) => setStartMinute(parseInt(e.target.value, 10))}
                  aria-label="Start minute"
                  className={`${sizedField} w-24`}
                >
                  <option value={0}>:00</option>
                  <option value={15}>:15</option>
                  <option value={30}>:30</option>
                  <option value={45}>:45</option>
                </select>
              </div>
            </div>

            <div>
              <AdminLabel htmlFor="monitoring-end-hour">End Time</AdminLabel>
              <div className="flex gap-2">
                <select
                  id="monitoring-end-hour"
                  value={endHour}
                  onChange={(e) => setEndHour(parseInt(e.target.value, 10))}
                  className={`${field} flex-1`}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{formatTime(i, 0).split(':')[0]} {formatTime(i, 0).split(' ')[1]}</option>
                  ))}
                </select>
                <select
                  value={endMinute}
                  onChange={(e) => setEndMinute(parseInt(e.target.value, 10))}
                  aria-label="End minute"
                  className={`${sizedField} w-24`}
                >
                  <option value={0}>:00</option>
                  <option value={15}>:15</option>
                  <option value={30}>:30</option>
                  <option value={45}>:45</option>
                </select>
              </div>
            </div>
          </div>
          <AdminTextSmall className="mt-2">
            Current schedule: {formatTime(startHour, startMinute)} - {formatTime(endHour, endMinute)} CST
          </AdminTextSmall>
        </fieldset>

        <div>
          <AdminLabel htmlFor="monitoring-alert-email">Alert Email</AdminLabel>
          <input
            id="monitoring-alert-email"
            type="email"
            defaultValue="joeally5@gmail.com"
            disabled
            className={field}
          />
          <AdminTextSmall className="mt-1">
            Configure in .env.local as SMTP_USER
          </AdminTextSmall>
        </div>

        <div className="border-t border-adm-line pt-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className={accentButton}
          >
            {saving ? 'Saving...' : 'Save Monitoring Settings'}
          </button>
        </div>

      </div>
    </div>
  );
}
