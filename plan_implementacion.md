# DealSense — Plan de implementación

## Diagnóstico actual

DealSense es un proyecto existente y avanzado de inteligencia de compras para India. El stack real detectado es:

- FastAPI/Uvicorn en Python.
- SQLite con WAL y migraciones automáticas actuales.
- Frontend Vanilla JS/ES Modules servido por FastAPI desde `frontend/`.
- Extractores y resolvers para Amazon, Flipkart, Croma y Reliance Digital.
- Workers de observación, alertas y descubrimiento.
- Extensión MV3, endpoints afiliados, SSR SEO, sitemaps y Docker.
- Suite actual verificada: **238 tests pasando**.

## Orden de trabajo recomendado

### Fase A — Verdad del dato

1. Normalizar el modelo de precio observado y sus componentes.
2. Añadir `observed_at`, `retrieved_at`, fuente, confianza y estado de frescura a todas las superficies.
3. Evitar que MRP, descuentos promocionales o precios no confirmados se presenten como ahorro real.
4. Añadir pruebas de contrato para las respuestas que consume el frontend.

### Fase B — Fiabilidad de ingestión

1. Medir cada merchant adapter y cada worker.
2. Clasificar errores: bloqueo, timeout, HTML cambiado, producto no disponible, variante ambigua y proveedor sin datos.
3. Aplicar backoff/circuit breaker por fuente.
4. Persistir job status y último error sin perder el último dato válido.
5. Versionar migraciones antes de agregar más tablas/índices.

### Fase C — Producto diferencial

1. Rediseñar la decisión principal alrededor del precio efectivo.
2. Explicar cada veredicto con evidencia histórica y timestamp.
3. Mostrar comparación Amazon/Flipkart/Croma/Reliance Digital con vendedor, stock y entrega.
4. Añadir estados vacíos honestos: sin historial, datos stale, variante no confirmada.
5. Validar los recorridos homepage → búsqueda → PDP → alerta → retailer.

### Fase D — Distribución

1. Corregir y verificar sitemap/SSR/canonical/JSON-LD.
2. Publicar páginas de categorías y productos con datos frescos y procedencia.
3. Validar extensión en Amazon.in y Flipkart con versiones reales de página.
4. Activar alertas multicanal con consentimiento y controles de baja.

### Fase E — Escala

1. Integrar proveedores autorizados de históricos detrás de adaptadores.
2. Añadir backfill reanudable e idempotente.
3. Separar carga de scraping, API, workers y analítica.
4. Evaluar Postgres/cola/almacenamiento histórico cuando el volumen y la concurrencia lo justifiquen.

## Criterios de aceptación

- Ningún precio mostrado como “actual” sin timestamp y estado de frescura.
- Ningún ahorro calculado sin declarar sus componentes y supuestos.
- Cada merchant puede fallar sin tumbar homepage ni contaminar otros merchants.
- Toda alerta tiene estado persistido, motivo, canal y trazabilidad.
- La suite y los smoke tests públicos permanecen verdes.
