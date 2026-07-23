import "dotenv/config";
import express, { type Request, type Response } from "express";
import { Pool } from "pg";
import { createAiMindmapRouter } from "./aiMindmapRouter";

type MindmapNode = {
  id: string;
  title: string;
  body?: string;
  children: MindmapNode[];
  visual?: {
    x?: number;
    y?: number;
    color?: string;
  };
};

type MindmapDocument = {
  id: string;
  title: string;
  root: MindmapNode;
  createdAt: string;
  updatedAt: string;
};

const port = Number(process.env.API_PORT ?? 8787);
const databaseUrl = process.env.DATABASE_URL;
const app = express();

app.use(express.json({ limit: "5mb" }));
app.use(createAiMindmapRouter());

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    })
  : null;
let databaseInitError: string | null = null;

function isMindmapNode(value: unknown): value is MindmapNode {
  if (typeof value !== "object" || value === null) return false;
  const node = value as Partial<MindmapNode>;
  return (
    typeof node.id === "string" &&
    typeof node.title === "string" &&
    Array.isArray(node.children) &&
    node.children.every(isMindmapNode)
  );
}

function isMindmapDocument(value: unknown): value is MindmapDocument {
  if (typeof value !== "object" || value === null) return false;
  const document = value as Partial<MindmapDocument>;
  return (
    typeof document.id === "string" &&
    typeof document.title === "string" &&
    typeof document.createdAt === "string" &&
    typeof document.updatedAt === "string" &&
    isMindmapNode(document.root)
  );
}

function requireDatabase(response: Response): Pool | null {
  if (!pool) {
    response.status(503).json({
      error: "Neon storage is not configured. Set DATABASE_URL in .env and restart the API server.",
    });
    return null;
  }
  if (databaseInitError) {
    response.status(503).json({
      error: `Neon storage is not ready: ${databaseInitError}`,
    });
    return null;
  }
  return pool;
}

async function ensureSchema() {
  if (!pool) return;
  await pool.query(`
    create table if not exists mindmaps (
      id text primary key,
      title text not null,
      document jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
}

function readDocument(request: Request, response: Response): MindmapDocument | null {
  const document = (request.body as { document?: unknown }).document;
  if (!isMindmapDocument(document)) {
    response.status(400).json({ error: "Request body must include a valid mindmap document." });
    return null;
  }
  return document;
}

function getDocumentTitle(document: MindmapDocument): string {
  return document.title.trim() || document.root.title.trim() || "Untitled mindmap";
}

app.get("/api/health", async (_request, response) => {
  if (!pool) {
    response.json({ ok: true, neonConfigured: false });
    return;
  }
  if (databaseInitError) {
    response.status(503).json({ ok: false, neonConfigured: true, error: databaseInitError });
    return;
  }

  try {
    await pool.query("select 1");
    response.json({ ok: true, neonConfigured: true });
  } catch (error) {
    response.status(503).json({ ok: false, neonConfigured: true, error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/mindmaps", async (_request, response) => {
  const database = requireDatabase(response);
  if (!database) return;

  const result = await database.query(`
    select id, title, created_at as "createdAt", updated_at as "updatedAt"
    from mindmaps
    order by updated_at desc
  `);
  response.json({ mindmaps: result.rows });
});

app.get("/api/mindmaps/:id", async (request, response) => {
  const database = requireDatabase(response);
  if (!database) return;

  const result = await database.query("select document from mindmaps where id = $1", [request.params.id]);
  const row = result.rows[0] as { document?: MindmapDocument } | undefined;
  if (!row) {
    response.status(404).json({ error: "Mindmap not found." });
    return;
  }
  response.json({ document: row.document });
});

app.post("/api/mindmaps", async (request, response) => {
  const database = requireDatabase(response);
  const document = readDocument(request, response);
  if (!database || !document) return;

  await database.query(
    `
      insert into mindmaps (id, title, document, created_at, updated_at)
      values ($1, $2, $3::jsonb, now(), now())
      on conflict (id) do update
      set title = excluded.title,
          document = excluded.document,
          updated_at = now()
    `,
    [document.id, getDocumentTitle(document), JSON.stringify(document)],
  );

  response.json({ document });
});

app.put("/api/mindmaps/:id", async (request, response) => {
  const database = requireDatabase(response);
  const document = readDocument(request, response);
  if (!database || !document) return;

  await database.query(
    `
      update mindmaps
      set title = $2,
          document = $3::jsonb,
          updated_at = now()
      where id = $1
    `,
    [request.params.id, getDocumentTitle(document), JSON.stringify(document)],
  );

  response.json({ document });
});

app.delete("/api/mindmaps/:id", async (request, response) => {
  const database = requireDatabase(response);
  if (!database) return;

  await database.query("delete from mindmaps where id = $1", [request.params.id]);
  response.status(204).send();
});

ensureSchema()
  .catch((error) => {
    databaseInitError = error instanceof Error ? error.message : String(error);
    console.error("Failed to initialize Neon schema", databaseInitError);
  })
  .finally(() => {
    app.listen(port, "127.0.0.1", () => {
      console.log(`Mindmap API listening on http://127.0.0.1:${port}`);
    });
  });
