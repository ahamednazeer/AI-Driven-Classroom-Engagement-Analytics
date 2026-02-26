'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import {
    User, Shield, Trash, PencilSimple, Plus, Pulse, MagnifyingGlass,
    Funnel, Power, LockSimple, LockSimpleOpen, Eye
} from '@phosphor-icons/react';

interface UserData {
    id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    account_status: string;
    is_temp_password: boolean;
    department?: string;
    student_id?: string;
    batch?: string;
    class_section?: string;
    classroom_id?: number | null;
    phone?: string;
    face_approved: boolean;
    created_at: string;
    last_login_at?: string;
}

interface ClassInfo {
    id: number;
    name: string;
    department?: string;
    section?: string;
    teacher_id?: number | null;
    teacher?: {
        id: number;
        first_name: string;
        last_name: string;
        email: string;
    } | null;
}

export default function AdminUsersPage() {
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [classFilter, setClassFilter] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState<UserData | null>(null);
    const [tempPassword, setTempPassword] = useState('');
    const [classes, setClasses] = useState<ClassInfo[]>([]);
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        first_name: '',
        last_name: '',
        role: 'STUDENT',
        department: '',
        student_id: '',
        batch: '',
        class_section: '',
        classroom_id: '',
        phone: '',
    });

    // Detail modal
    const [showDetail, setShowDetail] = useState(false);
    const [detailUser, setDetailUser] = useState<UserData | null>(null);
    const classNameById = new Map(classes.map((c) => [c.id, c.name]));

    useEffect(() => {
        fetchUsers();
    }, [page, roleFilter, statusFilter, classFilter, departmentFilter]);

    useEffect(() => {
        fetchClasses();
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const data = await api.getUsers({
                role: roleFilter || undefined,
                status: statusFilter || undefined,
                search: search || undefined,
                class_section: classFilter || undefined,
                department: departmentFilter || undefined,
                page,
                per_page: 20,
            });
            setUsers(data.users || []);
            setTotal(data.total || 0);
        } catch (err) {
            console.error('Failed to load users:', err);
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

    const handleSearch = () => {
        setPage(1);
        fetchUsers();
    };

    const resetForm = () => {
        setEditingUser(null);
        setTempPassword('');
        setFormData({
            username: '', email: '', password: '', first_name: '', last_name: '',
            role: 'STUDENT', department: '', student_id: '', batch: '', class_section: '', classroom_id: '', phone: '',
        });
    };

    const handleEdit = (user: UserData) => {
        setEditingUser(user);
        setFormData({
            username: user.username,
            email: user.email,
            password: '',
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
            department: user.department || '',
            student_id: user.student_id || '',
            batch: user.batch || '',
            class_section: user.class_section || '',
            classroom_id: user.classroom_id ? String(user.classroom_id) : '',
            phone: user.phone || '',
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload: any = { ...formData };
            if (payload.classroom_id === '') {
                if (editingUser && editingUser.classroom_id) {
                    payload.classroom_id = null;
                } else {
                    delete payload.classroom_id;
                }
            } else if (payload.classroom_id) {
                payload.classroom_id = Number(payload.classroom_id);
            }

            // Client-side validation
            if (payload.password && payload.password.length < 8) {
                alert('Password must be at least 8 characters long');
                return;
            }

            if (editingUser && !payload.password) delete payload.password;
            if (!payload.department) delete payload.department;
            if (!payload.student_id) delete payload.student_id;
            if (!payload.batch) delete payload.batch;
            if (!payload.class_section) delete payload.class_section;
            if (!payload.classroom_id) delete payload.classroom_id;
            if (!payload.phone) delete payload.phone;
            if (payload.role !== 'STUDENT') {
                delete payload.student_id;
                delete payload.batch;
                delete payload.class_section;
                delete payload.classroom_id;
            }

            if (editingUser) {
                await api.updateUser(editingUser.id, payload);
            } else {
                const result = await api.createUser(payload);
                if (result.temp_password) {
                    setTempPassword(result.temp_password);
                }
            }

            setShowModal(false);
            resetForm();
            fetchUsers();
        } catch (err: any) {
            console.error(err);
            if (err.response && err.response.data && err.response.data.detail) {
                const detail = err.response.data.detail;
                if (Array.isArray(detail)) {
                    // Start 422 validation errors
                    const messages = detail.map((d: any) => `${d.loc.join('.')} : ${d.msg}`).join('\n');
                    alert(`Validation Error:\n${messages}`);
                } else {
                    alert(detail);
                }
            } else {
                alert(err.message || 'Failed to save user');
            }
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this user?')) return;
        try {
            await api.deleteUser(id);
            fetchUsers();
        } catch (err: any) {
            alert(err.message || 'Failed to delete user');
        }
    };

    const handleStatusChange = async (id: number, newStatus: string) => {
        try {
            await api.changeUserStatus(id, newStatus);
            fetchUsers();
        } catch (err: any) {
            alert(err.message || 'Failed to change status');
        }
    };

    const totalPages = Math.ceil(total / 20);

    if (loading && users.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin" />
                    <Pulse size={24} className="absolute inset-0 m-auto text-blue-400 animate-pulse" />
                </div>
                <p className="text-slate-500 font-mono text-xs uppercase tracking-widest animate-pulse">
                    Loading Users...
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-chivo font-bold uppercase tracking-wider flex items-center gap-3">
                        <User size={28} weight="duotone" className="text-blue-400" />
                        User Management
                    </h1>
                    <p className="text-slate-500 mt-1">Manage system users, roles, and account statuses</p>
                </div>
                <button
                    onClick={() => { resetForm(); setShowModal(true); }}
                    className="bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 rounded-xl px-5 py-2.5 flex items-center gap-2 font-bold text-sm uppercase tracking-wider transition-all hover:scale-[1.02] shrink-0"
                >
                    <Plus size={20} weight="bold" /> Add User
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px]">
                    <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                        type="text"
                        placeholder="Search by name, email, or username..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
                    />
                </div>
                <select
                    value={roleFilter}
                    onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                >
                    <option value="">All Roles</option>
                    <option value="ADMIN">Admin</option>
                    <option value="TEACHER">Teacher</option>
                    <option value="STUDENT">Student</option>
                </select>
                <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                >
                    <option value="">All Statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="PENDING_FIRST_LOGIN">Pending First Login</option>
                    <option value="PROFILE_SETUP_REQUIRED">Profile Setup Required</option>
                    <option value="FACE_PENDING">Face Pending</option>
                    <option value="LOCKED">Locked</option>
                    <option value="SUSPENDED">Suspended</option>
                </select>
                <input
                    type="text"
                    placeholder="Department..."
                    value={departmentFilter}
                    onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 w-56"
                />
                <input
                    type="text"
                    placeholder="Class/Section..."
                    value={classFilter}
                    onChange={(e) => { setClassFilter(e.target.value); setPage(1); }}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 w-40"
                />
                <button onClick={handleSearch} className="btn-primary rounded-xl">
                    <Funnel size={16} /> Filter
                </button>
            </div>

            {/* Temp Password Alert */}
            {tempPassword && (
                <div className="bg-green-950/30 border border-green-700/50 rounded-xl p-4 flex items-center justify-between">
                    <div>
                        <p className="text-green-400 text-sm font-bold">User created with temporary password:</p>
                        <p className="text-green-300 font-mono text-lg mt-1">{tempPassword}</p>
                        <p className="text-green-400/60 text-xs mt-1">Share this password securely. User will be prompted to change it on first login.</p>
                    </div>
                    <button onClick={() => setTempPassword('')} className="text-green-400 hover:text-green-200">✕</button>
                </div>
            )}

            {/* Users Table */}
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-900/50 border-b border-slate-700/60 text-xs uppercase text-slate-400 font-mono">
                                <th className="p-4">User</th>
                                <th className="p-4">Role</th>
                                <th className="p-4">Dept / Class</th>
                                <th className="p-4">Status</th>
                                <th className="p-4">Last Login</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/60">
                            {users.map((user) => (
                                <tr key={user.id} className="hover:bg-slate-800/50 transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-300">
                                                <User size={20} weight="fill" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-slate-200">{user.first_name} {user.last_name}</p>
                                                <p className="text-sm text-slate-500 font-mono">{user.username} · {user.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <StatusBadge status={user.role} />
                                    </td>
                                    <td className="p-4 text-sm text-slate-400">
                                        {user.department && user.class_section
                                            ? `${user.department} / ${user.class_section}`
                                            : (user.department || user.class_section || '—')}
                                    </td>
                                    <td className="p-4">
                                        <StatusBadge status={user.account_status} />
                                    </td>
                                    <td className="p-4 text-sm text-slate-400 font-mono">
                                        {user.last_login_at
                                            ? new Date(user.last_login_at).toLocaleDateString()
                                            : 'Never'}
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex justify-end gap-1">
                                            <button
                                                onClick={() => { setDetailUser(user); setShowDetail(true); }}
                                                className="p-2 text-slate-400 hover:text-sky-400 hover:bg-sky-950/30 rounded-sm transition-colors"
                                                title="View Details"
                                            >
                                                <Eye size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleEdit(user)}
                                                className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-950/30 rounded-sm transition-colors"
                                                title="Edit"
                                            >
                                                <PencilSimple size={18} />
                                            </button>
                                            {user.account_status === 'ACTIVE' && (
                                                <button
                                                    onClick={() => handleStatusChange(user.id, 'SUSPENDED')}
                                                    className="p-2 text-slate-400 hover:text-yellow-400 hover:bg-yellow-950/30 rounded-sm transition-colors"
                                                    title="Suspend"
                                                >
                                                    <LockSimple size={18} />
                                                </button>
                                            )}
                                            {(user.account_status === 'SUSPENDED' || user.account_status === 'LOCKED') && (
                                                <button
                                                    onClick={() => handleStatusChange(user.id, 'ACTIVE')}
                                                    className="p-2 text-slate-400 hover:text-green-400 hover:bg-green-950/30 rounded-sm transition-colors"
                                                    title="Activate"
                                                >
                                                    <LockSimpleOpen size={18} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDelete(user.id)}
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
                {users.length === 0 && !loading && (
                    <div className="p-8 text-center text-slate-500">
                        No users found matching your criteria.
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-center gap-2">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPage(p)}
                            className={`px-3 py-1.5 rounded-sm font-mono text-sm ${p === page
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                                }`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            )}

            {/* Create/Edit Modal */}
            <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingUser ? 'Edit User' : 'Create New User'} size="lg">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Username</label>
                            <input
                                type="text" placeholder="username" required
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                value={formData.username}
                                onChange={e => setFormData({ ...formData, username: e.target.value })}
                                disabled={!!editingUser}
                            />
                        </div>
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Email</label>
                            <input
                                type="email" placeholder="email@example.com" required
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">First Name</label>
                            <input
                                type="text" placeholder="First Name" required
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                value={formData.first_name}
                                onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Last Name</label>
                            <input
                                type="text" placeholder="Last Name" required
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                value={formData.last_name}
                                onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">
                                {editingUser ? 'Password (leave blank to keep)' : 'Password (optional)'}
                            </label>
                            <input
                                type="password" placeholder={editingUser ? '••••••••' : 'Auto-generated if blank'}
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Role</label>
                            <select
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                value={formData.role}
                                onChange={e => setFormData({ ...formData, role: e.target.value })}
                            >
                                <option value="STUDENT">Student</option>
                                <option value="TEACHER">Teacher</option>
                                <option value="ADMIN">Admin</option>
                            </select>
                        </div>
                    </div>

                    {/* Conditional fields */}
                    <div className="border-t border-slate-800 pt-4">
                        <p className="text-xs text-slate-500 mb-3 font-mono uppercase">Additional Details</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Department</label>
                                <input
                                    type="text" placeholder="e.g., Computer Science"
                                    className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                    value={formData.department}
                                    onChange={e => setFormData({ ...formData, department: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Phone</label>
                                <input
                                    type="text" placeholder="+91 ..."
                                    className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                            {formData.role === 'STUDENT' && (
                                <>
                                    <div>
                                        <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Student ID</label>
                                        <input
                                            type="text" placeholder="STU001"
                                            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                            value={formData.student_id}
                                            onChange={e => setFormData({ ...formData, student_id: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Batch</label>
                                        <input
                                            type="text" placeholder="2024"
                                            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                            value={formData.batch}
                                            onChange={e => setFormData({ ...formData, batch: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Class / Section</label>
                                        <input
                                            type="text" placeholder="A1"
                                            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                            value={formData.class_section}
                                            onChange={e => setFormData({ ...formData, class_section: e.target.value })}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Assign to Class (with teacher)</label>
                                        <select
                                            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                            value={formData.classroom_id}
                                            onChange={e => setFormData({ ...formData, classroom_id: e.target.value })}
                                        >
                                            <option value="">Unassigned</option>
                                            {classes
                                                .filter((c) => c.teacher_id)
                                                .map((c) => (
                                                    <option key={c.id} value={c.id}>
                                                        {c.name} {c.section ? `(${c.section})` : ''} {c.department ? `- ${c.department}` : ''} {c.teacher ? `• ${c.teacher.first_name} ${c.teacher.last_name}` : ''}
                                                    </option>
                                                ))}
                                        </select>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="px-5 py-2.5 text-slate-400 hover:text-slate-200 transition-colors rounded-xl">
                            Cancel
                        </button>
                        <button type="submit" className="btn-primary rounded-xl">
                            {editingUser ? 'Update User' : 'Create User'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Detail Modal */}
            <Modal isOpen={showDetail} onClose={() => setShowDetail(false)} title="User Details" size="md">
                {detailUser && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center text-slate-300">
                                <User size={32} weight="fill" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-slate-100">{detailUser.first_name} {detailUser.last_name}</h3>
                                <p className="text-slate-400 font-mono text-sm">{detailUser.username}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-800/60 rounded-xl p-3">
                                <p className="text-xs text-slate-500 uppercase font-mono">Email</p>
                                <p className="text-slate-200 text-sm mt-1">{detailUser.email}</p>
                            </div>
                            <div className="bg-slate-800/60 rounded-xl p-3">
                                <p className="text-xs text-slate-500 uppercase font-mono">Role</p>
                                <div className="mt-1"><StatusBadge status={detailUser.role} /></div>
                            </div>
                            <div className="bg-slate-800/60 rounded-xl p-3">
                                <p className="text-xs text-slate-500 uppercase font-mono">Account Status</p>
                                <div className="mt-1"><StatusBadge status={detailUser.account_status} /></div>
                            </div>
                            <div className="bg-slate-800/60 rounded-xl p-3">
                                <p className="text-xs text-slate-500 uppercase font-mono">Face Approved</p>
                                <p className="text-slate-200 text-sm mt-1">{detailUser.face_approved ? '✅ Yes' : '❌ No'}</p>
                            </div>
                            {detailUser.department && (
                                <div className="bg-slate-800/60 rounded-xl p-3">
                                    <p className="text-xs text-slate-500 uppercase font-mono">Department</p>
                                    <p className="text-slate-200 text-sm mt-1">{detailUser.department}</p>
                                </div>
                            )}
                            {detailUser.student_id && (
                                <div className="bg-slate-800/60 rounded-xl p-3">
                                    <p className="text-xs text-slate-500 uppercase font-mono">Student ID</p>
                                    <p className="text-slate-200 text-sm mt-1">{detailUser.student_id}</p>
                                </div>
                            )}
                            {detailUser.class_section && (
                                <div className="bg-slate-800/60 rounded-xl p-3">
                                    <p className="text-xs text-slate-500 uppercase font-mono">Class / Section</p>
                                    <p className="text-slate-200 text-sm mt-1">{detailUser.class_section}</p>
                                </div>
                            )}
                            {detailUser.classroom_id && (
                                <div className="bg-slate-800/60 rounded-xl p-3">
                                    <p className="text-xs text-slate-500 uppercase font-mono">Assigned Class</p>
                                    <p className="text-slate-200 text-sm mt-1">
                                        {classNameById.get(detailUser.classroom_id) || `Class #${detailUser.classroom_id}`}
                                    </p>
                                </div>
                            )}
                            <div className="bg-slate-800/60 rounded-xl p-3">
                                <p className="text-xs text-slate-500 uppercase font-mono">Created</p>
                                <p className="text-slate-200 text-sm mt-1">{new Date(detailUser.created_at).toLocaleString()}</p>
                            </div>
                            <div className="bg-slate-800/60 rounded-xl p-3">
                                <p className="text-xs text-slate-500 uppercase font-mono">Last Login</p>
                                <p className="text-slate-200 text-sm mt-1">{detailUser.last_login_at ? new Date(detailUser.last_login_at).toLocaleString() : 'Never'}</p>
                            </div>
                        </div>
                        <div className="bg-slate-800/60 rounded-xl p-3">
                            <p className="text-xs text-slate-500 uppercase font-mono">Temp Password</p>
                            <p className="text-slate-200 text-sm mt-1">{detailUser.is_temp_password ? '⚠️ Yes — awaiting first login' : 'No'}</p>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
