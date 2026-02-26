'use client';

import React, { useState, useEffect, useRef } from 'react';
import { GraduationCap, Lock, User, Camera } from '@phosphor-icons/react';
import Modal from '@/components/Modal';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [checkingAuth, setCheckingAuth] = useState(true);
    const [faceError, setFaceError] = useState('');
    const [faceLoading, setFaceLoading] = useState(false);
    const faceInputRef = useRef<HTMLInputElement>(null);
    const [showCamera, setShowCamera] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        async function checkExistingAuth() {
            try {
                const token = api.getToken();
                if (!token) {
                    setCheckingAuth(false);
                    return;
                }

                const userData = await api.getMe();
                const roleRoutes: Record<string, string> = {
                    ADMIN: '/admin',
                    TEACHER: '/teacher',
                    STUDENT: '/student',
                };

                const route = roleRoutes[userData.role] || '/student';
                router.replace(route);
            } catch {
                api.clearToken();
                setCheckingAuth(false);
            }
        }
        checkExistingAuth();
    }, [router]);

    useEffect(() => {
        return () => stopCamera();
    }, []);

    if (checkingAuth) {
        return (
            <div
                className="min-h-screen flex items-center justify-center bg-cover bg-center relative"
                style={{ backgroundImage: 'linear-gradient(to bottom right, #0f172a, #1e293b)' }}
            >
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
                <div className="relative z-10 text-center space-y-4">
                    <GraduationCap size={48} className="text-blue-500 animate-pulse mx-auto" />
                    <div className="text-slate-500 font-mono text-sm animate-pulse">VERIFYING SESSION...</div>
                </div>
            </div>
        );
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await api.login(username, password);

            // Check account status for lifecycle flow
            const user = response.user;

            if (user.account_status === 'PENDING_FIRST_LOGIN') {
                // Redirect to change password
                router.push('/change-password');
                return;
            }

            if (user.account_status === 'PROFILE_SETUP_REQUIRED') {
                if (user.role === 'STUDENT') {
                    router.push('/student');
                } else {
                    router.push('/setup-profile');
                }
                return;
            }

            // Normal redirect based on role
            const roleRoutes: Record<string, string> = {
                ADMIN: '/admin',
                TEACHER: '/teacher',
                STUDENT: '/student',
            };

            const route = roleRoutes[user.role] || '/student';
            router.push(route);
        } catch (err: any) {
            setError(err.message || 'Login failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    const handleFaceLogin = async (file: File) => {
        if (!username) {
            setFaceError('Enter your username first.');
            return;
        }
        setFaceError('');
        setFaceLoading(true);
        try {
            const response = await api.faceLogin(username, file);
            const user = response.user;
            if (user.account_status === 'PENDING_FIRST_LOGIN') {
                router.push('/change-password');
                return;
            }
            if (user.account_status === 'PROFILE_SETUP_REQUIRED') {
                if (user.role === 'STUDENT') {
                    router.push('/student');
                } else {
                    router.push('/setup-profile');
                }
                return;
            }
            const roleRoutes: Record<string, string> = {
                ADMIN: '/admin',
                TEACHER: '/teacher',
                STUDENT: '/student',
            };
            const route = roleRoutes[user.role] || '/student';
            router.push(route);
        } catch (err: any) {
            setFaceError(err.message || 'Face login failed.');
        } finally {
            setFaceLoading(false);
        }
    };

    const startCamera = async () => {
        setCameraError('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' },
                audio: false,
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
        } catch (err: any) {
            setCameraError(err.message || 'Failed to access camera.');
        }
    };

    function stopCamera() {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }

    const openCamera = () => {
        if (!username) {
            setFaceError('Enter your username first.');
            return;
        }
        setShowCamera(true);
        startCamera();
    };

    const closeCamera = () => {
        stopCamera();
        setShowCamera(false);
    };

    const captureAndLogin = async () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 480;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, width, height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
        if (!blob) {
            setCameraError('Failed to capture image.');
            return;
        }
        const file = new File([blob], 'face.jpg', { type: 'image/jpeg' });
        closeCamera();
        await handleFaceLogin(file);
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
                        <GraduationCap size={48} weight="duotone" className="text-blue-400 mb-4" />
                        <h1 className="text-3xl font-chivo font-bold uppercase tracking-wider text-center">
                            Classroom Engagement
                        </h1>
                        <p className="text-slate-400 text-sm mt-2">AI-Driven Adaptive Teaching Platform</p>
                    </div>

                    {error && (
                        <div className="bg-red-950/50 border border-red-800 rounded-sm p-3 mb-4 text-sm text-red-400">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2 font-mono">
                                Username
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    required
                                    className="w-full bg-slate-950 border-slate-700 text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-sm placeholder:text-slate-600 font-mono text-sm pl-10 pr-3 py-2.5 border outline-none"
                                    placeholder="Enter username"
                                    data-testid="username-input"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2 font-mono">
                                Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="w-full bg-slate-950 border-slate-700 text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-sm placeholder:text-slate-600 font-mono text-sm pl-10 pr-3 py-2.5 border outline-none"
                                    placeholder="••••••••"
                                    data-testid="password-input"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-sm font-medium tracking-wide uppercase text-sm px-4 py-3 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                            data-testid="login-submit-btn"
                        >
                            {loading ? 'Authenticating...' : 'Access System'}
                        </button>
                    </form>

                    <div className="mt-4 border-t border-slate-800 pt-4 space-y-2">
                        {faceError && (
                            <div className="bg-red-950/50 border border-red-800 rounded-sm p-2 text-xs text-red-400">
                                {faceError}
                            </div>
                        )}
                        <button
                            onClick={openCamera}
                            disabled={faceLoading}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-sm font-medium tracking-wide uppercase text-sm px-4 py-3 shadow-[0_0_10px_rgba(16,185,129,0.45)] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <Camera size={18} />
                            {faceLoading ? 'Verifying Face...' : 'Login With Face (Camera)'}
                        </button>
                        <button
                            onClick={() => faceInputRef.current?.click()}
                            disabled={faceLoading}
                            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-sm font-medium tracking-wide uppercase text-xs px-4 py-2.5 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Or Upload Face Photo
                        </button>
                        <input
                            ref={faceInputRef}
                            type="file"
                            accept="image/*"
                            capture="user"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFaceLogin(file);
                            }}
                            className="hidden"
                        />
                        <p className="text-[11px] text-slate-500 font-mono">
                            Requires approved face photo. Enter your username first.
                        </p>
                    </div>

                    <div className="mt-6 p-4 bg-slate-950/50 border border-slate-800 rounded-sm">
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 font-mono">Demo Accounts:</p>
                        <div className="grid grid-cols-1 gap-1 text-xs font-mono text-slate-400">
                            <div>Admin: <span className="text-slate-300">admin / admin123</span></div>
                            <div>Teacher: <span className="text-slate-300">teacher1 / teacher123</span></div>
                            <div>Student: <span className="text-slate-300">student1 / student123</span></div>
                        </div>
                    </div>
                </div>
            </div>

            <Modal
                isOpen={showCamera}
                onClose={closeCamera}
                title="Face Login"
                size="md"
            >
                <div className="space-y-4">
                    {cameraError && (
                        <div className="bg-red-950/40 border border-red-700/40 text-red-300 text-sm p-3 rounded-lg">
                            {cameraError}
                        </div>
                    )}
                    <div className="bg-black rounded-xl overflow-hidden">
                        <video ref={videoRef} className="w-full h-auto" playsInline muted />
                    </div>
                    <button
                        onClick={captureAndLogin}
                        className="btn-primary rounded-xl w-full"
                        disabled={faceLoading}
                    >
                        {faceLoading ? 'Verifying...' : 'Capture & Login'}
                    </button>
                    <canvas ref={canvasRef} className="hidden" />
                </div>
            </Modal>
        </div>
    );
}
