'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { DataCard } from '@/components/DataCard';
import { Gauge, UserCircle, Camera, Pulse, Sparkle, ShieldCheck } from '@phosphor-icons/react';

interface UserData {
    first_name: string;
    last_name: string;
    username: string;
    email: string;
    role: string;
    account_status: string;
    face_approved: boolean;
    department?: string;
    student_id?: string;
    batch?: string;
    class_section?: string;
    created_at: string;
    last_login_at?: string;
}

export default function StudentDashboard() {
    const [user, setUser] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchUser() {
            try {
                const data = await api.getMe();
                setUser(data);
            } catch (err) {
                console.error('Failed to load user data:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchUser();
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin" />
                    <Pulse size={24} className="absolute inset-0 m-auto text-blue-400 animate-pulse" />
                </div>
                <p className="text-slate-500 font-mono text-xs uppercase tracking-widest animate-pulse">
                    Loading Student Dashboard...
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-chivo font-bold uppercase tracking-wider flex items-center gap-3">
                    <Gauge size={28} weight="duotone" className="text-blue-400" />
                    Welcome, {user?.first_name}
                </h1>
                <p className="text-slate-500 mt-1">Your student dashboard</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <DataCard title="Account Status" value={user?.account_status?.replace(/_/g, ' ') || '—'} icon={ShieldCheck} />
                <DataCard title="Face Recognition" value={user?.face_approved ? 'Approved' : 'Pending'} icon={Camera} />
                <DataCard title="Department" value={user?.department || '—'} icon={UserCircle} />
            </div>

            {/* Account Info */}
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6 relative overflow-hidden">
                <Sparkle size={80} weight="duotone" className="absolute -right-4 -top-4 text-slate-700/20" />
                <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest mb-5">Your Profile</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 relative z-10">
                    <div className="bg-slate-900/50 rounded-xl p-3">
                        <p className="text-xs text-slate-500 uppercase font-mono">Username</p>
                        <p className="text-slate-200 mt-1">{user?.username}</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-xl p-3">
                        <p className="text-xs text-slate-500 uppercase font-mono">Email</p>
                        <p className="text-slate-200 mt-1">{user?.email}</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-xl p-3">
                        <p className="text-xs text-slate-500 uppercase font-mono">Student ID</p>
                        <p className="text-slate-200 mt-1">{user?.student_id || '—'}</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-xl p-3">
                        <p className="text-xs text-slate-500 uppercase font-mono">Batch</p>
                        <p className="text-slate-200 mt-1">{user?.batch || '—'}</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-xl p-3">
                        <p className="text-xs text-slate-500 uppercase font-mono">Class / Section</p>
                        <p className="text-slate-200 mt-1">{user?.class_section || '—'}</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-xl p-3">
                        <p className="text-xs text-slate-500 uppercase font-mono">Role</p>
                        <div className="mt-1"><StatusBadge status={user?.role || ''} /></div>
                    </div>
                    <div className="bg-slate-900/50 rounded-xl p-3">
                        <p className="text-xs text-slate-500 uppercase font-mono">Status</p>
                        <div className="mt-1"><StatusBadge status={user?.account_status || ''} /></div>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6 relative overflow-hidden">
                <Sparkle size={80} weight="duotone" className="absolute -right-4 -top-4 text-slate-700/20" />
                <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest mb-5">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-3 relative z-10">
                    <button
                        onClick={() => window.location.href = '/student/profile'}
                        className="bg-gradient-to-br from-blue-900/40 to-blue-950/60 border border-blue-700/30 hover:border-blue-600/50 rounded-xl px-4 py-4 text-blue-300 font-bold text-sm uppercase tracking-wider transition-all hover:scale-[1.02]"
                    >
                        Edit Profile
                    </button>
                </div>
            </div>
        </div>
    );
}
