import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MessageCircle, Send, User, Star, Loader2, Download, BookOpen } from 'lucide-react';
import Navigation from '@/components/Navigation';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import ChartSelector from '@/components/ChartSelector';
import html2pdf from 'html2pdf.js';
import { getChatResponse } from '@/services/chatService';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  isStreaming?: boolean;
}

const Chat = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hello! I'm your AstroMatch AI assistant. How can I help you with your astrological chart or relationship compatibility questions?",
      sender: 'ai',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState<any>(null);
  const [dashaData, setDashaData] = useState<any>(null);
  const [selectedChartType, setSelectedChartType] = useState('D1');
  const [divisionalCharts, setDivisionalCharts] = useState<Record<string, any>>({});
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchChatHistory = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });
          
        if (error) {
          console.error('Error fetching chat history:', error);
          return;
        }
        
        if (data && data.length > 0) {
          const formattedMessages: Message[] = data.map(msg => ({
            id: msg.id,
            text: msg.message,
            sender: msg.is_from_ai ? 'ai' : 'user',
            timestamp: new Date(msg.created_at)
          }));
          
          setMessages([messages[0], ...formattedMessages]);
        }
      } catch (error) {
        console.error('Error fetching chat history:', error);
      }
    };
    
    fetchChatHistory();
  }, [user]);

  useEffect(() => {
    const fetchUserChartData = async () => {
      if (!user) return;
      
      try {
        const { data: birthChartData, error: birthChartError } = await supabase
          .from('saved_charts')
          .select('*')
          .eq('user_id', user.id)
          .eq('chart_type', 'birth_chart')
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (birthChartError) {
          console.error('Error fetching user chart data:', birthChartError);
          return;
        }
        
        if (birthChartData && birthChartData.length > 0) {
          setChartData(birthChartData[0].chart_data);
        }
        
        const { data: dashaChartData, error: dashaChartError } = await supabase
          .from('saved_charts')
          .select('*')
          .eq('user_id', user.id)
          .eq('chart_type', 'dasha_chart')
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (dashaChartError) {
          console.error('Error fetching user dasha data:', dashaChartError);
          return;
        }
        
        if (dashaChartData && dashaChartData.length > 0) {
          setDashaData(dashaChartData[0].chart_data);
        }
        
        const { data: allCharts, error: allChartsError } = await supabase
          .from('saved_charts')
          .select('*')
          .eq('user_id', user.id)
          .ilike('chart_type', '%_chart')
          .order('created_at', { ascending: false });
          
        if (allChartsError) {
          console.error('Error fetching divisional charts:', allChartsError);
          return;
        }
        
        if (allCharts && allCharts.length > 0) {
          const chartsData: Record<string, any> = {};
          
          allCharts.forEach(chart => {
            const chartTypeMatch = chart.chart_type.match(/^([^_]+)/);
            if (chartTypeMatch) {
              const chartType = chartTypeMatch[1].toUpperCase();
              chartsData[chartType] = chart.chart_data;
            }
          });
          
          setDivisionalCharts(chartsData);
        }
      } catch (error) {
        console.error('Error fetching user chart data:', error);
      }
    };
    
    fetchUserChartData();
  }, [user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const saveMessage = async (message: string, isFromAI: boolean) => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          user_id: user.id,
          message,
          is_from_ai: isFromAI
        });
        
      if (error) {
        console.error('Error saving message:', error);
      }
    } catch (error) {
      console.error('Error saving message:', error);
    }
  };

  const handleSend = async () => {
    if (input.trim() === '' || loading) return;
    
    setLoading(true);
    
    const userMessage: Message = {
      id: Date.now().toString(),
      text: input,
      sender: 'user',
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    await saveMessage(input, false);
    
    setInput('');
    
    try {
      console.log('Creating AI message with streaming');
      const aiMessageId = (Date.now() + 1).toString();
      
      const aiMessage: Message = {
        id: aiMessageId,
        text: '',
        sender: 'ai',
        timestamp: new Date(),
        isStreaming: true
      };
      
      setMessages(prev => [...prev, aiMessage]);
      
      const handleStreamChunk = (chunk: string) => {
        console.log('Received chunk:', chunk);
        setMessages(prev => prev.map(msg => 
          msg.id === aiMessageId 
            ? { ...msg, text: msg.text + chunk } 
            : msg
        ));
        
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
      };
      
      const fullResponse = await getChatResponse(input, handleStreamChunk);
      console.log('Full response received:', fullResponse);
      
      setMessages(prev => prev.map(msg => 
        msg.id === aiMessageId 
          ? { ...msg, isStreaming: false } 
          : msg
      ));
      
      await saveMessage(fullResponse, true);
    } catch (error) {
      console.error('Error calling AI function:', error);
      setMessages(prev => prev.filter(msg => !(msg.sender === 'ai' && msg.isStreaming)));
      
      toast({
        title: "Error",
        description: "Failed to generate a response. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleChartTypeChange = (chartType: string) => {
    setSelectedChartType(chartType);
    
    const systemMessage: Message = {
      id: Date.now().toString(),
      text: `Switched to ${chartType} chart. You can now ask questions specific to this chart type.`,
      sender: 'ai',
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, systemMessage]);
  };

  const downloadChatPDF = async () => {
    if (!chatContainerRef.current) return;
    
    try {
      setPdfGenerating(true);
      
      const chatElement = chatContainerRef.current.cloneNode(true) as HTMLElement;
      
      const buttons = chatElement.querySelectorAll('button');
      buttons.forEach(button => button.remove());
      
      chatElement.style.backgroundColor = '#ffffff';
      chatElement.style.color = '#000000';
      chatElement.style.padding = '20px';
      chatElement.style.borderRadius = '0';
      
      const header = document.createElement('div');
      header.innerHTML = `
        <h1 style="text-align: center; color: #6d28d9; font-size: 24px; margin-bottom: 20px;">
          AstroMatch Consultation Report
        </h1>
        <p style="text-align: center; margin-bottom: 30px;">
          Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
        </p>
        <hr style="margin-bottom: 30px; border-color: #6d28d9;">
      `;
      
      chatElement.insertBefore(header, chatElement.firstChild);
      
      const opt = {
        margin: [10, 10, 10, 10],
        filename: 'astromatch-chat-export.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      
      await html2pdf().from(chatElement).set(opt).save();
      
      toast({
        title: "PDF Generated",
        description: "Your chat history has been downloaded as a PDF.",
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Error",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive"
      });
    } finally {
      setPdfGenerating(false);
    }
  };

  const formatAiMessage = (text: string) => {
    const withHeaders = text.replace(/(?:^|\n)(#{1,6})\s+(.+)/g, (match, hashes, content) => {
      const level = hashes.length;
      const sizeClasses = [
        'text-xl font-bold',
        'text-lg font-bold',
        'text-base font-bold',
        'text-sm font-bold',
        'text-xs font-bold',
        'text-xs font-semibold'
      ];
      return `<div class="${sizeClasses[level-1]} mt-2 mb-1">${content}</div>`;
    });

    const withLists = withHeaders.replace(/(?:^|\n)(\d+\.\s+)(.+)/g, '<li class="ml-5">$2</li>')
      .replace(/(?:^|\n)(\*|\-)\s+(.+)/g, '<li class="ml-5">$2</li>');

    const withBold = withLists.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    const withItalic = withBold.replace(/\_(.+?)\_/g, '<em>$1</em>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');

    const withHorizontalLines = withItalic.replace(/(?:^|\n)---(?:\n|$)/g, '<hr class="my-2 border-white/20" />');

    const formatted = withHorizontalLines
      .replace(/\n\n/g, '<br /><br />')
      .replace(/\n/g, '<br />');

    return <div dangerouslySetInnerHTML={{ __html: formatted }} />;
  };

  return (
    <div className="min-h-screen bg-purple-background text-white">
      <Navigation />
      
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold mb-6 text-center text-white">
            Astrological Consultation
          </h1>
          
          <div className="flex justify-between items-center mb-4">
            <ChartSelector
              selectedChart={selectedChartType}
              onSelectChart={handleChartTypeChange}
            />
            
            <Button
              onClick={downloadChatPDF}
              className="bg-orange hover:bg-orange/90"
              disabled={pdfGenerating || messages.length <= 1}
            >
              {pdfGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download Report
                </>
              )}
            </Button>
          </div>
          
          <Card className="glass-card p-4 h-[65vh] flex flex-col bg-white/5 backdrop-blur-lg border-white/20">
            <div className="flex items-center mb-4 pb-4 border-b border-white/10">
              <div className="w-10 h-10 rounded-full bg-orange flex items-center justify-center mr-3">
                <Star className="text-white" size={20} />
              </div>
              <div>
                <h2 className="font-medium text-white">AstroMatch AI</h2>
                <p className="text-sm text-white/70">Vedic Astrology Specialist</p>
              </div>
              {selectedChartType !== 'D1' && (
                <div className="ml-auto px-3 py-1 rounded-full bg-orange/20 text-orange text-xs">
                  {selectedChartType} Chart
                </div>
              )}
            </div>
            
            <div 
              ref={chatContainerRef} 
              className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2"
            >
              {messages.map((message) => (
                <div 
                  key={message.id} 
                  className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div 
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.sender === 'user' 
                        ? 'bg-orange text-white rounded-tr-none' 
                        : 'bg-white/10 text-white rounded-tl-none'
                    }`}
                  >
                    <div className="flex items-center mb-1">
                      {message.sender === 'ai' ? (
                        <Star className="text-orange mr-2" size={16} />
                      ) : (
                        <User className="text-white mr-2" size={16} />
                      )}
                      <span className="text-xs opacity-70">{formatTime(message.timestamp)}</span>
                    </div>
                    {message.sender === 'ai' ? 
                      (
                        <>
                          {formatAiMessage(message.text)}
                          {message.isStreaming && (
                            <span className="inline-block ml-1 animate-pulse">▋</span>
                          )}
                        </>
                      ) : 
                      <p className="text-white">{message.text}</p>
                    }
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={`Ask about your ${selectedChartType} chart or compatibility...`}
                className="w-full p-4 pr-14 rounded-xl bg-white/5 border border-white/20 focus:outline-none focus:ring-2 focus:ring-orange resize-none text-white placeholder:text-white/50"
                rows={2}
                disabled={loading}
              />
              <Button 
                onClick={handleSend}
                className="absolute right-2 bottom-2 p-2 bg-orange hover:bg-orange/90 text-white rounded-lg"
                disabled={input.trim() === '' || loading}
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              </Button>
            </div>
          </Card>
          
          <div className="mt-8">
            <h3 className="text-xl font-semibold mb-3 text-orange">Suggested Questions</h3>
            <div className="flex flex-wrap gap-2">
              {[
                `What does my ${selectedChartType} chart reveal about my ${selectedChartType === 'D1' ? 'personality' : 'specific traits'}?`,
                `How does ${selectedChartType === 'D9' ? 'Navamsha chart affect my marriage prospects' : 'my current Dasha period affect my life'}?`,
                `What career paths are favorable based on my ${selectedChartType === 'D10' ? 'Dashamsha chart' : 'birth chart'}?`,
                `Explain the significance of ${selectedChartType} chart in Vedic astrology`,
                `What remedies are recommended based on my ${selectedChartType} chart?`
              ].map((question, index) => (
                <Button
                  key={index}
                  className="bg-white/10 hover:bg-white/20 text-white"
                  onClick={() => setInput(question)}
                  disabled={loading}
                >
                  <MessageCircle className="mr-2" size={16} />
                  {question}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
