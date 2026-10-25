'use client';

import { useState, useEffect } from 'react';
import { formatDateTime } from '@/lib/time-utils';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import {
  AdminH2,
  AdminH3,
  AdminTextMuted,
  AdminTextSmall,
  AdminTextTiny,
  AdminLabel,
} from '@/components/admin/Typography';
import { card, insetBox, button, accentButton, smallButton, smallDangerButton, field, notice, badge } from '@/components/admin/ui-classes';

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
      <div className={card}>
        <AdminH2>YouTube Video Management</AdminH2>
        <AdminTextMuted>Loading videos...</AdminTextMuted>
      </div>
    );
  }

  return (
    <div className={`${card} max-w-4xl`}>
      <AdminH2 className="mb-1">YouTube Video Management</AdminH2>

      <AdminTextMuted>
        Manage YouTube videos available for playback on the jukebox page. Visitors can watch any video tagged with the active theme; YouTube handles the streaming.
      </AdminTextMuted>

      {message && (
        <p className={`${notice.info} mt-4`}>{message}</p>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className={`${insetBox} mt-6`}>
          <AdminH3>{editingVideo ? 'Edit Video' : 'Add New Video'}</AdminH3>

          <div className="mt-4 space-y-4">
            <div>
              <AdminLabel htmlFor="video-url">YouTube URL *</AdminLabel>
              <input
                id="video-url"
                type="url"
                value={formData.youtubeUrl}
                onChange={(e) => setFormData(prev => ({ ...prev, youtubeUrl: e.target.value }))}
                placeholder="https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID"
                className={field}
                disabled={editingVideo !== null} // Can't change URL when editing
              />
              <p className="mt-1 text-xs text-adm-muted">
                {editingVideo ? 'URL cannot be changed when editing' : 'Paste the full YouTube URL'}
              </p>
            </div>

            <div>
              <AdminLabel htmlFor="video-title">Title (Optional)</AdminLabel>
              <input
                id="video-title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Custom title (leave empty to use YouTube title)"
                className={field}
              />
              <p className="mt-1 text-xs text-adm-muted">
                Leave empty to automatically use the YouTube video title
              </p>
            </div>

            <div>
              <AdminLabel htmlFor="video-description">Description (Optional)</AdminLabel>
              <textarea
                id="video-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description for this video"
                rows={3}
                className={`${field} resize-y`}
              />
            </div>

            <div>
              <AdminLabel htmlFor="video-theme">Theme *</AdminLabel>
              <select
                id="video-theme"
                value={formData.theme}
                onChange={(e) => setFormData(prev => ({ ...prev, theme: e.target.value as 'christmas' | 'halloween' }))}
                className={field}
              >
                <option value="christmas">Christmas</option>
                <option value="halloween">Halloween</option>
              </select>
              <p className="mt-1 text-xs text-adm-muted">
                Video will only show on the jukebox when this theme is active
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                onClick={editingVideo ? handleEditVideo : handleAddVideo}
                disabled={saving}
                className={accentButton}
              >
                {saving ? 'Saving...' : (editingVideo ? 'Update Video' : 'Add Video')}
              </button>

              <button
                onClick={resetForm}
                className={button}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Videos List */}
      <section className="mt-6 border-t border-adm-line pt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <AdminH3 className="mb-0">Available Videos ({videos.length})</AdminH3>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className={smallButton}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add Video
            </button>
          )}
        </div>

        {videos.length === 0 ? (
          <div className={`${insetBox} py-8 text-center`}>
            <AdminTextMuted>No videos added yet</AdminTextMuted>
            <AdminTextSmall className="mt-2">
              Click &quot;Add Video&quot; to add your first YouTube video for the jukebox
            </AdminTextSmall>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {videos.map((video) => (
              <div key={video.id} className={insetBox}>
                <div className="flex items-start gap-3">
                  {video.thumbnail_url && (
                    <img
                      src={video.thumbnail_url}
                      alt={video.title}
                      className="h-12 w-20 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-adm-text">{video.title}</p>
                      <span className={`${video.theme === 'christmas' ? badge.ok : badge.warn} shrink-0`}>
                        {video.theme === 'christmas' ? 'Christmas' : 'Halloween'}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-adm-muted">
                      {video.youtube_id}
                    </p>
                    {video.description && (
                      <p className="mt-1 text-[13px] text-adm-soft">
                        {video.description}
                      </p>
                    )}
                    <AdminTextTiny className="mt-1">
                      Added {formatDateTime(video.created_at, 'medium')}
                    </AdminTextTiny>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => startEdit(video)}
                    className={smallButton}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteVideo(video.id)}
                    disabled={saving}
                    className={smallDangerButton}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
