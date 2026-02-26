'use client';

import React, { useId } from 'react';

interface TrendPoint {
    timestamp?: string;
    avg?: number;
    value?: number;
}

interface MiniTrendChartProps {
    data: TrendPoint[];
    height?: number;
    stroke?: string;
}

export function MiniTrendChart({ data, height = 140, stroke = '#38bdf8' }: MiniTrendChartProps) {
    const gradientId = useId();
    const values = data.map((point) => (
        typeof point.avg === 'number' ? point.avg : (typeof point.value === 'number' ? point.value : 0)
    ));

    if (values.length === 0) {
        return (
            <div className="h-[140px] flex items-center justify-center text-slate-600 text-xs uppercase tracking-widest font-mono">
                No trend data
            </div>
        );
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 1);

    const points = values.map((value, index) => {
        const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
        const y = 100 - ((value - min) / range) * 100;
        return `${x},${y}`;
    });

    const path = `M ${points.join(' L ')}`;
    const areaPath = `${path} L 100,100 L 0,100 Z`;

    return (
        <div className="w-full" style={{ height }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
                        <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d={areaPath} fill={`url(#${gradientId})`} />
                <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" />
            </svg>
        </div>
    );
}
