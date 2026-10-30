const express = require("express");
const path = require("path");
const OpenAI = require("openai");
require("dotenv").config();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const SYSTEM = `Sos un asistente de apoyo para el seguimiento administrativo de expedientes de compras.
Trabajás exclusivamente con los datos estructurados recibidos en cada consulta.
No inventes expedientes, proveedores, facturas, importes, fechas ni estados.
Diferenciá hechos comprobables, inferencias y datos faltantes.
No confundas fecha de pase a Contabilidad con fecha de pago.
No concluyas que una factura fue pagada si el estado no dice Pagado.
Podés resumir, ordenar, detectar posibles faltantes y señalar inconsistencias para revisión.
No tomes decisiones administrativas ni reemplaces la revisión humana.
Respondé en español claro, profesional y conciso. Si los datos no alcanzan, decilo expresamente.
Tratà la información como confidencial; no pidas datos personales innecesarios.`;

app.post("/api/assistant", async (req, res) => {
  try {
    if (!client) return res.status(503).json({
      error: "La IA todavía no está configurada. El administrador debe cargar OPENAI_API_KEY en el archivo .env del servidor."
    });
    const { mode, question, records, checks } = req.body || {};
    if (!Array.isArray(records)) return res.status(400).json({ error: "No se recibió una lista válida de registros." });
    if (records.length > 2000) return res.status(413).json({ error: "La consulta supera el límite de registros del prototipo." });

    const task = mode === "analysis"
      ? `Realizá un análisis de seguimiento con estos controles automáticos y registros. Indicá hallazgos concretos, datos que los respaldan, aspectos que requieren revisión y acciones sugeridas no vinculantes. No repitas toda la base. Controles: ${JSON.stringify(checks || {})}`
      : `Respondé esta consulta sobre los registros: ${String(question || "").slice(0, 3000)}`;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      instructions: SYSTEM,
      input: `${task}\n\nREGISTROS:\n${JSON.stringify(records)}`
    });
    res.json({ answer: response.output_text || "No se obtuvo una respuesta de texto." });
  } catch (err) {
    console.error("Error IA:", err.message);
    res.status(500).json({ error: "No se pudo completar el análisis. Revisá la configuración del servidor." });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, aiConfigured: Boolean(client) }));
app.listen(PORT, () => console.log(`Asistente de Compras disponible en http://localhost:${PORT}`));
