'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { Users, Pulse, User } from '@phosphor-icons/react';

interface UserData {
    id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    account_status: string;
    student_id?: string;
    batch?: string;
    class_section?: string;
    department?: string;
    face_approved: boolean;
}

export default function TeacherStudentsPage() {
    const [students, setStudents] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [classFilter, setClassFilter] = useState('');

    useEffect(() => {
        async function fetchStudents() {
            try {
                const data = await api.getUsers({
                    role: 'STUDENT',
                    class_section: classFilter || undefined,
                    per_page: 100,
                });
                setStudents(data.users || []);
            } catch (err) {
                console.error('Failed to load students:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchStudents();
    }, [classFilter]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin" />
                    <Pulse size={24} className="absolute inset-0 m-auto text-blue-400 animate-pulse" />
                </div>
                <p className="text-slate-500 font-mono text-xs uppercase tracking-widest animate-pulse">
                    Loading Students...
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-chivo font-bold uppercase tracking-wider flex items-center gap-3">
                    <Users size={28} weight="duotone" className="text-blue-400" />
                    Students
                </h1>
                <p className="text-slate-500 mt-1">View your students and their account statuses</p>
            </div>

            <div className="flex gap-3 items-center">
                <input
                    type="text"
                    placeholder="Filter by class/section..."
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 w-56"
                />
            </div>

            <div className="bg-slate-800/40 border border-slate-700/60 rounded-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-900/50 border-b border-slate-700/60 text-xs uppercase text-slate-400 font-mono">
                                <th className="p-4">Student</th>
                                <th className="p-4">ID</th>
                                <th className="p-4">Batch</th>
                                <th className="p-4">Class</th>
                                <th className="p-4">Department</th>
                                <th className="p-4">Status</th>
                                <th className="p-4">Face</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/60">
                            {students.map((s) => (
                                <tr key={s.id} className="hover:bg-slate-800/50 transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300">
                                                <User size={16} weight="fill" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-slate-200">{s.first_name} {s.last_name}</p>
                                                <p className="text-xs text-slate-500 font-mono">{s.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4 text-sm text-slate-300 font-mono">{s.student_id || '—'}</td>
                                    <td className="p-4 text-sm text-slate-400">{s.batch || '—'}</td>
                                    <td className="p-4 text-sm text-slate-400">{s.class_section || '—'}</td>
                                    <td className="p-4 text-sm text-slate-400">{s.department || '—'}</td>
                                    <td className="p-4"><StatusBadge status={s.account_status} /></td>
                                    <td className="p-4 text-sm">
                                        {s.face_approved ? (
                                            <span className="text-green-400">✅ Approved</span>
                                        ) : (
                                            <span className="text-slate-500">—</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {students.length === 0 && (
                    <div className="p-8 text-center text-slate-500">No students found.</div>
                )}
            </div>
        </div>
    );
}
