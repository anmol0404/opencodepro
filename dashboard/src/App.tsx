import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Key, 
  Database, 
  Activity, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  Search,
  ShieldCheck,
  Zap,
  Cpu,
  MessageSquare,
  DollarSign,
  PieChart
} from 'lucide-react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import RequestLogs from './pages/RequestLogs';
import ClientKeys from './pages/ClientKeys';
import ProviderKeys from './pages/ProviderKeys';
import Playground from './pages/Playground';
import Pricing from './pages/Pricing';
import UsageReport from './pages/UsageReport';

const isTokenExpired = (token: string): boolean => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 < Date.now() : false;
  } catch {
    return true;
  }
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('admin_token');
  if (!token || isTokenExpired(token)) {
    localStorage.removeItem('admin_token');
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const isLoginPage = location.pathname === '/login';

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    navigate('/login');
  };

  if (isLoginPage) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
      </Routes>
    );
  }

  const navItems = [
    { path: '/', label: 'Overview', icon: LayoutDashboard },
    { path: '/logs', label: 'Request Logs', icon: Database },
    { path: '/playground', label: 'Playground', icon: MessageSquare },
    { path: '/keys', label: 'Client Keys', icon: Key },
    { path: '/providers', label: 'Provider Keys', icon: ShieldCheck },
    { path: '/pricing', label: 'Model Pricing', icon: DollarSign },
    { path: '/usage', label: 'Usage Reports', icon: PieChart },
  ];

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-white/5 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0`}>
        <div className="flex flex-col h-full p-4">
          <div className="flex items-center gap-3 px-2 mb-8">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              AI Engine
            </span>
          </div>

          <nav className="flex-1 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`nav-link ${isActive ? 'active' : ''}`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-xl transition-all mt-auto"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-gray-950/50 backdrop-blur-md sticky top-0 z-40">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="lg:hidden p-2 text-gray-400 hover:text-white"
          >
            {isSidebarOpen ? <X /> : <Menu />}
          </button>
          
          <div className="flex items-center gap-4 ml-auto">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-white">Administrator</p>
              <p className="text-xs text-gray-500">System Owner</p>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className={`flex-1 overflow-y-auto ${location.pathname === '/playground' ? '' : 'p-6'}`}>
          <Routes>
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/logs" element={<ProtectedRoute><RequestLogs /></ProtectedRoute>} />
            <Route path="/keys" element={<ProtectedRoute><ClientKeys /></ProtectedRoute>} />
            <Route path="/providers" element={<ProtectedRoute><ProviderKeys /></ProtectedRoute>} />
            <Route path="/playground" element={<ProtectedRoute><Playground /></ProtectedRoute>} />
            <Route path="/pricing" element={<ProtectedRoute><Pricing /></ProtectedRoute>} />
            <Route path="/usage" element={<ProtectedRoute><UsageReport /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default App;
