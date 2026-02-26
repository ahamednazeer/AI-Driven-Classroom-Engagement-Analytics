'use client';

import React, { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { UserCircle, Camera, UploadSimple, Pulse, CheckCircle, Warning } from '@phosphor-icons/react';

interface UserData {
    id: number;
    first_name: string;
    last_name: string;
    username: string;
    email: string;
    role: string;
    account_status: string;
    face_approved: boolean;
    face_image_url?: string;
    face_rejected_reason?: string;
    department?: string;
    student_id?: string;
    batch?: string;
    class_section?: string;
    phone?: string;
}

export default function StudentProfilePage() {
    const [user, setUser] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({
        first_name: '',
        last_name: '',
        phone: '',
        department: '',
    });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const data = await api.getMe();
            setUser(data);
            setForm({
                first_name: data.first_name || '',
                last_name: data.last_name || '',
                phone: data.phone || '',
                department: data.department || '',
            });
        } catch (err) {
            console.error('Failed to load profile:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage('');
        try {
            const updated = await api.completeProfile(form);
            setUser(updated);
            setEditMode(false);
            setMessage('Profile updated successfully!');
            setTimeout(() => setMessage(''), 3000);
        } catch (err: any) {
            setMessage(err.message || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    const handleFaceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setMessage('');
        try {
            const updated = await api.uploadFace(file);
            setUser(updated);
            setMessage('Face photo uploaded! Awaiting approval.');
            setTimeout(() => setMessage(''), 5000);
        } catch (err: any) {
            setMessage(err.message || 'Failed to upload face photo');
        } finally {
            setUploading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin" />
                    <Pulse size={24} className="absolute inset-0 m-auto text-blue-400 animate-pulse" />
                </div>
                <p className="text-slate-500 font-mono text-xs uppercase tracking-widest animate-pulse">
                    Loading Profile...
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-chivo font-bold uppercase tracking-wider flex items-center gap-3">
                    <UserCircle size={28} weight="duotone" className="text-blue-400" />
                    My Profile
                </h1>
                <p className="text-slate-500 mt-1">Manage your profile and face recognition photo</p>
            </div>

            {/* Status Message */}
            {message && (
                <div className={`rounded-xl p-3 text-sm flex items-center gap-2 ${message.includes('success') || message.includes('uploaded')
                    ? 'bg-green-950/30 border border-green-700/50 text-green-400'
                    : 'bg-red-950/30 border border-red-700/50 text-red-400'
                    }`}>
                    {message.includes('success') || message.includes('uploaded')
                        ? <CheckCircle size={18} weight="bold" />
                        : <Warning size={18} weight="bold" />
                    }
                    {message}
                </div>
            )}

            {/* Profile Card */}
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6">
                <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center text-slate-300">
                            <UserCircle size={48} weight="fill" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-100">{user?.first_name} {user?.last_name}</h2>
                            <p className="text-slate-400 font-mono text-sm">{user?.username}</p>
                            <div className="flex gap-2 mt-2">
                                <StatusBadge status={user?.role || ''} />
                                <StatusBadge status={user?.account_status || ''} />
                            </div>
                        </div>
                    </div>
                    {!editMode && (
                        <button
                            onClick={() => setEditMode(true)}
                            className="btn-secondary rounded-xl text-xs"
                        >
                            Edit Profile
                        </button>
                    )}
                </div>

                {editMode ? (
                    <form onSubmit={handleSaveProfile} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">First Name</label>
                                <input
                                    type="text" required
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                    value={form.first_name}
                                    onChange={e => setForm({ ...form, first_name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Last Name</label>
                                <input
                                    type="text" required
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                    value={form.last_name}
                                    onChange={e => setForm({ ...form, last_name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Phone</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                    value={form.phone}
                                    onChange={e => setForm({ ...form, phone: e.target.value })}
                                    placeholder="+91..."
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Department</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                    value={form.department}
                                    onChange={e => setForm({ ...form, department: e.target.value })}
                                    placeholder="Computer Science"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button type="button" onClick={() => setEditMode(false)} className="px-4 py-2 text-slate-400 hover:text-slate-200 rounded-xl">
                                Cancel
                            </button>
                            <button type="submit" disabled={saving} className="btn-primary rounded-xl">
                                {saving ? 'Saving...' : 'Save Profile'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-900/50 rounded-xl p-3">
                            <p className="text-xs text-slate-500 uppercase font-mono">Email</p>
                            <p className="text-slate-200 text-sm mt-1">{user?.email}</p>
                        </div>
                        <div className="bg-slate-900/50 rounded-xl p-3">
                            <p className="text-xs text-slate-500 uppercase font-mono">Student ID</p>
                            <p className="text-slate-200 text-sm mt-1">{user?.student_id || '—'}</p>
                        </div>
                        <div className="bg-slate-900/50 rounded-xl p-3">
                            <p className="text-xs text-slate-500 uppercase font-mono">Phone</p>
                            <p className="text-slate-200 text-sm mt-1">{user?.phone || '—'}</p>
                        </div>
                        <div className="bg-slate-900/50 rounded-xl p-3">
                            <p className="text-xs text-slate-500 uppercase font-mono">Department</p>
                            <p className="text-slate-200 text-sm mt-1">{user?.department || '—'}</p>
                        </div>
                        <div className="bg-slate-900/50 rounded-xl p-3">
                            <p className="text-xs text-slate-500 uppercase font-mono">Batch</p>
                            <p className="text-slate-200 text-sm mt-1">{user?.batch || '—'}</p>
                        </div>
                        <div className="bg-slate-900/50 rounded-xl p-3">
                            <p className="text-xs text-slate-500 uppercase font-mono">Class / Section</p>
                            <p className="text-slate-200 text-sm mt-1">{user?.class_section || '—'}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Face Recognition */}
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6">
                <h3 className="text-sm font-mono text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Camera size={16} weight="duotone" />
                    Face Recognition Photo
                </h3>

                {user?.face_approved ? (
                    <div className="bg-green-950/30 border border-green-700/50 rounded-xl p-4 flex items-center gap-3">
                        <CheckCircle size={24} className="text-green-400" weight="fill" />
                        <div>
                            <p className="text-green-400 font-bold">Face photo approved</p>
                            <p className="text-green-400/60 text-xs mt-0.5">Your face has been verified for recognition.</p>
                        </div>
                    </div>
                ) : user?.face_rejected_reason ? (
                    <div className="space-y-3">
                        <div className="bg-red-950/30 border border-red-700/50 rounded-xl p-4">
                            <p className="text-red-400 font-bold mb-1">Face photo rejected</p>
                            <p className="text-red-400/80 text-sm">Reason: {user.face_rejected_reason}</p>
                        </div>
                        <button
                            onClick={() => fileRef.current?.click()}
                            disabled={uploading}
                            className="btn-primary rounded-xl flex items-center gap-2"
                        >
                            <UploadSimple size={18} /> {uploading ? 'Uploading...' : 'Upload New Photo'}
                        </button>
                    </div>
                ) : user?.face_image_url ? (
                    <div className="bg-yellow-950/30 border border-yellow-700/50 rounded-xl p-4 flex items-center gap-3">
                        <Camera size={24} className="text-yellow-400" weight="fill" />
                        <div>
                            <p className="text-yellow-400 font-bold">Face photo pending review</p>
                            <p className="text-yellow-400/60 text-xs mt-0.5">Your teacher will review it shortly.</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="bg-slate-900/50 border border-dashed border-slate-700 rounded-xl p-8 text-center">
                            <Camera size={48} className="text-slate-600 mx-auto mb-3" />
                            <p className="text-slate-400">No face photo uploaded yet</p>
                            <p className="text-slate-600 text-xs mt-1">Upload a clear photo of your face for recognition</p>
                        </div>
                        <button
                            onClick={() => fileRef.current?.click()}
                            disabled={uploading}
                            className="btn-primary rounded-xl flex items-center gap-2"
                        >
                            <UploadSimple size={18} /> {uploading ? 'Uploading...' : 'Upload Face Photo'}
                        </button>
                    </div>
                )}

                <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFaceUpload}
                    className="hidden"
                />
            </div>
        </div>
    );
}
