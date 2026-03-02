import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDataProvider } from "./data/dataProvider.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

const app = express();
const port = Number(process.env.PORT || 3001);
const providerName = process.env.MELEE_DATA_PROVIDER || "real";
const provider = createDataProvider(providerName);

app.use(express.json());

app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.get("/api/health", (_, res) => {
  res.json({ status: "ok", provider: providerName });
});

app.get("/api/metadata", async (_, res) => {
  try {
    const metadata =
      typeof provider.getMetadata === "function" ? await provider.getMetadata() : null;
    res.json({ provider: providerName, metadata });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/characters", async (_, res) => {
  try {
    const characters = await provider.getCharacters();
    res.json({ provider: providerName, characters });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/animation/:characterId/:moveId", async (req, res) => {
  try {
    const { characterId, moveId } = req.params;
    const animation = await provider.getAnimation(characterId, moveId);

    if (!animation) {
      res.status(404).json({ error: "Character or move not found" });
      return;
    }

    res.json({ provider: providerName, animation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`Melee overlay server listening on http://localhost:${port}`);
});
