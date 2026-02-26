'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { Clock, Pulse, User, MapPin, Browser } from '@phosphor-icons/react';

interface LoginTrack {
    id: number;
    user_id: number;
    ip_address?: string;
    user_agent?: string;
    success: boolean;
    failure_reason?: string;
    login_at: string;
}

export default function LoginHistoryPage() {
    const [tracks, setTracks] = useState<LoginTrack[]>([]);
    const [loading, setLoading] = useState(true);
    const [limit, setLimit] = useState(50);
    const [userIdFilter, setUserIdFilter] = useState('');

    useEffect(() => {
        fetchHistory();
    }, [limit]);

    const fetchHistory = async () => {
        try {
            setLoading(true);
            const data = await api.getLoginHistory(
                userIdFilter ? parseInt(userIdFilter) : undefined,
                limit
            );
            setTracks(data.tracks || []);
        } catch (err) {
            console.error('Failed to load login history:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading && tracks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-slate-700 border-t-purple-500 animate-spin" />
                    <Pulse size={24} className="absolute inset-0 m-auto text-purple-400 animate-pulse" />
                </div>
                <p className="text-slate-500 font-mono text-xs uppercase tracking-widest animate-pulse">
                    Loading Login History...
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-chivo font-bold uppercase tracking-wider flex items-center gap-3">
                    <Clock size={28} weight="duotone" className="text-purple-400" />
                    Login History
                </h1>
                <p className="text-slate-500 mt-1">Track authentication attempts across the system</p>
            </div>

            {/* Filters */}
            <div className="flex gap-3 items-center">
                <input
                    type="text"
                    placeholder="Filter by user ID..."
                    value={userIdFilter}
                    onChange={(e) => setUserIdFilter(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500 w-48"
                />
                <select
                    value={limit}
                    onChange={(e) => setLimit(parseInt(e.target.value))}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                >
                    <option value={20}>Last 20</option>
                    <option value={50}>Last 50</option>
                    <option value={100}>Last 100</option>
                </select>
                <button onClick={fetchHistory} className="btn-primary rounded-xl">Apply</button>
            </div>

            {/* Login History Table */}
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-900/50 border-b border-slate-700/60 text-xs uppercase text-slate-400 font-mono">
                                <th className="p-4">Time</th>
                                <th className="p-4">User ID</th>
                                <th className="p-4">Status</th>
                                <th className="p-4">IP Address</th>
                                <th className="p-4">User Agent</th>
                                <th className="p-4">Reason</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/60">
                            {tracks.map((t) => (
                                <tr key={t.id} className="hover:bg-slate-800/50 transition-colors">
                                    <td className="p-4 text-sm text-slate-300 font-mono whitespace-nowrap">
                                        {new Date(t.login_at).toLocaleString()}
                                    </td>
                                    <td className="p-4 text-sm text-slate-300 font-mono">
                                        {t.user_id}
                                    </td>
                                    <td className="p-4">
                                        <StatusBadge status={t.success ? 'SUCCESS' : 'FAILED'} />
                                    </td>
                                    <td className="p-4 text-sm text-slate-400 font-mono">
                                        <div className="flex items-center gap-1">
                                            <MapPin size={14} className="text-slate-500" />
                                            {t.ip_address || '—'}
                                        </div>
                                    </td>
                                    <td className="p-4 text-xs text-slate-500 max-w-[200px] truncate">
                                        {t.user_agent || '—'}
                                    </td>
                                    <td className="p-4 text-sm text-slate-400">
                                        {t.failure_reason || '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {tracks.length === 0 && (
                    <div className="p-8 text-center text-slate-500">No login attempts found.</div>
                )}
            </div>
        </div>
    );
}
