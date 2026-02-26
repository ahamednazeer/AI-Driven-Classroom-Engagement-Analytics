'use client';

import React, { useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import Modal from '@/components/Modal';
import {
    GraduationCap,
    SignOut,
    Gauge,
    Users,
    Camera,
    UserCircle,
    ChalkboardTeacher,
    ChartBar,
    List,
} from '@phosphor-icons/react';

interface MenuItem {
    icon: React.ElementType;
    label: string;
    path: string;
}

interface DashboardLayoutProps {
    children: ReactNode;
    userRole?: string;
    userName?: string;
}

const MIN_WIDTH = 60;
const COLLAPSED_WIDTH = 64;
const DEFAULT_WIDTH = 64;
const MAX_WIDTH = 320;

const menuItemsByRole: Record<string, MenuItem[]> = {
    ADMIN: [
        { icon: Gauge, label: 'Overview', path: '/admin' },
        { icon: Users, label: 'Users', path: '/admin/users' },
        { icon: ChalkboardTeacher, label: 'Classes', path: '/admin/classes' },
        { icon: ChartBar, label: 'Analytics', path: '/admin/analytics' },
        { icon: ChartBar, label: 'Login History', path: '/admin/login-history' },
    ],
    TEACHER: [
        { icon: Gauge, label: 'Overview', path: '/teacher' },
        { icon: List, label: 'Sessions', path: '/teacher/sessions' },
        { icon: ChalkboardTeacher, label: 'Classes', path: '/teacher/classes' },
        { icon: Camera, label: 'Face Approvals', path: '/teacher/face-approvals' },
        { icon: Users, label: 'Students', path: '/teacher/students' },
    ],
    STUDENT: [
        { icon: Gauge, label: 'Overview', path: '/student' },
        { icon: List, label: 'Sessions', path: '/student/sessions' },
        { icon: UserCircle, label: 'Profile', path: '/student/profile' },
    ],
};

export default function DashboardLayout({
    children,
    userRole: propRole,
    userName: propName,
}: DashboardLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [role, setRole] = useState(propRole || '');
    const [name, setName] = useState(propName || '');
    const [loading, setLoading] = useState(true);
    const [profileRequired, setProfileRequired] = useState(false);
    const [profileForm, setProfileForm] = useState({
        first_name: '',
        last_name: '',
        phone: '',
        department: '',
    });
    const [profileError, setProfileError] = useState('');
    const [profileSaving, setProfileSaving] = useState(false);
    const [faceReminder, setFaceReminder] = useState(false);

    // Sidebar resize state
    const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
    const [isResizing, setIsResizing] = useState(false);
    const sidebarRef = useRef<HTMLDivElement>(null);

    const isCollapsed = sidebarWidth < 100;

    useEffect(() => {
        async function checkAuth() {
            try {
                const token = api.getToken();
                if (!token) {
                    router.replace('/');
                    return;
                }

                const userData = await api.getMe();
                setRole(userData.role);
                setName(`${userData.first_name} ${userData.last_name}`);

                if (userData.account_status === 'PENDING_FIRST_LOGIN') {
                    router.replace('/change-password');
                    return;
                }
                if (userData.account_status === 'PROFILE_SETUP_REQUIRED') {
                    if (userData.role === 'STUDENT') {
                        setProfileRequired(true);
                        setProfileForm({
                            first_name: userData.first_name || '',
                            last_name: userData.last_name || '',
                            phone: userData.phone || '',
                            department: userData.department || '',
                        });
                    } else {
                        router.replace('/setup-profile');
                        return;
                    }
                }

                if (
                    userData.role === 'STUDENT' &&
                    !userData.face_approved &&
                    userData.account_status !== 'PENDING_FIRST_LOGIN' &&
                    userData.account_status !== 'PROFILE_SETUP_REQUIRED'
                ) {
                    setFaceReminder(true);
                } else {
                    setFaceReminder(false);
                }

                // Redirect if user is on wrong dashboard
                const expectedPrefix = `/${userData.role.toLowerCase()}`;
                if (userData.role === 'ADMIN' && !pathname.startsWith('/admin')) {
                    router.replace('/admin');
                    return;
                }
                if (userData.role === 'TEACHER' && !pathname.startsWith('/teacher')) {
                    router.replace('/teacher');
                    return;
                }
                if (userData.role === 'STUDENT' && !pathname.startsWith('/student')) {
                    router.replace('/student');
                    return;
                }
            } catch {
                api.clearToken();
                router.replace('/');
                return;
            } finally {
                setLoading(false);
            }
        }
        checkAuth();
    }, [router, pathname]);

    const handleLogout = useCallback(() => {
        api.clearToken();
        router.replace('/');
    }, [router]);

    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setProfileError('');
        setProfileSaving(true);
        try {
            const updated = await api.completeProfile({
                first_name: profileForm.first_name.trim(),
                last_name: profileForm.last_name.trim(),
                phone: profileForm.phone || undefined,
                department: profileForm.department || undefined,
            });
            setName(`${updated.first_name} ${updated.last_name}`);
            setProfileRequired(false);
            if (updated.role === 'STUDENT' && !updated.face_approved) {
                setFaceReminder(true);
            }
        } catch (err: any) {
            setProfileError(err.message || 'Failed to update profile');
        } finally {
            setProfileSaving(false);
        }
    };

    // Resize handlers
    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            const newWidth = Math.min(Math.max(e.clientX, MIN_WIDTH), MAX_WIDTH);
            setSidebarWidth(newWidth < 90 ? COLLAPSED_WIDTH : newWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950">
                <div className="text-center space-y-4">
                    <GraduationCap size={48} className="text-blue-500 animate-pulse mx-auto" />
                    <div className="text-slate-500 font-mono text-sm animate-pulse">LOADING DASHBOARD...</div>
                </div>
            </div>
        );
    }

    const menuItems = menuItemsByRole[role] || [];

    return (
        <div className="min-h-screen bg-slate-950 flex">
            {/* Sidebar */}
            <div
                ref={sidebarRef}
                className="bg-slate-900/80 border-r border-slate-800 flex flex-col transition-all duration-100 relative"
                style={{ width: sidebarWidth, minWidth: sidebarWidth }}
            >
                {/* Logo */}
                <div className="p-4 border-b border-slate-800 flex items-center gap-3">
                    <GraduationCap
                        size={28}
                        weight="duotone"
                        className="text-blue-400 shrink-0"
                    />
                    {!isCollapsed && (
                        <div className="overflow-hidden">
                            <h1 className="text-sm font-chivo font-bold uppercase tracking-wider text-slate-100 truncate">
                                Classroom
                            </h1>
                            <p className="text-[10px] text-slate-500 font-mono truncate">
                                ENGAGEMENT
                            </p>
                        </div>
                    )}
                </div>

                {/* Menu Items */}
                <nav className="flex-1 py-4 space-y-1 px-2">
                    {menuItems.map((item) => {
                        const isActive = pathname === item.path;
                        const Icon = item.icon;
                        return (
                            <a
                                key={item.path}
                                href={item.path}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm transition-all duration-150 group ${isActive
                                    ? 'bg-blue-600/20 text-blue-400 border border-blue-700/50'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                                    }`}
                                title={item.label}
                            >
                                <Icon
                                    size={20}
                                    weight={isActive ? 'fill' : 'regular'}
                                    className="shrink-0"
                                />
                                {!isCollapsed && (
                                    <span className="font-medium truncate tracking-wide">
                                        {item.label}
                                    </span>
                                )}
                            </a>
                        );
                    })}
                </nav>

                {/* User Info & Logout */}
                <div className="p-3 border-t border-slate-800 space-y-2">
                    {!isCollapsed && (
                        <div className="px-2">
                            <p className="text-xs text-slate-300 truncate font-medium">{name}</p>
                            <p className="text-[10px] text-slate-500 font-mono uppercase">{role}</p>
                        </div>
                    )}
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-3 py-2 rounded-sm text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors text-sm"
                        title="Logout"
                    >
                        <SignOut size={20} className="shrink-0" />
                        {!isCollapsed && <span className="font-medium tracking-wide">Logout</span>}
                    </button>
                </div>

                {/* Resize Handle */}
                <div
                    className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors"
                    onMouseDown={startResizing}
                />
            </div>

            {/* Main Content */}
            <main className={`flex-1 overflow-auto ${profileRequired ? 'pointer-events-none' : ''}`}>
                <div className={`p-6 lg:p-8 max-w-7xl mx-auto ${profileRequired ? 'blur-sm' : ''}`}>
                    {faceReminder && (
                        <div className="mb-6 bg-amber-950/30 border border-amber-700/40 text-amber-300 text-sm rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                            <span>
                                Your face verification is pending. Upload a clear face photo in your profile to enable face login.
                            </span>
                            <button
                                onClick={() => router.push('/student/profile')}
                                className="bg-amber-600/20 border border-amber-500/40 text-amber-200 px-3 py-1.5 rounded-lg text-xs uppercase tracking-wider"
                            >
                                Go to Profile
                            </button>
                        </div>
                    )}
                    {children}
                </div>
            </main>

            {/* Scanlines */}
            <div className="scanlines" />

            {/* Profile Setup Modal (Students) */}
            <Modal
                isOpen={profileRequired}
                onClose={() => {}}
                title="Complete Profile"
                size="md"
                hideClose
            >
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                    {profileError && (
                        <div className="bg-red-950/40 border border-red-700/40 text-red-300 text-sm p-3 rounded-lg">
                            {profileError}
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">First Name</label>
                            <input
                                type="text"
                                required
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                value={profileForm.first_name}
                                onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Last Name</label>
                            <input
                                type="text"
                                required
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                value={profileForm.last_name}
                                onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Phone</label>
                            <input
                                type="text"
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                value={profileForm.phone}
                                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                                placeholder="+1..."
                            />
                        </div>
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-1 font-mono">Department</label>
                            <input
                                type="text"
                                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500"
                                value={profileForm.department}
                                onChange={(e) => setProfileForm({ ...profileForm, department: e.target.value })}
                                placeholder="Computer Science"
                            />
                        </div>
                    </div>
                    <button type="submit" className="btn-primary rounded-xl w-full" disabled={profileSaving}>
                        {profileSaving ? 'Saving...' : 'Complete Profile'}
                    </button>
                </form>
            </Modal>

        </div>
    );
}
