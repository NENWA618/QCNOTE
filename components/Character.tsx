import React, { useState, useEffect } from 'react';
import CharacterSVG from './CharacterSVG';
import { generateReply, computeMemory, saveChatEntry } from '../lib/character';

export type Mood = 'idle' | 'talking' | 'happy' | 'thinking' | 'playful' | 'sad';

interface CharacterProps {
  initialMood?: Mood;
}

const Character: React.FC<CharacterProps> = ({ initialMood = 'idle' }) => {
  const [mood, setMood] = useState<Mood>(initialMood);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<{ from: 'user' | 'ai'; text: string }[]>([]);
  const [input, setInput] = useState('');

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
    if (!input.trim()) return;
    const userText = input.trim();
    setMessages((m) => [...m, { from: 'user', text: userText }]);
    setInput('');
    setMood('thinking');

    // build memory snapshot and try server first
    let usedReply: string | null = null;
    let usedMood: typeof mood = 'idle';
    try {
      const memory = await computeMemory();
      const serverUrl = (process.env.NEXT_PUBLIC_CHARACTER_SERVER_URL as string) || 'http://localhost:4000/reply';
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText, memory }),
        signal: controller.signal,
      });
      clearTimeout(id);
      if (res.ok) {
        const data = await res.json();
        if (data && data.reply) {
          usedReply = data.reply;
          usedMood = data.mood || usedMood;
        }
      }
    } catch (e) {
      // server failed or timed out — fall back to local generator
      // console.debug('character server unavailable, fallback to local', e);
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
  };

  return (
    <div className="character-container">
      <div onClick={handleClick}>
        <CharacterSVG mood={mood} />
      </div>
      {chatOpen && (
        <div className="character-chat bg-white p-0 rounded-lg shadow-light w-64 max-h-96 overflow-hidden flex flex-col">
          <div className="bg-accent-pink/30 text-primary-dark px-3 py-1 flex justify-between items-center text-sm font-medium">
            <span>诺特</span>
            <button
              onClick={() => setChatOpen(false)}
              className="text-primary-dark hover:text-accent-pink"
            >
              ×
            </button>
          </div>
          <div className="p-4 flex-grow overflow-auto mb-2 space-y-1 scrollbar-thin scrollbar-thumb-pink-200 scrollbar-track-white">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`max-w-[80%] px-3 py-2 rounded-lg text-sm break-words whitespace-pre-wrap ${
                  m.from === 'user'
                    ? 'bg-primary-light text-primary-dark self-end'
                    : 'bg-accent-pink/20 text-accent-pink self-start'
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              className="input flex-grow"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendMessage();
              }}
              placeholder="和诺特说点什么..."
            />
            <button onClick={sendMessage} className="btn btn-primary">
              发送
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Character;