const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();

// ==========================================
// CONFIGURACIÓN GENERAL
// ==========================================

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const API_KEY = process.env.GEMINI_API_KEY || "";

const REQUEST_TIMEOUT_MS = 65000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS = [2000, 5000];

// ==========================================
// INSTRUCCIONES DEL ASISTENTE
// ==========================================

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

// ==========================================
// CONEXIÓN CON GEMINI
// ==========================================

let aiClientPromise;

async function getAIClient() {
  if (!API_KEY) return null;

  if (!aiClientPromise) {
    aiClientPromise = import("@google/genai")
      .then(({ GoogleGenAI }) => {
        return new GoogleGenAI({
          apiKey: API_KEY,
          httpOptions: {
            timeout: REQUEST_TIMEOUT_MS,
            retryOptions: {
              attempts: 1
            }
          }
        });
      })
      .catch((error) => {
        aiClientPromise = null;
        throw error;
      });
  }

  return aiClientPromise;
}

// ==========================================
// IDENTIFICAR ERRORES REINTENTABLES
// ==========================================

function isRetryable(error) {
  const status = Number(error?.status || error?.code || 0);

  if ([408, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  const message = String(error?.message || "").toLowerCase();

  return /timeout|timed out|deadline_exceeded|temporarily unavailable|econnreset|econnrefused|socket hang up|fetch failed|network error|aborted/i.test(message);
}

// ==========================================
// ERRORES COMPRENSIBLES
// ==========================================

function publicError(error) {
  const status = Number(error?.status || error?.code || 0);

  if (status === 400) {
    return {
      status: 400,
      message: "Gemini rechazó la solicitud. Revisá el modelo y la configuración."
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

  if (status === 504 || status === 408) {
    return {
      status: 504,
      message: "Gemini demoró demasiado en responder. Intentá nuevamente."
    };
  }

  return {
    status: 502,
    message: "No se pudo obtener respuesta de Gemini. Intentá nuevamente."
  };
}

// ==========================================
// ESPERA ENTRE REINTENTOS
// ==========================================

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==========================================
// CONSULTA A GEMINI CON REINTENTOS
// ==========================================

async function consultarGemini(ai, prompt, esAnalisis) {
  let ultimoError;

  for (let intento = 1; intento <= MAX_ATTEMPTS; intento++) {
    const inicioIntento = Date.now();

    try {
      console.log(
        `Gemini: iniciando intento ${intento}/${MAX_ATTEMPTS}`
      );

      const respuesta = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          thinkingConfig: {
            thinkingLevel: "low"
          },
          maxOutputTokens: esAnalisis ? 2048 : 1024
        }
      });

      const duracion = Date.now() - inicioIntento;

      console.log(
        `Gemini: intento ${intento} completado en ${duracion} ms`
      );

      const answer = respuesta.text?.trim();

      if (!answer) {
        throw new Error("GEMINI_EMPTY_RESPONSE");
      }

      return answer;

    } catch (error) {
      ultimoError = error;

      const duracion = Date.now() - inicioIntento;

      console.error("Gemini: error en intento", {
        intento,
        maxIntentos: MAX_ATTEMPTS,
        status: error?.status || error?.code || "unknown",
        message: error?.message || "Unknown error",
        tiempo: duracion
      });

      if (
        !isRetryable(error) ||
        intento === MAX_ATTEMPTS
      ) {
        throw error;
      }

      const esperaMs = RETRY_DELAYS[intento - 1];

      console.log(
        `Gemini: reintentando en ${esperaMs} ms`
      );

      await esperar(esperaMs);
    }
  }

  throw ultimoError;
}

// ==========================================
// CONSULTA PRINCIPAL DEL ASISTENTE
// ==========================================

app.post("/api/assistant", async (req, res) => {
  const inicio = Date.now();

  try {
    if (!API_KEY) {
      return res.status(503).json({
        error: "La IA no está configurada. Falta GEMINI_API_KEY en Render."
      });
    }

    const {
      mode,
      question,
      records,
      checks
    } = req.body || {};

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

    const esAnalisis = mode === "analysis";

    const pregunta = String(question || "")
      .trim()
      .slice(0, 3000);

    // En el chat se limita el volumen enviado.
    // En análisis se conservan todos los registros.

    const registrosParaEnviar = esAnalisis
      ? records
      : records.slice(0, 100);

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

    const promptKB = (
      Buffer.byteLength(prompt, "utf8") / 1024
    ).toFixed(2);

    console.log("Iniciando consulta a Gemini:", {
      modo: esAnalisis ? "análisis" : "chat",
      cantidadRegistros: registrosParaEnviar.length,
      modelo: MODEL,
      promptKB
    });

    const ai = await getAIClient();

    if (!ai) {
      return res.status(503).json({
        error: "No se pudo inicializar la conexión con Gemini."
      });
    }

    console.log("Cliente Gemini inicializado.");

    const answer = await consultarGemini(
      ai,
      prompt,
      esAnalisis
    );

    console.log(
      `Gemini respondió en ${Date.now() - inicio} ms`
    );

    return res.json({ answer });

  } catch (error) {
    const mensaje = String(error?.message || "");

    console.error("Error en consulta Gemini:", {
      status: error?.status || error?.code || "unknown",
      message: mensaje || "Unknown error",
      tiempo: Date.now() - inicio
    });

    if (mensaje === "GEMINI_EMPTY_RESPONSE") {
      return res.status(502).json({
        error: "Gemini no devolvió una respuesta de texto. Intentá nuevamente."
      });
    }

    const safe = publicError(error);

    return res.status(safe.status).json({
      error: safe.message
    });
  }
});

// ==========================================
// COMPROBACIÓN DEL SERVIDOR
// ==========================================

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(API_KEY),
    provider: "Google Gemini",
    model: MODEL
  });
});

// ==========================================
// PRUEBA DE CONEXIÓN CON GEMINI
// ==========================================

app.get("/api/test-gemini", async (_req, res) => {
  const inicio = Date.now();

  try {
    if (!API_KEY) {
      return res.status(503).json({
        ok: false,
        error: "Falta configurar GEMINI_API_KEY en Render."
      });
    }

    const ai = await getAIClient();

    if (!ai) {
      return res.status(503).json({
        ok: false,
        error: "No se pudo inicializar Gemini."
      });
    }

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: "Respondé únicamente: OK",
      config: {
        thinkingConfig: {
          thinkingLevel: "low"
        },
        maxOutputTokens: 20
      }
    });

    return res.json({
      ok: true,
      respuesta: response.text,
      modelo: MODEL,
      tiempo: Date.now() - inicio
    });

  } catch (error) {
    console.error("TEST GEMINI:", {
      status: error?.status || error?.code || "unknown",
      message: error?.message || "Unknown error"
    });

    return res.status(502).json({
      ok: false,
      error: publicError(error).message,
      tiempo: Date.now() - inicio
    });
  }
});

// ==========================================
// INICIO DEL SERVIDOR
// ==========================================

app.listen(PORT, () => {
  console.log(
    `Asistente de Compras disponible en el puerto ${PORT}`
  );

  console.log(
    `Proveedor IA: Google Gemini | Modelo: ${MODEL} | Clave configurada: ${Boolean(API_KEY)}`
  );
});
