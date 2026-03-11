import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  Plus, 
  Trash2, 
  Save, 
  X, 
  Search, 
  ChevronRight, 
  AlertCircle, 
  Edit3,
  Loader2
} from 'lucide-react';
import api from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmModal from '../components/ConfirmModal';

const Pricing = () => {
    const [pricing, setPricing] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [formData, setFormData] = useState({ id: null, provider: '', model: '', input_cost_per_1m: 0, output_cost_per_1m: 0 });
    const [message, setMessage] = useState({ type: '', text: '' });
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, id: 0 });

    useEffect(() => {
        fetchPricing();
    }, []);

    const fetchPricing = async () => {
        try {
            const res = await api.get('/api/admin/pricing');
            setPricing(res.data);
        } catch (error) {
            console.error('Failed to fetch pricing:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/api/admin/pricing', formData);
            setMessage({ type: 'success', text: isEditMode ? 'Pricing updated successfully' : 'Pricing rate added successfully' });
            setShowModal(false);
            fetchPricing();
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to save pricing' });
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await api.delete(`/api/admin/pricing/${id}`);
            fetchPricing();
        } catch (error) {
            console.error('Failed to delete pricing:', error);
        }
    };

    const filteredPricing = pricing.filter(p =>
        p.provider.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.model.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Model Pricing</h1>
                    <p className="text-gray-400 mt-1">Manage input/output costs per 1 million tokens</p>
                </div>
                <button 
                    onClick={() => {
                        setIsEditMode(false);
                        setFormData({ id: null, provider: '', model: '', input_cost_per_1m: 0, output_cost_per_1m: 0 });
                        setShowModal(true);
                    }}
                    className="btn-primary flex items-center gap-2 px-6 py-3"
                >
                    <Plus className="w-5 h-5" />
                    <span>Add Pricing Rate</span>
                </button>
            </div>

            <div className="flex items-center gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input 
                        type="text" 
                        placeholder="Search by provider or model..." 
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="glass-card h-48 animate-pulse bg-white/5 opacity-20" />
                    ))
                ) : filteredPricing.map(rate => (
                    <motion.div 
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        key={rate.id} 
                        className="glass-card p-6 flex flex-col justify-between group hover:border-blue-500/30 transition-all cursor-pointer"
                        onClick={() => {
                            setIsEditMode(true);
                            setFormData(rate);
                            setShowModal(true);
                        }}
                    >
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <span className="px-2 py-1 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded-md border border-blue-500/20 uppercase tracking-widest">
                                    {rate.provider}
                                </span>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setConfirmModal({ isOpen: true, id: rate.id }); }}
                                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-4 line-clamp-1">{rate.model === '*' ? 'Fallback' : rate.model}</h3>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Input (1M)</p>
                                    <p className="text-lg font-mono text-blue-400">${rate.input_cost_per_1m.toFixed(4)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Output (1M)</p>
                                    <p className="text-lg font-mono text-white">${rate.output_cost_per_1m.toFixed(4)}</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Modal */}
            <AnimatePresence>
                {showModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-0">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowModal(false)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-lg glass-card p-8 shadow-2xl"
                        >
                            <div className="mb-6 flex items-center justify-between">
                                <h3 className="text-2xl font-bold text-white">{isEditMode ? 'Edit Pricing' : 'Add Pricing'}</h3>
                                <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white"><X /></button>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-widest">Provider</label>
                                        <input 
                                            type="text" 
                                            value={formData.provider}
                                            onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-widest">Model (* for all)</label>
                                        <input 
                                            type="text" 
                                            value={formData.model}
                                            onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-widest">Input ($/1M)</label>
                                        <input 
                                            type="number" 
                                            step="0.000001"
                                            value={formData.input_cost_per_1m}
                                            onChange={(e) => setFormData({ ...formData, input_cost_per_1m: parseFloat(e.target.value) })}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-widest">Output ($/1M)</label>
                                        <input 
                                            type="number" 
                                            step="0.000001"
                                            value={formData.output_cost_per_1m}
                                            onChange={(e) => setFormData({ ...formData, output_cost_per_1m: parseFloat(e.target.value) })}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
                                            required
                                        />
                                    </div>
                                </div>

                                <button type="submit" className="w-full btn-primary h-12 flex items-center justify-center gap-2">
                                    <Save className="w-5 h-5" />
                                    <span>{isEditMode ? 'Update Pricing' : 'Save Pricing'}</span>
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <ConfirmModal 
                isOpen={confirmModal.isOpen}
                title="Delete Pricing Rate"
                message="Are you sure you want to delete this pricing rate? This will affect cost calculations for all future requests using this model/provider combination."
                confirmText="Delete Rate"
                onConfirm={() => handleDelete(confirmModal.id)}
                onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
            />
        </div>
    );
};

export default Pricing;
