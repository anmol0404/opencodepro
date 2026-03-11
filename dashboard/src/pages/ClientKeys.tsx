import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Copy,
  Check,
  Shield,
  Key,
  Calendar,
  Eye,
  X,
  Settings2,
  Gauge,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Zap,
  BarChart3
} from 'lucide-react';
import api from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmModal from '../components/ConfirmModal';

interface KeyLimits {
  rate_limit_rpm: number | null;
  rate_limit_rph: number | null;
  rate_limit_rpd: number | null;
  max_lifetime_requests: number | null;
  monthly_token_limit: number | null;
  monthly_cost_limit_usd: number | null;
}

interface KeyUsage {
  lifetime_requests: number;
  month_requests: number;
  month_tokens: number;
  month_cost_usd: number;
  limits: KeyLimits;
}

const emptyLimits: KeyLimits = {
  rate_limit_rpm: null,
  rate_limit_rph: null,
  rate_limit_rpd: null,
  max_lifetime_requests: null,
  monthly_token_limit: null,
  monthly_cost_limit_usd: null,
};

const hasAnyLimit = (limits: KeyLimits) =>
  Object.values(limits).some(v => v !== null && v !== undefined);

const LimitInput = ({ label, value, onChange, placeholder = 'Unlimited' }: {
  label: string; value: number | null; onChange: (v: number | null) => void; placeholder?: string;
}) => (
  <div>
    <label className="block text-xs font-medium text-gray-400 mb-1">{label}</label>
    <input
      type="number"
      min="0"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      placeholder={placeholder}
      className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 placeholder-gray-600"
    />
  </div>
);

const LimitBadge = ({ label, value, unit }: { label: string; value: number; unit?: string }) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-500/10 text-blue-400 border border-blue-500/15">
    {label}: {value.toLocaleString()}{unit ? ` ${unit}` : ''}
  </span>
);

const UsageBar = ({ used, limit, label }: { used: number; limit: number; label: string }) => {
  const pct = Math.min(100, (used / limit) * 100);
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-blue-500';
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
        <span>{label}</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const ClientKeys = () => {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyLimits, setNewKeyLimits] = useState<KeyLimits>({ ...emptyLimits });
  const [showLimitsSection, setShowLimitsSection] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, id: 0 });
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });

  // Edit Limits modal
  const [editLimitsModal, setEditLimitsModal] = useState<{ isOpen: boolean; keyId: number; keyName: string; limits: KeyLimits }>({
    isOpen: false, keyId: 0, keyName: '', limits: { ...emptyLimits }
  });
  const [editSaving, setEditSaving] = useState(false);

  // Usage per key (keyed by id)
  const [usageMap, setUsageMap] = useState<Record<number, KeyUsage>>({});

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    try {
      const { data } = await api.get('/api/keys');
      setKeys(data);
      // Fetch usage for keys that have limits
      for (const key of data) {
        const limits: KeyLimits = {
          rate_limit_rpm: key.rate_limit_rpm,
          rate_limit_rph: key.rate_limit_rph,
          rate_limit_rpd: key.rate_limit_rpd,
          max_lifetime_requests: key.max_lifetime_requests,
          monthly_token_limit: key.monthly_token_limit,
          monthly_cost_limit_usd: key.monthly_cost_limit_usd,
        };
        if (hasAnyLimit(limits)) {
          fetchUsage(key.id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch keys:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsage = async (keyId: number) => {
    try {
      const { data } = await api.get(`/api/keys/${keyId}/usage`);
      setUsageMap(prev => ({ ...prev, [keyId]: data }));
    } catch (err) {
      console.error(`Failed to fetch usage for key ${keyId}:`, err);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = { name: newKeyName };
      if (showLimitsSection) {
        Object.entries(newKeyLimits).forEach(([k, v]) => {
          if (v !== null) payload[k] = v;
        });
      }
      const { data } = await api.post('/api/keys', payload);
      setGeneratedKey(data.api_key);
      fetchKeys();
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to create API key. Please check your connection and try again.' });
    }
  };

  const handleDeleteKey = async (id: number) => {
    try {
      await api.delete(`/api/keys/${id}`);
      fetchKeys();
    } catch (err) {
      console.error('Failed to delete key:', err);
    }
  };

  const handleToggleKey = async (id: number) => {
    try {
      await api.patch(`/api/keys/${id}/toggle`);
      fetchKeys();
    } catch (err) {
      console.error('Failed to toggle key:', err);
    }
  };

  const handleSaveLimits = async () => {
    setEditSaving(true);
    try {
      await api.put(`/api/keys/${editLimitsModal.keyId}/limits`, editLimitsModal.limits);
      setEditLimitsModal(prev => ({ ...prev, isOpen: false }));
      fetchKeys();
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to update limits.' });
    } finally {
      setEditSaving(false);
    }
  };

  const openEditLimits = (key: any) => {
    setEditLimitsModal({
      isOpen: true,
      keyId: key.id,
      keyName: key.name,
      limits: {
        rate_limit_rpm: key.rate_limit_rpm ?? null,
        rate_limit_rph: key.rate_limit_rph ?? null,
        rate_limit_rpd: key.rate_limit_rpd ?? null,
        max_lifetime_requests: key.max_lifetime_requests ?? null,
        monthly_token_limit: key.monthly_token_limit ?? null,
        monthly_cost_limit_usd: key.monthly_cost_limit_usd ?? null,
      }
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const keyLimitsOf = (key: any): KeyLimits => ({
    rate_limit_rpm: key.rate_limit_rpm,
    rate_limit_rph: key.rate_limit_rph,
    rate_limit_rpd: key.rate_limit_rpd,
    max_lifetime_requests: key.max_lifetime_requests,
    monthly_token_limit: key.monthly_token_limit,
    monthly_cost_limit_usd: key.monthly_cost_limit_usd,
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Client API Keys</h1>
          <p className="text-gray-400 mt-1">Manage access for external applications and users</p>
        </div>
        <button
          onClick={() => { setIsModalOpen(true); setGeneratedKey(null); setNewKeyName(''); setNewKeyLimits({ ...emptyLimits }); setShowLimitsSection(false); }}
          className="btn-primary flex items-center gap-2 px-6 py-3"
        >
          <Plus className="w-5 h-5" />
          <span>Generate New Key</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-card h-48 animate-pulse bg-white/5 opacity-20"></div>
          ))
        ) : keys.length === 0 ? (
          <div className="col-span-full py-20 text-center glass-card">
            <Key className="w-12 h-12 text-gray-700 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-400">No Keys Found</h3>
            <p className="text-gray-500 mt-2">Generate your first API key to get started.</p>
          </div>
        ) : (
          keys.map((key) => {
            const limits = keyLimitsOf(key);
            const hasLimits = hasAnyLimit(limits);
            const usage = usageMap[key.id];

            return (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                key={key.id}
                className="glass-card p-6 flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
                      <Key className="w-5 h-5" />
                    </div>
                    <div className="flex items-center gap-2">
                      {hasLimits && (
                        <span className="px-2 py-1 text-[10px] font-bold rounded-md border text-purple-400 bg-purple-500/10 border-purple-500/20 flex items-center gap-1">
                          <Gauge className="w-3 h-3" />
                          LIMITS
                        </span>
                      )}
                      <span className={`px-2 py-1 text-[10px] font-bold rounded-md border ${key.is_active ? 'text-green-500 bg-green-500/10 border-green-500/20' : 'text-red-500 bg-red-500/10 border-red-500/20'}`}>
                        {key.is_active ? 'ACTIVE' : 'REVOKED'}
                      </span>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">{key.name}</h3>
                  <code className="text-xs text-gray-500 font-mono tracking-wider">{key.prefix}</code>

                  {/* Limit badges */}
                  {hasLimits && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {limits.rate_limit_rpm !== null && <LimitBadge label="RPM" value={limits.rate_limit_rpm} />}
                      {limits.rate_limit_rph !== null && <LimitBadge label="RPH" value={limits.rate_limit_rph} />}
                      {limits.rate_limit_rpd !== null && <LimitBadge label="RPD" value={limits.rate_limit_rpd} />}
                      {limits.max_lifetime_requests !== null && <LimitBadge label="Lifetime" value={limits.max_lifetime_requests} />}
                      {limits.monthly_token_limit !== null && <LimitBadge label="Mo. Tokens" value={limits.monthly_token_limit} />}
                      {limits.monthly_cost_limit_usd !== null && <LimitBadge label="Mo. Budget" value={limits.monthly_cost_limit_usd} unit="USD" />}
                    </div>
                  )}

                  {/* Usage progress bars */}
                  {usage && limits.monthly_cost_limit_usd !== null && (
                    <UsageBar used={usage.month_cost_usd} limit={limits.monthly_cost_limit_usd} label={`$${usage.month_cost_usd.toFixed(4)} / $${limits.monthly_cost_limit_usd.toFixed(2)}`} />
                  )}
                  {usage && limits.monthly_token_limit !== null && (
                    <UsageBar used={usage.month_tokens} limit={limits.monthly_token_limit} label={`${usage.month_tokens.toLocaleString()} / ${limits.monthly_token_limit.toLocaleString()} tokens`} />
                  )}
                  {usage && limits.max_lifetime_requests !== null && (
                    <UsageBar used={usage.lifetime_requests} limit={limits.max_lifetime_requests} label={`${usage.lifetime_requests.toLocaleString()} / ${limits.max_lifetime_requests.toLocaleString()} lifetime`} />
                  )}
                </div>

                <div className="mt-6 flex items-center justify-between pt-4 border-t border-white/5">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Calendar className="w-3 h-3" />
                    <span>{new Date(key.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditLimits(key)}
                      className="p-2 text-gray-500 hover:text-purple-400 hover:bg-purple-400/10 rounded-lg transition-all"
                      title="Edit Limits"
                    >
                      <Settings2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleKey(key.id)}
                      className={`p-2 rounded-lg transition-all ${key.is_active ? 'text-yellow-500 hover:bg-yellow-400/10' : 'text-green-500 hover:bg-green-400/10'}`}
                      title={key.is_active ? 'Deactivate Key' : 'Activate Key'}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmModal({ isOpen: true, id: key.id })}
                      className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                      title="Revoke Key"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
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
              className="relative w-full max-w-lg glass-card p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-2xl font-bold text-white">Create New API Key</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-white"><X /></button>
              </div>

              {!generatedKey ? (
                <form onSubmit={handleCreateKey} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Key Label / Name</label>
                    <input
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g. My Website Production"
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      required
                    />
                  </div>

                  {/* Collapsible Limits Section */}
                  <div className="border border-white/10 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowLimitsSection(!showLimitsSection)}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-all"
                    >
                      <span className="flex items-center gap-2">
                        <Gauge className="w-4 h-4 text-purple-400" />
                        Usage Limits (Optional)
                      </span>
                      {showLimitsSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {showLimitsSection && (
                      <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">
                        <div className="space-y-1">
                          <p className="text-xs text-gray-500 flex items-center gap-1"><Zap className="w-3 h-3" /> Rate Limits</p>
                          <div className="grid grid-cols-3 gap-3">
                            <LimitInput label="RPM" value={newKeyLimits.rate_limit_rpm} onChange={(v) => setNewKeyLimits(p => ({ ...p, rate_limit_rpm: v }))} />
                            <LimitInput label="RPH" value={newKeyLimits.rate_limit_rph} onChange={(v) => setNewKeyLimits(p => ({ ...p, rate_limit_rph: v }))} />
                            <LimitInput label="RPD" value={newKeyLimits.rate_limit_rpd} onChange={(v) => setNewKeyLimits(p => ({ ...p, rate_limit_rpd: v }))} />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-500 flex items-center gap-1"><BarChart3 className="w-3 h-3" /> Lifetime Cap</p>
                          <LimitInput label="Max Lifetime Requests" value={newKeyLimits.max_lifetime_requests} onChange={(v) => setNewKeyLimits(p => ({ ...p, max_lifetime_requests: v }))} />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-500 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Monthly Budget</p>
                          <div className="grid grid-cols-2 gap-3">
                            <LimitInput label="Token Limit" value={newKeyLimits.monthly_token_limit} onChange={(v) => setNewKeyLimits(p => ({ ...p, monthly_token_limit: v }))} />
                            <LimitInput label="Cost Limit (USD)" value={newKeyLimits.monthly_cost_limit_usd} onChange={(v) => setNewKeyLimits(p => ({ ...p, monthly_cost_limit_usd: v }))} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <button type="submit" className="w-full btn-primary h-12">Generate Key Pair</button>
                </form>
              ) : (
                <div className="space-y-6">
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-500/80 text-sm flex items-start gap-3">
                    <Shield className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <p>Make sure to copy your API key now. You won't be able to see it again for security reasons.</p>
                  </div>

                  <div className="relative">
                    <div className="bg-gray-950 border border-white/10 rounded-xl p-4 font-mono text-blue-400 break-all pr-12">
                      {generatedKey}
                    </div>
                    <button
                      onClick={() => copyToClipboard(generatedKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white bg-white/5 rounded-lg border border-white/10"
                    >
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all"
                  >
                    I've Saved the Key
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Limits Modal */}
      <AnimatePresence>
        {editLimitsModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditLimitsModal(prev => ({ ...prev, isOpen: false }))}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg glass-card p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-white">Edit Limits</h3>
                  <p className="text-sm text-gray-400 mt-1">{editLimitsModal.keyName}</p>
                </div>
                <button onClick={() => setEditLimitsModal(prev => ({ ...prev, isOpen: false }))} className="text-gray-500 hover:text-white"><X /></button>
              </div>

              <div className="space-y-5">
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 flex items-center gap-1"><Zap className="w-3 h-3" /> Rate Limits</p>
                  <div className="grid grid-cols-3 gap-3">
                    <LimitInput label="RPM" value={editLimitsModal.limits.rate_limit_rpm} onChange={(v) => setEditLimitsModal(p => ({ ...p, limits: { ...p.limits, rate_limit_rpm: v } }))} />
                    <LimitInput label="RPH" value={editLimitsModal.limits.rate_limit_rph} onChange={(v) => setEditLimitsModal(p => ({ ...p, limits: { ...p.limits, rate_limit_rph: v } }))} />
                    <LimitInput label="RPD" value={editLimitsModal.limits.rate_limit_rpd} onChange={(v) => setEditLimitsModal(p => ({ ...p, limits: { ...p.limits, rate_limit_rpd: v } }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 flex items-center gap-1"><BarChart3 className="w-3 h-3" /> Lifetime Cap</p>
                  <LimitInput label="Max Lifetime Requests" value={editLimitsModal.limits.max_lifetime_requests} onChange={(v) => setEditLimitsModal(p => ({ ...p, limits: { ...p.limits, max_lifetime_requests: v } }))} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Monthly Budget</p>
                  <div className="grid grid-cols-2 gap-3">
                    <LimitInput label="Token Limit" value={editLimitsModal.limits.monthly_token_limit} onChange={(v) => setEditLimitsModal(p => ({ ...p, limits: { ...p.limits, monthly_token_limit: v } }))} />
                    <LimitInput label="Cost Limit (USD)" value={editLimitsModal.limits.monthly_cost_limit_usd} onChange={(v) => setEditLimitsModal(p => ({ ...p, limits: { ...p.limits, monthly_cost_limit_usd: v } }))} />
                  </div>
                </div>
              </div>

              <div className="mt-8 flex items-center gap-3">
                <button
                  onClick={() => setEditLimitsModal(prev => ({ ...prev, isOpen: false }))}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 font-medium transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveLimits}
                  disabled={editSaving}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all disabled:opacity-50"
                >
                  {editSaving ? 'Saving...' : 'Save Limits'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title="Revoke API Key"
        message="Are you sure you want to revoke this key? Any application using this key will immediately lose access. This action cannot be undone."
        confirmText="Revoke Permanently"
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

export default ClientKeys;
