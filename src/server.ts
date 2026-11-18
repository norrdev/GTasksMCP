import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GoogleTasks, type GTask } from "./google-tasks.js";

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });

/** "2026-11-20" or full RFC 3339 -> RFC 3339 (Google Tasks only keeps the date part). */
const toDue = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00.000Z` : d);

const slim = (t: GTask) => ({
  id: t.id,
  title: t.title,
  notes: t.notes,
  status: t.status,
  due: t.due?.slice(0, 10),
  parent: t.parent,
});

const listId = z.string().default("@default").describe("Task list id; '@default' is the main list");

export function createServer(accessToken: string): McpServer {
  const api = new GoogleTasks(accessToken);
  const server = new McpServer({ name: "google-tasks-mcp", version: "0.1.0" });

  server.registerTool(
    "list_task_lists",
    { description: "List all Google Tasks lists.", annotations: { readOnlyHint: true } },
    async () => text(await api.listTaskLists()),
  );

  server.registerTool(
    "create_task_list",
    { description: "Create a new Google Tasks list.", inputSchema: { title: z.string().min(1) } },
    async ({ title }) => text(await api.createTaskList(title)),
  );

  server.registerTool(
    "list_tasks",
    {
      description: "List tasks in a list. Open tasks only unless show_completed is true. Dates are YYYY-MM-DD.",
      inputSchema: {
        list_id: listId,
        show_completed: z.boolean().default(false),
        due_from: z.string().optional(),
        due_to: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ list_id, show_completed, due_from, due_to }) => {
      const tasks = await api.listTasks(list_id, {
        showCompleted: show_completed,
        dueMin: due_from ? toDue(due_from) : undefined,
        dueMax: due_to ? toDue(due_to) : undefined,
      });
      return text(tasks.map(slim));
    },
  );

  server.registerTool(
    "create_task",
    {
      description: "Create a task (optionally a subtask via parent_id).",
      inputSchema: {
        title: z.string().min(1),
        notes: z.string().optional(),
        due: z.string().optional().describe("YYYY-MM-DD"),
        list_id: listId,
        parent_id: z.string().optional(),
      },
    },
    async ({ title, notes, due, list_id, parent_id }) =>
      text(slim(await api.createTask(list_id, { title, notes, due: due ? toDue(due) : undefined }, parent_id))),
  );

  server.registerTool(
    "update_task",
    {
      description: "Change title, notes, due date or status of a task. Pass due as an empty string to clear it.",
      inputSchema: {
        task_id: z.string(),
        list_id: listId,
        title: z.string().optional(),
        notes: z.string().optional(),
        due: z.string().optional(),
        status: z.enum(["needsAction", "completed"]).optional(),
      },
    },
    async ({ task_id, list_id, title, notes, due, status }) => {
      const patch: Record<string, unknown> = { title, notes, status };
      if (due !== undefined) patch.due = due === "" ? null : toDue(due);
      if (status === "needsAction") patch.completed = null;
      return text(slim(await api.updateTask(list_id, task_id, patch as Partial<GTask>)));
    },
  );

  server.registerTool(
    "complete_task",
    { description: "Mark a task as completed.", inputSchema: { task_id: z.string(), list_id: listId } },
    async ({ task_id, list_id }) => text(slim(await api.updateTask(list_id, task_id, { status: "completed" }))),
  );

  server.registerTool(
    "delete_task",
    {
      description: "Permanently delete a task.",
      inputSchema: { task_id: z.string(), list_id: listId },
      annotations: { destructiveHint: true },
    },
    async ({ task_id, list_id }) => {
      await api.deleteTask(list_id, task_id);
      return text("deleted");
    },
  );

  return server;
}
