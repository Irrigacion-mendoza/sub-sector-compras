
const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const API_KEY = process.env.GEMINI_API_KEY || "";

// Tiempo máximo de espera de una consulta: 60 segundos.
const REQUEST_TIMEOUT_MS = 60000;

// Instrucciones generales del asistente.
const SYSTEM = `Sos un asistente de apoyo para el seguimiento administrativo de expedientes de compras.

Trabajás exclusivamente con los datos estructurados recibidos en cada consulta.

No inventes expedientes, proveedores, facturas, importes, fechas ni estados.

Diferenciá hechos comprobables, inferencias y datos faltantes.

No confundas fecha de pase a Contabilidad con fecha de pago.

No concluyas que una factura fue pagada si el estado no dice Pagado.

Podés resumir, ordenar, detectar posibles faltantes y señalar inconsistencias para revisión.

No tomes decisiones administrativas ni reemplaces la revisión humana.

Respondé en español claro, profesional y conciso.

Si los datos no alcanzan, decilo expresamente.

Tratà la información como confidencial; no pidas datos personales innecesarios.`;

// Conexión con Gemini.
let aiClientPromise;

async function getAIClient() {
  if (!API_KEY) return null;

  if (!aiClientPromise) {
    aiClientPromise = import("@google/genai")
      .then(({ GoogleGenAI }) => {
        return new GoogleGenAI({ apiKey: API_KEY });
      })
      .catch((error) => {
        aiClientPromise = null;
        throw error;
      });
  }

  return aiClientPromise;
}

// Mensajes de error comprensibles.
function publicError(error) {
  const status = Number(error?.status || error?.code || 0);

  if (status === 400) {
    return {
      status: 400,
      message: "Gemini rechazó la solicitud. Revisá la configuración."
    };
  }

  if (status === 401 || status === 403) {
    return {
      status,
      message: "Gemini no autorizó la clave. Verificá GEMINI_API_KEY en Render."
    };
  }

  if (status === 404) {
    return {
      status: 404,
      message: "El modelo configurado no está disponible. Revisá GEMINI_MODEL."
    };
  }

  if (status === 429) {
    return {
      status: 429,
      message: "Se alcanzó el límite de solicitudes de Gemini. Intentá nuevamente más tarde."
    };
  }

  return {
    status: 502,
    message: "No se pudo obtener respuesta de Gemini. Intentá nuevamente."
  };
}

// Endpoint principal del asistente.
app.post("/api/assistant", async (req, res) => {
  const inicio = Date.now();

  try {
    if (!API_KEY) {
      return res.status(503).json({
        error: "La IA todavía no está configurada. Falta GEMINI_API_KEY en Render."
      });
    }

    const { mode, question, records, checks } = req.body || {};

    if (!Array.isArray(records)) {
      return res.status(400).json({
        error: "No se recibió una lista válida de registros."
      });
    }

    if (records.length > 2000) {
      return res.status(413).json({
        error: "La consulta supera el límite de registros del prototipo."
      });
    }

    // Para preguntas generales, no enviamos registros innecesarios.
    const pregunta = String(question || "").trim().slice(0, 3000);

    const esAnalisis = mode === "analysis";

    const registrosParaEnviar = esAnalisis
      ? records
      : (records.length > 100 ? records.slice(0, 100) : records);

    const tarea = esAnalisis
      ? `Realizá un análisis de seguimiento con estos controles automáticos y registros.

Indicá:
- Hallazgos concretos.
- Datos que los respaldan.
- Aspectos que requieren revisión.
- Acciones sugeridas no vinculantes.

No repitas toda la base.

Controles: ${JSON.stringify(checks || {})}`
      : `Respondé esta consulta sobre los registros:

${pregunta || "Resumí brevemente la información disponible."}

Si la consulta es un saludo o una pregunta general que no requiere consultar expedientes, respondé brevemente sin inventar información.`;

    const registrosTexto = registrosParaEnviar.length
      ? JSON.stringify(registrosParaEnviar)
      : "No se recibieron registros.";

    const prompt = `${SYSTEM}

TAREA:
${tarea}

REGISTROS:
${registrosTexto}`;

    console.log("Iniciando consulta a Gemini:", {
      modo: esAnalisis ? "análisis" : "chat",
      cantidadRegistros: registrosParaEnviar.length
    });

    const ai = await getAIClient();

    if (!ai) {
      return res.status(503).json({
        error: "No se pudo inicializar la conexión con Gemini."
      });
    }

    // Limita el tiempo de espera para evitar consultas indefinidas.
    let timeoutId;

    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model: MODEL,
          contents: prompt,
          config: {
            thinkingConfig: {
              thinkingLevel: "low"
            },
            maxOutputTokens: esAnalisis ? 2048 : 1024
          }
        }),

        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error("REQUEST_TIMEOUT"));
          }, REQUEST_TIMEOUT_MS);
        })
      ]);

      clearTimeout(timeoutId);

      const answer = response.text?.trim();

      if (!answer) {
        return res.status(502).json({
          error: "Gemini no devolvió una respuesta de texto. Intentá nuevamente."
        });
      }

      console.log(`Gemini respondió en ${Date.now() - inicio} ms`);

      return res.json({ answer });

    } finally {
      clearTimeout(timeoutId);
    }

  } catch (error) {

    if (error.message === "REQUEST_TIMEOUT") {
      console.error("Tiempo de espera agotado:", Date.now() - inicio);

      return res.status(504).json({
        error: "La consulta está tardando demasiado. Intentá nuevamente con una pregunta más breve."
      });
    }

    console.error("Error Gemini:", {
      status: error?.status || error?.code || "unknown",
      message: error?.message || "Unknown error",
      tiempo: Date.now() - inicio
    });

    const safe = publicError(error);

    return res.status(safe.status).json({
      error: safe.message
    });
  }
});

// Comprobación del servidor.
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(API_KEY),
    provider: "Google Gemini",
    model: MODEL
  });
});

// Inicio del servidor.
app.listen(PORT, () => {
  console.log(`Asistente de Compras disponible en el puerto ${PORT}`);
  console.log(
    `Proveedor IA: Google Gemini | Modelo: ${MODEL} | Clave configurada: ${Boolean(API_KEY)}`
  );
});
