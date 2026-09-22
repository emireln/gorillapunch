export const providers = ['openai', 'gemini', 'anthropic', 'deepseek'] as const;
export type Provider = typeof providers[number];
export const providerLabels: Record<Provider, string> = { openai: 'OpenAI', gemini: 'Google Gemini', anthropic: 'Anthropic Claude', deepseek: 'DeepSeek' };
export interface CredentialSummary { id: string; provider: Provider; masked_identifier: string; preferred_model: string; created_at: string }
