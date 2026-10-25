'use client';

import { useEffect, useState, useRef } from 'react';
import { Search, Upload, Zap, Cable, Info, Power, File, X, Edit, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import EditModelModal from '@/components/EditModelModal';
import { card, eyebrow, button, accentButton, smallButton, smallDangerButton, field, sizedField, textLink, notice, badge } from '@/components/admin/ui-classes';

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

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [expandedModels, setExpandedModels] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleModelExpansion = (id: number) => {
    setExpandedModels(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      setModels(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching models:', error);
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        alert('Please select an Excel file (.xlsx or .xls)');
        return;
      }
      setSelectedFile(file);
    }
  };

  const importModels = async () => {
    if (!selectedFile) {
      alert('Please select a file first');
      return;
    }

    if (!confirm(`Import ${selectedFile.name}? This will replace all existing model data.`)) {
      return;
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/models/import', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (result.success) {
        alert(`✅ ${result.message}`);
        setShowUploadModal(false);
        setSelectedFile(null);
        fetchModels();
      } else {
        alert(`❌ Import failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('❌ Import failed: Network error');
    } finally {
      setImporting(false);
    }
  };

  const deleteModel = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"?\n\nThis cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/models/${id}`, {
        method: 'DELETE',
      });

      const result = await res.json();

      if (result.success) {
        alert('✅ Model deleted successfully');
        fetchModels();
      } else {
        alert(`❌ Delete failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('❌ Delete failed: Network error');
    }
  };

  const filteredModels = models.filter(model => {
    const matchesSearch =
      model.model_name?.toLowerCase().includes(search.toLowerCase()) ||
      model.display_as?.toLowerCase().includes(search.toLowerCase()) ||
      model.controller_name?.toLowerCase().includes(search.toLowerCase());

    const matchesFilter =
      filter === 'all' ||
      model.controller_name === filter;

    return matchesSearch && matchesFilter;
  });

  const controllers = [...new Set(models.map(m => m.controller_name).filter(Boolean))];
  const totalChannels = models.reduce((sum, m) => sum + (m.channel_count || 0), 0);
  const totalAmps = models.reduce((sum, m) => sum + (m.est_current_amps || 0), 0);

  if (loading) {
    return (
      <AdminLayout title="Model Configuration">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-adm-line border-t-adm-accent"></div>
            <p className="text-sm text-adm-muted">Loading models...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const stats = [
    { icon: File, label: 'Total Models', value: models.length.toLocaleString() },
    { icon: Cable, label: 'Total Channels', value: totalChannels.toLocaleString() },
    { icon: Zap, label: 'Total Nodes', value: models.reduce((sum, m) => sum + (m.node_count || 0), 0).toLocaleString() },
    { icon: Power, label: 'Est. Power', value: `${totalAmps.toFixed(1)}A` },
    { icon: Info, label: 'Controllers', value: controllers.length.toLocaleString() },
  ];

  return (
    <AdminLayout
      title="Model Configuration"
      subtitle="Your yearly setup reference guide - Never forget a connection again!"
    >
      <div className="space-y-4">

      {/* Search, Filter & Import */}
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adm-faint" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search models, controllers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search models"
            className={`${field} pl-10`}
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter by controller"
          className={`${sizedField} w-full sm:w-56`}
        >
          <option value="all">All Controllers</option>
          {controllers.map(controller => (
            <option key={controller} value={controller}>{controller}</option>
          ))}
        </select>
        <button
          onClick={() => setShowUploadModal(true)}
          className={button}
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          Import Excel File
        </button>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-models-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-adm-line bg-adm-surface p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="import-models-title" className="text-lg font-semibold text-adm-text">Import Models from Excel</h2>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setSelectedFile(null);
                }}
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-lg text-adm-muted transition-colors hover:bg-adm-hover hover:text-adm-text"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-adm-soft">
                Upload your <strong className="text-adm-text">Export Models.xlsx</strong> file from xLights to import your model configuration.
              </p>

              {/* File Input */}
              <div className="rounded-xl border border-dashed border-adm-control-line bg-adm-side p-6 text-center transition-colors hover:border-adm-faint">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {selectedFile ? (
                  <div className="space-y-2">
                    <File className="mx-auto h-10 w-10 text-adm-ok" aria-hidden="true" />
                    <p className="font-medium text-adm-text">{selectedFile.name}</p>
                    <p className="text-sm text-adm-muted">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className={textLink}
                    >
                      Choose different file
                    </button>
                  </div>
                ) : (
                  <div>
                    <Upload className="mx-auto mb-2 h-10 w-10 text-adm-faint" aria-hidden="true" />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-sm font-semibold text-adm-accent hover:underline"
                    >
                      Click to select file
                    </button>
                    <p className="mt-1 text-sm text-adm-muted">
                      Accepts .xlsx and .xls files
                    </p>
                  </div>
                )}
              </div>

              {/* Warning */}
              <p className={notice.warn}>
                This will replace all existing model data
              </p>

              {/* Actions */}
              <div className="flex gap-2.5">
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setSelectedFile(null);
                  }}
                  className={`${button} flex-1`}
                  disabled={importing}
                >
                  Cancel
                </button>
                <button
                  onClick={importModels}
                  disabled={!selectedFile || importing}
                  className={`${accentButton} flex-1`}
                >
                  {importing ? 'Importing...' : 'Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Dashboard */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className={card}>
            <div className="flex items-start justify-between gap-2">
              <p className={eyebrow}>{label}</p>
              <Icon className="h-4.5 w-4.5 shrink-0 text-adm-faint" aria-hidden="true" />
            </div>
            <p className="mt-1 text-2xl font-semibold text-adm-text sm:text-3xl">{value}</p>
          </div>
        ))}
      </div>

      {/* Models Grid */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredModels.map(model => {
          const isExpanded = expandedModels.has(model.id);
          return (
          <div key={model.id} className={`${card} transition-colors hover:border-adm-control-line`}>
            {/* Header - Always Visible */}
            <div
              className="cursor-pointer"
              onClick={() => toggleModelExpansion(model.id)}
            >
              <div className="mb-3 flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold text-adm-text">{model.model_name}</h3>
                  <p className="text-sm text-adm-muted">{model.display_as}</p>
                </div>
                <div className="ml-2 flex items-center gap-2">
                  <span className={`${badge.neutral} whitespace-nowrap`}>
                    {model.string_type}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 shrink-0 text-adm-faint" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-5 w-5 shrink-0 text-adm-faint" aria-hidden="true" />
                  )}
                </div>
              </div>

              {/* Compact Info - Always Visible */}
              <div className="space-y-2">
                {/* Channel Range */}
                <div className="flex items-center gap-2 text-sm">
                  <Cable className="h-4 w-4 shrink-0 text-adm-info" aria-hidden="true" />
                  <span className="font-medium text-adm-text">Ch {model.start_channel_no?.toLocaleString()}-{model.end_channel_no?.toLocaleString()}</span>
                  <span className={`${badge.info} ml-auto`}>
                    {model.channel_count} ch
                  </span>
                </div>

                {/* Controller */}
                <div className="flex items-center gap-2 text-sm">
                  <Info className="h-4 w-4 shrink-0 text-adm-accent" aria-hidden="true" />
                  <span className="truncate font-medium text-adm-text">{model.controller_name}</span>
                  {model.controller_ports && (
                    <span className={`${badge.neutral} shrink-0`}>
                      P{model.controller_ports}
                    </span>
                  )}
                </div>

                {/* Nodes */}
                <p className="text-sm text-adm-muted">
                  {model.string_count} string{model.string_count > 1 ? 's' : ''} × {model.node_count} nodes = {(model.string_count * model.node_count).toLocaleString()} total
                </p>
              </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
              <div className="mt-4 space-y-3 border-t border-adm-line pt-4">
                {/* IP & Protocol */}
                <div className="flex items-center gap-2 text-sm">
                  <Info className="h-4 w-4 shrink-0 text-adm-faint" aria-hidden="true" />
                  <span className="truncate font-mono text-adm-soft">{model.controller_ip}</span>
                  <span className={`${badge.neutral} ml-auto shrink-0`}>
                    {model.protocol}
                  </span>
                </div>

                {/* Power Consumption */}
                <div className="flex items-center gap-2 text-sm">
                  <Power className="h-4 w-4 shrink-0 text-adm-danger" aria-hidden="true" />
                  <span className="font-medium text-adm-text">{model.est_current_amps?.toFixed(2)}A</span>
                  <span className="ml-auto text-xs text-adm-muted">
                    @ {model.connection_protocol}
                  </span>
                </div>

                {/* Universe ID */}
                {model.universe_id && (
                  <p className="text-sm text-adm-soft">
                    <span className="text-adm-muted">Universe:</span> {model.universe_id}
                  </p>
                )}

                {/* Connection Attributes */}
                {model.connection_attributes && (
                  <div className="rounded-lg border border-adm-line bg-adm-field p-2.5">
                    <p className="mb-1 text-xs text-adm-muted">Connection Attributes:</p>
                    <p className="break-all font-mono text-xs text-adm-soft">
                      {model.connection_attributes}
                    </p>
                  </div>
                )}

                {/* Edit/Delete Buttons */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingModel(model);
                    }}
                    className={`${smallButton} flex-1`}
                  >
                    <Edit className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteModel(model.id, model.model_name);
                    }}
                    className={`${smallDangerButton} flex-1`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )})}
      </div>

      {/* Empty State */}
      {filteredModels.length === 0 && (
        <div className={`${card} py-12 text-center`}>
          <Upload className="mx-auto mb-4 h-10 w-10 text-adm-faint" aria-hidden="true" />
          <p className="mb-2 text-base font-medium text-adm-text">
            {models.length === 0
              ? 'No models imported yet'
              : 'No models match your search'}
          </p>
          <p className="text-sm text-adm-muted">
            {models.length === 0
              ? 'Click "Import Excel File" to load your Export Models.xlsx file'
              : 'Try adjusting your search or filters'}
          </p>
        </div>
      )}

      {/* Edit Modal */}
      {editingModel && (
        <EditModelModal
          model={editingModel}
          onClose={() => setEditingModel(null)}
          onSave={fetchModels}
        />
      )}
      </div>
    </AdminLayout>
  );
}
