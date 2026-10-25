'use client';

import { useState, useEffect } from 'react';
import { formatDateTime } from '@/lib/time-utils';
import {
  AdminH2,
  AdminH3,
  AdminH4,
  AdminText,
  AdminTextMuted,
  AdminTextSmall,
  AdminLabel,
  AdminInfo,
} from '@/components/admin/Typography';

export default function YouTubeVideoSettings() {
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
