import React, { useState, useRef, useEffect } from 'react';
import { Message, Student } from '../types';

interface AIDataExplorerViewProps {
  students: Student[];
  onNavigate: (page: string) => void;
  onRefreshRoster: () => void;
}

export default function AIDataExplorerView({
  students,
  onNavigate,
  onRefreshRoster,
}: AIDataExplorerViewProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg_1',
      sender: 'assistant',
      text: "Hello Dr. Aradhya! I am Alpine, your smart classroom assistant. Use me to handle your work in a smarter way. I can filter student cohorts (e.g., 'Who is below 80% in Section A?'), spawn draft sections, toggle live gates, or steer your interface. Try typing your command below!",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (customPrompt?: string) => {
    const textToSend = (customPrompt || input).trim();
    if (!textToSend) return;

    if (!customPrompt) setInput('');

    // Append user message
    const userMsg: Message = {
      id: `usr_${Math.random()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const token = localStorage.getItem('sjce_auth_token_lecturer') || localStorage.getItem('sjce_auth_token_admin');
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          message: textToSend,
          history: messages.slice(-10), // Send last 10 messages for conversation state
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      // Append assistant message
      const botMsg: Message = {
        id: `bot_${Math.random()}`,
        sender: 'assistant',
        text: data.text,
        timestamp: new Date().toLocaleTimeString(),
        actionCard: data.actionCard,
      };

      setMessages((prev) => [...prev, botMsg]);

      // Check for specialized agent command redirects in action card
      if (data.actionCard) {
        if (data.actionCard.type === 'redirect' && data.actionCard.data?.pageName) {
          setTimeout(() => {
            onNavigate(data.actionCard.data.pageName);
          }, 1500);
        } else if (data.actionCard.type === 'section_created' || data.actionCard.type === 'session_activated') {
          onRefreshRoster();
        }
      }

    } catch (e: any) {
      console.error(e);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Math.random()}`,
          sender: 'assistant',
          text: `Connection timeout or missing key. Alpine cannot bridge requests offline. (API Response: ${e.message})`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Greeting */}
      <section className="space-y-1">
        <h2 className="text-2xl md:text-3xl font-display font-semibold text-[#191c1e] tracking-tight">
          AI Data Explorer
        </h2>
        <p className="text-sm text-[#494454]">
          Query student records using natural language. Fast, local, and precise.
        </p>
      </section>

      {/* AI Interface Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side Panel: Context & Saved Queries */}
        <aside className="lg:col-span-3 space-y-4 hidden lg:block">
          <div className="acrylic-card rounded-2xl p-5 border border-[#6b38d4]/10 shadow-sm">
            <h3 className="text-[10px] font-sans font-bold tracking-widest text-[#7b7486] uppercase mb-4">
              Active Session Status
            </h3>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-[#e9ddff]/50 rounded-xl flex items-center justify-center text-[#6b38d4]">
                <span className="material-symbols-outlined font-semibold text-lg">book</span>
              </div>
              <div>
                <p className="text-xs font-bold text-[#191c1e]">CS301 Algorithms</p>
                <p className="text-[10px] text-[#7b7486]">Section A &bull; Room 302</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-[#6b38d4]/10">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-[#494454] font-semibold">Sync Reconciliation</span>
                <span className="text-[10px] font-bold text-[#00687a]">98% Synced</span>
              </div>
              <div className="w-full bg-[#eceef0] h-1.5 rounded-full overflow-hidden">
                <div className="bg-[#6b38d4] h-full w-[98%]"></div>
              </div>
            </div>
          </div>

          <div className="acrylic-card rounded-2xl p-5 border border-[#6b38d4]/10 shadow-sm">
            <h3 className="text-[10px] font-sans font-bold tracking-widest text-[#7b7486] uppercase mb-4">
              Quick Queries
            </h3>
            <ul className="space-y-3 font-sans text-xs font-bold">
              <li>
                <button 
                  onClick={() => handleSend("Who is below 80% in Section A?")}
                  className="w-full flex items-center gap-2 text-[#6b38d4] text-left cursor-pointer hover:translate-x-1 transition-transform group"
                  aria-label="Ask who is below 80% in Section A"
                >
                  <span className="material-symbols-outlined text-[16px] text-[#6b38d4]/70">history</span>
                  Below 80% attendance (Section A)
                </button>
              </li>
              <li>
                <button 
                  onClick={() => handleSend("Who is on the critical roster for CS501?")}
                  className="w-full flex items-center gap-2 text-[#494454] text-left hover:text-[#6b38d4] cursor-pointer hover:translate-x-1 transition-transform"
                  aria-label="Ask who is on the critical roster for CS501"
                >
                  <span className="material-symbols-outlined text-[16px] text-[#7b7486]">history</span>
                  Roster for CS501
                </button>
              </li>
              <li>
                <button 
                  onClick={() => handleSend("Redirect me to the student check in page")}
                  className="w-full flex items-center gap-2 text-[#494454] text-left hover:text-[#6b38d4] cursor-pointer hover:translate-x-1 transition-transform"
                  aria-label="Ask to redirect to student check in page"
                >
                  <span className="material-symbols-outlined text-[16px] text-[#7b7486]">history</span>
                  Redirect page link
                </button>
              </li>
            </ul>
          </div>
        </aside>

        {/* Main Explorer Interactive Canvas */}
        <section className="lg:col-span-9 space-y-6">
          
          <div className="acrylic-card rounded-3xl p-5 sm:p-6 min-h-[460px] flex flex-col shadow-md">
            
            {/* Chat Messages Log */}
            <div className="flex-1 space-y-5 mb-4 custom-scrollbar overflow-y-auto max-h-[380px] p-1">
              {messages.map((msg) => (
                <div 
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  {/* Sender title bubble heading */}
                  <div className="flex items-center gap-2 space-y-1 mb-1 px-1">
                    {msg.sender === 'assistant' && (
                      <div className="w-5 h-5 bg-[#57dffe]/20 text-[#006172] flex items-center justify-center rounded-md">
                        <span className="material-symbols-outlined text-[14px]">bolt</span>
                      </div>
                    )}
                    <span className="text-[10px] font-sans font-bold tracking-wider text-[#7b7486] uppercase">
                      {msg.sender === 'user' ? 'Lecturer Admin' : 'Alpine'}
                    </span>
                  </div>

                  {/* Main Bubble Card layout */}
                  <div className={`px-4 py-3 rounded-2xl max-w-[85%] font-sans text-sm ${
                    msg.sender === 'user'
                      ? 'bg-[#6b38d4] text-white rounded-tr-none'
                      : 'bg-[#eceef0]/50 text-[#191c1e] rounded-tl-none border border-[#6b38d4]/5'
                  }`}>
                    {msg.text}
                  </div>

                  {/* Action card renderer */}
                  {msg.actionCard && (
                    <div className="mt-3 bg-white border border-[#6b38d4]/15 rounded-2xl overflow-hidden w-full max-w-md shadow-sm">
                      {/* Action Header */}
                      <div className="px-4 py-3 bg-[#f2f4f6] border-b border-[#6b38d4]/10 flex justify-between items-center">
                        <h4 className="text-xs font-sans font-bold text-[#6b38d4] tracking-wider uppercase">
                          {msg.actionCard.title}
                        </h4>
                        <span className="material-symbols-outlined text-[#6b38d4] text-sm group-hover:scale-110 transition-transform">
                          {msg.actionCard.type === 'redirect' ? 'double_arrow' : 'offline_pin'}
                        </span>
                      </div>

                      {/* Action Description */}
                      <div className="p-4 space-y-3">
                        <p className="text-xs text-[#494454] leading-relaxed">
                          {msg.actionCard.description}
                        </p>

                        {/* Rendering list database responses */}
                        {msg.actionCard.type === 'query_result' && Array.isArray(msg.actionCard.data) && (
                          <div className="border border-[#6b38d4]/10 rounded-xl overflow-hidden overflow-x-auto text-xs">
                            <table className="w-full text-left min-w-max">
                              <thead className="bg-[#eceef0]/50 font-sans tracking-wider uppercase font-semibold text-[9px] text-[#7b7486]">
                                <tr>
                                  <th className="px-3 py-2">Student Name</th>
                                  <th className="px-3 py-2">USN</th>
                                  <th className="px-3 py-2 text-right">Attendance</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#eceef0] bg-white">
                                {msg.actionCard.data.map((student: any) => (
                                  <tr key={student.usn} className="hover:bg-[#6b38d4]/5 transition-colors">
                                    <td className="px-3 py-2 font-medium flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-md bg-[#6b38d4]/10 flex items-center justify-center font-display text-[9px] text-[#6b38d4]">
                                        {student.name.substring(0, 2).toUpperCase()}
                                      </div>
                                      {student.name}
                                    </td>
                                    <td className="px-3 py-2 text-[10px] text-[#494454] font-mono">{student.usn}</td>
                                    <td className="px-3 py-2 text-right">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        student.attendanceRate < 75 
                                          ? 'bg-[#ffdad6] text-[#ba1a1a]' 
                                          : 'bg-green-100 text-green-700'
                                      }`}>
                                        {student.attendanceRate}%
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Control buttons inside Card summary */}
                        <div className="flex gap-2 font-sans font-bold text-[10px] uppercase">
                          <button
                            onClick={() => alert("Simulating PDF download... Saved as: Shortage_Roster.pdf")}
                            className="px-3 py-1.5 rounded-lg border border-[#6b38d4]/20 hover:bg-[#6b38d4]/5 text-[#6b38d4] flex items-center gap-1 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span>
                            Export PDF
                          </button>
                          <button
                            onClick={() => alert("Informed all low-attendance students via system dashboard toast notifications.")}
                            className="px-3 py-1.5 rounded-lg bg-[#6b38d4] text-white hover:bg-[#8455ef]/90 flex items-center gap-1 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[14px]">mail</span>
                            Notify Cohort
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              ))}

              {/* Bot loading state */}
              {loading && (
                <div className="flex flex-col items-start space-y-2 mb-2 animate-pulse w-full max-w-md">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-5 h-5 bg-[#57dffe]/30 rounded-md"></div>
                    <div className="h-3 w-16 bg-slate-200 rounded"></div>
                  </div>
                  <div className="bg-[#f2f4f6]/60 p-4 rounded-2xl rounded-tl-sm space-y-2 w-3/4">
                    <div className="h-4 bg-slate-200/60 rounded w-full"></div>
                    <div className="h-4 bg-slate-200/60 rounded w-5/6"></div>
                    <div className="h-4 bg-slate-200/60 rounded w-4/6"></div>
                  </div>
                </div>
              )}

              <div ref={scrollRef} />
            </div>

            {/* Input Send Bar */}
            <div className="relative group mt-auto">
              <div className="absolute inset-0 bg-[#6b38d4]/10 blur-xl group-focus-within:bg-[#6b38d4]/20 transition-all rounded-full pointer-events-none"></div>
              <div className="relative flex items-center bg-white border border-[#6b38d4]/20 rounded-full px-5 py-2.5 focus-within:ring-2 focus-within:ring-[#6b38d4]/20 transition-all">
                <span className="material-symbols-outlined text-[#6b38d4] mr-3">
                  colors_spark
                </span>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask Alpine about Section A student data..."
                  className="w-full bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-sm placeholder:text-[#7b7486]/60 font-sans"
                />
                <button 
                  onClick={() => handleSend()}
                  disabled={loading}
                  className="ml-2 w-10 h-10 bg-[#6b38d4] text-white rounded-full flex items-center justify-center hover:shadow-lg active:scale-90 transition-all cursor-pointer hover:bg-[#8455ef]"
                >
                  <span className="material-symbols-outlined text-md">send</span>
                </button>
              </div>
            </div>

          </div>

          {/* Footer Quick Links Bento Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            <button 
              onClick={() => handleSend("What are the attendance patterns and trends this week?")}
              className="acrylic-card p-4 rounded-xl flex items-center gap-3 hover:bg-[#6b38d4]/5 transition-all cursor-pointer group active:scale-[0.98] border border-[#6b38d4]/10 w-full text-left"
            >
              <div className="p-2.5 rounded-lg bg-[#e9ddff] text-[#6b38d4] group-hover:bg-[#6b38d4] group-hover:text-white transition-colors flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">auto_graph</span>
              </div>
              <div>
                <p className="font-display font-bold text-xs text-[#191c1e]">Weekly Trends</p>
                <p className="text-[10px] text-[#7b7486]">Analyze attendance dip</p>
              </div>
            </button>

            <button 
              onClick={() => handleSend("Show me the student roster")}
              className="acrylic-card p-4 rounded-xl flex items-center gap-3 hover:bg-[#00687a]/5 transition-all cursor-pointer group active:scale-[0.98] border border-[#6b38d4]/10 w-full text-left"
            >
              <div className="p-2.5 rounded-lg bg-[#acedff] text-[#004e5c] group-hover:bg-[#00687a] group-hover:text-white transition-colors flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">groups</span>
              </div>
              <div>
                <p className="font-display font-bold text-xs text-[#191c1e]">Class Roster</p>
                <p className="text-[10px] text-[#7b7486]">Manage student files</p>
              </div>
            </button>

            <button 
              onClick={() => handleSend("Who is on the critical red list in Section A?")}
              className="acrylic-card p-4 rounded-xl flex items-center gap-3 hover:bg-[#ba1a1a]/5 transition-all cursor-pointer group active:scale-[0.98] border border-[#6b38d4]/10 w-full text-left"
            >
              <div className="p-2.5 rounded-lg bg-[#ffdadb] text-[#40000d] group-hover:bg-[#ba1a1a] group-hover:text-white transition-colors flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">report</span>
              </div>
              <div>
                <p className="font-display font-bold text-xs text-[#191c1e]">Red List Alerts</p>
                <p className="text-[10px] text-[#7b7486]">List critical shortage</p>
              </div>
            </button>

          </div>

        </section>

      </div>
    </div>
  );
}
