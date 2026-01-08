# Grooves

Grooves est une application web pour rechercher, collecter et partager des vinyles.
Elle s’appuie sur l’API Discogs pour les données musicales et sur Supabase pour l’authentification et le stockage.

👉 Démo: https://estebanmateos.github.io/grooves/

## Fonctionnalités

- Recherche de vinyles via Discogs
- Page détail d’un release
- Ajout à la collection ou à la wishlist
- Gestion de sa bibliothèque personnelle
- Profils publics partageables
- Recherche de profils publics
- Authentification via Supabase
- Frontend statique déployé sur GitHub Pages

## Stack technique

- Frontend: React + TypeScript + Vite
- Routing: React Router
- Backend: Supabase (Auth + Postgres)
- API musique: Discogs (via Cloudflare Worker proxy)
- Déploiement: GitHub Pages (GitHub Actions)