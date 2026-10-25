'use client';

import { useState } from 'react';
import { X, Save } from 'lucide-react';
// field is a handleChange parameter below, so the shared input class is imported under another name
import { button, accentButton, field as fieldClass } from '@/components/admin/ui-classes';

interface Model {
  id: number;
  model_name: string;
  display_as: string;
  string_type: string;
  string_count: number;
  node_count: number;
  channel_count: number;
  start_channel_no: number;
  end_channel_no: number;
  controller_name: string;
  controller_ip: string;
  controller_ports: string;
  protocol: string;
  connection_protocol: string;
  connection_attributes: string;
  est_current_amps: number;
  universe_id: string;
}

interface EditModelModalProps {
  model: Model;
  onClose: () => void;
  onSave: () => void;
}

export default function EditModelModal({ model, onClose, onSave }: EditModelModalProps) {
  const [formData, setFormData] = useState(model);
  const [saving, setSaving] = useState(false);

  const handleChange = (field: keyof Model, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch(`/api/models/${model.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const result = await res.json();

      if (result.success) {
        alert('✅ Model updated successfully!');
        onSave();
        onClose();
      } else {
        alert(`❌ Update failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Update error:', error);
      alert('❌ Update failed: Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-model-title"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-adm-line bg-adm-surface p-5"
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 id="edit-model-title" className="text-lg font-semibold text-adm-text">Edit Model</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-lg text-adm-muted transition-colors hover:bg-adm-hover hover:text-adm-text"
            disabled={saving}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info Section */}
          <div>
            <h3 className="admin-h3 mb-3">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="model-model_name" className="admin-label">
                  Model Name <span className="text-adm-danger">*</span>
                </label>
                <input
                  id="model-model_name"
                  type="text"
                  value={formData.model_name}
                  onChange={(e) => handleChange('model_name', e.target.value)}
                  required
                  className={fieldClass}
                />
              </div>

              <div>
                <label htmlFor="model-display_as" className="admin-label">
                  Display As
                </label>
                <input
                  id="model-display_as"
                  type="text"
                  value={formData.display_as || ''}
                  onChange={(e) => handleChange('display_as', e.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>
          </div>

          {/* String Info Section */}
          <div>
            <h3 className="admin-h3 mb-3">String Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="model-string_type" className="admin-label">
                  String Type
                </label>
                <input
                  id="model-string_type"
                  type="text"
                  value={formData.string_type || ''}
                  onChange={(e) => handleChange('string_type', e.target.value)}
                  placeholder="e.g., RGB Nodes"
                  className={fieldClass}
                />
              </div>

              <div>
                <label htmlFor="model-string_count" className="admin-label">
                  String Count
                </label>
                <input
                  id="model-string_count"
                  type="number"
                  value={formData.string_count || 0}
                  onChange={(e) => handleChange('string_count', parseInt(e.target.value) || 0)}
                  min="0"
                  className={fieldClass}
                />
              </div>

              <div>
                <label htmlFor="model-node_count" className="admin-label">
                  Node Count
                </label>
                <input
                  id="model-node_count"
                  type="number"
                  value={formData.node_count || 0}
                  onChange={(e) => handleChange('node_count', parseInt(e.target.value) || 0)}
                  min="0"
                  className={fieldClass}
                />
              </div>
            </div>
          </div>

          {/* Channel Info Section */}
          <div>
            <h3 className="admin-h3 mb-3">Channel Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="model-start_channel_no" className="admin-label">
                  Start Channel <span className="text-adm-danger">*</span>
                </label>
                <input
                  id="model-start_channel_no"
                  type="number"
                  value={formData.start_channel_no || 0}
                  onChange={(e) => handleChange('start_channel_no', parseInt(e.target.value) || 0)}
                  required
                  min="0"
                  className={fieldClass}
                />
              </div>

              <div>
                <label htmlFor="model-end_channel_no" className="admin-label">
                  End Channel <span className="text-adm-danger">*</span>
                </label>
                <input
                  id="model-end_channel_no"
                  type="number"
                  value={formData.end_channel_no || 0}
                  onChange={(e) => handleChange('end_channel_no', parseInt(e.target.value) || 0)}
                  required
                  min="0"
                  className={fieldClass}
                />
              </div>

              <div>
                <label htmlFor="model-channel_count" className="admin-label">
                  Total Channels <span className="text-adm-danger">*</span>
                </label>
                <input
                  id="model-channel_count"
                  type="number"
                  value={formData.channel_count || 0}
                  onChange={(e) => handleChange('channel_count', parseInt(e.target.value) || 0)}
                  required
                  min="0"
                  className={fieldClass}
                />
              </div>
            </div>
          </div>

          {/* Controller Info Section */}
          <div>
            <h3 className="admin-h3 mb-3">Controller Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="model-controller_name" className="admin-label">
                  Controller Name
                </label>
                <input
                  id="model-controller_name"
                  type="text"
                  value={formData.controller_name || ''}
                  onChange={(e) => handleChange('controller_name', e.target.value)}
                  placeholder="e.g., F16v4"
                  className={fieldClass}
                />
              </div>

              <div>
                <label htmlFor="model-controller_ip" className="admin-label">
                  Controller IP
                </label>
                <input
                  id="model-controller_ip"
                  type="text"
                  value={formData.controller_ip || ''}
                  onChange={(e) => handleChange('controller_ip', e.target.value)}
                  placeholder="192.168.1.100"
                  className={fieldClass}
                />
              </div>

              <div>
                <label htmlFor="model-controller_ports" className="admin-label">
                  Port(s)
                </label>
                <input
                  id="model-controller_ports"
                  type="text"
                  value={formData.controller_ports || ''}
                  onChange={(e) => handleChange('controller_ports', e.target.value)}
                  placeholder="e.g., 1-16"
                  className={fieldClass}
                />
              </div>

              <div>
                <label htmlFor="model-protocol" className="admin-label">
                  Protocol
                </label>
                <input
                  id="model-protocol"
                  type="text"
                  value={formData.protocol || ''}
                  onChange={(e) => handleChange('protocol', e.target.value)}
                  placeholder="e.g., ws2811"
                  className={fieldClass}
                />
              </div>

              <div>
                <label htmlFor="model-universe_id" className="admin-label">
                  Universe ID
                </label>
                <input
                  id="model-universe_id"
                  type="text"
                  value={formData.universe_id || ''}
                  onChange={(e) => handleChange('universe_id', e.target.value)}
                  placeholder="e.g., 1"
                  className={fieldClass}
                />
              </div>

              <div>
                <label htmlFor="model-connection_protocol" className="admin-label">
                  Connection Protocol
                </label>
                <input
                  id="model-connection_protocol"
                  type="text"
                  value={formData.connection_protocol || ''}
                  onChange={(e) => handleChange('connection_protocol', e.target.value)}
                  placeholder="e.g., 12V"
                  className={fieldClass}
                />
              </div>
            </div>
          </div>

          {/* Power & Advanced Section */}
          <div>
            <h3 className="admin-h3 mb-3">Power & Advanced</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="model-est_current_amps" className="admin-label">
                  Est. Current (Amps)
                </label>
                <input
                  id="model-est_current_amps"
                  type="number"
                  step="0.01"
                  value={formData.est_current_amps || 0}
                  onChange={(e) => handleChange('est_current_amps', parseFloat(e.target.value) || 0)}
                  min="0"
                  className={fieldClass}
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="model-connection_attributes" className="admin-label">
                  Connection Attributes
                </label>
                <textarea
                  id="model-connection_attributes"
                  value={formData.connection_attributes || ''}
                  onChange={(e) => handleChange('connection_attributes', e.target.value)}
                  rows={3}
                  placeholder="Additional connection details..."
                  className={`${fieldClass} font-mono`}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 border-t border-adm-line pt-5">
            <button
              type="button"
              onClick={onClose}
              className={`${button} flex-1`}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`${accentButton} flex-1`}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
