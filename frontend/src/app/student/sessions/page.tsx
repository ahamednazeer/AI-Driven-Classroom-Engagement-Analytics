'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { Pulse, Play, Eye } from '@phosphor-icons/react';

interface SessionData {
    id: number;
    session_code: string;
    class_id?: number;
    course: string;
    subject: string;
    topic: string;
    scheduled_start: string;
    scheduled_end: string;
    tracking_enabled: boolean;
    status: string;
}

export default function StudentSessionsPage() {
    const [sessions, setSessions] = useState<SessionData[]>([]);
    const [loading, setLoading] = useState(true);
    const [joiningId, setJoiningId] = useState<number | null>(null);
    const [joinedMap, setJoinedMap] = useState<Record<number, boolean>>({});

    const fetchSessions = async () => {
        try {
            setLoading(true);
            const data = await api.getSessions({ per_page: 100 });
            setSessions(data.sessions || []);
        } catch (err) {
            console.error('Failed to load sessions', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, []);

    const handleJoin = async (sessionId: number) => {
        try {
            setJoiningId(sessionId);
            await api.joinSession(sessionId, {
                auth_type: 'password',
                device_info: {
                    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
                    platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
                },
            });
            setJoinedMap((prev) => ({ ...prev, [sessionId]: true }));
        } catch (err: any) {
            alert(err.message || 'Failed to join session');
        } finally {
            setJoiningId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-slate-700 border-t-sky-500 animate-spin" />
                    <Pulse size={24} className="absolute inset-0 m-auto text-sky-400 animate-pulse" />
                </div>
                <p className="text-slate-500 font-mono text-xs uppercase tracking-widest animate-pulse">
                    Loading Sessions...
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-chivo font-bold uppercase tracking-wider">Live Sessions</h1>
                <p className="text-slate-500 mt-1">Join your active classroom sessions</p>
            </div>

            <div className="bg-slate-800/40 border border-slate-700/60 rounded-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-900/50 border-b border-slate-700/60 text-xs uppercase text-slate-400 font-mono">
                                <th className="p-4">Topic</th>
                                <th className="p-4">Course</th>
                                <th className="p-4">Time</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/60">
                            {sessions.map((s) => (
                                <tr key={s.id} className="hover:bg-slate-800/50 transition-colors">
                                    <td className="p-4">
                                        <div className="font-semibold text-slate-200">{s.topic}</div>
                                        <div className="text-xs text-slate-500">{s.subject}</div>
                                    </td>
                                    <td className="p-4 text-sm text-slate-400">{s.course}</td>
                                    <td className="p-4 text-sm text-slate-400 font-mono">
                                        {new Date(s.scheduled_start).toLocaleString()}
                                    </td>
                                    <td className="p-4">
                                        <StatusBadge status={s.status} />
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <a
                                                href={`/student/sessions/${s.id}`}
                                                className="p-2 text-slate-400 hover:text-sky-400 hover:bg-sky-950/30 rounded-sm transition-colors"
                                                title="View"
                                            >
                                                <Eye size={18} />
                                            </a>
                                            {s.status === 'LIVE' && (
                                                <button
                                                    onClick={() => handleJoin(s.id)}
                                                    disabled={joiningId === s.id || joinedMap[s.id]}
                                                    className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-950/30 rounded-sm transition-colors disabled:opacity-50"
                                                    title="Join"
                                                >
                                                    <Play size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {sessions.length === 0 && (
                    <div className="p-8 text-center text-slate-500">No live sessions right now.</div>
                )}
            </div>
        </div>
    );
}
