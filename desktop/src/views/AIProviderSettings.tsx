import { useCallback, useEffect, useState } from 'react';
import { ArrowsClockwise, Check, Key, X } from '@phosphor-icons/react';
import type { AIProvider, AIProviderModel, AIProviderState } from '../../shared/types';
import { aiProviders } from '../../shared/types';
import { AIProviderMark, aiProviderLabel } from '../components/AIProviderMark';
import { useDesktopI18n } from '../i18n';

export function AIProviderSettings() {
  const { t } = useDesktopI18n();
  const [states, setStates] = useState<AIProviderState[] | null>(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { setStates(await window.gorillaPunch.ai.providers()); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load AI provider settings.'); }
  }, []);
  useEffect(() => {
    window.gorillaPunch.ai.providers().then(values => { setStates(values); setError(''); })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load AI provider settings.'));
  }, []);

  return <section className="settings-section ai-provider-settings">
    <div className="settings-intro"><h2>{t('ai.providerSettingsTitle')}</h2><p>{t('ai.providerHelp')}</p></div>
    {error && <p className="account-message" role="alert">{error}</p>}
    {!states ? <div className="settings-card">{t('settings.wait')}</div> : <div className="ai-provider-grid">
      {aiProviders.map(provider => {
        const state = states.find(item => item.provider === provider);
        return <ProviderEditor key={`${provider}-${state?.model || ''}-${state?.endpoint || ''}`} provider={provider} state={state} refresh={refresh}/>;
      })}
    </div>}
  </section>;
}

function ProviderEditor({ provider, state, refresh }: { provider: AIProvider; state?: AIProviderState; refresh(): Promise<void> }) {
  const { t } = useDesktopI18n();
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(state?.model || '');
  const [endpoint, setEndpoint] = useState(state?.endpoint || 'http://localhost:11434');
  const [models, setModels] = useState<AIProviderModel[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const loadModels = async () => {
    setBusy(true); setMessage('');
    try {
      const available = await window.gorillaPunch.ai.models(provider, apiKey.trim() || undefined, provider === 'ollama' ? endpoint : undefined);
      setModels(available);
      setModel(current => available.some(item => item.id === current) ? current : available[0]?.id || current);
      setMessage(available.length ? `${available.length} models available.` : t('ai.noModels'));
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : t('ai.noModels')); }
    finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true); setMessage('');
    try {
      await window.gorillaPunch.ai.configure({ provider, apiKey, model: model.trim(), ...(provider === 'ollama' ? { endpoint } : {}), ...(models.find(item => item.id === model.trim())?.contextWindow ? { contextWindow: models.find(item => item.id === model.trim())?.contextWindow } : {}) });
      setApiKey(''); setMessage(t('ai.savedProvider')); await refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : t('ai.saveProvider')); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true); setMessage('');
    try { await window.gorillaPunch.ai.disconnect(provider); setApiKey(''); setModels([]); setMessage(t('ai.disconnectedProvider')); await refresh(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : t('ai.disconnectedProvider')); }
    finally { setBusy(false); }
  };

  return <article className={`settings-card ai-provider-card ${state?.configured ? 'configured' : ''}`}>
    <header className="ai-provider-heading">
      <span className={`ai-provider-logo-shell ${provider}`}><AIProviderMark provider={provider}/></span>
      <div><h3>{aiProviderLabel(provider)}</h3><p>{state?.configured ? <><Check size={14}/>{state.keyHint || t('settings.connected')} · {state.model}</> : t('ai.notConnected')}</p></div>
    </header>
    <div className="ai-provider-fields">
      {provider === 'ollama' ? <label><span>{t('ai.endpoint')}</span><input value={endpoint} onChange={event => setEndpoint(event.target.value)} placeholder={t('ai.endpointPlaceholder')} spellCheck={false} autoComplete="off"/></label> : <label><span>{t('ai.apiKey')}</span><div className="ai-secret-field"><Key size={16}/><input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={state?.configured ? t('ai.replaceKeyPlaceholder') : t('ai.apiKeyPlaceholder')} autoComplete="off" spellCheck={false}/></div></label>}
      <label><span>{t('ai.model')}</span><input list={`ai-models-${provider}`} value={model} onChange={event => setModel(event.target.value)} placeholder={t('ai.modelPlaceholder')} autoComplete="off" spellCheck={false}/><datalist id={`ai-models-${provider}`}>{models.map(item => <option key={item.id} value={item.id}/>)}</datalist></label>
      {provider === 'ollama' && <label><span>{t('ai.apiKey')} <small>(optional)</small></span><div className="ai-secret-field"><Key size={16}/><input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={state?.configured ? t('ai.replaceKeyPlaceholder') : t('ai.apiKeyPlaceholder')} autoComplete="off" spellCheck={false}/></div></label>}
    </div>
    <div className="ai-provider-actions">
      <button className="secondary-btn" disabled={busy} onClick={() => void loadModels()}><ArrowsClockwise className={busy ? 'spin' : ''} size={16}/>{busy ? t('ai.loadingModels') : t('ai.loadModels')}</button>
      <button className="primary-btn" disabled={busy || !model.trim() || (provider !== 'ollama' && !apiKey.trim() && !state?.configured)} onClick={() => void save()}>{busy ? t('ai.savingProvider') : t('ai.saveProvider')}</button>
      {state?.configured && <button className="icon-action danger" aria-label={`${t('ai.disconnect')} ${aiProviderLabel(provider)}`} title={t('ai.disconnect')} disabled={busy} onClick={() => void disconnect()}><X size={17}/></button>}
    </div>
    {message && <p className="ai-provider-message" role="status">{message}</p>}
  </article>;
}
