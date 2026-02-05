import { useState, useEffect } from 'react';
import { Settings, FileText, Download, Save, Loader2, Check, Server, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/shared/Card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/Select';
import { Textarea } from '@/components/shared/Textarea';
import { Input } from '@/components/shared/Input';
import * as api from '@/lib/api';

const taskConfigs = [
  { id: 'musicbrainz', label: 'MusicBrainz / Fix songs' },
  { id: 'bandcamp', label: 'Bandcamp' },
  { id: 'delete_duplicates', label: 'Delete duplicates' },
  { id: 'rename', label: 'Rename files' },
];

const defaultSongkongFiles: Record<string, string> = {
  musicbrainz: 'songkong_fixsongs4.properties',
  bandcamp: 'songkong_bandcamp.properties',
  delete_duplicates: 'songkong_deleteduplicates.properties',
  rename: 'songkong_renamefiles.properties',
};

export function ConfigPage() {
  const [taskSettings, setTaskSettings] = useState<Record<string, string>>(defaultSongkongFiles);
  const [fileList, setFileList] = useState<string[]>([]);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [fileSaved, setFileSaved] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [discover, setDiscover] = useState<{
    discovered_prefs_dir: string | null;
    current_prefs_dir: string;
    message?: string;
  } | null>(null);

  const [plexHost, setPlexHost] = useState('');
  const [plexToken, setPlexToken] = useState('');
  const [plexLibrarySection, setPlexLibrarySection] = useState('');
  const [plexDumpPath, setPlexDumpPath] = useState('');
  const [plexMatchedPath, setPlexMatchedPath] = useState('');
  const [plexDiscoverContainers, setPlexDiscoverContainers] = useState<{
    id: string;
    name: string;
    image: string;
    state: string;
    env: Record<string, string>;
    mounts: { source: string; destination: string }[];
  }[]>([]);
  const [plexDiscoverLoading, setPlexDiscoverLoading] = useState(false);
  const [plexSaveStatus, setPlexSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [plexSections, setPlexSections] = useState<{ key: string; title: string; type?: string }[]>([]);
  const [plexSectionsError, setPlexSectionsError] = useState<string | null>(null);

  const [hostRoot, setHostRoot] = useState('');
  const [dumpHostDir, setDumpHostDir] = useState('');
  const [extraDumpDirs, setExtraDumpDirs] = useState<string>('');

  useEffect(() => {
    Promise.all([api.getConfig(), api.getSongkongConfigList()]).then(([config, listData]) => {
      const c = config as Record<string, unknown>;
      const sf = (c.songkong_files as Record<string, string>) || defaultSongkongFiles;
      setTaskSettings({ ...defaultSongkongFiles, ...sf });
      setFileList((listData as { files?: string[] }).files || []);
      const paths = (c.paths as { host_root?: string; dump_host_dir?: string; dump_host_dirs?: string[] }) || {};
      setHostRoot(paths.host_root || '');
      setDumpHostDir(paths.dump_host_dir || '');
      setExtraDumpDirs((paths.dump_host_dirs || []).join('\n'));
      setPlexHost((c.plex_host as string) ?? '');
      setPlexToken((c.plex_token as string) ?? '');
      setPlexLibrarySection(String((c.plex_library_section as string) ?? '1'));
      setPlexDumpPath((c.plex_dump_path as string) ?? '');
      setPlexMatchedPath((c.plex_matched_path as string) ?? '');
    }).catch((e) => setConfigError(e.message)).finally(() => setLoading(false));
    api.getSongkongConfigDiscover().then((d) => {
      setDiscover({
        discovered_prefs_dir: d.discovered_prefs_dir,
        current_prefs_dir: d.current_prefs_dir,
        message: d.message,
      });
    }).catch(() => setDiscover(null));
  }, []);

  const savePlexSetting = async (key: string, value: string) => {
    setPlexSaveStatus('saving');
    try {
      const config = await api.getConfig();
      await api.saveConfig({ ...config, [key]: value });
      setPlexSaveStatus('saved');
      setTimeout(() => setPlexSaveStatus('idle'), 2000);
    } catch {
      setPlexSaveStatus('idle');
    }
  };

  const handlePlexDiscover = async () => {
    setPlexDiscoverLoading(true);
    try {
      const r = await api.getPlexDiscover();
      setPlexDiscoverContainers(r.containers || []);
    } catch {
      setPlexDiscoverContainers([]);
    } finally {
      setPlexDiscoverLoading(false);
    }
  };

  const handlePlexLoadSections = async () => {
    setPlexSectionsError(null);
    try {
      const r = await api.getPlexSections();
      if (r.error) {
        setPlexSections([]);
        setPlexSectionsError(r.error);
      } else {
        setPlexSections(r.sections || []);
      }
    } catch (e) {
      setPlexSections([]);
      setPlexSectionsError(e instanceof Error ? e.message : 'Failed to load Plex libraries');
    }
  };

  const savePaths = async (next: { host_root?: string; dump_host_dir?: string; dump_host_dirs?: string[] }) => {
    setIsSavingConfig(true);
    setConfigSaved(false);
    setConfigError(null);
    try {
      const config = await api.getConfig();
      const prevPaths = (config.paths as Record<string, unknown>) || {};
      const updatedPaths = {
        ...prevPaths,
        ...next,
      };
      await api.saveConfig({ ...config, paths: updatedPaths });
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    setConfigSaved(false);
    setConfigError(null);
    try {
      const config = await api.getConfig();
      await api.saveConfig({ ...config, songkong_files: taskSettings });
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleLoadFile = async () => {
    if (!selectedFile) return;
    setIsLoadingFile(true);
    setFileSaved(false);
    setFileError(null);
    try {
      const data = await api.getSongkongConfigFile(selectedFile);
      setFileContent(data.content ?? '');
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setIsLoadingFile(false);
    }
  };

  const handleSaveFile = async () => {
    if (!selectedFile) return;
    setIsSavingFile(true);
    setFileSaved(false);
    setFileError(null);
    try {
      await api.putSongkongConfigFile(selectedFile, fileContent);
      setFileSaved(true);
      setTimeout(() => setFileSaved(false), 3000);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setIsSavingFile(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 py-8 sm:p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:p-8">
      {configError && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {configError}
        </div>
      )}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">SongKong configuration</h1>
        <p className="mt-1 text-muted-foreground">
          Manage .properties files for each pipeline task
        </p>
      </div>

      {discover && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Config path in use:</span>{' '}
              <code className="rounded bg-muted px-1">{discover.current_prefs_dir}</code>
            </p>
            {discover.discovered_prefs_dir && (
              <p className="mt-1 text-sm text-muted-foreground">
                Detected from SongKong container (Docker): <code className="rounded bg-muted px-1">{discover.discovered_prefs_dir}</code>
              </p>
            )}
            {discover.message && !discover.discovered_prefs_dir && (
              <p className="mt-1 text-xs text-muted-foreground">{discover.message}</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
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
                  value={taskSettings[task.id] || ''}
                  onValueChange={(v) =>
                    setTaskSettings((prev) => ({ ...prev, [task.id]: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fileList.length === 0 && taskSettings[task.id] && (
                      <SelectItem value={taskSettings[task.id]}>
                        <span className="font-mono text-sm">{taskSettings[task.id]}</span>
                      </SelectItem>
                    )}
                    {fileList.map((file) => (
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
            {fileError && (
              <p className="text-sm text-destructive">{fileError}</p>
            )}
            <div className="flex gap-2">
              <Select value={selectedFile} onValueChange={(v) => { setSelectedFile(v); setFileContent(''); setFileError(null); }}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a file..." />
                </SelectTrigger>
                <SelectContent>
                  {fileList.map((file) => (
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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-primary" />
            Paths (source folders)
          </CardTitle>
          <CardDescription>
            Configure the host music root and one or more starting folders where new, unprocessed files arrive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Host root (music root)</label>
              <Input
                value={hostRoot}
                onChange={(e) => setHostRoot(e.target.value)}
                onBlur={() => savePaths({ host_root: hostRoot })}
                placeholder="/mnt/downloads_cache/MURRAY/Music"
              />
              <p className="text-xs text-muted-foreground">
                Used for path mapping and default dump folder discovery if no explicit dump folder is set.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Primary dump folder</label>
              <Input
                value={dumpHostDir}
                onChange={(e) => setDumpHostDir(e.target.value)}
                onBlur={() => savePaths({ dump_host_dir: dumpHostDir })}
                placeholder="/mnt/downloads_cache/MURRAY/Music/Music_dump/02-2026"
              />
              <p className="text-xs text-muted-foreground">
                Optional. If empty, Autokong falls back to Music_dump/&lt;month&gt; under the host root.
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Additional starting folders (one per line)</label>
            <Textarea
              value={extraDumpDirs}
              onChange={(e) => setExtraDumpDirs(e.target.value)}
              onBlur={() =>
                savePaths({
                  dump_host_dirs: extraDumpDirs
                    .split('\n')
                    .map((l) => l.trim())
                    .filter((l) => l.length > 0),
                })
              }
              placeholder={`/mnt/downloads_cache/OTHER/Music_inbox\n/mnt/another/path`}
              className="min-h-[120px] text-xs font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Autokong will aggregate folders from all these starting points according to the selected scope.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            Plex
          </CardTitle>
          <CardDescription>
            Plex server URL, token, and path mappings. Settings are saved automatically when you change a value.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePlexDiscover} disabled={plexDiscoverLoading}>
              {plexDiscoverLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Discover from Docker
            </Button>
            <Button variant="outline" size="sm" onClick={handlePlexLoadSections}>
              Load libraries from Plex
            </Button>
            {plexSaveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-sm text-success">
                <Check className="h-3.5 w-3.5" /> Saved
              </span>
            )}
          </div>
          {plexSectionsError && (
            <p className="text-xs text-destructive">{plexSectionsError}</p>
          )}
          {plexSections.length > 0 && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-sm font-medium">Plex libraries</p>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {plexSections.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => {
                      setPlexLibrarySection(s.key || '');
                      savePlexSetting('plex_library_section', s.key || '');
                    }}
                    className={`flex flex-col items-start rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                      plexLibrarySection === s.key ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <span className="font-medium text-foreground">{s.title}</span>
                    {s.type && (
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {s.type}
                      </span>
                    )}
                    <span className="mt-1 font-mono text-[11px] text-muted-foreground">
                      ID: {s.key}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {plexDiscoverContainers.length > 0 && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-sm font-medium">Discovered Plex containers</p>
              {plexDiscoverContainers.map((c) => (
                <div key={c.id} className="text-sm">
                  <p className="font-mono text-muted-foreground">{c.name} ({c.state})</p>
                  {c.mounts.length > 0 && (
                    <table className="mt-1 w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-1">Host path</th>
                          <th className="text-left py-1">Container path</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.mounts.map((m, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-1 font-mono truncate max-w-[200px]" title={m.source}>{m.source}</td>
                            <td className="py-1 font-mono">{m.destination}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Plex URL</label>
              <Input
                value={plexHost}
                onChange={(e) => setPlexHost(e.target.value)}
                onBlur={() => plexHost && savePlexSetting('plex_host', plexHost)}
                placeholder="http://192.168.3.2:32400"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Plex token</label>
              <Input
                type="password"
                value={plexToken}
                onChange={(e) => setPlexToken(e.target.value)}
                onBlur={() => savePlexSetting('plex_token', plexToken)}
                placeholder="Token"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Library section ID</label>
              <Input
                value={plexLibrarySection}
                onChange={(e) => setPlexLibrarySection(e.target.value)}
                onBlur={() => plexLibrarySection && savePlexSetting('plex_library_section', plexLibrarySection)}
                placeholder="1"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Dump path (in Plex)</label>
              <Input
                value={plexDumpPath}
                onChange={(e) => setPlexDumpPath(e.target.value)}
                onBlur={() => savePlexSetting('plex_dump_path', plexDumpPath)}
                placeholder="/music/unmatched"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Matched path (in Plex)</label>
              <Input
                value={plexMatchedPath}
                onChange={(e) => setPlexMatchedPath(e.target.value)}
                onBlur={() => savePlexSetting('plex_matched_path', plexMatchedPath)}
                placeholder="/music/matched"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
