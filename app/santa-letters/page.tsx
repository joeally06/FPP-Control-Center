'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import SantaLetterSettings from '@/components/admin/SantaLetterSettings';
import { formatDateTime, parseDbTimestamp } from '@/lib/time-utils';
import { 
  AdminH1, 
  AdminH3,
  AdminText, 
  AdminTextTiny,
  AdminLabel,
  AdminValue,
  AdminSuccess,
  AdminError,
  AdminWarning,
  AdminInfo
} from '@/components/admin/Typography';
import {
  badge, button, card, cardTitle, dangerButton, eyebrow, field, insetBox, smallButton, tabClass,
} from '@/components/admin/ui-classes';

interface SantaLetter {
  id: number;
  child_name: string;
  child_age: number | null;
  parent_email: string;
  letter_content: string;
  santa_reply: string | null;
  status: 'pending' | 'approved' | 'sent' | 'rejected';
  ip_address: string | null;
  created_at: string;
  sent_at: string | null;
  admin_notes: string | null;
  queue_status: 'queued' | 'processing' | 'completed' | 'failed';
  processing_started_at: string | null;
  processing_completed_at: string | null;
  retry_count: number;
  last_error: string | null;
  awaiting_confirmation: number; // 1 while the parent hasn't clicked the email link
  confirm_expires_at: string | null;
}

// Letters waiting for the parent's email confirmation; the queue skips them until confirmed
const isAwaitingParent = (letter: SantaLetter) => letter.awaiting_confirmation === 1;
const isLinkExpired = (letter: SantaLetter) =>
  isAwaitingParent(letter) && (parseDbTimestamp(letter.confirm_expires_at)?.toMillis() ?? 0) <= Date.now();

export default function SantaLettersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [letters, setLetters] = useState<SantaLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedLetter, setSelectedLetter] = useState<SantaLetter | null>(null);
  const [editReply, setEditReply] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [updating, setUpdating] = useState(false);
  const [tab, setTab] = useState<'letters' | 'settings'>('letters');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated' && session?.user?.role !== 'admin') {
      router.push('/');
    } else if (status === 'authenticated') {
      fetchLetters();
    }
  }, [status, session, router]);

  const fetchLetters = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/santa/admin-letters');
      if (response.ok) {
        const data = await response.json();
        setLetters(data);
      }
    } catch (error) {
      console.error('Error fetching letters:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateLetterStatus = async (letterId: number, newStatus: string, notes?: string) => {
    try {
      setUpdating(true);
      const response = await fetch('/api/santa/admin-letters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letterId, status: newStatus, adminNotes: notes }),
      });

      if (response.ok) {
        await fetchLetters();
        setSelectedLetter(null);
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.error || 'Failed to update the letter');
      }
    } catch (error) {
      console.error('Error updating status:', error);
    } finally {
      setUpdating(false);
    }
  };

  const updateReply = async (letterId: number, reply: string) => {
    try {
      setUpdating(true);
      const response = await fetch('/api/santa/admin-letters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letterId, santaReply: reply }),
      });

      if (response.ok) {
        await fetchLetters();
        setSelectedLetter(null);
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.error || 'Failed to save the reply');
      }
    } catch (error) {
      console.error('Error updating reply:', error);
    } finally {
      setUpdating(false);
    }
  };

  const resendEmail = async (letterId: number) => {
    try {
      setUpdating(true);
      const response = await fetch('/api/santa/resend-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letterId }),
      });

      if (response.ok) {
        alert('Email resent successfully!');
        await fetchLetters();
      } else {
        const data = await response.json();
        alert(`Failed to resend email: ${data.error}`);
      }
    } catch (error) {
      console.error('Error resending email:', error);
      alert('Failed to resend email');
    } finally {
      setUpdating(false);
    }
  };

  const triggerQueueProcessing = async () => {
    try {
      setUpdating(true);
      const response = await fetch('/api/santa/trigger-queue', {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        alert('Queue processing triggered! Check console for details.');
        await fetchLetters();
      } else {
        alert('Failed to trigger queue processing');
      }
    } catch (error) {
      console.error('Error triggering queue:', error);
      alert('Failed to trigger queue processing');
    } finally {
      setUpdating(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['ID', 'Child Name', 'Age', 'Email', 'Status', 'Created', 'Letter Excerpt', 'Reply Excerpt'];
    const rows = filteredLetters.map(letter => [
      letter.id,
      letter.child_name,
      letter.child_age || 'N/A',
      letter.parent_email,
      letter.status,
      formatDateTime(letter.created_at, 'medium'),
      letter.letter_content.substring(0, 50) + '...',
      letter.santa_reply ? letter.santa_reply.substring(0, 50) + '...' : 'N/A',
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = formatDateTime(new Date().toISOString(), 'medium').split(',')[0].replace(/\//g, '-');
    a.download = `santa-letters-${dateStr}.csv`;
    a.click();
  };

  const filteredLetters = filterStatus === 'all'
    ? letters
    : letters.filter(letter => letter.status === filterStatus);

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: badge.warn,
      approved: badge.info,
      sent: badge.ok,
      rejected: badge.danger,
    };
    return badges[status as keyof typeof badges] || badge.neutral;
  };

  const getQueueBadge = (queueStatus: string) => {
    const badges = {
      queued: badge.warn,
      processing: `${badge.info} animate-pulse`,
      completed: badge.ok,
      failed: badge.danger,
    };
    return badges[queueStatus as keyof typeof badges] || badge.neutral;
  };

  const openLetter = (letter: SantaLetter) => {
    setSelectedLetter(letter);
    setEditReply(letter.santa_reply || '');
    setAdminNotes(letter.admin_notes || '');
  };

  // Queue column: parents who haven't confirmed yet, otherwise the reply queue state
  const queueBadge = (letter: SantaLetter) =>
    isAwaitingParent(letter) ? (
      <span className={isLinkExpired(letter) ? badge.neutral : badge.warn}>
        {isLinkExpired(letter) ? 'link expired' : 'awaiting parent'}
      </span>
    ) : (
      <span className={getQueueBadge(letter.queue_status)}>{letter.queue_status}</span>
    );

  const stat = (label: string, value: number, tone: string) => (
    <div className={insetBox}>
      <p className={eyebrow}>{label}</p>
      <p className={`mt-1 font-mono text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );

  if (status === 'loading' || loading) {
    return (
      <AdminLayout>
        <div className="flex h-96 items-center justify-center">
          <div role="status" className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-adm-line border-t-adm-accent" aria-hidden="true"></div>
            <AdminText>Loading Santa letters...</AdminText>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <AdminH1>Santa letters</AdminH1>
          <AdminText>Manage letters from children to Santa Claus</AdminText>
        </div>

        {/* Letters | Settings (the settings moved here from the Settings page) */}
        <div role="tablist" aria-label="Santa letters sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-adm-line">
          {(['letters', 'settings'] as const).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`${tabClass(tab === key)} capitalize`}
            >
              {key}
            </button>
          ))}
        </div>

        {tab === 'settings' && <SantaLetterSettings />}

        {tab === 'letters' && (<>
        {/* Stats */}
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <section aria-labelledby="letter-overview" className={card}>
            <h2 id="letter-overview" className={`${cardTitle} mb-3`}>Letter overview</h2>
            <div className="grid grid-cols-2 gap-3">
              {stat('Total letters', letters.length, 'text-adm-text')}
              {stat('Not yet answered', letters.filter(l => l.status === 'pending').length, 'text-adm-warn')}
              {stat('Sent successfully', letters.filter(l => l.status === 'sent').length, 'text-adm-ok')}
              {stat('Failed / rejected', letters.filter(l => l.status === 'rejected' || l.queue_status === 'failed').length, 'text-adm-danger')}
            </div>
          </section>

          <section aria-labelledby="queue-status" className={card}>
            <h2 id="queue-status" className={`${cardTitle} mb-3`}>Queue status</h2>
            <div className="grid grid-cols-2 gap-3">
              {stat('Awaiting parent', letters.filter(l => isAwaitingParent(l) && !isLinkExpired(l)).length, 'text-adm-warn')}
              {stat('In queue', letters.filter(l => l.queue_status === 'queued' && !isAwaitingParent(l) && l.status !== 'rejected').length, 'text-adm-info')}
              {stat('Processing', letters.filter(l => l.queue_status === 'processing').length, 'text-adm-info')}
              {stat('Completed', letters.filter(l => l.queue_status === 'completed').length, 'text-adm-ok')}
            </div>
          </section>
        </div>

        {/* Filters and Actions */}
        <div className={`${card} mb-4 flex flex-wrap items-end justify-between gap-3 p-4`}>
          <div className="w-full sm:w-56">
            <AdminLabel htmlFor="letter-filter">Filter</AdminLabel>
            <select
              id="letter-filter"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className={field}
            >
              <option value="all">All Letters</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="sent">Sent</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={triggerQueueProcessing} disabled={updating} className={button}>
              Process queue now
            </button>
            <button onClick={fetchLetters} className={button}>
              Refresh
            </button>
            <button onClick={exportToCSV} className={button}>
              Export CSV
            </button>
          </div>
        </div>

        {/* Letters */}
        <div className={`${card} overflow-hidden p-0`}>
          {filteredLetters.length > 0 ? (
            <>
              {/* Phones: one card per letter */}
              <ul className="divide-y divide-adm-line md:hidden">
                {filteredLetters.map((letter) => (
                  <li key={letter.id} className="flex items-start gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-adm-text">
                        {letter.child_name}{letter.child_age ? `, ${letter.child_age}` : ''}
                      </p>
                      <p className="truncate text-xs text-adm-muted">{letter.parent_email}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className={getStatusBadge(letter.status)}>{letter.status}</span>
                        {queueBadge(letter)}
                        {letter.retry_count > 0 && <span className={badge.danger}>Retries: {letter.retry_count}</span>}
                      </div>
                      <p className="mt-1.5 text-xs text-adm-faint">#{letter.id} · {formatDateTime(letter.created_at, 'medium')}</p>
                    </div>
                    <button onClick={() => openLetter(letter)} className={smallButton}>
                      View
                    </button>
                  </li>
                ))}
              </ul>

              {/* Wider screens: table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full">
                  <thead className="border-b border-adm-line bg-adm-side">
                    <tr>
                      {['ID', 'Child', 'Age', 'Email', 'Status', 'Queue', 'Created', 'Actions'].map((heading) => (
                        <th key={heading} scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.06em] text-adm-muted">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-adm-line">
                    {filteredLetters.map((letter) => (
                      <tr key={letter.id} className="transition-colors hover:bg-adm-hover">
                        <td className="px-4 py-3 font-mono text-[13px] text-adm-muted">{letter.id}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-adm-text">{letter.child_name}</td>
                        <td className="px-4 py-3 text-sm text-adm-soft">{letter.child_age || 'N/A'}</td>
                        <td className="px-4 py-3 text-sm text-adm-soft">{letter.parent_email}</td>
                        <td className="px-4 py-3">
                          <span className={getStatusBadge(letter.status)}>{letter.status}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            {queueBadge(letter)}
                            {letter.retry_count > 0 && (
                              <AdminTextTiny className="text-adm-danger">
                                Retries: {letter.retry_count}
                              </AdminTextTiny>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-adm-soft">{formatDateTime(letter.created_at, 'medium')}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => openLetter(letter)} className={smallButton}>
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-8 text-center">
              <AdminText>No letters found for the selected filter.</AdminText>
            </div>
          )}
        </div>

        {/* Letter Detail Modal */}
        {selectedLetter && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="letter-dialog-title"
              className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-adm-control-line bg-adm-surface"
            >
              <div className="flex items-start justify-between gap-4 border-b border-adm-line p-5">
                <div>
                  <h2 id="letter-dialog-title" className="text-lg font-semibold text-adm-text">
                    Letter from {selectedLetter.child_name}
                  </h2>
                  <p className="mt-0.5 text-[13px] text-adm-muted">
                    Received: {formatDateTime(selectedLetter.created_at, 'long')}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedLetter(null)}
                  aria-label="Close"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-adm-control-line text-adm-text hover:bg-adm-hover"
                >
                  <X className="h-4.5 w-4.5" aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-6 p-5">
                {/* Letter Details */}
                <div>
                  <AdminH3>Letter details</AdminH3>
                  <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                    <div><dt className="inline font-medium text-adm-text">Child name: </dt><dd className="inline text-adm-soft">{selectedLetter.child_name}</dd></div>
                    <div><dt className="inline font-medium text-adm-text">Age: </dt><dd className="inline text-adm-soft">{selectedLetter.child_age || 'Not provided'}</dd></div>
                    <div><dt className="inline font-medium text-adm-text">Parent email: </dt><dd className="inline break-all text-adm-soft">{selectedLetter.parent_email}</dd></div>
                    <div><dt className="inline font-medium text-adm-text">IP address: </dt><dd className="inline text-adm-soft">{selectedLetter.ip_address || 'Unknown'}</dd></div>
                  </dl>
                </div>

                {/* Letter Content */}
                <div>
                  <AdminH3>Letter content</AdminH3>
                  <div className={`${insetBox} whitespace-pre-wrap`}>
                    <AdminText>{selectedLetter.letter_content}</AdminText>
                  </div>
                </div>

                {/* Santa's Reply */}
                <div>
                  <AdminH3>Santa&apos;s reply</AdminH3>
                  <textarea
                    value={editReply}
                    onChange={(e) => setEditReply(e.target.value)}
                    rows={10}
                    aria-label="Santa's reply"
                    className={field}
                    placeholder="Edit Santa's reply..."
                  />
                  <button
                    onClick={() => updateReply(selectedLetter.id, editReply)}
                    disabled={updating}
                    className={`${button} mt-2`}
                  >
                    {updating ? 'Updating...' : 'Update reply'}
                  </button>
                </div>

                {/* Admin Notes */}
                <div>
                  <AdminH3>Admin notes</AdminH3>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={3}
                    aria-label="Admin notes"
                    className={field}
                    placeholder="Internal notes..."
                  />
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 border-t border-adm-line pt-4">
                  {/* Reject = this letter is never answered; only possible before the reply goes out */}
                  {selectedLetter.status !== 'sent' && selectedLetter.status !== 'rejected' && selectedLetter.queue_status !== 'processing' && (
                    <button
                      onClick={() => updateLetterStatus(selectedLetter.id, 'rejected', adminNotes)}
                      disabled={updating}
                      className={dangerButton}
                    >
                      Reject (don&apos;t answer)
                    </button>
                  )}
                  {selectedLetter.status === 'rejected' && (
                    <button
                      onClick={() => updateLetterStatus(selectedLetter.id, 'pending', adminNotes)}
                      disabled={updating}
                      className={button}
                    >
                      Restore
                    </button>
                  )}
                  {(selectedLetter.status === 'approved' || selectedLetter.status === 'sent') && (
                    <button
                      onClick={() => resendEmail(selectedLetter.id)}
                      disabled={updating}
                      className={button}
                    >
                      Resend email
                    </button>
                  )}
                  <button onClick={() => setSelectedLetter(null)} className={`${button} sm:ml-auto`}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        </>)}
      </div>
    </AdminLayout>
  );
}
