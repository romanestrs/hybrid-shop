# Répartition de l'équipe (5 pôles – adaptable à 3-5 personnes)

| Pôle | Responsabilités | Fichiers | Livrables |
|------|-----------------|----------|-----------|
| **1. Backend SQL** | Schéma PostgreSQL, CRUD users/products/orders, transaction de checkout + rollback | `sql/`, `routes/auth.js`, `products.js`, `orders.js` | Schéma, captures SQL, preuve transaction |
| **2. Backend NoSQL + sync** | 4 collections, CRUD panier/avis/notifs/logs, synchro hybride après commit | `routes/cart.js`, `reviews.js`, `notifications.js`, `logs.js`, `utils.js` | Schémas documents, captures NoSQL |
| **3. Frontend** | Interface web, tous les CRUD accessibles via l'UI | `public/` | Captures UI |
| **4. Documentation & GitHub** | README, diagrammes, captures annotées, dépôt propre | `README.md`, `docs/` | Repo GitHub, diagrammes, dossier screenshots |
| **5. Vidéo & Slides** | Slides (10 max), script, enregistrement ≤ 12 min, lien dans README | `docs/VIDEO_SCRIPT.md`, `docs/SLIDES_OUTLINE.md` | Vidéo + slides |

## Planning (22 nov → 23 nov)
| Heure | Action |
|-------|--------|
| H0 – H1 | Tous : installer Node, PostgreSQL, MongoDB ; `npm install` ; `npm run db:init` ; lancer l'app |
| H1 – H3 | Pôles 1-3 : relire/tester leur partie, corriger ; Pôle 4 : créer le repo GitHub, premier push |
| H3 – H5 | Test complet de bout en bout (checklist ci-dessous) |
| H5 – H8 | Pôle 4 : captures d'écran (checklist) ; Pôle 5 : slides |
| H8 – H11 | Pôle 5 : répéter + enregistrer la vidéo (démo) ; Pôle 4 : README final + lien vidéo |
| H11 – H12 | Vérification finale, push, soumission (avant le 23 nov) |

## Test de bout en bout
1. Register → login → profil + avatar. 2. Admin : créer/modifier/supprimer produit avec image. 3. Panier : ajouter/modifier/supprimer/vider. 4. Avis : poster/modifier/liker/supprimer. 5. Checkout OK → stock ↓, commande, panier vidé, log, notification. 6. Checkout KO (stock) → rollback. 7. Commandes : statut, annulation ligne, suppression. 8. Notifications + logs CRUD.
