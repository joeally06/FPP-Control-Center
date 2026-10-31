'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import MonitoringSettings from '@/components/admin/MonitoringSettings';
import { formatDateTime } from '@/lib/time-utils';
import { TIMING } from '@/lib/constants';
import { Plus, RefreshCw, Pencil, Trash2, Clock, BellOff, Mail, TriangleAlert } from 'lucide-react';
import { 
  AdminH1, 
  AdminH3,
  AdminTextMuted,
  AdminTextSmall,
  AdminTextTiny,
  AdminLabel,
  AdminValue,
} from '@/components/admin/Typography';
import { card, insetBox, eyebrow, button, accentButton, dangerButton, iconButton, iconDangerButton, field, choiceCard, checkInput, badge } from '@/components/admin/ui-classes';

interface Device {
  id: string;
  name: string;
  type: string;
  ip: string;
  enabled: boolean;
  description: string | null;
}

interface DeviceStatus {
  device_id: string;
  is_online: boolean;
  last_checked: string;
  last_seen_online: string | null;
  consecutive_failures: number;
  last_notified: string | null;
}

interface MonitoringSchedule {
  id: number;
  enabled: boolean;
  start_time: string;
  end_time: string;
  timezone: string;
  updated_at: string;
}

export default function DeviceStatusPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [statuses, setStatuses] = useState<Record<string, DeviceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [schedule, setSchedule] = useState<MonitoringSchedule | null>(null);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    type: '',
    ip: '',
    enabled: true,
    description: '',
  });

  // Get unique device types from existing devices
  const getUniqueTypes = () => {
    const types = new Set(devices.map(d => d.type));
    return Array.from(types).sort();
  };

  // Format type for display (capitalize first letter)
  const formatType = (type: string) => {
    if (!type) return '';
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const loadDeviceStatuses = async () => {
    try {
      const response = await fetch('/api/devices/status');
      const data = await response.json();
      
      if (data.success) {
        setDevices(data.devices);
        
        // Convert statuses array to object keyed by device_id
        const statusMap: Record<string, DeviceStatus> = {};
        data.statuses.forEach((status: DeviceStatus) => {
          statusMap[status.device_id] = status;
        });
        setStatuses(statusMap);
      }
    } catch (error) {
      console.error('Error loading device statuses:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSchedule = async () => {
    try {
      const response = await fetch('/api/devices/schedule');
      const data = await response.json();
      
      if (data.success && data.schedule) {
        setSchedule(data.schedule);
      }
    } catch (error) {
      console.error('Error loading schedule:', error);
    }
  };

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const response = await fetch('/api/devices/check');
      const data = await response.json();
      
      if (data.success) {
        // Reload statuses after check
        await loadDeviceStatuses();
      }
    } catch (error) {
      console.error('Error checking devices:', error);
    } finally {
      setChecking(false);
    }
  };

  function openAddModal() {
    setFormData({
      id: '',
      name: '',
      type: '',
      ip: '',
      enabled: true,
      description: '',
    });
    setShowAddModal(true);
  }

  function openEditModal(device: Device) {
    setSelectedDevice(device);
    setFormData({
      id: device.id,
      name: device.name,
      type: device.type,
      ip: device.ip,
      enabled: device.enabled,
      description: device.description || '',
    });
    setShowEditModal(true);
  }

  function openDeleteModal(device: Device) {
    setSelectedDevice(device);
    setShowDeleteModal(true);
  }

  async function handleAddDevice() {
    try {
      const response = await fetch('/api/devices/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Failed to add device');
        return;
      }

      setShowAddModal(false);
      await loadDeviceStatuses();
    } catch (error) {
      console.error('Failed to add device:', error);
      alert('Failed to add device');
    }
  }

  async function handleUpdateDevice() {
    try {
      const response = await fetch('/api/devices/manage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Failed to update device');
        return;
      }

      setShowEditModal(false);
      await loadDeviceStatuses();
    } catch (error) {
      console.error('Failed to update device:', error);
      alert('Failed to update device');
    }
  }

  async function handleDeleteDevice() {
    if (!selectedDevice) return;

    try {
      const response = await fetch(`/api/devices/manage?id=${selectedDevice.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Failed to delete device');
        return;
      }

      setShowDeleteModal(false);
      await loadDeviceStatuses();
    } catch (error) {
      console.error('Failed to delete device:', error);
      alert('Failed to delete device');
    }
  }

  function formatTime12Hour(time24: string): string {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  useEffect(() => {
    loadDeviceStatuses();
    loadSchedule();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadDeviceStatuses, TIMING.POLL_INTERVAL_SLOW);
    
    return () => clearInterval(interval);
  }, []);

  // Card border for a device: disabled or not checked yet, online, offline
  const getStatusColor = (deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device || !device.enabled) return 'border-adm-line';

    const status = statuses[deviceId];
    if (!status) return 'border-adm-line';
    return status.is_online ? 'border-adm-ok-line' : 'border-adm-danger-line';
  };

  const getStatusBadge = (deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device || !device.enabled) return badge.neutral;

    const status = statuses[deviceId];
    if (!status) return badge.neutral;
    return status.is_online ? badge.ok : badge.danger;
  };

  const getStatusText = (deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device || !device.enabled) return 'DISABLED';

    const status = statuses[deviceId];
    if (!status) return 'Unknown';
    return status.is_online ? 'ONLINE' : 'OFFLINE';
  };

  const totalDevices = devices.length;
  const enabledDevices = devices.filter(d => d.enabled);
  const onlineDevices = enabledDevices.filter(d => statuses[d.id]?.is_online).length;
  const offlineDevices = enabledDevices.length - onlineDevices;

  if (loading) {
    return (
      <AdminLayout>
        <AdminTextMuted>Loading device status...</AdminTextMuted>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <AdminH1 className="mb-1.5">Device Monitor</AdminH1>
            <AdminTextMuted>
              Real-time monitoring of network devices. Auto-refreshes every 30 seconds.
            </AdminTextMuted>
            {schedule && (
              <p className={`mt-3 ${schedule.enabled ? badge.ok : badge.danger} items-center gap-1.5`}>
                {schedule.enabled ? (
                  <>
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    Alert hours: {formatTime12Hour(schedule.start_time)} - {formatTime12Hour(schedule.end_time)}
                  </>
                ) : (
                  <>
                    <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
                    Automatic checks off - use Check to test devices
                  </>
                )}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2.5">
            <button onClick={openAddModal} className={button}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Device
            </button>
            <button onClick={handleCheckNow} disabled={checking} className={accentButton}>
              <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} aria-hidden="true" />
              {checking ? 'Checking...' : 'Check Now'}
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="mb-6 grid grid-cols-3 gap-3 sm:gap-4">
          <div className={card}>
            <p className={eyebrow}>Total</p>
            <AdminValue className="mt-1">{totalDevices}</AdminValue>
          </div>
          <div className={card}>
            <p className={eyebrow}>Online</p>
            <p className="mt-1 text-3xl font-semibold text-adm-ok">{onlineDevices}</p>
          </div>
          <div className={card}>
            <p className={eyebrow}>Offline</p>
            <p className={`mt-1 text-3xl font-semibold ${offlineDevices > 0 ? 'text-adm-danger' : 'text-adm-text'}`}>{offlineDevices}</p>
          </div>
        </div>

        {/* Device Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {devices.map((device) => {
            const status = statuses[device.id];
            const isOnline = status?.is_online || false;

            return (
              <div
                key={device.id}
                className={`rounded-2xl border bg-adm-surface p-5 ${getStatusColor(device.id)} ${!device.enabled ? 'opacity-60' : ''}`}
              >
                {/* Device Header */}
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <AdminH3 className="mb-1 wrap-break-word">
                      {device.name}
                    </AdminH3>
                    <AdminTextSmall className="wrap-break-word">{device.description}</AdminTextSmall>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => openEditModal(device)}
                      className={iconButton}
                      title="Edit Device"
                      aria-label={`Edit ${device.name}`}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => openDeleteModal(device)}
                      className={iconDangerButton}
                      title="Delete Device"
                      aria-label={`Delete ${device.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Device Info */}
                <dl className="mb-4 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="shrink-0 text-adm-muted">Type</dt>
                    <dd className="text-right font-medium text-adm-text">{formatType(device.type)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="shrink-0 text-adm-muted">IP address</dt>
                    <dd className="break-all text-right font-mono text-adm-text">{device.ip}</dd>
                  </div>
                </dl>

                {/* Status Info */}
                <div className={insetBox}>
                  <div className="mb-2 flex items-center justify-between">
                    <AdminTextSmall>Status</AdminTextSmall>
                    <span className={getStatusBadge(device.id)}>
                      {getStatusText(device.id)}
                    </span>
                  </div>

                  {!isOnline && device.enabled && status && status.consecutive_failures > 0 && (
                    <p className="mb-2 flex items-center gap-1.5 text-sm text-adm-danger">
                      <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {status.consecutive_failures} consecutive failure{status.consecutive_failures > 1 ? 's' : ''}
                    </p>
                  )}

                  {status && (
                    <>
                      <AdminTextTiny className="mt-2">
                        Last Checked: {formatDateTime(status.last_checked, 'relative')}
                      </AdminTextTiny>
                      {status.last_seen_online && (
                        <AdminTextTiny>
                          Last Online: {formatDateTime(status.last_seen_online, 'medium')}
                        </AdminTextTiny>
                      )}
                      {status.last_notified && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-adm-warn">
                          <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          Alerted: {formatDateTime(status.last_notified, 'relative')}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {devices.length === 0 && (
          <div className={`${card} py-10 text-center`}>
            <p className="mb-4 text-base text-adm-muted">No devices configured yet.</p>
            <button onClick={openAddModal} className={accentButton}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Your First Device
            </button>
          </div>
        )}

        {/* Monitoring schedule (moved here from Settings) */}
        <div className="mt-6">
          <MonitoringSettings onSaved={loadSchedule} />
        </div>

        {/* Add Device Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-device-title"
              className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-adm-line bg-adm-surface p-5"
            >
              <h2 id="add-device-title" className="mb-4 text-lg font-semibold text-adm-text">Add New Device</h2>

              <div className="space-y-4">
                <div>
                  <AdminLabel htmlFor="add-device-id">Device ID (lowercase, no spaces)</AdminLabel>
                  <input
                    id="add-device-id"
                    type="text"
                    value={formData.id}
                    onChange={(e) => setFormData({...formData, id: e.target.value.toLowerCase().replace(/\s/g, '-')})}
                    className={field}
                    placeholder="fpp-new-controller"
                  />
                </div>

                <div>
                  <AdminLabel htmlFor="add-device-name">Device Name</AdminLabel>
                  <input
                    id="add-device-name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className={field}
                    placeholder="New FPP Controller"
                  />
                </div>

                <div>
                  <AdminLabel htmlFor="add-device-type">Type</AdminLabel>
                  <select
                    id="add-device-type"
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                    className={field}
                  >
                    <option value="">Select a type...</option>
                    <option value="fpp">FPP Controller</option>
                    <option value="falcon">Falcon Controller</option>
                    <option value="projector">Projector</option>
                    <option value="switch">Network Switch</option>
                    <option value="router">Router</option>
                    <option value="camera">Camera</option>
                    <option value="ups">UPS</option>
                    <option value="nas">NAS Storage</option>
                    <option value="server">Server</option>
                    {getUniqueTypes()
                      .filter(type => !['fpp', 'falcon', 'projector', 'switch', 'router', 'camera', 'ups', 'nas', 'server'].includes(type))
                      .map(type => (
                        <option key={type} value={type}>{formatType(type)}</option>
                      ))
                    }
                  </select>
                </div>

                <div>
                  <AdminLabel htmlFor="add-device-ip">IP Address</AdminLabel>
                  <input
                    id="add-device-ip"
                    type="text"
                    value={formData.ip}
                    onChange={(e) => setFormData({...formData, ip: e.target.value})}
                    className={`${field} font-mono`}
                    placeholder="192.168.5.10"
                  />
                </div>

                <div>
                  <AdminLabel htmlFor="add-device-description">Description</AdminLabel>
                  <input
                    id="add-device-description"
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className={field}
                    placeholder="Garage light controller"
                  />
                </div>

                <label className={choiceCard}>
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({...formData, enabled: e.target.checked})}
                    className={checkInput}
                  />
                  <span className="text-sm font-medium text-adm-text">Enable monitoring</span>
                </label>
              </div>

              <div className="mt-6 flex gap-2.5">
                <button onClick={() => setShowAddModal(false)} className={`${button} flex-1`}>
                  Cancel
                </button>
                <button onClick={handleAddDevice} className={`${accentButton} flex-1`}>
                  Add Device
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Device Modal */}
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-device-title"
              className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-adm-line bg-adm-surface p-5"
            >
              <h2 id="edit-device-title" className="mb-4 text-lg font-semibold text-adm-text">Edit Device</h2>

              <div className="space-y-4">
                <div>
                  <AdminLabel htmlFor="edit-device-id">Device ID</AdminLabel>
                  <input
                    id="edit-device-id"
                    type="text"
                    value={formData.id}
                    disabled
                    className={`${field} cursor-not-allowed`}
                  />
                </div>

                <div>
                  <AdminLabel htmlFor="edit-device-name">Device Name</AdminLabel>
                  <input
                    id="edit-device-name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className={field}
                  />
                </div>

                <div>
                  <AdminLabel htmlFor="edit-device-type">Type</AdminLabel>
                  <select
                    id="edit-device-type"
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                    className={field}
                  >
                    <option value="">Select a type...</option>
                    <option value="fpp">FPP Controller</option>
                    <option value="falcon">Falcon Controller</option>
                    <option value="projector">Projector</option>
                    <option value="switch">Network Switch</option>
                    <option value="router">Router</option>
                    <option value="camera">Camera</option>
                    <option value="ups">UPS</option>
                    <option value="nas">NAS Storage</option>
                    <option value="server">Server</option>
                    {getUniqueTypes()
                      .filter(type => !['fpp', 'falcon', 'projector', 'switch', 'router', 'camera', 'ups', 'nas', 'server'].includes(type))
                      .map(type => (
                        <option key={type} value={type}>{formatType(type)}</option>
                      ))
                    }
                  </select>
                </div>

                <div>
                  <AdminLabel htmlFor="edit-device-ip">IP Address</AdminLabel>
                  <input
                    id="edit-device-ip"
                    type="text"
                    value={formData.ip}
                    onChange={(e) => setFormData({...formData, ip: e.target.value})}
                    className={`${field} font-mono`}
                  />
                </div>

                <div>
                  <AdminLabel htmlFor="edit-device-description">Description</AdminLabel>
                  <input
                    id="edit-device-description"
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className={field}
                  />
                </div>

                <label className={choiceCard}>
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({...formData, enabled: e.target.checked})}
                    className={checkInput}
                  />
                  <span className="text-sm font-medium text-adm-text">Enable monitoring</span>
                </label>
              </div>

              <div className="mt-6 flex gap-2.5">
                <button onClick={() => setShowEditModal(false)} className={`${button} flex-1`}>
                  Cancel
                </button>
                <button onClick={handleUpdateDevice} className={`${accentButton} flex-1`}>
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && selectedDevice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-device-title"
              className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-adm-danger-line bg-adm-surface p-5"
            >
              <h2 id="delete-device-title" className="mb-2 text-lg font-semibold text-adm-text">Delete Device?</h2>
              <p className="mb-5 text-sm text-adm-soft">
                Are you sure you want to delete <strong className="text-adm-text">{selectedDevice.name}</strong>?
                This action cannot be undone.
              </p>

              <dl className={`${insetBox} mb-5 space-y-2 text-sm`}>
                <div className="flex justify-between gap-2">
                  <dt className="text-adm-muted">Device</dt>
                  <dd className="font-medium text-adm-text">{selectedDevice.name}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-adm-muted">IP</dt>
                  <dd className="font-mono text-adm-text">{selectedDevice.ip}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-adm-muted">Type</dt>
                  <dd className="font-medium text-adm-text">{formatType(selectedDevice.type)}</dd>
                </div>
              </dl>

              <div className="flex gap-2.5">
                <button onClick={() => setShowDeleteModal(false)} className={`${button} flex-1`}>
                  Cancel
                </button>
                <button onClick={handleDeleteDevice} className={`${dangerButton} flex-1`}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
    </AdminLayout>
  );
}
