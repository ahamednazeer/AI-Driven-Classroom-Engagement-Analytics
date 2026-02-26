'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { ChalkboardTeacher, Pulse } from '@phosphor-icons/react';

interface ClassData {
    id: number;
    name: string;
    department?: string;
    section?: string;
    batch?: string;
    description?: string;
    is_active: boolean;
}

export default function TeacherClassesPage() {
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchClasses() {
            try {
                const data = await api.getClasses({ per_page: 100 });
                setClasses(data.classes || []);
            } catch (err) {
                console.error('Failed to load classes:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchClasses();
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-slate-700 border-t-emerald-500 animate-spin" />
                    <Pulse size={24} className="absolute inset-0 m-auto text-emerald-400 animate-pulse" />
                </div>
                <p className="text-slate-500 font-mono text-xs uppercase tracking-widest animate-pulse">
                    Loading Classes...
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-chivo font-bold uppercase tracking-wider flex items-center gap-3">
                    <ChalkboardTeacher size={28} weight="duotone" className="text-emerald-400" />
                    My Classes
                </h1>
                <p className="text-slate-500 mt-1">Classes assigned to you</p>
            </div>

            <div className="bg-slate-800/40 border border-slate-700/60 rounded-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-900/50 border-b border-slate-700/60 text-xs uppercase text-slate-400 font-mono">
                                <th className="p-4">Class</th>
                                <th className="p-4">Department</th>
                                <th className="p-4">Section</th>
                                <th className="p-4">Batch</th>
                                <th className="p-4">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/60">
                            {classes.map((cls) => (
                                <tr key={cls.id} className="hover:bg-slate-800/50 transition-colors">
                                    <td className="p-4">
                                        <div className="font-semibold text-slate-200">{cls.name}</div>
                                        {cls.description && (
                                            <div className="text-xs text-slate-500 mt-1">{cls.description}</div>
                                        )}
                                    </td>
                                    <td className="p-4 text-sm text-slate-400">{cls.department || '—'}</td>
                                    <td className="p-4 text-sm text-slate-400">{cls.section || '—'}</td>
                                    <td className="p-4 text-sm text-slate-400">{cls.batch || '—'}</td>
                                    <td className="p-4">
                                        <StatusBadge status={cls.is_active ? 'ACTIVE' : 'INACTIVE'} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {classes.length === 0 && (
                    <div className="p-8 text-center text-slate-500">No classes assigned.</div>
                )}
            </div>
        </div>
    );
}
