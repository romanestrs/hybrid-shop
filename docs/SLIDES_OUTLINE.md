# Plan des slides (10 maximum)

1. **Titre** – Hybrid Shop, équipe, date (24 nov).
2. **Problème** – données hétérogènes : transactionnelles vs flexibles ; risque d'incohérence (stock).
3. **Solution** – architecture hybride PostgreSQL + MongoDB, 100 % locale, sans API externe.
4. **Concepts** – BDD, SQL (ACID, clés, jointures), NoSQL (documents, flexibilité), tableau comparatif.
5. **Architecture système** – diagramme (docs/DIAGRAMS.md §1).
6. **Base SQL** – diagramme ER : users, products, orders, order_items + contraintes.
7. **Base NoSQL** – 4 collections et exemples de documents.
8. **Transactions & synchro hybride** – séquence checkout : BEGIN → stock → commande → items → COMMIT / ROLLBACK ; puis panier, log, notification.
9. **Démonstration** – captures : succès vs rollback (stock avant/après).
10. **Conclusion** – livrables, difficultés, améliorations, lien GitHub + vidéo.
