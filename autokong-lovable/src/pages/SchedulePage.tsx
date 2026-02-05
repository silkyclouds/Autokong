import { useState } from 'react';
import { Calendar, Clock, RotateCcw, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/shared/Card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/Select';
import { Checkbox } from '@/components/shared/Checkbox';
import { Input } from '@/components/shared/Input';
import type { PipelineStep, RunScope, ScheduleConfig } from '@/types/autokong';

const presetOptions = [
  { value: 'nightly', label: 'Nightly (3:00 AM)', cron: '0 3 * * *' },
  { value: 'weekly', label: 'Weekly (Sunday 2:00 AM)', cron: '0 2 * * 0' },
  { value: 'monthly', label: 'Monthly (1st at 2:00 AM)', cron: '0 2 1 * *' },
  { value: 'custom', label: 'Custom cron expression', cron: '' },
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
      { id: 'final_clash_cleanup', label: 'Final clash cleanup' },
    ],
  },
  {
    label: 'Cleanup & Plex',
    steps: [
      { id: 'autoclean_empty', label: 'Auto-clean empty folders' },
      { id: 'remove_incomplete', label: 'Remove incomplete' },
      { id: 'plex_scans', label: 'Plex scans' },
      { id: 'plex_trash', label: 'Plex trash' },
    ],
  },
];

const allSteps = stepGroups.flatMap((g) => g.steps.map((s) => s.id));

export function SchedulePage() {
  const [enabled, setEnabled] = useState(true);
  const [preset, setPreset] = useState<string>('nightly');
  const [customCron, setCustomCron] = useState('0 3 * * *');
  const [scope, setScope] = useState<RunScope>('daily');
  const [useCustomSteps, setUseCustomSteps] = useState(false);
  const [selectedSteps, setSelectedSteps] = useState<Set<PipelineStep>>(new Set(allSteps));
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const currentCron = preset === 'custom' ? customCron : presetOptions.find((p) => p.value === preset)?.cron || '';
  const nextRun = '2024-01-18 03:00 AM'; // Mock

  const toggleStep = (step: PipelineStep) => {
    if (!useCustomSteps) return;
    const newSteps = new Set(selectedSteps);
    if (newSteps.has(step)) {
      newSteps.delete(step);
    } else {
      newSteps.add(step);
    }
    setSelectedSteps(newSteps);
  };

  const handleResetSteps = () => {
    setUseCustomSteps(false);
    setSelectedSteps(new Set(allSteps));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSavedMessage(null);

    // Simulate API call
    await new Promise((r) => setTimeout(r, 1000));

    setIsSaving(false);
    setSavedMessage('Schedule saved successfully');
    setTimeout(() => setSavedMessage(null), 3000);
  };

  return (
    <div className="px-4 py-6 sm:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Schedule</h1>
        <p className="mt-1 text-muted-foreground">
          Configure automatic pipeline runs. When enabled, the selected jobs run at the chosen frequency.
        </p>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
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

            {/* Frequency preset */}
            <div className="space-y-2">
              <label className="section-header">Frequency</label>
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {presetOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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

            {/* Next run */}
            {enabled && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-sm">
                  Next run: <span className="font-medium text-foreground">{nextRun}</span>
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
