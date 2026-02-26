'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { Camera, Pulse, CheckCircle, XCircle, User } from '@phosphor-icons/react';

interface UserData {
    id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    account_status: string;
    face_image_url?: string;
    face_approved: boolean;
    student_id?: string;
    batch?: string;
    department?: string;
    class_section?: string;
}

export default function FaceApprovalsPage() {
    const [pendingUsers, setPendingUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectingUser, setRejectingUser] = useState<UserData | null>(null);
    const [rejectReason, setRejectReason] = useState('');

    useEffect(() => {
        fetchPending();
    }, []);

    const fetchPending = async () => {
        try {
            setLoading(true);
            const users = await api.getPendingFaces();
            setPendingUsers(users || []);
        } catch (err) {
            console.error('Failed to load pending faces:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (userId: number) => {
        try {
            await api.approveFace(userId, true);
            fetchPending();
        } catch (err: any) {
            alert(err.message || 'Failed to approve face');
        }
    };

    const handleReject = async () => {
        if (!rejectingUser) return;
        try {
            await api.approveFace(rejectingUser.id, false, rejectReason);
            setShowRejectModal(false);
            setRejectingUser(null);
            setRejectReason('');
            fetchPending();
        } catch (err: any) {
            alert(err.message || 'Failed to reject face');
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-slate-700 border-t-orange-500 animate-spin" />
                    <Pulse size={24} className="absolute inset-0 m-auto text-orange-400 animate-pulse" />
                </div>
                <p className="text-slate-500 font-mono text-xs uppercase tracking-widest animate-pulse">
                    Loading Face Approvals...
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-chivo font-bold uppercase tracking-wider flex items-center gap-3">
                    <Camera size={28} weight="duotone" className="text-orange-400" />
                    Face Approvals
                </h1>
                <p className="text-slate-500 mt-1">Review and approve student face photos for recognition</p>
            </div>

            {pendingUsers.length === 0 ? (
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-12 text-center">
                    <Camera size={48} className="text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-400 text-lg">No pending face approvals</p>
                    <p className="text-slate-600 text-sm mt-1">All student face photos have been reviewed.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pendingUsers.map((user) => (
                        <div key={user.id} className="bg-slate-800/40 border border-slate-700/60 rounded-xl overflow-hidden hover:border-slate-500 transition-colors">
                            {/* User Info */}
                            <div className="p-4 flex items-center gap-3 border-b border-slate-800">
                                <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-slate-300">
                                    <User size={24} weight="fill" />
                                </div>
                                <div>
                                    <p className="font-semibold text-slate-200">{user.first_name} {user.last_name}</p>
                                    <p className="text-xs text-slate-500 font-mono">{user.student_id || user.username}</p>
                                </div>
                            </div>

                            {/* Student Details */}
                            <div className="p-4 border-b border-slate-800 bg-slate-900/30">
                                <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
                                    <div>
                                        <p className="uppercase font-mono text-slate-500">Email</p>
                                        <p className="text-slate-200">{user.email}</p>
                                    </div>
                                    <div>
                                        <p className="uppercase font-mono text-slate-500">Department</p>
                                        <p className="text-slate-200">{user.department || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="uppercase font-mono text-slate-500">Batch</p>
                                        <p className="text-slate-200">{user.batch || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="uppercase font-mono text-slate-500">Class / Section</p>
                                        <p className="text-slate-200">{user.class_section || '—'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Face Image */}
                            <div className="bg-slate-950 flex items-center justify-center border-b border-slate-800 p-4">
                                {user.face_image_url ? (
                                    <img
                                        src={`${process.env.NEXT_PUBLIC_API_URL}${user.face_image_url}`}
                                        alt={`${user.first_name}'s face`}
                                        className="w-full h-auto max-h-[520px] object-contain rounded-lg"
                                    />
                                ) : (
                                    <div className="text-center">
                                        <Camera size={48} className="text-slate-600 mx-auto mb-2" />
                                        <p className="text-xs text-slate-600">Face image uploaded</p>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="p-3 flex gap-2">
                                <button
                                    onClick={() => handleApprove(user.id)}
                                    className="flex-1 bg-green-950/30 border border-green-700/30 hover:border-green-500 rounded-xl py-2.5 text-green-400 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
                                >
                                    <CheckCircle size={18} weight="bold" /> Approve
                                </button>
                                <button
                                    onClick={() => {
                                        setRejectingUser(user);
                                        setShowRejectModal(true);
                                    }}
                                    className="flex-1 bg-red-950/30 border border-red-700/30 hover:border-red-500 rounded-xl py-2.5 text-red-400 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
                                >
                                    <XCircle size={18} weight="bold" /> Reject
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Reject Modal */}
            <Modal isOpen={showRejectModal} onClose={() => setShowRejectModal(false)} title="Reject Face Photo" size="sm">
                <div className="space-y-4">
                    <p className="text-slate-400 text-sm">
                        Provide a reason for rejecting <span className="text-slate-200 font-semibold">{rejectingUser?.first_name} {rejectingUser?.last_name}</span>'s face photo:
                    </p>
                    <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="e.g., Photo is blurry, face not clearly visible..."
                        className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-red-500 min-h-[100px] text-sm"
                    />
                    <div className="flex justify-end gap-3">
                        <button onClick={() => setShowRejectModal(false)} className="px-4 py-2 text-slate-400 hover:text-slate-200 rounded-xl">
                            Cancel
                        </button>
                        <button onClick={handleReject} className="btn-danger rounded-xl">
                            Reject Photo
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
