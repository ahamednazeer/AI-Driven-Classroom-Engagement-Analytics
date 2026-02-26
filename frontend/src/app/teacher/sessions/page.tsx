'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Modal from '@/components/Modal';
import { StatusBadge } from '@/components/StatusBadge';
import { List, Plus, Pulse, Play, Stop, Eye } from '@phosphor-icons/react';

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
    started_at?: string;
    ended_at?: string;
}

interface ClassInfo {
    id: number;
    name: string;
    department?: string;
    section?: string;
}

export default function TeacherSessionsPage() {
    const [sessions, setSessions] = useState<SessionData[]>([]);
    const [classes, setClasses] = useState<ClassInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({
        class_id: '',
        course: '',
        subject: '',
        topic: '',
        scheduled_start: '',
        scheduled_end: '',
        tracking_enabled: true,
    });

    useEffect(() => {
        fetchSessions();
        fetchClasses();
    }, []);

    const fetchSessions = async () => {
        try {
            setLoading(true);
            const data = await api.getSessions({ per_page: 100 });
            setSessions(data.sessions || []);
        } catch (err) {
            console.error('Failed to load sessions:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchClasses = async () => {
        try {
            const data = await api.getClasses({ per_page: 100 });
            setClasses(data.classes || []);
        } catch (err) {
            console.error('Failed to load classes:', err);
        }
    };

    const resetForm = () => {
        setForm({
            class_id: '',
            course: '',
            subject: '',
            topic: '',
            scheduled_start: '',
            scheduled_end: '',
            tracking_enabled: true,
        });
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.createSession({
                class_id: form.class_id ? Number(form.class_id) : undefined,
                course: form.course,
                subject: form.subject,
                topic: form.topic,
                scheduled_start: new Date(form.scheduled_start).toISOString(),
                scheduled_end: new Date(form.scheduled_end).toISOString(),
                tracking_enabled: form.tracking_enabled,
            });
            setShowModal(false);
            resetForm();
            fetchSessions();
        } catch (err: any) {
            alert(err.message || 'Failed to create session');
        }
    };

    const handleStart = async (id: number) => {
        try {
            await api.startSession(id);
            fetchSessions();
        } catch (err: any) {
            alert(err.message || 'Failed to start session');
        }
    };

    const handleEnd = async (id: number) => {
        try {
            await api.endSession(id);
            fetchSessions();
        } catch (err: any) {
            alert(err.message || 'Failed to end session');
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-slate-700 border-t-emerald-500 animate-spin" />
                    <Pulse size={24} className="absolute inset-0 m-auto text-emerald-400 animate-pulse" />
                </div>
                <p className="text-slate-500 font-mono text-xs uppercase tracking-widest animate-pulse">
                    Loading Sessions...
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-chivo font-bold uppercase tracking-wider flex items-center gap-3">
                        <List size={28} weight="duotone" className="text-emerald-400" />
                        Sessions
                    </h1>
                    <p className="text-slate-500 mt-1">Create and manage classroom sessions</p>
                </div>
                <button
                    onClick={() => { resetForm(); setShowModal(true); }}
                    className="bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 rounded-xl px-5 py-2.5 flex items-center gap-2 font-bold text-sm uppercase tracking-wider transition-all hover:scale-[1.02]"
                >
                    <Plus size={18} weight="bold" /> Create Session
                </button>
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
                                        <div className="flex justify-end gap-1">
                                            <a
                                                href={`/teacher/sessions/${s.id}`}
                                                className="p-2 text-slate-400 hover:text-sky-400 hover:bg-sky-950/30 rounded-sm transition-colors"
                                                title="View"
                                            >
                                                <Eye size={18} />
                                            </a>
                                            {s.status === 'SCHEDULED' && (
                                                <button
                                                    onClick={() => handleStart(s.id)}
                                                    className="p-2 text-slate-400 hover:text-green-400 hover:bg-green-950/30 rounded-sm transition-colors"
                                                    title="Start"
                                                >
                                                    <Play size={18} />
                                                </button>
                                            )}
                                            {s.status === 'LIVE' && (
                                                <button
                                                    onClick={() => handleEnd(s.id)}
                                                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-950/30 rounded-sm transition-colors"
                                                    title="End"
                                                >
                                                    <Stop size={18} />
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
                    <div className="p-8 text-center text-slate-500">No sessions created yet.</div>
                )}
            </div>

            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Create Session" size="lg">
                <form onSubmit={handleCreate} className="space-y-4">
                    <div>
                        <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Class</label>
                        <select
                            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200"
                            value={form.class_id}
                            onChange={(e) => setForm({ ...form, class_id: e.target.value })}
                        >
                            <option value="">Select class (optional)</option>
                            {classes.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name} {c.section ? `(${c.section})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Course</label>
                            <input
                                type="text"
                                required
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200"
                                value={form.course}
                                onChange={(e) => setForm({ ...form, course: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Subject</label>
                            <input
                                type="text"
                                required
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200"
                                value={form.subject}
                                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Topic</label>
                        <input
                            type="text"
                            required
                            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200"
                            value={form.topic}
                            onChange={(e) => setForm({ ...form, topic: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Start Time</label>
                            <input
                                type="datetime-local"
                                required
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200"
                                value={form.scheduled_start}
                                onChange={(e) => setForm({ ...form, scheduled_start: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">End Time</label>
                            <input
                                type="datetime-local"
                                required
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200"
                                value={form.scheduled_end}
                                onChange={(e) => setForm({ ...form, scheduled_end: e.target.value })}
                            />
                        </div>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                        <input
                            type="checkbox"
                            checked={form.tracking_enabled}
                            onChange={(e) => setForm({ ...form, tracking_enabled: e.target.checked })}
                        />
                        Enable tracking
                    </label>
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-slate-400 hover:text-slate-200">
                            Cancel
                        </button>
                        <button type="submit" className="btn-primary rounded-xl">Create</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
