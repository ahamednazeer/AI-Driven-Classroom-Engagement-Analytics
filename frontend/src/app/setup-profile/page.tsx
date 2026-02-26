'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { UserCircle, CheckCircle, Warning, GraduationCap } from '@phosphor-icons/react';

const roleRoutes: Record<string, string> = {
    ADMIN: '/admin',
    TEACHER: '/teacher',
    STUDENT: '/student/profile',
};

export default function SetupProfilePage() {
    const router = useRouter();
    const [checking, setChecking] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [form, setForm] = useState({
        first_name: '',
        last_name: '',
        phone: '',
        department: '',
    });

    useEffect(() => {
        async function init() {
            const token = api.getToken();
            if (!token) {
                router.replace('/');
                return;
            }

            try {
                const me = await api.getMe();
                if (me.account_status === 'PENDING_FIRST_LOGIN') {
                    router.replace('/change-password');
                    return;
                }
                if (me.account_status !== 'PROFILE_SETUP_REQUIRED') {
                    router.replace(roleRoutes[me.role] || '/');
                    return;
                }

                setForm({
                    first_name: me.first_name || '',
                    last_name: me.last_name || '',
                    phone: me.phone || '',
                    department: me.department || '',
                });
            } catch {
                api.clearToken();
                router.replace('/');
                return;
            } finally {
                setChecking(false);
            }
        }
        init();
    }, [router]);

    if (checking) {
        return (
            <div
                className="min-h-screen flex items-center justify-center bg-cover bg-center relative"
                style={{ backgroundImage: 'linear-gradient(to bottom right, #0f172a, #1e293b)' }}
            >
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
                <div className="relative z-10 text-center space-y-4">
                    <GraduationCap size={48} className="text-blue-500 animate-pulse mx-auto" />
                    <div className="text-slate-500 font-mono text-sm animate-pulse">PREPARING...</div>
                </div>
            </div>
        );
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');

        if (!form.first_name.trim() || !form.last_name.trim()) {
            setError('First name and last name are required.');
            return;
        }

        setLoading(true);
        try {
            const updated = await api.completeProfile({
                first_name: form.first_name.trim(),
                last_name: form.last_name.trim(),
                phone: form.phone || undefined,
                department: form.department || undefined,
            });

            setMessage('Profile updated successfully.');
            const route = roleRoutes[updated.role] || '/';
            router.push(route);
        } catch (err: any) {
            setError(err.message || 'Failed to update profile.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="min-h-screen flex items-center justify-center bg-cover bg-center relative"
            style={{ backgroundImage: 'linear-gradient(to bottom right, #0f172a, #1e293b)' }}
        >
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
            <div className="scanlines" />

            <div className="relative z-10 w-full max-w-lg mx-4">
                <div className="bg-slate-900/90 border border-slate-700 rounded-sm p-8 backdrop-blur-md">
                    <div className="flex flex-col items-center mb-8">
                        <UserCircle size={44} weight="duotone" className="text-blue-400 mb-4" />
                        <h1 className="text-2xl font-chivo font-bold uppercase tracking-wider text-center">
                            Complete Profile
                        </h1>
                        <p className="text-slate-400 text-sm mt-2 text-center">
                            Finish your profile to activate your account.
                        </p>
                    </div>

                    {error && (
                        <div className="bg-red-950/50 border border-red-800 rounded-sm p-3 mb-4 text-sm text-red-400 flex items-center gap-2">
                            <Warning size={16} weight="bold" /> {error}
                        </div>
                    )}
                    {message && (
                        <div className="bg-green-950/50 border border-green-800 rounded-sm p-3 mb-4 text-sm text-green-400 flex items-center gap-2">
                            <CheckCircle size={16} weight="bold" /> {message}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2 font-mono">
                                    First Name
                                </label>
                                <input
                                    type="text"
                                    value={form.first_name}
                                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                                    required
                                    className="input-modern"
                                    placeholder="First name"
                                    disabled={loading}
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2 font-mono">
                                    Last Name
                                </label>
                                <input
                                    type="text"
                                    value={form.last_name}
                                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                                    required
                                    className="input-modern"
                                    placeholder="Last name"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2 font-mono">
                                    Phone
                                </label>
                                <input
                                    type="text"
                                    value={form.phone}
                                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                    className="input-modern"
                                    placeholder="+1..."
                                    disabled={loading}
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2 font-mono">
                                    Department
                                </label>
                                <input
                                    type="text"
                                    value={form.department}
                                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                                    className="input-modern"
                                    placeholder="Computer Science"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full btn-primary"
                        >
                            {loading ? 'Saving...' : 'Complete Profile'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
