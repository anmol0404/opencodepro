import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area 
} from 'recharts';
import { 
  TrendingUp, 
  DollarSign, 
  Activity, 
  Server,
  Zap,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import api from '../api';

const StatCard = ({ title, value, icon: Icon, color, trend }: any) => (
  <div className="glass-card p-6 flex flex-col gap-4 group">
    <div className="flex items-center justify-between">
      <div className={`w-12 h-12 rounded-xl bg-${color}-500/10 flex items-center justify-center text-${color}-500`}>
        <Icon className="w-6 h-6" />
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-sm ${trend > 0 ? 'text-green-500' : 'text-red-500'}`}>
          {trend > 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
          {Math.abs(trend)}%
        </div>
      )}
    </div>
    <div>
      <p className="text-gray-400 text-sm font-medium">{title}</p>
      <h3 className="text-2xl font-bold text-white mt-1">{value}</h3>
    </div>
  </div>
);

const Dashboard = () => {
  const [stats, setStats] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchHealth();
  }, []);

  const fetchStats = async () => {
    try {
      const { data } = await api.get('/api/admin/stats');
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHealth = async () => {
    try {
      const { data } = await api.get('/api/admin/health');
      setHealth(data);
    } catch (err) {
      console.error('Failed to fetch health:', err);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold text-white">System Overview</h1>
        <p className="text-gray-400 mt-2">Real-time performance metrics and cost analysis</p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Requests" 
          value={stats?.totalRequests.toLocaleString() || '0'} 
          icon={Activity} 
          color="blue"
        />
        <StatCard 
          title="Estimated Cost" 
          value={`$${stats?.totalCost.toFixed(4) || '0.0000'}`} 
          icon={DollarSign} 
          color="green" 
        />
        <StatCard 
          title="Avg Latency" 
          value={`${Math.round(stats?.avgLatency || 0)}ms`} 
          icon={Zap} 
          color="orange" 
        />
        <StatCard 
          title="Active Providers" 
          value={`${stats?.activeProviders || 0}/${stats?.configuredProviders || 0}`} 
          icon={Server} 
          color="purple" 
        />
      </div>

      {/* Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold text-white">Cost Trends (Last 7 Days)</h3>
            <div className="text-sm text-gray-400">Values in USD</div>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.dailyCosts || []}>
                <defs>
                  <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#4b5563" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { weekday: 'short' })}
                />
                <YAxis 
                  stroke="#4b5563" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(val) => `$${val.toFixed(2)}`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="cost" 
                  stroke="#3b82f6" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorCost)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card p-8">
          <h3 className="text-xl font-bold text-white mb-8">System Health</h3>
          <div className="space-y-6">
            {[
              { label: 'Database', status: health?.database },
              { label: 'Redis Cache', status: health?.redis },
              { label: 'Proxy Engine', status: health?.proxy },
              { label: 'Background Jobs', status: health?.maintenance },
            ].map(({ label, status }) => {
              const isUp = status === 'operational' || status === 'online' || status === 'running';
              return (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-gray-400">{label}</span>
                  <span className={`px-2 py-1 text-xs font-bold rounded-lg border ${
                    isUp
                      ? 'bg-green-500/10 text-green-500 border-green-500/20'
                      : status === undefined
                        ? 'bg-gray-500/10 text-gray-500 border-gray-500/20'
                        : 'bg-red-500/10 text-red-500 border-red-500/20'
                  }`}>
                    {status?.toUpperCase() || 'CHECKING...'}
                  </span>
                </div>
              );
            })}
            {health?.providers && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Active Providers</span>
                <span className="px-2 py-1 bg-blue-500/10 text-blue-500 text-xs font-bold rounded-lg border border-blue-500/20">
                  {health.providers.active}/{health.providers.total}
                </span>
              </div>
            )}

            <hr className="border-white/5 my-6" />

            <div className="p-4 bg-white/5 rounded-xl border border-white/5">
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2">Pro Tip</p>
              <p className="text-sm text-gray-400 leading-relaxed text-balance">
                You can force a specific provider for any API request by passing the <span className="text-blue-400 font-mono">x-force-provider</span> header.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
