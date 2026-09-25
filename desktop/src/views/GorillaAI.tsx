import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type KeyboardEvent, type ClipboardEvent } from 'react';
import { ArrowUp, Brain, CaretDown, Copy, DownloadSimple, Key, MagnifyingGlass, Paperclip, Plus, Trash, UploadSimple, X } from '@phosphor-icons/react';
import type { AIActivity, AIChat, AIChatMessage, AIImageAttachment, AIProvider, AIProviderState, AIUsage } from '../../shared/types';
import { AIProviderMark, aiProviderLabel } from '../components/AIProviderMark';
import { useDesktopI18n, type Translate } from '../i18n';

const acceptedImages = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const imageByteLimit = 4 * 1024 * 1024;

export function GorillaAI({ notify, onSettings }: { notify(message: string, tone?: 'success' | 'error'): void; onSettings(): void }) {
  const { t } = useDesktopI18n();
  const [chats, setChats] = useState<AIChat[]>([]);
  const [providers, setProviders] = useState<AIProviderState[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [images, setImages] = useState<AIImageAttachment[]>([]);
  const [activity, setActivity] = useState<AIActivity | null>(null);
  const [streamText, setStreamText] = useState('');
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const requestId = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [savedChats, savedProviders] = await Promise.all([window.gorillaPunch.ai.chats(), window.gorillaPunch.ai.providers()]);
      setChats(savedChats); setProviders(savedProviders);
      setSelectedId(current => current && savedChats.some(chat => chat.id === current) ? current : savedChats[0]?.id || null);
    } catch (error) { notify(error instanceof Error ? error.message : t('ai.title'), 'error'); }
    finally { setLoading(false); }
  }, [notify, t]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([window.gorillaPunch.ai.chats(), window.gorillaPunch.ai.providers()]).then(([savedChats, savedProviders]) => {
      if (cancelled) return;
      setChats(savedChats); setProviders(savedProviders);
      setSelectedId(current => current && savedChats.some(chat => chat.id === current) ? current : savedChats[0]?.id || null);
    }).catch(error => { if (!cancelled) notify(error instanceof Error ? error.message : t('ai.title'), 'error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [notify, t]);
  const activeChat = chats.find(chat => chat.id === selectedId) || null;
  const activeProvider = activeChat ? providers.find(provider => provider.provider === activeChat.provider) : undefined;
  const connected = providers.filter(provider => provider.configured);
  const filteredChats = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return chats;
    return chats.filter(chat => `${chat.title} ${chat.messages.map(message => message.content).join(' ')}`.toLocaleLowerCase().includes(needle));
  }, [chats, search]);
  const latestUsage = [...(activeChat?.messages || [])].reverse().find(message => message.role === 'assistant' && message.usage)?.usage;
  const sending = !!activity && activity.phase !== 'complete' && activity.phase !== 'error';

  const openSettings = () => {
    onSettings();
    window.setTimeout(() => document.querySelector('.ai-provider-settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  const newChat = async () => {
    const provider = connected[0];
    if (!provider) { openSettings(); return; }
    const now = new Date().toISOString();
    const chat: AIChat = { id: crypto.randomUUID(), title: t('ai.untitled'), provider: provider.provider, model: provider.model, createdAt: now, updatedAt: now, messages: [] };
    try { await window.gorillaPunch.ai.saveChat(chat); setChats(current => [chat, ...current]); setSelectedId(chat.id); setDraft(''); setImages([]); window.setTimeout(() => composer.current?.focus(), 0); }
    catch (error) { notify(error instanceof Error ? error.message : t('ai.title'), 'error'); }
  };

  const selectProvider = async (provider: AIProvider) => {
    if (!activeChat) return;
    const config = providers.find(item => item.provider === provider);
    if (!config?.configured) return;
    const updated = { ...activeChat, provider, model: config.model, updatedAt: new Date().toISOString() };
    try { const saved = await window.gorillaPunch.ai.saveChat(updated); setChats(current => current.map(chat => chat.id === saved.id ? saved : chat)); }
    catch (error) { notify(error instanceof Error ? error.message : t('ai.title'), 'error'); }
  };

  const addFiles = async (files: FileList | File[]) => {
    const picked = Array.from(files);
    if (!picked.length) return;
    const room = Math.max(0, 4 - images.length);
    if (picked.some(file => !acceptedImages.has(file.type) || file.size > imageByteLimit)) { notify(t('ai.imageTooLarge'), 'error'); return; }
    const additions = await Promise.all(picked.slice(0, room).map(readImage));
    setImages(current => [...current, ...additions].slice(0, 4));
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => { const files = event.target.files; event.target.value = ''; if (files) void addFiles(files); };
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = Array.from(event.clipboardData.items).flatMap(item => item.kind === 'file' ? [item.getAsFile()].filter((file): file is File => !!file) : []);
    if (pasted.length) { event.preventDefault(); void addFiles(pasted); }
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); void addFiles(event.dataTransfer.files); };

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (sending || (!text && !images.length)) return;
    let chat = activeChat;
    if (!chat) {
      const provider = connected[0];
      if (!provider) { openSettings(); return; }
      const now = new Date().toISOString();
      chat = { id: crypto.randomUUID(), title: t('ai.untitled'), provider: provider.provider, model: provider.model, createdAt: now, updatedAt: now, messages: [] };
      setChats(current => [chat!, ...current]); setSelectedId(chat.id);
    }
    if (!providers.find(provider => provider.provider === chat!.provider)?.configured) { notify(t('ai.noProviderTitle'), 'error'); openSettings(); return; }

    const request = crypto.randomUUID();
    const userMessage: AIChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, createdAt: new Date().toISOString(), ...(images.length ? { images: [...images] } : {}) };
    requestId.current = request; setActivity({ requestId: request, chatId: chat.id, phase: 'thinking', detail: t('ai.activityThinking') }); setStreamText('');
    setDraft(''); setImages([]);
    const unsubscribe = window.gorillaPunch.ai.onActivity((event: AIActivity) => {
      if (event.requestId !== requestId.current) return;
      setActivity(event);
      if (event.chunk) setStreamText(current => current + event.chunk);
    });
    try {
      const optimistic = { ...chat, messages: [...chat.messages, userMessage], updatedAt: userMessage.createdAt };
      setChats(current => [optimistic, ...current.filter(item => item.id !== optimistic.id)]);
      const saved = await window.gorillaPunch.ai.send(request, chat.id, userMessage);
      setChats(current => [saved, ...current.filter(item => item.id !== saved.id)]);
      setSelectedId(saved.id); setActivity({ requestId: request, chatId: saved.id, phase: 'complete', usage: saved.messages.at(-1)?.usage });
    } catch (error) {
      notify(error instanceof Error ? error.message : t('ai.title'), 'error');
      void window.gorillaPunch.ai.chats().then(saved => setChats(saved)).catch(() => undefined);
      setActivity({ requestId: request, chatId: chat.id, phase: 'error', detail: error instanceof Error ? error.message : t('ai.title') });
    } finally { unsubscribe(); requestId.current = null; }
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); }
  };

  const removeChat = async () => {
    if (!activeChat || !window.confirm(t('ai.deleteConfirm'))) return;
    try { await window.gorillaPunch.ai.deleteChat(activeChat.id); const remaining = chats.filter(chat => chat.id !== activeChat.id); setChats(remaining); setSelectedId(remaining[0]?.id || null); }
    catch (error) { notify(error instanceof Error ? error.message : t('ai.title'), 'error'); }
  };

  const exportChats = async () => {
    if (!chats.length) { notify(t('ai.noChatsToExport')); return; }
    try { const path = await window.gorillaPunch.ai.exportChats(); if (path) notify(t('ai.exportedChats', { path })); }
    catch (error) { notify(error instanceof Error ? error.message : t('ai.exportError'), 'error'); }
  };

  const importChats = async () => {
    try { const count = await window.gorillaPunch.ai.importChats(); if (count) { await refresh(); notify(t('ai.importedChats', { count })); } }
    catch (error) { notify(error instanceof Error ? error.message : t('ai.importError'), 'error'); }
  };

  const activityLabel = activity?.phase === 'audit' ? activity.detail || t('ai.activityAudit') : activity?.phase === 'answer' ? t('ai.activityAnswer') : t('ai.activityThinking');

  return <div className="view gorilla-ai-view" onDragEnter={event => { if (Array.from(event.dataTransfer.types).includes('Files')) setDragging(true); }} onDragOver={event => { if (dragging) event.preventDefault(); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={onDrop}>
    <header className="ai-page-heading"><div><span className="eyebrow">{t('ai.eyebrow')}</span><h1>{t('ai.title')}</h1><p>{t('ai.subtitle')}</p></div><div className="ai-page-tools"><button className="secondary-btn" onClick={() => void importChats()}><UploadSimple size={16}/>{t('ai.import')}</button><button className="secondary-btn" onClick={() => void exportChats()}><DownloadSimple size={16}/>{t('ai.export')}</button></div></header>
    <section className="ai-workspace">
      <aside className="ai-history">
        <button className="primary-btn ai-new-chat" onClick={() => void newChat()}><Plus size={18}/>{t('ai.newChat')}</button>
        <label className="ai-search"><MagnifyingGlass size={17}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder={t('ai.search')} aria-label={t('ai.search')}/></label>
        <div className="ai-chat-list" role="list" aria-label={t('ai.search')}>
          {loading ? <div className="ai-list-empty">{t('settings.wait')}</div> : filteredChats.map(chat => <button role="listitem" key={chat.id} className={`ai-chat-row ${chat.id === selectedId ? 'active' : ''}`} onClick={() => { setSelectedId(chat.id); setActivity(null); setStreamText(''); }}><strong>{chat.title}</strong><span>{chat.messages.find(message => message.role === 'user')?.content.replace(/\s+/g, ' ').slice(0, 70) || aiProviderLabel(chat.provider)}</span><small>{formatDate(chat.updatedAt)}</small></button>)}
          {!loading && !filteredChats.length && <div className="ai-list-empty">{chats.length ? t('history.empty') : t('ai.emptyHistory')}</div>}
        </div>
        <div className="ai-local-note"><Key size={16}/><span>{t('ai.localNotice')}</span></div>
      </aside>
      <section className={`ai-conversation ${dragging ? 'dragging' : ''}`}>
        {activeChat ? <>
          <header className="ai-conversation-heading">
            <div className="ai-conversation-title"><strong title={activeChat.title}>{activeChat.title}</strong><span>{activeChat.model}</span></div>
            <div className="ai-conversation-actions">
              <label className="ai-model-select"><AIProviderMark provider={activeChat.provider} size={21}/><select aria-label={t('ai.chooseProvider')} value={activeChat.provider} onChange={event => void selectProvider(event.target.value as AIProvider)}>{providers.filter(provider => provider.configured).map(provider => <option key={provider.provider} value={provider.provider}>{aiProviderLabel(provider.provider)} · {provider.model}</option>)}</select><CaretDown size={14}/></label>
              <button className="icon-action danger" aria-label={t('ai.delete')} title={t('ai.delete')} onClick={() => void removeChat()}><Trash size={17}/></button>
            </div>
          </header>
          <div className="ai-messages" aria-live="polite">
            {!activeChat.messages.length && <div className="ai-welcome"><span className="ai-welcome-mark"><Brain size={24}/></span><h2>{t('ai.firstTitle')}</h2><p>{t('ai.firstText')}</p></div>}
            {activeChat.messages.map(message => <AIMessageBubble key={message.id} message={message} notify={notify}/>)}
            {sending && <div className="ai-activity"><span className="ai-thinking-pulse"><i/><i/><i/></span><div><strong>{activityLabel}</strong><span>{activity?.phase === 'thinking' ? t('ai.thinkingLabel') : activity?.detail}</span></div></div>}
            {sending && streamText && <article className="ai-message assistant"><span className="ai-message-source"><AIProviderMark provider={activeChat.provider} size={19}/>{aiProviderLabel(activeChat.provider)}</span><div className="ai-message-text">{streamText}</div></article>}
          </div>
          <div className="ai-compose-area">
            {latestUsage && <ContextUsage usage={latestUsage} provider={activeProvider} t={t}/>}
            {images.length > 0 && <div className="ai-attachment-strip">{images.map((image, index) => <figure key={`${image.name}-${index}`}><img src={`data:${image.mimeType};base64,${image.data}`} alt={image.name}/><button type="button" aria-label={t('ai.removeImage')} onClick={() => setImages(current => current.filter((_, at) => at !== index))}><X size={14}/></button></figure>)}</div>}
            <form className="ai-composer" onSubmit={event => void send(event)}>
              <input ref={fileInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={onFileChange} aria-label={t('ai.attach')}/>
              <button className="ai-attach-button" type="button" aria-label={t('ai.attach')} title={t('ai.attach')} disabled={sending} onClick={() => fileInput.current?.click()}><Paperclip size={19}/></button>
              <textarea ref={composer} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={onComposerKeyDown} onPaste={onPaste} placeholder={t('ai.placeholder')} rows={1} aria-label={t('ai.placeholder')} disabled={sending || !activeProvider?.configured}/>
              <button className="ai-send-button" type="submit" disabled={sending || (!draft.trim() && !images.length) || !activeProvider?.configured} aria-label={t('ai.send')} title={t('ai.send')}><ArrowUp size={19}/></button>
            </form>
            <p className="ai-audit-hint">{t('ai.auditHint')}</p>
          </div>
        </> : <div className="ai-empty-state">
          {connected.length ? <><span className="ai-welcome-mark"><Brain size={26}/></span><h2>{t('ai.firstTitle')}</h2><p>{t('ai.firstText')}</p><button className="primary-btn" onClick={() => void newChat()}><Plus size={17}/>{t('ai.newChat')}</button></> : <><span className="ai-welcome-mark"><Brain size={26}/></span><h2>{t('ai.noProviderTitle')}</h2><p>{t('ai.noProviderText')}</p><button className="primary-btn" onClick={openSettings}>{t('ai.openSettings')}</button></>}
        </div>}
        {dragging && <div className="ai-drop-overlay"><strong>{t('ai.dragImages')}</strong></div>}
      </section>
    </section>
  </div>;
}

function AIMessageBubble({ message, notify }: { message: AIChatMessage; notify(message: string, tone?: 'success' | 'error'): void }) {
  const { t } = useDesktopI18n();
  const fixPrompt = extractFixPrompt(message.content);
  const copyFix = async () => {
    try { await navigator.clipboard.writeText(fixPrompt); notify(t('ai.copiedFix')); }
    catch { notify(t('ai.copyError'), 'error'); }
  };
  return <article className={`ai-message ${message.role}`}>
    {message.role === 'assistant' && <span className="ai-message-source"><Brain size={18}/>{t('ai.title')}</span>}
    {message.images?.length ? <div className="ai-message-images">{message.images.map((image, index) => <img key={`${image.name}-${index}`} src={`data:${image.mimeType};base64,${image.data}`} alt={image.name}/>)}</div> : null}
    {message.content && <div className="ai-message-text">{message.content}</div>}
    {fixPrompt && message.role === 'assistant' && <button className="secondary-btn ai-copy-fix" onClick={() => void copyFix()}><Copy size={15}/>{t('ai.copyFix')}</button>}
    {message.usage && <small className="ai-message-usage">{message.usage.totalTokens ? t('ai.tokens', { count: message.usage.totalTokens.toLocaleString() }) : t('ai.usageUnavailable')}</small>}
  </article>;
}

function ContextUsage({ usage, provider, t }: { usage: AIUsage; provider?: AIProviderState; t: Translate }) {
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const contextWindow = usage.contextWindow || provider?.contextWindow;
  const hasUsage = usage.inputTokens !== undefined || usage.outputTokens !== undefined || usage.totalTokens !== undefined;
  const percent = hasUsage && contextWindow ? Math.max(0, Math.min(100, Math.round(input / contextWindow * 100))) : 0;
  return <div className="ai-context-usage" title={contextWindow ? `${input.toLocaleString()} / ${contextWindow.toLocaleString()} input tokens` : t('ai.contextUnknown')}>
    <div><span>{t('ai.contextUsage')}</span><strong>{!hasUsage ? t('ai.usageUnavailable') : contextWindow ? `${percent}%` : t('ai.tokens', { count: (usage.totalTokens ?? input + output).toLocaleString() })}</strong></div>
    {hasUsage && contextWindow && <div className="ai-context-bar"><i style={{ width: `${percent}%` }}/></div>}
    {!hasUsage ? <small>{t('ai.usageUnavailable')}</small> : contextWindow ? <small>{input.toLocaleString()} input · {output.toLocaleString()} output · {contextWindow.toLocaleString()} max</small> : <small>{t('ai.contextUnknown')}</small>}
  </div>;
}

function extractFixPrompt(value: string) {
  const match = value.match(/^#{1,3}\s*fix prompt\s*\n([\s\S]*?)(?=\n#{1,3}\s|$)/im);
  return match?.[1]?.trim() || '';
}

function readImage(file: File): Promise<AIImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('This image could not be read.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const match = result.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) { reject(new Error('This image could not be prepared.')); return; }
      resolve({ name: file.name.slice(0, 100) || 'Image', mimeType: match[1] as AIImageAttachment['mimeType'], data: match[2] });
    };
    reader.readAsDataURL(file);
  });
}

function formatDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
