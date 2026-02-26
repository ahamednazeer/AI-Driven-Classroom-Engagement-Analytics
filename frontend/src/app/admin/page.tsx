'use client';

import React, { useEffect, useState } from 'react';
import { DataCard } from '@/components/DataCard';
import { StatusBadge } from '@/components/StatusBadge';
import { api } from '@/lib/api';
import { Users, Pulse, Gauge, ArrowSquareOut, Sparkle, Clock, ShieldCheck } from '@phosphor-icons/react';

interface Stats {
    users: {
        total: number;
        by_role: Record<string, number>;
        by_status: Record<string, number>;
        recent_logins: number;
    };
}

export default function AdminDashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                const statsData = await api.getSystemStats();
                setStats(statsData);
            } catch (error) {
                console.error('Failed to fetch data:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-slate-700 border-t-indigo-500 animate-spin" />
                    <Pulse size={24} className="absolute inset-0 m-auto text-indigo-400 animate-pulse" />
                </div>
                <p className="text-slate-500 font-mono text-xs uppercase tracking-widest animate-pulse">
                    Loading Admin Dashboard...
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-chivo font-bold uppercase tracking-wider flex items-center gap-3">
                    <Gauge size={28} weight="duotone" className="text-indigo-400" />
                    Administration
                </h1>
                <p className="text-slate-500 mt-1">System overview and user management</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <DataCard title="Total Users" value={stats?.users.total || 0} icon={Users} />
                <DataCard title="Admins" value={stats?.users.by_role?.ADMIN || 0} icon={ShieldCheck} />
                <DataCard title="Teachers" value={stats?.users.by_role?.TEACHER || 0} icon={Users} />
                <DataCard title="Recent Logins (24h)" value={stats?.users.recent_logins || 0} icon={Clock} />
            </div>

            {/* Distribution & Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Users by Role */}
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6 relative overflow-hidden">
                    <Sparkle size={80} weight="duotone" className="absolute -right-4 -top-4 text-slate-700/20" />
                    <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                        <Users size={16} weight="duotone" />
                        Users by Role
                    </h3>
                    <div className="space-y-3 relative z-10">
                        {stats?.users.by_role && Object.entries(stats.users.by_role).map(([role, count]) => (
                            <div key={role} className="flex items-center justify-between bg-slate-900/50 border border-slate-800/50 rounded-xl px-4 py-3 hover:bg-slate-800/50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <StatusBadge status={role} />
                                </div>
                                <span className="text-slate-100 font-bold font-mono text-lg">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Users by Status */}
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6 relative overflow-hidden">
                    <Sparkle size={80} weight="duotone" className="absolute -right-4 -top-4 text-slate-700/20" />
                    <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                        <ShieldCheck size={16} weight="duotone" />
                        Account Status Distribution
                    </h3>
                    <div className="space-y-3 relative z-10">
                        {stats?.users.by_status && Object.entries(stats.users.by_status).map(([status, count]) => (
                            <div key={status} className="flex items-center justify-between bg-slate-900/50 border border-slate-800/50 rounded-xl px-4 py-3 hover:bg-slate-800/50 transition-colors">
                                <StatusBadge status={status} />
                                <span className="text-slate-100 font-bold font-mono text-lg">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6 relative overflow-hidden">
                <Sparkle size={80} weight="duotone" className="absolute -right-4 -top-4 text-slate-700/20" />
                <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                    <ArrowSquareOut size={16} weight="duotone" />
                    Quick Actions
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 relative z-10">
                    <button
                        onClick={() => window.location.href = '/admin/users'}
                        className="bg-gradient-to-br from-blue-900/40 to-blue-950/60 border border-blue-700/30 hover:border-blue-600/50 rounded-xl px-4 py-4 text-blue-300 font-bold text-sm uppercase tracking-wider transition-all hover:scale-[1.02]"
                    >
                        Manage Users
                    </button>
                    <button
                        onClick={() => window.location.href = '/admin/classes'}
                        className="bg-gradient-to-br from-emerald-900/40 to-emerald-950/60 border border-emerald-700/30 hover:border-emerald-600/50 rounded-xl px-4 py-4 text-emerald-300 font-bold text-sm uppercase tracking-wider transition-all hover:scale-[1.02]"
                    >
                        Manage Classes
                    </button>
                    <button
                        onClick={() => window.location.href = '/admin/login-history'}
                        className="bg-gradient-to-br from-purple-900/40 to-purple-950/60 border border-purple-700/30 hover:border-purple-600/50 rounded-xl px-4 py-4 text-purple-300 font-bold text-sm uppercase tracking-wider transition-all hover:scale-[1.02]"
                    >
                        Login History
                    </button>
                </div>
            </div>
        </div>
    );
}
