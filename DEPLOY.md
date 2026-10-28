# Deploy PagePilot

## 1. Push to GitHub (PowerShell)

Extract `PagePilot.zip`, open PowerShell in the extracted `pagepilot` directory, then run:

```powershell
git init
git add .
git commit -m "Initial PagePilot implementation"
git branch -M main
```

Create an empty repository named `pagepilot` on GitHub, then connect it (replace the URL with your own repository URL):

```powershell
git remote add origin https://github.com/YOUR_USERNAME/pagepilot.git
git push -u origin main
```

## 2. Deploy on Vercel

1. Sign in to Vercel and choose **Add New → Project**.
2. Import your `pagepilot` GitHub repository.
3. Keep the project root at the repository root.
4. Use `npm run build` as the build command and `dist` as the output directory. The included `vercel.json` already specifies these values.
5. Deploy and wait for the build logs to finish.
6. Open `https://YOUR_DEPLOYMENT_DOMAIN/api/health`. It should return JSON with `"status": "ok"`.
7. Open the homepage and run a simulation, then compare all policies.

## 3. If deployment fails

- Check the Vercel build logs for the first error, not only the final failure message.
- Confirm the repository root contains `package.json`, `requirements.txt`, `vercel.json`, `api/index.py`, and `backend/main.py`.
- Confirm the Python Function installs `requirements.txt` and the frontend build completes.
- If `/api/health` returns a 404 or a FastAPI route error, inspect Vercel's current FastAPI routing guidance and function logs; do not assume a successful static build means the API is working.
