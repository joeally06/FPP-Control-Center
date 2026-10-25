'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { formatDateTime } from '@/lib/time-utils';
import { TIMING } from '@/lib/constants';
import { 
  AdminH1, 
  AdminH2, 
  AdminH3,
  AdminText, 
  AdminTextSmall,
  AdminTextTiny,
  AdminLabel,
  AdminValue,
  AdminValueMedium,
  AdminSuccess,
  AdminError,
  AdminWarning
} from '@/components/admin/Typography';

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

  const getStatusColor = (deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device || !device.enabled) return 'border-gray-600';
    
    const status = statuses[deviceId];
    if (!status) return 'border-gray-600';
    return status.is_online ? 'border-green-500' : 'border-red-500';
  };

  const getStatusIcon = (deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device || !device.enabled) return '⏸️';
    
    const status = statuses[deviceId];
    if (!status) return '⚪';
    return status.is_online ? '✅' : '❌';
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
        <div className="text-center">
          <AdminH2>Loading device status...</AdminH2>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <AdminH1 className="flex items-center gap-3">
              📡 Device Monitor
            </AdminH1>
            <div className="flex gap-3">
              <button
                onClick={openAddModal}
                className="px-6 py-3 bg-linear-to-r from-blue-500 to-cyan-600 text-white rounded-lg font-semibold transition-all hover:from-blue-600 hover:to-cyan-700 flex items-center gap-2"
              >
                ➕ Add Device
              </button>
              <button
                onClick={handleCheckNow}
                disabled={checking}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
              >
                {checking ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Checking...
                  </>
                ) : (
                  <>
                    🔍 Check Now
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <AdminText>
              Real-time monitoring of network devices. Auto-refreshes every 30 seconds.
            </AdminText>
            {schedule && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${schedule.enabled ? 'bg-green-500/20 border border-green-500/30' : 'bg-red-500/20 border border-red-500/30'}`}>
                <AdminTextSmall>
                  {schedule.enabled ? (
                    <>⏰ Monitoring Hours: {formatTime12Hour(schedule.start_time)} - {formatTime12Hour(schedule.end_time)}</>
                  ) : (
                    <>🔕 Monitoring Disabled - No Checks Running</>
                  )}
                </AdminTextSmall>
              </div>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
            <AdminTextSmall className="mb-2">Total Devices</AdminTextSmall>
            <AdminValue>{totalDevices}</AdminValue>
          </div>
          
          <div className="bg-green-500/20 backdrop-blur-md rounded-lg p-6 border border-green-500/30">
            <AdminTextSmall className="text-green-200 mb-2">Online</AdminTextSmall>
            <AdminValue className="text-green-400">{onlineDevices}</AdminValue>
          </div>
          
          <div className="bg-red-500/20 backdrop-blur-md rounded-lg p-6 border border-red-500/30">
            <AdminTextSmall className="text-red-200 mb-2">Offline</AdminTextSmall>
            <AdminValue className="text-red-400">{offlineDevices}</AdminValue>
          </div>
        </div>

        {/* Check Now Button - Removed, now in header */}

        {/* Device Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {devices.map((device) => {
            const status = statuses[device.id];
            const isOnline = status?.is_online || false;
            
            return (
              <div
                key={device.id}
                className={`
                  bg-white/10 backdrop-blur-md rounded-lg p-6 
                  border-2 ${getStatusColor(device.id)}
                  ${!device.enabled ? 'opacity-60' : isOnline ? '' : 'animate-pulse'}
                  transition-all hover:shadow-xl relative
                `}
              >
                {/* Device Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0 pr-3">
                    <AdminH3 className="mb-1 wrap-break-word">
                      {device.name}
                    </AdminH3>
                    <AdminTextSmall className="wrap-break-word">{device.description}</AdminTextSmall>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="text-2xl sm:text-3xl shrink-0">
                      {getStatusIcon(device.id)}
                    </div>
                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditModal(device)}
                        className="w-8 h-8 bg-blue-500/80 hover:bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm transition-colors"
                        title="Edit Device"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => openDeleteModal(device)}
                        className="w-8 h-8 bg-red-500/80 hover:bg-red-600 rounded-lg flex items-center justify-center text-white text-sm transition-colors"
                        title="Delete Device"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>

                {/* Device Info */}
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between gap-2">
                    <AdminTextSmall className="shrink-0">Type:</AdminTextSmall>
                    <AdminTextSmall className="font-medium text-white text-right">{formatType(device.type)}</AdminTextSmall>
                  </div>
                  <div className="flex justify-between gap-2">
                    <AdminTextSmall className="shrink-0">IP Address:</AdminTextSmall>
                    <AdminTextSmall className="font-mono text-white text-right break-all">{device.ip}</AdminTextSmall>
                  </div>
                </div>

                {/* Status Info */}
                <div className={`
                  px-4 py-3 rounded-lg
                  ${!device.enabled ? 'bg-gray-500/20' : isOnline ? 'bg-green-500/20' : 'bg-red-500/20'}
                `}>
                  <div className="flex justify-between items-center mb-2">
                    <AdminTextSmall>Status:</AdminTextSmall>
                    <span className={`
                      font-bold text-sm
                      ${!device.enabled ? 'text-gray-400' : isOnline ? 'text-green-400' : 'text-red-400'}
                    `}>
                      {getStatusText(device.id)}
                    </span>
                  </div>

                  {!isOnline && device.enabled && status && status.consecutive_failures > 0 && (
                    <AdminTextSmall className="text-red-300 mb-2">
                      ⚠️ {status.consecutive_failures} consecutive failure{status.consecutive_failures > 1 ? 's' : ''}
                    </AdminTextSmall>
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
                        <AdminTextTiny className="text-yellow-300 mt-1">
                          📧 Alerted: {formatDateTime(status.last_notified, 'relative')}
                        </AdminTextTiny>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {devices.length === 0 && (
          <div className="text-center py-12 text-white/60">
            <p className="text-xl mb-4">No devices configured yet.</p>
            <button
              onClick={openAddModal}
              className="px-6 py-3 bg-linear-to-r from-blue-500 to-cyan-600 text-white rounded-lg font-semibold transition-all hover:from-blue-600 hover:to-cyan-700"
            >
              ➕ Add Your First Device
            </button>
          </div>
        )}

        {/* Add Device Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-linear-to-br from-purple-900 to-blue-900 rounded-2xl p-4 sm:p-8 max-w-md w-full border-2 border-white/20 max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold text-white mb-6">Add New Device</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-white/80 text-sm mb-2">Device ID (lowercase, no spaces)</label>
                  <input
                    type="text"
                    value={formData.id}
                    onChange={(e) => setFormData({...formData, id: e.target.value.toLowerCase().replace(/\s/g, '-')})}
                    className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-blue-400"
                    placeholder="fpp-new-controller"
                  />
                </div>

                <div>
                  <label className="block text-white/80 text-sm mb-2">Device Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-blue-400"
                    placeholder="New FPP Controller"
                  />
                </div>

                <div>
                  <label className="block text-white/80 text-sm mb-2">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-blue-400"
                  >
                    <option value="" className="bg-gray-800 text-white">Select a type...</option>
                    <option value="fpp" className="bg-gray-800 text-white">FPP Controller</option>
                    <option value="falcon" className="bg-gray-800 text-white">Falcon Controller</option>
                    <option value="projector" className="bg-gray-800 text-white">Projector</option>
                    <option value="switch" className="bg-gray-800 text-white">Network Switch</option>
                    <option value="router" className="bg-gray-800 text-white">Router</option>
                    <option value="camera" className="bg-gray-800 text-white">Camera</option>
                    <option value="ups" className="bg-gray-800 text-white">UPS</option>
                    <option value="nas" className="bg-gray-800 text-white">NAS Storage</option>
                    <option value="server" className="bg-gray-800 text-white">Server</option>
                    {getUniqueTypes()
                      .filter(type => !['fpp', 'falcon', 'projector', 'switch', 'router', 'camera', 'ups', 'nas', 'server'].includes(type))
                      .map(type => (
                        <option key={type} value={type} className="bg-gray-800 text-white">{formatType(type)}</option>
                      ))
                    }
                  </select>
                </div>

                <div>
                  <label className="block text-white/80 text-sm mb-2">IP Address</label>
                  <input
                    type="text"
                    value={formData.ip}
                    onChange={(e) => setFormData({...formData, ip: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white font-mono focus:outline-none focus:border-blue-400"
                    placeholder="192.168.5.10"
                  />
                </div>

                <div>
                  <label className="block text-white/80 text-sm mb-2">Description</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-blue-400"
                    placeholder="Garage light controller"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="enabled"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({...formData, enabled: e.target.checked})}
                    className="w-5 h-5 rounded"
                  />
                  <label htmlFor="enabled" className="text-white/80">Enable monitoring</label>
                </div>
              </div>

              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddDevice}
                  className="flex-1 px-4 py-2 bg-linear-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white rounded-lg transition-all"
                >
                  Add Device
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Device Modal */}
        {showEditModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-linear-to-br from-purple-900 to-blue-900 rounded-2xl p-8 max-w-md w-full border-2 border-white/20">
              <h2 className="text-2xl font-bold text-white mb-6">Edit Device</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-white/80 text-sm mb-2">Device ID</label>
                  <input
                    type="text"
                    value={formData.id}
                    disabled
                    className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/50 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-white/80 text-sm mb-2">Device Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div>
                  <label className="block text-white/80 text-sm mb-2">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-blue-400"
                  >
                    <option value="" className="bg-gray-800 text-white">Select a type...</option>
                    <option value="fpp" className="bg-gray-800 text-white">FPP Controller</option>
                    <option value="falcon" className="bg-gray-800 text-white">Falcon Controller</option>
                    <option value="projector" className="bg-gray-800 text-white">Projector</option>
                    <option value="switch" className="bg-gray-800 text-white">Network Switch</option>
                    <option value="router" className="bg-gray-800 text-white">Router</option>
                    <option value="camera" className="bg-gray-800 text-white">Camera</option>
                    <option value="ups" className="bg-gray-800 text-white">UPS</option>
                    <option value="nas" className="bg-gray-800 text-white">NAS Storage</option>
                    <option value="server" className="bg-gray-800 text-white">Server</option>
                    {getUniqueTypes()
                      .filter(type => !['fpp', 'falcon', 'projector', 'switch', 'router', 'camera', 'ups', 'nas', 'server'].includes(type))
                      .map(type => (
                        <option key={type} value={type} className="bg-gray-800 text-white">{formatType(type)}</option>
                      ))
                    }
                  </select>
                </div>

                <div>
                  <label className="block text-white/80 text-sm mb-2">IP Address</label>
                  <input
                    type="text"
                    value={formData.ip}
                    onChange={(e) => setFormData({...formData, ip: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white font-mono focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div>
                  <label className="block text-white/80 text-sm mb-2">Description</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="enabled-edit"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({...formData, enabled: e.target.checked})}
                    className="w-5 h-5 rounded"
                  />
                  <label htmlFor="enabled-edit" className="text-white/80">Enable monitoring</label>
                </div>
              </div>

              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateDevice}
                  className="flex-1 px-4 py-2 bg-linear-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white rounded-lg transition-all"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && selectedDevice && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-linear-to-br from-red-900 to-purple-900 rounded-2xl p-8 max-w-md w-full border-2 border-red-500/50">
              <h2 className="text-2xl font-bold text-white mb-4">Delete Device?</h2>
              <p className="text-white/80 mb-6">
                Are you sure you want to delete <strong>{selectedDevice.name}</strong>?
                This action cannot be undone.
              </p>
              
              <div className="bg-white/10 rounded-lg p-4 mb-6">
                <div className="text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-white/70">Device:</span>
                    <span className="text-white font-medium">{selectedDevice.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/70">IP:</span>
                    <span className="text-white font-mono">{selectedDevice.ip}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/70">Type:</span>
                    <span className="text-white font-medium">{formatType(selectedDevice.type)}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteDevice}
                  className="flex-1 px-4 py-2 bg-linear-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg transition-all"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
    </AdminLayout>
  );
}
