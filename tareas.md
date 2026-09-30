# DealSense — Backlog de evolución

## P0 — Confianza y datos

- [ ] Definir un contrato único de observación de precios: precio base, MRP, envío, cupón, descuento bancario, vendedor, stock, moneda, `observed_at`, `retrieved_at` y fuente.
- [ ] Separar explícitamente datos observados, datos calculados y datos promocionales para no presentar descuentos estimados como hechos.
- [ ] Añadir frescura visible en homepage, feed, PDP y alertas: última comprobación, antigüedad y estado stale.
- [ ] Crear pruebas contractuales para cada merchant y cada respuesta pública de `/api/*`.
- [ ] Convertir migraciones SQLite implícitas en migraciones versionadas antes de escalar workers.

## P0 — Fiabilidad operativa

- [ ] Instrumentar extractores y workers con métricas de éxito, bloqueo, latencia, reintentos y edad de datos.
- [ ] Sustituir fallos silenciosos por errores tipados, logs estructurados y estados visibles para el usuario.
- [ ] Definir límites de concurrencia, backoff, rate limiting y circuit breakers por merchant.
- [ ] Crear un smoke test de producción para homepage, deals, PDP, historial, alertas, sitemap y robots.

## P1 — Experiencia de producto

- [ ] Convertir la comparación en una decisión: mejor precio efectivo, mejor vendedor, mejor entrega, confianza y motivo del veredicto.
- [ ] Mostrar siempre “precio observado” frente a “precio efectivo estimado” y detallar los supuestos.
- [ ] Añadir estados explícitos para sin historial, historial insuficiente, precio stale y variante no confirmada.
- [ ] Mejorar búsqueda por nombre/ASIN/PID con resultados canónicos y deduplicación de variantes.
- [ ] Hacer que el flujo de alerta tenga confirmación, gestión de suscripciones y preferencia de canal.

## P1 — Diferenciación frente a competidores

- [ ] Posicionar DealSense en landed price indio: envío + cupón + tarjeta + vendedor + disponibilidad.
- [ ] Publicar una señal explicable de “deal real” basada en histórico, no solo en MRP.
- [ ] Añadir comparación multi-store con historial por retailer y explicación de por qué gana una oferta.
- [ ] Construir páginas SEO de producto/categoría con fecha de datos, cobertura, FAQ y enlaces de afiliación transparentes.
- [ ] Priorizar extensión y alertas solo después de garantizar exactitud y frescura.

## P2 — Monetización y escala

- [ ] Auditar cada ruta afiliada y registrar merchant/campaign/click attribution sin contaminar el valor mostrado.
- [ ] Añadir proveedores autorizados de histórico mediante adaptadores, preservando procedencia y licencias.
- [ ] Migrar a un almacén adecuado para mayor volumen cuando SQLite/WAL alcance el límite operacional.
- [ ] Definir panel interno de calidad de catálogo, cobertura y salud de workers.

