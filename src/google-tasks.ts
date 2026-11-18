const BASE = "https://tasks.googleapis.com/tasks/v1";

export type GTask = {
  id: string;
  title?: string;
  notes?: string;
  status?: "needsAction" | "completed";
  due?: string;
  completed?: string;
  parent?: string;
  position?: string;
  updated?: string;
  webViewLink?: string;
};

export type GTaskList = { id: string; title: string; updated?: string };

export class GoogleTasks {
  constructor(private readonly token: string) {}

  private async call<T>(method: string, path: string, opts: { query?: Record<string, string | undefined>; body?: unknown } = {}): Promise<T> {
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!res.ok) throw new Error(`Google Tasks API ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as T;
  }

  async listTaskLists(): Promise<GTaskList[]> {
    const r = await this.call<{ items?: GTaskList[] }>("GET", "/users/@me/lists", { query: { maxResults: "100" } });
    return r.items ?? [];
  }

  createTaskList(title: string) {
    return this.call<GTaskList>("POST", "/users/@me/lists", { body: { title } });
  }

  async listTasks(list: string, o: { showCompleted?: boolean; dueMin?: string; dueMax?: string }): Promise<GTask[]> {
    const items: GTask[] = [];
    let pageToken: string | undefined;
    do {
      const r = await this.call<{ items?: GTask[]; nextPageToken?: string }>("GET", `/lists/${encodeURIComponent(list)}/tasks`, {
        query: {
          maxResults: "100",
          showCompleted: String(o.showCompleted ?? false),
          showHidden: String(o.showCompleted ?? false),
          dueMin: o.dueMin,
          dueMax: o.dueMax,
          pageToken,
        },
      });
      items.push(...(r.items ?? []));
      pageToken = r.nextPageToken;
    } while (pageToken && items.length < 500);
    return items;
  }

  createTask(list: string, task: Partial<GTask>, parent?: string) {
    return this.call<GTask>("POST", `/lists/${encodeURIComponent(list)}/tasks`, { query: { parent }, body: task });
  }

  updateTask(list: string, id: string, patch: Partial<GTask>) {
    return this.call<GTask>("PATCH", `/lists/${encodeURIComponent(list)}/tasks/${encodeURIComponent(id)}`, { body: patch });
  }

  deleteTask(list: string, id: string) {
    return this.call<void>("DELETE", `/lists/${encodeURIComponent(list)}/tasks/${encodeURIComponent(id)}`);
  }
}
