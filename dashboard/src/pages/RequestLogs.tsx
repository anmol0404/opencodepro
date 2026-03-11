import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  Filter,
  ExternalLink,
  Clock,
  Cpu
} from 'lucide-react';
import api from '../api';

const RequestLogs = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchLogs();
  }, [page]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/admin/logs?page=${page}&limit=${limit}`);
      setLogs(data.data);
      setTotalPages(data.pagination.total_pages);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = searchTerm.trim()
    ? logs.filter(log =>
        String(log.id).includes(searchTerm) ||
        (log.client_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.provider || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.model || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    : logs;

  const getStatusColor = (code: number) => {
    if (code >= 200 && code < 300) return 'text-green-500 bg-green-500/10 border-green-500/20';
    if (code >= 400) return 'text-red-400 bg-red-400/10 border-red-400/20';
    return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Request Logs</h1>
          <p className="text-gray-400 mt-1">Detailed history of all API interactions</p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search by ID, client, provider..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 w-full sm:w-64"
            />
          </div>
          <button className="p-2 border border-white/10 rounded-lg hover:bg-white/5 text-gray-400">
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/5">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Timestamp</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Provider / Model</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Latency</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-6 py-8 h-16 bg-white/5 opacity-20"></td>
                  </tr>
                ))
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No logs found. Start making requests to see data here.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm text-white">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span className="text-xs text-gray-500">{new Date(log.timestamp).toLocaleDateString()}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-300">{log.client_name || 'System'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-blue-400 font-mono">{log.provider}</span>
                        </div>
                        <span className="text-xs text-gray-500 mt-0.5 line-clamp-1">{log.model}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-[10px] font-bold rounded-md border ${getStatusColor(log.status_code)}`}>
                        {log.status_code}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <span className="text-sm text-gray-300 tabular-nums">{log.latency_ms}ms</span>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <span className="text-sm font-medium text-green-400 tabular-nums">
                        ${log.cost_usd.toFixed(4)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between bg-white/[0.02]">
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 border border-white/10 rounded-lg hover:bg-white/5 disabled:opacity-30 text-gray-400"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 border border-white/10 rounded-lg hover:bg-white/5 disabled:opacity-30 text-gray-400"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RequestLogs;
