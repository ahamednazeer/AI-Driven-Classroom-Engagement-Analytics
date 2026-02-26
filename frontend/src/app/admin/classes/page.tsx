'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Modal from '@/components/Modal';
import { StatusBadge } from '@/components/StatusBadge';
import {
    ChalkboardTeacher,
    Plus,
    PencilSimple,
    Trash,
    Pulse,
    MagnifyingGlass,
    Users,
} from '@phosphor-icons/react';

interface TeacherInfo {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
}

interface ClassData {
    id: number;
    name: string;
    department?: string;
    section?: string;
    batch?: string;
    description?: string;
    teacher_id?: number | null;
    teacher?: TeacherInfo | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface StudentInfo {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    classroom_id?: number | null;
}

export default function AdminClassesPage() {
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [sectionFilter, setSectionFilter] = useState('');
    const [batchFilter, setBatchFilter] = useState('');

    const [showModal, setShowModal] = useState(false);
    const [editingClass, setEditingClass] = useState<ClassData | null>(null);
    const [showRoster, setShowRoster] = useState(false);
    const [rosterClass, setRosterClass] = useState<ClassData | null>(null);
    const [assignedStudents, setAssignedStudents] = useState<StudentInfo[]>([]);
    const [availableStudents, setAvailableStudents] = useState<StudentInfo[]>([]);
    const [studentFilter, setStudentFilter] = useState('');
    const [form, setForm] = useState({
        name: '',
        department: '',
        section: '',
        batch: '',
        description: '',
        teacher_id: '',
        is_active: true,
    });

    useEffect(() => {
        fetchClasses();
    }, [page, departmentFilter, sectionFilter, batchFilter]);

    useEffect(() => {
        fetchTeachers();
    }, []);

    const fetchClasses = async () => {
        try {
            setLoading(true);
            const data = await api.getClasses({
                search: search || undefined,
                department: departmentFilter || undefined,
                section: sectionFilter || undefined,
                batch: batchFilter || undefined,
                page,
                per_page: 20,
            });
            setClasses(data.classes || []);
            setTotal(data.total || 0);
        } catch (err) {
            console.error('Failed to load classes:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchTeachers = async () => {
        try {
            const data = await api.getUsers({ role: 'TEACHER', per_page: 100 });
            setTeachers(data.users || []);
        } catch (err) {
            console.error('Failed to load teachers:', err);
        }
    };

    const fetchStudents = async () => {
        try {
            const [assigned, available] = await Promise.all([
                api.getUsers({
                    role: 'STUDENT',
                    search: studentFilter || undefined,
                    classroom_id: rosterClass?.id,
                    per_page: 100,
                }),
                api.getUsers({
                    role: 'STUDENT',
                    status: 'ACTIVE',
                    search: studentFilter || undefined,
                    per_page: 100,
                }),
            ]);
            const assignedList = assigned.users || [];
            const assignedIds = new Set(assignedList.map((s: StudentInfo) => s.id));
            const availableList = (available.users || [])
                .filter((s: StudentInfo) => !assignedIds.has(s.id))
                .filter((s: StudentInfo) => !s.classroom_id);
            setAssignedStudents(assignedList);
            setAvailableStudents(availableList);
        } catch (err) {
            console.error('Failed to load students:', err);
        }
    };

    const handleSearch = () => {
        setPage(1);
        fetchClasses();
    };

    const resetForm = () => {
        setEditingClass(null);
        setForm({
            name: '',
            department: '',
            section: '',
            batch: '',
            description: '',
            teacher_id: '',
            is_active: true,
        });
    };

    const handleEdit = (cls: ClassData) => {
        setEditingClass(cls);
        setForm({
            name: cls.name,
            department: cls.department || '',
            section: cls.section || '',
            batch: cls.batch || '',
            description: cls.description || '',
            teacher_id: cls.teacher_id ? String(cls.teacher_id) : '',
            is_active: cls.is_active,
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload: any = {
            name: form.name.trim(),
            department: form.department || undefined,
            section: form.section || undefined,
            batch: form.batch || undefined,
            description: form.description || undefined,
            teacher_id: form.teacher_id ? Number(form.teacher_id) : null,
            is_active: form.is_active,
        };

        try {
            if (editingClass) {
                await api.updateClass(editingClass.id, payload);
            } else {
                await api.createClass(payload);
            }
            setShowModal(false);
            resetForm();
            fetchClasses();
        } catch (err: any) {
            alert(err.message || 'Failed to save class');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this class?')) return;
        try {
            await api.deleteClass(id);
            fetchClasses();
        } catch (err: any) {
            alert(err.message || 'Failed to delete class');
        }
    };

    const openRoster = (cls: ClassData) => {
        setRosterClass(cls);
        setShowRoster(true);
    };

    useEffect(() => {
        if (showRoster) {
            fetchStudents();
        }
    }, [showRoster, studentFilter, rosterClass?.id]);

    const handleAssignStudent = async (studentId: number, targetClassId: number | null) => {
        try {
            await api.updateUser(studentId, { classroom_id: targetClassId });
            await fetchStudents();
        } catch (err: any) {
            alert(err.message || 'Failed to update student class');
        }
    };

    const totalPages = Math.ceil(total / 20);

    if (loading && classes.length === 0) {
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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-chivo font-bold uppercase tracking-wider flex items-center gap-3">
                        <ChalkboardTeacher size={28} weight="duotone" className="text-emerald-400" />
                        Class Management
                    </h1>
                    <p className="text-slate-500 mt-1">Create classes and assign teachers</p>
                </div>
                <button
                    onClick={() => { resetForm(); setShowModal(true); }}
                    className="bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 rounded-xl px-5 py-2.5 flex items-center gap-2 font-bold text-sm uppercase tracking-wider transition-all hover:scale-[1.02] shrink-0"
                >
                    <Plus size={20} weight="bold" /> Add Class
                </button>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px]">
                    <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                        type="text"
                        placeholder="Search by class name..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 placeholder:text-slate-600"
                    />
                </div>
                <input
                    type="text"
                    placeholder="Department..."
                    value={departmentFilter}
                    onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 w-56"
                />
                <input
                    type="text"
                    placeholder="Section..."
                    value={sectionFilter}
                    onChange={(e) => { setSectionFilter(e.target.value); setPage(1); }}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 w-40"
                />
                <input
                    type="text"
                    placeholder="Batch..."
                    value={batchFilter}
                    onChange={(e) => { setBatchFilter(e.target.value); setPage(1); }}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 w-32"
                />
                <button onClick={handleSearch} className="btn-primary rounded-xl">
                    Filter
                </button>
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
                                <th className="p-4">Teacher</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Actions</th>
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
                                    <td className="p-4 text-sm text-slate-300">
                                        {cls.teacher ? `${cls.teacher.first_name} ${cls.teacher.last_name}` : 'Unassigned'}
                                    </td>
                                    <td className="p-4">
                                        <StatusBadge status={cls.is_active ? 'ACTIVE' : 'INACTIVE'} />
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex justify-end gap-1">
                                            <button
                                                onClick={() => openRoster(cls)}
                                                className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-950/30 rounded-sm transition-colors"
                                                title="Manage Students"
                                            >
                                                <Users size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleEdit(cls)}
                                                className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-950/30 rounded-sm transition-colors"
                                                title="Edit"
                                            >
                                                <PencilSimple size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(cls.id)}
                                                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-950/30 rounded-sm transition-colors"
                                                title="Delete"
                                            >
                                                <Trash size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {classes.length === 0 && !loading && (
                    <div className="p-8 text-center text-slate-500">No classes found.</div>
                )}
            </div>

            {totalPages > 1 && (
                <div className="flex justify-center gap-2">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPage(p)}
                            className={`px-3 py-1.5 rounded-sm font-mono text-sm ${p === page
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                                }`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            )}

            <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingClass ? 'Edit Class' : 'Create Class'} size="lg">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Class Name</label>
                            <input
                                type="text" required
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-emerald-500"
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                placeholder="B.E Computer Science A1"
                            />
                        </div>
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Department</label>
                            <input
                                type="text"
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-emerald-500"
                                value={form.department}
                                onChange={e => setForm({ ...form, department: e.target.value })}
                                placeholder="B.E Computer Science"
                            />
                        </div>
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Section</label>
                            <input
                                type="text"
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-emerald-500"
                                value={form.section}
                                onChange={e => setForm({ ...form, section: e.target.value })}
                                placeholder="A1"
                            />
                        </div>
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Batch</label>
                            <input
                                type="text"
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-emerald-500"
                                value={form.batch}
                                onChange={e => setForm({ ...form, batch: e.target.value })}
                                placeholder="2024"
                            />
                        </div>
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Teacher</label>
                            <select
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-emerald-500"
                                value={form.teacher_id}
                                onChange={e => setForm({ ...form, teacher_id: e.target.value })}
                            >
                                <option value="">Unassigned</option>
                                {teachers.map(t => (
                                    <option key={t.id} value={t.id}>
                                        {t.first_name} {t.last_name} ({t.email})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Description</label>
                            <textarea
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-emerald-500 min-h-[90px]"
                                value={form.description}
                                onChange={e => setForm({ ...form, description: e.target.value })}
                                placeholder="Optional description"
                            />
                        </div>
                    </div>

                    <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                        />
                        Active
                    </label>

                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="px-5 py-2.5 text-slate-400 hover:text-slate-200 transition-colors rounded-xl">
                            Cancel
                        </button>
                        <button type="submit" className="btn-primary rounded-xl">
                            {editingClass ? 'Update Class' : 'Create Class'}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={showRoster} onClose={() => setShowRoster(false)} title="Class Roster" size="xl">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-slate-300 font-semibold">{rosterClass?.name}</p>
                            <p className="text-xs text-slate-500">
                                Assign students to this class (must have a teacher assigned).
                            </p>
                        </div>
                        <input
                            type="text"
                            placeholder="Search students..."
                            value={studentFilter}
                            onChange={(e) => setStudentFilter(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && fetchStudents()}
                            className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 w-64"
                        />
                    </div>

                    <div className="bg-slate-800/40 border border-slate-700/60 rounded-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-900/50 border-b border-slate-700/60 text-xs uppercase text-slate-400 font-mono">
                                        <th className="p-4">Student</th>
                                        <th className="p-4">Email</th>
                                        <th className="p-4">Assignment</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700/60">
                                    {assignedStudents.map((s) => (
                                        <tr key={s.id} className="hover:bg-slate-800/50 transition-colors">
                                            <td className="p-4 text-slate-200">
                                                {s.first_name} {s.last_name}
                                            </td>
                                            <td className="p-4 text-sm text-slate-400">{s.email}</td>
                                            <td className="p-4">
                                                <button
                                                    onClick={() => handleAssignStudent(s.id, null)}
                                                    className="bg-red-950/40 border border-red-700/40 text-red-300 px-3 py-1.5 rounded-lg text-xs uppercase tracking-wider"
                                                >
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {assignedStudents.length === 0 && (
                            <div className="p-8 text-center text-slate-500">No students found.</div>
                        )}
                    </div>

                    <div className="text-xs text-slate-500 uppercase font-mono mt-4">Available Students</div>
                    <div className="bg-slate-800/40 border border-slate-700/60 rounded-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-900/50 border-b border-slate-700/60 text-xs uppercase text-slate-400 font-mono">
                                        <th className="p-4">Student</th>
                                        <th className="p-4">Email</th>
                                        <th className="p-4">Assign</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700/60">
                                    {availableStudents.map((s) => (
                                        <tr key={s.id} className="hover:bg-slate-800/50 transition-colors">
                                            <td className="p-4 text-slate-200">
                                                {s.first_name} {s.last_name}
                                            </td>
                                            <td className="p-4 text-sm text-slate-400">{s.email}</td>
                                            <td className="p-4">
                                                <button
                                                    onClick={() => handleAssignStudent(s.id, rosterClass?.id || null)}
                                                    className="bg-emerald-950/40 border border-emerald-700/40 text-emerald-300 px-3 py-1.5 rounded-lg text-xs uppercase tracking-wider"
                                                    disabled={!rosterClass?.teacher_id}
                                                    title={rosterClass?.teacher_id ? 'Assign' : 'Assign a teacher first'}
                                                >
                                                    Assign
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {availableStudents.length === 0 && (
                            <div className="p-8 text-center text-slate-500">No available students.</div>
                        )}
                    </div>
                </div>
            </Modal>
        </div>
    );
}
