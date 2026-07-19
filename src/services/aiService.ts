import { getSettings, saveSettings, getAIKeys, saveAIKey, type Settings } from '../utils/storage';

export type ChatProvider = 'groq' | 'gemini' | 'openai';

export interface AIProviderSettings {
  chatProvider: ChatProvider;
  apiKeys: {
    openai?: string;
    groq?: string;
    gemini?: string;
  };
}

export type AIRequestType = 'chat' | 'generate-image' | 'analyze-image' | 'analyze-page';

export type AIRequest = {
  type: AIRequestType;
  messages?: ChatMessage[];
  instruction?: string;
  imageData?: {
    mimeType: string;
    data: string;
    filename?: string;
  };
};

type ChatMessage = { role: string; content: string };

export type BrowserAgentAction =
  | { type: 'click'; targetId: string; description?: string }
  | { type: 'type'; targetId: string; text: string; description?: string }
  | { type: 'scroll'; direction: 'up' | 'down'; amount?: number; description?: string };

type BrowserPage = {
  title: string;
  url: string;
  description: string;
  text: string;
  controls: Array<{ id: string; tag: string; label: string; type?: string }>;
};

export type BrowserAgentResponse = { reply: string; actions: BrowserAgentAction[] };

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Mixtral 8x7B was retired by Groq. This is a currently supported chat model.
const GROQ_MODEL = import.meta.env.VITE_GROQ_MODEL || 'llama-3.3-70b-versatile';
// Gemini model name can be configured via VITE_GEMINI_MODEL. Use a safe default
// that is generally available (text-bison) if the environment doesn't provide one.
const GEMINI_MODEL_NAME = import.meta.env.VITE_GEMINI_MODEL || 'text-bison-001';
const OPENAI_MODEL = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini';
const RESPONSE_TEMPERATURE = 0.35;
const MAX_RESPONSE_TOKENS = 1400;
const MAX_RECENT_CHAT_MESSAGES = 8;
const MAX_CHAT_MESSAGE_CHARACTERS = 6000;
const MAX_BROWSER_PAGE_CHARACTERS = 6000;
const KEY_POINTS_PATTERN = /\b(?:key\s*(?:points?|takeaways?)|extract(?:\s+the)?\s+(?:key\s+)?(?:points?|highlights?|facts?)|important\s*facts?|highlights?|bullet(?:\s+points?)?)\b/i;
const CODE_REQUEST_PATTERN = /\b(?:code|function|component|script|program|typescript|javascript|python|java|c\+\+|c#|html|css|sql|regex)\b/i;
const COMPLETE_PROGRAM_PATTERN = /\b(?:complete|full|entire|production(?:-ready)?|project|application|app|program|with\s+(?:input|menu|file|database|gui))\b/i;
const EXPLANATION_REQUEST_PATTERN = /\b(?:explain|explanation|how\s+(?:does|do|to)|why|what\s+is|walk(?:\s|-)?through|teach)\b/i;

const GENERAL_ASSISTANT_SYSTEM_PROMPT = `You are InsightIQ, a capable, friendly conversational AI assistant. Answer the user's actual request directly and naturally in the user's language. A greeting such as "hi" or "hello" should receive a normal conversational greeting; do not summarize a webpage unless the user explicitly asks about a page, tab, website, or provided document.

Formatting rules:
- If the user asks for key points, highlights, facts, takeaways, or a bullet list, respond with only concise Markdown bullet lines beginning with "- ". Do not add a heading or paragraph.
- If the user asks for code, provide practical, directly usable code in a fenced Markdown code block with the correct language tag (for example \`\`\`ts). Never put source code only inside a paragraph.
- Use Markdown headings, numbered lists, bullets, inline code, and code fences when they make the answer clearer.
- Be accurate, concise, and honest about uncertainty. Do not invent webpage contents, API results, files, or actions.`;

type ProgrammingResponseKind = 'simple-snippet' | 'complete-program' | 'explanation' | null;

function detectProgrammingResponseKind(instruction: string): ProgrammingResponseKind {
  if (!CODE_REQUEST_PATTERN.test(instruction)) return null;
  if (EXPLANATION_REQUEST_PATTERN.test(instruction)) return 'explanation';
  if (COMPLETE_PROGRAM_PATTERN.test(instruction)) return 'complete-program';
  return 'simple-snippet';
}

function programmingResponseInstructions(instruction: string): string {
  const kind = detectProgrammingResponseKind(instruction);
  if (kind === 'simple-snippet') {
    return `Programming response mode: SIMPLE SNIPPET. The user asked only for code. Return only the shortest correct fenced code block with the proper language tag. Do not add an introduction, explanation, heading, Expected Output, Tip, or comments unless a comment is required for correctness.`;
  }
  if (kind === 'complete-program') {
    return `Programming response mode: COMPLETE PROGRAM. Give a short one-sentence explanation, then one complete runnable fenced code block with a language tag. Include an "## Expected Output" section only when output is meaningful. Add a brief "## Tip" only when it helps a beginner. Do not omit setup or required imports.`;
  }
  if (kind === 'explanation') {
    return `Programming response mode: EXPLANATION. Explain the concept clearly in the user's language before showing code. Keep code focused and fenced with the correct language tag. Include "## Expected Output" only when it applies, and an optional concise "## Tip" for beginners.`;
  }
  return '';
}

function isChatProvider(provider: unknown): provider is ChatProvider {
  return provider === 'groq' || provider === 'gemini' || provider === 'openai';
}

async function getEnvironmentApiKey(provider: ChatProvider | 'openai'): Promise<string | null> {
  if (provider === 'groq') return import.meta.env.VITE_GROQ_API_KEY || null;
  if (provider === 'gemini') return import.meta.env.VITE_GEMINI_API_KEY || null;
  if (provider === 'openai') return import.meta.env.VITE_OPENAI_API_KEY || null;
  return null;
}

async function getSavedApiKeys(): Promise<AIProviderSettings['apiKeys']> {
  const savedKeys = await getAIKeys();
  const normalize = (v: unknown): string | undefined => {
    if (typeof v !== 'string') return undefined;
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  };

  const result = {
    openai: normalize(savedKeys.openai),
    groq: normalize(savedKeys.groq),
    gemini: normalize(savedKeys.gemini),
  };

  // Support legacy key format if a specific saved key is still missing
  if (Object.values(result).some((value) => value === undefined)) {
    const legacy = await chrome.storage.local.get('insightiq_ai_config');
    const legacyConfig = legacy.insightiq_ai_config as { provider?: unknown; apiKey?: unknown } | null;
    if (legacyConfig && typeof legacyConfig === 'object' && typeof legacyConfig.apiKey === 'string') {
      const apiKeyNormalized = legacyConfig.apiKey.trim();
      if (apiKeyNormalized.length > 0) {
        if (legacyConfig.provider === 'groq' && result.groq === undefined) result.groq = apiKeyNormalized;
        if (legacyConfig.provider === 'gemini' && result.gemini === undefined) result.gemini = apiKeyNormalized;
        if (legacyConfig.provider === 'openai' && result.openai === undefined) result.openai = apiKeyNormalized;
      }
    }
  }

  return result;
}

export async function getChatProvider(): Promise<ChatProvider> {
  const settings = await getSettings();
  const provider = settings.selectedProvider ?? settings.chatProvider;
  return isChatProvider(provider) ? provider : 'groq';
}

export async function saveChatProvider(provider: ChatProvider): Promise<void> {
  const settingsToSave: Partial<Settings> = { selectedProvider: provider };
  if (provider !== 'openai') {
    settingsToSave.chatProvider = provider;
  }
  await saveSettings(settingsToSave);
}

export async function saveProviderApiKey(provider: keyof AIProviderSettings['apiKeys'], apiKey: string): Promise<void> {
  await saveAIKey(provider, apiKey);
}

export async function getAIProviderSettings(): Promise<AIProviderSettings> {
const chatProvider = await getChatProvider();

return {
  chatProvider,
  apiKeys: {
    openai: await resolveApiKey('openai') ?? undefined,
    groq: await resolveApiKey('groq') ?? undefined,
    gemini: await resolveApiKey('gemini') ?? undefined,
  },
};
}

async function resolveApiKey(provider: ChatProvider | 'openai'): Promise<string | null> {
  const savedKeys = await getSavedApiKeys();
  const savedKey = provider === 'groq'
    ? savedKeys.groq
    : provider === 'gemini'
      ? savedKeys.gemini
      : savedKeys.openai;
  const envKey = (await getEnvironmentApiKey(provider))?.trim() ?? null;
  // Prefer a non-empty saved key; fall back to trimmed environment key
  const resolved = (typeof savedKey === 'string' && savedKey.trim().length > 0)
    ? savedKey.trim()
    : (envKey && envKey.length > 0 ? envKey : null);
  return resolved;
}

function assertApiKey(provider: ChatProvider, key: string | null): string {
  if (!key) {
    const providerLabel = provider === 'groq'
      ? 'Groq'
      : provider === 'gemini'
        ? 'Gemini'
        : 'OpenAI';
    throw new Error(`Missing ${providerLabel} API key. Add your ${providerLabel} API key to settings or set the corresponding environment variable.`);
  }
  return key;
}


async function analyzeImageWithGemini(apiKey: string, instruction: string, imageData: { mimeType: string; data: string }): Promise<string> {
  // Use configured GEMINI_MODEL_NAME; accept either short name or full model path.
  const modelPath = GEMINI_MODEL_NAME.includes('/') ? GEMINI_MODEL_NAME : `models/${GEMINI_MODEL_NAME}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: instruction },
            {
              inlineData: {
                mimeType: imageData.mimeType,
                data: imageData.data.replace(/^data:[^;]+;base64,/, ''),
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error (${response.status}): ${await readErrorMessage(response)}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';
}

export async function routeAIRequest(request: AIRequest): Promise<string> {
  if (request.type === 'chat') {
    const chatProvider = await getChatProvider();
    const apiKey = assertApiKey(chatProvider, await resolveApiKey(chatProvider));
    const messages = request.messages ?? [];
    const preparedMessages = prepareConversation(messages);
    const shouldReturnBullets = !messages.some((message) => message.role === 'system')
      && KEY_POINTS_PATTERN.test(getLatestUserInstruction(messages));
    const response = chatProvider === 'groq'
      ? await generateGroqResponse(apiKey, preparedMessages)
        : chatProvider === 'gemini'
          ? await generateGeminiResponse(apiKey, preparedMessages)
          : await generateOpenAIResponse(apiKey, preparedMessages);
      return shouldReturnBullets ? ensureBulletList(response) : response.trim();
  }

  if (request.type === 'generate-image') {
    throw new Error('Image generation is not supported in this version of InsightIQ.');
  }

  if (request.type === 'analyze-image') {
    const apiKey = assertApiKey('gemini', await resolveApiKey('gemini'));
    const prompt = request.instruction?.trim() || 'Describe this image.';
    if (!request.imageData) throw new Error('No image attached for analysis.');
    return await analyzeImageWithGemini(apiKey, prompt, request.imageData);
  }

  if (request.type === 'analyze-page') {
    const apiKey = assertApiKey('gemini', await resolveApiKey('gemini'));
    const messages = request.messages ?? [];
    const preparedMessages = prepareConversation(messages);
    const response = await generateGeminiResponse(apiKey, preparedMessages);
    return response.trim();
  }

  throw new Error('Unsupported AI request type');
}

function getLatestUserInstruction(messages: ChatMessage[]): string {
  return [...messages].reverse().find((message) => message.role === 'user')?.content || '';
}

function limitMessageContent(content: string): string {
  if (content.length <= MAX_CHAT_MESSAGE_CHARACTERS) return content;
  return `${content.slice(0, MAX_CHAT_MESSAGE_CHARACTERS)}\n\n[Earlier message truncated to keep the conversation responsive.]`;
}

function prepareConversation(messages: ChatMessage[]): ChatMessage[] {
  const systemMessages = messages.filter((message) => message.role === 'system').slice(-1);
  const recentMessages = messages
    .filter((message) => message.role !== 'system')
    .slice(-MAX_RECENT_CHAT_MESSAGES)
    .map((message) => ({ ...message, content: limitMessageContent(message.content) }));

  return systemMessages.length > 0
    ? [...systemMessages, ...recentMessages]
    : [{
      role: 'system',
      content: `${GENERAL_ASSISTANT_SYSTEM_PROMPT}${programmingResponseInstructions(getLatestUserInstruction(messages)) ? `\n\n${programmingResponseInstructions(getLatestUserInstruction(messages))}` : ''}`,
    }, ...recentMessages];
}

export async function generateResponse(messages: ChatMessage[]): Promise<string> {
  return routeAIRequest({ type: 'chat', messages });
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

function parseBrowserActions(value: unknown): BrowserAgentAction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((action): BrowserAgentAction[] => {
    if (!action || typeof action !== 'object' || !('type' in action) || typeof action.type !== 'string') return [];
    const description = 'description' in action && typeof action.description === 'string' ? action.description : undefined;
    if (action.type === 'click' && 'targetId' in action && typeof action.targetId === 'string') {
      return [{ type: 'click', targetId: action.targetId, description }];
    }
    if (action.type === 'type' && 'targetId' in action && typeof action.targetId === 'string' && 'text' in action && typeof action.text === 'string') {
      return [{ type: 'type', targetId: action.targetId, text: action.text, description }];
    }
    if (action.type === 'scroll' && 'direction' in action && (action.direction === 'up' || action.direction === 'down')) {
      const amount = 'amount' in action && typeof action.amount === 'number' ? action.amount : undefined;
      return [{ type: 'scroll', direction: action.direction, amount, description }];
    }
    return [];
  });
}

function ensureBulletList(reply: string): string {
  const lines = reply
    .replace(/^\s*(?:#{1,6}\s+)?(?:key\s*(?:points?|takeaways?)|highlights?|important\s*facts?)\s*:?\s*$/gim, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const explicitItems = lines
    .map((line) => line.match(/^(?:[-*+â€¢]|\d+[.)])\s+(.+)$/u)?.[1]?.trim())
    .filter((item): item is string => Boolean(item));

  if (explicitItems.length > 0) {
    return explicitItems.slice(0, 10).map((item) => `- ${item}`).join('\n');
  }

  const sentences = lines
    .join(' ')
    .replace(/^\s*(?:key\s*(?:points?|takeaways?)|highlights?|important\s*facts?)\s*:\s*/i, '')
    .split(/(?<=[.!?])\s+|\s*;\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 8);
  return sentences.length ? sentences.map((sentence) => `- ${sentence}`).join('\n') : '- No key points found.';
}

export async function generateBrowserAgentResponse(page: BrowserPage, instruction: string): Promise<BrowserAgentResponse> {
  const pageText = page.text.length > MAX_BROWSER_PAGE_CHARACTERS
    ? `${page.text.slice(0, MAX_BROWSER_PAGE_CHARACTERS)}\n\n[The remaining webpage text was omitted to keep the response fast.]`
    : page.text;
  const controls = page.controls.slice(0, 40);
  const response = await routeAIRequest({
    type: 'analyze-page',
    messages: [
      {
        role: 'system',
        content: `You are InsightIQ, a precise webpage assistant. Answer in the same language as the user's instruction and supplied webpage. Do not summarize the webpage unless the instruction asks about it. For programming questions, the reply value must include directly usable code in a fenced Markdown code block with a language tag; never turn source code into prose. ${programmingResponseInstructions(instruction)} If the user asks for key points, extract, highlights, facts, or a bullet list, the reply value must contain only concise lines that each start with "- "; never use paragraphs or headings. If actions are needed, propose only click, type, or scroll actions using IDs from the supplied controls. Never invent an ID. Do not claim an action has happened: actions require separate user approval. Reply with valid JSON only using this shape: {"reply":"answer text","actions":[{"type":"click","targetId":"insightiq-control-0","description":"what will happen"}]}. For read-only questions use an empty actions array. Never request or type passwords, one-time codes, payment details, or other secrets.`,
      },
      {
        role: 'user',
        content: `User instruction: ${instruction}\n\nWebpage title: ${page.title}\nWebpage URL: ${page.url}\nWebpage description: ${page.description}\n\nPage text:\n${pageText}\n\nAvailable interactive controls:\n${JSON.stringify(controls)}`,
      },
    ],
  });

  const requiresBullets = KEY_POINTS_PATTERN.test(instruction);
  try {
    const parsed = JSON.parse(extractJson(response)) as { reply?: unknown; actions?: unknown };
    const reply = typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply : response;
    return {
      reply: requiresBullets ? ensureBulletList(reply) : reply,
      actions: parseBrowserActions(parsed.actions),
    };
  } catch {
    return { reply: requiresBullets ? ensureBulletList(response) : response, actions: [] };
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const body = await response.text();
  if (!body) return response.statusText || 'The API returned an empty error response.';

  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    if (typeof parsed.error === 'string') return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
    if (parsed.message) return parsed.message;
  } catch {
    // The raw response below is the exact error when it is not JSON.
  }

  return body;
}

function chatMessages(messages: ChatMessage[]) {
  return messages.map((message) => ({
    role: message.role === 'user' || message.role === 'system' ? message.role : 'assistant',
    content: message.content,
  }));
}


async function generateGeminiResponse(apiKey: string, messages: ChatMessage[]): Promise<string> {
  const modelPath = GEMINI_MODEL_NAME.includes('/') ? GEMINI_MODEL_NAME : `models/${GEMINI_MODEL_NAME}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: messages.map((message) => ({
        role: message.role === 'user' ? 'user' : 'model',
        parts: [{ text: message.content }],
      })),
      generationConfig: { temperature: RESPONSE_TEMPERATURE, maxOutputTokens: MAX_RESPONSE_TOKENS },
    }),
  });

  if (!response.ok) throw new Error(`Gemini API error (${response.status}): ${await readErrorMessage(response)}`);
  const data = await response.json();
  return data.candidates[0]?.content?.parts[0]?.text || 'No response generated';
}

async function generateOpenAIResponse(apiKey: string, messages: ChatMessage[]): Promise<string> {
  const url = 'https://api.openai.com/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: chatMessages(messages),
      temperature: RESPONSE_TEMPERATURE,
      max_tokens: MAX_RESPONSE_TOKENS,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI API error (${response.status}): ${await readErrorMessage(response)}`);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI API returned no message content.');
  return content;
}

async function generateGroqResponse(apiKey: string, messages: ChatMessage[]): Promise<string> {
  console.log(`[InsightIQ] Sending Groq request to ${GROQ_CHAT_COMPLETIONS_URL} with model ${GROQ_MODEL}`);

  try {
    const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages: chatMessages(messages), temperature: RESPONSE_TEMPERATURE, max_tokens: MAX_RESPONSE_TOKENS }),
    });

    console.log(`[InsightIQ] Groq response: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      throw new Error(`Groq API error (${response.status}): ${await readErrorMessage(response)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Groq API returned no message content.');
    return content;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `Groq network error: ${error.message}. Check your internet connection and that Chrome has host permission for api.groq.com.`,
        { cause: error },
      );
    }
    throw error;
  }
}

export async function analyzePageContent(pageText: string, question: string): Promise<string> {
  return generateResponse([
    { role: 'system', content: 'You are InsightIQ, a helpful AI assistant that analyzes webpages and provides insights.' },
    { role: 'user', content: `Here is the webpage content:\n\n${pageText}\n\nQuestion: ${question}` },
  ]);
}






