import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  HeartHandshake,
  Send,
  Loader2,
  AlertCircle,
  ExternalLink,
  User,
  Bot,
  RotateCcw,
  Download,
  Copy,
  Mail,
  ChevronDown,
  ChevronRight,
  FileText,
  Check
} from 'lucide-react';
import { sendMessageStream, initializeChat } from './services/geminiService';
import { GroundingChunk, ChatMessage, QuickOption } from './types';

// Interface for multi-question answers
interface QuestionAnswer {
  questionId: string;
  questionText: string;
  answer: 'yes' | 'no' | null;
}
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

const MAX_INPUT_LENGTH = 2000;
const MIN_MESSAGE_INTERVAL = 1000; // 1 second between messages

// Define Markdown components outside the render loop to prevent re-renders
const MARKDOWN_COMPONENTS: Components = {
  a: ({node, ...props}) => (
    <a {...props} target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800" />
  ),
  ul: ({node, ...props}) => <ul {...props} className="list-disc pl-4 mb-4 space-y-2" />,
  ol: ({node, ...props}) => <ol {...props} className="list-decimal pl-4 mb-4 space-y-2" />,
  li: ({node, ...props}) => <li {...props} className="pl-1" />,
  p: ({node, ...props}) => <p {...props} className="mb-4 last:mb-0" />,
  h1: ({node, ...props}) => <h1 {...props} className="text-2xl font-bold mb-4 mt-6 text-slate-800" />,
  h2: ({node, ...props}) => <h2 {...props} className="text-xl font-bold mb-3 mt-5 text-slate-800" />,
  h3: ({node, ...props}) => <h3 {...props} className="text-lg font-bold mb-2 mt-4 text-slate-800" />,
  blockquote: ({node, ...props}) => <blockquote {...props} className="border-l-4 border-slate-300 pl-4 py-1 my-4 text-slate-600 italic" />,
};

const App: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMessageTime, setLastMessageTime] = useState(0);
  const [isInitializing, setIsInitializing] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [multiAnswers, setMultiAnswers] = useState<Record<string, QuestionAnswer[]>>({});
  const shareMenuRef = useRef<HTMLDivElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isMountedRef = useRef(true);
  const messageCounterRef = useRef(0);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    // Small timeout ensures the DOM has actually updated with new content height
    setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-focus input on load
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-resize textarea logic
  const adjustTextareaHeight = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`; // Cap at 200px
  };

  useEffect(() => {
    if (inputRef.current) {
        adjustTextareaHeight(inputRef.current);
    }
  }, [inputText]);

  // Load conversation from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('chat-history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          setHasStarted(true);
        }
      } catch (e) {
        console.error('Failed to load chat history:', e);
      }
    }
  }, []);

  // Save conversation to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('chat-history', JSON.stringify(messages));
    }
  }, [messages]);

  // Close share menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(event.target as Node)) {
        setShowShareMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Parse numbered options from AI text
  const parseOptionsFromText = useCallback((text: string): QuickOption[] => {
    const options: QuickOption[] = [];
    // Match patterns like "1. Option text" or "Option 1: text" or "**1. Option**"
    const lines = text.split('\n');

    for (const line of lines) {
      // Match "1. ", "2. ", etc. at start of line (with optional ** for bold)
      const match = line.match(/^\s*\*?\*?(\d+)[.):\s]+\*?\*?\s*(.+?)(?:\*?\*?\s*[-–:]|$)/);
      if (match) {
        const num = match[1];
        let label = match[2].trim();
        // Clean up any trailing markdown or punctuation
        label = label.replace(/\*\*/g, '').replace(/\s*[-–:]\s*$/, '').trim();
        if (label && label.length > 2 && label.length < 100) {
          options.push({
            id: `opt-${num}`,
            label: label,
            value: `${num}. ${label}`
          });
        }
      }
    }
    return options.slice(0, 6); // Max 6 options
  }, []);

  // Parse multi-part questions that need Yes/No answers
  const parseMultiQuestions = useCallback((text: string): QuestionAnswer[] => {
    const questions: QuestionAnswer[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      // Match numbered questions ending with "?"
      const match = line.match(/^\s*\*?\*?(\d+)[.):\s]+\*?\*?\s*(.+\?)\s*$/);
      if (match) {
        const num = match[1];
        let questionText = match[2].trim();
        questionText = questionText.replace(/\*\*/g, '').trim();
        if (questionText.length > 5) {
          questions.push({
            questionId: `q-${num}`,
            questionText: questionText,
            answer: null
          });
        }
      }
    }
    return questions.slice(0, 10); // Max 10 questions
  }, []);

  // Check if message contains multiple questions requiring individual answers
  const hasMultipleQuestions = useCallback((text: string): boolean => {
    const questions = parseMultiQuestions(text);
    return questions.length >= 2;
  }, [parseMultiQuestions]);

  // Toggle message expansion
  const toggleMessageExpansion = useCallback((msgId: string) => {
    setExpandedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(msgId)) {
        newSet.delete(msgId);
      } else {
        newSet.add(msgId);
      }
      return newSet;
    });
  }, []);

  // Handle radio button change for multi-question answers
  const handleMultiAnswerChange = useCallback((msgId: string, questionId: string, answer: 'yes' | 'no') => {
    setMultiAnswers(prev => {
      const currentAnswers = prev[msgId] || [];
      const existingIndex = currentAnswers.findIndex(a => a.questionId === questionId);

      if (existingIndex >= 0) {
        const updated = [...currentAnswers];
        updated[existingIndex] = { ...updated[existingIndex], answer };
        return { ...prev, [msgId]: updated };
      } else {
        return { ...prev, [msgId]: [...currentAnswers, { questionId, questionText: '', answer }] };
      }
    });
  }, []);

  // Submit all multi-question answers
  const handleSubmitMultiAnswers = useCallback((msgId: string, questions: QuestionAnswer[]) => {
    const answers = multiAnswers[msgId] || [];

    // Build response text from answers
    const responseLines = questions.map((q, idx) => {
      const answer = answers.find(a => a.questionId === q.questionId);
      const answerText = answer?.answer === 'yes' ? 'Yes' : answer?.answer === 'no' ? 'No' : 'Not answered';
      return `${idx + 1}. ${q.questionText} - ${answerText}`;
    });

    const responseText = responseLines.join('\n');

    // Clear the multi-answers for this message
    setMultiAnswers(prev => {
      const updated = { ...prev };
      delete updated[msgId];
      return updated;
    });

    // Send the combined response
    handleSendWithText(responseText);
  }, [multiAnswers]);

  // Check if all questions are answered for a message
  const areAllQuestionsAnswered = useCallback((msgId: string, questions: QuestionAnswer[]): boolean => {
    const answers = multiAnswers[msgId] || [];
    return questions.every(q => answers.some(a => a.questionId === q.questionId && a.answer !== null));
  }, [multiAnswers]);

  // Generate contextual quick replies based on last AI message
  const getQuickReplies = useCallback((): QuickOption[] => {
    if (messages.length === 0 || isProcessing) return [];

    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'model' || lastMsg.isStreaming) return [];

    const text = lastMsg.text.toLowerCase();
    const replies: QuickOption[] = [];

    // Check if it's a yes/no question
    if (text.includes('?') && (
      text.includes('do you') ||
      text.includes('does it') ||
      text.includes('is it') ||
      text.includes('are you') ||
      text.includes('can you') ||
      text.includes('would you') ||
      text.includes('have you')
    )) {
      replies.push({ id: 'yes', label: 'Yes', value: 'Yes' });
      replies.push({ id: 'no', label: 'No', value: 'No' });
    }

    // Check if asking for a choice
    if (text.includes('which one') || text.includes('which program') || text.includes('which grant')) {
      // Options should be parsed from the text itself
    }

    // Add general helpful replies
    if (text.includes('?')) {
      replies.push({ id: 'more', label: 'Tell me more', value: 'Can you tell me more about that?' });
    }

    if (text.includes('form') || text.includes('application') || text.includes('grant')) {
      replies.push({ id: 'help', label: 'I need help understanding', value: 'I need help understanding this. Can you explain it in simpler terms?' });
    }

    return replies.slice(0, 4); // Max 4 quick replies
  }, [messages, isProcessing]);

  // Handle clicking an option
  const handleOptionClick = useCallback((option: QuickOption) => {
    if (isProcessing) return;
    setInputText(option.value);
    // Auto-send after a brief delay so user sees what was selected
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 50);
  }, [isProcessing]);

  // Handle quick reply click (sends immediately)
  const handleQuickReplyClick = useCallback(async (option: QuickOption) => {
    if (isProcessing) return;
    setInputText(option.value);
    // Need to trigger send after state update
    setTimeout(async () => {
      const submitEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      handleSendWithText(option.value);
    }, 50);
  }, [isProcessing]);

  // Helper to send a specific text
  const handleSendWithText = async (text: string) => {
    if (!text.trim() || isProcessing) return;

    const now = Date.now();
    if (now - lastMessageTime < MIN_MESSAGE_INTERVAL) return;
    setLastMessageTime(now);

    const msgId = messageCounterRef.current++;
    const userMsgId = `user-${msgId}-${now}`;
    const aiMsgId = `ai-${msgId}-${now}`;

    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      text: text
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsProcessing(true);
    setError(null);

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

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

      await sendMessageStream(text, (chunk, chunks) => {
        if (!isMountedRef.current) return;

        accumulatedText += chunk;
        if (chunks) {
          accumulatedGrounding = [...accumulatedGrounding, ...chunks];
        }

        setMessages(prev => prev.map(msg =>
          msg.id === aiMsgId
            ? { ...msg, text: accumulatedText, groundingChunks: accumulatedGrounding }
            : msg
        ));
      });

      if (!isMountedRef.current) return;

      setMessages(prev => prev.map(msg =>
        msg.id === aiMsgId
          ? { ...msg, isStreaming: false }
          : msg
      ));

    } catch (err: any) {
      if (!isMountedRef.current) return;

      console.error("Chat error:", err);
      const errorMessage = err.message || "I had trouble connecting. Please try saying that again.";
      setError(errorMessage);

      setMessages(prev => prev.map(msg =>
        msg.id === aiMsgId
          ? {
            ...msg,
            isStreaming: false,
            hasError: true,
            text: msg.text || "Sorry, I encountered an error. Please try again."
          }
          : msg
      ));
    } finally {
      if (isMountedRef.current) {
        setIsProcessing(false);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  };

  const handleStart = async () => {
    if (!inputText.trim() || isInitializing) return;
    
    setHasStarted(true);
    setIsInitializing(true);
    
    try {
      await initializeChat();
      if (!isMountedRef.current) return;
      await handleSend();
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error("Initialization error:", err);
      setError("Failed to start chat. Please refresh and try again.");
    } finally {
      if (isMountedRef.current) {
        setIsInitializing(false);
      }
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || isProcessing) return;

    // Rate limiting
    const now = Date.now();
    if (now - lastMessageTime < MIN_MESSAGE_INTERVAL) {
      return;
    }
    setLastMessageTime(now);

    // Generate unique IDs
    const msgId = messageCounterRef.current++;
    const userMsgId = `user-${msgId}-${now}`;
    const aiMsgId = `ai-${msgId}-${now}`;
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

    // Reset textarea height immediately
    if (inputRef.current) {
        inputRef.current.style.height = 'auto';
    }

    // Create placeholder for AI response
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
        if (!isMountedRef.current) return;
        
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

      if (!isMountedRef.current) return;

      // Finish streaming
      setMessages(prev => prev.map(msg => 
        msg.id === aiMsgId 
          ? { ...msg, isStreaming: false }
          : msg
      ));

    } catch (err: any) {
      if (!isMountedRef.current) return;
      
      console.error("Chat error:", err);
      const errorMessage = err.message || "I had trouble connecting. Please try saying that again.";
      setError(errorMessage);
      
      // Mark the AI message as having an error
      setMessages(prev => prev.map(msg => 
        msg.id === aiMsgId 
          ? { 
              ...msg, 
              isStreaming: false, 
              hasError: true,
              text: msg.text || "Sorry, I encountered an error. Please try again."
            }
          : msg
      ));
    } finally {
      if (isMountedRef.current) {
        setIsProcessing(false);
        // Re-focus input for accessibility
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  };

  const handleRetry = (messageId: string) => {
    const msgIndex = messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;
    
    const msg = messages[msgIndex];
    if (msg.role === 'user') {
      // Remove this message and all subsequent messages
      setMessages(prev => prev.slice(0, msgIndex));
      setInputText(msg.text);
      setError(null);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= MAX_INPUT_LENGTH) {
      setInputText(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      hasStarted ? handleSend() : handleStart();
    }
  };

  const clearConversation = () => {
    if (window.confirm('Are you sure you want to clear this conversation?')) {
      setMessages([]);
      setHasStarted(false);
      setError(null);
      localStorage.removeItem('chat-history');
      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
    }
  };

  // Format conversation for export
  const formatConversation = useCallback(() => {
    return messages.map(m =>
      `${m.role === 'user' ? 'You' : 'Advisor'}: ${m.text}\n${
        Array.isArray(m.groundingChunks) && m.groundingChunks.length ? `\nSources: ${m.groundingChunks.map(c => c.web?.uri).filter(Boolean).join(', ')}\n` : ''
      }`
    ).join('\n---\n\n');
  }, [messages]);

  const exportConversation = () => {
    const text = formatConversation();

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grant-conversation-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowShareMenu(false);
  };

  const copyToClipboard = async () => {
    const text = formatConversation();
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
    setShowShareMenu(false);
  };

  const shareViaEmail = () => {
    const subject = encodeURIComponent('My Grant Application Summary - Canadian Ability Grant Advisor');
    const body = encodeURIComponent(formatConversation());
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    setShowShareMenu(false);
  };

  const exportAsPDF = () => {
    // Create a printable version
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow pop-ups to download as PDF');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Grant Conversation - ${new Date().toLocaleDateString()}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; }
          h1 { color: #1e293b; border-bottom: 2px solid #e11d48; padding-bottom: 10px; }
          .message { margin: 20px 0; padding: 15px; border-radius: 8px; }
          .user { background: #f1f5f9; border-left: 4px solid #64748b; }
          .advisor { background: #fff1f2; border-left: 4px solid #e11d48; }
          .role { font-weight: bold; margin-bottom: 8px; color: #475569; }
          .sources { font-size: 12px; color: #64748b; margin-top: 10px; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <h1>Canadian Ability Grant Advisor</h1>
        <p style="color: #64748b;">Conversation from ${new Date().toLocaleDateString()}</p>
        ${messages.map(m => `
          <div class="message ${m.role === 'user' ? 'user' : 'advisor'}">
            <div class="role">${m.role === 'user' ? 'You' : 'Advisor'}</div>
            <div>${m.text.replace(/\n/g, '<br>')}</div>
            ${Array.isArray(m.groundingChunks) && m.groundingChunks.length ? `
              <div class="sources">Sources: ${m.groundingChunks.map(c => c.web?.uri).filter(Boolean).join(', ')}</div>
            ` : ''}
          </div>
        `).join('')}
        <div class="footer">
          Generated by Canadian Ability Grant Advisor<br>
          Please review this document with a support worker or professional before submitting any applications.
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
    setShowShareMenu(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-20 flex items-center gap-4">
          <div className="bg-maple-600 p-3 rounded-xl text-white shadow-md shadow-maple-200">
            <HeartHandshake size={32} />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">
              Canadian Ability Grant Advisor
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-1">
              Here to help you get the support you need.
            </p>
          </div>
          {hasStarted && (
            <div className="flex gap-2 items-center">
              {/* Share Dropdown */}
              <div className="relative" ref={shareMenuRef}>
                <button
                  onClick={() => setShowShareMenu(!showShareMenu)}
                  disabled={messages.length === 0}
                  className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  aria-label="Share conversation"
                  aria-expanded={showShareMenu}
                >
                  Share
                  <ChevronDown size={16} className={`transition-transform ${showShareMenu ? 'rotate-180' : ''}`} />
                </button>

                {showShareMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50">
                    <button
                      onClick={copyToClipboard}
                      className="w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                    >
                      {copySuccess ? <Check size={18} className="text-green-600" /> : <Copy size={18} />}
                      {copySuccess ? 'Copied!' : 'Copy to Clipboard'}
                    </button>
                    <button
                      onClick={shareViaEmail}
                      className="w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                    >
                      <Mail size={18} />
                      Email to Professional
                    </button>
                    <div className="border-t border-slate-100 my-1" />
                    <button
                      onClick={exportConversation}
                      className="w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                    >
                      <FileText size={18} />
                      Download as Text (.txt)
                    </button>
                    <button
                      onClick={exportAsPDF}
                      className="w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                    >
                      <Download size={18} />
                      Download as PDF
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={clearConversation}
                className="px-3 py-2 text-sm text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                aria-label="Clear conversation"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </header>

      <main className={`flex-1 w-full p-4 flex flex-col ${hasStarted ? 'max-w-7xl' : 'max-w-4xl'} mx-auto`}>
        
        {/* Welcome Screen (Only before start) */}
        {!hasStarted && (
          <div className="flex-1 flex flex-col justify-center items-center text-center space-y-10 py-10 animate-in fade-in duration-700">
            <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mb-6 mx-auto">
              <Bot size={48} />
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-800 max-w-2xl mx-auto leading-tight">
              Tell me about your situation.
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
              I can help you find grants, fix your home, or get funding. 
              I will handle the hard paperwork for you.
            </p>
            
            <div className="w-full max-w-3xl bg-white p-3 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 flex flex-col gap-4">
               <textarea
                ref={inputRef}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Example: I use a wheelchair and I need a ramp for my front door..."
                className="w-full p-6 text-lg bg-transparent border-none focus:ring-0 resize-none min-h-[140px] text-slate-800 placeholder:text-slate-400 leading-relaxed overflow-hidden"
                aria-label="Your question about grants and support"
                aria-describedby="input-hint character-count"
                maxLength={MAX_INPUT_LENGTH}
              />
              <div className="flex items-center justify-between px-2">
                <span 
                  id="character-count" 
                  className="text-sm text-slate-400"
                  aria-live="polite"
                >
                  {inputText.length} / {MAX_INPUT_LENGTH}
                </span>
                <span id="input-hint" className="text-sm text-slate-400">
                  Press Enter to send
                </span>
              </div>
              <button 
                onClick={handleStart}
                disabled={!inputText.trim() || isInitializing}
                className="w-full py-5 bg-maple-600 hover:bg-maple-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center justify-center gap-3 text-xl"
                aria-label="Start finding help"
              >
                {isInitializing ? (
                  <>
                    <Loader2 className="animate-spin" size={24} />
                    Starting...
                  </>
                ) : (
                  <>
                    Start Finding Help <Send size={24} />
                  </>
                )}
              </button>
            </div>
            
            <div className="text-base text-slate-500 space-y-3 max-w-xl bg-slate-100 p-4 rounded-xl">
              <p>I use simple words to talk to you, but expert words for the forms.</p>
              <p className="font-bold text-slate-600">AI can sometimes make mistakes. Please have a support worker or other professional review your documents before submission.</p>
            </div>
          </div>
        )}

        {/* Chat Interface - Split View */}
        {hasStarted && (
          <>
            <div className="flex-1 flex gap-4 overflow-hidden pb-4 split-view-container">
              {/* Left Column - Your Messages */}
              <div className="w-1/2 flex flex-col bg-slate-100 rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-200 px-4 py-3 border-b border-slate-300">
                  <div className="flex items-center gap-2">
                    <User size={20} className="text-slate-600" />
                    <h2 className="font-bold text-slate-700">Your Messages</h2>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.filter(m => m.role === 'user').map((msg) => (
                    <div key={msg.id} className="user-bubble">
                      <div className="bg-slate-800 text-white rounded-2xl rounded-tr-none p-4 shadow-sm">
                        <div className="dyslexia-mode text-base leading-relaxed">
                          <ReactMarkdown components={MARKDOWN_COMPONENTS}>
                            {msg.text}
                          </ReactMarkdown>
                        </div>
                        <button
                          onClick={() => handleRetry(msg.id)}
                          className="mt-3 text-sm text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
                          aria-label="Edit and resend this message"
                        >
                          <RotateCcw size={12} />
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                  {messages.filter(m => m.role === 'user').length === 0 && (
                    <div className="text-center text-slate-400 py-8">
                      <User size={32} className="mx-auto mb-2 opacity-50" />
                      <p>Your messages will appear here</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column - Advisor Responses */}
              <div className="w-1/2 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-maple-50 px-4 py-3 border-b border-maple-100">
                  <div className="flex items-center gap-2">
                    <Bot size={20} className="text-maple-600" />
                    <h2 className="font-bold text-maple-700">Advisor Responses</h2>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {(() => {
                    const modelMessages = messages.filter(m => m.role === 'model');
                    const lastMsgId = modelMessages[modelMessages.length - 1]?.id;

                    return modelMessages.map((msg, index) => {
                      const isLatest = msg.id === lastMsgId;
                      const isExpanded = isLatest || expandedMessages.has(msg.id);
                      const multiQuestions = parseMultiQuestions(msg.text);
                      const hasMultiQ = multiQuestions.length >= 2 && !msg.isStreaming && !msg.hasError;

                      return (
                        <div
                          key={msg.id}
                          className={`rounded-2xl shadow-sm overflow-hidden transition-all ${
                            msg.hasError
                              ? 'bg-red-50 border border-red-200'
                              : isLatest
                              ? 'bg-blue-50 border-2 border-blue-300'
                              : 'bg-slate-50 border border-slate-200'
                          }`}
                        >
                          {/* Collapsible Header for non-latest messages */}
                          {!isLatest && (
                            <button
                              onClick={() => toggleMessageExpansion(msg.id)}
                              className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-100 transition-colors"
                            >
                              <span className="text-sm font-medium text-slate-600 truncate flex-1 text-left">
                                {msg.text.substring(0, 60)}...
                              </span>
                              {isExpanded ? (
                                <ChevronDown size={18} className="text-slate-400 shrink-0 ml-2" />
                              ) : (
                                <ChevronRight size={18} className="text-slate-400 shrink-0 ml-2" />
                              )}
                            </button>
                          )}

                          {/* Latest message label */}
                          {isLatest && (
                            <div className="px-4 py-2 bg-blue-100 border-b border-blue-200">
                              <span className="text-sm font-bold text-blue-700">Current Question</span>
                            </div>
                          )}

                          {/* Expandable Content */}
                          {isExpanded && (
                            <div className="p-4">
                              <div className="dyslexia-mode text-base leading-relaxed text-slate-800">
                                <ReactMarkdown components={MARKDOWN_COMPONENTS}>
                                  {msg.text}
                                </ReactMarkdown>
                              </div>

                              {/* Multi-Question Radio Buttons UI */}
                              {hasMultiQ && isLatest && (
                                <div className="mt-4 pt-4 border-t border-blue-200">
                                  <p className="text-sm font-bold text-blue-700 mb-4">Please answer each question:</p>
                                  <div className="space-y-4">
                                    {multiQuestions.map((q, qIdx) => {
                                      const currentAnswers = multiAnswers[msg.id] || [];
                                      const currentAnswer = currentAnswers.find(a => a.questionId === q.questionId)?.answer;

                                      return (
                                        <div key={q.questionId} className="bg-white rounded-xl p-4 border border-slate-200">
                                          <p className="text-base font-medium text-slate-800 mb-3">
                                            {qIdx + 1}. {q.questionText}
                                          </p>
                                          <div className="flex gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                              <input
                                                type="radio"
                                                name={`${msg.id}-${q.questionId}`}
                                                checked={currentAnswer === 'yes'}
                                                onChange={() => handleMultiAnswerChange(msg.id, q.questionId, 'yes')}
                                                disabled={isProcessing}
                                                className="w-5 h-5 text-green-600 border-2 border-slate-300 focus:ring-green-500"
                                              />
                                              <span className="text-base font-medium text-green-700">Yes</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                              <input
                                                type="radio"
                                                name={`${msg.id}-${q.questionId}`}
                                                checked={currentAnswer === 'no'}
                                                onChange={() => handleMultiAnswerChange(msg.id, q.questionId, 'no')}
                                                disabled={isProcessing}
                                                className="w-5 h-5 text-red-600 border-2 border-slate-300 focus:ring-red-500"
                                              />
                                              <span className="text-base font-medium text-red-700">No</span>
                                            </label>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Submit All Answers Button */}
                                  <button
                                    onClick={() => handleSubmitMultiAnswers(msg.id, multiQuestions)}
                                    disabled={!areAllQuestionsAnswered(msg.id, multiQuestions) || isProcessing}
                                    className="mt-4 w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                                  >
                                    {isProcessing ? (
                                      <>
                                        <Loader2 className="animate-spin" size={20} />
                                        Submitting...
                                      </>
                                    ) : (
                                      <>
                                        <Check size={20} />
                                        Submit All Answers
                                      </>
                                    )}
                                  </button>

                                  {!areAllQuestionsAnswered(msg.id, multiQuestions) && (
                                    <p className="text-sm text-slate-500 text-center mt-2">
                                      Please answer all questions above to continue
                                    </p>
                                  )}
                                </div>
                              )}

                              {/* Single-choice Options (when not multi-question) */}
                              {!hasMultiQ && !msg.isStreaming && !msg.hasError && (() => {
                                const options = parseOptionsFromText(msg.text);
                                if (options.length > 0 && isLatest) {
                                  return (
                                    <div className="mt-4 pt-4 border-t border-slate-200">
                                      <p className="text-sm font-bold text-slate-500 mb-3">Click to select:</p>
                                      <div className="flex flex-wrap gap-2">
                                        {options.map((opt) => (
                                          <button
                                            key={opt.id}
                                            onClick={() => handleOptionClick(opt)}
                                            disabled={isProcessing}
                                            className="px-3 py-2 bg-blue-50 hover:bg-blue-100 border-2 border-blue-200 hover:border-blue-400 text-blue-800 rounded-lg transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed text-left"
                                          >
                                            {opt.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              })()}

                              {/* Error retry button */}
                              {msg.hasError && (
                                <div className="mt-4 flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      const msgIndex = messages.findIndex(m => m.id === msg.id);
                                      const userMsgIndex = msgIndex - 1;
                                      if (userMsgIndex >= 0) {
                                        handleRetry(messages[userMsgIndex].id);
                                      }
                                    }}
                                    className="flex items-center gap-2 text-sm bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200 transition-colors font-bold"
                                  >
                                    <RotateCcw size={14} />
                                    Try Again
                                  </button>
                                </div>
                              )}

                              {/* Sources */}
                              {Array.isArray(msg.groundingChunks) && msg.groundingChunks.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-slate-200">
                                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Sources:</p>
                                  <div className="flex flex-wrap gap-2">
                                    {Array.from(new Set(msg.groundingChunks.map(c => c.web?.uri).filter(Boolean))).map((uri, idx) => {
                                      const chunk = msg.groundingChunks?.find(c => c.web?.uri === uri);
                                      return (
                                        <a
                                          key={idx}
                                          href={uri}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-xs bg-white text-blue-700 px-2 py-1 rounded border border-slate-200 hover:bg-blue-50 transition-colors font-medium"
                                        >
                                          <ExternalLink size={12} />
                                          <span className="max-w-[150px] truncate">{chunk?.web?.title || "Source"}</span>
                                        </a>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}

                  {/* Loading state */}
                  {isProcessing && messages[messages.length - 1]?.role === 'user' && (
                    <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                      <Loader2 className="animate-spin text-maple-600" size={24} />
                      <span className="text-slate-500 italic animate-pulse">Searching and thinking...</span>
                    </div>
                  )}

                  {messages.filter(m => m.role === 'model').length === 0 && !isProcessing && (
                    <div className="text-center text-slate-400 py-8">
                      <Bot size={32} className="mx-auto mb-2 opacity-50" />
                      <p>Advisor responses will appear here</p>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </div>
            </div>

            {/* Error banner */}
            {error && (
              <div className="flex justify-center my-4">
                <div className="bg-red-50 text-red-800 px-6 py-4 rounded-xl flex items-center gap-3 text-lg border border-red-200 font-bold">
                  <AlertCircle size={24} />
                  {error}
                </div>
              </div>
            )}

            {/* Input Area */}
            <div className="bg-slate-50 pt-4 pb-2">
              {/* Quick Reply Buttons */}
              {(() => {
                const quickReplies = getQuickReplies();
                if (quickReplies.length > 0) {
                  return (
                    <div className="mb-3 flex flex-wrap gap-2 justify-center">
                      {quickReplies.map((reply) => (
                        <button
                          key={reply.id}
                          onClick={() => handleQuickReplyClick(reply)}
                          disabled={isProcessing}
                          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 hover:border-slate-400 text-slate-700 rounded-full transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {reply.label}
                        </button>
                      ))}
                    </div>
                  );
                }
                return null;
              })()}

              <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200 p-3 flex items-end gap-3">
                <div className="flex-1">
                  <textarea
                    ref={inputRef}
                    value={inputText}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your answer here..."
                    className="w-full p-4 bg-transparent border-none focus:ring-0 resize-none max-h-[180px] min-h-[64px] text-lg text-slate-800 placeholder:text-slate-400 leading-relaxed overflow-hidden"
                    disabled={isProcessing}
                    aria-label="Your message"
                    aria-describedby="chat-input-hint"
                    maxLength={MAX_INPUT_LENGTH}
                    style={{ fontSize: 'max(16px, 1rem)' }} // Prevent iOS zoom
                  />
                  <div className="flex items-center justify-between px-4 pb-2">
                    <span
                      className="text-xs text-slate-400"
                      aria-live="polite"
                    >
                      {inputText.length} / {MAX_INPUT_LENGTH}
                    </span>
                    <span id="chat-input-hint" className="text-xs text-slate-400">
                      Shift+Enter for new line
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim() || isProcessing}
                  className="mb-1 p-4 bg-maple-600 hover:bg-maple-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl transition-all shadow-md shadow-maple-100"
                  aria-label="Send message"
                >
                  {isProcessing ? <Loader2 className="animate-spin" size={24} /> : <Send size={24} />}
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