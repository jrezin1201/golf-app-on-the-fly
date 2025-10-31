# Golf Scorecard - Vercel Deployment

**Built with Jounce** - A reactive web framework

## What's Inside

This golf scorecard app lets you:
- Track scores for 2 players across 9 holes
- Use +/- buttons to adjust scores
- Navigate between holes
- See running totals that update live
- Switch between game modes (Stroke Play, Skins)

---

## Deploy to Vercel (3 Easy Steps)

### Step 1: Install Vercel CLI (if you don't have it)

```bash
npm install -g vercel
```

### Step 2: Deploy

```bash
cd vercel-deploy
vercel
```

Follow the prompts:
- **Set up and deploy?** → Yes
- **Which scope?** → Select your account
- **Link to existing project?** → No
- **Project name?** → `golf-scorecard` (or whatever you want)
- **Directory?** → `.` (current directory)
- **Build settings?** → No

That's it! Vercel will give you a URL like: `https://golf-scorecard-abc123.vercel.app`

### Step 3: Share the Link!

Send your friend the URL and they can use the golf scorecard instantly!

---

## What Got Deployed

```
vercel-deploy/
├── public/
│   ├── index.html       # Main page
│   ├── client.js        # App logic
│   ├── reactivity.js    # Reactive system
│   ├── styles.css       # Beautiful styling
│   └── app.wasm         # WebAssembly module
├── vercel.json          # Vercel config
├── package.json         # Project info
└── README.md            # This file
```

---

## How to Update the App

1. Make changes to the original `.jnc` file
2. Recompile:
   ```bash
   cargo run --release -- compile examples/apps/31-golf-scorecard/main.jnc
   ```
3. Copy new files:
   ```bash
   cp dist/index.html dist/styles.css dist/client.js dist/reactivity.js dist/app.wasm vercel-deploy/public/
   ```
4. Redeploy:
   ```bash
   cd vercel-deploy
   vercel --prod
   ```

---

## Alternative: Deploy via GitHub

1. Create a new GitHub repo
2. Push the `vercel-deploy` folder contents
3. Go to [vercel.com](https://vercel.com)
4. Click "Import Project"
5. Select your GitHub repo
6. Click "Deploy"

Done! Vercel will auto-deploy on every git push.

---

## Built with Jounce

This app was compiled from a single `.jnc` file using the Jounce compiler:

```jounce
component App() {
    let currentHole = signal(1);
    let p1h1 = signal(0);
    let p2h1 = signal(0);

    return <div class="golf-app">
        <h1>Golf Scorecard</h1>
        {/* ... rest of the app ... */}
    </div>;
}
```

**One file** → Beautiful, reactive web app! 🎉

---

## Features

- ✅ Reactive signals (updates instantly)
- ✅ Event handlers (button clicks)
- ✅ Conditional rendering
- ✅ Navigation between holes
- ✅ Live score calculation
- ✅ Beautiful gradient design
- ✅ Mobile responsive

---

## Support

Questions? Check out the [Jounce documentation](https://github.com/your-repo/jounce)

Enjoy your round! ⛳
