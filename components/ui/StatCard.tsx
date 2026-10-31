import React from 'react';
import { LucideIcon } from 'lucide-react';
import { animations } from '@/lib/theme';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  gradient: string;
  subtitle?: string;
}

export default function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  gradient,
  subtitle 
}: StatCardProps) {
  return (
    <div className={`bg-linear-to-br ${gradient} rounded-xl shadow-lg border border-white/20 p-6 backdrop-blur-sm ${animations.scaleHover}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/80 text-sm font-medium mb-1">{label}</p>
          <p className="text-3xl font-bold text-white">{value.toLocaleString()}</p>
          {subtitle && (
            <p className="text-white/60 text-xs mt-1">{subtitle}</p>
          )}
        </div>
        <div className="p-3 bg-white/20 rounded-lg">
          <Icon className="w-8 h-8 text-white" />
        </div>
      </div>
    </div>
  );
}
