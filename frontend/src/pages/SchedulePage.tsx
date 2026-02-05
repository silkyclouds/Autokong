import { useState, useEffect } from 'react';
import { Calendar, Clock, RotateCcw, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/shared/Card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/Select';
import { Checkbox } from '@/components/shared/Checkbox';
import { Input } from '@/components/shared/Input';
import * as api from '@/lib/api';
import type { PipelineStep, RunScope } from '@/types/autokong';

const presetOptions = [
  { value: 'nightly', label: 'Daily', description: 'Every day at a specific time' },
  { value: 'weekly', label: 'Weekly', description: 'Once a week at a specific day/time' },
  { value: 'monthly', label: 'Monthly', description: 'Once a month on a specific day/time' },
  { value: 'custom', label: 'Raw cron expression', description: 'Expert mode: edit the cron directly' },
];

const scopeOptions: { value: RunScope; label: string }[] = [
  { value: 'daily', label: 'Daily (days before today)' },
  { value: 'monthly', label: 'Monthly (entire month)' },
  { value: 'all_days', label: 'All days (all subfolders)' },
];

const stepGroups: { label: string; steps: { id: PipelineStep; label: string }[] }[] = [
  {
    label: 'Identification',
    steps: [
      { id: 'musicbrainz', label: 'MusicBrainz / Fix songs' },
      { id: 'bandcamp', label: 'Bandcamp' },
    ],
  },
  {
    label: 'Deduplication & Rename',
    steps: [
      { id: 'delete_duplicates', label: 'Delete duplicates' },
      { id: 'rename', label: 'Rename files' },
    ],
  },
  {
    label: 'Cleanup & Plex',
    steps: [
      { id: 'autoclean_empty', label: 'Auto-clean empty folders' },
      { id: 'plex_scans', label: 'Plex scans' },
      { id: 'plex_trash', label: 'Plex trash' },
    ],
  },
];

const allSteps = stepGroups.flatMap((g) => g.steps.map((s) => s.id));

export function SchedulePage() {
  const [enabled, setEnabled] = useState(false);
  const [preset, setPreset] = useState<string>('nightly');
  const [customCron, setCustomCron] = useState('0 3 * * *');
  const [cron, setCron] = useState('0 3 * * *');
  const [hour, setHour] = useState<number>(3);
  const [minute, setMinute] = useState<number>(0);
  const [weeklyDow, setWeeklyDow] = useState<number>(0); // 0 = Sunday
  const [monthlyDom, setMonthlyDom] = useState<number>(1);
  const [scope, setScope] = useState<RunScope>('daily');
  const [useCustomSteps, setUseCustomSteps] = useState(false);
  const [selectedSteps, setSelectedSteps] = useState<Set<PipelineStep>>(new Set(allSteps));
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [nextRun, setNextRun] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getSchedule(), api.getConfig()]).then(([sched, config]) => {
      setEnabled(!!sched.enabled);
      setPreset((sched as { preset?: string }).preset || 'nightly');
      const c = (sched as { cron?: string }).cron || '0 3 * * *';
      setCron(c);
      setCustomCron(c);
      // Parse existing cron (minute hour dom month dow) to initialise pickers when possible
      const parts = String(c).trim().split(/\s+/);
      if (parts.length === 5) {
        const [minStr, hourStr, domStr, _monthStr, dowStr] = parts;
        const mVal = parseInt(minStr, 10);
        const hVal = parseInt(hourStr, 10);
        if (!Number.isNaN(mVal)) setMinute(mVal);
        if (!Number.isNaN(hVal)) setHour(hVal);
        const dVal = parseInt(domStr, 10);
        if (!Number.isNaN(dVal)) setMonthlyDom(dVal);
        const dowVal = parseInt(dowStr, 10);
        if (!Number.isNaN(dowVal)) setWeeklyDow(dowVal);
      }
      const scopeVal = (sched as { scope?: string }).scope ?? (config as { scope?: string }).scope ?? 'daily';
      setScope(scopeVal as RunScope);
      const steps = (sched as { steps?: string[] }).steps;
      if (steps != null && steps.length > 0) {
        setUseCustomSteps(true);
        setSelectedSteps(new Set(steps as PipelineStep[]));
      } else {
        const defaultSteps = (config as { steps_enabled?: string[] }).steps_enabled || allSteps;
        setSelectedSteps(new Set(defaultSteps as PipelineStep[]));
      }
      setNextRun((sched as { next_run?: string }).next_run || null);
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (preset === 'custom') {
      setCron(customCron);
      return;
    }
    const mm = Math.max(0, Math.min(59, minute));
    const hh = Math.max(0, Math.min(23, hour));
    let expr = `${mm} ${hh} * * *`;
    if (preset === 'weekly') {
      const dow = Math.max(0, Math.min(6, weeklyDow));
      expr = `${mm} ${hh} * * ${dow}`;
    } else if (preset === 'monthly') {
      const dom = Math.max(1, Math.min(31, monthlyDom));
      expr = `${mm} ${hh} ${dom} * *`;
    }
    setCron(expr);
  }, [preset, hour, minute, weeklyDow, monthlyDom, customCron]);

  const toggleStep = (step: PipelineStep) => {
    if (!useCustomSteps) return;
    const newSteps = new Set(selectedSteps);
    if (newSteps.has(step)) newSteps.delete(step);
    else newSteps.add(step);
    setSelectedSteps(newSteps);
  };

  const handleResetSteps = () => {
    setUseCustomSteps(false);
    setSelectedSteps(new Set(allSteps));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSavedMessage(null);
    setError(null);
    try {
      await api.saveSchedule({
        enabled,
        preset,
        cron: preset === 'custom' ? customCron : cron,
        scope,
        steps: useCustomSteps ? Array.from(selectedSteps) : null,
      });
      const updated = await api.getSchedule();
      setNextRun((updated as { next_run?: string }).next_run || null);
      setSavedMessage('Schedule saved successfully');
      setTimeout(() => setSavedMessage(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 py-8 sm:p-8">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:p-8">
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Schedule</h1>
        <p className="mt-1 text-muted-foreground">
          Configure automatic pipeline runs. When enabled, the selected jobs run at the chosen frequency.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Enable and frequency */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Schedule settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Enable toggle */}
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-accent/30">
              <Checkbox
                checked={enabled}
                onCheckedChange={(c) => setEnabled(!!c)}
              />
              <div>
                <span className="font-medium">Enable scheduled runs</span>
                <p className="text-sm text-muted-foreground">
                  Automatically run the pipeline at the configured schedule
                </p>
              </div>
            </label>

            {/* Frequency preset + visual picker */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="section-header">Frequency</label>
                <Select value={preset} onValueChange={setPreset}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {presetOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex flex-col">
                          <span>{opt.label}</span>
                          <span className="text-xs text-muted-foreground">{opt.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {preset !== 'custom' && (
                <>
                  <div className="space-y-2">
                    <label className="section-header flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      Time of day
                    </label>
                    <div className="flex gap-2 max-sm:flex-col">
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={hour}
                        onChange={(e) => setHour(Number(e.target.value) || 0)}
                        className="w-28"
                      />
                      <Input
                        type="number"
                        min={0}
                        max={59}
                        value={minute}
                        onChange={(e) => setMinute(Number(e.target.value) || 0)}
                        className="w-28"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      24h format. Hour (0–23), minute (0–59).
                    </p>
                  </div>

                  {preset === 'weekly' && (
                    <div className="space-y-2">
                      <label className="section-header">Day of week</label>
                      <Select
                        value={String(weeklyDow)}
                        onValueChange={(v) => setWeeklyDow(Number(v))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Sunday</SelectItem>
                          <SelectItem value="1">Monday</SelectItem>
                          <SelectItem value="2">Tuesday</SelectItem>
                          <SelectItem value="3">Wednesday</SelectItem>
                          <SelectItem value="4">Thursday</SelectItem>
                          <SelectItem value="5">Friday</SelectItem>
                          <SelectItem value="6">Saturday</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {preset === 'monthly' && (
                    <div className="space-y-2">
                      <label className="section-header">Day of month</label>
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        value={monthlyDom}
                        onChange={(e) => setMonthlyDom(Number(e.target.value) || 1)}
                        className="w-28"
                      />
                      <p className="text-xs text-muted-foreground">
                        1–31. If the day does not exist in a month, the cron engine may skip that month.
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Custom cron input */}
              {preset === 'custom' && (
                <div className="space-y-2">
                  <label className="section-header">Cron expression</label>
                  <Input
                    value={customCron}
                    onChange={(e) => setCustomCron(e.target.value)}
                    placeholder="0 3 * * *"
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Format: minute hour day month weekday
                  </p>
                </div>
              )}

              {/* Effective cron preview */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Generated cron expression</p>
                <div className="inline-flex rounded-md bg-muted px-2 py-1 font-mono text-xs">
                  {cron}
                </div>
              </div>
            </div>

            {/* Next run */}
            {enabled && nextRun && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-sm">
                  Next run: <span className="font-medium text-foreground">{new Date(nextRun).toLocaleString()}</span>
                </span>
              </div>
            )}

            {/* Scope */}
            <div className="space-y-2">
              <label className="section-header">Scope</label>
              <Select value={scope} onValueChange={(v) => setScope(v as RunScope)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scopeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Jobs to run */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Jobs to run</CardTitle>
                <CardDescription>
                  {useCustomSteps
                    ? 'Custom steps for this schedule'
                    : 'Using default steps from Run page'}
                </CardDescription>
              </div>
              {useCustomSteps && (
                <Button variant="ghost" size="sm" onClick={handleResetSteps}>
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Reset to default
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/30">
              <Checkbox
                checked={useCustomSteps}
                onCheckedChange={(c) => setUseCustomSteps(!!c)}
              />
              <span className="text-sm">Use custom steps for this schedule</span>
            </label>

            <div className={useCustomSteps ? '' : 'pointer-events-none opacity-50'}>
              {stepGroups.map((group) => (
                <div key={group.label} className="mb-4">
                  <p className="section-header">{group.label}</p>
                  <div className="space-y-1">
                    {group.steps.map((step) => (
                      <label
                        key={step.id}
                        className="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent/50"
                      >
                        <Checkbox
                          checked={selectedSteps.has(step.id)}
                          onCheckedChange={() => toggleStep(step.id)}
                          disabled={!useCustomSteps}
                        />
                        <span className="text-sm">{step.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save button */}
      <div className="mt-6 flex items-center gap-4">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save schedule
            </>
          )}
        </Button>
        {savedMessage && (
          <span className="text-sm text-success animate-fade-in">{savedMessage}</span>
        )}
      </div>
    </div>
  );
}
