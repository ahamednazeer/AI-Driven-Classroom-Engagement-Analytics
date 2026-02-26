'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Lock, Key, CheckCircle, Warning, GraduationCap } from '@phosphor-icons/react';

const roleRoutes: Record<string, string> = {
    ADMIN: '/admin',
    TEACHER: '/teacher',
    STUDENT: '/student',
};

export default function ChangePasswordPage() {
    const router = useRouter();
    const [checking, setChecking] = useState(true);
    const [loading, setLoading] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        async function init() {
            const token = api.getToken();
            if (!token) {
                router.replace('/');
                return;
            }

            try {
                const me = await api.getMe();
                if (me.account_status === 'PROFILE_SETUP_REQUIRED') {
                    router.replace('/setup-profile');
                    return;
                }
                if (me.account_status !== 'PENDING_FIRST_LOGIN') {
                    router.replace(roleRoutes[me.role] || '/');
                    return;
                }
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

        if (newPassword.length < 8) {
            setError('New password must be at least 8 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (newPassword === currentPassword) {
            setError('New password must be different from current password.');
            return;
        }

        setLoading(true);
        try {
            const updated = await api.changePassword(currentPassword, newPassword);
            setMessage('Password updated. Continue to profile setup.');

            if (updated.account_status === 'PROFILE_SETUP_REQUIRED') {
                router.push('/setup-profile');
                return;
            }

            const route = roleRoutes[updated.role] || '/';
            router.push(route);
        } catch (err: any) {
            setError(err.message || 'Failed to update password.');
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

            <div className="relative z-10 w-full max-w-md mx-4">
                <div className="bg-slate-900/90 border border-slate-700 rounded-sm p-8 backdrop-blur-md">
                    <div className="flex flex-col items-center mb-8">
                        <Key size={44} weight="duotone" className="text-blue-400 mb-4" />
                        <h1 className="text-2xl font-chivo font-bold uppercase tracking-wider text-center">
                            Change Password
                        </h1>
                        <p className="text-slate-400 text-sm mt-2 text-center">
                            First login detected. Set a new secure password.
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
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2 font-mono">
                                Current Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    required
                                    className="input-modern pl-10"
                                    placeholder="Temporary password"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2 font-mono">
                                New Password
                            </label>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                    className="input-modern pl-10"
                                    placeholder="At least 8 characters"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2 font-mono">
                                Confirm New Password
                            </label>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    className="input-modern pl-10"
                                    placeholder="Re-enter password"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full btn-primary"
                        >
                            {loading ? 'Updating...' : 'Update Password'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
