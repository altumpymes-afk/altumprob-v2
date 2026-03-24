# AltumProb

Plataforma de inteligencia probabilística para trading. Análisis de mercado en tiempo real, correlaciones de portafolio, métricas avanzadas y gestión de watchlists con planes de suscripción.

## Stack tecnológico

- **Frontend:** HTML/CSS/JS (SPA) + Chart.js
- **Backend:** Node.js - Vercel Serverless Functions
- **Base de datos:** Supabase (PostgreSQL)
- **Pagos:** Stripe (suscripciones recurrentes)
- **Datos de mercado:** Yahoo Finance API

## Funcionalidades principales

- Cotizaciones en tiempo real con cache inteligente
- Analisis historico con Sharpe ratio, max drawdown, volatilidad, VaR
- Correlacion de portafolio con calculo de beta vs SPY
- Watchlist personalizable por usuario
- Alertas de precio
- 3 planes de suscripcion: Free, Pro y Institutional
- Modo fallback: funciona con localStorage si Supabase no esta configurado

## Deploy en Vercel

Variables de entorno requeridas: SUPABASE_URL, SUPABASE_SERVICE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO, STRIPE_PRICE_INST

## Licencia

Privado - Todos los derechos reservados.
