import React, { useState, useRef, useEffect } from 'react';
import { 
  HeartHandshake, 
  Send, 
  Loader2, 
  AlertCircle,
  ExternalLink,
  User,
  Bot
} from 'lucide-react';
import { sendMessageStream, initializeChat } from './services/geminiService';
import { GroundingChunk, ChatMessage } from './types';
import ReactMarkdown from 'react-markdown';

const App: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-focus input on load
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleStart = async () => {
    if (!inputText.trim()) return;
    
    setHasStarted(true);
    initializeChat(); // Start the chat session
    await handleSend();
  };

  const handleSend = async () => {
    if (!inputText.trim() || isProcessing) return;

    const userMsgId = Date.now().toString();
    const userText = inputText;
    
    // Add User Message
    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      text: userText
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsProcessing(true);
    setError(null);

    // Create placeholder for AI response
    const aiMsgId = (Date.now() + 1).toString();
    const aiMessagePlaceholder: ChatMessage = {
      id: aiMsgId,
      role: 'model',
      text: '',
      isStreaming: true
    };
    
    setMessages(prev => [...prev, aiMessagePlaceholder]);

    try {
      let accumulatedText = '';
      let accumulatedGrounding: GroundingChunk[] = [];

      await sendMessageStream(userText, (chunk, chunks) => {
        accumulatedText += chunk;
        if (chunks) {
          accumulatedGrounding = [...accumulatedGrounding, ...chunks];
        }

        // Update the last message (AI's response) in real-time
        setMessages(prev => prev.map(msg => 
          msg.id === aiMsgId 
            ? { ...msg, text: accumulatedText, groundingChunks: accumulatedGrounding }
            : msg
        ));
      });

      // Finish streaming
      setMessages(prev => prev.map(msg => 
        msg.id === aiMsgId 
          ? { ...msg, isStreaming: false }
          : msg
      ));

    } catch (err: any) {
      console.error("Chat error:", err);
      setError(err.message || "I had trouble connecting. Please try saying that again.");
      // Remove the failed placeholder if empty or mark as error
      setMessages(prev => prev.filter(msg => msg.id !== aiMsgId || msg.text.length > 0));
    } finally {
      setIsProcessing(false);
      // Re-focus input for accessibility
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      hasStarted ? handleSend() : handleStart();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-20 flex items-center gap-4">
          <div className="bg-maple-600 p-3 rounded-xl text-white shadow-md shadow-maple-200">
            <HeartHandshake size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">
              Canadian Ability Grant Advisor
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-1">
              Here to help you get the support you need.
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full p-4 flex flex-col">
        
        {/* Welcome Screen (Only before start) */}
        {!hasStarted && (
          <div className="flex-1 flex flex-col justify-center items-center text-center space-y-10 py-10 animate-in fade-in duration-700">
            <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mb-6 mx-auto">
              <Bot size={48} />
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-800 max-w-2xl mx-auto leading-tight">
              Tell me about your situation.
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto leading-loose">
              I can help you find grants, fix your home, or get funding. 
              I will handle the hard paperwork for you.
            </p>
            
            <div className="w-full max-w-3xl bg-white p-3 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 flex flex-col gap-4">
              <p className="text-[13px] text-slate-500 text-center pt-2 px-4">
                Why does our font look like this? We are using Open Dyslexic font to support all readers.
              </p>
               <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Example: I use a wheelchair and I need a ramp for my front door..."
                className="w-full p-6 text-[19px] bg-transparent border-none focus:ring-0 resize-none min-h-[140px] text-slate-800 placeholder:text-slate-400 leading-loose"
              />
              <button 
                onClick={handleStart}
                disabled={!inputText.trim()}
                className="w-full py-5 bg-maple-600 hover:bg-maple-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center justify-center gap-3 text-xl"
              >
                Start Finding Help <Send size={24} />
              </button>
            </div>
            
            <div className="text-base text-slate-500 space-y-3 max-w-xl bg-slate-100 p-4 rounded-xl">
              <p>I use simple words to talk to you, but expert words for the forms.</p>
              <p className="font-bold text-slate-600">AI can sometimes make mistakes. Please have a support worker or other professional review your documents before submission.</p>
            </div>
          </div>
        )}

        {/* Chat Interface */}
        {hasStarted && (
          <>
            <div className="flex-1 overflow-y-auto space-y-8 pb-4">
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse user-bubble' : 'flex-row'}`}
                >
                  {/* Avatar */}
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 border mt-2 ${msg.role === 'user' ? 'bg-slate-200 border-slate-300 text-slate-600' : 'bg-maple-100 border-maple-200 text-maple-700'}`}>
                    {msg.role === 'user' ? <User size={24} /> : <Bot size={24} />}
                  </div>

                  {/* Bubble */}
                  <div className={`max-w-[85%] rounded-3xl p-6 shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-slate-800 text-white rounded-tr-none' 
                      : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'
                  }`}>
                    {/* 
                        Use custom CSS class 'dyslexia-mode' instead of 'prose' 
                        to strictly control list styling 
                    */}
                    <div className="dyslexia-mode text-[19px] leading-loose">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>

                    {/* Sources / Grounding */}
                    {msg.groundingChunks && msg.groundingChunks.length > 0 && (
                      <div className="mt-6 pt-4 border-t border-slate-100">
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Sources Found:</p>
                        <div className="flex flex-wrap gap-3">
                          {msg.groundingChunks.map((chunk, idx) => {
                             if (chunk.web?.uri) {
                               return (
                                 <a 
                                  key={idx}
                                  href={chunk.web.uri}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 text-sm bg-slate-50 text-blue-700 px-3 py-2 rounded-lg border border-slate-200 hover:bg-blue-50 transition-colors font-bold"
                                 >
                                  <ExternalLink size={14} />
                                  <span className="max-w-[200px] truncate">{chunk.web.title || "Source"}</span>
                                 </a>
                               )
                             }
                             return null;
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {isProcessing && messages[messages.length - 1]?.role === 'user' && (
                <div className="flex gap-4">
                   <div className="w-12 h-12 rounded-full bg-maple-100 flex items-center justify-center shrink-0 border border-maple-200 text-maple-700 mt-2">
                    <Loader2 className="animate-spin" size={24} />
                  </div>
                  <div className="bg-transparent p-6 text-slate-500 italic animate-pulse text-lg">
                    Searching and thinking...
                  </div>
                </div>
              )}
              
              {error && (
                 <div className="flex justify-center my-6">
                    <div className="bg-red-50 text-red-800 px-6 py-4 rounded-xl flex items-center gap-3 text-lg border border-red-200 font-bold">
                      <AlertCircle size={24} />
                      {error}
                    </div>
                 </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="sticky bottom-0 bg-slate-50 pt-2 pb-6">
              <p className="text-[13px] text-slate-500 text-center mb-2 px-4">
                Why does our font look like this? We are using Open Dyslexic font to support all readers.
              </p>
              <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200 p-3 flex items-end gap-3">
                <textarea
                  ref={inputRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your answer here..."
                  className="flex-1 p-4 bg-transparent border-none focus:ring-0 resize-none max-h-[180px] min-h-[64px] text-[19px] text-slate-800 placeholder:text-slate-400 leading-loose"
                  disabled={isProcessing}
                />
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim() || isProcessing}
                  className="mb-1 p-4 bg-maple-600 hover:bg-maple-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl transition-all shadow-md shadow-maple-100"
                >
                  <Send size={24} />
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default App;