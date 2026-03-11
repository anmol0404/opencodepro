import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Trash2, 
  Bot, 
  User, 
  Settings2, 
  Loader2,
  Sparkles,
  Zap,
  Globe,
  Cpu,
  ChevronDown,
  Copy,
  Check
} from 'lucide-react';
import api from '../api';
import { motion, AnimatePresence } from 'framer-motion';

const escapeHtml = (str: string) =>
  str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MarkdownRenderer = ({ content }: { content: string }) => {
  const renderContent = () => {
    // Extract code blocks first to protect them from HTML escaping
    const codeBlocks: string[] = [];
    let processed = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, _lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push(`<pre class="bg-black/40 border border-white/10 rounded-lg p-4 overflow-x-auto my-3"><code class="text-sm text-gray-300 font-mono">${escapeHtml(code.trim())}</code></pre>`);
      return `%%CODEBLOCK_${idx}%%`;
    });

    const inlineCode: string[] = [];
    processed = processed.replace(/`([^`]+)`/g, (_, code) => {
      const idx = inlineCode.length;
      inlineCode.push(`<code class="bg-white/10 px-1.5 py-0.5 rounded text-sm text-blue-400">${escapeHtml(code)}</code>`);
      return `%%INLINE_${idx}%%`;
    });

    // Escape remaining HTML, then apply markdown formatting
    processed = escapeHtml(processed);

    // Restore code blocks and inline code
    codeBlocks.forEach((block, i) => { processed = processed.replace(`%%CODEBLOCK_${i}%%`, block); });
    inlineCode.forEach((code, i) => { processed = processed.replace(`%%INLINE_${i}%%`, code); });

    processed = processed
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-white">$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em class="italic text-gray-300">$1</em>')
      .replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold text-white mt-4 mb-2">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-white mt-5 mb-3">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-white mt-6 mb-4">$1</h1>')
      .replace(/^- (.+)$/gm, '<li class="ml-4 text-gray-300">&bull; $1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 text-gray-300 list-decimal">$1</li>')
      .replace(/\n\n/g, '<br/><br/>');

    return { __html: processed };
  };

  return <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={renderContent()} />;
};

const Playground = () => {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [models, setModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [useDeepSearch, setUseDeepSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchModels();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchModels = async () => {
    try {
      const { data } = await api.get('/v1/models');
      setModels(data.data || []);
      if (data.data?.length > 0) {
        setSelectedModel(data.data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading || isStreaming) return;

    const userMessage = { role: 'user', content: input };
    const allMessages = [...messages, userMessage];
    setMessages(allMessages);
    setInput('');
    setLoading(true);
    setIsStreaming(false);

    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`${(import.meta as any).env.VITE_API_URL || 'http://localhost:3010'}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-access-token': token || ''
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: allMessages,
          stream: true,
          use_deep_search: useDeepSearch
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = { role: 'assistant', content: '', deepSearchLogs: [] as string[] };
      let buf = '';
      let assistantAdded = false;
      let streamingStarted = false;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let newlineIndex;
          while ((newlineIndex = buf.indexOf('\n\n')) >= 0) {
            const linesString = buf.slice(0, newlineIndex);
            buf = buf.slice(newlineIndex + 2);

            const lines = linesString.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.replace('data: ', '').trim();
                if (dataStr === '[DONE]') continue;

                try {
                  const data = JSON.parse(dataStr);
                  let stateChanged = false;

                  if (data.deep_search_status) {
                    assistantMessage = {
                      ...assistantMessage,
                      deepSearchLogs: [...(assistantMessage.deepSearchLogs || []), data.deep_search_status]
                    };
                    stateChanged = true;
                  } else if (data.choices?.[0]?.delta?.content) {
                    if (!streamingStarted) {
                      streamingStarted = true;
                      setIsStreaming(true);
                    }
                    assistantMessage = {
                      ...assistantMessage,
                      content: assistantMessage.content + data.choices[0].delta.content
                    };
                    stateChanged = true;
                  }

                  if (stateChanged) {
                    // Add assistant message to list on first data received
                    if (!assistantAdded) {
                      assistantAdded = true;
                      setLoading(false);
                      setMessages(prev => [...prev, assistantMessage]);
                    } else {
                      setMessages(prev => {
                        const newMsgs = [...prev];
                        newMsgs[newMsgs.length - 1] = assistantMessage;
                        return newMsgs;
                      });
                    }
                  }
                } catch (e) {
                  // Partial JSON is possible, ignore until next chunk
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      const errorMsg = err.message || 'An error occurred';
      setMessages(prev => [...prev, { role: 'system', content: `Error: ${errorMsg}`, isError: true }]);
    } finally {
      setLoading(false);
      setIsStreaming(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] w-full overflow-hidden">
      {/* Settings Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-gray-900/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-gray-800/80 px-4 py-2.5 rounded-lg border border-white/10">
            <Cpu className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <select 
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-gray-800 text-white text-sm font-medium focus:outline-none cursor-pointer min-w-[250px] px-2 py-1 rounded"
            >
              {models.length === 0 ? (
                <option>Loading models...</option>
              ) : (
                models.map(m => (
                  <option key={m.id} value={m.id} className="bg-gray-900 text-white">{m.id}</option>
                ))
              )}
            </select>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Globe className="w-3 h-3" />
            <span>Streaming: Enabled</span>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <button
            onClick={() => setUseDeepSearch(!useDeepSearch)}
            className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
              useDeepSearch 
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]' 
                : 'bg-white/5 text-gray-500 hover:text-gray-300 border border-transparent'
            }`}
          >
            <Globe className={`w-3.5 h-3.5 ${useDeepSearch ? 'text-purple-400' : ''}`} />
            <span>Deep Search</span>
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setMessages([])}
            className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
            title="Clear Chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 bg-gradient-to-b from-gray-950 to-gray-900">
        <div className="max-w-4xl mx-auto space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50 min-h-[60vh]">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-3xl flex items-center justify-center backdrop-blur-sm border border-white/10">
              <Sparkles className="w-10 h-10 text-blue-400" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">AI Playground</h3>
              <p className="text-sm text-gray-400 max-w-md mt-2">
                Test your models, vision capabilities, and deep search in real-time with streaming responses.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              key={i} 
              className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex gap-4 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'user' 
                    ? 'bg-gradient-to-br from-blue-600 to-blue-700 shadow-lg shadow-blue-600/30' 
                    : msg.isError 
                      ? 'bg-red-500/10 text-red-500 border border-red-500/30' 
                      : 'bg-gradient-to-br from-gray-800 to-gray-900 border border-white/10'
                }`}>
                  {msg.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className={`w-5 h-5 ${msg.isError ? '' : 'text-blue-400'}`} />}
                </div>
                <div className={`flex flex-col flex-1 ${msg.role === 'user' ? 'items-end' : ''}`}>
                  {msg.deepSearchLogs && msg.deepSearchLogs.length > 0 && (
                    <div className="mb-3 bg-purple-900/10 border border-purple-500/20 rounded-2xl overflow-hidden backdrop-blur-sm w-full">
                      <details className="group" open={!msg.content}>
                        <summary className="flex items-center gap-3 cursor-pointer text-xs font-bold text-purple-400 px-4 py-3 select-none hover:bg-purple-500/5 outline-none transition-colors">
                          <Globe className={`w-4 h-4 ${!msg.content ? 'animate-pulse' : ''}`} />
                          <span>{!msg.content ? 'Searching the web...' : 'Deep Search Results'}</span>
                          <span className="ml-auto text-purple-500/70 text-[10px]">{msg.deepSearchLogs.length} updates</span>
                          <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="px-4 py-3 border-t border-purple-500/10 text-xs text-gray-400 font-mono space-y-2 bg-black/30 max-h-48 overflow-y-auto">
                          {msg.deepSearchLogs.map((log: string, idx: number) => (
                            <div key={idx} className="flex gap-3 items-start">
                              <span className="text-purple-500/50 flex-shrink-0 font-bold">[{idx + 1}]</span>
                              <span className="break-words leading-relaxed">{log}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}
                  {msg.content ? (
                    <div className="relative group/msg w-full">
                      <div className={`px-5 py-4 rounded-2xl text-[15px] leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/20'
                          : msg.isError
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : 'bg-gradient-to-br from-gray-800/80 to-gray-900/80 text-gray-100 border border-white/10 backdrop-blur-sm'
                      }`}>
                        {msg.role === 'assistant' && !msg.isError ? (
                          <MarkdownRenderer content={msg.content} />
                        ) : (
                          <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                        )}
                      </div>
                      <button
                        onClick={() => copyToClipboard(msg.content, i)}
                        className="absolute top-2 right-2 p-2 bg-black/40 hover:bg-black/60 rounded-lg opacity-0 group-hover/msg:opacity-100 transition-all"
                        title="Copy message"
                      >
                        {copiedIndex === i ? (
                          <Check className="w-3.5 h-3.5 text-green-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-gray-400" />
                        )}
                      </button>
                    </div>
                  ) : msg.role === 'assistant' && (
                    <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-white/10 px-5 py-4 rounded-2xl backdrop-blur-sm flex items-center gap-3">
                      <div className="flex gap-1.5">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-sm text-gray-400">Generating response...</span>
                    </div>
                  )}
                  {msg.content && <span className="text-[10px] text-gray-600 mt-2 uppercase font-bold tracking-widest px-1">{msg.role}</span>}
                </div>
              </div>
            </motion.div>
          ))
        )}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-4"
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 border border-white/10 flex items-center justify-center">
              {useDeepSearch ? (
                <Globe className="w-5 h-5 text-purple-400 animate-pulse" />
              ) : (
                <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
              )}
            </div>
            <div className={`border px-5 py-4 rounded-2xl backdrop-blur-sm flex items-center gap-3 ${
              useDeepSearch
                ? 'bg-gradient-to-br from-purple-900/20 to-gray-900/80 border-purple-500/20'
                : 'bg-gradient-to-br from-gray-800/80 to-gray-900/80 border-white/10'
            }`}>
              <div className="flex gap-1.5">
                <div className={`w-2 h-2 rounded-full animate-bounce ${useDeepSearch ? 'bg-purple-500' : 'bg-blue-500'}`} style={{ animationDelay: '0ms' }} />
                <div className={`w-2 h-2 rounded-full animate-bounce ${useDeepSearch ? 'bg-purple-500' : 'bg-blue-500'}`} style={{ animationDelay: '150ms' }} />
                <div className={`w-2 h-2 rounded-full animate-bounce ${useDeepSearch ? 'bg-purple-500' : 'bg-blue-500'}`} style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-sm text-gray-400">
                {useDeepSearch ? 'Searching the web...' : 'Thinking...'}
              </span>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="px-6 py-4 bg-gray-900/80 border-t border-white/5 backdrop-blur-md">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSend} className="relative group">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Shift + Enter for new line)"
              rows={1}
              className="w-full bg-gray-800/50 border border-white/10 rounded-2xl py-4 pl-5 pr-16 text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all placeholder-gray-500 backdrop-blur-sm"
              style={{ minHeight: '60px', maxHeight: '200px' }}
            />
            <button 
              type="submit"
              disabled={!input.trim() || loading || isStreaming}
              className="absolute right-3 bottom-3 w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-30 disabled:pointer-events-none rounded-xl flex items-center justify-center text-white transition-all shadow-lg shadow-blue-600/30 active:scale-95"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Playground;
