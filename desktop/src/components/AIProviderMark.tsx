import openai from '../assets/ai-providers/openai.svg?url';
import gemini from '../assets/ai-providers/googlegemini.svg?url';
import anthropic from '../assets/ai-providers/anthropic.svg?url';
import deepseek from '../assets/ai-providers/deepseek.svg?url';
import glm from '../assets/ai-providers/glm.svg?url';
import mimo from '../assets/ai-providers/mimo.svg?url';
import openrouter from '../assets/ai-providers/openrouter.svg?url';
import ollama from '../assets/ai-providers/ollama.svg?url';
import type { AIProvider } from '../../shared/types';

const marks: Record<AIProvider, { src: string; label: string; className?: string }> = {
  openai: { src: openai, label: 'OpenAI' },
  gemini: { src: gemini, label: 'Google Gemini' },
  anthropic: { src: anthropic, label: 'Claude' },
  deepseek: { src: deepseek, label: 'DeepSeek' },
  glm: { src: glm, label: 'GLM by Z.ai', className: 'wide' },
  mimo: { src: mimo, label: 'MiMo by Xiaomi', className: 'wide' },
  openrouter: { src: openrouter, label: 'OpenRouter' },
  ollama: { src: ollama, label: 'Ollama' },
};

export function AIProviderMark({ provider, size = 26 }: { provider: AIProvider; size?: number }) {
  const mark = marks[provider];
  return <img className={`ai-provider-mark ${mark.className || ''}`} src={mark.src} alt={mark.label} width={size} height={size} />;
}

export function aiProviderLabel(provider: AIProvider) {
  return marks[provider].label;
}
