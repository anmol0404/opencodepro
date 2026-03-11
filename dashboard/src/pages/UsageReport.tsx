import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Legend
} from 'recharts';
import { 
  Users, 
  Server, 
  BadgeDollarSign,
  TrendingUp,
  CreditCard,
  History
} from 'lucide-react';
import api from '../api';
import { motion } from 'framer-motion';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const UsageReport = () => {
  const [data, setData] = useState<any>({ costByClient: [], costByProvider: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsage();
  }, []);

  const fetchUsage = async () => {
    try {
      const { data } = await api.get('/api/admin/usage-report');
      setData(data);
    } catch (err) {
      console.error('Failed to fetch usage report:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Usage Analytics</h1>
          <p className="text-gray-400 mt-1">Detailed breakdown of costs and token consumption</p>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-xl border border-white/10 text-xs font-bold text-gray-400 uppercase tracking-widest">
          <History className="w-4 h-4" />
          <span>Last 30 Days</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Cost by Client */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Cost by Client</h3>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.costByClient} layout="vertical">
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="client_name" 
                  type="category" 
                  stroke="#4b5563" 
                  fontSize={12} 
                  tickLine={false}
                  axisLine={false}
                  width={100}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  itemStyle={{ color: '#3b82f6' }}
                  formatter={(val: any) => [`$${val.toFixed(4)}`, 'Total Cost']}
                />
                <Bar dataKey="total_cost" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Cost by Provider */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
              <Server className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Cost by Provider</h3>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.costByProvider}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={8}
                  dataKey="total_cost"
                  nameKey="provider"
                  stroke="none"
                >
                  {data.costByProvider.map((_entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                   contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                   itemStyle={{ color: '#fff' }}
                   formatter={(val: any) => [`$${val.toFixed(4)}`, 'Total Cost']}
                />
                <Legend iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Detailed Table */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card overflow-hidden"
      >
        <div className="p-6 border-b border-white/5 bg-white/[0.01] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg">
              <BadgeDollarSign className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Detailed Client Usage</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white/[0.02] text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-white/5">
              <tr>
                <th className="px-6 py-4">Client Name</th>
                <th className="px-6 py-4 text-right">Requests</th>
                <th className="px-6 py-4 text-right">Total Cost</th>
                <th className="px-6 py-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={4} className="h-16 px-6 bg-white/[0.01]" />
                  </tr>
                ))
              ) : data.costByClient.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500 italic">No usage data found for this period</td>
                </tr>
              ) : (
                data.costByClient.map((client: any, idx: number) => (
                  <tr key={idx} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-white">{client.client_name || 'System / Direct'}</div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-gray-400">
                      {client.request_count.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-blue-400 font-bold">
                      ${client.total_cost.toFixed(6)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-[10px] font-bold rounded-md border border-green-500/20">
                        MONITORED
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

export default UsageReport;
