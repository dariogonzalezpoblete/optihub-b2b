'use client';

import React, { useState } from 'react';
import { MessageCircle, X, Send, Bot, Sparkles } from 'lucide-react';

export default function AIChatbox() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '¡Hola! Soy tu asistente IA de OptiHub B2B. ¿Buscabas algún modelo o material en específico?' }
  ]);
  const [input, setInput] = useState('');

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add user message
    const newMessages = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');

    // Mock AI Response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { 
          role: 'assistant', 
          content: 'He registrado tu consulta. Pronto este asistente estará conectado directamente al motor de base de datos para buscar en tiempo real.' 
        }
      ]);
    }, 1000);
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-50 p-4 bg-emerald-500 text-slate-950 rounded-full shadow-lg shadow-emerald-500/20 hover:scale-110 transition-transform ${isOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}
      >
        <MessageCircle className="w-6 h-6" />
      </button>

      {/* Ventana de Chat */}
      <div 
        className={`fixed bottom-6 right-6 z-50 w-80 sm:w-96 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col transition-all duration-300 origin-bottom-right ${
          isOpen ? 'scale-100 opacity-100 pointer-events-auto' : 'scale-0 opacity-0 pointer-events-none'
        }`}
      >
        {/* Header */}
        <div className="bg-slate-950 p-4 border-b border-slate-800 flex justify-between items-center rounded-t-2xl">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500/20 p-2 rounded-lg">
              <Bot className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1">OptiBot IA <Sparkles className="w-3 h-3 text-emerald-400" /></h3>
              <p className="text-[10px] text-emerald-500 font-medium">Asistente Virtual B2B</p>
            </div>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 p-1.5 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mensajes */}
        <div className="flex-1 p-4 overflow-y-auto max-h-[350px] min-h-[300px] flex flex-col gap-3 custom-scrollbar">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-emerald-500 text-slate-950 rounded-tr-sm font-medium' 
                    : 'bg-slate-800 text-slate-200 rounded-tl-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="p-3 bg-slate-950 border-t border-slate-800 rounded-b-2xl flex gap-2">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pregunta por marcas, materiales..." 
            className="flex-1 bg-slate-900 border border-slate-700 text-sm text-white px-4 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500 transition"
          />
          <button 
            type="submit"
            disabled={!input.trim()}
            className="bg-emerald-500 text-slate-950 p-2.5 rounded-xl hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 transition"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </>
  );
}
