import React from 'react';

interface StatusBadgeProps {
    status: string;
    className?: string;
}

const statusStyles: Record<string, string> = {
    // Account lifecycle states
    PENDING_FIRST_LOGIN: 'text-amber-400 bg-amber-950/50 border-amber-800',
    PROFILE_SETUP_REQUIRED: 'text-sky-400 bg-sky-950/50 border-sky-800',
    FACE_PENDING: 'text-yellow-400 bg-yellow-950/50 border-yellow-800',
    ACTIVE: 'text-green-400 bg-green-950/50 border-green-800',
    LOCKED: 'text-red-400 bg-red-950/50 border-red-800',
    SUSPENDED: 'text-rose-400 bg-rose-950/50 border-rose-800',

    // Role badges
    ADMIN: 'text-purple-400 bg-purple-950/50 border-purple-800',
    TEACHER: 'text-orange-400 bg-orange-950/50 border-orange-800',
    STUDENT: 'text-blue-400 bg-blue-950/50 border-blue-800',

    // Generic
    SUCCESS: 'text-green-400 bg-green-950/50 border-green-800',
    FAILED: 'text-red-400 bg-red-950/50 border-red-800',
    PENDING: 'text-yellow-400 bg-yellow-950/50 border-yellow-800',
    INACTIVE: 'text-red-400 bg-red-950/50 border-red-800',

    // Session statuses
    SCHEDULED: 'text-sky-400 bg-sky-950/50 border-sky-800',
    LIVE: 'text-green-400 bg-green-950/50 border-green-800',
    ENDED: 'text-slate-300 bg-slate-900/60 border-slate-700',
    CANCELLED: 'text-rose-400 bg-rose-950/50 border-rose-800',
};

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
    const style = statusStyles[status] || 'text-slate-400 bg-slate-950/50 border-slate-800';

    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider border ${style} ${className}`}
        >
            {status.replace(/_/g, ' ')}
        </span>
    );
}
