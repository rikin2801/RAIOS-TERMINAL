# How to Deploy Updates to RAIOS

## Every time Claude makes changes, run this in Terminal:

```
cd "/Users/rikin/Documents/Rikin AI  Investment Terminal"
git add -A
git commit -m "Update"
git push origin main
```

## That's it! Vercel auto-deploys in 2-3 minutes.

Watch: vercel.com → raios-terminal → Deployments → wait for green "Ready"

---

## Live URL
https://raios-terminal-git-main-rikinaiterminal.vercel.app

## Local URL (when dev server is running)
http://localhost:3000
http://192.168.29.61:3000  ← open on any phone on same WiFi
