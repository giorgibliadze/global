export interface Tab { id?: number; url?: string }
export interface Sender { id?: string; tab?: Tab; documentId?: string }
type Listener = (message: unknown, sender: Sender, reply: (response: unknown) => void) => boolean | void
export interface ExtensionApi {
  runtime: {
    id: string
    sendMessage(message: unknown): Promise<unknown>
    onMessage: { addListener(listener: Listener): void }
  }
  tabs: {
    query(query: { active: boolean; currentWindow: boolean }): Promise<Tab[]>
    sendMessage(tabId: number, message: unknown): Promise<unknown>
    create(options: { url: string }): Promise<Tab>
    onRemoved?: { addListener(listener: (tabId: number) => void): void }
  }
  alarms?: {
    create(name: string, info: { delayInMinutes: number }): Promise<void> | void
    onAlarm: { addListener(listener: (alarm: { name: string }) => void): void }
  }
  storage: { session: {
    get(key: string | null): Promise<Record<string, unknown>>
    set(value: Record<string, unknown>): Promise<void>
    remove(key: string): Promise<void>
  } }
}
export function optionalExtensionApi(): ExtensionApi | undefined {
  return (globalThis as typeof globalThis & { chrome?: ExtensionApi }).chrome
}
export function extensionApi(): ExtensionApi {
  const api = optionalExtensionApi()
  if (!api?.runtime?.sendMessage) throw new Error('გაფართოება მიუწვდომელია. გადატვირთეთ გაფართოება და ვებსაიტი.')
  return api
}
export function operation(value: unknown): string | undefined {
  return value && typeof value === 'object' && 'type' in value && typeof value.type === 'string' ? value.type : undefined
}
export async function request<T>(message: unknown): Promise<T> {
  let result: { ok: boolean; value?: T; error?: string }
  try { result = await extensionApi().runtime.sendMessage(message) as typeof result }
  catch { throw new Error('გაფართოებასთან კავშირი ვერ მოხერხდა. გადატვირთეთ გაფართოება და ვებსაიტი.') }
  if (!result?.ok) throw new Error(result?.error ?? 'მოთხოვნის შესრულება ვერ მოხერხდა.')
  return result.value as T
}
