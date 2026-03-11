import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  ShieldCheck, 
  ShieldAlert,
  Server,
  Calendar,
  X,
  PlusCircle,
  Hash
} from 'lucide-react';
import api from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmModal from '../components/ConfirmModal';

const ProviderKeys = () => {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newKeyData, setNewKeyData] = useState({ provider_name: '', api_key: '' });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, id: 0 });
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    try {
      const { data } = await api.get('/api/admin/provider-keys');
      setKeys(data);
    } catch (err) {
      console.error('Failed to fetch provider keys:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/admin/provider-keys', newKeyData);
      setIsModalOpen(false);
      setNewKeyData({ provider_name: '', api_key: '' });
      fetchKeys();
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to add provider key. Please ensure the provider name is selected.' });
    }
  };

  const handleDeleteKey = async (id: number) => {
    try {
      await api.delete(`/api/admin/provider-keys/${id}`);
      fetchKeys();
    } catch (err) {
      console.error('Failed to remove key:', err);
    }
  };

  const providers = [
    'groq', 'nvidia', 'gemini', 'openrouter', 'together', 
    'fireworks', 'cerebras', 'anthropic', 'deepseek', 
    'mistral', 'cohere', 'aitools'
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Provider API Keys</h1>
          <p className="text-gray-400 mt-1">Manage upstream credentials for AI providers</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="btn-primary flex items-center gap-2 px-6 py-3"
        >
          <PlusCircle className="w-5 h-5" />
          <span>Add Provider Key</span>
        </button>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/5 border-b border-white/5">
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Provider</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Added On</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={4} className="px-6 py-8 bg-white/5 opacity-20"></td>
                </tr>
              ))
            ) : keys.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  No provider keys configured yet.
                </td>
              </tr>
            ) : (
              keys.map((key) => (
                <tr key={key.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg">
                        <Server className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-bold text-white uppercase tracking-wider">{key.provider_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`flex items-center gap-1.5 text-xs font-medium ${key.is_active ? 'text-green-500' : 'text-red-400'}`}>
                      {key.is_active ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                      {key.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">
                    {new Date(key.added_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    <button 
                      onClick={() => setConfirmModal({ isOpen: true, id: key.id })}
                      className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Creation Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-0">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg glass-card p-8 shadow-2xl"
            >
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-2xl font-bold text-white">Add Provider Key</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-white"><X /></button>
              </div>

              <form onSubmit={handleCreateKey} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Select Provider</label>
                  <select 
                    value={newKeyData.provider_name}
                    onChange={(e) => setNewKeyData({ ...newKeyData, provider_name: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 appearance-none"
                    required
                  >
                    <option value="" className="bg-gray-900">Select a provider...</option>
                    {providers.map(p => (
                      <option key={p} value={p} className="bg-gray-900 uppercase">{p}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">API Key</label>
                  <div className="relative">
                    <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input 
                      type="password" 
                      value={newKeyData.api_key}
                      onChange={(e) => setNewKeyData({ ...newKeyData, api_key: e.target.value })}
                      placeholder="Paste your API key here..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      required
                    />
                  </div>
                </div>

                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <ul className="text-xs text-blue-400/80 space-y-2">
                    <li>• Keys are stored securely in the local SQLite database.</li>
                    <li>• They are rotated automatically to prevent rate limits.</li>
                    <li>• New keys are immediately available for routing.</li>
                  </ul>
                </div>

                <button type="submit" className="w-full btn-primary h-12 flex items-center justify-center gap-2">
                  <ShieldCheck className="w-5 h-5" />
                  <span>Securely Rotate Key</span>
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        title="Remove Provider Key"
        message="Are you sure you want to remove this provider key? This provider will no longer be available for routing requests until a new key is added."
        confirmText="Remove Key"
        onConfirm={() => handleDeleteKey(confirmModal.id)}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />

      <ConfirmModal 
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.message}
        confirmText="Understood"
        showAlertOnly={true}
        onConfirm={() => setAlertModal({ ...alertModal, isOpen: false })}
        onCancel={() => setAlertModal({ ...alertModal, isOpen: false })}
      />
    </div>
  );
};

export default ProviderKeys;
