import React, { useState, useEffect, useRef } from 'react';
import CharacterSVG from './CharacterSVG';
import { generateReply, computeMemory, saveChatEntry, loadChatHistory } from '../lib/character';
import { scheduleReminderFromText } from '../lib/reminder';
import progression from '../lib/progression';
import { syncLocalReminders } from '../lib/reminder';

export type Mood = 'idle' | 'talking' | 'happy' | 'thinking' | 'playful' | 'sad';

interface CharacterProps {
  initialMood?: Mood;
}

const Character: React.FC<CharacterProps> = ({ initialMood = 'idle' }) => {
  const [mood, setMood] = useState<Mood>(initialMood);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<{ from: 'user' | 'ai'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<{ xp: number; level: number; affection: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history when opening chat
  useEffect(() => {
    if (chatOpen && messages.length === 0) {
      loadChatHistory().then((history) => {
        if (history.length > 0) {
          const recentMessages = history.slice(-5).map((entry) => [
            { from: 'user' as const, text: entry.userMessage },
            { from: 'ai' as const, text: entry.aiMessage },
          ]).flat();
          setMessages(recentMessages);
        }
      }).catch(() => {
        // ignore load failures
      });
    }
  }, [chatOpen, messages.length]);

  // Auto-focus input when chat opens
  useEffect(() => {
    if (chatOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [chatOpen]);

  // load progression state when component mounts or chat opens
  useEffect(() => {
    progression.decayAffection().catch(() => {});
    progression.loadProgress().then((s) => {
      setProgress({ xp: s.xp, level: s.level, affection: s.affection });
    }).catch(() => {});
    syncLocalReminders().catch(() => {});
  }, [chatOpen]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // simple timer to return to idle after talking or happy
  useEffect(() => {
    if (mood === 'talking' || mood === 'happy' || mood === 'playful' || mood === 'thinking' || mood === 'sad') {
      const timer = setTimeout(() => setMood('idle'), 2000);
      return () => clearTimeout(timer);
    }
  }, [mood]);

  const handleClick = () => {
    // open chat when clicking character
    setChatOpen((o) => !o);
    setMood('playful');
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userText = input.trim();
    setMessages((m) => [...m, { from: 'user', text: userText }]);
    setInput('');
    setMood('thinking');
    setIsLoading(true);

    // special-case: quick reminder creation via natural text
    let usedReply: string | null = null;
    let usedMood: typeof mood = 'idle';
    if (userText.includes('提醒')) {
      try {
        const res = await scheduleReminderFromText(userText);
        if (res && res.ok) {
          usedReply = `已为你设置提醒，时间：${res.targetAt}`;
          usedMood = 'happy';
          // award XP and affection for setting reminder
          progression.addXp(20).then((s) => setProgress({ xp: s.xp, level: s.level, affection: s.affection })).catch(() => {});
          progression.addAffection(5).then((s) => setProgress({ xp: s.xp, level: s.level, affection: s.affection })).catch(() => {});
        } else {
          usedReply = (res && res.message) || '无法解析提醒内容，请使用例如：提醒我在 2026-03-01 09:00 做 喝水';
          usedMood = 'thinking';
        }
      } catch (e) {
        usedReply = '设置提醒时出错了';
      }
    } else {
      try {
        const memory = await computeMemory();
      const serverUrl = (process.env.NEXT_PUBLIC_CHARACTER_SERVER_URL as string) || 'http://localhost:10000/reply';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      try {
        const res = await fetch(serverUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userText, memory }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          try {
            const data = await res.json();
            if (data && data.reply) {
              usedReply = data.reply;
              usedMood = data.mood || usedMood;
            }
          } catch (jsonError) {
            console.debug('Failed to parse server response:', jsonError);
          }
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        // server failed or timed out — will fall back to local generator
      }
    } catch (e) {
      // memory computation failed
    }
    }

    if (!usedReply) {
      const result = await generateReply(userText);
      usedReply = result.reply;
      usedMood = result.mood;
    }

    // persist chat entry locally so history keeps both sides
    try {
      await saveChatEntry({ userMessage: userText, aiMessage: usedReply as string, timestamp: Date.now(), mood: usedMood });
    } catch (e) {
      // ignore save failures
    }

    setMessages((m) => [...m, { from: 'ai', text: usedReply as string }]);
    setMood(usedMood);
    setIsLoading(false);
    // small XP for chatting
    progression.addXp(5).then((s) => setProgress({ xp: s.xp, level: s.level, affection: s.affection })).catch(() => {});
  };

  return (
    <div className="character-container">
      <div onClick={handleClick}>
        <CharacterSVG mood={mood} />
      </div>
      {chatOpen && (
        <div className="character-chat bg-white p-0 rounded-lg shadow-light w-64 max-h-96 overflow-hidden flex flex-col">
          <div className="bg-accent-pink/30 text-primary-dark px-3 py-1 flex justify-between items-center text-sm font-medium flex-shrink-0">
            <span>诺特</span>
            <button
              onClick={() => setChatOpen(false)}
              className="text-primary-dark hover:text-accent-pink"
            >
              ×
            </button>
          </div>
          {progress && (
            <div className="px-3 py-1 text-xs bg-white/50 text-primary-dark">
              等级 {progress.level} • XP {progress.xp}/{progress.level * 100} • ❤ {progress.affection}
              <div className="w-full h-1 bg-gray-200 rounded mt-1">
                <div
                  className="h-1 bg-accent-pink rounded"
                  style={{ width: `${(progress.xp / (progress.level * 100)) * 100}%` }}
                />
              </div>
            </div>
          )}
          <div className="p-4 flex-grow overflow-y-auto mb-2 space-y-2 scrollbar-thin scrollbar-thumb-pink-200 scrollbar-track-white">
            {messages.length === 0 && (
              <div className="text-xs text-text-light text-center py-2">
                开启一段对话吧～
              </div>
            )}
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] px-3 py-2 rounded-lg text-sm break-words whitespace-pre-wrap ${
                    m.from === 'user'
                      ? 'bg-primary-light text-primary-dark'
                      : 'bg-accent-pink/20 text-accent-pink'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="text-xs text-text-light px-3 py-2">诺特正在思考...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="flex gap-2 px-2 pb-2 flex-shrink-0">
            <input
              ref={inputRef}
              type="text"
              className="input flex-grow"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="和诺特说点什么..."
              disabled={isLoading}
            />
            <button onClick={sendMessage} className="btn btn-primary" disabled={isLoading}>
              {isLoading ? '...' : '发送'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Character;