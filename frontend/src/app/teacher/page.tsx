'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DataCard } from '@/components/DataCard';
import { Gauge, Camera, Users, Pulse, Sparkle } from '@phosphor-icons/react';

export default function TeacherDashboard() {
    const [pendingFaces, setPendingFaces] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                const pending = await api.getPendingFaces();
                setPendingFaces(pending?.length || 0);
            } catch {
                console.error('Failed to fetch data');
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
                    <div className="w-12 h-12 rounded-full border-2 border-slate-700 border-t-orange-500 animate-spin" />
                    <Pulse size={24} className="absolute inset-0 m-auto text-orange-400 animate-pulse" />
                </div>
                <p className="text-slate-500 font-mono text-xs uppercase tracking-widest animate-pulse">
                    Loading Teacher Dashboard...
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-chivo font-bold uppercase tracking-wider flex items-center gap-3">
                    <Gauge size={28} weight="duotone" className="text-orange-400" />
                    Teacher Dashboard
                </h1>
                <p className="text-slate-500 mt-1">Overview of your classroom responsibilities</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <DataCard title="Pending Face Approvals" value={pendingFaces} icon={Camera} />
            </div>

            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6 relative overflow-hidden">
                <Sparkle size={80} weight="duotone" className="absolute -right-4 -top-4 text-slate-700/20" />
                <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest mb-5">Quick Actions</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 relative z-10">
                    <button
                        onClick={() => window.location.href = '/teacher/face-approvals'}
                        className="bg-gradient-to-br from-orange-900/40 to-orange-950/60 border border-orange-700/30 hover:border-orange-600/50 rounded-xl px-4 py-4 text-orange-300 font-bold text-sm uppercase tracking-wider transition-all hover:scale-[1.02]"
                    >
                        Review Face Photos
                    </button>
                    <button
                        onClick={() => window.location.href = '/teacher/students'}
                        className="bg-gradient-to-br from-blue-900/40 to-blue-950/60 border border-blue-700/30 hover:border-blue-600/50 rounded-xl px-4 py-4 text-blue-300 font-bold text-sm uppercase tracking-wider transition-all hover:scale-[1.02]"
                    >
                        View Students
                    </button>
                </div>
            </div>
        </div>
    );
}
