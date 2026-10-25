'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { useFPPConnection } from '@/contexts/FPPConnectionContext';
import { formatDateTime } from '@/lib/time-utils';
import { 
  Music, 
  List, 
  Play, 
  Trash2, 
  Search, 
  RefreshCw, 
  Star, 
  TrendingUp, 
  Edit3, 
  X, 
  Check,
  Library,
  Link2,
  FolderOpen,
  Download,
  AlertCircle,
  CheckCircle,
  FileAudio,
  HardDrive,
  Clock
} from 'lucide-react';
import { card, insetBox, button, accentButton, smallButton, smallDangerButton, iconButton, iconDangerButton, field, notice, badge, tabClass } from '@/components/admin/ui-classes';

// Tab type for the unified Media Center
type MediaTab = 'library' | 'audio-sync' | 'local-files';

interface Playlist {
  name: string;
  desc: string;
  playlistInfo: {
    total_duration: number;
    total_items: number;
  };
  leadIn?: Array<{
    type: string;
    sequenceName?: string;
    playlistName?: string;
    enabled: number;
    duration?: number;
  }>;
  mainPlaylist: Array<{
    type: string;
    sequenceName?: string;
    playlistName?: string;
    enabled: number;
    duration?: number;
  }>;
  leadOut?: Array<{
    type: string;
    sequenceName?: string;
    playlistName?: string;
    enabled: number;
    duration?: number;
  }>;
}

interface Sequence {
  name: string;
  size: number;
  duration?: number;
}

interface SequenceWithMetadata extends Sequence {
  albumArt?: string | null;
  artist?: string | null;
  album?: string | null;
  trackName?: string | null;
  votes?: number;
  playCount?: number;
  rating?: number;
  matchConfidence?: string;
}

interface SpotifySearchResult {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumArt: string;
  spotifyUri: string;
  previewUrl: string | null;
}

// Audio Sync Tab interfaces
interface PlaylistSequenceStatus {
  sequenceName: string;
  mediaName: string | null;
  audioFile: string | null;
  hasLocalAudio: boolean;
  hasMapping: boolean;
  status: 'ready' | 'needs-download' | 'needs-mapping';
}

interface AudioMapping {
  sequenceName: string;
  audioFile: string;
}

interface LocalAudioFile {
  name: string;
  size: number;
  lastModified: string;
}

export default function MediaCenter() {
  const { data: session } = useSession();
  const router = useRouter();
  const { isOnline } = useFPPConnection();
  const isAdmin = session?.user?.role === 'admin';

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [sequencesWithMetadata, setSequencesWithMetadata] = useState<SequenceWithMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string>('');
  
  // Spotify URL refresh state
  const [refreshingSpotifyUrls, setRefreshingSpotifyUrls] = useState(false);
  const [refreshSpotifyMessage, setRefreshSpotifyMessage] = useState<string>('');
  
  // Edit modal state
  const [editingSequence, setEditingSequence] = useState<SequenceWithMetadata | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SpotifySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualForm, setManualForm] = useState({
    albumArt: '',
    artist: '',
    album: '',
    trackName: ''
  });
  const [saving, setSaving] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<MediaTab>('library');
  
  // Audio Sync tab state
  const [selectedAudioSyncPlaylist, setSelectedAudioSyncPlaylist] = useState<Playlist | null>(null);
  const [playlistSequences, setPlaylistSequences] = useState<PlaylistSequenceStatus[]>([]);
  const [audioMappings, setAudioMappings] = useState<AudioMapping[]>([]);
  const [localAudioFiles, setLocalAudioFiles] = useState<LocalAudioFile[]>([]);
  const [loadingAudioSync, setLoadingAudioSync] = useState(false);
  const [downloadingSequence, setDownloadingSequence] = useState<string | null>(null);
  const [mappingSequence, setMappingSequence] = useState<string | null>(null);
  const [selectedAudioFile, setSelectedAudioFile] = useState<string>('');
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [audioSyncMessage, setAudioSyncMessage] = useState<string>('');

  useEffect(() => {
    if (!isAdmin) {
      router.push('/jukebox');
      return;
    }

    fetchData();
    fetchSyncStatus();
  }, [isAdmin, router]);

  useEffect(() => {
    if (selectedPlaylist && sequences.length > 0) {
      // Clear old sequences first
      setSequencesWithMetadata([]);
      // Load metadata for new playlist
      loadPlaylistMetadata();
    } else if (!selectedPlaylist) {
      setSequencesWithMetadata([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlaylist]); // Only trigger on playlist change, not sequences change

  // Load audio sync data when switching to audio-sync tab or when playlist changes while on that tab
  useEffect(() => {
    if (activeTab === 'audio-sync') {
      if (selectedAudioSyncPlaylist) {
        loadAudioSyncData();
      } else {
        // Clear data if no playlist selected
        setPlaylistSequences([]);
      }
    } else if (activeTab === 'local-files') {
      loadLocalFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedAudioSyncPlaylist?.name]); // Use playlist name as dependency to detect changes

  const fetchSyncStatus = async () => {
    try {
      const res = await fetch('/api/fpp/sync');
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data.data);
      }
    } catch (error) {
      console.error('[Media Library] Failed to fetch sync status:', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [playlistsRes, sequencesRes] = await Promise.all([
        fetch('/api/fpp/playlists'),
        fetch('/api/fpp/sequences')
      ]);

      if (playlistsRes.ok) {
        const playlistsData = await playlistsRes.json();
        console.log('[Media Library] Loaded', playlistsData.length, 'playlists');
        setPlaylists(Array.isArray(playlistsData) ? playlistsData : []);
      } else {
        console.error('[Media Library] Failed to load playlists:', playlistsRes.status, playlistsRes.statusText);
        setPlaylists([]);
      }

      if (sequencesRes.ok) {
        const sequencesData = await sequencesRes.json();
        console.log('[Media Library] Loaded', sequencesData.length, 'sequences');
        setSequences(Array.isArray(sequencesData) ? sequencesData : []);
      } else {
        console.error('[Media Library] Failed to load sequences:', sequencesRes.status, sequencesRes.statusText);
        const errorData = await sequencesRes.json().catch(() => ({}));
        console.error('[Media Library] Error details:', errorData);
        setSequences([]);
      }
    } catch (error) {
      console.error('[Media Library] Failed to fetch media:', error);
      setPlaylists([]);
      setSequences([]);
    } finally {
      setLoading(false);
    }
  };

  const loadPlaylistMetadata = async () => {
    if (!selectedPlaylist) return;

    setLoadingMetadata(true);
    try {
      const sequenceNames = getSequencesInPlaylist(selectedPlaylist);
      console.log('[Media Library] Loading metadata for', sequenceNames.length, 'sequences');
      console.log('[Media Library] Sequence names from playlist:', sequenceNames);
      console.log('[Media Library] Available sequences count:', sequences.length);
      console.log('[Media Library] Available sequence names:', sequences.slice(0, 10).map(s => s.name));
      
      const BATCH_SIZE = 10;
      const sequencesData: SequenceWithMetadata[] = [];

      // Load metadata in batches
      for (let i = 0; i < sequenceNames.length; i += BATCH_SIZE) {
        const batch = sequenceNames.slice(i, i + BATCH_SIZE);
        
        const batchResults = await Promise.all(
          batch.map(async (seqName) => {
            // Case-insensitive search
            const baseSequence = sequences.find(s => 
              s.name.toLowerCase().trim() === seqName.toLowerCase().trim()
            );
            
            if (!baseSequence) {
              console.warn('[Media Library] Sequence not found:', seqName);
              console.warn('[Media Library] Available sequences:', sequences.map(s => s.name).slice(0, 5));
              return null;
            }

            console.log('[Media Library] ✓ Found sequence:', seqName, '→', baseSequence.name);

            console.log('[Media Library] ✓ Found sequence:', seqName, '→', baseSequence.name);

            try {
              const [metadataRes, analyticsRes] = await Promise.all([
                fetch(`/api/spotify/metadata/${encodeURIComponent(baseSequence.name)}`).catch(err => {
                  console.warn('[Media Library] Spotify API error for', baseSequence.name, ':', err.message);
                  return null;
                }),
                fetch(`/api/analytics/sequence/${encodeURIComponent(baseSequence.name)}`).catch(err => {
                  console.warn('[Media Library] Analytics API error for', baseSequence.name, ':', err.message);
                  return null;
                })
              ]);

              let albumArt, artist, album, trackName, matchConfidence;
              if (metadataRes && metadataRes.ok) {
                const metadata = await metadataRes.json();
                albumArt = metadata.albumArt;
                artist = metadata.artist;
                album = metadata.album;
                trackName = metadata.trackName;
                matchConfidence = metadata.matchConfidence;
              } else if (metadataRes) {
                console.warn('[Media Library] Spotify metadata failed for', baseSequence.name, ':', metadataRes.status);
              }

              let votes = 0, playCount = 0, rating = 0;
              if (analyticsRes && analyticsRes.ok) {
                const analytics = await analyticsRes.json();
                votes = analytics.votes?.total || 0;
                playCount = analytics.plays?.completed || 0;
                rating = analytics.rating?.average || 0;
              } else if (analyticsRes) {
                console.warn('[Media Library] Analytics failed for', baseSequence.name, ':', analyticsRes.status);
              }

              return {
                ...baseSequence,
                albumArt,
                artist,
                album,
                trackName,
                matchConfidence,
                votes,
                playCount,
                rating
              };
            } catch (error) {
              console.error(`Failed to load metadata for ${seqName}:`, error);
              return baseSequence;
            }
          })
        );

        const validResults = batchResults.filter(Boolean) as SequenceWithMetadata[];
        sequencesData.push(...validResults);
        
        console.log(`[Media Library] Batch ${Math.floor(i / BATCH_SIZE) + 1}: Found ${validResults.length}/${batch.length} sequences`);
        
        // Update UI after each batch for progressive loading
        setSequencesWithMetadata([...sequencesData]);
      }
      
      console.log('[Media Library] Total loaded:', sequencesData.length, 'out of', sequenceNames.length);
    } catch (error) {
      console.error('Failed to load metadata:', error);
    } finally {
      setLoadingMetadata(false);
    }
  };

  // Audio Sync tab functions
  const loadAudioSyncData = useCallback(async () => {
    if (!selectedAudioSyncPlaylist) return;
    
    setLoadingAudioSync(true);
    try {
      const [statusRes, mappingsRes, localFilesRes] = await Promise.all([
        fetch(`/api/audio/playlist-status?playlist=${encodeURIComponent(selectedAudioSyncPlaylist.name)}`),
        fetch('/api/audio/mappings'),
        fetch('/api/audio/local-files')
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setPlaylistSequences(data.sequences || []);
      }

      if (mappingsRes.ok) {
        const data = await mappingsRes.json();
        setAudioMappings(data.mappings || []);
      }

      if (localFilesRes.ok) {
        const data = await localFilesRes.json();
        setLocalAudioFiles(data.files || []);
      }
    } catch (error) {
      console.error('[Audio Sync] Failed to load data:', error);
      setAudioSyncMessage('❌ Failed to load audio sync data');
      setTimeout(() => setAudioSyncMessage(''), 5000);
    } finally {
      setLoadingAudioSync(false);
    }
  }, [selectedAudioSyncPlaylist]);

  const loadLocalFiles = async () => {
    try {
      const res = await fetch('/api/audio/local-files');
      if (res.ok) {
        const data = await res.json();
        setLocalAudioFiles(data.files || []);
      }
    } catch (error) {
      console.error('[Audio Sync] Failed to load local files:', error);
    }
  };

  const downloadAudioFromFPP = async (sequenceName: string, mediaName: string | null) => {
    setDownloadingSequence(sequenceName);
    setAudioSyncMessage('');
    
    try {
      const res = await fetch('/api/audio/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequenceName, mediaName })
      });

      const data = await res.json();
      
      if (res.ok && data.success) {
        setAudioSyncMessage(`✅ Downloaded and mapped "${data.audioFile}" to "${sequenceName}"`);
        await loadAudioSyncData();
      } else {
        setAudioSyncMessage(`❌ Download failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('[Audio Sync] Download error:', error);
      setAudioSyncMessage('❌ Failed to download audio from FPP');
    } finally {
      setDownloadingSequence(null);
      setTimeout(() => setAudioSyncMessage(''), 5000);
    }
  };

  const saveAudioMapping = async (sequenceName: string, audioFile: string) => {
    setMappingSequence(sequenceName);
    setAudioSyncMessage('');
    
    try {
      const res = await fetch('/api/audio/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequenceName, audioFile })
      });

      const data = await res.json();
      
      if (res.ok && data.success) {
        setAudioSyncMessage(`✅ Mapped "${audioFile}" to "${sequenceName}"`);
        setSelectedAudioFile('');
        await loadAudioSyncData();
      } else {
        setAudioSyncMessage(`❌ Mapping failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('[Audio Sync] Mapping error:', error);
      setAudioSyncMessage('❌ Failed to save audio mapping');
    } finally {
      setMappingSequence(null);
      setTimeout(() => setAudioSyncMessage(''), 5000);
    }
  };

  const deleteLocalFile = async (fileName: string) => {
    if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) return;
    
    setDeletingFile(fileName);
    setAudioSyncMessage('');
    
    try {
      const res = await fetch(`/api/audio/local-files/${encodeURIComponent(fileName)}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      
      if (res.ok && data.success) {
        setAudioSyncMessage(`✅ Deleted "${fileName}"`);
        await loadLocalFiles();
      } else {
        setAudioSyncMessage(`❌ Delete failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('[Audio Sync] Delete error:', error);
      setAudioSyncMessage('❌ Failed to delete file');
    } finally {
      setDeletingFile(null);
      setTimeout(() => setAudioSyncMessage(''), 5000);
    }
  };

  const deleteAllLocalFiles = async () => {
    if (!confirm(`Delete all ${localAudioFiles.length} local audio files? This cannot be undone.`)) return;
    
    setDeletingAll(true);
    setAudioSyncMessage('');
    
    try {
      let successCount = 0;
      let failCount = 0;

      // Delete files one by one
      for (const file of localAudioFiles) {
        try {
          const res = await fetch(`/api/audio/local-files/${encodeURIComponent(file.name)}`, {
            method: 'DELETE'
          });

          const data = await res.json();
          
          if (res.ok && data.success) {
            successCount++;
          } else {
            failCount++;
            console.error(`Failed to delete ${file.name}:`, data.error);
          }
        } catch (error) {
          failCount++;
          console.error(`Error deleting ${file.name}:`, error);
        }
      }

      // Show results
      if (failCount === 0) {
        setAudioSyncMessage(`✅ Successfully deleted all ${successCount} files`);
      } else {
        setAudioSyncMessage(`⚠️ Deleted ${successCount} files, ${failCount} failed`);
      }
      
      await loadLocalFiles();
    } catch (error) {
      console.error('[Audio Sync] Delete all error:', error);
      setAudioSyncMessage('❌ Failed to delete files');
    } finally {
      setDeletingAll(false);
      setTimeout(() => setAudioSyncMessage(''), 5000);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getAudioSyncStats = () => {
    const ready = playlistSequences.filter(s => s.status === 'ready').length;
    const needsDownload = playlistSequences.filter(s => s.status === 'needs-download').length;
    const needsMapping = playlistSequences.filter(s => s.status === 'needs-mapping').length;
    return { ready, needsDownload, needsMapping, total: playlistSequences.length };
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage('');
    
    try {
      const res = await fetch('/api/fpp/sync', {
        method: 'POST'
      });

      const data = await res.json();
      
      if (data.success) {
        setSyncMessage(`✅ ${data.message}`);
        await fetchData();
        await fetchSyncStatus();
      } else {
        setSyncMessage(`❌ Sync failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('[Media Library] Sync error:', error);
      setSyncMessage('❌ Failed to sync with FPP device');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(''), 5000);
    }
  };

  const handleRefreshSpotifyUrls = async () => {
    if (!confirm('Refresh Spotify URLs for all songs in Media Library? This may take a minute.')) {
      return;
    }

    setRefreshingSpotifyUrls(true);
    setRefreshSpotifyMessage('');

    try {
      const res = await fetch('/api/admin/media-library/refresh-urls', {
        method: 'POST',
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setRefreshSpotifyMessage(`✅ ${data.message}`);
        // Refresh metadata to show new URLs
        if (selectedPlaylist) {
          await loadPlaylistMetadata();
        }
      } else {
        setRefreshSpotifyMessage(`❌ Error: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('[Media Library] Spotify URL refresh error:', error);
      setRefreshSpotifyMessage('❌ Failed to refresh Spotify URLs');
    } finally {
      setRefreshingSpotifyUrls(false);
      setTimeout(() => setRefreshSpotifyMessage(''), 8000);
    }
  };

  const openEditModal = (sequence: SequenceWithMetadata) => {
    setEditingSequence(sequence);
    setSearchQuery(sequence.name);
    setSearchResults([]);
    setManualMode(false);
    setManualForm({
      albumArt: sequence.albumArt || '',
      artist: sequence.artist || '',
      album: sequence.album || '',
      trackName: sequence.trackName || sequence.name
    });
  };

  const closeEditModal = () => {
    setEditingSequence(null);
    setSearchQuery('');
    setSearchResults([]);
    setSearching(false);
    setManualMode(false);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(searchQuery)}&limit=10`);
      const data = await res.json();
      
      if (data.results) {
        setSearchResults(data.results);
      }
    } catch (error) {
      console.error('[Media Library] Spotify search error:', error);
    } finally {
      setSearching(false);
    }
  };

  const selectSpotifyResult = async (result: SpotifySearchResult) => {
    if (!editingSequence) return;
    
    console.log('[Media Library] Selecting Spotify result:', result);
    setSaving(true);
    
    try {
      const res = await fetch(`/api/spotify/metadata/${encodeURIComponent(editingSequence.name)}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          albumArt: result.albumArt,
          artist: result.artist,
          album: result.album,
          trackName: result.name,
          spotifyTrackId: result.id,
          spotifyUri: result.spotifyUri,
          previewUrl: result.previewUrl
        })
      });

      console.log('[Media Library] Save response status:', res.status);
      
      if (res.ok) {
        console.log('[Media Library] Reloading playlist metadata...');
        // Reload metadata for the selected playlist
        await loadPlaylistMetadata();
        closeEditModal();
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('[Media Library] Failed to save:', errorData);
      }
    } catch (error) {
      console.error('[Media Library] Error saving Spotify result:', error);
    } finally {
      setSaving(false);
    }
  };

  const saveManualMetadata = async () => {
    if (!editingSequence) return;
    
    console.log('[Media Library] Saving manual metadata:', manualForm);
    setSaving(true);
    
    try {
      const res = await fetch(`/api/spotify/metadata/${encodeURIComponent(editingSequence.name)}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          albumArt: manualForm.albumArt,
          artist: manualForm.artist,
          album: manualForm.album,
          trackName: manualForm.trackName,
          spotifyTrackId: null,
          spotifyUri: null,
          previewUrl: null
        })
      });

      console.log('[Media Library] Save response status:', res.status);

      if (res.ok) {
        console.log('[Media Library] Reloading playlist metadata...');
        // Reload metadata for the selected playlist
        await loadPlaylistMetadata();
        closeEditModal();
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('[Media Library] Failed to save:', errorData);
      }
    } catch (error) {
      console.error('[Media Library] Error saving manual metadata:', error);
    } finally {
      setSaving(false);
    }
  };

  const playPlaylist = async (playlistName: string) => {
    if (!isOnline) return;
    
    try {
      await fetch('/api/fppd/command/Start%20Playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          args: [playlistName, false, false]
        })
      });
    } catch (error) {
      console.error('Failed to play playlist:', error);
    }
  };

  const deletePlaylist = async (playlistName: string) => {
    if (!confirm(`Delete playlist "${playlistName}"?`)) return;
    
    try {
      await fetch(`/api/fppd/playlists/${encodeURIComponent(playlistName)}`, {
        method: 'DELETE'
      });
      if (selectedPlaylist?.name === playlistName) {
        setSelectedPlaylist(null);
      }
      fetchData();
    } catch (error) {
      console.error('Failed to delete playlist:', error);
    }
  };

  const getSequencesInPlaylist = (playlist: Playlist) => {
    // Include leadIn, mainPlaylist, and leadOut sequences
    const allItems = [
      ...(playlist.leadIn || []),
      ...(playlist.mainPlaylist || []),
      ...(playlist.leadOut || [])
    ];
    
    return allItems
      .filter(item => item.sequenceName) // Any item with a sequenceName (type can be 'sequence', 'both', 'media', etc.)
      .map(item => {
        // Remove .fseq extension and trim whitespace
        const cleanName = item.sequenceName!.replace(/\.fseq$/i, '').trim();
        console.log('[Media Library] Cleaned sequence name:', item.sequenceName, '->', cleanName);
        return cleanName;
      });
  };

  const filteredPlaylists = playlists.filter(p =>
    p?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    const mb = (bytes / (1024 * 1024)).toFixed(2);
    return `${mb} MB`;
  };

  if (!isAdmin) return null;

  const spinner = 'mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-adm-line border-t-adm-accent';
  // Card that holds a table or list edge to edge (card's own padding would win over p-0)
  const flushCard = 'overflow-hidden rounded-2xl border border-adm-line bg-adm-surface';
  const th = 'px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-adm-muted';
  const tabs = [
    { key: 'library', label: 'Library', icon: Library },
    { key: 'audio-sync', label: 'Audio Sync', icon: Link2 },
    { key: 'local-files', label: 'Local Files', icon: FolderOpen },
  ] as const;

  return (
    <AdminLayout
      title="Media Center"
      subtitle="Unified media management with library, audio sync, and local files"
    >
      {/* Tab Navigation */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-adm-line">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            aria-pressed={activeTab === key}
            className={`${tabClass(activeTab === key)} inline-flex items-center gap-2`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {/* Sync Status Banner - Show only on Library tab */}
      {activeTab === 'library' && syncStatus && (
        <div className={`${card} mb-4`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <RefreshCw className={`h-4 w-4 text-adm-muted ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span className="font-semibold text-adm-text">FPP Data Cache</span>
              </div>
              <div className="text-sm text-adm-muted">
                {syncStatus.lastSuccess ? (
                  <>
                    Last synced: {formatDateTime(syncStatus.lastSuccess, 'relative')}
                    {' - '}
                    {syncStatus.playlistsCount} playlists, {syncStatus.sequencesCount} sequences
                  </>
                ) : syncStatus.lastError ? (
                  <span className="text-adm-danger">Error: {syncStatus.lastError}</span>
                ) : (
                  <span className="text-adm-warn">No data cached yet - click Sync to load from FPP</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleSync}
                disabled={syncing}
                className={button}
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                {syncing ? 'Syncing...' : 'Sync FPP'}
              </button>

              <button
                onClick={handleRefreshSpotifyUrls}
                disabled={refreshingSpotifyUrls}
                className={button}
                title="Refresh Spotify URLs for all songs missing links"
              >
                {refreshingSpotifyUrls ? (
                  <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Music className="h-4 w-4" aria-hidden="true" />
                )}
                {refreshingSpotifyUrls ? 'Refreshing...' : 'Refresh Spotify URLs'}
              </button>
            </div>
          </div>
          {(syncMessage || refreshSpotifyMessage) && (
            <div className="mt-3 space-y-1 text-sm text-adm-soft">
              {syncMessage && <div className="text-adm-soft">{syncMessage}</div>}
              {refreshSpotifyMessage && <div className="text-adm-soft">{refreshSpotifyMessage}</div>}
            </div>
          )}
        </div>
      )}

      {/* LIBRARY TAB CONTENT */}
      {activeTab === 'library' && (
        <>
          {/* Search Bar */}
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adm-faint" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search playlists..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search playlists"
              className={`${field} pl-10`}
            />
          </div>

      {loading ? (
        <div className="py-12 text-center">
          <div className={spinner}></div>
          <p className="text-sm text-adm-muted">Loading media library...</p>
        </div>
      ) : playlists.length === 0 ? (
        <div className={`${card} py-12 text-center`}>
          <Library className="mx-auto mb-4 h-10 w-10 text-adm-faint" aria-hidden="true" />
          <h3 className="mb-2 text-lg font-semibold text-adm-text">No Data Cached</h3>
          <p className="text-sm text-adm-muted">Click &quot;Sync Now&quot; to load playlists and sequences from FPP.</p>
        </div>
      ) : (
        <div className="space-y-4">

          {/* Playlist Dropdown */}
          <div className={card}>
            <label htmlFor="media-playlist" className="admin-h2 block">Select Playlist</label>

            <select
              id="media-playlist"
              value={selectedPlaylist?.name || ''}
              onChange={(e) => {
                const playlist = playlists.find(p => p.name === e.target.value);
                setSelectedPlaylist(playlist || null);
              }}
              className={`${field} cursor-pointer`}
            >
              <option value="" disabled>Choose a playlist...</option>
              {filteredPlaylists.map((playlist) => (
                <option key={playlist.name} value={playlist.name}>
                  {playlist.name} ({playlist.playlistInfo?.total_items || 0} items)
                </option>
              ))}
            </select>

            {selectedPlaylist && (
              <div className={`${insetBox} mt-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="mb-1 font-semibold text-adm-text">{selectedPlaylist.name}</h3>
                    {selectedPlaylist.desc && (
                      <p className="mb-2 text-sm text-adm-muted">{selectedPlaylist.desc}</p>
                    )}
                    <div className="flex gap-4 text-sm text-adm-muted">
                      <span className="inline-flex items-center gap-1.5"><List className="h-3.5 w-3.5" aria-hidden="true" />{selectedPlaylist.playlistInfo?.total_items || 0} items</span>
                      <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{formatDuration(selectedPlaylist.playlistInfo?.total_duration)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => playPlaylist(selectedPlaylist.name)}
                      disabled={!isOnline}
                      className={iconButton}
                      title="Play Playlist"
                      aria-label={`Play ${selectedPlaylist.name}`}
                    >
                      <Play className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => deletePlaylist(selectedPlaylist.name)}
                      disabled={!isOnline}
                      className={iconDangerButton}
                      title="Delete Playlist"
                      aria-label={`Delete ${selectedPlaylist.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sequences Section - Full Width */}
          <div>
            {!selectedPlaylist ? (
              <div className={`${card} py-12 text-center`}>
                <List className="mx-auto mb-4 h-10 w-10 text-adm-faint" aria-hidden="true" />
                <h3 className="mb-2 text-lg font-semibold text-adm-text">Select a Playlist</h3>
                <p className="text-sm text-adm-muted">Choose a playlist from the dropdown to view its sequences with album art and metadata</p>
              </div>
            ) : (
              <div className={card}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="admin-h2 mb-0 truncate">{selectedPlaylist.name}</h2>
                  {loadingMetadata && (
                    <div className="flex shrink-0 items-center gap-2 text-adm-muted">
                      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span className="text-sm text-adm-muted">Loading metadata...</span>
                    </div>
                  )}
                </div>

                {loadingMetadata && sequencesWithMetadata.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className={spinner}></div>
                    <p className="text-sm text-adm-muted">Loading Spotify metadata...</p>
                  </div>
                ) : sequencesWithMetadata.length === 0 && !loadingMetadata ? (
                  <p className="py-8 text-center text-sm text-adm-muted">No sequences in this playlist</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {sequencesWithMetadata.map((sequence) => (
                      <div
                        key={sequence.name}
                        className="overflow-hidden rounded-xl border border-adm-line bg-adm-side transition-colors hover:border-adm-control-line"
                      >
                        {/* Album Art */}
                        <div className="relative aspect-square bg-adm-field">
                          {sequence.albumArt ? (
                            <img
                              src={sequence.albumArt}
                              alt={sequence.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Music className="h-20 w-20 text-adm-line" aria-hidden="true" />
                            </div>
                          )}
                        </div>

                        {/* Metadata */}
                        <div className="p-4">
                          <h3 className="mb-1 truncate font-semibold text-adm-text" title={sequence.name}>
                            {sequence.trackName || sequence.name}
                          </h3>

                          {sequence.artist && (
                            <p className="mb-1 truncate text-sm text-adm-soft">{sequence.artist}</p>
                          )}

                          {sequence.album && (
                            <p className="mb-3 truncate text-xs text-adm-muted">{sequence.album}</p>
                          )}

                          {/* Stats */}
                          <div className="mb-3 flex items-center gap-3 text-xs text-adm-muted">
                            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{formatDuration(sequence.duration)}</span>
                            <span className="inline-flex items-center gap-1"><HardDrive className="h-3.5 w-3.5" aria-hidden="true" />{formatSize(sequence.size)}</span>
                          </div>

                          {/* Analytics */}
                          <div className={`flex items-center gap-3 border-t border-adm-line pt-3 ${(sequence.votes || sequence.playCount || sequence.rating) ? '' : 'justify-end'}`}>
                            {(sequence.rating ?? 0) > 0 && (
                              <div className="flex items-center gap-1">
                                <Star className="h-4 w-4 fill-adm-accent text-adm-accent" aria-hidden="true" />
                                <span className="text-sm text-adm-text">{sequence.rating!.toFixed(1)}</span>
                              </div>
                            )}
                            {(sequence.votes ?? 0) > 0 && (
                              <span className="text-xs text-adm-muted">{sequence.votes} votes</span>
                            )}
                            {(sequence.playCount ?? 0) > 0 && (
                              <div className="flex items-center gap-1">
                                <TrendingUp className="h-3.5 w-3.5 text-adm-info" aria-hidden="true" />
                                <span className="text-xs text-adm-muted">{sequence.playCount}</span>
                              </div>
                            )}
                            <button
                              onClick={() => openEditModal(sequence)}
                              className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-adm-muted transition-colors hover:bg-adm-hover hover:text-adm-text"
                              title="Edit metadata"
                              aria-label={`Edit metadata for ${sequence.trackName || sequence.name}`}
                            >
                              <Edit3 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
        </>
      )}

      {/* AUDIO SYNC TAB CONTENT */}
      {activeTab === 'audio-sync' && (
        <div className="space-y-4">
          {/* Playlist Selector for Audio Sync */}
          <div className={card}>
            <label htmlFor="audio-sync-playlist" className="admin-h2 block">Select Playlist for Audio Sync</label>
            <select
              id="audio-sync-playlist"
              value={selectedAudioSyncPlaylist?.name || ''}
              onChange={(e) => {
                const playlist = playlists.find(p => p.name === e.target.value);
                setSelectedAudioSyncPlaylist(playlist || null);
              }}
              className={`${field} cursor-pointer`}
            >
              <option value="" disabled>Choose a playlist...</option>
              {playlists.map((playlist) => (
                <option key={playlist.name} value={playlist.name}>
                  {playlist.name} ({playlist.playlistInfo?.total_items || 0} items)
                </option>
              ))}
            </select>
          </div>

          {!selectedAudioSyncPlaylist ? (
            <div className={`${card} py-12 text-center`}>
              <Link2 className="mx-auto mb-4 h-10 w-10 text-adm-faint" aria-hidden="true" />
              <h3 className="mb-2 text-lg font-semibold text-adm-text">Select a Playlist</h3>
              <p className="text-sm text-adm-muted">Choose a playlist above to view and manage audio sync status</p>
            </div>
          ) : (
            <>
              {/* Audio Sync Stats */}
              {(() => {
                const stats = getAudioSyncStats();
                return (
                  <div className={card}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="min-w-0 truncate font-semibold text-adm-text">Audio Sync: {selectedAudioSyncPlaylist.name}</span>
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-adm-ok">
                          <CheckCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {stats.ready} Ready
                        </span>
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-adm-warn">
                          <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {stats.needsDownload} Download
                        </span>
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-adm-danger">
                          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {stats.needsMapping} Mapping
                        </span>
                        <button
                          onClick={loadAudioSyncData}
                          disabled={loadingAudioSync}
                          className={iconButton}
                          title="Refresh audio sync data"
                          aria-label="Refresh audio sync data"
                        >
                          <RefreshCw className={`h-4 w-4 ${loadingAudioSync ? 'animate-spin' : ''}`} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    {audioSyncMessage && (
                      <p className="mt-3 text-sm text-adm-soft">{audioSyncMessage}</p>
                    )}
                  </div>
                );
              })()}

              {/* Playlist Sequences Table */}
              <div className={flushCard}>
                {loadingAudioSync ? (
                  <div className="py-12 text-center">
                    <div className={spinner}></div>
                    <p className="text-sm text-adm-muted">Loading audio sync status...</p>
                  </div>
                ) : playlistSequences.length === 0 ? (
                  <div className="py-12 text-center">
                    <FileAudio className="mx-auto mb-3 h-10 w-10 text-adm-faint" aria-hidden="true" />
                    <p className="text-sm text-adm-muted">No sequences found in this playlist</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead className="border-b border-adm-line bg-adm-side">
                      <tr>
                        <th scope="col" className={`${th} text-left`}>Sequence</th>
                        <th scope="col" className={`${th} text-left`}>Audio File</th>
                        <th scope="col" className={`${th} text-center`}>Status</th>
                        <th scope="col" className={`${th} text-right`}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-adm-line">
                      {playlistSequences.map((seq) => (
                        <tr key={seq.sequenceName} className="transition-colors hover:bg-adm-hover">
                          <td className="max-w-[200px] px-4 py-3">
                            <span className="block truncate text-sm font-medium text-adm-text" title={seq.sequenceName}>{seq.sequenceName}</span>
                          </td>
                          <td className="max-w-[250px] px-4 py-3">
                            {mappingSequence === seq.sequenceName ? (
                              <div className="flex min-w-0 items-center gap-1.5">
                                <select
                                  value={selectedAudioFile}
                                  onChange={(e) => setSelectedAudioFile(e.target.value)}
                                  aria-label={`Audio file for ${seq.sequenceName}`}
                                  className="min-h-9 min-w-0 flex-1 rounded-lg border border-adm-control-line bg-adm-field px-2 text-sm text-adm-text"
                                >
                                  <option value="">Select...</option>
                                  {localAudioFiles.map((file) => (
                                    <option key={file.name} value={file.name}>{file.name}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => selectedAudioFile && saveAudioMapping(seq.sequenceName, selectedAudioFile)}
                                  disabled={!selectedAudioFile}
                                  className={`${iconButton} touch-manipulation`}
                                  aria-label="Save mapping"
                                >
                                  <Check className="h-4 w-4 text-adm-ok" aria-hidden="true" />
                                </button>
                                <button
                                  onClick={() => setMappingSequence(null)}
                                  className={`${iconButton} touch-manipulation`}
                                  aria-label="Cancel mapping"
                                >
                                  <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </div>
                            ) : seq.audioFile ? (
                              <span className="block truncate text-sm text-adm-ok" title={seq.audioFile}>{seq.audioFile}</span>
                            ) : seq.mediaName ? (
                              <span className="block truncate text-sm text-adm-warn" title={`FPP: ${seq.mediaName}`}>FPP: {seq.mediaName}</span>
                            ) : (
                              <span className="text-sm text-adm-muted">Not mapped</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {seq.status === 'ready' ? (
                              <span className={`${badge.ok} items-center gap-1 whitespace-nowrap`} title="Ready">
                                <CheckCircle className="h-3 w-3" aria-hidden="true" />
                                <span className="hidden sm:inline">Ready</span>
                              </span>
                            ) : seq.status === 'needs-download' ? (
                              <span className={`${badge.warn} items-center gap-1 whitespace-nowrap`} title="Need Download">
                                <Download className="h-3 w-3" aria-hidden="true" />
                                <span className="hidden sm:inline">Download</span>
                              </span>
                            ) : (
                              <span className={`${badge.danger} items-center gap-1 whitespace-nowrap`} title="Need Mapping">
                                <AlertCircle className="h-3 w-3" aria-hidden="true" />
                                <span className="hidden sm:inline">Mapping</span>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Download button - shows when audio needs to be downloaded from FPP */}
                              {seq.status === 'needs-download' && seq.mediaName && (
                                <button
                                  onClick={() => downloadAudioFromFPP(seq.sequenceName, seq.mediaName)}
                                  disabled={downloadingSequence === seq.sequenceName}
                                  className={`${smallButton} whitespace-nowrap touch-manipulation`}
                                  title="Download audio from FPP"
                                >
                                  {downloadingSequence === seq.sequenceName ? (
                                    <>
                                      <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                      <span className="hidden sm:inline">Downloading...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                                      <span className="hidden sm:inline">Download</span>
                                    </>
                                  )}
                                </button>
                              )}
                              {/* Map Audio button - shows when not currently mapping this sequence */}
                              {mappingSequence !== seq.sequenceName && (
                                <button
                                  onClick={() => setMappingSequence(seq.sequenceName)}
                                  className={`${smallButton} whitespace-nowrap touch-manipulation`}
                                  title={seq.status === 'ready' ? 'Change audio mapping' : 'Map to local audio file'}
                                >
                                  <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span className="hidden sm:inline">{seq.status === 'ready' ? 'Remap' : 'Map'}</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* LOCAL FILES TAB CONTENT */}
      {activeTab === 'local-files' && (
        <div className="space-y-4">
          {/* Local Files Header */}
          <div className={card}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <HardDrive className="h-5 w-5 shrink-0 text-adm-muted" aria-hidden="true" />
                <span className="font-semibold text-adm-text">Local Audio Files</span>
                <span className="text-sm text-adm-muted">({localAudioFiles.length} files)</span>
              </div>
              <div className="flex items-center gap-2">
                {localAudioFiles.length > 0 && (
                  <button
                    onClick={deleteAllLocalFiles}
                    disabled={deletingAll}
                    className={`${smallDangerButton} touch-manipulation`}
                    title="Delete all files"
                  >
                    {deletingAll ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        <span className="hidden sm:inline">Deleting...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">Delete All</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={loadLocalFiles}
                  disabled={deletingAll}
                  className={iconButton}
                  title="Refresh file list"
                  aria-label="Refresh file list"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            {audioSyncMessage && (
              <p className="mt-3 text-sm text-adm-soft">{audioSyncMessage}</p>
            )}
          </div>

          {/* Local Files List */}
          <div className={flushCard}>
            {localAudioFiles.length === 0 ? (
              <div className="py-12 text-center">
                <FolderOpen className="mx-auto mb-3 h-10 w-10 text-adm-faint" aria-hidden="true" />
                <p className="text-sm text-adm-soft">No local audio files found</p>
                <p className="mt-1 text-sm text-adm-muted">Download audio from FPP using the Audio Sync tab</p>
              </div>
            ) : (
              <ul className="divide-y divide-adm-line">
                {localAudioFiles.map((file) => (
                  <li key={file.name} className="flex items-start justify-between gap-3 p-4 transition-colors hover:bg-adm-hover sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
                      <FileAudio className="h-7 w-7 shrink-0 text-adm-info" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="wrap-break-word text-sm font-medium text-adm-text" title={file.name}>{file.name}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-adm-muted sm:gap-4">
                          <span>{formatFileSize(file.size)}</span>
                          <span className="whitespace-nowrap">{new Date(file.lastModified).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteLocalFile(file.name)}
                      disabled={deletingFile === file.name || deletingAll}
                      className={`${iconDangerButton} touch-manipulation`}
                      title="Delete file"
                      aria-label={`Delete ${file.name}`}
                    >
                      {deletingFile === file.name ? (
                        <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Edit Metadata Modal */}
      {editingSequence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-metadata-title"
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-adm-line bg-adm-surface"
          >

            {/* Header */}
            <div className="border-b border-adm-line p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 id="edit-metadata-title" className="text-lg font-semibold text-adm-text">Edit Metadata</h3>
                  <p className="mt-0.5 truncate text-sm text-adm-muted">{editingSequence.name}</p>
                </div>
                <button
                  onClick={closeEditModal}
                  aria-label="Close"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-adm-muted transition-colors hover:bg-adm-hover hover:text-adm-text"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              {/* Mode Toggle */}
              <div className="mt-4 flex rounded-xl border border-adm-control-line bg-adm-side p-1">
                {([[false, 'Search Spotify'], [true, 'Manual Entry']] as const).map(([manual, label]) => (
                  <button
                    key={label}
                    onClick={() => setManualMode(manual)}
                    aria-pressed={manualMode === manual}
                    className={`min-h-9 flex-1 rounded-lg px-3.5 text-sm font-medium transition-colors ${
                      manualMode === manual
                        ? 'bg-adm-raised text-adm-text'
                        : 'text-adm-muted hover:text-adm-text'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {!manualMode ? (
                /* Search Mode */
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="Search for a song..."
                      aria-label="Search Spotify"
                      className={`${field} flex-1`}
                    />
                    <button
                      onClick={handleSearch}
                      disabled={searching || !searchQuery.trim()}
                      className={accentButton}
                    >
                      {searching ? (
                        <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Search className="h-4 w-4" aria-hidden="true" />
                      )}
                      {searching ? 'Searching...' : 'Search'}
                    </button>
                  </div>

                  {/* Search Results */}
                  {searchResults.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm text-adm-muted">{searchResults.length} results found</p>
                      {saving && (
                        <p className={`${notice.info} flex items-center gap-2`}>
                          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                          Saving metadata and refreshing...
                        </p>
                      )}
                      {searchResults.map((result) => (
                        <div
                          key={result.id}
                          onClick={() => !saving && selectSpotifyResult(result)}
                          className={`group flex items-center gap-4 rounded-xl border border-adm-line bg-adm-side p-3 transition-colors ${
                            saving ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-adm-control-line hover:bg-adm-hover'
                          }`}
                        >
                          {result.albumArt && (
                            <img
                              src={result.albumArt}
                              alt={result.album}
                              className="h-16 w-16 rounded-lg object-cover"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <h4 className="truncate font-medium text-adm-text">{result.name}</h4>
                            <p className="truncate text-sm text-adm-soft">{result.artist}</p>
                            <p className="truncate text-xs text-adm-muted">{result.album}</p>
                          </div>
                          <Check className={`h-5 w-5 text-adm-ok transition-opacity ${
                            saving ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
                          }`} aria-hidden="true" />
                        </div>
                      ))}
                    </div>
                  ) : searchQuery && !searching ? (
                    <div className="py-12 text-center">
                      <Search className="mx-auto mb-3 h-10 w-10 text-adm-faint" aria-hidden="true" />
                      <p className="text-sm text-adm-soft">No results found</p>
                      <p className="mt-1 text-sm text-adm-muted">Try a different search query</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                /* Manual Entry Mode */
                <div className="space-y-4">
                  <div>
                    <label htmlFor="meta-album-art" className="admin-label">
                      Album Art URL
                    </label>
                    <input
                      id="meta-album-art"
                      type="text"
                      value={manualForm.albumArt}
                      onChange={(e) => setManualForm({ ...manualForm, albumArt: e.target.value })}
                      placeholder="https://..."
                      className={field}
                    />
                    {manualForm.albumArt && (
                      <div className="mt-3">
                        <img
                          src={manualForm.albumArt}
                          alt="Preview"
                          className="h-32 w-32 rounded-lg object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label htmlFor="meta-track-name" className="admin-label">
                      Track Name
                    </label>
                    <input
                      id="meta-track-name"
                      type="text"
                      value={manualForm.trackName}
                      onChange={(e) => setManualForm({ ...manualForm, trackName: e.target.value })}
                      placeholder="Song title"
                      className={field}
                    />
                  </div>

                  <div>
                    <label htmlFor="meta-artist" className="admin-label">
                      Artist
                    </label>
                    <input
                      id="meta-artist"
                      type="text"
                      value={manualForm.artist}
                      onChange={(e) => setManualForm({ ...manualForm, artist: e.target.value })}
                      placeholder="Artist name"
                      className={field}
                    />
                  </div>

                  <div>
                    <label htmlFor="meta-album" className="admin-label">
                      Album
                    </label>
                    <input
                      id="meta-album"
                      type="text"
                      value={manualForm.album}
                      onChange={(e) => setManualForm({ ...manualForm, album: e.target.value })}
                      placeholder="Album name"
                      className={field}
                    />
                  </div>

                  <div className="flex gap-2.5 pt-2">
                    <button
                      onClick={saveManualMetadata}
                      disabled={!manualForm.trackName.trim() || saving}
                      className={`${accentButton} flex-1`}
                    >
                      {saving ? (
                        <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      )}
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={closeEditModal}
                      disabled={saving}
                      className={`${button} flex-1`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
