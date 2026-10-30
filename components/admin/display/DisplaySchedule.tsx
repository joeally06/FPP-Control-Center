'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { ScheduleRule, ScheduleActionType } from '@/types/display';
import { button, accentButton, smallButton, smallDangerButton } from '@/components/admin/ui-classes';
import { inputClass, selectClass, labelClass, sectionClass, sectionTitle, checkClass, subBox } from './styles';

type RuleForm = {
  id?: number; name: string; enabled: boolean; days: string;
  startTime: string; endTime: string;
  actionType: ScheduleActionType; actionPayload: string; priority: number;
};

interface DisplayScheduleProps {
  rules: ScheduleRule[];
  /** Read the rules again */
  onRefresh: () => void;
}

/** Rules that switch the Digital Sign's content or theme at set times. */
export default function DisplaySchedule({ rules, onRefresh }: DisplayScheduleProps) {
  const [ruleForm, setRuleForm] = useState<RuleForm | null>(null);
  const [ruleError, setRuleError] = useState('');

  return (
      <div className={sectionClass}>
        <div className="flex items-center justify-between">
          <h3 className={sectionTitle}>Timed changes</h3>
          <button
            type="button"
            onClick={() => {
              setRuleError('');
              setRuleForm({ name: '', enabled: true, days: '0,1,2,3,4,5,6', startTime: '18:00', endTime: '22:00', actionType: 'slideshow', actionPayload: '{}', priority: 10 });
            }}
            className={smallButton}
          >
            + Add a timed change
          </button>
        </div>
        <p className="text-xs text-adm-muted">Change the look or show a message on the sign at set times, for example a special screen on game night.</p>

        {/* Rule list */}
        {rules.length === 0 ? (
          <p className="py-4 text-center text-sm text-adm-muted">No timed changes yet.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between gap-3 rounded-lg border border-adm-line bg-adm-surface px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rule.enabled ? 'bg-adm-ok' : 'bg-adm-line'}`} />
                    <span className="truncate text-sm font-medium text-adm-text">{rule.name}</span>
                    <span className="rounded bg-adm-line px-1.5 py-0.5 text-xs capitalize text-adm-soft">{rule.actionType.replace('_', ' ')}</span>
                  </div>
                  <p className="ml-4 mt-0.5 text-xs text-adm-muted">
                    {rule.startTime}–{rule.endTime} · Days {rule.days} · Priority {rule.priority}
                  </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setRuleError('');
                      setRuleForm({
                        id: rule.id, name: rule.name, enabled: rule.enabled,
                        days: rule.days, startTime: rule.startTime, endTime: rule.endTime,
                        actionType: rule.actionType, actionPayload: rule.actionPayload, priority: rule.priority,
                      });
                    }}
                    className={smallButton}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`/api/display/schedule?id=${rule.id}`, { method: 'DELETE' });
                      onRefresh();
                    }}
                    className={smallDangerButton}
                    aria-label={`Delete ${rule.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add / Edit rule form */}
        {ruleForm && (
          <div className={subBox}>
            <h4 className="text-sm font-semibold text-adm-text">{ruleForm.id ? 'Edit timed change' : 'New timed change'}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Rule name</label>
                <input type="text" value={ruleForm.name} maxLength={100} className={inputClass}
                  onChange={(e) => setRuleForm((f) => f ? { ...f, name: e.target.value } : f)} />
              </div>
              <div>
                <label className={labelClass}>Action type</label>
                <select value={ruleForm.actionType} className={selectClass}
                  onChange={(e) => setRuleForm((f) => f ? { ...f, actionType: e.target.value as ScheduleActionType, actionPayload: '{}' } : f)}>
                  <option value="slideshow">Show Google Slides</option>
                  <option value="custom_display">Info screen or photos (not Google Slides)</option>
                  <option value="theme">Override Theme</option>
                  <option value="announcement">Announcement</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Start time (HH:MM)</label>
                <input type="time" value={ruleForm.startTime} className={inputClass}
                  onChange={(e) => setRuleForm((f) => f ? { ...f, startTime: e.target.value } : f)} />
              </div>
              <div>
                <label className={labelClass}>End time (HH:MM)</label>
                <input type="time" value={ruleForm.endTime} className={inputClass}
                  onChange={(e) => setRuleForm((f) => f ? { ...f, endTime: e.target.value } : f)} />
              </div>
              <div>
                <label className={labelClass}>Days (0=Sun … 6=Sat, comma-separated)</label>
                <input type="text" value={ruleForm.days} maxLength={20} className={inputClass} placeholder="0,1,2,3,4,5,6"
                  onChange={(e) => setRuleForm((f) => f ? { ...f, days: e.target.value } : f)} />
              </div>
              <div>
                <label className={labelClass}>Priority (lower = higher priority)</label>
                <input type="number" min={1} max={100} value={ruleForm.priority} className={inputClass}
                  onChange={(e) => setRuleForm((f) => f ? { ...f, priority: Number(e.target.value) } : f)} />
              </div>
            </div>

            {/* Action-specific payload fields */}
            {ruleForm.actionType === 'slideshow' && (
              <div>
                <label className={labelClass}>Google Slides URL</label>
                <input type="url" className={inputClass} placeholder="https://docs.google.com/presentation/…/pub?…"
                  value={(() => { try { return JSON.parse(ruleForm.actionPayload).url ?? ''; } catch { return ''; } })()}
                  onChange={(e) => setRuleForm((f) => f ? { ...f, actionPayload: JSON.stringify({ url: e.target.value }) } : f)} />
              </div>
            )}
            {ruleForm.actionType === 'theme' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Color theme</label>
                  <select className={selectClass}
                    value={(() => { try { return JSON.parse(ruleForm.actionPayload).colorTheme ?? 'christmas'; } catch { return 'christmas'; } })()}
                    onChange={(e) => setRuleForm((f) => { if (!f) return f; const p = (() => { try { return JSON.parse(f.actionPayload); } catch { return {}; } })(); return { ...f, actionPayload: JSON.stringify({ ...p, colorTheme: e.target.value }) }; })}>
                    <option value="christmas">Christmas</option>
                    <option value="winter">Winter</option>
                    <option value="classic">Classic</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>
            )}
            {ruleForm.actionType === 'announcement' && (
              <div>
                <label className={labelClass}>Announcement text</label>
                <input type="text" className={inputClass} maxLength={200}
                  value={(() => { try { return JSON.parse(ruleForm.actionPayload).text ?? ''; } catch { return ''; } })()}
                  onChange={(e) => setRuleForm((f) => f ? { ...f, actionPayload: JSON.stringify({ text: e.target.value }) } : f)} />
              </div>
            )}

            <div className="flex items-center gap-3">
              <input type="checkbox" id="rule-enabled" checked={ruleForm.enabled}
                onChange={(e) => setRuleForm((f) => f ? { ...f, enabled: e.target.checked } : f)}
                className={checkClass} />
              <label htmlFor="rule-enabled" className="text-sm text-adm-text">Rule enabled</label>
            </div>

            {ruleError && <p className="text-xs text-adm-danger">{ruleError}</p>}

            <div className="flex gap-2">
              <button type="button"
                className={accentButton}
                onClick={async () => {
                  setRuleError('');
                  if (!ruleForm.name.trim()) { setRuleError('Rule name is required'); return; }
                  const method = ruleForm.id ? 'PUT' : 'POST';
                  const body = {
                    ...(ruleForm.id ? { id: ruleForm.id } : {}),
                    name: ruleForm.name, enabled: ruleForm.enabled, days: ruleForm.days,
                    startTime: ruleForm.startTime, endTime: ruleForm.endTime,
                    actionType: ruleForm.actionType, actionPayload: ruleForm.actionPayload,
                    priority: ruleForm.priority,
                  };
                  const res = await fetch('/api/display/schedule', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                  if (res.ok) { setRuleForm(null); onRefresh(); }
                  else { const d = await res.json(); setRuleError(d.error ?? 'Save failed'); }
                }}>
                {ruleForm.id ? 'Save Changes' : 'Create Rule'}
              </button>
              <button type="button" onClick={() => setRuleForm(null)}
                className={button}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
  );
}
