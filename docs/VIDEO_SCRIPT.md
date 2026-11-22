# Script vidéo (~10 min, max 12 min) – à lire/adapter

| Temps | Section | Contenu |
|-------|---------|---------|
| 0:00 – 1:00 | Introduction | Présentation de l'équipe, du projet « Hybrid Shop ». |
| 1:00 – 2:00 | Problème & solution | Une boutique en ligne a des données de natures différentes : transactions critiques (commandes, stock) et données souples/volumineuses (paniers, avis, logs). Un seul type de BDD ne convient pas à tout. Solution : architecture hybride SQL + NoSQL, 100 % locale. |
| 2:00 – 4:00 | Concepts | **BDD** : stockage organisé de données. **SQL** : tables, clés primaires/étrangères, ACID, jointures. **NoSQL** (MongoDB) : documents JSON, schéma flexible, scalabilité. **Transaction** : tout réussit ou rien (atomicité) ; **rollback** ; **synchronisation hybride**. |
| 4:00 – 5:30 | Architecture & schémas | Montrer le diagramme d'architecture, l'ER (4 tables) et les 4 collections. Expliquer qui stocke quoi et pourquoi. |
| 5:30 – 8:30 | Démonstration | (1) inscription/login ; (2) catalogue + panier (Mongo) ; (3) avis ; (4) **checkout réussi** : montrer stock avant/après en SQL + log + notification + panier vidé ; (5) **checkout échoué** (stock insuffisant) : message d'erreur, stock inchangé = rollback ; (6) admin : produits (upload local), utilisateurs, logs. |
| 8:30 – 9:30 | Code clé | Montrer `orders.js` : BEGIN / FOR UPDATE / COMMIT / ROLLBACK + synchro Mongo. |
| 9:30 – 10:00 | Conclusion | Contraintes respectées (aucune API externe, BDD locales, images locales), limites (pas de transaction Mongo multi-doc, compensation), améliorations possibles. |
