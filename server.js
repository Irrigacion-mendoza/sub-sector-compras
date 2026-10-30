const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const API_KEY = process.env.GEMINI_API_KEY || "";

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

let aiClientPromise;

async function getAIClient() {
  if (!API_KEY) return null;
  if (!aiClientPromise) {
    aiClientPromise = import("@google/genai").then(({ GoogleGenAI }) => {
      return new GoogleGenAI({ apiKey: API_KEY });
    }).catch((error) => {
      aiClientPromise = null;
      throw error;
    });
  }
  return aiClientPromise;
}

function publicError(error) {
  const status = Number(error?.status || error?.code || 0);
  if (status === 400) {
    return { status: 400, message: "Gemini rechazó la solicitud. Revisá que la clave y el modelo estén configurados correctamente." };
  }
  if (status === 401 || status === 403) {
    return { status, message: "Gemini no autorizó la clave. Verificá GEMINI_API_KEY en Render y que la clave esté activa." };
  }
  if (status === 404) {
    return { status: 404, message: "El modelo configurado no está disponible para esta API key. Revisá GEMINI_MODEL en Render." };
  }
  if (status === 429) {
    return { status: 429, message: "Se alcanzó el límite gratuito o de solicitudes de Gemini. Esperá a que se restablezca el límite o revisá la cuota de Google AI Studio." };
  }
  return { status: 502, message: "No se pudo obtener respuesta de Gemini. Revisá los registros del servidor en Render." };
}

app.post("/api/assistant", async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(503).json({
        error: "La IA todavía no está configurada. El administrador debe cargar GEMINI_API_KEY en las variables de entorno de Render."
      });
    }

    const { mode, question, records, checks } = req.body || {};
    if (!Array.isArray(records)) {
      return res.status(400).json({ error: "No se recibió una lista válida de registros." });
    }
    if (records.length > 2000) {
      return res.status(413).json({ error: "La consulta supera el límite de registros del prototipo." });
    }

    const task = mode === "analysis"
      ? `Realizá un análisis de seguimiento con estos controles automáticos y registros. Indicá hallazgos concretos, datos que los respaldan, aspectos que requieren revisión y acciones sugeridas no vinculantes. No repitas toda la base. Controles: ${JSON.stringify(checks || {})}`
      : `Respondé esta consulta sobre los registros: ${String(question || "").slice(0, 3000)}`;

    const prompt = `${SYSTEM}\n\nTAREA:\n${task}\n\nREGISTROS:\n${JSON.stringify(records)}`;
    const ai = await getAIClient();
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { temperature: 0.2, maxOutputTokens: 2048 }
    });

    const answer = response.text?.trim();
    if (!answer) {
      return res.status(502).json({ error: "Gemini no devolvió una respuesta de texto. Intentá nuevamente." });
    }
    return res.json({ answer });
  } catch (error) {
    // El detalle técnico queda en Render Logs. Nunca registrar ni devolver la clave API.
    console.error("Error Gemini:", {
      status: error?.status || error?.code || "unknown",
      message: error?.message || "Unknown error"
    });
    const safe = publicError(error);
    return res.status(safe.status).json({ error: safe.message });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(API_KEY),
    provider: "Google Gemini",
    model: MODEL
  });
});

app.listen(PORT, () => {
  console.log(`Asistente de Compras disponible en el puerto ${PORT}`);
  console.log(`Proveedor IA: Google Gemini | Modelo: ${MODEL} | Clave configurada: ${Boolean(API_KEY)}`);
});
