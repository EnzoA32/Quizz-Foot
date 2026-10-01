# Extra Time

Jeu statique (`index.html`) + fonction Vercel (`api/verify.js`) + base de données Transfermarkt ouverte (`data/db.json`).

## Mise en place
1. **Clé IA gratuite** : console.groq.com (`GROQ_API_KEY`) et/ou aistudio.google.com (`GEMINI_API_KEY`).
2. **Dépôt GitHub** : mets-y tout le contenu de ce dossier (garde `api/`, `scripts/`, `.github/`, `data/`).
3. **Construire la base** : onglet Actions > "build-data" > Run workflow. Il télécharge le dataset
   (dcaribou/transfermarkt-datasets, licence CC0) et commit `data/db.json`. Regarde les logs : les colonnes
   réelles de chaque fichier y sont affichées. Si une colonne manque, il faut ajuster `scripts/build-data.py`.
   (Alternative locale : `python scripts/build-data.py`, puis commit de `data/db.json`.)
4. **Vercel** : Add New > Project > importe le dépôt > Framework "Other" > Deploy.
5. Settings > Environment Variables : ajoute `GROQ_API_KEY` (et/ou `GEMINI_API_KEY`) > Redeploy.

## Comment ça vérifie
Le jeu envoie la réponse à `/api/verify`. Le serveur cherche le joueur et les clubs dans `db.json`
(clubs, transferts, montants, postes, nationalités, buts/passes partiels), puis donne ces faits à l'IA
qui arbitre. Sans base ou sans clé, ça dégrade vers l'IA seule, puis vers la saisie manuelle.

## Limites connues
- Le dataset est figé à juillet 2026 : le mercato récent est absent (l'IA estime, corrige à la main).
- Buts/passes : apparitions suivies uniquement, donc partiels pour les carrières anciennes.
- Pas encore de Wikidata. Garde l'URL pour tes potes (quota IA).
