# Asistente Inteligente de Compras

Prototipo web para seguimiento de expedientes, facturas y consultas asistidas por inteligencia artificial.

## Qué incluye
- Alta, edición y eliminación de registros.
- Campos de seguimiento: InfoGov, GDE, fecha de pase a Contabilidad, carátula, proveedor, factura, importe, fecha de factura, vencimiento y estado.
- Búsqueda, importación y exportación CSV.
- Controles automáticos de vencimientos, campos faltantes y posibles duplicados.
- Chat con IA y análisis asistido mediante API.
- La clave de IA se mantiene en el servidor y no se expone al navegador.

## Requisitos
- Node.js 18 o superior.
- Una clave de API de OpenAI autorizada para el uso previsto.
- Aprobación institucional antes de procesar información administrativa real.

## Instalación local
1. Descomprimí el ZIP.
2. Abrí una terminal dentro de la carpeta del proyecto.
3. Ejecutá `npm install`.
4. Copiá `.env.example` a `.env`.
5. Completá `OPENAI_API_KEY` en `.env` (nunca la subas a GitHub).
6. Ejecutá `npm start`.
7. Abrí `http://localhost:3000`.

## Publicación en GitHub
Subí el contenido de esta carpeta al repositorio. **GitHub almacena el código, pero GitHub Pages no puede ejecutar este servidor Node ni proteger una clave API.** Para que funcione el chat con IA, desplegá el proyecto en un servicio que admita Node.js y configurá allí `OPENAI_API_KEY` como variable secreta. No publiques `.env`.

## Datos y seguridad
- Los registros de este prototipo se guardan en el almacenamiento local del navegador; no hay base de datos central ni sincronización entre usuarios.
- La aplicación envía al proveedor de IA los registros cargados cuando se usa el chat o el análisis. No cargues expedientes, datos personales, facturas reales ni información reservada sin autorización expresa del organismo y revisión de las condiciones aplicables.
- Para pruebas iniciales, utilizá datos ficticios o anonimizados.
- Los controles de fechas y campos se calculan localmente. La IA aporta una lectura complementaria y puede equivocarse; verificá siempre los resultados.
- No se conecta con InfoGov, GDE, Contabilidad ni Tesorería.

## Estructura
- `public/index.html`: interfaz web.
- `server.js`: servidor y conexión con la API de IA.
- `.env.example`: variables de configuración de ejemplo.
- `.gitignore`: evita subir secretos y dependencias.
