# Grooves

Grooves est une application web pour rechercher, collecter et partager des vinyles.
Elle s’appuie sur l’API Discogs pour les données musicales et sur Supabase pour l’authentification et le stockage.

👉 Application: https://grooves.letruel.com/

## Fonctionnalités

- Recherche de vinyles via Discogs
- Page détail d’un release
- Ajout à la collection ou à la wishlist
- Gestion de sa bibliothèque personnelle
- Profils publics partageables
- Recherche de profils publics
- Authentification via Supabase
- Frontend Docker auto-hébergé derrière Cloudflare Tunnel

## Stack technique

- Frontend: React + TypeScript + Vite
- Routing: React Router
- Backend: Supabase auto-hébergé (Auth + Postgres)
- API musique: Discogs via un proxy Docker local avec cache
- Déploiement: Docker + Cloudflare Tunnel
