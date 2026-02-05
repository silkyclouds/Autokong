import { useState } from 'react';
import { Settings, FileText, Download, Save, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/shared/Card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/Select';
import { Textarea } from '@/components/shared/Textarea';

// Mock properties files
const mockPropertiesFiles = [
  'default.properties',
  'musicbrainz_aggressive.properties',
  'bandcamp_only.properties',
  'rename_standard.properties',
  'dedup_conservative.properties',
];

const taskConfigs = [
  { id: 'musicbrainz_file', label: 'MusicBrainz / Fix songs', value: 'default.properties' },
  { id: 'bandcamp_file', label: 'Bandcamp', value: 'bandcamp_only.properties' },
  { id: 'delete_duplicates_file', label: 'Delete duplicates', value: 'dedup_conservative.properties' },
  { id: 'rename_file', label: 'Rename files', value: 'rename_standard.properties' },
];

const mockFileContent = `# SongKong Properties File
# This file configures the MusicBrainz matching behavior

# Matching threshold (0.0 - 1.0)
match.threshold=0.85

# Allow partial album matches
match.partial.albums=true

# Maximum tracks to process per batch
batch.size=500

# Enable acoustic fingerprinting
acoustid.enabled=true
acoustid.timeout=30

# File handling
rename.pattern=%artist%/%album%/%track% - %title%
rename.replace.spaces=false
rename.lowercase=false

# Logging
log.level=INFO
log.file=/var/log/songkong/matching.log
`;

export function ConfigPage() {
  const [taskSettings, setTaskSettings] = useState<Record<string, string>>(
    Object.fromEntries(taskConfigs.map((t) => [t.id, t.value]))
  );
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  const [selectedFile, setSelectedFile] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [fileSaved, setFileSaved] = useState(false);

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    setConfigSaved(false);
    await new Promise((r) => setTimeout(r, 800));
    setIsSavingConfig(false);
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 3000);
  };

  const handleLoadFile = async () => {
    if (!selectedFile) return;
    setIsLoadingFile(true);
    setFileSaved(false);
    await new Promise((r) => setTimeout(r, 500));
    setFileContent(mockFileContent);
    setIsLoadingFile(false);
  };

  const handleSaveFile = async () => {
    setIsSavingFile(true);
    setFileSaved(false);
    await new Promise((r) => setTimeout(r, 800));
    setIsSavingFile(false);
    setFileSaved(true);
    setTimeout(() => setFileSaved(false), 3000);
  };

  return (
    <div className="px-4 py-6 sm:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">SongKong configuration</h1>
        <p className="mt-1 text-muted-foreground">
          Manage .properties files for each pipeline task
        </p>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Section 1: File per task */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-primary" />
              File per task
            </CardTitle>
            <CardDescription>
              Select which .properties file to use for each SongKong task
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {taskConfigs.map((task) => (
              <div key={task.id} className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  {task.label}
                </label>
                <Select
                  value={taskSettings[task.id]}
                  onValueChange={(v) =>
                    setTaskSettings((prev) => ({ ...prev, [task.id]: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {mockPropertiesFiles.map((file) => (
                      <SelectItem key={file} value={file}>
                        <span className="font-mono text-sm">{file}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSaveConfig} disabled={isSavingConfig}>
                {isSavingConfig ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save configuration
                  </>
                )}
              </Button>
              {configSaved && (
                <span className="flex items-center gap-1 text-sm text-success animate-fade-in">
                  <Check className="h-3.5 w-3.5" />
                  Saved
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Edit a properties file */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Edit a .properties file
            </CardTitle>
            <CardDescription>
              Select a file, load its content, edit, and save
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Select value={selectedFile} onValueChange={setSelectedFile}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a file..." />
                </SelectTrigger>
                <SelectContent>
                  {mockPropertiesFiles.map((file) => (
                    <SelectItem key={file} value={file}>
                      <span className="font-mono text-sm">{file}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="secondary"
                onClick={handleLoadFile}
                disabled={!selectedFile || isLoadingFile}
              >
                {isLoadingFile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Load
              </Button>
            </div>

            <Textarea
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              placeholder="File content will appear here after loading..."
              className="min-h-[300px] text-sm"
            />

            <div className="flex items-center gap-3">
              <Button
                onClick={handleSaveFile}
                disabled={!fileContent || isSavingFile}
              >
                {isSavingFile ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save file
                  </>
                )}
              </Button>
              {fileSaved && (
                <span className="flex items-center gap-1 text-sm text-success animate-fade-in">
                  <Check className="h-3.5 w-3.5" />
                  File saved
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
