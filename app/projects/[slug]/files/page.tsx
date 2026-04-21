import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageShell } from '@/components/pe/page-shell';
import { EmptyState } from '@/components/pe/empty-state';
import { FileUploadButton } from '@/components/pe/file-upload-button';
import { getProject, getFiles, getFolders } from '@/lib/queries';
import {
  Folder,
  Download,
  Link2,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';

export default async function FilesPage({
  params,
}: {
  params: { slug: string };
}) {
  const project = await getProject(params.slug);

  if (!project) {
    notFound();
  }

  const [files, folders] = await Promise.all([
    getFiles(params.slug),
    getFolders(params.slug),
  ]);

  // Pick a featured file for the preview pane — mock has 'file-001'; live
  // data uses UUIDs, so fall back to the first available file.
  const selectedFile =
    files.find((f) => f.id === 'file-001') ?? files[0] ?? null;
  const folderFiles = files.filter((f) =>
    f.path.startsWith('Meeting Notes/'),
  );

  const getFileIcon = (type: string) => {
    const colorMap: Record<string, string> = {
      pdf: 'bg-red-200 text-red-700',
      docx: 'bg-blue-200 text-blue-700',
      xlsx: 'bg-green-200 text-green-700',
      image: 'bg-purple-200 text-purple-700',
    };
    const color = colorMap[type] || 'bg-gray-200 text-gray-700';
    const label = type.toUpperCase().slice(0, 3);

    return (
      <div className={`flex h-8 w-8 items-center justify-center rounded text-xs font-bold ${color}`}>
        {label}
      </div>
    );
  };

  const formatRelativeTime = (isoDate: string) => {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <PageShell>
      <div className="grid gap-6 lg:grid-cols-[220px_1fr_380px]">
        {/* Left: Folder Tree */}
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="font-semibold text-pe-body">All files</h2>
          </div>

          <Input
            placeholder="Search files..."
            disabled
            className="text-sm"
          />

          <nav className="space-y-1">
            {folders.map((folder) => (
              <button
                key={folder.name}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  folder.name === 'Meeting Notes'
                    ? 'bg-pe-green/10 text-pe-green-dark font-medium'
                    : 'text-pe-body hover:bg-muted'
                }`}
              >
                <Folder className="h-4 w-4" />
                <span className="flex-1 text-left">{folder.name}</span>
                <Badge variant="secondary" className="text-xs h-5">
                  {folder.fileCount}
                </Badge>
              </button>
            ))}
          </nav>
        </div>

        {/* Center: File List */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-medium text-muted-foreground">
              Files / Meeting Notes
            </div>
            <FileUploadButton
              projectSlug={params.slug}
              folderName="Meeting Notes"
            />
          </div>

          <div className="space-y-2">
            {folderFiles.map((file) => (
              <div
                key={file.id}
                className={`flex items-center gap-3 rounded-md border p-3 transition-colors ${
                  file.id === 'file-001'
                    ? 'border-pe-green/50 bg-pe-green/5'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                {getFileIcon(file.type)}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-pe-body">
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {file.size} · {file.uploadedBy} · {formatRelativeTime(file.updatedAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Preview Pane */}
        {selectedFile && (
          <Card className="h-fit sticky top-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base line-clamp-2">
                {selectedFile.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-xs text-muted-foreground space-y-1">
                <p>{selectedFile.size}</p>
                <p>
                  Uploaded by {selectedFile.uploadedBy} on{' '}
                  {new Date(selectedFile.updatedAt).toLocaleDateString()}
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="gap-2">
                  <Link2 className="h-4 w-4" />
                  Copy link
                </Button>
                <Button variant="ghost" size="sm" className="gap-2">
                  <Download className="h-4 w-4" />
                  Download
                </Button>
                <Button variant="ghost" size="sm" className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Open
                </Button>
              </div>

              <div className="rounded-lg bg-gradient-to-br from-amber-50 to-orange-50 p-8 flex items-center justify-center min-h-[200px] border border-dashed border-amber-200">
                <div className="text-center">
                  <div className="text-xs font-medium text-amber-700 mb-2">
                    PDF preview
                  </div>
                  <p className="text-xs text-amber-600">
                    PDF.js wires in next
                  </p>
                  <div className="mt-3 inline-block">
                    <Badge variant="secondary">{selectedFile.type.toUpperCase()}</Badge>
                  </div>
                </div>
              </div>

              {selectedFile.tags && selectedFile.tags.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-pe-body">Tags</p>
                  <div className="flex gap-2 flex-wrap">
                    {selectedFile.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Comments (0)</span>
                </div>
                <EmptyState
                  title="No comments yet"
                  description="Be the first to comment on this file."
                  className="bg-white/30 border-0 py-4 px-0"
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
