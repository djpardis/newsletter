-- The rate_limits table is superseded by the native Cloudflare Rate Limiting
-- binding (SUBSCRIBE_RATE_LIMITER). The table is left in place for backward
-- compatibility with deployments that have not yet added the binding and still
-- use the D1 fallback path.
--
-- Once all deployments have the binding configured you may drop it with:
--   DROP TABLE rate_limits;
SELECT 1;
