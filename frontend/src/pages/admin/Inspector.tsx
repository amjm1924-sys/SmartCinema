
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Search, FileJson, HardDrive, Film, Image as ImageIcon, Database, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export const Inspector = () => {
    const [mediaId, setMediaId] = useState('');
    const [searchId, setSearchId] = useState<number | null>(null);

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ['inspect', searchId],
        queryFn: () => apiClient.inspectMedia(searchId!),
        enabled: !!searchId,
        retry: false
    });

    const handleInspect = (e: React.FormEvent) => {
        e.preventDefault();
        if (!mediaId) return;
        setSearchId(parseInt(mediaId));
    };

    const StatusIcon = ({ valid }: { valid: boolean }) =>
        valid ? <CheckCircle className="w-4 h-4 text-green-500 inline" /> : <XCircle className="w-4 h-4 text-red-500 inline" />;

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Search className="w-5 h-5" />
                        فحص عميق (Deep Inspector)
                    </CardTitle>
                    <CardDescription>
                        أدخل معرف الوسائط (Media ID) للحصول على تقرير تقني شامل عن قاعدة البيانات، الملفات، والصور.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleInspect} className="flex gap-4">
                        <Input
                            placeholder="Media ID (e.g. 123)"
                            value={mediaId}
                            onChange={(e) => setMediaId(e.target.value)}
                            className="max-w-xs"
                            type="number"
                        />
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? 'جاري الفحص...' : 'افحص الآن'}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {error && (
                <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-red-600 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    خطأ: {(error as Error).message} (تأكد من صحة الـ ID)
                </div>
            )}

            {data && (
                <div className="space-y-6 animate-in fade-in duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Quick Overview */}
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Database className="w-4 h-4" />
                                    بيانات أساسية (Database)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-muted-foreground">Title</span>
                                    <span className="font-bold">{data.database.title}</span>
                                </div>
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-muted-foreground">Type</span>
                                    <Badge variant="outline">{data.database.type}</Badge>
                                </div>
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-muted-foreground">Year</span>
                                    <span>{data.database.year}</span>
                                </div>
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-muted-foreground">TMDb ID</span>
                                    <span className="font-mono">{data.database.tmdb_id}</span>
                                </div>
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-muted-foreground">Added At</span>
                                    <span className="text-xs">{data.database.added_at}</span>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Filesystem Info */}
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <HardDrive className="w-4 h-4" />
                                    نظام الملفات (Filesystem)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                                <div className="flex justify-between items-center border-b pb-2">
                                    <span className="text-muted-foreground">Status</span>
                                    <Badge variant={data.filesystem.exists ? "default" : "destructive"}>
                                        {data.filesystem.exists ? "File Exists" : "Missing File"}
                                    </Badge>
                                </div>
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-muted-foreground">Size</span>
                                    <span className="font-mono">{data.filesystem.size_human}</span>
                                </div>
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-muted-foreground">Permissions</span>
                                    <span className="font-mono">{data.filesystem.permissions || 'N/A'}</span>
                                </div>
                                <div className="border-t pt-2 mt-2">
                                    <p className="text-xs text-muted-foreground mb-1">Absolute Path:</p>
                                    <code className="text-[10px] break-all bg-muted p-1 rounded block">
                                        {data.filesystem.abs_path}
                                    </code>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Tabs defaultValue="streams" className="w-full">
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="streams"><Film className="w-4 h-4 mr-2" /> Streams (Video/Audio)</TabsTrigger>
                            <TabsTrigger value="images"><ImageIcon className="w-4 h-4 mr-2" /> Images</TabsTrigger>
                            <TabsTrigger value="raw"><FileJson className="w-4 h-4 mr-2" /> Raw Data</TabsTrigger>
                        </TabsList>

                        <TabsContent value="streams">
                            <Card>
                                <CardContent className="pt-6">
                                    {data.media_info?.streams ? (
                                        <div className="space-y-4">
                                            {data.media_info.streams.map((stream: any, idx: number) => (
                                                <div key={idx} className="border rounded p-3 text-sm">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Badge>{stream.codec_type}</Badge>
                                                        <span className="font-bold">{stream.codec_name}</span>
                                                        {stream.width && <Badge variant="secondary">{stream.width}x{stream.height}</Badge>}
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 text-muted-foreground text-xs">
                                                        <div>Index: {stream.index}</div>
                                                        <div>Bitrate: {stream.bit_rate ? (parseInt(stream.bit_rate) / 1000).toFixed(0) + ' kbps' : 'N/A'}</div>
                                                        {stream.channels && <div>Channels: {stream.channels}</div>}
                                                        {stream.sample_rate && <div>Sample Rate: {stream.sample_rate} Hz</div>}
                                                    </div>
                                                </div>
                                            ))}
                                            <div className="text-xs text-muted-foreground mt-2">
                                                Format: {data.media_info.format?.format_name} | Duration: {data.media_info.format?.duration}s
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-muted-foreground">
                                            No stream info available (FFprobe failed or file missing)
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="images">
                            <Card>
                                <CardContent className="pt-6 grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <h4 className="font-semibold flex items-center gap-2">
                                            Poster <StatusIcon valid={data.images.poster_url.valid} />
                                        </h4>
                                        {data.images.poster_url.url ? (
                                            <div className="border rounded p-2 text-center">
                                                <img
                                                    src={data.images.poster_url.url.startsWith('http') ? data.images.poster_url.url : `${import.meta.env.VITE_API_URL}${data.images.poster_url.url}`}
                                                    className="h-48 mx-auto object-cover rounded shadow"
                                                />
                                                <p className="text-[10px] mt-2 text-muted-foreground break-all">{data.images.poster_url.url}</p>
                                                {data.images.poster_url.local && <Badge variant="secondary" className="mt-1 text-[10px]">Local File</Badge>}
                                            </div>
                                        ) : <div className="text-muted-foreground text-sm italic">No poster URL</div>}
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="font-semibold flex items-center gap-2">
                                            Backdrop <StatusIcon valid={data.images.backdrop_url.valid} />
                                        </h4>
                                        {data.images.backdrop_url.url ? (
                                            <div className="border rounded p-2 text-center">
                                                <img
                                                    src={data.images.backdrop_url.url.startsWith('http') ? data.images.backdrop_url.url : `${import.meta.env.VITE_API_URL}${data.images.backdrop_url.url}`}
                                                    className="w-full h-auto object-cover rounded shadow"
                                                />
                                                <p className="text-[10px] mt-2 text-muted-foreground break-all">{data.images.backdrop_url.url}</p>
                                            </div>
                                        ) : <div className="text-muted-foreground text-sm italic">No backdrop URL</div>}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="raw">
                            <Card>
                                <CardContent className="pt-6">
                                    <pre className="bg-slate-950 text-slate-50 p-4 rounded-lg overflow-auto max-h-[500px] text-xs font-mono" dir="ltr">
                                        {JSON.stringify(data, null, 2)}
                                    </pre>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            )}
        </div>
    );
};


