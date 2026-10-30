# Asistente Inteligente de Compras

Prototipo web para seguimiento de expedientes, facturas y consultas asistidas por inteligencia artificial mediante Google Gemini.

## Qué incluye
- Alta, edición y eliminación de registros.
- Campos de seguimiento: InfoGov, GDE, fecha de pase a Contabilidad, carátula, proveedor, factura, importe, fecha de factura, vencimiento y estado.
- Búsqueda, importación y exportación CSV.
- Controles automáticos de vencimientos, campos faltantes y posibles duplicados.
- Chat con IA y análisis asistido mediante Gemini.
- La clave de IA se mantiene en el servidor y no se expone al navegador.

## Requisitos
- Node.js 20 o superior.
- Una clave de Gemini API creada en Google AI Studio.
- Aprobación institucional antes de procesar información administrativa real.

## Instalación local
1. Descomprimí el ZIP.
2. Abrí una terminal dentro de la carpeta del proyecto.
3. Ejecutá `npm install`.
4. Copiá `.env.example` a `.env`.
5. Completá `GEMINI_API_KEY` en `.env` (nunca la subas a GitHub).
6. Ejecutá `npm start`.
7. Abrí `http://localhost:3000`.

## Publicación en GitHub y Render
GitHub almacena el código, pero GitHub Pages no puede ejecutar este servidor Node ni proteger una clave API. Para que funcione el chat con IA, desplegá el proyecto en un servicio que admita Node.js, como Render.

En Render, abrí tu servicio y entrá en **Environment**:
- Agregá `GEMINI_API_KEY` con la clave generada en Google AI Studio.
- Opcionalmente, agregá `GEMINI_MODEL` con `gemini-3.8-flash`.
- Eliminá la variable antigua `OPENAI_API_KEY`, porque esta versión ya no utiliza OpenAI.
- Guardá los cambios y esperá a que Render reinicie el servicio.

El comando de inicio es `npm start`. El comando de instalación puede ser `npm install`.

## Prueba de estado
Abrí `https://TU-SERVICIO.onrender.com/api/health`. La respuesta debe indicar `ok: true`, `provider: "Google Gemini"` y `aiConfigured: true`.

## Datos y seguridad
- Los registros de este prototipo se guardan en el almacenamiento local del navegador; no hay base de datos central ni sincronización entre usuarios.
- La aplicación envía a Gemini los registros cargados cuando se usa el chat o el análisis.
- El nivel gratuito de Gemini tiene límites de uso y Google indica que puede utilizar el contenido enviado para mejorar sus productos. No uses información administrativa real, confidencial o personal del DGI en el nivel gratuito. Para pruebas, utilizá datos ficticios o anonimizados.
- Los controles de fechas y campos se calculan localmente. La IA aporta una lectura complementaria y puede equivocarse; verificá siempre los resultados.
- No se conecta con InfoGov, GDE, Contabilidad ni Tesorería.
- No reemplaza la revisión humana ni constituye una decisión administrativa.

## Estructura
- `public/index.html`: interfaz web.
- `server.js`: servidor y conexión con Gemini.
- `package.json`: dependencias y comando de inicio.
- `.env.example`: variables de configuración de ejemplo.
- `.gitignore`: evita subir secretos y dependencias.
